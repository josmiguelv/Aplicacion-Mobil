// Static contract guards plus execution of the actual pickup approval helper.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const app=readFileSync('app/src/main/assets/app.js','utf8');
const availability=readFileSync('app/src/main/assets/order-availability.js','utf8');
const pickup=readFileSync('app/src/main/assets/pickup-order-contract.js','utf8');
assert.match(app,/phone:internationalMobile\(person\.phone\)/);
assert.match(app,/customerPhone:internationalMobile\(st\.profile\.phone\)/);
assert.ok(availability.includes(String.raw`/^\+[1-9][0-9]{6,14}$/`));
assert.ok(!availability.includes(String.raw`/^\\+[1-9][0-9]{6,14}$/`),'No double-escaped phone regex');
const customerPhonePattern=availability.match(/typeof customer\.phone!=='string'\|\|!(\/\^.*?\.test\(customer\.phone\))/)?.[1];
assert.ok(customerPhonePattern,'Find customer phone validation');
const checkPhone=runInNewContext('value => '+customerPhonePattern.replace('.test(customer.phone)','.test(value)'),{});
assert.equal(checkPhone('+51968435553'),true);
assert.equal(checkPhone('+573001234567'),true);
assert.equal(checkPhone('968435553'),false);
assert.ok(pickup.includes(String.raw`/^\+[1-9][0-9]{6,14}$/`));
assert.doesNotMatch(app,/Continuar con pedido de prueba|No se enviarán pedidos reales/);
assert.match(app,/function phoneFields\(/);
assert.match(app,/readPhoneFields\('phone'\)/);
assert.match(app,/readPhoneFields\('signin-value'\)/);
assert.match(app,/readPhoneFields\('profile-phone'\)/);
assert.match(app,/customerPhone:internationalMobile\(st\.profile\.phone\)/);
assert.match(app,/catalogRevision:publishedRevision,items,customer:\{/);
assert.match(app,/phone:internationalMobile\(st\.profile\.phone\),mode:'pickup'/);
assert.doesNotMatch(availability,/safeCustomer\.phone=customer\.phone\.slice\(3\)/);
assert.doesNotMatch(availability,/El servidor de pedidos aún no admite teléfonos de otros países/);
assert.match(availability,/\['delivery','pickup'\]\.includes\(mode\)/);
assert.match(availability,/if\(safeCustomer\)body\.customer=safeCustomer/);
const ctx={window:{}};
runInNewContext(pickup,ctx);
assert.ok(ctx.window.B3PickupOrderContract,'Pickup contract must be exposed');
const input={storeName:'Tienda de prueba',customerName:'Cliente de prueba',customerPhone:'+51987654321',
  when:'now',dateTime:'',items:[{name:'Producto de prueba',quantity:1,unitPrice:26}]};
const form=ctx.window.B3PickupOrderContract.approval(input).form;
assert.equal(form.fields.find(f=>f.variable==='Celular').value,'+51987654321');
assert.equal(ctx.window.B3PickupOrderContract.approval({...input,customerPhone:'+573001234567'}).form.fields.find(f=>f.variable==='Celular').value,'+573001234567');
assert.throws(()=>ctx.window.B3PickupOrderContract.approval({...input,customerPhone:'987654321'}));
console.log('PASS: Delivery E.164 payload guard, pickup E.164 FORM, legacy test labels removed');

const pickupChecks=[
 'Este local no está aceptando pedidos para recojo.',
 'El local se encuentra fuera de su horario de atención.',
 'El local aún no tiene un horario de atención publicado.',
 'No pudimos verificar la disponibilidad del local.',
 'La fecha y hora programadas necesitan una nueva confirmación'
];
for(const message of pickupChecks)assert.ok(app.includes(message),'Missing pickup diagnosis: '+message);
assert.doesNotMatch(app,/El local de recojo ya no está abierto o no acepta pedidos\./);
