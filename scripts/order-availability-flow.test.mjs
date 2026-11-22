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
function simulation({available=true,decisions=[],allStores=stores,wrongQuote=false,sendFailures=0,createFailures=0}={}){
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
   if(createFailures>0){createFailures--;current.status='SUBMITTING';const error=Error('503');error.httpStatus=503;throw error}
   current.status='PENDING';current.interactionId='a2e616af-8c52-4776-b3b1-b446fc9b74a9'
   current.messageDelivered=false
   return {status:'PENDING',storeId:current.body.storeId,interactionId:current.interactionId}
  },
  sendInteractionMessage:async()=>{
   events.push('SEND:'+current.body.storeId)
   if(sendFailures>0){sendFailures--;throw Error('HTTP 503 al confirmar el texto')}
   current.messageDelivered=true
   return {interactionId:current.interactionId,delivered:true}
  },
  pollInteraction:async()=>{
   const decision=decisions.shift()||null
   events.push('POLL:'+String(decision))
   if(decision==='ACCEPTED'){current.status='ACCEPTED';current.agentDecision='ACCEPTED'}
   if(decision==='REJECTED')current.status='REJECTED'
   return {decision,clientStatus:current.status}
  },
  beginPaymentWait:async()=>{
   events.push('PAYMENT_WINDOW');current.paymentExpiresAt='2099-01-01T00:00:00Z';
   return {status:'PAYMENT_PENDING',expiresAt:current.paymentExpiresAt,reminderCount:2};
  },
  quoteDelivery:async({storeId})=>{
   events.push('QUOTE:'+storeId)
   return {storeId:wrongQuote?storeB:storeId,storeName:'Prueba',revision:18,
    deliveryFeePen:4.5,routeDistanceKm:1.8,paymentMethods:['yape','cash']}
  }
 }
 const context={
  st,shops:allStores,window:{B3OrderAvailability:api},APP_ID:'com.integrab2g.pollosb3',
  publishedRevision:18,deliveryValidationGeneration:1,deliveryValidationStep:'INICIO',agentDecisionTimer:null,
  agentDecisionPolling:false,deliveryAvailability:{status:'CHECKING'},
  deliveryLocation:{latitude:-12.05,longitude:-77.12,source:'address',key:'key'},
  hasDeliveryDestination:()=>true,eligibleDeliveryCandidates:()=>allStores.map(store=>({store,km:1})),
  storeAvailabilitySetting:store=>store.consultOrderAvailability,
  publishedOrderItems:()=>items,subtotal:()=>24.7,
  save:()=>{},render:()=>{},refreshChatTimeline:()=>{},screen:name=>{st.stage=name;events.push('SCREEN:'+name)},
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
 ['CHECK:'+storeA,'PREPARE:'+storeA,'CREATE:'+storeA,'SEND:'+storeA])
 assert.equal(s.st.quote,null)
 assert.equal(s.context.deliveryAvailability.status,'WAITING_APPROVAL')
 await s.poll()
 assert.equal(s.st.stage,'availability')
 assert.ok(!s.events.some(x=>x.startsWith('QUOTE:')))
})
test('HTTP 503 después de crear conserva el interactionId y reintenta solo texto',async()=>{
 const s=simulation({decisions:['ACCEPTED'],sendFailures:1})
 await s.start()
 assert.equal(s.st.stage,'availability')
 assert.equal(s.context.deliveryAvailability.status,'CREATE_UNCERTAIN')
 assert.equal(s.api.readInteraction().status,'PENDING')
 assert.equal(s.api.readInteraction().messageDelivered,false)
 const id=s.api.readInteraction().interactionId
 assert.equal(s.events.filter(x=>x.startsWith('CREATE:')).length,1)
 await s.poll()
 assert.equal(s.api.readInteraction().interactionId,id)
 assert.equal(s.events.filter(x=>x.startsWith('CREATE:')).length,1)
 assert.equal(s.events.filter(x=>x.startsWith('SEND:')).length,2)
 assert.equal(s.st.stage,'prepaymentReview')
})
test('HTTP 503 en creación deja pendiente recuperación con misma clave, sin perder respuesta del agente',async()=>{
 const s=simulation({createFailures:1,decisions:['ACCEPTED']});
 await s.start();
 assert.equal(s.context.deliveryAvailability.status,'CREATE_UNCERTAIN');
 assert.equal(s.api.readInteraction().status,'SUBMITTING');
 assert.equal(s.api.readInteraction().interactionId,undefined);
 const key=s.api.readInteraction().idempotencyKey;
 await s.poll();
 assert.equal(s.api.readInteraction().idempotencyKey,key);
 assert.equal(s.st.stage,'prepaymentReview');
 assert.deepEqual(s.events.filter(x=>x.startsWith('CREATE:')),['CREATE:'+storeA,'CREATE:'+storeA]);
 assert.deepEqual(s.events.filter(x=>x.startsWith('QUOTE:')),['QUOTE:'+storeA]);
});
test('la espera del agente no tiene plazo comercial local',async()=>{
 const s=simulation({decisions:Array(50).fill(null)})
 await s.start()
 for(let i=0;i<50;i++)await s.poll()
 assert.equal(s.api.readInteraction().status,'PENDING')
 assert.equal(s.st.stage,'availability')
 assert.equal(s.context.deliveryAvailability.status,'WAITING_APPROVAL')
 assert.equal(s.events.filter(x=>x.startsWith('CREATE:')).length,1)
 assert.equal(s.events.filter(x=>x.startsWith('SEND:')).length,1)
 assert.equal(s.events.filter(x=>x.startsWith('QUOTE:')).length,0)
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
 assert.doesNotMatch(source,/id="chat-message"/)
 assert.match(source,/Seguimiento de solo lectura/)
 assert.match(source,/function chatTranscript\(\)/)
 assert.match(source,/La confirmación y el cobro quedan para la siguiente fase/)
 assert.doesNotMatch(source,/No decision endpoint, never unlock checkout on PENDING/)
})

