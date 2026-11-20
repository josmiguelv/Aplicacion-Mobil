import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'

const source=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8')
const extract=name=>{
 const pattern=new RegExp('(async )?function '+name+'\\([^\\n]*\\)\\{[\\s\\S]*?\\n\\}')
 const match=source.match(pattern)
 assert.ok(match,'Missing function '+name)
 return match[0]
}
const shopBase={active:true,delivery_enabled:true,hoursConfigured:true,isOpen:true,consultOrderAvailability:false,paymentMethods:{delivery:['yape','plin']}}
const nogales={...shopBase,id:'nogales',name:'Nogales',latitude:-12.0506096,longitude:-77.1251313,radiusKm:5,
 deliveryPricingMode:'PER_KM',deliveryRatePerKmPen:2.5,deliveryFeePen:null}
const tallanes={...shopBase,id:'tallanes',name:'Tallanes',latitude:-12.0506625,longitude:-77.1038664,radiusKm:4,
 deliveryPricingMode:'PER_KM',deliveryRatePerKmPen:3}
const universal={...shopBase,id:'universal',name:'Universal',latitude:-12.0482197,longitude:-77.1114342,radiusKm:10,
 deliveryPricingMode:'FIXED',deliveryFeePen:15,deliveryRatePerKmPen:null,paymentMethods:{delivery:[]}}
const destination=(latitude,longitude)=>({latitude,longitude})
const quote=(stores,dest,ready=true)=>{
 const context={shops:stores,st:{configReady:ready}}
 for(const name of ['eligibleDeliveryCandidates','quoteForDeliveryCandidate','calculateLocalDeliveryQuote'])vm.runInNewContext(extract(name),context)
 return context.calculateLocalDeliveryQuote(dest,stores)
}

