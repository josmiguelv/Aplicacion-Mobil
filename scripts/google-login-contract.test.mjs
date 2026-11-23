import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const js=load('app/src/main/assets/app.js');
const java=load('app/src/main/java/com/integrab2g/pollosb3/MainActivity.java');
const gradle=load('app/build.gradle');
const env=load('.env.example');

test('Google uses native Credential Manager and Firebase, no WebView token verification',()=>{
 assert.match(gradle,/firebase-auth/);
 assert.match(gradle,/androidx.credentials:credentials:/);
 assert.match(gradle,/googleid:googleid:/);
 assert.match(gradle,/b3_google_web_client_id/);
 assert.match(gradle,/getProperty\('B3_GOOGLE_WEB_CLIENT_ID'\)/);
 assert.match(env,/^B3_GOOGLE_WEB_CLIENT_ID=$/m);
 assert.match(java,/new GetSignInWithGoogleOption\.Builder/);
 assert.match(java,/GoogleIdTokenCredential\.createFrom/);
 assert.match(java,/FirebaseAuth\.getInstance\(\)\.signInWithCredential/);
 assert.match(java,/user\.isEmailVerified\(\)/);
 assert.match(java,/getIdToken\(true\)/);
 assert.match(java,/clearCredentialStateAsync/);
 assert.match(java,/requestGoogleAuthState/);
 assert.doesNotMatch(js,/getIdToken\(/);
 assert.doesNotMatch(js,/GoogleAuthProvider/);
});

test('Google replaces Facebook and manual email sign in, guest and phone remain',()=>{
 const login=js.match(/function login\(\)\{[^\n]+/);
 assert.ok(login);
 assert.match(login[0],/data-google-login/);
 assert.match(login[0],/data-guest/);
 assert.match(login[0],/signin-phone/);
 assert.doesNotMatch(login[0],/Continuar con Facebook|Continuar con correo|data-social|signin-email/);
 assert.match(js,/window\.AndroidBridge\.signInWithGoogle\(\)/);
 assert.match(js,/window\.AndroidBridge\?\.signOutGoogle/);
 assert.match(js,/window\.AndroidBridge\?\.requestGoogleAuthState/);
});

test('native verified callback alone unlocks Google session; errors never do',()=>{
 const block=js.match(/window\.b3GoogleAuthResult=reply=>\{[\s\S]*?\n\};/)?.[0];
 assert.ok(block);
 const events=[];
 const st={registered:false,authProvider:'',authUid:'',authDisplayName:'',authGoogleEmail:'',
  profile:{email:''},stage:'login',tab:'inicio'};
 const context={window:{},st,googleSignInPending:true,
  enterApp:()=>events.push('enter'),render:()=>events.push('render'),
  save:()=>events.push('save'),toast:x=>events.push('toast:'+x),String};
 vm.runInNewContext(block,context);
 context.window.b3GoogleAuthResult({status:'ERROR',message:'Firebase no disponible'});
 assert.equal(st.registered,false);
 assert.equal(events.includes('enter'),false);
 context.googleSignInPending=true;
 context.window.b3GoogleAuthResult({status:'SIGNED_IN',uid:'test-uid',email:'test@example.com',
  displayName:'Cliente de prueba',emailVerified:false});
 assert.equal(st.registered,false,'unverified Google identity must not authenticate');
 context.googleSignInPending=true;
 context.window.b3GoogleAuthResult({status:'SIGNED_IN',uid:'firebase-uid',email:'verified@example.com',
  displayName:'Cliente verificado',emailVerified:true});
 assert.equal(st.registered,true);
 assert.equal(st.authProvider,'google');
 assert.equal(st.authUid,'firebase-uid');
 assert.equal(events.filter(x=>x==='enter').length,1);
 context.window.b3GoogleAuthResult({status:'SIGNED_OUT'});
 assert.equal(st.registered,false);
 assert.equal(st.authUid,'');
});
