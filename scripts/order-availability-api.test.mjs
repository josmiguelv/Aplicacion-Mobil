import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';

const moduleSource=readFileSync(new URL('../app/src/main/assets/order-availability.js',import.meta.url),'utf8');
const checkoutSource=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../app/src/main/assets/index.html',import.meta.url),'utf8');
const java=readFileSync(new URL('../app/src/main/java/com/integrab2g/pollosb3/MainActivity.java',import.meta.url),'utf8');
const productId='c82150dd-cad0-4139-9aaf-309c26e074b1';
const validationId='e37880ae-2d8a-4242-9239-080de6fe4e45';

function mockStorage() {
  const items=new Map();
  return {
    getItem:key=>items.has(key)?items.get(key):null,
    setItem:(key,value)=>items.set(key,String(value)),
    removeItem:key=>items.delete(key),
    keys:()=>[...items.keys()]
  };
}
function client(responder=()=>{}) {
  const localStorage=mockStorage(),sessionStorage=mockStorage(),requests=[];
  const window={crypto:webcrypto,Uint8Array,btoa,text:undefined,
    localStorage,sessionStorage,setTimeout,clearTimeout};
  window.AndroidBridge={orderAvailabilityRequest(raw){
    const req=JSON.parse(raw);requests.push(req);
    queueMicrotask(()=>window.b3OrderAvailabilityNativeResponse(JSON.stringify(
      responder(req,requests.length) || {requestId:req.requestId,status:202,
        data:{validationId,status:'WAITING_APPROVAL'}})));
  }};
  runInNewContext(moduleSource,{window,Uint8Array,JSON,Map,Promise,Error,Date,Number,Set});
  return {api:window.B3OrderAvailability,requests,localStorage,sessionStorage,window};
}
function input(changes={}) {
  return {appId:'com.integrab2g.pollosb3',
    items:[{productId,quantity:2}],address:'Av. Ejemplo 123',
    district:'Santa Anita',revision:18,...changes};
}

