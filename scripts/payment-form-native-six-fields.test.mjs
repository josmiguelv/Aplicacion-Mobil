import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const java=readFileSync(new URL('../app/src/main/java/com/integrab2g/pollosb3/MainActivity.java',import.meta.url),'utf8');
const js=readFileSync(new URL('../app/src/main/assets/order-availability.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8');
const start=java.indexOf('} else if ("INTERACTION_PAYMENT_FORM".equals(operation)) {');
const end=java.indexOf('} else if ("INTERACTION_MESSAGE".equals(operation)) {',start);
assert.ok(start>=0&&end>start,'Native payment FORM validator must be present');
const native=java.slice(start,end);

test('Native Android payment validator matches six JS FORM variables',()=>{
 const nativeLabels=native.match(/String\[\] required=\{([^}]+)\}/)?.[1];
 assert.ok(nativeLabels,'Expected six native required variables');
 const fields=Array.from(nativeLabels.matchAll(/"([^"]+)"/g),x=>x[1]);
 assert.deepEqual(fields,['N.º de pedido','Pedido','Subtotal','Delivery','Dirección','Total']);
 assert.match(native,/fields\.length\(\)!=required\.length/);
 assert.match(native,/for\(int i=0;i<required\.length;i\+\+\)/);
 assert.match(native,/approvalFormFields=required\.length/);
 assert.match(app,/variable:'N.º de pedido'/);
 assert.match(app,/fields\.length!==6/);
 assert.ok(js.includes(fields.join('|')),'JS must require same field sequence as Android');
});

test('Only pre-HTTP local rejection returns FORM to PREPARED',()=>{
 const sendStart=js.indexOf('async function sendPaymentConfirmation(entry)');
 const sendEnd=js.indexOf('async function pollPaymentConfirmation(entry)',sendStart);
 const send=js.slice(sendStart,sendEnd);
 assert.match(send,/error\?\.code==='LOCAL_CONTRACT_REJECTED'\?'PREPARED':'UNCERTAIN'/);
 assert.match(send,/confirmation\.status='UNCERTAIN';persistInteraction\(entry\)/);
 assert.match(app,/confirmation\?\.status==='PREPARED'\?'Reintentar envío del comprobante'/);
 assert.match(app,/if\(confirmation\?\.status==='PREPARED'\)screen\('paymentProofPreview'\)/);
});
