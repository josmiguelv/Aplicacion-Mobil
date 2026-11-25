import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'

const apiSource=readFileSync(new URL('../app/src/main/assets/order-availability.js',import.meta.url),'utf8')
const appSource=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8')
const start=apiSource.indexOf('  function startLocalPaymentWindow(entry,minutes){')
const end=apiSource.indexOf('  // Read-only verified OUTBOUND conversation messages',start)
assert.ok(start>=0&&end>start,'Local payment function exists')
const fragment=apiSource.slice(start,end)
const id='f1b44024-2d49-4d18-8910-098765432123'
const agentId='c1b44024-2d49-4d18-8910-098765432123'
const key='e1b44024-2d49-4d18-8910-098765432123'

function fixture(){
 const acceptedAt=new Date(Date.now()-15_000).toISOString()
 let saved={interactionId:id,idempotencyKey:key,status:'ACCEPTED',
  agentDecision:'ACCEPTED',agentMessageId:agentId,
  agentMessages:[{id:agentId,text:'aceptar',createdAt:acceptedAt}]}
 const sandbox={
  UUID:{test:v=>/^[0-9a-f-]{36}$/i.test(v)},
  readInteraction:()=>structuredClone(saved),
  persistInteraction:entry=>{saved=structuredClone(entry);return entry},
  recordActivity:()=>{}
 }
 vm.runInNewContext(fragment+'\nthis.start=startLocalPaymentWindow;',sandbox)
 return {start:sandbox.start,getSaved:()=>saved,acceptedAt}
}

test('acceptance timestamp begins configured clock and does not contact server',()=>{
 const f=fixture()
 const entry=structuredClone(f.getSaved())
 const result=f.start(entry,10)
 assert.equal(result.status,'PAYMENT_PENDING')
 assert.equal(result.expiresAt,new Date(Date.parse(f.acceptedAt)+10*60000).toISOString())
 assert.equal(f.getSaved().paymentClockSource,'ANDROID_LOCAL')
 assert.equal(f.getSaved().paymentDurationMinutes,10)
})

test('re-entering checkout never restarts the clock',()=>{
 const f=fixture()
 const initial=f.start(structuredClone(f.getSaved()),10)
 const repeated=f.start(structuredClone(f.getSaved()),20)
 assert.equal(repeated.expiresAt,initial.expiresAt)
 assert.equal(f.getSaved().paymentDurationMinutes,10)
})

test('rejects changed or unverified agent and invalid configured time',()=>{
 const f=fixture()
 const changed={...f.getSaved(),agentMessageId:'f2b44024-2d49-4d18-8910-098765432123'}
 assert.throws(()=>f.start(changed,10),/cambió/)
 assert.throws(()=>f.start({...f.getSaved(),agentDecision:null},10),/aceptación verificada/)
 assert.throws(()=>f.start(f.getSaved(),0),/plazo configurado válido/)
})

test('Android does not wait for the server payment activation to open screen',()=>{
 const begin=appSource.indexOf('async function completeAcceptedQuote(')
 const end=appSource.indexOf('\nasync function pollAgentDecision(',begin)
 const flow=appSource.slice(begin,end)
 assert.match(flow,/api\.startLocalPaymentWindow\(entry,publishedPaymentWaitMinutes\)/)
 assert.match(flow,/screen\('payment'\)/)
 assert.doesNotMatch(flow,/api\.beginPaymentWait\(/)
 assert.doesNotMatch(appSource,/window\.B3OrderAvailability\.readPaymentWait\(/)
})

test('local countdown stops at expiry and keeps submitted receipts intact',()=>{
 assert.match(appSource,/if\(Date\.now\(\)>=deadline&&!entry\.paymentConfirmation\)/)
 assert.match(appSource,/entry\.status!=='ACCEPTED'\|\|entry\.paymentConfirmation/)
})
