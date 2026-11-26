import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8');
const section=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
test('reservation never qualifies for immediate-order payment proof',()=>{
 const ready=section('function isPaymentFormReady(){','function paymentWaiting(){');
 assert.match(ready,/st\.scheduleMode!=='reservation'/);
});
test('reservation is refused BEFORE any upload, FORM prepare or HTTP send',()=>{
 const submit=section('async function submitPaymentForm(){','function schedulePaymentDecisionPoll(');
 const guard=submit.indexOf("if(st.scheduleMode==='reservation')");
 const upload=submit.indexOf('api.uploadPaymentReceipt(');
 const prepare=submit.indexOf('api.preparePaymentConfirmation(');
 const send=submit.indexOf('api.sendPaymentConfirmation(');
 assert.ok(guard>=0&&guard<upload&&upload<prepare&&prepare<send);
});
test('both payment navigation controls block reservation from immediate payment path',()=>{
 const start=section("if(b.hasAttribute('data-payment-start'))","if(b.hasAttribute('data-payment-confirm'))");
 const done=section("if(b.hasAttribute('data-payment-done'))","if(b.hasAttribute('data-payment-confirm'))");
 assert.match(start,/st\.scheduleMode==='reservation'/);
 assert.match(done,/st\.scheduleMode==='reservation'/);
});
test('immediate payment form itself remains guarded',()=>{
 assert.match(section('function paymentConfirmationForm(', 'function paymentOptions('),/requireImmediateOrderFlow\(\)/);
});
