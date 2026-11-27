import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8');
const between=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
test('reservation can never build immediate validation form',()=>{
 assert.match(between('function deliveryOrderTicketForm(', 'function applyBackendQuote('),/requireImmediateOrderFlow\(\)/);
 assert.match(between('function requireImmediateOrderFlow()', 'function deliveryOrderTicketForm('),/st\.scheduleMode==='reservation'/);
});
test('reservation cannot enter immediate delivery interaction or payment FORM',()=>{
 assert.match(between('function requestBackendOrderAvailability(', 'async function resolveDelivery('),/requireImmediateOrderFlow\(\)/);
 assert.match(between('function paymentConfirmationForm(', 'function paymentOptions('),/requireImmediateOrderFlow\(\)/);
});
test('entry points return to reservation instead of creating immediate order',()=>{
 assert.match(between('async function resolveDelivery(', 'function resolveStoreDistances('),/if\(st\.scheduleMode==='reservation'\)/);
 assert.match(between('function startCheckout()', 'function animateAddedProduct('),/if\(st\.scheduleMode==='reservation'\)/);
 assert.match(between("if(b.hasAttribute('data-modal-save-delivery'))","if(b.dataset.modalPickstore)"),/if\(st\.scheduleMode==='reservation'\)/);
 assert.match(between("if(b.hasAttribute('data-address-next'))","if(b.hasAttribute('data-identity-next'))"),/if\(st\.scheduleMode==='reservation'\)/);
 assert.match(between("if(b.hasAttribute('data-review-confirm'))","if(b.hasAttribute('data-phone-next'))"),/if\(st\.scheduleMode==='reservation'\)/);
});
test('only explicit now choice changes reservation intent into immediate',()=>{
 assert.match(source,/if\(choice==='now'\)\{resetReservationQuote\(\);st\.scheduleMode='now';st\.reservationAt='';/);
 assert.match(between("if(choice==='reservation')", "if(choice==='now')"),/st\.scheduleMode='reservation';/);
 assert.equal((source.match(/st\.scheduleMode='now'/g)||[]).length,2);
});

test('reservation choice cancels stale immediate work without abandoning an active interaction',()=>{
 const block=between("if(choice==='reservation')","if(choice==='now')");
 assert.match(block,/activePersonalCheckout\(\)/);
 assert.match(block,/\+\+deliveryValidationGeneration/);
 assert.match(source,/const active=\(\)=>run===deliveryValidationGeneration&&st\.scheduleMode!=='reservation'/);
});
