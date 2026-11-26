import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8');
const quote=js.slice(js.indexOf('async function checkReservationQuote(){'),js.indexOf('function reservationSummary(){'));
const picker=js.slice(js.indexOf('function reservationPicker(){'),js.indexOf('function choice(){'));
const handlers=js.slice(js.indexOf("if(b.hasAttribute('data-reservation-address'))"),js.indexOf('if(b.dataset.mode){'));
const selector=js.match(/let b=e\.target\.closest\('([^']+)'\)/)?.[1];

test('reservation picker has no store selection or public technical activation labels',()=>{
 assert.ok(!picker.includes('Selecciona una sede habilitada para reservas'));
 assert.ok(!picker.includes('data-reservation-store'));
 assert.ok(!picker.includes('Recepción API no habilitada'));
 assert.ok(!picker.includes('contrato compatible'));
 assert.match(picker,/Buscaremos automáticamente una sede disponible/);
});
test('Delivery quote omits storeId and Administrator selects coverage and online agent',()=>{
 assert.match(quote,/const candidates=mode==='delivery'\?\[null\]:permitted/);
 assert.match(quote,/const query=candidate\?\{\.\.\.params,storeId:candidate\.id\}:params/);
 assert.match(quote,/result\.agentAvailable!==true/);
 assert.match(quote,/const matching=permitted\.find\(x=>x\.id===result\.storeId\)/);
 assert.match(quote,/st\.store=selected\.storeId/);
});
test('pickup finds an eligible agent without asking customer to choose the store',()=>{
 assert.match(quote,/const candidates=mode==='delivery'\?\[null\]:permitted/);
 assert.match(quote,/mode==='pickup'&&\[404,409\]\.includes\(response\.status\)/);
});
test('address can be edited without invoking immediate-order resolveDelivery',()=>{
 const address=handlers.slice(0,handlers.indexOf("if(b.hasAttribute('data-reservation-quote'))"));
 assert.ok(!address.includes('resolveDelivery()'));
 assert.match(address,/deliveryLocation=null;reservationQuote=null/);
 assert.match(picker,/data-reservation-address-save/);
});
test('all reservation delegated buttons are functional',()=>{
 assert.ok(selector);
 for(const attr of ['data-reservation-address','data-reservation-address-save','data-reservation-quote',
  'data-reservation-pay','data-reservation-cash-mode','data-reservation-verify'])
  assert.ok(selector.includes('['+attr+']'),attr);
});
