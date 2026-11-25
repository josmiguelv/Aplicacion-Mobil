import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'

const source=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8')
const start=source.indexOf('const APPROVAL_QUOTE_KEY=')
const end=source.indexOf('function deliveryQuoteKey(',start)
assert.ok(start>=0&&end>start,'Bound pre-approval quote functions exist')
const cacheFunctions=source.slice(start,end)
const store={id:'store-1'}
const entry={interactionId:'f1b44024-2d49-4d18-8910-098765432123'}
const quote={storeId:store.id,revision:'rev-1',distanceSource:'STRAIGHT_LINE',
 deliveryFeePen:12,paymentMethods:['yape','plin'],routeDistanceKm:null}
function harness(){
 const storage=new Map()
 const ctx={
  publishedRevision:'rev-1',cart:'items-v1',
  localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)||null},
  currentCartSignature:()=>ctx.cart,
  deliveryAddressKey:(address,district)=>address.trim().toLowerCase()+'|'+district.trim().toLowerCase()
 }
 vm.runInNewContext(cacheFunctions+
  '\nthis.remember=rememberPreApprovalQuote;this.read=preApprovalQuoteFor;',ctx)
 return ctx
}

test('same interaction, store, cart, address and revision reuses the already calculated delivery fee',()=>{
 const h=harness()
 h.remember(entry,store,'Av. Los Nogales','Santa Anita',quote)
 const found=h.read(entry,store,'Av. Los Nogales','Santa Anita')
 assert.equal(found.deliveryFeePen,12)
 assert.equal(found.paymentMethods[0],'yape')
})

test('different order, store or cart cannot reuse a quote',()=>{
 const h=harness()
 h.remember(entry,store,'Av. Los Nogales','Santa Anita',quote)
 assert.equal(h.read({interactionId:'other-order'},store,'Av. Los Nogales','Santa Anita'),null)
 assert.equal(h.read(entry,{id:'store-2'},'Av. Los Nogales','Santa Anita'),null)
 h.cart='other-cart'
 assert.equal(h.read(entry,store,'Av. Los Nogales','Santa Anita'),null)
})

test('changed delivery address or catalog revision invalidates saved quote',()=>{
 const h=harness()
 h.remember(entry,store,'Av. Los Nogales','Santa Anita',quote)
 assert.equal(h.read(entry,store,'Otra calle','Santa Anita'),null)
 h.publishedRevision='rev-2'
 assert.equal(h.read(entry,store,'Av. Los Nogales','Santa Anita'),null)
})

test('invalid negative fee or payment options never authorize reuse',()=>{
 const h=harness()
 h.remember(entry,store,'Av. Los Nogales','Santa Anita',{...quote,deliveryFeePen:-1})
 assert.equal(h.read(entry,store,'Av. Los Nogales','Santa Anita'),null)
 h.remember(entry,store,'Av. Los Nogales','Santa Anita',{...quote,paymentMethods:[]})
 assert.equal(h.read(entry,store,'Av. Los Nogales','Santa Anita'),null)
})

test('payment window remains server-confirmed after the quote is reused',()=>{
 assert.match(source,/await api\.beginPaymentWait\(entry\)/)
 assert.match(source,/if\(wait\.status!=='PAYMENT_PENDING'\)/)
 assert.match(source,/if\(!preApprovalQuoteFor\(entry,selected,address,district\)&&!hasDeliveryDestination\(address,district\)\)/)
})
