import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const app=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../app/src/main/assets/order-availability.js',import.meta.url),'utf8');
const start=app.indexOf('function paymentConfirmationForm(');
const end=app.indexOf('\nfunction paymentOptions(',start);
assert.ok(start>=0&&end>start,'Payment FORM builder must exist');
const builder=app.slice(start,end);

function build(interactionId='f1b44024-2d49-4d18-8910-098765432123'){
 const sandbox={
  st:{pay:'yape',cart:[{id:'p1',qty:2}],quote:{deliveryFeePen:62.33},
      profile:{address:'Avenida Nicolás Ayllón 9',district:'Ate Vitarte'}},
  product:()=>({name:'1 pollo + papas + cremas'}),
  window:{B3OrderAvailability:{readInteraction:()=>interactionId?{interactionId}:null}},
  orderPublicCode:o=>'B3-'+o.interactionId.replace(/-/g,'').slice(0,12).toUpperCase(),
  cash:n=>'S/ '+Number(n).toFixed(2),subtotal:()=>120,orderTotal:()=>182.33
 };
 vm.runInNewContext(builder+'\nthis.buildForm=paymentConfirmationForm;',sandbox);
 return sandbox.buildForm();
}

test('FORM places the order number above the product details as separate variables',()=>{
 const fields=build().form.fields;
 assert.deepEqual(Array.from(fields,f=>f.variable),[
  'N.º de pedido','Pedido','Subtotal','Delivery','Dirección','Total'
 ]);
 assert.equal(fields[0].value,'B3-F1B440242D49');
 assert.equal(fields[1].value,'1 pollo + papas + cremas x2');
 assert.equal(fields[2].value,'S/ 120.00');
 assert.equal(fields[3].value,'S/ 62.33');
 assert.equal(fields[5].value,'S/ 182.33');
 assert.doesNotMatch(fields[1].value,/B3-/);
});
test('FORM cannot be sent without an interaction reference',()=>{
 assert.throws(()=>build(null),/identificador confirmado/);
});
test('Android payment gate validates six ordered fields',()=>{
 assert.match(bridge,/form\.form\.fields\.length!==6/);
 assert.ok(bridge.includes('N.º de pedido|Pedido|Subtotal|Delivery|Dirección|Total'));
});
