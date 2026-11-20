import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'

const source=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8')
const extract=name=>{
 const pattern=new RegExp('(async )?function '+name+'\\([^\\n]*\\)\\{[\\s\\S]*?\\n\\}')
 const match=source.match(pattern)
 assert.ok(match,'Missing Android function '+name)
 return match[0]
}
const candidate=(id,flag=false)=>({
 id,name:id,active:true,delivery_enabled:true,hoursConfigured:true,isOpen:true,
 latitude:-12.0506096,longitude:-77.1251313,radiusKm:5,
 deliveryPricingMode:'PER_KM',deliveryRatePerKmPen:2.5,
 consultOrderAvailability:flag,paymentMethods:{delivery:['yape']}
})
const baseState=()=>({
 mode:'delivery',profile:{address:'Av. Argentina 1653',district:'Callao'},
 configReady:true,quote:null,store:'',stage:'deliveryAddress'
})
const destination={latitude:-12.0506096,longitude:-77.1251313}
const mockResolver=({stores,flag,fail=false})=>{
 const events=[],st=baseState()
 const context={
  st,deliveryRequestPending:false,deliveryRequestError:'',
  deliveryAvailability:{status:'IDLE',storeName:'',candidateNames:[],message:''},
  deliveryLocation:destination,fulfillmentModal:null,checkoutPending:true,
  render:()=>{},save:()=>{},screen:x=>events.push(x),
  deliveryAddressKey:(a,b)=>a+'|'+b,
  hasDeliveryDestination:()=>true,
  fetchConfig:async()=>{events.push('GET')},
  eligibleDeliveryCandidates:()=>fail?(()=>{throw Error('SIN_COBERTURA')})():stores.map(store=>({store,km:0.4,mode:'PER_KM',amount:2.5})),
  storeAvailabilitySetting:store=>flag===undefined?store.consultOrderAvailability:flag,
  quoteForDeliveryCandidate:selected=>{events.push('QUOTE');return{
   storeId:selected.store.id,storeName:selected.store.name,deliveryFeePen:1.0,
   distanceSource:'STRAIGHT_LINE',straightDistanceKm:0.4,paymentMethods:['yape'],
   deliveryPricingMode:'PER_KM',quoteOrigin:'ANDROID_LOCAL'
  }}
 }
 vm.runInNewContext(extract('resolveDelivery'),context)
 return {context,st,events}
}

test('la variable se consulta por sede y ausente no equivale a false',()=>{
 const context={}
 vm.runInNewContext(extract('storeAvailabilitySetting'),context)
 assert.equal(context.storeAvailabilitySetting({consultOrderAvailability:true}),true)
 assert.equal(context.storeAvailabilitySetting({consultOrderAvailability:false}),false)
 assert.equal(context.storeAvailabilitySetting({consult_order_availability:true}),true)
 assert.equal(context.storeAvailabilitySetting({consult_order_availability:false}),false)
 assert.equal(context.storeAvailabilitySetting({}),null)
})
test('filtrar activos, abiertos, con delivery, coordenadas, tarifas y cobertura',()=>{
 const near=candidate('nearest')
 const far={...candidate('farther'),latitude:-12.0556096}
 const closed={...candidate('closed'),isOpen:false}
 const noDelivery={...candidate('no-delivery'),delivery_enabled:false}
 const outside={...candidate('out-of-range'),latitude:-12.1506,radiusKm:0.5}
 const invalidTariff={...candidate('no-tariff'),deliveryRatePerKmPen:null}
 const ctx={st:{configReady:true},shops:[]}
 vm.runInNewContext(extract('eligibleDeliveryCandidates'),ctx)
 const ranked=ctx.eligibleDeliveryCandidates(destination,[far,noDelivery,outside,invalidTariff,closed,near])
 assert.deepEqual(Array.from(ranked,x=>x.store.id),['nearest','farther'])
})
test('true deja pendiente TU VERSO, no crea precio y no salta al local false',async()=>{
 const {context,st,events}=mockResolver({stores:[candidate('Nogales',true),candidate('Tallanes',false)]})
 const result=await context.resolveDelivery()
 assert.equal(result,false)
 assert.equal(st.quote,null)
 assert.equal(st.store,'')
 assert.equal(context.deliveryAvailability.status,'APPROVAL_REQUIRED')
 assert.deepEqual(Array.from(context.deliveryAvailability.candidateNames),['Nogales','Tallanes'])
 assert.deepEqual(events,['availability','GET'])
})
test('false calcula la tarifa estimada solo para la primera sede elegible',async()=>{
 const {context,st,events}=mockResolver({stores:[candidate('Tallanes',false)]})
 assert.equal(await context.resolveDelivery(),true)
 assert.equal(st.store,'Tallanes')
 assert.equal(st.quote.deliveryFeePen,1)
 assert.equal(context.deliveryAvailability.status,'READY')
 assert.deepEqual(events,['availability','GET','QUOTE'])
 assert.equal(context.checkoutPending,true,'El checkout no avanza antes de pulsar continuar')
})
test('regla ausente bloquea checkout y no usa tarifa anterior',async()=>{
 const {context,st,events}=mockResolver({stores:[candidate('sin-config',null)]})
 st.store='stale';st.quote={deliveryFeePen:250}
 assert.equal(await context.resolveDelivery(),false)
 assert.equal(context.deliveryAvailability.status,'ERROR')
 assert.equal(st.store,'');assert.equal(st.quote,null)
 assert.deepEqual(events,['availability','GET'])
})
test('error de cobertura no se confunde con rechazo de sede y conserva la dirección',async()=>{
 const {context,st}=mockResolver({stores:[candidate('Nogales')],fail:true})
 assert.equal(await context.resolveDelivery(),false)
 assert.equal(context.deliveryAvailability.status,'ERROR')
 assert.match(context.deliveryAvailability.message,/SIN_COBERTURA/)
 assert.equal(st.profile.address,'Av. Argentina 1653')
})
test('cambiar carrito invalida toda cotización anterior solo en delivery',()=>{
 const st=baseState(),context={st,deliveryAvailability:{status:'READY'}}
 st.quote={deliveryFeePen:10};st.store='old'
 vm.runInNewContext(extract('clearDeliveryAvailability'),context)
 vm.runInNewContext(extract('invalidateDeliverySelection'),context)
 context.invalidateDeliverySelection()
 assert.equal(st.quote,null);assert.equal(st.store,'')
 assert.equal(context.deliveryAvailability.status,'IDLE')
 st.mode='pickup';st.store='pickup-id';st.quote={deliveryFeePen:0}
 context.invalidateDeliverySelection()
 assert.equal(st.store,'pickup-id')
})
test('fase 1 no guarda token TU VERSO ni envía una interacción desde Android',()=>{
 assert.match(source,/function availability\(\)/)
 assert.match(source,/APPROVAL_REQUIRED/)
 assert.match(source,/consultOrderAvailability/)
 assert.doesNotMatch(source,/fetch\([^\n]*\/api\/v1\/interactions/)
 assert.doesNotMatch(source,/Authorization:\s*['`]?Bearer/i)
 assert.match(source,/data-availability-continue/)
 assert.match(source,/data-availability-retry/)
})