test('tokens CSPRNG de 256 bits, UUID y customerExternalId seudónimo, nunca en localStorage',()=>{
  const {api,localStorage,sessionStorage}=client();
  const p=api.prepare(input());
  assert.match(p.token,/^ordv1_[A-Za-z0-9_-]{43}$/);
  assert.match(p.idempotencyKey,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(p.body.customerExternalId,/^b3_[A-Za-z0-9_-]{24}$/);
  assert.equal(localStorage.keys().length,1);
  assert.equal(localStorage.getItem(localStorage.keys()[0]),p.body.customerExternalId);
  assert.ok(sessionStorage.keys().length>0);
  assert.equal(p.body.appId,'com.integrab2g.pollosb3');
  assert.equal(p.body.items[0].productId,productId);
  assert.ok(!('tenantId' in p.body)&&!('storeId' in p.body)&&!('total' in p.body));
});
test('borrado de datos elimina token de sesión e identidad seudónima',()=>{
 const {api,localStorage,sessionStorage}=client();
 api.prepare(input());
 assert.ok(localStorage.keys().length>0);
 assert.ok(sessionStorage.keys().length>0);
 api.eraseLocalIdentity();
 assert.equal(localStorage.keys().length,0);
 assert.equal(sessionStorage.keys().length,0);
 assert.match(checkoutSource,/window\.B3OrderAvailability\?\.eraseLocalIdentity\(\)/);
});
test('misma solicitud reutiliza token y clave; cambio de carrito o dirección la rota',()=>{
  const {api}=client();
  const first=api.prepare(input()),second=api.prepare(input());
  assert.equal(first.token,second.token);
  assert.equal(first.idempotencyKey,second.idempotencyKey);
  const changed=api.prepare(input({district:'Ate'}));
  assert.notEqual(changed.token,first.token);
  assert.notEqual(changed.idempotencyKey,first.idempotencyKey);
  assert.equal(api.prepare(input({district:'Ate'})).token,changed.token);
});
test('POST inicial, GET con Bearer de capacidad y sin segundo POST en la misma validación',async()=>{
  const {api,requests}=client((req,count)=>count===1?
    {requestId:req.requestId,status:202,data:{validationId,status:'WAITING_APPROVAL'}}:
    {requestId:req.requestId,status:200,data:{validationId,status:'READY_FOR_PAYMENT',
      subtotal:48,currency:'PEN',deliveryFee:5,total:53,store:{id:'sede'},paymentMethods:['yape']}});
  const p=api.prepare(input());
  const a=await api.execute(p),b=await api.execute(p);
  assert.equal(a.status,'WAITING_APPROVAL');
  assert.equal(b.status,'READY_FOR_PAYMENT');
  assert.deepEqual(requests.map(x=>x.operation),['POST','GET']);
  assert.equal(requests[0].idempotencyKey,p.idempotencyKey);
  assert.equal(requests[1].validationToken,p.token);
  assert.equal(requests[1].validationId,validationId);
  assert.equal(requests[0].body.validationToken,p.token);
  assert.equal(requests[0].body.items[0].quantity,2);
});
test('timeout lógico sin validationId conserva la clave idempotente para reintento POST',()=>{
  const {api}=client();
  const p=api.prepare(input());
  const priorKey=p.idempotencyKey;
  assert.equal(api.read().validationId,null);
  assert.equal(api.prepare(input()).idempotencyKey,priorKey);
});
test('HTTP 429 nunca se interpreta como rechazo ni como cotización',async()=>{
  const {api}=client(req=>({requestId:req.requestId,status:429,data:{error:'Rate limited'}}));
  await assert.rejects(()=>api.execute(api.prepare(input())),/Demasiadas consultas/);
});
test('salud del backend usa únicamente GET de lectura sin crear interacción ni exponer tokens',async()=>{
  const {api,requests}=client(req=>({requestId:req.requestId,status:200,data:{status:'ready'}}));
  const result=await api.checkConnection();
  assert.equal(result.online,true);
  assert.equal(result.status,200);
  assert.equal(requests.length,1);
  assert.equal(requests[0].operation,'HEALTH');
  assert.ok(!('body' in requests[0])&&!('idempotencyKey' in requests[0])&&!('validationToken' in requests[0]));
  assert.match(java,/path = "\/health\/ready"/);
  assert.match(java,/connection\.setRequestMethod\(httpMethod\)/);
  assert.match(java,/"AGENT_AVAILABILITY"\.equals\(operation\)/);
  assert.match(java,/"DELIVERY_QUOTE"\.equals\(operation\)/);
  assert.match(java,/"INTERACTION_CREATE"\.equals\(operation\)/);
  assert.match(java,/path = "\/health\/live"/);
  assert.match(java,/else if \("GET"\.equals\(operation\)\) \{/);
  assert.match(checkoutSource,/data-availability-health/);
});
test('readiness 503 pero liveness 200 distingue la base caída del túnel y no envía credenciales',async()=>{
 const {api,requests}=client(req=>req.operation==='HEALTH'?
  {requestId:req.requestId,status:503,data:{status:'unavailable'}}:
  {requestId:req.requestId,status:200,data:{status:'ok'}});
 const status=await api.checkConnection();
 assert.equal(status.online,false);
 assert.equal(status.status,503);
 assert.equal(status.liveOnline,true);
 assert.equal(status.liveStatus,200);
 assert.deepEqual(requests.map(req=>req.operation),['HEALTH','HEALTH_LIVE']);
 assert.ok(requests.every(req=>!('body' in req)&&!('validationToken' in req)&&!('idempotencyKey' in req)));
});
test('el backend no listo se reporta sin crear validaciones',async()=>{
 const {api}=client(req=>({requestId:req.requestId,status:503,data:{status:'unavailable'}}));
 const result=await api.checkConnection();
 assert.equal(result.online,false);
 assert.equal(result.status,503);
});
test('HTTP 404 invalida el token perdido y permite nueva solicitud; 429 conserva idempotencia',async()=>{
 const lost=client(req=>({requestId:req.requestId,status:404,data:{error:'Not found'}}));
 const entry=lost.api.prepare(input());
 await assert.rejects(()=>lost.api.execute(entry));
 assert.equal(lost.api.read(),null);
 const fresh=lost.api.prepare(input());
 assert.notEqual(fresh.token,entry.token);
 const throttled=client(req=>({requestId:req.requestId,status:429,data:{error:'Rate limited'}}));
 const key=throttled.api.prepare(input()).idempotencyKey;
 await assert.rejects(()=>throttled.api.execute(throttled.api.read()));
 assert.equal(throttled.api.read().idempotencyKey,key);
});
test('rechaza estado inesperado o validationId distinto sin avanzar checkout',async()=>{
 const idMismatch=client(req=>({requestId:req.requestId,status:202,
  data:{validationId:'beab5c20-c77c-4076-b076-c15860f198e2',status:'WAITING_APPROVAL'}}));
 const token=idMismatch.api.prepare(input());
 token.validationId=validationId;
 await assert.rejects(()=>idMismatch.api.execute(token),/incompleta o inconsistente/);
 const status=client(req=>({requestId:req.requestId,status:200,
  data:{validationId,status:'PAID'}}));
 await assert.rejects(()=>status.api.execute(status.api.prepare(input())),/incompleta o inconsistente/);
});
test('prohíbe productos no UUID, duplicados, cantidades inválidas y no simula disponibilidad',()=>{
  const {api}=client();
  assert.throws(()=>api.prepare(input({items:[{productId:'p1',quantity:1}]})),/productos publicados/);
  assert.throws(()=>api.prepare(input({items:[{productId,quantity:100}]})),/productos publicados/);
  assert.throws(()=>api.prepare(input({items:[{productId,quantity:1},{productId,quantity:1}]})),/duplicados/);
  assert.match(checkoutSource,/function publishedOrderItems\(\)/);
  assert.match(checkoutSource,/const ready=await requestBackendOrderAvailability/);
  assert.match(checkoutSource,/await requestBackendOrderAvailability/);
  assert.match(checkoutSource,/api\.checkAgentAvailability/);
  assert.match(checkoutSource,/api\.quoteDelivery/);
  assert.match(checkoutSource,/api\.createInteraction/);
  assert.doesNotMatch(checkoutSource,/const quote=quoteForDeliveryCandidate\(first\);/);
  assert.match(checkoutSource,/serverValidated:true/);
  assert.match(checkoutSource,/async function pollAgentDecision/);
  assert.match(checkoutSource,/UNAVAILABLE/);
});
test('GET por sede consulta capacidad sin pedir carrito ni crear interacción',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c';
 const c=client(req=>({requestId:req.requestId,status:200,
  data:{storeId,status:'AVAILABLE',available:true,reservation:false}}));
 const result=await c.api.checkAgentAvailability({appId:'com.integrab2g.pollosb3',storeId});
 assert.equal(result.available,true);
 assert.equal(c.requests[0].operation,'AGENT_AVAILABILITY');
 assert.equal(c.requests[0].storeId,storeId);
 assert.ok(!('body' in c.requests[0])&&!('validationToken' in c.requests[0]));
 assert.match(java,/agent-availability\?appId=/);
});
test('UNAVAILABLE HTTP 200 no se interpreta como capacidad',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c';
 const c=client(req=>({requestId:req.requestId,status:200,
  data:{storeId,status:'UNAVAILABLE',available:false,reservation:false}}));
 const result=await c.api.checkAgentAvailability({appId:'com.integrab2g.pollosb3',storeId});
 assert.equal(result.available,false);
});
test('no acepta capacidad de otra sede ni disponibilidad inconsistente',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c';
 const c=client(req=>({requestId:req.requestId,status:200,
  data:{storeId:'aa123456-1234-4234-8234-123456789012',
   status:'AVAILABLE',available:true,reservation:false}}));
 await assert.rejects(()=>c.api.checkAgentAvailability({appId:'com.integrab2g.pollosb3',storeId}),/no corresponde/);
});
test('cotización independiente no crea interacción, valida revisión y local',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c';
 const c=client(req=>({requestId:req.requestId,status:200,
  data:{revision:18,storeId,mode:'delivery',deliveryFeePen:4.5,paymentMethods:['yape']}}));
 const data=await c.api.quoteDelivery({appId:'com.integrab2g.pollosb3',address:'Av. Ejemplo 123',
  district:'Santa Anita',useGps:false});
 assert.equal(data.storeId,storeId);
 assert.deepEqual(c.requests.map(x=>x.operation),['DELIVERY_QUOTE']);
 assert.equal(c.requests[0].body.mode,'delivery');
 assert.ok(!('items' in c.requests[0].body));
});
test('creación PENDING reutiliza clave e impide un segundo formulario',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c';
 const interactionId='3a122e61-0434-4ec7-8e2e-435524d547a3';
 const c=client(req=>({requestId:req.requestId,status:201,
  data:{status:'PENDING',storeId,interactionId,externalReference:'mobile:deterministic'}}));
 const input={appId:'com.integrab2g.pollosb3',storeId,catalogRevision:18,
  items:[{productId,quantity:1}],address:'Av. Ejemplo 123',district:'Santa Anita'};
 const entry=c.api.prepareInteraction(input);
 assert.equal(c.api.prepareInteraction(input).idempotencyKey,entry.idempotencyKey);
 assert.equal((await c.api.createInteraction(entry)).status,'PENDING');
 assert.equal((await c.api.createInteraction(entry)).status,'PENDING');
 assert.deepEqual(c.requests.map(x=>x.operation),['INTERACTION_CREATE']);
 assert.equal(c.requests[0].idempotencyKey,entry.idempotencyKey);
 assert.equal(c.requests[0].body.catalogRevision,18);
 assert.equal(c.api.readInteraction().interactionId,interactionId);
 assert.throws(()=>c.api.prepareInteraction({...input,catalogRevision:19}),/solicitud de atención iniciada/);
});
test('503 de cotización identifica fulfillment sin atribuirlo a TU VERSO',async()=>{
 const c=client(req=>({requestId:req.requestId,status:503,data:{error:'Operación temporalmente no disponible'}}));
 await assert.rejects(()=>c.api.quoteDelivery({
  appId:'com.integrab2g.pollosb3',address:'Av. Ejemplo 123',district:'Santa Anita',useGps:false
 }),/No se pudo cotizar el delivery \(HTTP 503\)/);
 assert.deepEqual(c.requests.map(x=>x.operation),['DELIVERY_QUOTE']);
});
test('503 de disponibilidad identifica la consulta y no inicia interacción',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c';
 const c=client(req=>({requestId:req.requestId,status:503,data:{error:'Operación temporalmente no disponible'}}));
 await assert.rejects(()=>c.api.checkAgentAvailability({appId:'com.integrab2g.pollosb3',storeId}),
  /No se pudo consultar disponibilidad del asesor \(HTTP 503\)/);
 assert.deepEqual(c.requests.map(x=>x.operation),['AGENT_AVAILABILITY']);
});
test('error 503 conserva idempotencia para reintento, nunca aprueba por timeout',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c';
 const c=client(req=>({requestId:req.requestId,status:503,data:{error:'unavailable'}}));
 const entry=c.api.prepareInteraction({appId:'com.integrab2g.pollosb3',storeId,catalogRevision:18,
  items:[{productId,quantity:1}],address:'Av. Ejemplo 123',district:'Santa Anita'});
 await assert.rejects(()=>c.api.createInteraction(entry),/No se pudo crear la interacción \(HTTP 503\)/);
 assert.equal(c.api.readInteraction().status,'SUBMITTING');
 assert.equal(c.api.readInteraction().idempotencyKey,entry.idempotencyKey);
 await assert.rejects(()=>c.api.createInteraction(c.api.readInteraction()));
 assert.equal(c.requests[0].idempotencyKey,c.requests[1].idempotencyKey);
});
test('Android includes entered contact and delivery address, never untrusted prices or arbitrary message text',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c',interactionId='3a122e61-0434-4ec7-8e2e-435524d547a3';
 const c=client(req=>({requestId:req.requestId,status:201,data:{status:'PENDING',
  storeId,interactionId,externalReference:'mobile:deterministic'}}));
 const contact={firstName:'Ana',lastName:'Quispe',phone:'912345678',address:'Av. Ejemplo 123',
  district:'Santa Anita',reference:'Porton lateral',mode:'delivery'};
 const args={appId:'com.integrab2g.pollosb3',storeId,catalogRevision:18,
  items:[{productId,quantity:1}],address:contact.address,district:contact.district,customer:contact};
 const entry=c.api.prepareInteraction(args);
 assert.equal(JSON.stringify(entry.body.customer),JSON.stringify(contact));
 assert.ok(!('summary' in entry.body)&&!('total' in entry.body));
 await c.api.createInteraction(entry);
 assert.deepEqual(c.requests.map(x=>x.operation),['INTERACTION_CREATE']);
 assert.equal(c.requests[0].body.customer.phone,'912345678');
 assert.equal(c.requests[0].body.customer.reference,'Porton lateral');
 assert.equal(c.api.readInteraction().idempotencyKey,entry.idempotencyKey);
});
test('Android devuelve interactionId inmediatamente y entrega texto sin otra creación',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c'
 const interactionId='3a122e61-0434-4ec7-8e2e-435524d547a3'
 const messageId='1e96145a-90e3-4836-9e69-399312c89b11'
 const contact={firstName:'Ana',lastName:'Quispe',phone:'912345678',address:'Av. Ejemplo 123',
  district:'Santa Anita',reference:'Puerta',mode:'delivery'}
 const c=client(req=>req.operation==='INTERACTION_CREATE'?
  {requestId:req.requestId,status:201,data:{status:'PENDING',storeId,interactionId,externalReference:'mobile:ref'}}:
  {requestId:req.requestId,status:200,data:{interactionId,delivered:true,messageId}})
 const entry=c.api.prepareInteraction({appId:'com.integrab2g.pollosb3',storeId,catalogRevision:18,
  items:[{productId,quantity:1}],address:contact.address,district:contact.district,customer:contact})
 const created=await c.api.createInteraction(entry)
 assert.equal(created.interactionId,interactionId)
 assert.equal(c.api.readInteraction().interactionId,interactionId)
 assert.equal(c.api.readInteraction().messageDelivered,false)
 const sent=await c.api.sendInteractionMessage(entry)
 assert.equal(sent.delivered,true)
 assert.equal(c.api.readInteraction().messageDelivered,true)
 assert.deepEqual(c.requests.map(x=>x.operation),['INTERACTION_CREATE','INTERACTION_MESSAGE'])
 assert.equal(c.requests[1].accessKey,entry.idempotencyKey)
 assert.equal(c.requests[1].interactionId,interactionId)
 assert.ok(!('text' in c.requests[1].body))
 await c.api.sendInteractionMessage(entry)
 assert.equal(c.requests.length,2)
})
test('error temporal de envío del texto preserva interacción y reintenta sin recrear',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c'
 const interactionId='3a122e61-0434-4ec7-8e2e-435524d547a3'
 const messageId='1e96145a-90e3-4836-9e69-399312c89b11'
 const contact={firstName:'Ana',lastName:'Quispe',phone:'912345678',address:'Av. Ejemplo 123',
  district:'Santa Anita',reference:'Puerta',mode:'delivery'}
 let sent=0
 const c=client(req=>{
  if(req.operation==='INTERACTION_CREATE')
   return {requestId:req.requestId,status:201,data:{status:'PENDING',storeId,interactionId,externalReference:'mobile:ref'}}
  sent++
  if(sent===1)return {requestId:req.requestId,status:503,data:{error:'temporal'}}
  return {requestId:req.requestId,status:200,data:{interactionId,delivered:true,messageId}}
 })
 const entry=c.api.prepareInteraction({appId:'com.integrab2g.pollosb3',storeId,catalogRevision:18,
  items:[{productId,quantity:1}],address:contact.address,district:contact.district,customer:contact})
 await c.api.createInteraction(entry)
 await assert.rejects(()=>c.api.sendInteractionMessage(entry),/No se pudo confirmar el texto del pedido/)
 assert.equal(c.api.readInteraction().interactionId,interactionId)
 assert.equal(c.api.readInteraction().messageDelivered,false)
 await c.api.sendInteractionMessage(entry)
 assert.equal(c.api.readInteraction().messageDelivered,true)
 assert.deepEqual(c.requests.map(x=>x.operation),
  ['INTERACTION_CREATE','INTERACTION_MESSAGE','INTERACTION_MESSAGE'])
 assert.equal(c.requests[1].accessKey,c.requests[2].accessKey)
 assert.equal(c.requests[1].interactionId,c.requests[2].interactionId)
})
test('contact validation rejects fake phone, embedded control chars and inconsistent address',()=>{
 const id='f163f181-2c7e-40ec-87af-68f4675d059c';
 const base={appId:'com.integrab2g.pollosb3',storeId:id,catalogRevision:18,
  items:[{productId,quantity:1}],address:'Av. Ejemplo 123',district:'Santa Anita'};
 const contact={firstName:'Ana',lastName:'Quispe',phone:'912345678',
  address:base.address,district:base.district,reference:'',mode:'delivery'};
 for(const bad of [{...contact,phone:'12345'},{...contact,address:'Av. Falsa 123'},
  {...contact,mode:'pickup'},{...contact,reference:'X'.repeat(181)},
  {...contact,firstName:'Ana'+String.fromCharCode(10)+'aceptado'}]){
  const c=client()
  assert.throws(()=>c.api.prepareInteraction({...base,customer:bad}))
 }
});
test('la app móvil interpreta Acepto del agente y pasa a ACCEPTED sin decisiones del Administrador',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c';
 const interactionId='3a122e61-0434-4ec7-8e2e-435524d547a3';
 const messageId='1e96145a-90e3-4836-9e69-399312c89b11';
 const c=client(req=>req.operation==='INTERACTION_CREATE'?
  {requestId:req.requestId,status:201,data:{status:'PENDING',storeId,interactionId,externalReference:'mobile:ref'}}:
  {requestId:req.requestId,status:200,data:{interactionId,storeId,status:'PENDING',
   agentMessages:[{id:messageId,text:'Acepto',createdAt:'2026-11-21T18:30:00Z'}]}});
 const entry=c.api.prepareInteraction({appId:'com.integrab2g.pollosb3',storeId,catalogRevision:18,
  items:[{productId,quantity:1}],address:'Av. Ejemplo 123',district:'Santa Anita'});
 await c.api.createInteraction(entry);
 const result=await c.api.pollInteraction(entry);
 assert.equal(result.clientStatus,'ACCEPTED');
 assert.equal(result.decision,'ACCEPTED');
 assert.equal(result.agentMessageId,messageId);
 assert.equal(c.api.readInteraction().status,'ACCEPTED');
 assert.deepEqual(c.requests.map(x=>x.operation),['INTERACTION_CREATE','INTERACTION_STATUS']);
 assert.equal(c.requests[1].accessKey,entry.idempotencyKey);
});
test('la app interpreta texto exacto, primera decisión definitiva y estados remotos formales',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c';
 const interactionId='3a122e61-0434-4ec7-8e2e-435524d547a3';
 const uuid=id=>'00000000-0000-4000-8000-'+String(id).padStart(12,'0');
 const message=text=>({id:uuid(1),text,createdAt:'2026-11-21T18:30:00Z'});
 const samples=[
  {status:'PENDING',messages:[message('  ACEPTADO.  ')],decision:'ACCEPTED',clientStatus:'ACCEPTED'},
  {status:'PENDING',messages:[message('aceptada')],decision:'ACCEPTED',clientStatus:'ACCEPTED'},
  {status:'PENDING',messages:[message('ACEPTAR')],decision:'ACCEPTED',clientStatus:'ACCEPTED'},
  {status:'PENDING',messages:[message('RECHAZAR')],decision:'REJECTED',clientStatus:'REJECTED'},
  {status:'PENDING',messages:[message('no aceptar')],decision:null,clientStatus:'PENDING'},
  {status:'PENDING',messages:[message('rechazado')],decision:'REJECTED',clientStatus:'REJECTED'},
  {status:'PENDING',messages:[message('rechazada')],decision:'REJECTED',clientStatus:'REJECTED'},
  {status:'PENDING',messages:[message('no acepto')],decision:null,clientStatus:'PENDING'},
  {status:'PENDING',messages:[message('Hola')],decision:null,clientStatus:'PENDING'},
  {status:'PENDING',messages:[message('rechazado'),{...message('Acepto'),id:uuid(2)}],
   decision:'REJECTED',clientStatus:'REJECTED'},
  {status:'REJECTED',messages:[message('Acepto')],decision:'REJECTED',clientStatus:'REJECTED'},
  {status:'EXPIRED',messages:[message('Acepto')],decision:null,clientStatus:'EXPIRED'},
  {status:'ACCEPTED',messages:[],decision:null,clientStatus:'PENDING'},
  {status:'ACCEPTED',messages:[message('Acepto')],decision:'ACCEPTED',clientStatus:'ACCEPTED'},
  {status:'CANCELLED',messages:[message('Acepto')],decision:null,clientStatus:'CANCELLED'}
 ];
 for(const sample of samples){
  const c=client(req=>req.operation==='INTERACTION_CREATE'?
   {requestId:req.requestId,status:201,data:{interactionId,storeId,status:'PENDING',externalReference:'mobile:ref'}}:
   {requestId:req.requestId,status:200,data:{interactionId,storeId,status:sample.status,
    agentMessages:sample.messages}});
  const entry=c.api.prepareInteraction({appId:'com.integrab2g.pollosb3',storeId,catalogRevision:18,
   items:[{productId,quantity:1}],address:'Av. Ejemplo 123',district:'Santa Anita'});
  await c.api.createInteraction(entry);
  const result=await c.api.pollInteraction(entry);
  assert.equal(result.decision,sample.decision,JSON.stringify(sample));
  assert.equal(result.clientStatus,sample.clientStatus,JSON.stringify(sample));
 }
});

