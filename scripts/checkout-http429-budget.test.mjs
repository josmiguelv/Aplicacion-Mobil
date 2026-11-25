import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'

const src=readFileSync(new URL('../app/src/main/assets/order-availability.js',import.meta.url),'utf8')
const app=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8')
const java=readFileSync(new URL('../app/src/main/java/com/integrab2g/pollosb3/MainActivity.java',import.meta.url),'utf8')
const start=src.indexOf("  const TRAFFIC_KEY='b3-mobile-interaction-traffic-v1'")
const end=src.indexOf('  function nativeRequestRaw(',start)
assert.ok(start>=0&&end>start,'traffic limiter must exist')
const block=src.slice(start,end)
function harness(){
 const saved=new Map()
 let clock=1000000
 const entry={status:'PENDING',interactionId:'test-order',paymentConfirmation:null,paymentExpiresAt:new Date(clock+600000).toISOString()}
 class FakeDate extends Date {static now(){return clock}}
 const ctx={
  root:{localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},
   setTimeout:(cb,ms)=>{clock+=ms;Promise.resolve().then(cb)}},
  readInteraction:()=>entry, Date:FakeDate,
  nativeRequestRaw:async()=>({status:200,data:{}})
 }
 vm.runInNewContext(block+'\nthis.wait=waitForTrafficBudget;this.calls=recentInteractionCalls;',ctx)
 return {wait:ctx.wait,calls:ctx.calls,entry,now:()=>clock}
}

test('polls reserve capacity for image upload, fresh history and FORM',async()=>{
 const h=harness()
 for(const op of ['INTERACTION_CREATE','INTERACTION_MESSAGE'])await h.wait({operation:op})
 for(let i=0;i<4;i++)await h.wait({operation:'INTERACTION_STATUS'})
 assert.equal(h.calls(h.now()).length,6)
 h.entry.status='ACCEPTED'
 for(const op of ['INTERACTION_RECEIPT_UPLOAD','INTERACTION_STATUS','INTERACTION_PAYMENT_FORM'])
  await h.wait({operation:op})
 assert.equal(h.calls(h.now()).length,9)
})

test('extra status polling waits for the budget to renew, not more HTTP requests',async()=>{
 const h=harness()
 for(let i=0;i<6;i++)await h.wait({operation:'INTERACTION_STATUS'})
 const first=h.now()
 await h.wait({operation:'INTERACTION_STATUS'})
 assert.ok(h.now()-first>=61000)
 assert.equal(h.calls(h.now()).length,1)
})

test('client applies a shared budget and six-second polling',()=>{
 const p=app.indexOf('function agentStatusPollDelay(')
 assert.ok(p>=0)
 assert.match(app.slice(p,p+270),/Math\.max\(6000/)
 assert.match(block,/await waitForTrafficBudget\(action\)/)
 assert.match(block,/const allowance=awaitingDecision\?6:9/)
 assert.match(block,/root\.localStorage\.setItem\(TRAFFIC_KEY/)
})

test('only the exact pre-handler 429 allows an idempotent FORM retry',()=>{
 const begin=src.indexOf('async function sendPaymentConfirmation(entry)')
 const end=src.indexOf('async function pollPaymentConfirmation(entry)',begin)
 const form=src.slice(begin,end)
 assert.match(form,/response\.data\?\.error==='Demasiadas solicitudes; vuelve a intentarlo más tarde'/)
 assert.match(form,/confirmation\.status=definitelyNotSent\?'PREPARED':'UNCERTAIN'/)
 assert.match(form,/idempotencyKey:confirmation\.messageKey/)
})

test('native HTTP audit exposes only operation, method, status and latency',()=>{
 assert.match(java,/android\.util\.Log\.i\("B3HttpAudit","operation="\+operation/)
 assert.match(java,/durationMs=/)
 assert.match(java,/String\[\] required=\{"N\.º de pedido","Pedido","Subtotal","Delivery","Dirección","Total"\}/)
})
