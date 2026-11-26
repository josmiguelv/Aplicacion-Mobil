import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/src/main/assets/styles.css',import.meta.url),'utf8');
const start=app.indexOf('function fulfillmentHeader(){');
const end=app.indexOf('function fulfillmentOverlay(){',start);
const header=app.slice(start,end);

test('header displays Delivery or Recojo en tienda beside Enviar a',()=>{
 assert.ok(start>=0&&end>start);
 assert.match(header,/modeLabel=st\.mode==='delivery'\?'Delivery':st\.mode==='pickup'\?'Recojo en tienda'/);
 assert.match(header,/b3-header-topline/);
 assert.match(header,/b3-destination-label/);
 assert.match(header,/b3-fulfillment-pill/);
 assert.match(header,/b3-destination-line/);
});
test('the pill opens the existing mode-change sheet instead of introducing a new checkout flow',()=>{
 assert.match(header,/b3-fulfillment-pill" type="button" data-open-fulfillment="1"/);
 assert.match(app,/if\(b\.hasAttribute\('data-open-fulfillment'\)\)\{fulfillmentModal='choose'/);
 assert.match(app,/if\(b\.dataset\.modalMode\)\{/);
 assert.match(app,/Primero debes cancelar la solicitud actual para cambiar la dirección o modalidad/);
});
test('the green indicator stays readable on compact screens and can be focused',()=>{
 assert.match(css,/\.home-v10 \.b3-fulfillment-pill\{/);
 assert.match(css,/#e6f6ec/);
 assert.match(css,/#126b37/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/@media\(max-width:360px\)/);
});