test('precio S/ 2.50 por kilómetro calculado en Android con Haversine',()=>{
 const result=quote([nogales],destination(-12.0406096,-77.1251313))
 assert.equal(result.storeId,'nogales')
 assert.equal(result.straightDistanceKm,1.11)
 assert.equal(result.deliveryFeePen,2.78)
 assert.equal(result.distanceSource,'STRAIGHT_LINE')
 assert.equal(result.quoteOrigin,'ANDROID_LOCAL')
 assert.equal(result.provisional,true)
})
test('tarifa fija Universal S/ 15 dentro de sus 10 km, sin multiplicar',()=>{
 const result=quote([universal],destination(-12.048,-77.111))
 assert.equal(result.storeId,'universal')
 assert.equal(result.deliveryPricingMode,'FIXED')
 assert.equal(result.deliveryFeePen,15)
 assert.ok(result.straightDistanceKm<10)
})
test('sin selector de sede: se asigna la más cercana dentro de la cobertura',()=>{
 const result=quote([universal,nogales],destination(nogales.latitude,nogales.longitude))
 assert.equal(result.storeId,'nogales')
 assert.doesNotMatch(source,/preferredDeliveryStoreId|deliveryStorePreferenceHtml|delivery-store-preference/)
})
test('cuando la sede más cercana cierra, se usa la siguiente elegible',()=>{
 const result=quote([{...nogales,isOpen:false},universal],destination(nogales.latitude,nogales.longitude))
 assert.equal(result.storeId,'universal')
 assert.equal(result.deliveryFeePen,15)
})
test('tienda fuera de radio, inactiva, sin tarifa o sin horarios no cotiza',()=>{
 const near=destination(nogales.latitude,nogales.longitude)
 for(const list of [
  [{...nogales,radiusKm:0.02}], // this fixture is exactly at the store, so test farther below
  [{...nogales,active:false}],
  [{...nogales,delivery_enabled:false}],
  [{...nogales,isOpen:false}],
  [{...nogales,hoursConfigured:false}],
  [{...nogales,deliveryRatePerKmPen:null}],
  [{...nogales,latitude:null}],
 ]) {
  const target=list[0].radiusKm===0.02?destination(nogales.latitude+0.01,nogales.longitude):near
  assert.throws(()=>quote(list,target),/No hay locales|fuera del radio|no tienen coordenadas o tarifas|está cerrado/)
 }
})
test('cobertura ilimitada solo cuando radiusKm es nulo',()=>{
 const result=quote([{...universal,radiusKm:null}],destination(-11.90,-77.111))
 assert.equal(result.deliveryFeePen,15)
 assert.ok(result.straightDistanceKm>10)
})
test('nunca se inventa coordenada, tarifa ni configuración publicada',()=>{
 assert.throws(()=>quote([nogales],destination(null,null)),/ubicación/)
 assert.throws(()=>quote([nogales],destination(nogales.latitude,nogales.longitude),false),/publicadas/)
 assert.throws(()=>quote([{...universal,deliveryFeePen:null}],destination(universal.latitude,universal.longitude)),/No hay locales|fuera del radio|no tienen coordenadas o tarifas/)
})
test('sin método de pago publicado el cliente no puede avanzar con pago ficticio',()=>{
 const context={st:{mode:'delivery',store:'universal',configReady:true,quote:{paymentMethods:[]}},shops:[universal]}
 vm.runInNewContext(extract('paymentOptions'),context)
 assert.equal(context.paymentOptions().length,0)
 context.st.quote.paymentMethods=['yape','plin']
 assert.deepEqual(Array.from(context.paymentOptions(),x=>x[0]),['yape','plin'])
})
test('deliveryQuoteValid exige una cotización local reciente y dirección consistente',()=>{
 const now=Date.now()
 const st={mode:'delivery',store:'nogales',profile:{address:'Calle 123',district:'Callao'},
  quote:{deliveryFeePen:2.78,quotedAt:now,destinationKey:'calle 123|callao',distanceSource:'STRAIGHT_LINE'}}
 const context={st,shops:[nogales],deliveryAddressKey:(a,d)=>a.toLowerCase()+'|'+d.toLowerCase()}
 vm.runInNewContext(extract('storeAvailabilitySetting'),context)
 vm.runInNewContext(extract('deliveryQuoteValid'),context)
 assert.equal(context.deliveryQuoteValid(),true)
 st.quote.quotedAt=now-20*60*1000
 assert.equal(context.deliveryQuoteValid(),false)
 st.quote.quotedAt=now;st.quote.deliveryFeePen=null
 assert.equal(context.deliveryQuoteValid(),false)
 st.quote.deliveryFeePen=2.78;st.profile.address='Otra calle'
 assert.equal(context.deliveryQuoteValid(),false)
})
test('dirección abre disponibilidad y cotiza solo si la sede no requiere aprobación',async()=>{
 const st={mode:'delivery',profile:{address:'Av. Argentina 1653',district:'Callao'},configReady:true,store:'',quote:null,stage:'deliveryAddress'};
 const events=[],context={st,deliveryRequestPending:false,deliveryRequestError:'',deliveryAvailability:{status:'IDLE'},
  deliveryLocation:{latitude:nogales.latitude,longitude:nogales.longitude},fulfillmentModal:null,checkoutPending:true,
  render:()=>{},save:()=>{},screen:x=>{st.stage=x;events.push(x)},deliveryAddressKey:(a,d)=>a+'|'+d,
  hasDeliveryDestination:()=>true,fetchConfig:async()=>{events.push('GET')},
  eligibleDeliveryCandidates:()=>{events.push('FILTER');return [{store:nogales}]},storeAvailabilitySetting:()=>false,
  quoteForDeliveryCandidate:()=>{events.push('QUOTE');return {storeId:'nogales',storeName:'Nogales',deliveryFeePen:2.5}}
 };
 vm.runInNewContext(extract('resolveDelivery'),context);
 assert.equal(await context.resolveDelivery(),true);
 assert.deepEqual(events,['availability','GET','FILTER','QUOTE']);
 assert.equal(st.quote.deliveryFeePen,2.5);
 assert.equal(st.store,'nogales');
 assert.equal(context.deliveryAvailability.status,'READY');
 assert.equal(context.checkoutPending,true);
});
test('sin cobertura mantiene dirección y muestra error en la nueva pantalla',async()=>{
 const st={mode:'delivery',profile:{address:'Av. Argentina 1653',district:'Callao'},configReady:true,quote:null,store:'',stage:'deliveryAddress'};
 const events=[],context={st,deliveryRequestPending:false,deliveryRequestError:'',deliveryAvailability:{status:'IDLE'},fulfillmentModal:null,
  deliveryLocation:{latitude:-11.9,longitude:-77.12},render:()=>{},save:()=>{},screen:x=>{st.stage=x;events.push(x)},
  deliveryAddressKey:(a,d)=>a+'|'+d,hasDeliveryDestination:()=>true,fetchConfig:async()=>{},
  eligibleDeliveryCandidates:()=>{throw Error('Fuera del radio de cobertura')}
 };
 vm.runInNewContext(extract('resolveDelivery'),context);
 assert.equal(await context.resolveDelivery(),false);
 assert.deepEqual(events,['availability']);
 assert.equal(context.deliveryAvailability.status,'ERROR');
 assert.match(context.deliveryRequestError,/Fuera del radio/);
 assert.equal(st.profile.address,'Av. Argentina 1653');
});
test('carrito, pago, resumen y confirmar revisan horarios con GET actualizado',async()=>{
 const calls=[]
 const st={mode:'delivery',store:'nogales',pay:'yape',cart:[{id:'p',qty:1}],profile:{},quote:{}}
 const context={
  st,checkoutRefreshPending:false,checkoutReviewNote:'',render:()=>{},
  checkoutSnapshot:()=>({store:st.store,total:2200,items:'p:1:20'}),
  fetchConfig:async({strict})=>{assert.equal(strict,true);calls.push('GET')},
  checkoutCartIssue:()=>'',hasDeliveryDestination:()=>true,
  resolveDelivery:async({silent,skipConfig})=>{assert.equal(silent,true);assert.equal(skipConfig,true);calls.push('LOCAL');return true},
  paymentOptions:()=>[['yape','Yape','']],screen:x=>calls.push(x),save:()=>{},
  finalizeDemoOrder:()=>calls.push('confirmado')
 }
 vm.runInNewContext(extract('revalidateCheckout'),context)
 for(const target of ['cart','payment','summary','confirm'])await context.revalidateCheckout(target)
 assert.deepEqual(calls,['GET','LOCAL','cart','GET','LOCAL','payment','GET','LOCAL','summary','GET','LOCAL','confirmado'])
})
test('si la configuración no se actualiza, anula tarifa anterior y bloquea el pago',async()=>{
 const st={mode:'delivery',store:'nogales',pay:'yape',profile:{},quote:{deliveryFeePen:10}}
 const calls=[]
 const context={
  st,checkoutRefreshPending:false,checkoutReviewNote:'',render:()=>{},
  checkoutSnapshot:()=>({store:'nogales',total:3000,items:'p:1:20'}),
  fetchConfig:async()=>{throw Error('No se pudo actualizar la disponibilidad de locales')},
  save:()=>calls.push('save'),screen:x=>calls.push(x)
 }
 vm.runInNewContext(extract('revalidateCheckout'),context)
 assert.equal(await context.revalidateCheckout('confirm'),false)
 assert.equal(st.quote,null)
 assert.equal(st.store,'')
 assert.deepEqual(calls,['save','deliveryAddress'])
 assert.match(context.checkoutReviewNote,/No se pudo actualizar/)
})
test('cuando cambia la sede o importe justo antes de confirmar exige revisar el total',async()=>{
 const st={mode:'delivery',store:'nogales',pay:'yape',cart:[{id:'p',qty:1}],profile:{},quote:{}}
 const calls=[]
 const context={
  st,checkoutRefreshPending:false,checkoutReviewNote:'',render:()=>{},
  checkoutSnapshot:()=>({store:st.store,total:2200,items:'p:1:20'}),
  fetchConfig:async()=>{calls.push('GET')},checkoutCartIssue:()=>'',hasDeliveryDestination:()=>true,
  resolveDelivery:async()=>{st.store='universal';calls.push('LOCAL');return true},
  paymentOptions:()=>[['yape','Yape','']],screen:x=>calls.push(x),save:()=>{},
  finalizeDemoOrder:()=>calls.push('confirmado')
 }
 vm.runInNewContext(extract('revalidateCheckout'),context)
 assert.equal(await context.revalidateCheckout('confirm'),false)
 assert.deepEqual(calls,['GET','LOCAL','summary'])
 assert.match(context.checkoutReviewNote,/Se actualizó la sede/)
})
test('la compra es demostración: sin cobros ni pedidos enviados al local',()=>{
 assert.match(source,/demo:true/)
 assert.match(source,/no se confirmarán pagos ni se enviarán pedidos/)
 assert.match(source,/revalidateCheckout\('summary'\)/)
 assert.match(source,/revalidateCheckout\('confirm'\)/)
 assert.match(source,/window\.b3DeliveryGpsAddress=/)
})

