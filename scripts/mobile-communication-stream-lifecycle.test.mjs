import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const android=readFileSync('app/src/main/java/com/integrab2g/pollosb3/MainActivity.java','utf8')
const stream=readFileSync('app/src/main/java/com/integrab2g/pollosb3/MobileCommunicationStreamManager.java','utf8')

test('transport extension is dormant until TU VERSO and Admin are certified',()=>{
 assert.match(android,/MOBILE_COMM_STREAM_ENABLED = false/)
 assert.match(android,/if \(MOBILE_COMM_STREAM_ENABLED && status>=200 && status<300\)/)
 assert.doesNotMatch(stream,/api\.tuverso\.integra-b2g\.com|Bearer /)
 assert.match(stream,/X-Order-Access-Key/)
 assert.match(stream,/"https"\.equalsIgnoreCase\(uri.getScheme\(\)\)/)
})
test('at most one native HTTP event socket per interaction, no unlimited SSE buffers',()=>{
 assert.match(stream,/ConcurrentHashMap<String, Session>/)
 assert.match(stream,/sessions.putIfAbsent\(interactionId, session\)/)
 assert.match(stream,/line.length\(\) > 4096/)
 assert.match(stream,/setReadTimeout\(30000\)/)
 assert.match(stream,/communication\.closed/)
 assert.match(stream,/session.listener.onClosed/)
})
test('stop on cancellation, agent close, view suspension or destroyed activity',()=>{
 assert.match(android,/"INTERACTION_CANCEL"\.equals\(operation\)/)
 assert.match(android,/"INTERACTION_STATUS"\.equals\(operation\)/)
 assert.match(android,/"CLOSED"\.equals\(operational\)/)
 assert.match(android,/"RESOLVED"\.equals\(operational\)/)
 assert.match(android,/mobileCommunicationStreams.stop\(request.optString\("interactionId"/)
 assert.match(android,/@Override protected void onPause\(\)/)
 assert.match(android,/@Override protected void onDestroy\(\)/)
 assert.equal((android.match(/mobileCommunicationStreams.closeAll\(\)/g)||[]).length,2)
 assert.match(stream,/active.disconnect\(\)/)
 assert.match(stream,/sessions.remove\(session.interactionId, session\)/)
})
test('only one optional native event callback; existing request bridge remains unchanged',()=>{
 assert.match(android,/window\.b3MobileCommunicationEvent/)
 assert.match(android,/window\.b3OrderAvailabilityNativeResponse/)
 assert.match(android,/MainActivity.this::notifyMobileCommunicationClosed/)
 assert.match(stream,/setRequestMethod\("GET"\)/)
 assert.match(stream,/setRequestProperty\("Accept", "text\/event-stream"\)/)
})