test('aceptación automática de interacción no aprueba un pedido sin texto del asesor',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c';
 const interactionId='3a122e61-0434-4ec7-8e2e-435524d547a3';
 let polls=0;
 const c=client(req=>{
  if(req.operation==='INTERACTION_CREATE')
   return {requestId:req.requestId,status:201,data:{interactionId,storeId,status:'ACCEPTED',externalReference:'mobile:ref'}};
  polls++;
  return {requestId:req.requestId,status:200,data:{interactionId,storeId,status:'ACCEPTED',
   messagesAvailable:polls>1,agentMessages:polls>1?
    [{id:'1e96145a-90e3-4836-9e69-399312c89b11',text:'aceptado',createdAt:'2026-11-21T18:30:00Z'}]:[]}};
 });
 const entry=c.api.prepareInteraction({appId:'com.integrab2g.pollosb3',storeId,catalogRevision:18,
  items:[{productId,quantity:1}],address:'Av. Ejemplo 123',district:'Santa Anita'});
 await c.api.createInteraction(entry);
 const first=await c.api.pollInteraction(entry);
 assert.equal(first.decision,null);
 assert.equal(first.clientStatus,'PENDING');
 const second=await c.api.pollInteraction(entry);
 assert.equal(second.decision,'ACCEPTED');
 assert.equal(second.clientStatus,'ACCEPTED');
 assert.deepEqual(c.requests.map(x=>x.operation),
  ['INTERACTION_CREATE','INTERACTION_STATUS','INTERACTION_STATUS']);
});
test('la app rechaza conversaciones falsas y respuestas malformadas',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c',interactionId='3a122e61-0434-4ec7-8e2e-435524d547a3';
 for(const payload of [
  {interactionId,storeId,status:'PENDING',agentMessages:null},
  {interactionId,storeId,status:'PENDING',agentMessages:[{id:'not-uuid',text:'Acepto',createdAt:'now'}]},
  {interactionId,storeId,status:'PENDING',agentMessages:[{id:interactionId,text:'Acepto'}]},
  {interactionId,storeId:'eeacc37f-7199-4b8f-bb1d-d1338e4f82f8',status:'PENDING',agentMessages:[]}
 ]){
  const c=client(req=>req.operation==='INTERACTION_CREATE'?
   {requestId:req.requestId,status:201,data:{interactionId,storeId,status:'PENDING',externalReference:'mobile:ref'}}:
   {requestId:req.requestId,status:200,data:payload});
  const entry=c.api.prepareInteraction({appId:'com.integrab2g.pollosb3',storeId,catalogRevision:18,
   items:[{productId,quantity:1}],address:'Av. Ejemplo 123',district:'Santa Anita'});
  await c.api.createInteraction(entry);
  await assert.rejects(()=>c.api.pollInteraction(entry),/no coincide/);
  assert.equal(c.api.readInteraction().status,'PENDING');
 }
});
test('cancelación notifica el carrito modificado sin generar un pago',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c',interactionId='3a122e61-0434-4ec7-8e2e-435524d547a3';
 const c=client(req=>req.operation==='INTERACTION_CREATE'?
  {requestId:req.requestId,status:201,data:{status:'PENDING',storeId,interactionId,externalReference:'mobile:ref'}}:
  {requestId:req.requestId,status:200,data:{interactionId,status:'CANCELLED'}});
 const entry=c.api.prepareInteraction({appId:'com.integrab2g.pollosb3',storeId,catalogRevision:18,
  items:[{productId,quantity:1}],address:'Av. Ejemplo 123',district:'Santa Anita'});
 await c.api.createInteraction(entry);
 const response=await c.api.cancelInteraction(entry);
 assert.equal(response.status,'CANCELLED');
 assert.equal(c.api.readInteraction().status,'CANCELLED');
 assert.deepEqual(c.requests.map(x=>x.operation),['INTERACTION_CREATE','INTERACTION_CANCEL']);
});
test('cotizar para sede aceptada rechaza una tarifa de otra sede',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c';
 const c=client(req=>({requestId:req.requestId,status:200,data:{revision:18,storeId:'eeacc37f-7199-4b8f-bb1d-d1338e4f82f8',mode:'delivery',deliveryFeePen:5,paymentMethods:['yape']}}));
 await assert.rejects(()=>c.api.quoteDelivery({appId:'com.integrab2g.pollosb3',storeId,address:'Av. Ejemplo 123',district:'Santa Anita'}),/cotización incompleta/);
});
test('private FCM device registration, payment deadline and cancellation use one authorized interaction',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c';
 const interactionId='3a122e61-0434-4ec7-8e2e-435524d547a3';
 const messageId='1e96145a-90e3-4836-9e69-399312c89b11';
 const expiresAt='2099-01-01T00:00:00Z',fcmToken='f'.repeat(160);
 const c=client(req=>{
  const data=(()=>{
   if(req.operation==='INTERACTION_CREATE')return {status:'PENDING',storeId,interactionId,externalReference:'mobile:ref'}
   if(req.operation==='INTERACTION_STATUS')return {status:'ACCEPTED',storeId,interactionId,agentMessages:[{id:messageId,text:'aceptado',createdAt:'2026-11-21T18:30:00Z'}]}
   if(req.operation==='INTERACTION_DEVICE')return {registered:true}
   if(req.operation==='INTERACTION_PAYMENT')return {status:'PAYMENT_PENDING',expiresAt,reminderCount:2}
   if(req.operation==='INTERACTION_PAYMENT_STATUS')return {status:'PAYMENT_PENDING',expiresAt}
   if(req.operation==='INTERACTION_CANCEL')return {status:'CANCELLED',interactionId}
   return null
  })();
  return {requestId:req.requestId,status:req.operation==='INTERACTION_CREATE'?201:200,data}
 });
 const entry=c.api.prepareInteraction({appId:'com.integrab2g.pollosb3',storeId,catalogRevision:18,
  items:[{productId,quantity:1}],address:'Av. Ejemplo 123',district:'Santa Anita'});
 await c.api.createInteraction(entry);
 const decision=await c.api.pollInteraction(entry);
 assert.equal(decision.decision,'ACCEPTED');
 assert.equal(entry.status,'ACCEPTED');
 await c.api.registerPersonalDevice(entry,fcmToken);
 const payment=await c.api.beginPaymentWait(entry);
 assert.equal(payment.expiresAt,expiresAt);
 assert.equal(c.api.readInteraction().paymentExpiresAt,expiresAt);
 const follow=await c.api.readPaymentWait(entry);
 assert.equal(follow.status,'PAYMENT_PENDING');
 await c.api.cancelInteraction(entry,{reason:'CANCEL'});
 assert.equal(entry.status,'CANCELLED');
 assert.deepEqual(c.requests.map(x=>x.operation),[
  'INTERACTION_CREATE','INTERACTION_STATUS','INTERACTION_DEVICE',
  'INTERACTION_PAYMENT','INTERACTION_PAYMENT_STATUS','INTERACTION_CANCEL']);
 assert.equal(c.requests[2].interactionId,interactionId);
 assert.equal(c.requests[2].accessKey,entry.idempotencyKey);
 assert.equal(c.requests[2].fcmToken,fcmToken);
 assert.equal(c.requests[5].reason,'CANCEL');
});
test('puente Android exclusivo para HTTPS rutas permitidas; scripts en orden',()=>{
  assert.ok(html.indexOf('order-availability.js')>0&&html.indexOf('order-availability.js')<html.indexOf('app.js'));
  assert.match(java,/@JavascriptInterface public void orderAvailabilityRequest\(String requestJson\)/);
  assert.match(java,/\/api\/v1\/mobile\/orders\/availability/);
  assert.match(java,/connection\.setInstanceFollowRedirects\(false\)/);
  assert.match(java,/connection\.setRequestProperty\("Authorization", "Bearer " \+ token\)/);
  assert.match(java,/connection\.setRequestProperty\("Idempotency-Key", key\)/);
  assert.match(checkoutSource,/\[data-availability-continue\],\[data-quote-retry\],\[data-change-fulfillment\],\[data-availability-retry\]/);
});

