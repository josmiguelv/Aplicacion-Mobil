/* Auditoría focal Android -> Administrador: contrato FORM y UUID Java real.
 * NO realiza solicitudes de red ni crea interacciones en producción.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
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
 const clock={now:Date.now()};
 class VirtualDate extends Date {static now(){return clock.now;}}
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
 runInNewContext(js,{window,Uint8Array,JSON,Map,Promise,Error,Date:VirtualDate,Number,Set});
 return {api:window.B3OrderAvailability,requests,traces,
  now:()=>clock.now,advance:ms=>{clock.now+=ms}};
}
const accept=req=>({requestId:req.requestId,status:200,
 data:{interactionId:uuid,messageId,delivered:true,type:'FORM'}});
const create=req=>({requestId:req.requestId,status:201,
 data:{interactionId:uuid,status:'PENDING',storeId:store,externalReference:'mobile:synthetic'}});

test('01 - FORM válido, tres variables, dos operaciones y cabeceras nativas',async()=>{
 const c=harness(req=>req.operation==='INTERACTION_CREATE'?create(req):accept(req));
 const entry=c.api.prepareInteraction(input());
 await c.api.createInteraction(entry);
 const result=await c.api.sendInteractionMessage(entry);
 assert.equal(result.type,'FORM');
 assert.deepEqual(c.requests.map(r=>r.operation),['INTERACTION_CREATE','INTERACTION_MESSAGE']);
 assert.deepEqual(JSON.parse(JSON.stringify(c.requests[1].body)),{type:'FORM',appId,storeId:store,form:form()});
 assert.equal(c.requests[1].body.form.fields.length,3);
 assert.deepEqual(c.requests[1].body.form.fields.map(x=>x.variable),
   ['Productos','Subtotal','Dirección y referencia']);
 assert.ok(!JSON.stringify(c.requests[1].body).includes('Por calcular'));
 assert.ok(!JSON.stringify(c.requests[1].body).includes('Pendiente de confirmación'));
 for(const forbidden of ['text','items','customer','catalogRevision'])
  assert.equal(forbidden in c.requests[1].body,false);
 assert.equal(c.requests[1].accessKey,entry.idempotencyKey);
 assert.equal(c.requests[1].idempotencyKey,entry.messageIdempotencyKey);
 assert.notEqual(entry.idempotencyKey,entry.messageIdempotencyKey);
 assert.match(java,/path = "\/api\/v1\/mobile\/interactions\/" \+ interactionId \+ "\/message"/);
 assert.match(java,/connection\.setRequestProperty\("Content-Type", "application\/json"\)/);
 assert.match(java,/connection\.setRequestProperty\("X-Order-Access-Key", accessKey\)/);
 assert.match(java,/connection\.setRequestProperty\("Idempotency-Key", key\)/);
 assert.ok(c.traces.some(t=>t[0]==='JS_BUILD'&&t[1]===3&&t[3]==='FORM'));
 assert.ok(c.traces.some(t=>t[0]==='JS_RESPONSE'&&t[1]===3&&t[2]===200&&t[3]==='FORM'));
});
test('02 - FORM con variable adicional se rechaza antes de cualquier petición HTTP',()=>{
 const c=harness(()=>{throw Error('No debe llamarse al puente')});
 const four=form();
 four.fields.push({variable:'Delivery',value:'Por calcular'});
 assert.throws(()=>c.api.prepareInteraction(input(four)),/exactamente tres variables/);
 assert.equal(c.requests.length,0);
 assert.match(java,/fields == null \|\| fields\.length\(\) != 3/);
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
 const waiting=c.api.readInteraction();
 assert.equal(waiting.message429Attempts,1);
 assert.ok(waiting.messageRetryAt>c.now()+28000);
 const sentBefore=c.requests.length;
 await assert.rejects(()=>c.api.sendInteractionMessage(waiting),/reintento programado/);
 assert.equal(c.requests.length,sentBefore,'No new POST during cooldown');
 // Simulate the expiration of the persisted cooldown without waiting 30 seconds.
 c.advance(31000);
 await c.api.sendInteractionMessage(c.api.readInteraction());
 assert.equal(c.api.readInteraction().messageDelivered,true);
 assert.deepEqual(c.requests.map(r=>r.operation),
  ['INTERACTION_CREATE','INTERACTION_MESSAGE','INTERACTION_MESSAGE']);
 assert.equal(c.requests[1].idempotencyKey,c.requests[2].idempotencyKey);
 assert.equal(c.requests[1].idempotencyKey,entry.messageIdempotencyKey);
 assert.notEqual(c.requests[1].idempotencyKey,c.requests[0].idempotencyKey);
 assert.equal(JSON.stringify(c.requests[1].body),JSON.stringify(c.requests[2].body));
 assert.equal(c.requests[1].interactionId,c.requests[2].interactionId);
});

test('05 - no duplica FORM si checkout y polling solicitan envío simultáneo',async()=>{
 const c=harness(req=>req.operation==='INTERACTION_CREATE'?create(req):accept(req));
 const entry=c.api.prepareInteraction(input());
 await c.api.createInteraction(entry);
 const [a,b]=await Promise.all([
  c.api.sendInteractionMessage(entry),
  c.api.sendInteractionMessage(c.api.readInteraction())
 ]);
 assert.equal(a.type,'FORM');
 assert.equal(b.type,'FORM');
 assert.deepEqual(c.requests.map(x=>x.operation),['INTERACTION_CREATE','INTERACTION_MESSAGE']);
 assert.equal(c.api.readInteraction().messageDelivered,true);
});
test('06 - segundo HTTP 429 duplica el tiempo de espera, sin cambiar la clave',async()=>{
 let tries=0;
 const c=harness(req=>{
  if(req.operation==='INTERACTION_CREATE')return create(req);
  tries++;return {requestId:req.requestId,status:429,data:{error:'Límite temporal'}};
 });
 const entry=c.api.prepareInteraction(input());
 await c.api.createInteraction(entry);
 await assert.rejects(()=>c.api.sendInteractionMessage(entry),/429/);
 const first=c.api.readInteraction();
 assert.equal(first.message429Attempts,1);
 assert.ok(first.messageRetryAt-c.now()>28000);
 c.advance(31000);
 await assert.rejects(()=>c.api.sendInteractionMessage(first),/429/);
 const second=c.api.readInteraction();
 assert.equal(second.message429Attempts,2);
 assert.ok(second.messageRetryAt-c.now()>58000);
 assert.equal(c.requests[1].idempotencyKey,c.requests[2].idempotencyKey);
 assert.equal(c.requests.filter(x=>x.operation==='INTERACTION_CREATE').length,1);
});

test('07 - lectura de estado desactualizada conserva el 429 persistido',async()=>{
 const c=harness(req=>{
  if(req.operation==='INTERACTION_CREATE')return create(req);
  if(req.operation==='INTERACTION_STATUS')
   return {requestId:req.requestId,status:200,data:{
    interactionId:uuid,storeId:store,status:'PENDING',agentMessages:[],messagesAvailable:false
   }};
  return {requestId:req.requestId,status:429,data:{error:'Rate limited'}};
 });
 const entry=c.api.prepareInteraction(input());
 await c.api.createInteraction(entry);
 const stale=c.api.readInteraction();
 await assert.rejects(()=>c.api.sendInteractionMessage(entry),/HTTP 429/);
 const before=c.api.readInteraction();
 assert.equal(before.message429Attempts,1);
 await c.api.pollInteraction(stale);
 const after=c.api.readInteraction();
 assert.equal(after.message429Attempts,1);
 assert.equal(after.messageRetryAt,before.messageRetryAt);
 assert.equal(after.messageIdempotencyKey,before.messageIdempotencyKey);
 assert.deepEqual(c.requests.map(r=>r.operation),[
  'INTERACTION_CREATE','INTERACTION_MESSAGE','INTERACTION_STATUS'
 ]);
});


test('08 - JVM ejecuta regex UUID reales de INTERACTION_MESSAGE con claves validas e invalidas',()=>{
 const native=java.split('} else if ("INTERACTION_MESSAGE".equals(operation)) {')[1]
   ?.split('} else if ("INTERACTION_STATUS".equals(operation)')[0];
 assert.ok(native,'No se encontro la rama nativa INTERACTION_MESSAGE');
 function javaPattern(name){
  const line=native.split('\n').find(s=>s.includes('!'+name+'.matches("'));
  const found=line?.match(/\.matches\("([^"]+)"\)/);
  assert.ok(found,'No se encontro validacion Java de '+name);
  return found[1];
 }
 const keyPattern=javaPattern('key');
 const interactionPattern=javaPattern('interactionId');
 const accessPattern=javaPattern('accessKey');
 const probe=[
  'public final class B3JavaUuidProbe {',
  ' static final String KEY = '+JSON.stringify(keyPattern)+';',
  ' static final String INTERACTION = '+JSON.stringify(interactionPattern)+';',
  ' static final String ACCESS = '+JSON.stringify(accessPattern)+';',
  ' static boolean accepts(String interactionId,String accessKey,String key){',
  '  return key.matches(KEY) && !key.equalsIgnoreCase(accessKey)',
  '   && interactionId.matches(INTERACTION) && accessKey.matches(ACCESS);',
  ' }',
  ' public static void main(String[] args){',
  '  String interaction="3a122e61-0434-4ec7-8e2e-435524d547a3";',
  '  String access="f163f181-2c7e-40ec-87af-68f4675d059c";',
  '  String key="1e96145a-90e3-4836-9e69-399312c89b11";',
  '  if(!accepts(interaction,access,key))throw new AssertionError("UUID valido rechazado");',
  '  if(!accepts(interaction.toUpperCase(),access,key.toUpperCase()))',
  '   throw new AssertionError("UUID mayuscula valido rechazado");',
  '  if(accepts(interaction,access,"1e96145a-90e3-4836-399312c89b11"))',
  '   throw new AssertionError("UUID con cuatro grupos aceptado");',
  '  if(accepts(interaction,access,"no-es-uuid"))',
  '   throw new AssertionError("UUID invalido aceptado");',
  '  if(accepts(interaction,access,access))',
  '   throw new AssertionError("Clave FORM igual a CREATE aceptada");',
  '  if(accepts("no-es-uuid",access,key))',
  '   throw new AssertionError("interactionId invalido aceptado");',
  '  if(accepts(interaction,"no-es-uuid",key))',
  '   throw new AssertionError("accessKey invalido aceptado");',
  '  System.out.println("JAVA_UUID_PASS");',
  ' }',
  '}'
 ].join('\n');
 const dir=mkdtempSync(join(tmpdir(),'b3-form-java-'));
 try {
  const source=join(dir,'B3JavaUuidProbe.java');
  writeFileSync(source,probe,'utf8');
  const compile=spawnSync('javac',['-encoding','UTF-8',source],{encoding:'utf8'});
  assert.equal(compile.status,0,'javac fallo: '+compile.stderr);
  const run=spawnSync('java',['-cp',dir,'B3JavaUuidProbe'],{encoding:'utf8'});
  assert.equal(run.status,0,'JVM rechazo contrato: '+run.stderr);
  assert.match(run.stdout,/JAVA_UUID_PASS/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('09 - FORM supera 500/80/180/350: rechazo local sin crear interaccion ni truncar',()=>{
 const cases=[
  f=>{f.fields[0].value='X'.repeat(501);},
  f=>{f.fields[2].value='Y'.repeat(501);},
  f=>{f.fields[1].variable='Z'.repeat(81);},
  f=>{f.title='T'.repeat(181);},
  f=>{f.subtitle='S'.repeat(351);}
 ];
 for(const mutate of cases){
  const c=harness(()=>{throw Error('No debe consultarse red')});
  const bad=form();
  mutate(bad);
  assert.throws(()=>c.api.prepareInteraction(input(bad)),/FORM|tres variables/);
  assert.equal(c.requests.length,0,'Un FORM invalido jamas debe llamar al puente');
 }
 assert.match(java,/form\.optString\("title", ""\)\.length\(\) > 180/);
 assert.match(java,/form\.optString\("subtitle", ""\)\.length\(\) > 350/);
 assert.match(java,/field\.optString\("variable", ""\)\.length\(\) > 80/);
 assert.match(java,/field\.optString\("value", ""\)\.length\(\) > 500/);
});

test('10 - construccion real app.js rechaza 501 caracteres de Productos antes de CREATE',()=>{
 const source=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8');
 const fn=source.match(/function deliveryOrderTicketForm\(address,district\)\{[\s\S]*?\n\}/);
 assert.ok(fn,'Falta constructor real del ticket');
 let productName='Producto sintetico';
 const context={
  publishedOrderItems:()=>[{productId:'synthetic',quantity:1}],
  product:()=>({isPublished:true,disabled:false,name:productName,price:45}),
  subtotal:()=>45,cash:value=>'S/ '+value.toFixed(2),
  st:{profile:{reference:''}}
 };
 runInNewContext(fn[0],context);
 assert.equal(context.deliveryOrderTicketForm('Av. Ejemplo 123','Santa Anita').fields.length,3);
 productName='X'.repeat(501);
 assert.throws(()=>context.deliveryOrderTicketForm('Av. Ejemplo 123','Santa Anita'),
   /500 caracteres/, 'No se debe truncar informacion comercial');
});
