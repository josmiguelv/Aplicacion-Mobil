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
  assert.match(java,/connection\.setRequestMethod\("HEALTH"\.equals\(operation\) \|\| "HEALTH_LIVE"\.equals\(operation\) \? "GET" : operation\)/);
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
  assert.match(checkoutSource,/Both false and true always use the same server-authoritative validation contract/);
  assert.doesNotMatch(checkoutSource,/const quote=quoteForDeliveryCandidate\(first\);/);
  assert.match(checkoutSource,/serverValidated:true/);
  assert.match(checkoutSource,/READY_FOR_PAYMENT/);
  assert.match(checkoutSource,/UNAVAILABLE/);
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
