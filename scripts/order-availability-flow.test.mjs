import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8');
function extract(name){
 const m=source.match(new RegExp('(async )?function '+name+'\\([^\\n]*\\)\\{[\\s\\S]*?\\n\\}'));
 assert.ok(m,'Missing Android function '+name);
 return m[0];
}
const storeId='f163f181-2c7e-40ec-87af-68f4675d059c';
const otherId='eeacc37f-7199-4b8f-bb1d-d1338e4f82f8';
const productId='a3639328-b908-4666-b91b-c25b5cc199ba';
const candidate={id:storeId,name:'Sede de prueba',active:true,delivery_enabled:true,consultOrderAvailability:true};
const quote={revision:18,storeId,storeName:candidate.name,mode:'delivery',deliveryFeePen:4.5,
 routeDistanceKm:1.8,paymentMethods:['yape','cash']};

function simulation({available=true,returnedQuote=quote,pending=false,otherStores=[],error=null}={}){
 const st={mode:'delivery',profile:{address:'Av. Ejemplo 123',district:'Santa Anita'},
  quote:null,store:'',stage:'availability'};
 const events=[];
 const entry={idempotencyKey:'2419e61f-017f-410d-91f7-005fa2a6815e',status:'PREPARED'};
 const api={
  readInteraction:()=>pending?{status:'PENDING',body:{storeId}}:null,
  checkAgentAvailability:async ({storeId:id})=>{events.push('AGENT:'+id);if(error)throw error;return {available}},
  quoteDelivery:async ()=>{events.push('QUOTE');return returnedQuote},
  prepareInteraction:input=>{events.push('PREPARE');assert.equal(input.storeId,storeId);return entry},
  createInteraction:async ()=>{events.push('CREATE');return {status:'PENDING',storeId,interactionId:otherId}}
 };
 const context={
  st,window:{B3OrderAvailability:api},APP_ID:'com.integrab2g.pollosb3',
  deliveryValidationGeneration:1,publishedRevision:18,
  deliveryAvailability:{status:'CHECKING'},deliveryLocation:{
   latitude:-12.05,longitude:-77.12,source:'address'},
  hasDeliveryDestination:()=>true,
  eligibleDeliveryCandidates:()=>[candidate,...otherStores].map(store=>({store,km:1})),
  storeAvailabilitySetting:store=>store.consultOrderAvailability,
  publishedOrderItems:()=>[{productId,quantity:1}],
  subtotal:()=>24.7,save:()=>events.push('SAVE'),render:()=>{},
  deliveryAddressKey:(a,b)=>a+'|'+b
 };
 vm.runInNewContext(extract('requestBackendOrderAvailability'),context);
 return {st,events,context,run:()=>context.requestBackendOrderAvailability({
  address:st.profile.address,district:st.profile.district,run:1,silent:false
 })};
}

test('primero disponibilidad, después cotización de la misma sede y luego interacción',async()=>{
 const s=simulation();
 assert.equal(await s.run(),false,'PENDING cannot authorize payment');
 assert.deepEqual(s.events.filter(x=>!x.startsWith('SAVE')),
  ['AGENT:'+storeId,'QUOTE','PREPARE','CREATE']);
 assert.equal(s.context.deliveryAvailability.status,'WAITING_APPROVAL');
 assert.equal(s.st.store,storeId);
 assert.equal(s.st.quote.deliveryFeePen,4.5);
 assert.equal(s.st.quote.quoteOrigin,'ADMIN_API_PRE_APPROVAL');
 assert.equal(s.st.quote.serverValidated,false);
 assert.equal(s.st.quote.estimatedTotalPen,29.2);
 assert.equal(s.st.quote.quoteRevision,18);
 assert.match(s.context.deliveryAvailability.message,/pendiente/);
});

test('sin capacidad no cotiza ni crea interacción en TU VERSO',async()=>{
 const s=simulation({available:false});
 assert.equal(await s.run(),false);
 assert.deepEqual(s.events,['AGENT:'+storeId]);
 assert.equal(s.context.deliveryAvailability.status,'UNAVAILABLE');
 assert.equal(s.st.quote,null);
});

test('la sede cotizada distinta se rechaza antes del POST, no salta de cola',async()=>{
 const s=simulation({returnedQuote:{...quote,storeId:otherId}});
 await assert.rejects(()=>s.run(),/sede diferente/);
 assert.deepEqual(s.events,['AGENT:'+storeId,'QUOTE']);
 assert.equal(s.st.quote,null);
 assert.equal(s.st.store,'');
});

test('cambio de revisión impide interacción y tarifa anterior',async()=>{
 const s=simulation({returnedQuote:{...quote,revision:19}});
 await assert.rejects(()=>s.run(),/catálogo cambió/);
 assert.deepEqual(s.events,['AGENT:'+storeId,'QUOTE']);
});

test('solicitud ya pendiente nunca vuelve a crear interacción',async()=>{
 const s=simulation({pending:true});
 assert.equal(await s.run(),false);
 assert.deepEqual(s.events,[]);
 assert.equal(s.context.deliveryAvailability.status,'WAITING_APPROVAL');
 assert.match(s.context.deliveryAvailability.message,/no enviaremos otra/);
});

test('si la consulta de TU VERSO falla, no se crea interacción',async()=>{
 const s=simulation({error:Error('TU VERSO inalcanzable')});
 await assert.rejects(()=>s.run(),/inalcanzable/);
 assert.deepEqual(s.events,['AGENT:'+storeId]);
});

test('jamás convierte PENDING en aprobación, pedido definitivo o cobro',()=>{
 assert.match(source,/return false; \/\/ No decision endpoint/);
 assert.match(source,/function finalizeDemoOrder\(\)/);
 assert.match(source,/demo:true/);
 assert.doesNotMatch(source,/fetch\([^\n]*\/api\/v1\/interactions/);
});
