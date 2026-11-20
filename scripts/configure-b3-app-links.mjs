#!/usr/bin/env node
// Populate the *real* signing-certificate fingerprints; never commit private keys.
import {readFileSync,writeFileSync} from 'node:fs';
const path='app-links/site/.well-known/assetlinks.json';
const args=process.argv.slice(2);
if(!args.length){console.error('Usage: node scripts/configure-b3-app-links.mjs <SHA256_CERTIFICATE_FINGERPRINT> [SECOND_FINGERPRINT]');process.exit(2)}
function format(input){
 const compact=input.replaceAll(':','').trim().toUpperCase();
 if(!/^[0-9A-F]{64}$/.test(compact))throw Error('Expected a 32-byte SHA-256 fingerprint, with or without colons');
 return compact.match(/.{2}/g).join(':');
}
const fingerprints=[...new Set(args.map(format))];
const data=JSON.parse(readFileSync(path,'utf8'));
if(data.length!==1||data[0]?.target?.package_name!=='com.integrab2g.pollosb3')throw Error('Unexpected Digital Asset Links package');
data[0].target.sha256_cert_fingerprints=fingerprints;
writeFileSync(path,JSON.stringify(data,null,2)+'\n');
console.log('Updated '+path+' with '+fingerprints.length+' supplied certificate fingerprint(s).');
