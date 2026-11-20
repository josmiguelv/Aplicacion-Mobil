import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'

const source=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8')
const extract=name=>{
 const pattern=new RegExp('(async )?function '+name+'\\([^\\n]*\\)\\{[\\s\\S]*?\\n\\}')
 const match=source.match(pattern)
 assert.ok(match,'Missing function '+name)
 return match[0]
}
const shopBase={active:true,delivery_enabled:true,hoursConfigured:true,isOpen:true,paymentMethods:{delivery:['yape','plin']}}
const nogales={...shopBase,id:'nogales',name:'Nogales',latitude:-12.0506096,longitude:-77.1251313,radiusKm:5,
 deliveryPricingMode:'PER_KM',deliveryRatePerKmPen:2.5,deliveryFeePen:null}
const tallanes={...shopBase,id:'tallanes',name:'Tallanes',latitude:-12.0506625,longitude:-77.1038664,radiusKm:4,
 deliveryPricingMode:'PER_KM',deliveryRatePerKmPen:3}
const universal={...shopBase,id:'universal',name:'Universal',latitude:-12.0482197,longitude:-77.1114342,radiusKm:10,
 deliveryPricingMode:'FIXED',deliveryFeePen:15,deliveryRatePerKmPen:null,paymentMethods:{delivery:[]}}
const destination=(latitude,longitude)=>({latitude,longitude})
const quote=(stores,dest,ready=true)=>{
 const context={shops:stores,st:{configReady:ready}}
 vm.runInNewContext(extract('calculateLocalDeliveryQuote'),context)
 return context.calculateLocalDeliveryQuote(dest,stores)
}

