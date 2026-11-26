import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../app/src/main/assets/reservation-forms.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8');
function fixture(){
 const win={};
 vm.runInNewContext(src,{window:win,Date,Math,Number,String,Object,Array,Set,RegExp,Error});
 return win.B3ReservationForms;
}
const input={
 dateTime:'2026-11-28T15:00',mode:'delivery',
 items:[{name:'Pollo a la brasa',quantity:1}],
 subtotal:62.5,deliveryFee:5,total:67.5,destination:'Dirección de prueba, Lima',
 method:'cash',amount:'100.00',exact:false,allowedMethods:['cash','yape']
};
test('time selected is midpoint, 15 minutes earlier and later',()=>{
 const f=fixture(),s=f.schedule('2026-11-28T15:00');
 assert.equal(s.date,'28/11/2026');
 assert.equal(s.interval,'2:45 p. m. – 3:15 p. m.');
 assert.equal(s.selectedAt-s.from,900000);
 assert.equal(s.to-s.selectedAt,900000);
 const cross=f.schedule('2026-11-28T00:05');
 assert.match(cross.interval,/27\/11\/2026/);
 assert.match(cross.interval,/28\/11\/2026/);
});
test('cash change is correct in PEN cents and exact payment gives zero change',()=>{
 const f=fixture();
 const form=f.request(input);
 assert.equal(form.title,'VALIDACIÓN DE RESERVA');
 assert.match(form.fields.find(x=>x.variable==='Forma de pago').value,/Paga con S\/ 100.00 · Vuelto S\/ 32.50/);
 const exact=f.request({...input,exact:true,amount:undefined});
 assert.match(exact.fields.find(x=>x.variable==='Forma de pago').value,/Vuelto S\/ 0.00/);
});
test('other cash amount must strictly exceed total; invalid money is rejected',()=>{
 const f=fixture();
 for(const amount of ['67.50','67.49','100.123','100x00','-100','']){
  assert.throws(()=>f.request({...input,amount}),undefined,amount);
 }
 assert.doesNotThrow(()=>f.request({...input,amount:'67.51'}));
});
test('unpublished payment methods are not selectable',()=>{
 const f=fixture();
 assert.throws(()=>f.request({...input,allowedMethods:['yape']}));
 assert.doesNotThrow(()=>f.request({...input,method:'yape',amount:undefined}));
});
test('50 distinct short products are packed without losing quantities and never exceed ten variables',()=>{
 const f=fixture();
 const items=Array.from({length:50},(_,i)=>({name:'Producto '+(i+1),quantity:(i%9)+1}));
 const form=f.request({...input,items});
 assert.ok(form.fields.length<=10);
 assert.ok(form.fields.length>=7);
 const payload=form.fields.filter(x=>x.variable.startsWith('Productos ')).map(x=>x.value).join(' · ');
 for(const item of items)
  assert.ok(payload.includes(item.name+' × '+item.quantity),'missing '+item.name);
 assert.ok(form.fields.every(x=>x.value.length<=500));
});
test('oversized items reject rather than silently truncate the advisor ticket',()=>{
 const f=fixture();
 const items=Array.from({length:50},(_,i)=>({name:'Producto '+String(i).padStart(2,'0')+' '+('a'.repeat(75)),quantity:1}));
 assert.throws(()=>f.request({...input,items}),/excede la capacidad del FORM/);
});
test('payment proof retains reservation fields and is never a cash receipt',()=>{
 const f=fixture(),payload={...input,method:'yape',amount:undefined,
  orderCode:'B3-123456789ABC',imageUrl:'https://b3.example.com/receipt.png'};
 const proof=f.paymentProof(payload);
 assert.equal(proof.type,'FORM');
 assert.equal(proof.form.title,'PAGO DE RESERVA REALIZADO - YAPE');
 assert.ok(proof.form.fields.length<=10);
 assert.ok(proof.form.fields.some(x=>x.variable==='Intervalo'));
 assert.throws(()=>f.paymentProof({...payload,method:'cash'}),/Efectivo/);
});
test('reservation preview uses published values and cannot submit an immediate order',()=>{
 assert.match(app,/window\.B3ReservationForms\.request\(/);
 assert.match(app,/st\.scheduleMode!=='reservation'/);
 assert.match(app,/x\.reservation_enabled===true/);
 assert.match(app,/when\.from<Date\.now\(\)\+lead\*60000/);
 assert.match(app,/No se enviará un pedido inmediato|La solicitud de reserva no se enviará/);
 assert.match(app,/if\(b\.dataset\.reservationPay\)/);
 assert.match(app,/if\(b\.dataset\.reservationCashMode\)/);
});
