import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'

const app=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8')
const start=app.indexOf('function clearApprovedOrderBasket(entry){')
const end=app.indexOf('// The current Android checkout API',start)
const code=app.slice(start,end)
assert.ok(start>=0&&end>start,'Payment approval routines must exist')

function harness({cartOverride=null}={}){
 const interactionId='12345678-1234-4123-8123-123456789abc'
 const productId='f0000000-0000-4000-8000-000000000001'
 const orderCode='B3-'+interactionId.replace(/-/g,'').slice(0,12).toUpperCase()
 const fields=[
  {variable:'N.º de pedido',value:orderCode},
  {variable:'Pedido',value:'Pollo x1'},
  {variable:'Subtotal',value:'S/ 40.00'},
  {variable:'Delivery',value:'S/ 5.00'},
  {variable:'Dirección',value:'Dirección de prueba'},
  {variable:'Total',value:'S/ 45.00'}
 ]
 const entry={
  interactionId,
  body:{storeId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
   items:[{productId,quantity:1}],customer:{}},
  paymentConfirmation:{
   status:'ACCEPTED',agentMessageId:'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
   form:{form:{title:'PAGO REALIZADO - YAPE',fields}}
  }
 }
 const st={cart:cartOverride??[{id:'api:'+productId,qty:1}],orders:[],selected:'',qty:1,cash:'',quote:{deliveryFeePen:5}}
 let writes=0
 const context={st,save:()=>{writes++},orderPublicCode:o=>'B3-'+o.interactionId.replace(/-/g,'').slice(0,12).toUpperCase(),Date}
 vm.runInNewContext(code,context)
 return {entry,st,writes:()=>writes,record:context.recordVerifiedPaymentOrder}
}

test('six-field approved payment becomes a local order and clears matching cart',()=>{
 const h=harness()
 assert.equal(h.record(h.entry),true)
 assert.equal(h.st.orders.length,1)
 assert.equal(h.st.orders[0].total,45)
 assert.equal(h.st.orders[0].orderCode,h.entry.paymentConfirmation.form.form.fields[0].value)
 assert.equal(h.st.orders[0].paymentStatus,'ACCEPTED')
 assert.equal(h.st.cart.length,0)
 assert.equal(h.st.quote,null)
})

test('reopening Mis pedidos does not duplicate an already registered order',()=>{
 const h=harness()
 h.record(h.entry)
 h.record(h.entry)
 assert.equal(h.st.orders.length,1)
})

test('if customer built a different basket, approved order stays recorded without erasing it',()=>{
 const h=harness({cartOverride:[{id:'api:ffffffff-0000-4000-8000-000000000002',qty:2}]})
 assert.equal(h.record(h.entry),true)
 assert.equal(h.st.orders.length,1)
 assert.equal(h.st.cart.length,1)
})

test('unapproved payments and mismatched forms cannot create orders or clear carts',()=>{
 const h=harness()
 h.entry.paymentConfirmation.status='REJECTED'
 assert.equal(h.record(h.entry),false)
 assert.equal(h.st.orders.length,0)
 assert.equal(h.st.cart.length,1)
 h.entry.paymentConfirmation.status='ACCEPTED'
 h.entry.paymentConfirmation.form.form.fields[0].value='B3-FAKE'
 assert.equal(h.record(h.entry),false)
 assert.equal(h.st.orders.length,0)
 assert.equal(h.st.cart.length,1)
})

test('payment outcome and orders screen trigger recovery from confirmed interaction',()=>{
 const outcome=app.slice(app.indexOf('function paymentOutcome(){'),app.indexOf('async function submitPaymentForm(){'))
 const orders=app.slice(app.indexOf('function orders(){'),app.indexOf('function account(){'))
 assert.match(outcome,/recordVerifiedPaymentOrder\(currentEntry\)/)
 assert.match(orders,/recordVerifiedPaymentOrder\(confirmed\)/)
})
