import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8');
const between=(from,to)=>{
 const start=source.indexOf(from);
 assert.ok(start>=0,'missing '+from);
 const end=source.indexOf(to,start+from.length);
 assert.ok(end>start,'missing '+to);
 return source.slice(start,end);
};
test('green pill always reflects persisted explicit mode and opens selector',()=>{
 const header=between('function fulfillmentHeader(){','function fulfillmentOverlay(){');
 assert.match(header,/modeLabel=st\.mode==='delivery'\?'Delivery':st\.mode==='pickup'\?'Recojo en tienda'/);
 assert.match(header,/b3-fulfillment-pill/);
 assert.match(header,/data-open-fulfillment="1"/);
 assert.match(source,/if\(b\.hasAttribute\('data-open-fulfillment'\)\)\{fulfillmentModal='choose'/);
});
test('a confirmed-payment new order or rejected-order reset preserves last fulfillment mode',()=>{
 for(const [start,end] of [
  ['function beginNewCheckoutAfterRejection(){','function beginNewOrderAfterPayment(){'],
  ['function beginNewOrderAfterPayment(){','function nav(tab){']
 ]){
  const body=between(start,end);
  assert.doesNotMatch(body,/st\.mode\s*=/);
  assert.match(body,/save\(\)/);
 }
});
test('editing or selecting an address never silently changes Pickup to Delivery',()=>{
 for(const [start,end] of [
  ['function pickSavedAddress(','function savedAddressesHtml('],
  ["if(b.hasAttribute('data-modal-save-delivery'))","if(b.dataset.modalPickstore)"],
  ["if(b.hasAttribute('data-address-next'))","if(b.hasAttribute('data-identity-next'))"]
 ]){
  const body=between(start,end);
  assert.doesNotMatch(body,/st\.mode\s*=\s*'delivery'/);
 }
});
test('only explicit fulfillment buttons assign a persisted mode during interaction',()=>{
 const assignments=[...source.matchAll(/st\.mode\s*=\s*(?:'delivery'|'pickup'|next|b\.dataset\.mode)/g)]
  .map(m=>({value:m[0],at:m.index,context:source.slice(Math.max(0,m.index-650),m.index+120)}));
 assert.ok(assignments.length>=4);
 for(const a of assignments){
  const c=a.context;
  assert.ok(
   c.includes("if(b.dataset.homeStoreMode)")||
   c.includes('if(b.dataset.modalMode)')||
   c.includes('if(b.dataset.mode)')||
   c.includes("if(b.hasAttribute('data-availability-pickup'))")||
   c.includes("function beginNewCheckoutAfterRejection")===false&&a.value.includes("'pickup'")&&c.includes('if(mode==='),
   'unexpected fulfillment assignment: '+a.value+' at '+a.at
  );
 }
});