test('respuesta ACEPTADO se detecta aunque el detalle devuelva 503 y solo se paga tras confirmarlo',async()=>{
 const run=simulation({decisions:['ACCEPTED'],sendFailures:2});
 await run.start();
 const original=run.api.readInteraction().interactionId;
 assert.equal(run.st.stage,'availability');
 await run.poll();
 assert.equal(run.api.readInteraction().status,'ACCEPTED');
 assert.equal(run.api.readInteraction().messageDelivered,false);
 assert.equal(run.st.stage,'availability');
 assert.equal(run.st.quote,null,'Sin texto confirmado no se calcula ni autoriza el pago');
 assert.match(run.context.deliveryAvailability.message,/La sede ya respondió ACEPTADO/);
 assert.equal(run.events.filter(x=>x.startsWith('CREATE:')).length,1);
 await run.poll();
 assert.equal(run.api.readInteraction().interactionId,original);
 assert.equal(run.api.readInteraction().messageDelivered,true);
 assert.equal(run.st.stage,'prepaymentReview');
 assert.equal(run.events.filter(x=>x.startsWith('CREATE:')).length,1);
 assert.equal(run.events.filter(x=>x.startsWith('SEND:')).length,3);
 assert.equal(run.events.filter(x=>x.startsWith('QUOTE:')).length,1);
 assert.equal(run.events.filter(x=>x==='PAYMENT_WINDOW').length,1);
});
test('espera pendiente ocupa una vista independiente sin apilar resumen y etapas',()=>{
 const entry={interactionId:'a2e616af-8c52-4776-b3b1-b446fc9b74a9',
   body:{customer:{firstName:'Ana'}},messageDelivered:false,status:'PENDING'};
 const context={
  st:{profile:{address:'Av Ejemplo 123',district:'Santa Anita'},quote:null},
  window:{B3OrderAvailability:{readInteraction:()=>entry}},
  deliveryAvailability:{status:'CREATE_UNCERTAIN',storeName:'Local de prueba',message:'Confirmando detalle'},
  activePersonalCheckout:()=>entry,
  heading:()=>'<header>Estado de tu solicitud</header>',
  ic:()=>'',esc:value=>String(value),cartCount:()=>1,subtotal:()=>13,cash:value=>'S/ '+value,
  deliveryRequestPending:false,deliveryValidationStep:'CREANDO_INTERACCION'
 };
 vm.runInNewContext(extract('availability'),context);
 const page=context.availability();
 assert.match(page,/b3-single-wait/);
 assert.match(page,/Confirmando detalle/);
 assert.match(page,/Cancelar solicitud/);
 assert.doesNotMatch(page,/class="b3-availability-order"/);
 assert.doesNotMatch(page,/class="b3-availability-step"/);
 assert.doesNotMatch(page,/class="b3-checkout-motion"/);
});

