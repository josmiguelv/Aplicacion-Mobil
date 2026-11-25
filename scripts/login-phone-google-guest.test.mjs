import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'

const app=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8')
const native=readFileSync(new URL('../app/src/main/java/com/integrab2g/pollosb3/MainActivity.java',import.meta.url),'utf8')
const gradle=readFileSync(new URL('../app/build.gradle',import.meta.url),'utf8')
const start=app.indexOf('function login(){')
const end=app.indexOf('\nfunction heading(',start)
assert.ok(start>=0&&end>start,'Login screen must exist')
const screen=app.slice(start,end)

test('only phone, Google and guest are displayed on login',()=>{
 assert.match(screen,/Continuar con número/)
 assert.match(screen,/Continuar con Google/)
 assert.match(screen,/Continuar como invitado/)
 assert.doesNotMatch(screen,/Continuar con correo|Continuar con Facebook|data-social|signin-email/)
 assert.ok(screen.indexOf('Continuar con número')<screen.indexOf('Continuar con Google'))
 assert.ok(screen.indexOf('Continuar con Google')<screen.indexOf('Continuar como invitado'))
})

test('Google button triggers native sign-in with verified result callback',()=>{
 assert.match(screen,/data-google-login="1"/)
 assert.match(app,/window\.AndroidBridge\.signInWithGoogle\(\)/)
 assert.match(app,/window\.b3GoogleAuthResult=reply=>/)
 assert.match(native,/@JavascriptInterface public void signInWithGoogle\(\)/)
 assert.match(native,/GetSignInWithGoogleOption/)
 assert.match(native,/FirebaseAuth\.getInstance\(\)\.signInWithCredential/)
 assert.match(native,/getIdToken\(true\)/)
})

test('Google OAuth configuration and dependencies are available without hardcoded secrets',()=>{
 assert.match(gradle,/B3_GOOGLE_WEB_CLIENT_ID/)
 assert.match(gradle,/b3_google_web_client_id/)
 assert.match(gradle,/com\.google\.firebase:firebase-auth/)
 assert.match(gradle,/androidx\.credentials:credentials/)
 assert.match(gradle,/com\.google\.android\.libraries\.identity\.googleid:googleid/)
})

test('recent order and six-variable payment fixes remain intact',()=>{
 assert.match(native,/String\[\] required=\{"N\.º de pedido","Pedido","Subtotal","Delivery","Dirección","Total"\}/)
 assert.match(app,/api\.startLocalPaymentWindow\(entry,publishedPaymentWaitMinutes\)/)
})
