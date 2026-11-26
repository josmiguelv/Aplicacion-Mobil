import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const availabilitySource=readFileSync(new URL('../app/src/main/assets/order-availability.js',import.meta.url),'utf8');
const appSource=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8');
const paidKey='b3-mobile-interaction-request-v1';
const archiveKey='b3-mobile-paid-interactions-v1';
const firstId='91d08fe9-f278-4a11-8c22-0123456789ab';
const nextId='72f94051-a325-4abe-a8d7-24a167c3213c';
const storeId='7b247e26-e80b-4d9f-81ef-123456789abc';
const key='e9a89cad-bbbe-492f-9c35-456789abcdea';
const agentId='c8bdedb0-c722-4b3e-b3c5-456789abcdef';
function storage(){
 const data=new Map();
 return {getItem:k=>data.has(k)?data.get(k):null,
  setItem:(k,v)=>{data.set(k,String(v))},removeItem:k=>{data.delete(k)}};
}
function fixture(){
 const localStorage=storage(),sessionStorage=storage();
 const window={localStorage,sessionStorage,crypto:webcrypto,
  btoa:s=>Buffer.from(s,'binary').toString('base64'),
  setTimeout,clearTimeout};
 runInNewContext(availabilitySource,{window,console,Uint8Array,Buffer,setTimeout,clearTimeout});
 const api=window.B3OrderAvailability;
 const paid={interactionId:firstId,idempotencyKey:key,createdAt:Date.now(),
  fingerprint:'order-one',status:'ACCEPTED',
  body:{appId:'com.integrab2g.pollosb3',storeId,items:[]},
  paymentConfirmation:{status:'ACCEPTED',agentMessageId:agentId}};
 const pending={...paid,interactionId:nextId,idempotencyKey:'8d3ce713-7502-4daa-82f2-0023456789ab',
  status:'PENDING',fingerprint:'order-two',paymentConfirmation:null};
 return {api,window,localStorage,paid,pending};
}
test('an accepted and indexed order can be archived while its status and access key remain available',()=>{
 const {api,localStorage,paid,pending}=fixture();
 localStorage.setItem(paidKey,JSON.stringify(paid));
 assert.equal(api.archiveConfirmedInteraction(firstId),true);
 assert.equal(api.readInteraction(),null);
 assert.equal(api.readOrderInteraction(firstId)?.idempotencyKey,key);
 assert.ok(JSON.parse(localStorage.getItem(archiveKey))[firstId]);
 localStorage.setItem(paidKey,JSON.stringify(pending));
 assert.equal(api.readInteraction()?.interactionId,nextId);
 assert.equal(api.readOrderInteraction(firstId)?.paymentConfirmation?.status,'ACCEPTED');
 assert.equal(api.archiveConfirmedInteraction(nextId),false);
 assert.equal(api.readInteraction()?.interactionId,nextId);
});
test('a pending or only order-accepted request must never be released as paid',()=>{
 const {api,localStorage,paid}=fixture();
 for(const confirmation of [null,{status:'SENT'},{status:'ACCEPTED'}]){
  const value={...paid,paymentConfirmation:confirmation};
  localStorage.setItem(paidKey,JSON.stringify(value));
  assert.equal(api.archiveConfirmedInteraction(firstId),false);
  assert.equal(api.readInteraction()?.interactionId,firstId);
 }
});
test('a survey for an archived paid order uses its original authorization while another order is active',async()=>{
 const {api,window,localStorage,paid,pending}=fixture();
 localStorage.setItem(paidKey,JSON.stringify(paid));
 assert.equal(api.archiveConfirmedInteraction(firstId),true);
 localStorage.setItem(paidKey,JSON.stringify(pending));
 const surveyId='fac70ea6-4d43-4b85-8d51-10a66dc87a1e';
 const key2='8813fc6f-c62d-45ba-a8c3-2ec57d5e4f6a';
 const calls=[];
 window.AndroidBridge={orderAvailabilityRequest:json=>{
  const request=JSON.parse(json);calls.push(request);
  window.b3OrderAvailabilityNativeResponse({requestId:request.requestId,status:201,
   data:{stored:true,interactionId:firstId,surveyId,createdAt:new Date().toISOString()}});
 }};
 const result=await api.submitOrderSurvey({interactionId:firstId,storeId,
  idempotencyKey:key2,rating:4,tags:['Tiempo'],comment:'Correcto'});
 assert.equal(result.surveyId,surveyId);
 assert.equal(calls.length,1);
 assert.equal(calls[0].operation,'ORDER_SURVEY');
 assert.equal(calls[0].accessKey,key);
 assert.equal(api.readInteraction()?.interactionId,nextId);
});
test('the UI resets only after verified payment and keeps archived order tracking',()=>{
 assert.match(appSource,/if\(!recordVerifiedPaymentOrder\(entry\)\|\|/);
 assert.match(appSource,/api\.archiveConfirmedInteraction\?\.\(entry\.interactionId\)/);
 assert.match(appSource,/if\(tab==='inicio'\|\|tab==='carta'\)beginNewOrderAfterPayment\(\)/);
 assert.match(appSource,/api\?\.readOrderInteraction\?\.\(order\.interactionId\)/);
 assert.match(appSource,/firstStatusCheckInteractionId/);
 assert.match(appSource,/b3OrderTiming\('payment_status',started\)/);
});
