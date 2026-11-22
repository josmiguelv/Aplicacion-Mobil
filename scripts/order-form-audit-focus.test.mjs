/* Auditoría focal Android -> Administrador: cuatro escenarios sintéticos.
 * NO realiza solicitudes de red ni crea interacciones en producción.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';

const js=readFileSync(new URL('../app/src/main/assets/order-availability.js',import.meta.url),'utf8');
const java=readFileSync(new URL('../app/src/main/java/com/integrab2g/pollosb3/MainActivity.java',import.meta.url),'utf8');
const uuid='3a122e61-0434-4ec7-8e2e-435524d547a3';
const store='f163f181-2c7e-40ec-87af-68f4675d059c';
const product='c82150dd-cad0-4139-9aaf-309c26e074b1';
const messageId='1e96145a-90e3-4836-9e69-399312c89b11';
const appId='com.integrab2g.pollosb3';
const form=()=>({
 title:'VALIDACIÓN DE PEDIDO',
 subtitle:'Confirmar disponibilidad para delivery',
 fields:[
  {variable:'Productos',value:'1 x Producto publicado — S/ 45.00'},
  {variable:'Subtotal',value:'S/ 45.00'},
  {variable:'Delivery',value:'Por calcular'},
  {variable:'Total final',value:'Pendiente de confirmación'},
  {variable:'Dirección y referencia',value:'Av. Ejemplo 123, Santa Anita — Referencia de prueba'}
 ]
});
const customer={
 firstName:'Nombre ficticio',lastName:'Apellido ficticio',phone:'912345678',
 address:'Av. Ejemplo 123',district:'Santa Anita',reference:'Referencia de prueba',mode:'delivery'
};
const input=(orderForm=form())=>({
 appId,storeId:store,catalogRevision:18,
 items:[{productId:product,quantity:1}],address:customer.address,district:customer.district,
 customer,orderForm
});
const memory=()=>{const map=new Map();return {
 getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),
 removeItem:k=>map.delete(k)
}};
function harness(responder){
 const requests=[],traces=[];
 const window={crypto:webcrypto,Uint8Array,btoa,
  localStorage:memory(),sessionStorage:memory(),setTimeout,clearTimeout};
 window.AndroidBridge={
  orderFormDiagnostic:(...args)=>traces.push(args),
  orderAvailabilityRequest:(serialized)=>{
   const request=JSON.parse(serialized);
   requests.push(request);
   queueMicrotask(()=>window.b3OrderAvailabilityNativeResponse(JSON.stringify(responder(request))));
  }
 };
 runInNewContext(js,{window,Uint8Array,JSON,Map,Promise,Error,Date,Number,Set});
 return {api:window.B3OrderAvailability,requests,traces};
}
const accept=req=>({requestId:req.requestId,status:200,
 data:{interactionId:uuid,messageId,delivered:true,type:'FORM'}});
const create=req=>({requestId:req.requestId,status:201,
 data:{interactionId:uuid,status:'PENDING',storeId:store,externalReference:'mobile:synthetic'}});

test('01 - FORM válido, cinco variables, dos operaciones y cabeceras nativas',async()=>{
 const c=harness(req=>req.operation==='INTERACTION_CREATE'?create(req):accept(req));
 const entry=c.api.prepareInteraction(input());
 await c.api.createInteraction(entry);
 const result=await c.api.sendInteractionMessage(entry);
 assert.equal(result.type,'FORM');
 assert.deepEqual(c.requests.map(r=>r.operation),['INTERACTION_CREATE','INTERACTION_MESSAGE']);
 assert.deepEqual(JSON.parse(JSON.stringify(c.requests[1].body)),{type:'FORM',appId,storeId:store,form:form()});
 assert.equal(c.requests[1].body.form.fields.length,5);
 for(const forbidden of ['text','items','customer','catalogRevision'])
  assert.equal(forbidden in c.requests[1].body,false);
 assert.equal(c.requests[1].accessKey,entry.idempotencyKey);
 assert.equal(c.requests[1].idempotencyKey,entry.messageIdempotencyKey);
 assert.notEqual(entry.idempotencyKey,entry.messageIdempotencyKey);
 assert.match(java,/path = "\/api\/v1\/mobile\/interactions\/" \+ interactionId \+ "\/message"/);
 assert.match(java,/connection\.setRequestProperty\("Content-Type", "application\/json"\)/);
 assert.match(java,/connection\.setRequestProperty\("X-Order-Access-Key", accessKey\)/);
 assert.match(java,/connection\.setRequestProperty\("Idempotency-Key", key\)/);
 assert.ok(c.traces.some(t=>t[0]==='JS_BUILD'&&t[1]===5&&t[3]==='FORM'));
 assert.ok(c.traces.some(t=>t[0]==='JS_RESPONSE'&&t[2]===200&&t[3]==='FORM'));
});
test('02 - FORM con seis variables se rechaza antes de cualquier petición HTTP',()=>{
 const c=harness(()=>{throw Error('No debe llamarse al puente')});
 const six=form();
 six.fields.push({variable:'Nota adicional',value:'No permitido'});
 assert.throws(()=>c.api.prepareInteraction(input(six)),/exactamente cinco variables/);
 assert.equal(c.requests.length,0);
 assert.match(java,/fields == null \|\| fields\.length\(\) != 5/);
});
test('03 - TEXT no se convierte en FORM ni se confirma como entrega de formulario',async()=>{
 const c=harness(req=>req.operation==='INTERACTION_CREATE'?create(req):{
  requestId:req.requestId,status:200,
  data:{interactionId:uuid,messageId,delivered:true,type:'TEXT'}
 });
 const entry=c.api.prepareInteraction(input());
 await c.api.createInteraction(entry);
 assert.equal('type' in c.requests[0].body,false,'CREATE conserva el contrato original, separado de FORM');
 await assert.rejects(()=>c.api.sendInteractionMessage(entry),/no certificó type FORM/);
 assert.equal(entry.messageDelivered,false);
 assert.equal(entry.messageDeliveryBlocked,true);
 assert.equal(c.requests[1].body.type,'FORM');
 assert.match(java,/!"FORM"\.equals\(payload\.optString\("type", ""\)\)/,
  'El puente nativo no convierte un mensaje TEXT en FORM');
});
test('04 - Reintento del mismo FORM usa la misma clave independiente',async()=>{
 let attempts=0;
 const c=harness(req=>{
  if(req.operation==='INTERACTION_CREATE')return create(req);
  attempts++;
  return attempts===1?{requestId:req.requestId,status:429,data:{error:'Demasiadas solicitudes'}}:accept(req);
 });
 const entry=c.api.prepareInteraction(input());
 await c.api.createInteraction(entry);
 await assert.rejects(()=>c.api.sendInteractionMessage(entry),/429/);
 assert.equal(entry.messageDelivered,false);
 await c.api.sendInteractionMessage(c.api.readInteraction());
 assert.deepEqual(c.requests.map(r=>r.operation),
  ['INTERACTION_CREATE','INTERACTION_MESSAGE','INTERACTION_MESSAGE']);
 assert.equal(c.requests[1].idempotencyKey,c.requests[2].idempotencyKey);
 assert.equal(c.requests[1].idempotencyKey,entry.messageIdempotencyKey);
 assert.notEqual(c.requests[1].idempotencyKey,c.requests[0].idempotencyKey);
 assert.equal(JSON.stringify(c.requests[1].body),JSON.stringify(c.requests[2].body));
 assert.equal(c.requests[1].interactionId,c.requests[2].interactionId);
});