test('Pide y Retira: local activo, habilitado, con horario conocido y abierto',()=>{
 const context={demoStoreClock:()=>({isOpen:true})}
 vm.runInNewContext(extract('eligibleForPickup'),context)
 const ok={id:'nogales',active:true,pickup_enabled:true,hoursConfigured:true,isOpen:true}
 assert.equal(context.eligibleForPickup(ok),true)
 for(const sample of [
  {...ok,active:false},{...ok,pickup_enabled:false},
  {...ok,isOpen:false},{...ok,hoursConfigured:false},
  {...ok,pickup_enabled:null},null
 ]) assert.equal(context.eligibleForPickup(sample),false)
})
test('seleccionar recojo desde ventana con carrito verifica GET y abre el carrito',async()=>{
 const events=[]
 const selected={id:'nogales',active:true,pickup_enabled:true,hoursConfigured:true,isOpen:true}
 const st={mode:'delivery',store:'',quote:{deliveryFeePen:5},pay:'yape',cash:'100',cart:[{id:'p',qty:1}]}
 const context={
  shops:[selected],st,checkoutRefreshPending:false,checkoutReviewNote:'',checkoutPending:false,fulfillmentModal:'pickup',
  render:()=>{},save:()=>events.push('save'),screen:name=>events.push(name),nav:name=>events.push('nav:'+name),toast:msg=>events.push('toast:'+msg),
  fetchConfig:async({strict})=>{assert.equal(strict,true);events.push('GET')},
  eligibleForPickup:store=>store?.active===true&&store?.pickup_enabled===true&&store?.isOpen===true
 }
 vm.runInNewContext(extract('confirmStore'),context)
 assert.equal(await context.confirmStore('pickup','nogales'),true)
 assert.equal(st.mode,'pickup')
 assert.equal(st.store,'nogales')
 assert.equal(st.quote,null)
 assert.equal(st.pay,'')
 assert.equal(st.cash,'')
 assert.equal(context.fulfillmentModal,null)
 assert.ok(events.indexOf('GET')>=0&&events.indexOf('GET')<events.indexOf('cart'))
 assert.ok(!events.some(x=>x==='identity'||x==='nav:inicio'))
 assert.equal(context.checkoutRefreshPending,false)
})
test('seleccionar local desde listado abre detalle y Continuar verifica nuevamente',async()=>{
 const events=[]
 const selected={id:'nogales',active:true,pickup_enabled:true,hoursConfigured:true,isOpen:true}
 const st={mode:'pickup',store:'',quote:null,pay:'',cart:[]}
 const context={shops:[selected],st,checkoutRefreshPending:false,checkoutReviewNote:'',checkoutPending:false,fulfillmentModal:null,
  render:()=>{},save:()=>{},screen:name=>events.push(name),nav:name=>events.push('nav:'+name),toast:()=>{},
  fetchConfig:async()=>events.push('GET'),eligibleForPickup:()=>true}
 vm.runInNewContext(extract('confirmStore'),context)
 assert.equal(await context.confirmStore('pickup','nogales',{showDetails:true}),true)
 assert.deepEqual(events,['GET','localDetail'])
 assert.equal(await context.confirmStore('pickup','nogales'),true)
 assert.deepEqual(events,['GET','localDetail','GET','nav:carta'])
 assert.match(source,/if\(st\.stage==='localDetail'&&st\.mode==='pickup'\)\{void confirmStore\('pickup',st\.store\);return\}/)
})
test('si el carrito estaba en checkout y se elige recojo, pasa a datos solo después del GET',async()=>{
 const events=[]
 const selected={id:'nogales',active:true,pickup_enabled:true,hoursConfigured:true,isOpen:true}
 const st={mode:'pickup',store:'',quote:null,pay:'',cart:[{id:'p',qty:1}]}
 const context={shops:[selected],st,checkoutRefreshPending:false,checkoutReviewNote:'',checkoutPending:true,fulfillmentModal:null,
  render:()=>{},save:()=>{},screen:name=>events.push(name),nav:name=>events.push('nav:'+name),toast:()=>{},
  fetchConfig:async()=>events.push('GET'),eligibleForPickup:()=>true,checkoutCartIssue:()=>''}
 vm.runInNewContext(extract('confirmStore'),context)
 assert.equal(await context.confirmStore('pickup','nogales'),true)
 assert.deepEqual(events,['GET','identity'])
 assert.equal(context.checkoutPending,false)
})
test('local cerrado entre selección y confirmación no se acepta ni permite avanzar',async()=>{
 const events=[]
 const selected={id:'nogales',active:true,pickup_enabled:true,hoursConfigured:true,isOpen:true}
 const st={mode:'pickup',store:'',quote:null,pay:'',cart:[]}
 const context={shops:[selected],st,checkoutRefreshPending:false,checkoutReviewNote:'',checkoutPending:true,fulfillmentModal:null,
  render:()=>{},save:()=>{},screen:name=>events.push(name),nav:()=>{throw Error('Must not navigate to catalog')},toast:()=>{},
  fetchConfig:async()=>{events.push('GET');selected.isOpen=false},
  eligibleForPickup:store=>store?.isOpen===true&&store?.pickup_enabled===true}
 vm.runInNewContext(extract('confirmStore'),context)
 assert.equal(await context.confirmStore('pickup','nogales'),false)
 assert.deepEqual(events,['GET','locations'])
 assert.equal(st.store,'')
 assert.match(context.checkoutReviewNote,/cerrado/)
 assert.equal(context.checkoutRefreshPending,false)
})
test('si falla la API de locales al elegir recojo, no se confirma la sede',async()=>{
 const events=[]
 const selected={id:'nogales',active:true,pickup_enabled:true,hoursConfigured:true,isOpen:true}
 const st={mode:'pickup',store:'',quote:null,pay:'',cart:[]}
 const context={shops:[selected],st,checkoutRefreshPending:false,checkoutReviewNote:'',checkoutPending:true,fulfillmentModal:null,
  render:()=>{},save:()=>{},screen:name=>events.push(name),nav:()=>{throw Error('Must not continue')},toast:()=>{},
  fetchConfig:async()=>{throw Error('API de locales temporalmente no disponible')},eligibleForPickup:()=>true}
 vm.runInNewContext(extract('confirmStore'),context)
 assert.equal(await context.confirmStore('pickup','nogales'),false)
 assert.deepEqual(events,['locations'])
 assert.equal(st.store,'')
 assert.match(context.checkoutReviewNote,/API de locales/)
})
test('recojo muestra exclusivamente métodos de pago pickup publicados',()=>{
 const context={st:{mode:'pickup',configReady:true,store:'nogales',quote:null},
  shops:[{id:'nogales',paymentMethods:{pickup:[],delivery:['yape','card']}}]}
 vm.runInNewContext(extract('paymentOptions'),context)
 assert.deepEqual(Array.from(context.paymentOptions()),[])
 context.shops[0].paymentMethods.pickup=['yape','plin']
 assert.deepEqual(Array.from(context.paymentOptions(),x=>x[0]),['yape','plin'])
 context.st.configReady=false
 assert.deepEqual(Array.from(context.paymentOptions()),[])
 assert.match(source,/no tiene métodos de pago publicados/)
})
test('recojo tiene total igual al subtotal y nunca aplica cargo delivery',()=>{
 const context={st:{mode:'pickup',quote:{deliveryFeePen:15}},subtotal:()=>13,deliveryQuoteValid:()=>true}
 vm.runInNewContext(extract('orderTotal'),context)
 assert.equal(context.orderTotal(),13)
})
test('recojo consulta de nuevo locales y horarios al pago, resumen y confirmación',async()=>{
 const calls=[],selected={id:'nogales',active:true,pickup_enabled:true,hoursConfigured:true,isOpen:true}
 const st={mode:'pickup',store:'nogales',cart:[{id:'p',qty:1}],pay:'yape',cash:'',quote:null}
 const context={shops:[selected],st,checkoutRefreshPending:false,checkoutReviewNote:'',render:()=>{},
  checkoutSnapshot:()=>({store:st.store,total:1300,items:'p:1:13'}),
  fetchConfig:async({strict})=>{assert.equal(strict,true);calls.push('GET')},
  checkoutCartIssue:()=>'',eligibleForPickup:store=>store?.isOpen===true,
  paymentOptions:()=>[['yape','Yape','']],save:()=>{},screen:name=>calls.push(name),
  finalizeDemoOrder:()=>calls.push('confirmado')}
 vm.runInNewContext(extract('revalidateCheckout'),context)
 for(const stage of ['payment','summary','confirm'])assert.equal(await context.revalidateCheckout(stage),true)
 assert.deepEqual(calls,['GET','payment','GET','summary','GET','confirmado'])
 assert.doesNotMatch(source,/\/api\/v1\/mobile\/fulfillment\/resolve/)
})
test('cierre de sede antes de confirmar recojo bloquea el pedido',async()=>{
 const calls=[],selected={id:'nogales',active:true,pickup_enabled:true,hoursConfigured:true,isOpen:true}
 const st={mode:'pickup',store:'nogales',cart:[{id:'p',qty:1}],pay:'yape',quote:null}
 const context={shops:[selected],st,checkoutRefreshPending:false,checkoutReviewNote:'',render:()=>{},
  checkoutSnapshot:()=>({store:st.store,total:1300,items:'p:1:13'}),
  fetchConfig:async()=>{selected.isOpen=false;calls.push('GET')},
  checkoutCartIssue:()=>'',eligibleForPickup:store=>store?.isOpen===true,
  screen:name=>calls.push(name),save:()=>{},
  finalizeDemoOrder:()=>calls.push('confirmado')}
 vm.runInNewContext(extract('revalidateCheckout'),context)
 assert.equal(await context.revalidateCheckout('confirm'),false)
 assert.deepEqual(calls,['GET','locations'])
 assert.match(context.checkoutReviewNote,/ya no está abierto/)
})
test('si falla un GET previo al pago de recojo vuelve a la selección y bloquea confirmación',async()=>{
 const calls=[],st={mode:'pickup',store:'nogales',pay:'yape',quote:null}
 const context={st,checkoutRefreshPending:false,checkoutReviewNote:'',render:()=>{},
  checkoutSnapshot:()=>({store:'nogales',total:1300,items:'p:1:13'}),
  fetchConfig:async()=>{throw Error('No se pudo actualizar la disponibilidad de locales')},
  screen:name=>calls.push(name),save:()=>{},finalizeDemoOrder:()=>calls.push('confirmado')}
 vm.runInNewContext(extract('revalidateCheckout'),context)
 assert.equal(await context.revalidateCheckout('confirm'),false)
 assert.deepEqual(calls,['locations'])
 assert.match(context.checkoutReviewNote,/No se pudo actualizar/)
})

