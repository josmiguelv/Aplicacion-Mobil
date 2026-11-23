import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const load = name => readFileSync(new URL('../'+name,import.meta.url),'utf8');
const gradle=load('app/build.gradle');
const envExample=load('.env.example');
const ignore=load('.gitignore');
const java=load('app/src/main/java/com/integrab2g/pollosb3/MainActivity.java');
const js=load('app/src/main/assets/app.js');

test('Android reads a single editable B3_API_BASE from root .env',()=>{
 assert.match(gradle,/rootProject\.file\('\.env'\)/);
 assert.match(gradle,/readEnv\(localEnvFile\)/);
 assert.match(gradle,/getProperty\('B3_API_BASE'\)/);
 assert.match(gradle,/new URI\(apiBase\)/);
 assert.match(gradle,/apiUri\.scheme != 'https'/);
 assert.match(gradle,/apiUri\.rawUserInfo != null/);
 assert.match(gradle,/apiUri\.rawQuery != null/);
 assert.match(gradle,/apiUri\.rawFragment != null/);
 assert.match(gradle,/apiUri\.rawPath && apiUri\.rawPath != '\/'/);
 assert.doesNotMatch(gradle,/https:\/\/back-neutral-rogers-switched/,'No embedded endpoint in app/build.gradle');
});

test('both REST and notifications use the exact same configured API origin',()=>{
 assert.match(gradle,/resValue 'string', 'b3_api_base', apiBase/);
 assert.match(gradle,/resValue 'string', 'b3_notifications_api_base', apiBase/);
 assert.match(java,/getString\(R\.string\.b3_api_base\)/);
 assert.match(java,/getString\(R\.string\.b3_notifications_api_base\)/);
 assert.match(java,/getString\(R\.string\.b3_api_base\)\.trim\(\)\.replaceAll/);
 assert.match(js,/getApiBase\?\.\(\)/);
 assert.match(js,/getNotificationsApiBase\?\.\(\)/);
});

test('CI fallback is an HTTPS-only example; local .env is ignored',()=>{
 const values=envExample.split(/\r?\n/).filter(x=>/^B3_API_BASE=/.test(x));
 assert.equal(values.length,1,'One editable endpoint only');
 const url=new URL(values[0].slice('B3_API_BASE='.length));
 assert.equal(url.protocol,'https:');
 assert.equal(url.pathname,'/');
 assert.ok(url.hostname);
 assert.match(ignore,/(?:^|\n)\.env(?:\r?\n|$)/);
 assert.doesNotMatch(ignore,/(?:^|\n)\.env\.example(?:\r?\n|$)/);
});
