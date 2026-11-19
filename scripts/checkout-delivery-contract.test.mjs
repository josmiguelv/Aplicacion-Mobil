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
test('checkout solicita modalidad o dirección solo después de elegir continuar con el carrito',()=>{
 const st={mode:'',store:'',quote:null,cart:[{id:'p',qty:1}]}
 const ctx=functions(st,[store],[{id:'p',disabled:false}])
 ctx.checkoutPending=false
 ctx.eligibleForPickup=()=>true
 ctx.screen=name=>{ctx.current=name}
 ctx.toast=()=>{throw Error('Unexpected validation message')}
 vm.runInNewContext(extract('startCheckout'),ctx)
 ctx.startCheckout()
 assert.equal(ctx.checkoutPending,true)
 assert.equal(ctx.current,'choice')
 st.mode='delivery'
 ctx.startCheckout()
 assert.equal(ctx.current,'deliveryAddress')
 st.store=store.id;st.quote={deliveryFeePen:3,quotedAt:Date.now(),destinationKey:'test-address',distanceSource:'STRAIGHT_LINE'}
 ctx.startCheckout()
 assert.equal(ctx.current,'identity')
 assert.equal(ctx.checkoutPending,false)
})
test('recojo sin cotización avanza y seleccionar sede retoma el checkout',()=>{
 const st={mode:'pickup',store:store.id,quote:null,cart:[{id:'p',qty:1}]}
 const ctx=functions(st,[store],[{id:'p',disabled:false}])
 ctx.checkoutPending=true
 ctx.eligibleForPickup=()=>true
 ctx.screen=name=>{ctx.current=name}
 ctx.toast=()=>{throw Error('Unexpected validation')}
 vm.runInNewContext(extract('startCheckout'),ctx)
 ctx.startCheckout()
 assert.equal(ctx.current,'identity')
 assert.equal(ctx.checkoutPending,false)
 assert.match(source,/if\(checkoutPending\)\{checkoutPending=false;screen\('identity'\);return\}/)
})
test('cotizar delivery conserva el avance al pago y permite reintentar si falla',()=>{
 assert.match(source,/if\(checkoutPending\)\{checkoutPending=false;screen\('identity'\);return\}/)
 assert.match(source,/deliveryRequestError=/)
 assert.match(source,/No pudimos cotizar el delivery/)
 assert.match(source,/if\(checkoutPending\)\{void confirmStore\('pickup',selected\.id\);return\}/)
})

test('la dirección no se cotiza antes de que la configuración de sedes termine de cargar',async()=>{
 const match=source.match(/async function resolveDelivery\(\)\{[\s\S]*?\n\}(?=\nfunction resolveStoreDistances)/)
 assert.ok(match)
 const st={mode:'delivery',profile:{address:'Av. Ejemplo 123',district:'Santa Anita'},configReady:false,store:'',quote:null,stage:'deliveryAddress'}
 const calls=[]
 const ctx={
  st,API_BASE:'https://example.invalid',APP_ID:'com.integrab2g.pollosb3',shops:[store],
  checkoutPending:true,deliveryRequestPending:false,deliveryRequestError:'',
  deliveryLocation:{latitude:-12.05,longitude:-77.12,source:'address'},hasDeliveryDestination:()=>true,deliveryAddressKey:()=> 'test-address',
  AbortController,setTimeout,clearTimeout,
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
 const match=source.match(/async function resolveDelivery\(\)\{[\s\S]*?\n\}(?=\nfunction resolveStoreDistances)/)
 assert.ok(match)
 const st={mode:'delivery',profile:{address:'Av. Ejemplo 123',district:'Santa Anita'},configReady:true,store:'',quote:null,stage:'deliveryAddress'}
 let requests=0
 const ctx={
  st,API_BASE:'https://example.invalid',APP_ID:'com.integrab2g.pollosb3',shops:[store],
  checkoutPending:true,deliveryRequestPending:false,deliveryRequestError:'',
  deliveryLocation:{latitude:-12.05,longitude:-77.12,source:'address'},hasDeliveryDestination:()=>true,deliveryAddressKey:()=> 'test-address',
  AbortController,setTimeout,clearTimeout,
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

test('preferencia de Universal se envía al servidor para respetar S/ 15 fijos dentro de cobertura',()=>{
 assert.match(source,/let preferredDeliveryStoreId=''/)
 assert.match(source,/preferredDeliveryStoreId=String\(s\.id\)/)
 assert.match(source,/storeId:preferredDeliveryStoreId/)
 assert.match(source,/id="delivery-store-preference"/)
 assert.match(source,/Asignación automática según cobertura/)
 assert.match(source,/e\.target\.id==='delivery-store-preference'/)
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
 assert.match(source,/data-pay-next="1" \${missing\?'disabled':''}/)
})
