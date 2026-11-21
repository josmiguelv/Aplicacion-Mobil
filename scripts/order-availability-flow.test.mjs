import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'

const source=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8')
function extract(name){
 const match=source.match(new RegExp('(async )?function '+name+'\\([^\\n]*\\)\\{[\\s\\S]*?\\n\\}'))
 assert.ok(match,'Missing Android function: '+name)
 return match[0]
}
const storeA='f163f181-2c7e-40ec-87af-68f4675d059c'
const storeB='eeacc37f-7199-4b8f-bb1d-d1338e4f82f8'
const productId='a3639328-b908-4666-b91b-c25b5cc199ba'
const stores=[
 {id:storeA,name:'Sede de prueba A',active:true,delivery_enabled:true,consultOrderAvailability:true},
 {id:storeB,name:'Sede de prueba B',active:true,delivery_enabled:true,consultOrderAvailability:true}
]
const items=[{productId,quantity:1}]
function simulation({available=true,decisions=[],allStores=stores,wrongQuote=false}={}){
 const st={mode:'delivery',profile:{first:'Ana',last:'Quispe',phone:'912345678',
  address:'Av. Ejemplo 123',district:'Santa Anita',reference:'Puerta lateral'},
  store:'',quote:null,stage:'availability',pay:''}
 const events=[],rejects=new Map()
 let current=null
 const api={
  readInteraction:()=>current,
  rejectedStores:key=>rejects.get(key)||[],
  markRejectedStore:(key,id)=>{rejects.set(key,[...(rejects.get(key)||[]),id]);events.push('REJECT:'+id)},
  checkAgentAvailability:async({storeId})=>{events.push('CHECK:'+storeId);return {available}},
  prepareInteraction:input=>{
   events.push('PREPARE:'+input.storeId)
   current={body:{appId:input.appId,storeId:input.storeId,catalogRevision:input.catalogRevision,items:input.items,customer:input.customer},
    status:'PREPARED',fingerprint:JSON.stringify(input),idempotencyKey:'a1e616af-8c52-4776-b3b1-b446fc9b74a9'}
   return current
  },
  createInteraction:async()=>{
   events.push('CREATE:'+current.body.storeId)
   current.status='PENDING';current.interactionId='a2e616af-8c52-4776-b3b1-b446fc9b74a9'
   return {status:'PENDING',storeId:current.body.storeId,interactionId:current.interactionId}
  },
  pollInteraction:async()=>{
   const decision=decisions.shift()||null
   events.push('POLL:'+String(decision))
   if(decision==='ACCEPTED')current.status='ACCEPTED'
   if(decision==='REJECTED')current.status='REJECTED'
   return {decision,clientStatus:current.status}
  },
  quoteDelivery:async({storeId})=>{
   events.push('QUOTE:'+storeId)
   return {storeId:wrongQuote?storeB:storeId,storeName:'Prueba',revision:18,
    deliveryFeePen:4.5,routeDistanceKm:1.8,paymentMethods:['yape','cash']}
  }
 }
 const context={
  st,shops:allStores,window:{B3OrderAvailability:api},APP_ID:'com.integrab2g.pollosb3',
  publishedRevision:18,deliveryValidationGeneration:1,agentDecisionTimer:null,
  agentDecisionPolling:false,deliveryAvailability:{status:'CHECKING'},
  deliveryLocation:{latitude:-12.05,longitude:-77.12,source:'address',key:'key'},
  hasDeliveryDestination:()=>true,eligibleDeliveryCandidates:()=>allStores.map(store=>({store,km:1})),
  storeAvailabilitySetting:store=>store.consultOrderAvailability,
  publishedOrderItems:()=>items,subtotal:()=>24.7,
  save:()=>{},render:()=>{},screen:name=>{st.stage=name;events.push('SCREEN:'+name)},
  deliveryAddressKey:(a,b)=>a+'|'+b,
  geocodeDeliveryDestination:async()=>({latitude:-12.05,longitude:-77.12,source:'address'}),
  clearTimeout:()=>{},setTimeout:()=>1,
  clearDeliveryAvailability:()=>{}
 }
 const functions=['currentCartSignature','deliveryContactReady','deliveryRequestCustomer',
 'requestSeriesKey','interactionMatchesCart',
 'stopAgentDecisionPoll','scheduleAgentDecisionPoll','completeAcceptedQuote',
 'pollAgentDecision','requestBackendOrderAvailability']
 vm.runInNewContext('let agentDecisionTimer=null,agentDecisionPolling=false;\n'+
  functions.map(extract).join('\n'),context)
 return {st,events,api,context,start:()=>context.requestBackendOrderAvailability({
  address:st.profile.address,district:st.profile.district,run:context.deliveryValidationGeneration,
  silent:false}),poll:()=>context.pollAgentDecision()}
}
test('crea interacción antes de la cotización y espera sin habilitar pago',async()=>{
 const s=simulation({decisions:[null]})
 await s.start()
 assert.deepEqual(s.events.filter(x=>!x.startsWith('SCREEN:')),
 ['CHECK:'+storeA,'PREPARE:'+storeA,'CREATE:'+storeA])
 assert.equal(s.st.quote,null)
 assert.equal(s.context.deliveryAvailability.status,'WAITING_APPROVAL')
 await s.poll()
 assert.equal(s.st.stage,'availability')
 assert.ok(!s.events.some(x=>x.startsWith('QUOTE:')))
})
test('aceptado cotiza únicamente la sede original y avanza automáticamente a revisión',async()=>{
 const s=simulation({decisions:['ACCEPTED']})
 await s.start();await s.poll()
 assert.deepEqual(s.events.filter(x=>x.startsWith('QUOTE:')),['QUOTE:'+storeA])
 assert.equal(s.st.stage,'prepaymentReview')
 assert.equal(s.st.quote.deliveryFeePen,4.5)
 assert.equal(s.st.quote.quoteOrigin,'ADMIN_API_ACCEPTED')
 assert.equal(s.st.quote.storeId,storeA)
})
test('rechazado usa segunda sede sin cotizar la primera ni pedir intervención al cliente',async()=>{
 const s=simulation({decisions:['REJECTED','ACCEPTED']})
 await s.start();await s.poll()
 assert.equal(s.st.stage,'availability')
 assert.equal(s.context.deliveryAvailability.status,'WAITING_APPROVAL')
 assert.deepEqual(s.events.filter(x=>x.startsWith('CREATE:')),['CREATE:'+storeA,'CREATE:'+storeB])
 await s.poll()
 assert.equal(s.st.stage,'prepaymentReview')
 assert.deepEqual(s.events.filter(x=>x.startsWith('QUOTE:')),['QUOTE:'+storeB])
})
test('si ambas sedes rechazan, informa no disponibilidad sin cotización ni pago',async()=>{
 const s=simulation({decisions:['REJECTED','REJECTED']})
 await s.start();await s.poll();await s.poll()
 assert.equal(s.st.stage,'availability')
 assert.equal(s.context.deliveryAvailability.status,'UNAVAILABLE')
 assert.match(s.context.deliveryAvailability.message,/no tenemos locales disponibles/)
 assert.ok(!s.events.some(x=>x.startsWith('QUOTE:')))
})
test('cotización de una sede diferente bloquea la continuación al pago',async()=>{
 const s=simulation({decisions:['ACCEPTED'],wrongQuote:true})
 await s.start();await s.poll()
 assert.notEqual(s.st.stage,'prepaymentReview')
 assert.equal(s.context.deliveryAvailability.status,'ERROR')
 assert.match(s.context.deliveryAvailability.message,/no corresponde/)
})
test('el estado EXPIRED nunca puede avanzar al pago aunque exista un texto antiguo de aceptado',async()=>{
 const s=simulation({decisions:['ACCEPTED']})
 await s.start()
 const original=s.api.pollInteraction
 s.api.pollInteraction=async()=>{const response=await original();return {...response,clientStatus:'EXPIRED'}}
 await s.poll()
 assert.equal(s.st.stage,'availability')
 assert.equal(s.context.deliveryAvailability.status,'ERROR')
 assert.deepEqual(s.events.filter(x=>x.startsWith('QUOTE:')),[])
})
test('la pantalla de espera no requiere continuar y chat permanece bloqueado',()=>{
 assert.match(source,/function prepaymentReview\(\)/)
 assert.match(source,/data-prepay-payment/)
 assert.match(source,/data-prepay-add/)
 assert.match(source,/async function cancelApprovedForCartChange/)
 assert.match(source,/function chat\(\)/)
 assert.match(source,/id="chat-message"[^>]+disabled/)
 assert.match(source,/La confirmación y el cobro quedan para la siguiente fase/)
 assert.doesNotMatch(source,/No decision endpoint, never unlock checkout on PENDING/)
})