test('se advierte antes del pago cuando una sede de recojo no tiene pagos publicados',()=>{
 const selected={id:'nogales',active:true,pickup_enabled:true,hoursConfigured:true,isOpen:true,paymentMethods:{pickup:[]}}
 const context={st:{configReady:true},eligibleForPickup:()=>true}
 vm.runInNewContext(extract('pickupPaymentConfigured'),context)
 vm.runInNewContext(extract('pickupPaymentWarning'),context)
 assert.equal(context.pickupPaymentConfigured(selected),false)
 assert.match(context.pickupPaymentWarning(selected),/no tiene medios de pago habilitados/)
 selected.paymentMethods.pickup=['yape']
 assert.equal(context.pickupPaymentConfigured(selected),true)
 assert.equal(context.pickupPaymentWarning(selected),'')
 assert.match(source,/pickupPaymentWarning\(s\)/)
 assert.match(source,/data-modal-pickstore=/)
 assert.match(source,/data-pickstore=/)
})
test('selector de local y continuar se bloquean mientras se consulta la disponibilidad',()=>{
 assert.match(source,/data-pickstore="\$\{esc\(s\.id\)\}" \$\{checkoutRefreshPending\?'disabled':''\}/)
 assert.match(source,/data-modal-pickstore="\$\{esc\(s\.id\)\}" \$\{checkoutRefreshPending\?'disabled':''\}/)
 assert.match(source,/data-start="1" \$\{checkoutRefreshPending\?'disabled':''\}/)
})