test('precio S/ 2.50 por kilómetro calculado en Android con Haversine',()=>{
 const result=quote([nogales],destination(-12.0406096,-77.1251313))
 assert.equal(result.storeId,'nogales')
 assert.equal(result.straightDistanceKm,1.11)
 assert.equal(result.deliveryFeePen,2.78)
 assert.equal(result.distanceSource,'STRAIGHT_LINE')
 assert.equal(result.quoteOrigin,'ANDROID_LOCAL')
 assert.equal(result.provisional,true)
})
test('tarifa fija Universal S/ 15 dentro de sus 10 km, sin multiplicar',()=>{
 const result=quote([universal],destination(-12.048,-77.111))
 assert.equal(result.storeId,'universal')
 assert.equal(result.deliveryPricingMode,'FIXED')
 assert.equal(result.deliveryFeePen,15)
 assert.ok(result.straightDistanceKm<10)
})
test('sin selector de sede: se asigna la más cercana dentro de la cobertura',()=>{
 const result=quote([universal,nogales],destination(nogales.latitude,nogales.longitude))
 assert.equal(result.storeId,'nogales')
 assert.doesNotMatch(source,/preferredDeliveryStoreId|deliveryStorePreferenceHtml|delivery-store-preference/)
})
test('cuando la sede más cercana cierra, se usa la siguiente elegible',()=>{
 const result=quote([{...nogales,isOpen:false},universal],destination(nogales.latitude,nogales.longitude))
 assert.equal(result.storeId,'universal')
 assert.equal(result.deliveryFeePen,15)
})
test('tienda fuera de radio, inactiva, sin tarifa o sin horarios no cotiza',()=>{
 const near=destination(nogales.latitude,nogales.longitude)
 for(const list of [
  [{...nogales,radiusKm:0.02}], // this fixture is exactly at the store, so test farther below
  [{...nogales,active:false}],
  [{...nogales,delivery_enabled:false}],
  [{...nogales,isOpen:false}],
  [{...nogales,hoursConfigured:false}],
  [{...nogales,deliveryRatePerKmPen:null}],
  [{...nogales,latitude:null}],
 ]) {
  const target=list[0].radiusKm===0.02?destination(nogales.latitude+0.01,nogales.longitude):near
  assert.throws(()=>quote(list,target),/No hay locales abiertos/)
 }
})
test('cobertura ilimitada solo cuando radiusKm es nulo',()=>{
 const result=quote([{...universal,radiusKm:null}],destination(-11.90,-77.111))
 assert.equal(result.deliveryFeePen,15)
 assert.ok(result.straightDistanceKm>10)
})
test('nunca se inventa coordenada, tarifa ni configuración publicada',()=>{
 assert.throws(()=>quote([nogales],destination(null,null)),/ubicación/)
 assert.throws(()=>quote([nogales],destination(nogales.latitude,nogales.longitude),false),/publicadas/)
 assert.throws(()=>quote([{...universal,deliveryFeePen:null}],destination(universal.latitude,universal.longitude)),/No hay locales abiertos/)
})
test('sin método de pago publicado el cliente no puede avanzar con pago ficticio',()=>{
 const context={st:{mode:'delivery',store:'universal',configReady:true,quote:{paymentMethods:[]}},shops:[universal]}
 vm.runInNewContext(extract('paymentOptions'),context)
 assert.equal(context.paymentOptions().length,0)
 context.st.quote.paymentMethods=['yape','plin']
 assert.deepEqual(Array.from(context.paymentOptions(),x=>x[0]),['yape','plin'])
})
test('deliveryQuoteValid exige una cotización local reciente y dirección consistente',()=>{
 const now=Date.now()
 const st={mode:'delivery',store:'nogales',profile:{address:'Calle 123',district:'Callao'},
  quote:{deliveryFeePen:2.78,quotedAt:now,destinationKey:'calle 123|callao',distanceSource:'STRAIGHT_LINE'}}
 const context={st,shops:[nogales],deliveryAddressKey:(a,d)=>a.toLowerCase()+'|'+d.toLowerCase()}
 vm.runInNewContext(extract('deliveryQuoteValid'),context)
 assert.equal(context.deliveryQuoteValid(),true)
 st.quote.quotedAt=now-20*60*1000
 assert.equal(context.deliveryQuoteValid(),false)
 st.quote.quotedAt=now;st.quote.deliveryFeePen=null
 assert.equal(context.deliveryQuoteValid(),false)
 st.quote.deliveryFeePen=2.78;st.profile.address='Otra calle'
 assert.equal(context.deliveryQuoteValid(),false)
})
test('confirmar dirección cotiza localmente después de un GET, sin consultar endpoint POST',async()=>{
 const st={mode:'delivery',profile:{address:'Av. Argentina 1653',district:'Callao'},
  configReady:true,store:'',quote:null,stage:'deliveryAddress'}
 const events=[]
 const context={
  st,deliveryRequestPending:false,deliveryRequestError:'',deliveryLocation:{latitude:nogales.latitude,longitude:nogales.longitude},
  checkoutPending:true,render:()=>{},save:()=>{},screen:x=>events.push(x),nav:x=>events.push(x),
  deliveryAddressKey:(a,d)=>a+'|'+d,hasDeliveryDestination:()=>true,
  fetchConfig:async ({strict})=>{assert.equal(strict,true);events.push('GET')},
  calculateLocalDeliveryQuote:()=>{events.push('LOCAL');return quote([nogales],destination(nogales.latitude,nogales.longitude))}
 }
 vm.runInNewContext(extract('resolveDelivery'),context)
 assert.equal(await context.resolveDelivery(),true)
 assert.deepEqual(events,['GET','LOCAL','identity'])
 assert.equal(st.quote.deliveryFeePen,0)
 assert.equal(st.store,'nogales')
 assert.equal(context.checkoutPending,false)
 assert.doesNotMatch(source,/\/api\/v1\/mobile\/fulfillment\/resolve/)
})
test('sin cobertura no se avanza y el error conserva la dirección',async()=>{
 const st={mode:'delivery',profile:{address:'Av. Argentina 1653',district:'Callao'},configReady:true,quote:null,store:'',stage:'deliveryAddress'}
 const context={
  st,deliveryRequestPending:false,deliveryRequestError:'',deliveryLocation:{latitude:-11.9,longitude:-77.12},
  checkoutPending:true,render:()=>{},save:()=>{},screen:()=>{throw Error('Unexpected navigation')},
  deliveryAddressKey:(a,d)=>a+'|'+d,hasDeliveryDestination:()=>true,fetchConfig:async()=>{},
  calculateLocalDeliveryQuote:()=>quote([nogales],destination(-11.9,-77.12))
 }
 vm.runInNewContext(extract('resolveDelivery'),context)
 assert.equal(await context.resolveDelivery(),false)
 assert.match(context.deliveryRequestError,/No hay locales abiertos/)
 assert.equal(context.checkoutPending,true)
 assert.equal(st.profile.address,'Av. Argentina 1653')
})
test('carrito, pago, resumen y confirmar revisan horarios con GET actualizado',async()=>{
 const calls=[]
 const st={mode:'delivery',store:'nogales',pay:'yape',cart:[{id:'p',qty:1}],profile:{},quote:{}}
 const context={
  st,checkoutRefreshPending:false,checkoutReviewNote:'',render:()=>{},
  checkoutSnapshot:()=>({store:st.store,total:2200,items:'p:1:20'}),
  fetchConfig:async({strict})=>{assert.equal(strict,true);calls.push('GET')},
  checkoutCartIssue:()=>'',hasDeliveryDestination:()=>true,
  resolveDelivery:async({silent,skipConfig})=>{assert.equal(silent,true);assert.equal(skipConfig,true);calls.push('LOCAL');return true},
  paymentOptions:()=>[['yape','Yape','']],screen:x=>calls.push(x),save:()=>{},
  finalizeDemoOrder:()=>calls.push('confirmado')
 }
 vm.runInNewContext(extract('revalidateCheckout'),context)
 for(const target of ['cart','payment','summary','confirm'])await context.revalidateCheckout(target)
 assert.deepEqual(calls,['GET','LOCAL','cart','GET','LOCAL','payment','GET','LOCAL','summary','GET','LOCAL','confirmado'])
})
test('si la configuración no se actualiza, anula tarifa anterior y bloquea el pago',async()=>{
 const st={mode:'delivery',store:'nogales',pay:'yape',profile:{},quote:{deliveryFeePen:10}}
 const calls=[]
 const context={
  st,checkoutRefreshPending:false,checkoutReviewNote:'',render:()=>{},
  checkoutSnapshot:()=>({store:'nogales',total:3000,items:'p:1:20'}),
  fetchConfig:async()=>{throw Error('No se pudo actualizar la disponibilidad de locales')},
  save:()=>calls.push('save'),screen:x=>calls.push(x)
 }
 vm.runInNewContext(extract('revalidateCheckout'),context)
 assert.equal(await context.revalidateCheckout('confirm'),false)
 assert.equal(st.quote,null)
 assert.equal(st.store,'')
 assert.deepEqual(calls,['save','deliveryAddress'])
 assert.match(context.checkoutReviewNote,/No se pudo actualizar/)
})
test('cuando cambia la sede o importe justo antes de confirmar exige revisar el total',async()=>{
 const st={mode:'delivery',store:'nogales',pay:'yape',cart:[{id:'p',qty:1}],profile:{},quote:{}}
 const calls=[]
 const context={
  st,checkoutRefreshPending:false,checkoutReviewNote:'',render:()=>{},
  checkoutSnapshot:()=>({store:st.store,total:2200,items:'p:1:20'}),
  fetchConfig:async()=>{calls.push('GET')},checkoutCartIssue:()=>'',hasDeliveryDestination:()=>true,
  resolveDelivery:async()=>{st.store='universal';calls.push('LOCAL');return true},
  paymentOptions:()=>[['yape','Yape','']],screen:x=>calls.push(x),save:()=>{},
  finalizeDemoOrder:()=>calls.push('confirmado')
 }
 vm.runInNewContext(extract('revalidateCheckout'),context)
 assert.equal(await context.revalidateCheckout('confirm'),false)
 assert.deepEqual(calls,['GET','LOCAL','summary'])
 assert.match(context.checkoutReviewNote,/Se actualizó la sede/)
})
test('la compra es demostración: sin cobros ni pedidos enviados al local',()=>{
 assert.match(source,/demo:true/)
 assert.match(source,/no se confirmarán pagos ni se enviarán pedidos/)
 assert.match(source,/revalidateCheckout\('summary'\)/)
 assert.match(source,/revalidateCheckout\('confirm'\)/)
 assert.match(source,/window\.b3DeliveryGpsAddress=/)
})