test('chat persiste únicamente hitos confirmados y respuestas verificadas sin reabrir la interacción',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c';
 const interactionId='3a122e61-0434-4ec7-8e2e-435524d547a3';
 const messageId='1e96145a-90e3-4836-9e69-399312c89b11';
 const adviserMessage='c9b7e9d9-a5ed-4261-92ac-f31f74ec545c';
 const c=client(req=>{
  const data={interactionId,storeId};
  if(req.operation==='INTERACTION_CREATE')return {
   requestId:req.requestId,status:201,data:{...data,status:'PENDING',externalReference:'mobile:test'}};
  if(req.operation==='INTERACTION_MESSAGE')return {
   requestId:req.requestId,status:200,data:{...data,delivered:true,messageId}};
  if(req.operation==='INTERACTION_STATUS')return {
   requestId:req.requestId,status:200,data:{...data,status:'PENDING',messagesAvailable:true,
    agentMessages:[{id:adviserMessage,text:'ACEPTADO',createdAt:'2026-11-22T04:00:00Z'}]}};
  throw Error('Operación no simulada '+req.operation);
 });
 const entry=c.api.prepareInteraction({appId:'com.integrab2g.pollosb3',storeId,catalogRevision:18,
  items:[{productId,quantity:1}],address:'Av. Ejemplo 123',district:'Santa Anita',
  customer:{firstName:'Ana',lastName:'Quispe',phone:'912345678',address:'Av. Ejemplo 123',
   district:'Santa Anita',reference:'Puerta lateral',mode:'delivery'}});
 assert.deepEqual(Array.from(entry.activity,x=>x.type),['prepared']);
 await c.api.createInteraction(entry);
 assert.deepEqual(Array.from(entry.activity,x=>x.type),['prepared','created']);
 await c.api.sendInteractionMessage(entry);
 assert.deepEqual(Array.from(entry.activity,x=>x.type),['prepared','created','detail_delivered']);
 await c.api.pollInteraction(entry);
 await c.api.pollInteraction(entry);
 assert.deepEqual(Array.from(entry.activity,x=>x.type),
  ['prepared','created','detail_delivered','accepted']);
 assert.equal(entry.agentMessages.length,1);
 assert.equal(entry.agentMessages[0].text,'ACEPTADO');
 const persisted=c.api.readInteraction();
 assert.equal(persisted.agentMessages[0].id,adviserMessage);
 assert.equal(persisted.activity.filter(x=>x.type==='accepted').length,1);
 assert.equal(c.requests.filter(x=>x.operation==='INTERACTION_CREATE').length,1);
});
