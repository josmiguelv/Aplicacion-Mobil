import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'

const source=readFileSync(new URL('../app/src/main/assets/order-availability.js',import.meta.url),'utf8')
const begin=source.indexOf('  async function readPaymentWait(entry){')
const end=source.indexOf('  function requestCancelWhenRecovered(entry){',begin)
assert.ok(begin>=0&&end>begin,'Payment state and activation functions must exist')
const methods=source.slice(begin,end)
const uuid='f1b44024-2d49-4d18-8910-098765432123'
const key='aabbccdd-1111-4111-8111-aabbccddeeff'

function createHarness(handler){
 const entry={interactionId:uuid,idempotencyKey:key,status:'ACCEPTED',agentDecision:'ACCEPTED',
  body:{appId:'com.integrab2g.pollosb3',storeId:'f1b44024-2d49-4d18-8910-098765432124'}}
 const calls=[]
 const sandbox={
  UUID:{test:value=>/^[0-9a-f-]{36}$/i.test(value)},
  readInteraction:()=>entry,
  persistInteraction:()=>{},
  recordActivity:()=>{},
  responseError:(response,message)=>Object.assign(Error(message),{httpStatus:response?.status}),
  nativeRequest:async request=>{calls.push(request.operation);return handler(request)}
 }
 vm.runInNewContext(methods+'\nthis.beginPaymentWait=beginPaymentWait;this.readPaymentWait=readPaymentWait;',sandbox)
 return {entry,calls,beginPaymentWait:sandbox.beginPaymentWait,readPaymentWait:sandbox.readPaymentWait}
}

test('lost POST response recovers a confirmed payment window with one GET, no duplicate POST',async()=>{
 const expiresAt=new Date(Date.now()+600_000).toISOString()
 const h=createHarness(request=>{
  if(request.operation==='INTERACTION_PAYMENT')throw Error('Network timeout')
  return {status:200,data:{status:'PAYMENT_PENDING',expiresAt}}
 })
 const result=await h.beginPaymentWait(h.entry)
 assert.equal(result.status,'PAYMENT_PENDING')
 assert.equal(h.entry.paymentExpiresAt,expiresAt)
 assert.deepEqual(h.calls,['INTERACTION_PAYMENT','INTERACTION_PAYMENT_STATUS'])
})

test('unconfirmed payment never unlocks checkout',async()=>{
 const h=createHarness(request=>{
  if(request.operation==='INTERACTION_PAYMENT')throw Error('Network timeout')
  return {status:200,data:{status:'WAITING',expiresAt:null}}
 })
 await assert.rejects(()=>h.beginPaymentWait(h.entry),/Network timeout/)
 assert.equal(h.entry.paymentExpiresAt,undefined)
 assert.deepEqual(h.calls,['INTERACTION_PAYMENT','INTERACTION_PAYMENT_STATUS'])
})

test('already expired recovered window never unlocks checkout',async()=>{
 const h=createHarness(request=>{
  if(request.operation==='INTERACTION_PAYMENT')throw Error('Network timeout')
  return {status:200,data:{status:'PAYMENT_PENDING',expiresAt:'2020-01-01T00:00:00.000Z'}}
 })
 await assert.rejects(()=>h.beginPaymentWait(h.entry),/Network timeout/)
 assert.equal(h.entry.paymentExpiresAt,undefined)
})

test('successful payment response keeps normal single-request path',async()=>{
 const expiresAt=new Date(Date.now()+600_000).toISOString()
 const h=createHarness(()=>({status:200,data:{status:'PAYMENT_PENDING',expiresAt}}))
 const result=await h.beginPaymentWait(h.entry)
 assert.equal(result.expiresAt,expiresAt)
 assert.deepEqual(h.calls,['INTERACTION_PAYMENT'])
})
