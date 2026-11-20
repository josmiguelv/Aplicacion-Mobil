import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8');
function extract(name){
 const m=source.match(new RegExp('(async )?function '+name+'\\([^\\n]*\\)\\{[\\s\\S]*?\\n\\}'));
 assert.ok(m,'Missing app function '+name);
 return m[0];
}
const sid='f163f181-2c7e-40ec-87af-68f4675d059c';
const vid='3a122e61-0434-4ec7-8e2e-435524d547a3';
const approved={validationId:vid,status:'READY_FOR_PAYMENT',
 subtotal:24.7,currency:'PEN',deliveryFee:4.5,total:29.2,
 store:{id:sid,name:'Sede de prueba'},paymentMethods:['yape','cash'],
 routeDistanceKm:1.8};
function simulation(states){
 const st={mode:'delivery',profile:{address:'Av. Ejemplo 123',district:'Santa Anita'},
  quote:null,store:''};
 const info={calls:[],clears:0,saves:0,renders:0};
 const entry={validationId:vid};
 let i=0;
 const context={
  st,deliveryValidationGeneration:1,publishedRevision:18,deliveryLocation:null,
  APP_ID:'com.integrab2g.pollosb3',shops:[{id:sid,active:true,delivery_enabled:true}],
  deliveryAvailability:{status:'CHECKING'},
  window:{B3OrderAvailability:{
   prepare:input=>{info.calls.push({kind:'PREPARE',input});return entry},
   execute:async e=>{info.calls.push({kind:'GET',validationId:e.validationId});return states[Math.min(i++,states.length-1)]},
   clear:()=>info.clears++,
   read:()=>entry
  }},
  publishedOrderItems:()=>[{productId:'a3639328-b908-4666-b91b-c25b5cc199ba',quantity:1}],
  hasDeliveryDestination:()=>false,
  deliveryAddressKey:(a,b)=>a+'|'+b,
  subtotal:()=>24.7,
  save:()=>info.saves++,
  render:()=>info.renders++,
  setTimeout:callback=>{callback();return 1}
 };
 for(const name of ['applyBackendQuote','requestBackendOrderAvailability'])
  vm.runInNewContext(extract(name),context);
 return {context,st,info,run:()=>context.requestBackendOrderAvailability({
  address:st.profile.address,district:st.profile.district,run:1,silent:false
 })};
}
test('READY_FOR_PAYMENT usa solo importe, sede, ruta y métodos provenientes del servidor',async()=>{
 const s=simulation([approved]);
 assert.equal(await s.run(),true);
 assert.equal(s.st.store,sid);
 assert.equal(s.st.quote.serverValidated,true);
 assert.equal(s.st.quote.quoteOrigin,'ADMIN_API');
 assert.equal(s.st.quote.serverSubtotalPen,24.7);
 assert.equal(s.st.quote.deliveryFeePen,4.5);
 assert.equal(s.st.quote.serverTotalPen,29.2);
 assert.equal(s.st.quote.routeDistanceKm,1.8);
 assert.deepEqual(Array.from(s.st.quote.paymentMethods),['yape','cash']);
 assert.equal(s.context.deliveryAvailability.status,'READY');
 assert.equal(s.info.calls.filter(x=>x.kind==='PREPARE').length,1);
});
test('WAITING_APPROVAL y CREATE_UNCERTAIN reconsultan la misma validación sin crear otro pedido',async()=>{
 const s=simulation([
  {validationId:vid,status:'WAITING_APPROVAL'},
  {validationId:vid,status:'CREATE_UNCERTAIN'},
  approved
 ]);
 assert.equal(await s.run(),true);
 assert.equal(s.info.calls.filter(x=>x.kind==='GET').length,3);
 assert.equal(s.info.calls.filter(x=>x.kind==='PREPARE').length,1);
 assert.equal(s.info.clears,0);
});
for(const status of ['UNAVAILABLE','VALIDATION_ERROR','CANCELLED']){
 test(status+' bloquea checkout y descarta la validación terminal',async()=>{
  const s=simulation([{validationId:vid,status}]);
  assert.equal(await s.run(),false);
  assert.equal(s.st.quote,null);
  assert.equal(s.st.store,'');
  assert.equal(s.info.clears,1);
  assert.ok(['UNAVAILABLE','ERROR'].includes(s.context.deliveryAvailability.status));
 });
}
test('espera limitada preserva misma solicitud para recuperar manualmente',async()=>{
 const s=simulation([{validationId:vid,status:'WAITING_APPROVAL'}]);
 assert.equal(await s.run(),false);
 assert.equal(s.info.calls.filter(x=>x.kind==='GET').length,18);
 assert.equal(s.info.calls.filter(x=>x.kind==='PREPARE').length,1);
 assert.equal(s.info.clears,0);
 assert.match(s.context.deliveryAvailability.message,/Volver a comprobar/);
});
test('rechaza incoherencia de subtotal/total sin permitir pagar ni inventar tarifa',async()=>{
 const s=simulation([{...approved,total:40}]);
 await assert.rejects(()=>s.run(),/no coincide/);
 assert.equal(s.st.quote,null);
 assert.equal(s.st.store,'');
});
test('nunca registra un pedido real desde esta validación',()=>{
 assert.match(source,/function finalizeDemoOrder\(\)/);
 assert.match(source,/demo:true/);
 assert.doesNotMatch(source,/fetch\([^\n]*\/api\/v1\/interactions/);
});
