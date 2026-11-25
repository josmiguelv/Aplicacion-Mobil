import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const java=readFileSync(new URL('../app/src/main/java/com/integrab2g/pollosb3/MainActivity.java',import.meta.url),'utf8')
const js=readFileSync(new URL('../app/src/main/assets/order-availability.js',import.meta.url),'utf8')
const app=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8')
const begin=java.indexOf('} else if ("ORDER_SURVEY".equals(operation)) {')
const end=java.indexOf('} else if ("INTERACTION_STATUS".equals(operation)',begin)
assert.ok(begin>=0&&end>begin,'Native survey bridge must exist')
const survey=java.slice(begin,end)
const javaPatterns=[...survey.matchAll(/\.matches\("([^"]+)"\)/g)].map(m=>m[1])
const uuidPattern='(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const normal='91d08fe9-f278-4a11-8c22-0123456789ab'
const malformed='91d08fe9-f278-4a11-8c22-abcd-0123456789ab'

test('all four native survey IDs use standard 8-4-4-4-12 UUIDs',()=>{
 assert.equal(javaPatterns.length,4)
 for(const pattern of javaPatterns) {
  assert.equal(pattern,uuidPattern)
  const regex=new RegExp('^'+pattern.replace(/^\(\?i\)/,'')+'$','i')
  assert.equal(regex.test(normal),true)
  assert.equal(regex.test(malformed),false)
 }
})

test('survey route and validation preserve authorization and idempotency',()=>{
 assert.match(survey,/path="\/api\/v1\/mobile\/orders\/"\+interactionId\+"\/survey"/)
 assert.match(survey,/key\.equalsIgnoreCase\(accessKey\)/)
 assert.match(js,/operation:'ORDER_SURVEY'/)
 assert.match(js,/idempotencyKey:entry\.idempotencyKey/)
 assert.match(app,/order\.surveySubmission=submission/)
 assert.match(app,/idempotencyKey:submission\.key/)
})

test('survey confirmation is not fabricated and old errors do not erase submitted answers',()=>{
 assert.match(js,/response\.data\?\.stored!==true/)
 assert.match(app,/order\.review=\{score:submission\.rating/)
 assert.match(app,/delete order\.surveySubmission/)
 assert.match(app,/reviewSendError=String\(error\?\.message/)
})