test('la respuesta validada mientras el cliente mira el chat avanza al importe sin duplicar',async()=>{
 const sim=simulation({decisions:['ACCEPTED']});
 await sim.start();
 const id=sim.api.readInteraction().interactionId;
 sim.st.stage='chat';
 await sim.poll();
 assert.equal(sim.api.readInteraction().interactionId,id);
 assert.equal(sim.st.stage,'prepaymentReview');
 assert.equal(sim.events.filter(x=>x.startsWith('CREATE:')).length,1);
 assert.equal(sim.events.filter(x=>x.startsWith('QUOTE:')).length,1);
 assert.ok(sim.events.includes('SCREEN:availability'));
 assert.ok(sim.events.includes('SCREEN:prepaymentReview'));
});
test('la espera de Pollos B3 incluye un acceso directo al seguimiento del chat',()=>{
 assert.match(source,/data-screen="chat">Ver seguimiento en el chat/);
 assert.match(source,/function chatTranscript\(\)/);
 assert.match(source,/function refreshChatTimeline\(\)/);
 assert.match(source,/data-checkout-return="1">Ver estado de mi solicitud/);
});

test('el chat muestra cronología confirmada, mensajes reales y escapa contenido del asesor',()=>{
 const labels=source.match(/const B3_CHAT_ACTIVITY=Object\.freeze\(\{[\s\S]*?\}\);/);
 assert.ok(labels,'Se requieren etiquetas de hitos permitidos');
 const entry={createdAt:1763780000000,
  interactionId:'a2e616af-8c52-4776-b3b1-b446fc9b74a9',status:'PENDING',
  body:{customer:{firstName:'Ana'}},messageDelivered:false,
  activity:[{type:'prepared',at:1763780000000},{type:'created',at:1763780003000}],
  agentMessages:[{id:'c9b7e9d9-a5ed-4261-92ac-f31f74ec545c',
   text:'<script>inseguro</script> ACEPTADO',createdAt:'2026-11-22T04:01:00Z'}]};
 const context={window:{B3OrderAvailability:{readInteraction:()=>entry}},
  esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
  heading:()=>'<header>Chat</header>',ic:()=>'',st:{stage:'chat'}};
 vm.runInNewContext(labels[0]+'\n'+
  ['chatTranscript','chatStatusLine','chat'].map(extract).join('\n'),context);
 const transcript=context.chatTranscript();
 assert.match(transcript,/Estamos preparando tu solicitud/);
 assert.match(transcript,/La solicitud quedó registrada/);
 assert.match(transcript,/Asesor de la sede/);
 assert.match(transcript,/&lt;script&gt;inseguro&lt;\/script&gt;/);
 assert.doesNotMatch(transcript,/<script>/);
 assert.match(transcript,/pendiente de confirmación/);
 assert.doesNotMatch(transcript,/La conversación confirmó el envío del detalle/);
 const html=context.chat();
 assert.match(html,/b3-chat-history/);
 assert.match(html,/Seguimiento de solo lectura/);
 assert.doesNotMatch(html,/chat-form|id="chat-message"/);
});