test('Pide y Retira muestra la hora de cierre publicada correctamente',()=>{
 const context={esc:x=>String(x)}
 vm.runInNewContext(extract('storeStatusHtml'),context)
 const result=context.storeStatusHtml({hoursConfigured:true,isOpen:true,closesAt:'23:00'})
 assert.match(result,/Abierto/)
 assert.match(result,/Hasta las 23:00/)
 assert.match(context.storeStatusHtml({hoursConfigured:true,isOpen:false,closesAt:null}),/Cerrado/)
 assert.equal(context.storeStatusHtml({hoursConfigured:false,isOpen:false}), '')
})

test('revisión 12: Tallanes publicado y habilitado, pero cerrado el jueves, no se cotiza',()=>{
 const tallanesRevision12={
  id:'ab05c102-7850-419f-ad0c-829dce200f39',name:'Tallanes',active:true,
  latitude:-12.0506625,longitude:-77.1038664,radiusKm:4,
  hoursConfigured:true,isOpen:false,openingHours:{thu:{closed:true}},
  delivery_enabled:true,deliveryPricingMode:'PER_KM',deliveryRatePerKmPen:3,
  paymentMethods:{delivery:[]}
 }
 assert.throws(
  ()=>quote([tallanesRevision12],destination(-12.0506625,-77.1038664)),
  /Tallanes está cerrado en este momento\. No hay otros locales abiertos publicados para delivery/
 )
})
test('apertura y cobertura se distinguen: Tallanes abierto dentro de 4 km sí calcula',()=>{
 const store={...tallanes,isOpen:true,hoursConfigured:true,active:true,delivery_enabled:true,
  radiusKm:4,deliveryRatePerKmPen:3}
 const result=quote([store],destination(-12.0406625,-77.1038664))
 assert.equal(result.storeId,'tallanes')
 assert.equal(result.deliveryPricingMode,'PER_KM')
 assert.ok(result.deliveryFeePen>0)
 assert.ok(result.deliveryFeePen<4)
})
test('apertura sin cobertura informa que el destino está fuera de radio',()=>{
 assert.throws(()=>quote([nogales],destination(-11.95,-77.12)),/fuera del radio de cobertura/)
})
test('local abierto sin tarifa publicada presenta error de configuración',()=>{
 assert.throws(()=>quote([{...nogales,deliveryRatePerKmPen:null}],destination(nogales.latitude,nogales.longitude)),/no tienen coordenadas o tarifas válidas/)
})
test('la API solo publica una sede sin delivery habilitado: no se inventan locales',()=>{
 assert.throws(()=>quote([{...tallanes,delivery_enabled:false}],destination(tallanes.latitude,tallanes.longitude)),/No hay locales habilitados/)
})
