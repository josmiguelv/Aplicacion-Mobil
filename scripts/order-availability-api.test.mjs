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
test('lectura y decisión por texto requieren la misma clave de interacción',async()=>{
 const storeId='f163f181-2c7e-40ec-87af-68f4675d059c';
 const interactionId='3a122e61-0434-4ec7-8e2e-435524d547a3';
 const c=client(req=>req.operation==='INTERACTION_CREATE'?
  {requestId:req.requestId,status:201,data:{status:'PENDING',storeId,interactionId,externalReference:'mobile:ref'}}:
  {requestId:req.requestId,status:200,data:{interactionId,storeId,status:'PENDING',decision:'ACCEPTED'}});
 const entry=c.api.prepareInteraction({appId:'com.integrab2g.pollosb3',storeId,catalogRevision:18,
  items:[{productId,quantity:1}],address:'Av. Ejemplo 123',district:'Santa Anita'});
 await c.api.createInteraction(entry);
 const decision=await c.api.pollInteraction(entry);
 assert.equal(decision.clientStatus,'ACCEPTED');
 assert.equal(c.api.readInteraction().status,'ACCEPTED');
 assert.deepEqual(c.requests.map(x=>x.operation),['INTERACTION_CREATE','INTERACTION_STATUS']);
 assert.equal(c.requests[1].accessKey,entry.idempotencyKey);
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
test('puente Android exclusivo para HTTPS rutas permitidas; scripts en orden',()=>{
  assert.ok(html.indexOf('order-availability.js')>0&&html.indexOf('order-availability.js')<html.indexOf('app.js'));
  assert.match(java,/@JavascriptInterface public void orderAvailabilityRequest\(String requestJson\)/);
  assert.match(java,/\/api\/v1\/mobile\/orders\/availability/);
  assert.match(java,/connection\.setInstanceFollowRedirects\(false\)/);
  assert.match(java,/connection\.setRequestProperty\("Authorization", "Bearer " \+ token\)/);
  assert.match(java,/connection\.setRequestProperty\("Idempotency-Key", key\)/);
  assert.match(checkoutSource,/\[data-availability-continue\],\[data-availability-retry\]/);
});
