import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'

const source=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8')
const extract=name=>{
 const expr=new RegExp('function '+name+'\\(\\)\\{[\\s\\S]*?\\n\\}')
 const match=source.match(expr)
 assert.ok(match,'Function '+name+' must exist')
 return match[0]
}
const quoteLogic=extract('deliveryQuoteValid')
const cartLogic=extract('checkoutCartIssue')
const totalLogic=source.match(/function orderTotal\(\)\{[^}]+\}/)?.[0]
assert.ok(totalLogic)

const store={id:'b3-local-1',active:true,delivery_enabled:true}
function functions(st,shops=[store],catalog=[]){
 const context={st,shops,product:id=>catalog.find(p=>p.id===id),subtotal:()=>20,deliveryAddressKey:()=> 'test-address'}
 vm.runInNewContext(quoteLogic,context)
 vm.runInNewContext(totalLogic,context)
 vm.runInNewContext(cartLogic,context)
 return context
}
test('delivery exige sede y tarifa verificable, no asume reparto gratuito',()=>{
 const st={mode:'delivery',store:'b3-local-1',quote:null,cart:[{id:'p',qty:1}],profile:{address:'Av. Test 123',district:'Callao'}}
 const ctx=functions(st)
 assert.equal(ctx.deliveryQuoteValid(),false)
 st.quote={deliveryFeePen:4,quotedAt:Date.now(),destinationKey:'test-address',distanceSource:'STRAIGHT_LINE'}
 assert.equal(ctx.deliveryQuoteValid(),true)
 assert.equal(ctx.orderTotal(),24)
 st.quote={deliveryFeePen:'texto'}
 assert.equal(ctx.deliveryQuoteValid(),false)
 st.quote={deliveryFeePen:-2}
 assert.equal(ctx.deliveryQuoteValid(),false)
 st.quote={deliveryFeePen:null}
 assert.equal(ctx.deliveryQuoteValid(),false)
 st.quote={}
 assert.equal(ctx.deliveryQuoteValid(),false)
})
test('recojo no requiere cotización de delivery y el total no suma reparto',()=>{
 const ctx=functions({mode:'pickup',store:'b3-local-1',quote:null,cart:[]})
 assert.equal(ctx.deliveryQuoteValid(),false)
 assert.equal(ctx.orderTotal(),20)
 assert.match(source,/if\(st\.mode==='pickup'&&!eligibleForPickup/)
})
test('pedido con producto retirado se detiene antes de confirmar',()=>{
 const st={mode:'pickup',store:'b3-local-1',quote:null,cart:[{id:'faltante',qty:1}]}
 assert.match(functions(st).checkoutCartIssue(),/no está disponible/)
 assert.equal(functions(st,[store],[{id:'faltante',disabled:false}]).checkoutCartIssue(),'')
})
test('la compra de prueba nunca se presenta como pedido enviado o cobrado',()=>{
 assert.match(source,/Recorrido de prueba: no se confirmarán pagos ni se enviarán pedidos/)
 assert.match(source,/demo:true/)
 assert.match(source,/Continuar con pedido de prueba/)
 assert.doesNotMatch(source,/if\(st\.configReady\)return toast\('Integración de pedidos/)
})

test('tocar producto abre ficha sin exigir dirección o tarifa antes de agregar al carrito',()=>{
 const start=source.indexOf("if(b.dataset.product||b.dataset.quick){")
 const end=source.indexOf("if(b.dataset.qty)",start)
 assert.ok(start>=0&&end>start)
 const handler=source.slice(start,end)
 assert.match(handler,/screen\('detail'\)/)
 assert.doesNotMatch(handler,/checkReady\(|deliveryQuoteValid\(|screen\('choice'\)/)
 assert.match(source,/function detail\(\)\{let p=product\(st\.selected\);/)
})
test('el checkout solicita modalidad y destino solo al continuar',()=>{
 const st={mode:'',store:'',quote:null,cart:[{id:'p',qty:1}],profile:{address:'',district:''}}
 const ctx=functions(st,[store],[{id:'p',disabled:false}])
 ctx.checkoutPending=false;ctx.hasDeliveryDestination=()=>false
 ctx.revalidateCheckout=step=>{ctx.current=step}
 ctx.screen=name=>{ctx.current=name}
 ctx.toast=()=>{throw Error('Unexpected validation')}
 vm.runInNewContext(extract('startCheckout'),ctx)
 ctx.startCheckout()
 assert.equal(ctx.checkoutPending,true)
 assert.equal(ctx.current,'choice')
 st.mode='delivery';ctx.startCheckout()
 assert.equal(ctx.current,'deliveryAddress')
 ctx.hasDeliveryDestination=()=>true;ctx.startCheckout()
 assert.equal(ctx.current,'identity')
 assert.equal(ctx.checkoutPending,false)
})
test('recojo entra al checkout mediante revalidación de disponibilidad',()=>{
 const st={mode:'pickup',store:store.id,quote:null,cart:[{id:'p',qty:1}]}
 const ctx=functions(st,[store],[{id:'p',disabled:false}])
 ctx.checkoutPending=true;ctx.revalidateCheckout=next=>{ctx.current=next}
 ctx.screen=()=>{throw Error('Must revalidate first')}
 ctx.toast=()=>{throw Error('Unexpected validation')}
 vm.runInNewContext(extract('startCheckout'),ctx)
 ctx.startCheckout()
 assert.equal(ctx.current,'identity')
 assert.equal(ctx.checkoutPending,false)
})
test('cotizar delivery conserva el avance al pago y permite reintentar si falla',()=>{
 assert.match(source,/if\(checkoutPending\)\{checkoutPending=false;screen\('identity'\);return true\}/)
 assert.match(source,/deliveryRequestError=/)
 assert.match(source,/deliveryRequestError=err\?\.name/)
 assert.match(source,/if\(checkoutPending\)\{void confirmStore\('pickup',selected\.id\);return\}/)
})

test('la dirección no se cotiza antes de que la configuración de sedes termine de cargar',async()=>{
 const match=source.match(/async function resolveDelivery\([\s\S]*?\n\}(?=\nfunction resolveStoreDistances)/)
 assert.ok(match)
 const st={mode:'delivery',profile:{address:'Av. Ejemplo 123',district:'Santa Anita'},configReady:false,store:'',quote:null,stage:'deliveryAddress'}
 const calls=[]
 const ctx={
  st,API_BASE:'https://example.invalid',APP_ID:'com.integrab2g.pollosb3',shops:[store],
  checkoutPending:true,deliveryRequestPending:false,deliveryRequestError:'',
  deliveryLocation:{latitude:-12.05,longitude:-77.12,source:'address'},hasDeliveryDestination:()=>true,deliveryAddressKey:()=> 'test-address',
  AbortController,setTimeout,clearTimeout,console:{warn:()=>{}},
  render:()=>{},save:()=>{},screen:name=>calls.push(name),nav:name=>calls.push(name),
  fetchConfig:async()=>{calls.push('config');st.configReady=true},
  fetch:async()=>{calls.push('quote');return {ok:true,status:200,json:async()=>({storeId:store.id,deliveryFeePen:4,distanceSource:'STRAIGHT_LINE',straightDistanceKm:1.2,deliveryPricingMode:'PER_KM'})}
  }
 }
 vm.runInNewContext(match[0],ctx)
 await ctx.resolveDelivery()
 assert.deepEqual(calls,['config','quote','identity'])
 assert.equal(st.quote.deliveryFeePen,4)
 assert.equal(ctx.checkoutPending,false)
 assert.equal(ctx.deliveryRequestPending,false)
})
test('un error 404 se muestra de forma persistente y permite reintentar sin perder la dirección',async()=>{
 const match=source.match(/async function resolveDelivery\([\s\S]*?\n\}(?=\nfunction resolveStoreDistances)/)
 assert.ok(match)
 const st={mode:'delivery',profile:{address:'Av. Ejemplo 123',district:'Santa Anita'},configReady:true,store:'',quote:null,stage:'deliveryAddress'}
 let requests=0
 const ctx={
  st,API_BASE:'https://example.invalid',APP_ID:'com.integrab2g.pollosb3',shops:[store],
  checkoutPending:true,deliveryRequestPending:false,deliveryRequestError:'',
  deliveryLocation:{latitude:-12.05,longitude:-77.12,source:'address'},hasDeliveryDestination:()=>true,deliveryAddressKey:()=> 'test-address',
  AbortController,setTimeout,clearTimeout,console:{warn:()=>{}},
  render:()=>{},save:()=>{},screen:()=>{throw Error('Unexpected navigation')},nav:()=>{throw Error('Unexpected navigation')},
  fetchConfig:async()=>{},
  fetch:async()=>{requests++;return {ok:false,status:404,json:async()=>({error:'Not found'})}}
 }
 vm.runInNewContext(match[0],ctx)
 await ctx.resolveDelivery()
 assert.match(ctx.deliveryRequestError,/HTTP 404/)
 assert.equal(ctx.deliveryRequestPending,false)
 assert.equal(st.profile.address,'Av. Ejemplo 123')
 await ctx.resolveDelivery()
 assert.equal(requests,2)
})

test('cotización por línea recta exige coordenadas explícitas y no reutiliza GPS de navegación',()=>{
 assert.match(source,/latitude:destination\.latitude,longitude:destination\.longitude/)
 assert.match(source,/deliveryLocation=\{\.\.\.position,key:deliveryAddressKey\(address,district\)\}/)
 assert.match(source,/distanceSource!=='STRAIGHT_LINE'/)
 assert.match(source,/deliveryGpsRequested=fulfillmentModal==='delivery'\|\|st\.stage==='deliveryAddress'/)
 assert.match(source,/function geocodeDeliveryDestination\(address,district\)/)
})
test('costo por kilómetro temporal se identifica como aproximado y no carretera',()=>{
 assert.match(source,/km aproximados en línea recta/)
 assert.match(source,/st\.quote\.deliveryPricingMode==='FIXED'/)
})

test('métodos de pago salen de la sede y modalidad publicadas',()=>{
 const start=source.indexOf('function paymentOptions(){')
 const end=source.indexOf('function productsFromApi(',start)
 assert.ok(start>=0&&end>start)
 const code=source.slice(start,end)
 assert.match(code,/st\.quote\?\.paymentMethods/)
 assert.match(code,/selected\?\.paymentMethods\?\.\[st\.mode\]/)
 assert.match(code,/choices\.filter\(x=>published\.includes\(x\[0\]\)\)/)
})

test('el local de delivery se asigna desde el servidor, sin preferencias manuales',()=>{
 assert.doesNotMatch(source,/preferredDeliveryStoreId|deliveryStorePreferenceHtml|delivery-store-preference/)
 assert.match(source,/mode:'delivery',address,district,latitude:destination.latitude,longitude:destination.longitude/)
})
test('Universal sin pagos publicados no permite continuar de forma ficticia',()=>{
 const match=source.match(/function paymentOptions\(\)\{[\s\S]*?\n\}/)
 assert.ok(match)
 const st={configReady:true,mode:'delivery',store:'7585340e-6d4d-4764-b127-b892dc50909d',
  quote:{paymentMethods:[]}}
 const ctx={st,shops:[{id:st.store,paymentMethods:{delivery:[]}}]}
 vm.runInNewContext(match[0],ctx)
 assert.equal(ctx.paymentOptions().length,0)
 st.quote={paymentMethods:['yape','plin','card']}
 assert.deepEqual(ctx.paymentOptions().map(x=>x[0]),['yape','plin','card'])
 assert.match(source,/no tiene métodos de pago publicados/)
 assert.match(source,/data-pay-next="1" \${missing\|\|checkoutRefreshPending\?'disabled':''}/)
})

test('al entrar al pago, mostrar resumen y confirmar, consultar API nuevamente siempre',async()=>{
 const match=source.match(/async function revalidateCheckout\(next\)\{[\s\S]*?\n\}(?=\nfunction startCheckout)/)
 assert.ok(match)
 const events=[]
 const st={mode:'delivery',store:'s1',quote:{},pay:'yape',cart:[{id:'p',qty:1}],profile:{}}
 const ctx={
  st,checkoutRefreshPending:false,checkoutReviewNote:'',render:()=>{},
  checkoutSnapshot:()=>({store:st.store,total:2200,items:'p:1:20'}),
  fetchConfig:async ({strict})=>{assert.equal(strict,true);events.push('GET')},
  checkoutCartIssue:()=>'',hasDeliveryDestination:()=>true,
  resolveDelivery:async ({silent,skipConfig})=>{assert.equal(silent,true);assert.equal(skipConfig,true);events.push('POST');return true},
  paymentOptions:()=>[['yape','Yape','']],screen:step=>events.push(step),save:()=>{},
  finalizeDemoOrder:()=>events.push('confirmado')
 }
 vm.runInNewContext(match[0],ctx)
 for(const step of ['payment','summary','confirm'])await ctx.revalidateCheckout(step)
 assert.deepEqual(events,['GET','POST','payment','GET','POST','summary','GET','POST','confirmado'])
})
test('si el costo o sede cambia durante confirmación, exige revisar el resumen',async()=>{
 const match=source.match(/async function revalidateCheckout\(next\)\{[\s\S]*?\n\}(?=\nfunction startCheckout)/)
 assert.ok(match)
 const events=[],st={mode:'delivery',store:'s1',quote:{},pay:'yape',cart:[{id:'p',qty:1}],profile:{}}
 const ctx={
  st,checkoutRefreshPending:false,checkoutReviewNote:'',render:()=>{},
  checkoutSnapshot:()=>({store:st.store,total:2200,items:'p:1:20'}),
  fetchConfig:async()=>{events.push('GET')},checkoutCartIssue:()=>'',hasDeliveryDestination:()=>true,
  resolveDelivery:async()=>{st.store='s2';events.push('POST');return true},
  paymentOptions:()=>[['yape','Yape','']],screen:step=>events.push(step),save:()=>{},
  finalizeDemoOrder:()=>events.push('confirmado')
 }
 vm.runInNewContext(match[0],ctx)
 await ctx.revalidateCheckout('confirm')
 assert.deepEqual(events,['GET','POST','summary'])
 assert.match(ctx.checkoutReviewNote,/Se actualizó la sede/)
 assert.equal(ctx.checkoutRefreshPending,false)
})
test('GPS autocompleta calle y distrito con respuesta nativa',()=>{
 assert.match(source,/window\.b3DeliveryGpsAddress=/)
 assert.match(source,/reverseGeocodeDeliveryLocation\(JSON\.stringify/)
 assert.match(source,/st\.profile\.address=String\(street\)\.trim\(\)/)
 assert.match(source,/Revisa la calle, el número y el distrito/)
})
