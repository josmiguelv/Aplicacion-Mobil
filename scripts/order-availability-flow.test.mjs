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
function simulation({available=true,decisions=[],allStores=stores,wrongQuote=false,sendFailures=0,createFailures=0,quoteFailures=0}={}){
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
   if(quoteFailures>0){quoteFailures--;const error=Error('No se pudo cotizar el delivery (HTTP 500)');error.httpStatus=500;throw error}
   return {storeId:wrongQuote?storeB:storeId,storeName:'Prueba',revision:18,
    deliveryFeePen:4.5,routeDistanceKm:1.8,paymentMethods:['yape','cash']}
  }
 }
 const context={
  st,shops:allStores,window:{B3OrderAvailability:api},APP_ID:'com.integrab2g.pollosb3',
  publishedRevision:18,deliveryValidationGeneration:1,deliveryValidationStep:'INICIO',agentDecisionTimer:null,
  agentDecisionPolling:false,chatOverlay:null,deliveryAvailability:{status:'CHECKING'},
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
 'pollAgentDecision','requestBackendOrderAvailability','openAlternateFulfillment']
 vm.runInNewContext('let agentDecisionTimer=null,agentDecisionPolling=false,checkoutPending=false,fulfillmentOutcomeNote=\'\';\n'+
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
test('RECHAZADO no envía interacción a segunda sede ni inicia una nueva validación',async()=>{
 const s=simulation({decisions:['REJECTED','ACCEPTED']});
 await s.start();await s.poll();
 assert.equal(s.st.stage,'choice');
 assert.equal(s.api.readInteraction().status,'REJECTED');
 assert.equal(s.context.deliveryAvailability.status,'REJECTED');
 assert.match(s.context.deliveryAvailability.message,/no aceptó tu solicitud/);
 assert.deepEqual(s.events.filter(x=>x.startsWith('CREATE:')),['CREATE:'+storeA]);
 assert.deepEqual(s.events.filter(x=>x.startsWith('POLL:')),['POLL:REJECTED']);
 await s.poll();
 assert.equal(s.st.stage,'choice');
 assert.deepEqual(s.events.filter(x=>x.startsWith('CREATE:')),['CREATE:'+storeA]);
 assert.equal(s.events.filter(x=>x.startsWith('QUOTE:')).length,0);
 assert.equal(s.events.filter(x=>x==='PAYMENT_WINDOW').length,0);
});
test('sin sedes o sin agentes, no crea conversaciones y propone cambiar modalidad',async()=>{
 for(const options of [{allStores:[]},{available:false}]){
  const s=simulation(options);
  await s.start();
  assert.equal(s.context.deliveryAvailability.status,'UNAVAILABLE');
  assert.match(s.context.deliveryAvailability.message,/recojo en tienda/);
  assert.equal(s.st.stage,'choice');
  assert.equal(s.events.filter(x=>x.startsWith('CREATE:')).length,0);
  assert.equal(s.events.filter(x=>x.startsWith('POLL:')).length,0);
 }
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
test('la espera no muestra un botón de chat entre las acciones del pedido; conserva icono flotante',()=>{
 assert.doesNotMatch(source,/data-screen="chat">Ver seguimiento en el chat/);
 assert.match(source,/b3-wait-chat-fab/);
 assert.match(source,/data-screen="chat" aria-label="Abrir chat flotante/);
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

test('abrir y cerrar chat flotante conserva formulario, etapa, scroll y foco sin renderizar',()=>{
 let focusRestored=false,headerFocused=false,layer=null,clickHandler=null,rendered=0;
 const input={value:'Dirección a medio completar 123',isConnected:true,
  focus:()=>{focusRestored=true}};
 const root={innerHTML:'<form><input id="address"></form>',contains:el=>el===input};
 const document={
  activeElement:input,
  createElement:()=>({
   className:'',innerHTML:'',removed:false,
   addEventListener:(event,fn)=>{if(event==='click')clickHandler=fn},
   querySelector:q=>q.startsWith('[data-chat-close]')?
     {focus:()=>{headerFocused=true}}:
     q==='#b3-chat-history'?{scrollHeight:200,scrollTop:0}:null,
   contains:()=>true,
   remove(){this.removed=true}
  }),
  body:{appendChild:el=>{layer=el}}
 };
 const context={document,root,chat:()=>'<div>Historial real</div>',
  returnToPersonalCheckout:()=>{throw Error('La navegación no debe ejecutarse')},
  render:()=>{rendered++}};
 vm.runInNewContext('let chatOverlay=null,chatRestoreFocus=null;\n'+
  [extract('openChatOverlay'),extract('closeChatOverlay')].join('\n'),context);
 context.openChatOverlay();
 context.openChatOverlay();
 assert.equal(layer.className,'b3-chat-modal-layer');
 assert.match(layer.innerHTML,/role="dialog"/);
 assert.ok(headerFocused);
 assert.equal(root.innerHTML,'<form><input id="address"></form>');
 assert.equal(input.value,'Dirección a medio completar 123');
 assert.equal(rendered,0);
 const outside={hasAttribute:key=>key==='data-chat-close'};
 clickHandler({target:{closest:()=>outside}});
 assert.equal(layer.removed,true);
 assert.equal(focusRestored,true);
 assert.equal(input.value,'Dirección a medio completar 123');
 assert.equal(rendered,0);
 assert.match(source,/function screen\(n\)\{\s*if\(n==='chat'\)\{openChatOverlay\(\);return\}/);
 assert.match(source,/if\(b\.dataset\.screen==='chat'\)\{openChatOverlay\(\);return\}/);
 assert.match(source,/window\.handleB3Back=\(\)=>\{\s*if\(b3ConfirmDismiss\)/);
 assert.match(source,/if\(chatOverlay\)\{closeChatOverlay\(\);return true\}/);
 assert.match(source,/if\(chatOverlay\)refreshChatTimeline\(\)/);
});

test('HTTP 500 al cotizar después de ACEPTADO conserva la interacción y reintenta solo el delivery',async()=>{
 const run=simulation({decisions:['ACCEPTED'],quoteFailures:1});
 await run.start();
 const id=run.api.readInteraction().interactionId;
 await run.poll();
 assert.equal(run.api.readInteraction().interactionId,id);
 assert.equal(run.api.readInteraction().agentDecision,'ACCEPTED');
 assert.equal(run.api.readInteraction().messageDelivered,true);
 assert.equal(run.st.stage,'availability');
 assert.equal(run.st.quote,null);
 assert.equal(run.context.deliveryAvailability.status,'QUOTE_UNAVAILABLE');
 assert.match(run.context.deliveryAvailability.message,/HTTP 500/);
 assert.equal(run.events.filter(x=>x.startsWith('CREATE:')).length,1);
 assert.equal(run.events.filter(x=>x.startsWith('SEND:')).length,1);
 assert.equal(run.events.filter(x=>x==='PAYMENT_WINDOW').length,0);
 await run.poll();
 assert.equal(run.st.stage,'prepaymentReview');
 assert.equal(run.api.readInteraction().interactionId,id);
 assert.equal(run.events.filter(x=>x.startsWith('CREATE:')).length,1);
 assert.equal(run.events.filter(x=>x.startsWith('SEND:')).length,1);
 assert.equal(run.events.filter(x=>x.startsWith('QUOTE:')).length,2);
 assert.equal(run.events.filter(x=>x==='PAYMENT_WINDOW').length,1);
});
test('al fallar la tarifa se conserva una sola pantalla de solicitud aceptada',()=>{
 const entry={interactionId:'a2e616af-8c52-4776-b3b1-b446fc9b74a9',
  body:{customer:{firstName:'Ana'}},messageDelivered:true,
  status:'ACCEPTED',agentDecision:'ACCEPTED'};
 const context={
  st:{profile:{address:'Av Ejemplo 123',district:'Santa Anita'},quote:null},
  window:{B3OrderAvailability:{readInteraction:()=>entry}},
  deliveryAvailability:{status:'QUOTE_UNAVAILABLE',storeName:'Sede de prueba',
   message:'No se pudo calcular el delivery (HTTP 500)'},
  activePersonalCheckout:()=>entry,heading:()=>'<header>Estado</header>',
  ic:()=>'',esc:value=>String(value),cartCount:()=>1,subtotal:()=>13,
  cash:value=>'S/ '+value,deliveryRequestPending:false
 };
 vm.runInNewContext(extract('availability'),context);
 const page=context.availability();
 assert.match(page,/b3-single-wait/);
 assert.match(page,/La sede respondió a tu solicitud/);
 assert.match(page,/Reintentar tarifa de delivery/);
 assert.doesNotMatch(page,/class="b3-availability-order"/);
 assert.doesNotMatch(page,/Carrito · Dirección · Disponibilidad/);
 assert.doesNotMatch(page,/data-availability-retry/);
});

test('al revisar un pedido aceptado ambas flechas de pago van a Inicio, sin disponibilidad',()=>{
 const review=extract('prepaymentReview');
 assert.match(review,/heading\('Revisa tu pedido','inicio'\)/);
 const payment=extract('payment');
 assert.match(payment,/heading\('Método de pago',st\.mode==='delivery'.*?'inicio':'prepaymentReview'\)/);
 const summary=extract('summary');
 assert.match(summary,/heading\('Resumen de tu pedido',st\.mode==='delivery'.*?'inicio':'payment'\)/);
 assert.match(source,/function screen\(n\)\{[\s\S]*?if\(n==='inicio'\)\{nav\('inicio'\);return\}/);
 assert.match(source,/if\(n==='availability'&&\['prepaymentReview','payment','summary'\]\.includes\(st\.stage\)/);
 assert.match(source,/if\(\['availability','prepaymentReview','payment','summary'\]\.includes\(st\.stage\)&&activePersonalCheckout\(\)\)/);
});
test('activación GPS es voluntaria, abre solo los ajustes nativos elegidos y no reinicia formularios',()=>{
 const native=readFileSync(new URL('../app/src/main/java/com/integrab2g/pollosb3/MainActivity.java',import.meta.url),'utf8');
 const manifest=readFileSync(new URL('../app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
 assert.match(manifest,/android\.permission\.ACCESS_FINE_LOCATION/);
 assert.match(manifest,/android\.permission\.ACCESS_COARSE_LOCATION/);
 assert.match(native,/Settings\.ACTION_LOCATION_SOURCE_SETTINGS/);
 assert.match(native,/Settings\.ACTION_APPLICATION_DETAILS_SETTINGS/);
 assert.match(native,/@JavascriptInterface public void openLocationSettings\(\)/);
 assert.match(native,/@JavascriptInterface public void openAppLocationSettings\(\)/);
 assert.match(native,/if \(!hasLocationPermission\(\)\)/);
 assert.match(native,/Manifest\.permission\.ACCESS_COARSE_LOCATION\}, LOCATION_REQUEST/);
 assert.match(native,/if \(hasLocationPermission\(\)\) requestOptionalLocation\(\)/);
 const calls=[],panels=[];
 let listener=null;
 const context={
  esc:txt=>String(txt),
  document:{
   createElement:()=>({innerHTML:'',className:'',remove(){calls.push('CLOSE')},
    addEventListener:(name,fn)=>{if(name==='click')listener=fn}}),
   body:{appendChild:el=>panels.push(el)}
  },
  window:{AndroidBridge:{
   openLocationSettings:()=>calls.push('DEVICE_SETTINGS'),
   openAppLocationSettings:()=>calls.push('APP_PERMISSIONS')
  }}
 };
 vm.runInNewContext('let locationSettingsModal=null,deliveryGpsRequested=true;\n'+
  extract('showLocationSettingsPrompt'),context);
 context.showLocationSettingsPrompt('LOCATION_DISABLED');
 assert.equal(panels.length,1);
 assert.match(panels[0].innerHTML,/Abrir ajustes de ubicación/);
 assert.match(panels[0].innerHTML,/continuar sin GPS/);
 assert.deepEqual(calls,[],'El sistema no puede encender GPS sin una acción del usuario');
 listener({target:{closest:query=>query==='[data-location-settings]'?{}:null}});
 assert.deepEqual(calls,['CLOSE','DEVICE_SETTINGS']);
 context.showLocationSettingsPrompt('PERMISSION_DENIED');
 assert.match(panels[1].innerHTML,/Abrir permisos de Pollos B3/);
 listener({target:{closest:query=>query==='[data-location-settings]'?{}:null}});
 assert.deepEqual(calls,['CLOSE','DEVICE_SETTINGS','CLOSE','APP_PERMISSIONS']);
 context.showLocationSettingsPrompt('LOCATION_DISABLED');
 listener({target:{closest:query=>query==='[data-location-later]'?{}:null}});
 assert.equal(vm.runInNewContext('deliveryGpsRequested',context),false);
 assert.equal(calls.includes('DEVICE_SETTINGS'),true);
 assert.match(source,/deliveryGpsRequested=forDelivery;\s*showLocationSettingsPrompt\(error\)/);
});

test('sin disponibilidad o con rechazo se ofrece cambiar método, jamás comprobar otra vez',()=>{
 const st={mode:'delivery',profile:{address:'Calle de prueba 123',district:'Santa Anita'},quote:null};
 for(const status of ['UNAVAILABLE','REJECTED']){
  const entry=status==='REJECTED'?{status:'REJECTED',body:{storeId:storeA}}:null;
  const context={
   st,window:{B3OrderAvailability:{readInteraction:()=>entry}},
   activePersonalCheckout:()=>null,
   deliveryAvailability:{status,storeName:'Sede de prueba',
    message:status==='REJECTED'?'La sede no aceptó tu pedido':'Sin atención disponible'},
   deliveryRequestPending:false,deliveryHealthPending:false,deliveryHealthMessage:'',
   deliveryValidationStep:'COBERTURA_Y_HORARIO',checkoutPending:false,
   heading:()=>'<header>Estado del pedido</header>',ic:()=>'',esc:s=>String(s),
   cartCount:()=>1,subtotal:()=>13,cash:n=>'S/ '+n,deliveryQuoteValid:()=>false
  };
  vm.runInNewContext(extract('availability'),context);
  const html=context.availability();
  assert.match(html,/Cambiar método de entrega/);
  assert.match(html,/data-change-fulfillment="1"/);
  assert.doesNotMatch(html,/data-availability-retry/);
  assert.doesNotMatch(html,/Volver a comprobar/);
 }
 assert.match(source,/if\(b\.hasAttribute\('data-change-fulfillment'\)\)/);
 assert.match(source,/screen\('choice'\)/);
 assert.doesNotMatch(source,/window\.confirm\(/);
});
test('confirmación personalizada no muestra la URL de WebView ni navega antes de confirmar',async()=>{
 const events=[],layers=[];
 const focused={isConnected:true,focus:()=>events.push('RESTORE')};
 let callback=null;
 const doc={
  activeElement:focused,
  createElement:()=>({
   innerHTML:'',className:'',remove(){events.push('CLOSE')},
   addEventListener:(name,fn)=>{if(name==='click')callback=fn},
   querySelector:()=>({focus:()=>events.push('FOCUS')})
  }),
  body:{appendChild:layer=>layers.push(layer)}
 };
 const context={document:doc,ic:()=>'',esc:s=>String(s)};
 vm.runInNewContext('let b3ConfirmDismiss=null;\n'+extract('confirmB3'),context);
 const answer=context.confirmB3({
  title:'¿Cancelar tu solicitud?',
  description:'No volveremos a enviarla automáticamente.',
  confirmLabel:'Sí, cancelar solicitud',danger:true
 });
 assert.equal(layers.length,1);
 assert.match(layers[0].innerHTML,/POLLOS B3 · TU PEDIDO/);
 assert.match(layers[0].innerHTML,/Cancelar tu solicitud/);
 assert.doesNotMatch(layers[0].innerHTML,/appassets|androidplatform\.net|https:\/\//);
 callback({target:{closest:()=>({getAttribute:()=> 'no'})}});
 assert.equal(await answer,false);
 const accepted=context.confirmB3({
  title:'¿Cambiar los productos?',description:'Se cancelará la solicitud.',
  confirmLabel:'Continuar',danger:true
 });
 callback({target:{closest:()=>({getAttribute:()=> 'yes'})}});
 assert.equal(await accepted,true);
 assert.equal(events.filter(e=>e==='CLOSE').length,2);
});

test('no delivery: preserves cart and opens fulfillment selector, never automatically reissues interaction',async()=>{
 for(const options of [{allStores:[]},{available:false}]){
  const sim=simulation(options);
  sim.st.cart=[{id:productId,qty:2}];
  await sim.start();
  assert.equal(sim.st.stage,'choice');
  assert.deepEqual(sim.st.cart,[{id:productId,qty:2}]);
  assert.equal(sim.events.filter(x=>x.startsWith('CREATE:')).length,0);
  assert.deepEqual(sim.events.filter(x=>x==='SCREEN:choice'),['SCREEN:choice']);
 }
 assert.match(source,/function openAlternateFulfillment\(message\)/);
 assert.match(source,/role="status"><strong>Tu pedido sigue en el carrito/);
 assert.match(source,/function confirmB3\(/);
 assert.doesNotMatch(source,/window\.confirm\(/);
});
