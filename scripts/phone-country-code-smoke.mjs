// Static contract guards plus execution of the actual pickup approval helper.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const app=readFileSync('app/src/main/assets/app.js','utf8');
const availability=readFileSync('app/src/main/assets/order-availability.js','utf8');
const pickup=readFileSync('app/src/main/assets/pickup-order-contract.js','utf8');
assert.match(app,/phone:fullPeruMobile\(person\.phone\)/);
assert.match(app,/customerPhone:fullPeruMobile\(st\.profile\.phone\)/);
assert.match(availability,/\^\\\+519\[0-9\]\{8\}\$/);
assert.match(pickup,/\^\\\+519\[0-9\]\{8\}\$/);
assert.doesNotMatch(app,/Continuar con pedido de prueba|No se enviarán pedidos reales/);
const ctx={window:{}};
runInNewContext(pickup,ctx);
assert.ok(ctx.window.B3PickupOrderContract,'Pickup contract must be exposed');
const input={storeName:'Tienda de prueba',customerName:'Cliente de prueba',customerPhone:'+51987654321',
  when:'now',dateTime:'',items:[{name:'Producto de prueba',quantity:1,unitPrice:26}]};
const form=ctx.window.B3PickupOrderContract.approval(input).form;
assert.equal(form.fields.find(f=>f.variable==='Celular').value,'+51987654321');
assert.throws(()=>ctx.window.B3PickupOrderContract.approval({...input,customerPhone:'987654321'}));
console.log('PASS: Delivery E.164 payload guard, pickup E.164 FORM, legacy test labels removed');
