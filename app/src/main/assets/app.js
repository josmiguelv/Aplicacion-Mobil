/* POLLOS B3 — Aplicación Android: catálogo publicado, solicitudes y seguimiento de pedidos. */
(()=>{'use strict';
const K='b3-v6-demo-20261110', root=document.getElementById('app');
const products=[]; // Solo productos publicados por la API.
// Los locales se reciben exclusivamente desde el catálogo publicado en la web administrativa.
const shops=[]; // Solo locales publicados por la API.


let scheduleReturnToModal=false;
let st={coords:null,quote:null,configReady:false,stage:'splash',tab:'inicio',category:'Todos',cart:[],orders:[],favorite:null,orderContactDraft:null,deliveryContactConfirmed:false,addresses:[],defaultAddressId:null,profile:{first:'',last:'',phone:'',doc:'',email:'',address:'',reference:''},registered:false,authProvider:'',authUid:'',authDisplayName:'',authGoogleEmail:'',mode:'',scheduleMode:'now',reservationAt:'',reservationCashExact:true,reservationCashAmount:'',pickupOrigin:'',fulfillment:'',store:'',pay:'yape',cash:'',selected:'',qty:1,carousel:0,promo:0,local:0,chat:[],last:'',step:'',notice:'',consent:false};
try{const d=JSON.parse(localStorage.getItem(K)||'{}');st={...st,...d,stage:'splash',tab:'inicio',selected:'',notice:'',configReady:false,quote:null}}catch{}
// The person receiving a new order must confirm their own contact again.
// Draft data from an earlier app run must never authorize another order.
if(st.authProvider==='google')st.registered=false; // Confirmed by native Firebase on startup.
st.orderContactDraft=null;
st.deliveryContactConfirmed=false;
if(!['','delivery','pickup'].includes(st.mode))st.mode='';
if(!['now','reservation'].includes(st.scheduleMode))st.scheduleMode='now';
if(typeof st.reservationAt!=='string')st.reservationAt='';
// Explicit pickup choice; legacy default 'now' is not proof the customer selected it.
if(typeof st.pickupScheduleSelected!=='boolean')st.pickupScheduleSelected=false; // Retirado de la navegación de Pollos B3 V11.
// Preserve the existing first-entry preference across application updates.
let enteredBefore=localStorage.getItem('b3-visitor-entered-v9')==='1';
let loginFromAccount=false;
let googleSignInPending=false;
let addressEditId=null;
let selectedOrderId=null,reviewSheetOrderId=null,favoritePromptOrderId=null,deliveredNoticeOrderId=null,reviewScore=0,reviewTags=[];
let reviewSending=false,reviewSendError='';
let fulfillmentModal=null; // null | choose | delivery | pickup; transient UI state, never persisted
let fulfillmentOutcomeNote=''; // Terminal outcome only; never initiates a new request.
let checkoutPending=false; // only when the client has explicitly chosen to continue the cart
let checkoutCancelInFlight=false; // prevent duplicate cancellation calls to the same request
let checkoutRefreshPending=false,checkoutReviewNote=''; // fresh availability at each checkout gate
let deliveryRequestPending=false,deliveryRequestError=''; // visible state while validating the address
let deliveryAvailability={status:'IDLE',storeName:'',candidateNames:[],message:''};
let deliveryValidationStep='INICIO'; // Diagnostic only; never advances interaction or decides acceptance.
let deliveryValidationGeneration=0; // not persisted or treated as an agent decision
let deliveryHealthPending=false,deliveryHealthMessage=''; // transient read-only backend diagnostic
let deliveryGpsRequested=false,deliveryLocation=null,deliveryGeocodeTask=null,deliveryGeocodeSequence=0;
let deliveryGpsPending=false,deliveryGpsMessage='',deliveryGpsToken='';
// Explicit customer review for each new request (never reused after changes).
let confirmedDeliveryReviewKey=null;
// Geocoded coordinates are transient; never reuse GPS collected for store distances.
function deliveryAddressKey(address,district){return String(address||'').trim().toLowerCase()+'|'+String(district||'').trim().toLowerCase()}
function hasDeliveryDestination(address,district){
 return !!deliveryLocation&&deliveryLocation.key===deliveryAddressKey(address,district)&&
  Number.isFinite(deliveryLocation.latitude)&&Number.isFinite(deliveryLocation.longitude);
}
function geocodeDeliveryDestination(address,district){
 if(!window.AndroidBridge?.geocodeDeliveryAddress)
  return Promise.reject(Error('No es posible ubicar esta dirección en esta versión. Actualiza la app o usa GPS en el punto de entrega.'));
 const token=String(++deliveryGeocodeSequence);
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{if(deliveryGeocodeTask?.token===token){deliveryGeocodeTask=null;reject(Error('No se pudo ubicar la dirección. Verifica la calle y usa GPS si estás en el destino.'))}},12000);
  deliveryGeocodeTask={token,resolve:value=>{clearTimeout(timer);deliveryGeocodeTask=null;resolve(value)},reject:error=>{clearTimeout(timer);deliveryGeocodeTask=null;reject(Error(error))}};
  try{window.AndroidBridge.geocodeDeliveryAddress(JSON.stringify({token,address,district}))}
  catch(e){clearTimeout(timer);deliveryGeocodeTask=null;reject(Error('No se pudo iniciar la localización de la dirección.'))}
 });
}
window.b3DeliveryAddressGeocoded=(token,latitude,longitude,error)=>{
 const task=deliveryGeocodeTask;
 if(!task||task.token!==String(token))return;
 if(error||!Number.isFinite(latitude)||!Number.isFinite(longitude)){
  task.reject(error||'La dirección no tiene coordenadas verificables. Utiliza GPS en el destino.');
  return;
 }
 task.resolve({latitude,longitude,source:'address'});
};
let selectedHomeStore=null;
let homeLocationPrompted=false;
let storeGeocoding=false;
// Invitación voluntaria por instalación, después del primer ingreso a Inicio.
const MARKETING_PROMPT_KEY='b3-marketing-prompt-v1';
let marketingPromptVisible=false,marketingPromptScheduled=false;
function marketingPromptEligible(){
 if(!window.AndroidBridge?.setMarketingNotificationsEnabled||localStorage.getItem(MARKETING_PROMPT_KEY))return false;
 if(window.AndroidBridge.marketingNotificationsEnabled?.()){
  localStorage.setItem(MARKETING_PROMPT_KEY,'enabled');return false;
 }
 return st.stage==='app'&&st.tab==='inicio'&&!fulfillmentModal&&!selectedHomeStore&&!favoritePromptOrderId&&!reviewSheetOrderId;
}
function scheduleMarketingPrompt(){
 if(marketingPromptVisible||marketingPromptScheduled||!marketingPromptEligible())return;
 marketingPromptScheduled=true;
 setTimeout(()=>{
  marketingPromptScheduled=false;
  if(!marketingPromptVisible&&marketingPromptEligible()){marketingPromptVisible=true;render()}
 },900);
}
function marketingPrompt(){
 if(!marketingPromptVisible||st.stage!=='app'||st.tab!=='inicio')return '';
 return `<div class="b3-marketing-overlay"><section class="b3-marketing-dialog" role="dialog" aria-modal="true" aria-labelledby="b3-marketing-title" aria-describedby="b3-marketing-description">
 <div class="b3-marketing-dialog-icon" aria-hidden="true">${ic('bell',30)}</div>
 <span class="b3-marketing-eyebrow">POLLOS B3 · NOVEDADES</span>
 <h2 id="b3-marketing-title">¡Que no se te escape ninguna oferta!</h2>
 <p id="b3-marketing-description">Entérate de nuestras promociones y novedades directamente en tu celular. Tú decides cuándo recibir avisos.</p>
 <button type="button" class="b3-marketing-accept" data-marketing-first-accept="1">Activar notificaciones</button>
 <button type="button" class="b3-marketing-later" data-marketing-first-later="1">Ahora no</button>
 <small>Puedes cambiar tu elección en Mi Cuenta → Notificaciones.</small>
 </section></div>`;
}

const enterApp=()=>{
 localStorage.setItem('b3-visitor-entered-v9','1');enteredBefore=true;nav('inicio');
 const pending=window.B3OrderAvailability?.readInteraction?.();
 if(st.mode!=='delivery'||!pending||!['PREPARED','SUBMITTING','PENDING','ACCEPTED'].includes(pending.status))return;
 void (async()=>{
  try{
   await fetchConfig({strict:true});
   if(st.stage!=='app'||!interactionMatchesCart(pending,st.profile.address,st.profile.district))return;
   st.stage='availability';save();render();
   void resolveDelivery({silent:true,skipConfig:true});
  }catch(_){/* A lost network must not create another interaction or authorize payment. */}
 })();
};
const icons={heart:'<path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8z"/>',home:'<path d="m3 10 9-7 9 7v10h-6v-6H9v6H3z"/>',menu:'<path d="M5 5h14M5 10h14M5 15h14M5 20h14"/>',orders:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 9h6M9 13h6"/>',account:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3-7 8-7s8 3 8 7"/>',chat:'<path d="M21 11a8 8 0 0 1-8 8 9 9 0 0 1-4-.9L3 21l2-5a8 8 0 1 1 16-5z"/>',back:'<path d="m15 5-7 7 7 7"/>',cart:'<path d="M3 4h2l2 12h11l3-9H6M10 21h.01M18 21h.01"/>',close:'<path d="m5 5 14 14M19 5 5 19"/>',pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',chev:'<path d="m9 5 7 7-7 7"/>',bike:'<circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M7 17l4-8 5 8M11 9H7M14 7h4l2 3"/>',store:'<path d="M3 10V5h18v5l-2 3H5zM5 13v8h14v-8M9 21v-6h6v6"/>',check:'<path d="m4 12 5 5 11-11"/>',card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2l-2 2v2M12 18h.01"/>',minus:'<path d="M5 12h14"/>',plus:'<path d="M5 12h14M12 5v14"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3-7 8-7s8 3 8 7"/>',trash:'<path d="M4 7h16M10 4h4M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',mail:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="m2 7 10 7 10-7"/>',bell:'<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4"/>',shield:'<path d="M12 2 4 6v6c0 5 4 8 8 10 4-2 8-5 8-10V6z"/>',book:'<path d="M3 4h8v16H3zM13 4h8v16h-8z"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',phone:'<path d="M7 3 4 6c0 8 6 14 14 14l3-3-5-4-3 3a12 12 0 0 1-5-5l3-3z"/>'};
const ic=(n,s=22)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[n]||icons.info}</svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cash=n=>'S/ '+Number(n).toFixed(2), photo=p=>p?.imageUrl&&(/^https:\/\//.test(p.imageUrl)||p.imageUrl.startsWith('/api/v1/mobile/images/'))?(p.imageUrl.startsWith('/')?API_BASE+p.imageUrl:p.imageUrl):null;
// App ID is registered by the super administrator. An app ID maps to exactly one tenant on the server.
const APP_ID='com.integrab2g.pollosb3';
// Configure only an HTTPS address when the admin server is deployed; never place credentials in Android.
const API_BASE=(()=>{
 const raw=window.AndroidBridge?.getApiBase?.()||'';
 return /^https:\/\//.test(raw)?raw.replace(/\/+$/,''):'';
})();
// El catálogo y las vacantes se obtienen de la API del Administrador.
let catalogPublished=false;
const NOTIFICATIONS_API_BASE=(()=>{const raw=window.AndroidBridge?.getNotificationsApiBase?.()||'';return /^https:\/\//.test(raw)?raw.replace(/\/+$/,''):''})();
let commercialNotifications=[],notificationsLoading=false,notificationsError='',notificationsRequestId=0;
let notificationsLoaded=false,selectedNotificationId='',pendingPushNotificationId='';
const NOTIFICATIONS_READ_KEY='b3-commercial-read-v1';
let readNotificationIds=[];
try{const value=JSON.parse(localStorage.getItem(NOTIFICATIONS_READ_KEY)||'[]');if(Array.isArray(value))readNotificationIds=value.filter(v=>typeof v==='string').slice(-400)}catch{}
const GENERAL_NOTICE_LIFETIME_MS=7*24*60*60*1000;
const MAX_VISIBLE_NOTIFICATIONS=20;
function notificationIsCurrent(n,now=Date.now()){
 if(!n||typeof n.id!=='string')return false;
 const scheduled=n.scheduledAt?Date.parse(n.scheduledAt):NaN;
 const expiry=n.expiresAt?Date.parse(n.expiresAt):NaN;
 if(Number.isFinite(scheduled)&&scheduled>now)return false;
 if(n.expiresAt)return Number.isFinite(expiry)&&expiry>now;
 // Without an explicit end, keep a general notice for 7 days from its publication.
 // A record without a valid publication date cannot be safely timed.
 return Number.isFinite(scheduled)&&scheduled+GENERAL_NOTICE_LIFETIME_MS>now;
}
function liveNotifications(){
 return commercialNotifications.filter(n=>notificationIsCurrent(n))
  .sort((a,b)=>Date.parse(b.scheduledAt||'')-Date.parse(a.scheduledAt||''))
  .slice(0,MAX_VISIBLE_NOTIFICATIONS);
}
function notificationUnreadCount(){return liveNotifications().filter(n=>!readNotificationIds.includes(n.id)).length}
function markNotificationRead(id){
 if(typeof id!=='string'||!id)return;
 if(!readNotificationIds.includes(id)){
  readNotificationIds=[...readNotificationIds,id].slice(-400);
  localStorage.setItem(NOTIFICATIONS_READ_KEY,JSON.stringify(readNotificationIds));
 }
 window.AndroidBridge?.markMarketingNotificationRead?.(id);
}
function openNotificationDetail(id){
 if(!id||typeof id!=='string')return;
 selectedNotificationId=id;
 const item=liveNotifications().find(n=>n.id===id);
 if(item)markNotificationRead(item.id);
 st.stage='notificationDetail';window.scrollTo({top:0});render();
 if(!notificationsLoaded||notificationsError)void fetchNotifications();
}
function openPushNotification(id){
 marketingPromptVisible=false;
 if(typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id)){
  pendingPushNotificationId=id;
  selectedNotificationId=id;
  st.stage='notificationDetail';
  window.scrollTo({top:0});
  // Poner en estado de carga antes del primer render, evitando mostrar 'vencida' prematuramente.
  void fetchNotifications();
 }else screen('notifications');
}
// The API exposes raw product UUIDs; the Android catalog namespaces them as 'api:<uuid>'.
function notificationLinkedProduct(item){
 const id=typeof item?.productId==='string'?item.productId.trim():'';
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return null;
 const candidate=product('api:'+id);
 return candidate&&candidate.isPublished===true&&!candidate.disabled?candidate:null;
}
function notificationDetailScreen(){
 const item=liveNotifications().find(n=>n.id===selectedNotificationId);
 if(item){
  const linkedProduct=notificationLinkedProduct(item);
  const linkedProductId=linkedProduct?.id||'';
  const canOrderProduct=!!linkedProduct;
  const checkingLinkedProduct=!!item.productId&&!catalogRequestFinished;
  return `<div class="page b3-notification-detail">${heading('Detalle de novedad','notifications')}
   ${item.imageUrl?`<img class="b3-notification-detail-image" src="${esc(item.imageUrl)}" alt="Imagen de ${esc(item.title)}">`:''}
   <span class="b3-notification-kicker">NOVEDAD DE POLLOS B3</span>
   <h1>${esc(item.title)}</h1>
   <p class="b3-notification-copy">${esc(item.message).replace(/\n/g,'<br>')}</p>
   ${item.expiresAt&&Number.isFinite(Date.parse(item.expiresAt))?`<p class="b3-notification-validity">Disponible hasta ${esc(new Date(item.expiresAt).toLocaleString('es-PE',{timeZone:'America/Lima',dateStyle:'medium',timeStyle:'short'}))}</p>`:''}
   ${checkingLinkedProduct?`<button class="primary full" type="button" disabled>Cargando producto...</button>`:canOrderProduct?`<button class="primary full" data-product="${esc(linkedProductId)}">Ver ${esc(linkedProduct.name)} y pedir</button>`:`<button class="primary full" data-notification-catalog="1">Explorar la carta</button>`}
   <button class="outline full" data-screen="notifications">Ver todas las notificaciones</button>
   <p class="smallprint">Los productos, precios y disponibilidad se confirman en la carta actual. La oferta no se aplica automáticamente al carrito.</p>
  </div>`;
 }
 return `<div class="page b3-notification-detail">${heading('Detalle de novedad','notifications')}
  <div class="b3-notification-unavailable">${ic('bell',30)}<h2>${notificationsLoading?'Buscando la promoción...':notificationsError?'No pudimos consultar esta promoción':'Esta promoción ya no está disponible'}</h2>
  <p>${notificationsLoading?'Estamos comprobando su vigencia.':notificationsError?'Comprueba tu conexión y vuelve a intentar.':'Puede haber finalizado o haber sido retirada por Pollos B3.'}</p></div>
  ${notificationsError?'<button class="outline full" data-notifications-refresh="1">Reintentar</button>':''}
  <button class="primary full" data-notification-catalog="1">Ver la carta actual</button>
  <button class="outline full" data-screen="notifications">Ver otras novedades</button>
 </div>`;
}

// La lista de locales permanece vacía hasta que la API devuelva sus registros.
let publishedRevision=0;
let catalogRequestFinished=false;
let publishedPaymentImages={};
let publishedPaymentWaitMinutes=10;
let publishedReminderCount=2;
let receiptPreviewUrl='';
let receiptFileSelected=false;
let paymentFormBusy=false,paymentFormError='',paymentDecisionBusy=false,paymentDecisionTimer=null;
let splashLoadError=false;
let splashRequestPending=false;
let publishedPromotions=[];
let publishedVacancies=[];
let complaintsBookUrl=null;
// Vacancies are displayed only when supplied by the published API.
function visibleVacancies(){return publishedVacancies}
let selectedVacancyId=null;

const storeAllowed=(s,m)=>!!s&&s.active!==false&&(m==='delivery'?s.delivery_enabled!==false:m==='pickup'?s.pickup_enabled!==false:s.dine_in_enabled===true);
function availableStores(m){return shops.filter(s=>s.active!==false)}

function eligibleForPickup(s){return !!s&&s.active!==false&&s.pickup_enabled===true&&
 (s.hoursConfigured===true&&s.isOpen===true)}
function pickupPaymentConfigured(s){
 return Array.isArray(s?.paymentMethods?.pickup)&&
  s.paymentMethods.pickup.some(m=>['yape','plin','card','cash'].includes(m));
}
function pickupPaymentWarning(s){
 return st.configReady&&eligibleForPickup(s)&&!pickupPaymentConfigured(s)
  ?'<p class="smallprint">Este local no tiene medios de pago habilitados para recojo. Puedes ver la carta, pero no finalizar el pedido de prueba hasta que la administración los publique.</p>'
  :'';
}
function storeStatusHtml(s){
 if(s.hoursConfigured!==true)return '';
 const state=s.isOpen===true?'Abierto':'Cerrado';
 const until=s.isOpen===true&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s.closesAt||'')?' · Hasta las '+esc(s.closesAt):'';
 return '<span class="pickup-status '+(s.isOpen===true?'open':'closed')+'">'+state+until+'</span>';
}
function straightDistanceKm(s){
 if(!st.coords||!Number.isFinite(st.coords.lat)||!Number.isFinite(st.coords.lng)||
  !Number.isFinite(Number(s.latitude))||!Number.isFinite(Number(s.longitude))||s.latitude==null||s.longitude==null)return '';
 const rad=x=>x*Math.PI/180,dLat=rad(Number(s.latitude)-st.coords.lat),dLon=rad(Number(s.longitude)-st.coords.lng);
 const a=Math.sin(dLat/2)**2+Math.cos(rad(st.coords.lat))*Math.cos(rad(Number(s.latitude)))*Math.sin(dLon/2)**2;
 return (6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))).toFixed(1)+' km aprox. en línea recta';
}
const prefetchedPaymentImages=new Set();
function paymentImageUrl(method){
 const selected=shops.find(x=>String(x.id)===String(st.store));
 const storeUrl=selected?.paymentOptions?.[st.mode]?.find(x=>x?.method===method)?.imageUrl;
 const raw=storeUrl||publishedPaymentImages[method];
 if(typeof raw!=='string'||!/^\/api\/v1\/mobile\/images\/[a-zA-Z0-9/_-]+$/.test(raw))return '';
 return API_BASE+raw;
}
function pickupPaymentReady(){
 const e=window.B3OrderAvailability?.readInteraction?.();
 return st.mode==='pickup'&&e?.orderForm?.title==='VALIDACIÓN DE RECOJO'&&
  e.body?.storeId===st.store&&e.status==='ACCEPTED'&&e.agentDecision==='ACCEPTED'&&
  e.messageDelivered===true&&Date.parse(e.paymentExpiresAt||'')>Date.now();
}
function pickupPaymentForm(imageUrl=''){
 if(!pickupPaymentReady())throw Error('La tienda debe aceptar el recojo antes del pago.');
 const entry=window.B3OrderAvailability.readInteraction();
 const original=entry.orderForm.fields;
 const items=st.cart.map(x=>{const p=product(x.id);return {name:p?.name,quantity:x.qty,unitPrice:p?.price};});
 const fields=Object.fromEntries(original.map(x=>[x.variable,x.value]));
 return window.B3PickupOrderContract.payment({
  storeName:fields['Tienda de recojo'],when:fields.Modalidad==='Recojo programado'?'scheduled':'now',
  dateTime:fields['Fecha y hora'],items,orderCode:orderPublicCode(entry),method:st.pay,
  cashAmount:st.cash,imageUrl});
}
function paymentConfirmationForm(imageUrl=''){
 requireImmediateOrderFlow();
 const names={yape:'YAPE',plin:'PLIN',card:'TARJETA'};
 if(st.pay!=='cash'&&!names[st.pay])throw Error('Metodo no compatible con comprobante');
 const items=st.cart.map(item=>{const p=product(item.id);return (p?.name||'Producto')+' x'+item.qty}).join(', ');
 const entry=window.B3OrderAvailability?.readInteraction?.();
 if(!entry?.interactionId)throw Error('Falta el identificador confirmado del pedido.');
 const fields=[
  {variable:'N.º de pedido',value:orderPublicCode(entry)},
  {variable:'Pedido',value:items},
  {variable:'Subtotal',value:cash(subtotal())},
  {variable:'Delivery',value:cash(st.quote?.deliveryFeePen??0)},
  {variable:'Dirección',value:[st.profile.address,st.profile.district].filter(Boolean).join(', ')},
  {variable:'Total',value:cash(orderTotal())}
 ];
 if(st.scheduleMode==='reservation'){const when=window.B3ReservationForms.schedule(st.reservationAt);fields.unshift({variable:'Fecha',value:when.date+' · '+(()=>{const [h,m]=st.reservationAt.split('T')[1].split(':').map(Number);return (h%12||12)+':'+String(m).padStart(2,'0')+' '+(h<12?'a. m.':'p. m.');})()});}
 if(st.pay==='cash'){const total=Math.round(orderTotal()*100),amount=Math.round(Number(st.cash)*100);if(!Number.isSafeInteger(amount)||amount<total)throw Error('Ingresa un monto igual o mayor al total.');fields.push({variable:'Paga con',value:cash(amount/100)},{variable:'Vuelto',value:cash((amount-total)/100)});return {type:'FORM',form:{title:st.scheduleMode==='reservation'?'PAGO DE RESERVA - EFECTIVO':'PAGO AL RECIBIR',subtitle:'Confirmar pedido con pago en efectivo',fields}};}
 if(fields.length>10||fields.some(f=>!f.value||f.value.length>500))throw Error('El formulario de pago requiere seis campos válidos');
 return {type:'FORM',form:{title:(st.scheduleMode==='reservation'?'PAGO DE RESERVA - ':'PAGO REALIZADO - ')+names[st.pay],
  subtitle:'Comprobante adjunto',...(imageUrl?{imageUrl}:{}),fields}};
}
function paymentOptions(){
 const choices=[['yape','Yape','Pago digital sujeto a integración'],['plin','Plin','Pago digital sujeto a integración'],['card','Tarjeta','Pasarela de pago pendiente'],['cash','Pago al recibir','En efectivo, con cálculo de vuelto']];
 if(!st.configReady)return []; // No published store or payment methods: never assume enabled.
 const selected=shops.find(x=>String(x.id)===String(st.store));
 const selectedMethods=selected?.paymentMethods?.[st.scheduleMode==='reservation'&&st.mode!=='delivery'?'reservation':st.mode];
 const quotedMethods=st.mode==='delivery'&&Array.isArray(st.quote?.paymentMethods)?st.quote.paymentMethods:null;
 const published=Array.isArray(selectedMethods)&&Array.isArray(quotedMethods)?selectedMethods.filter(m=>quotedMethods.includes(m)):selectedMethods||quotedMethods;
 return Array.isArray(published)?choices.filter(x=>published.includes(x[0])):[];
}
function productsFromApi(rows){
 if(!Array.isArray(rows))return [];
 const seen=new Set();
 return rows.flatMap(x=>{
  if(!x||typeof x.id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(x.id.trim())||typeof x.name!=='string'||!x.name.trim()||x.active===false||x.isActive===false||x.enabled===false)return [];
  // Preserve the API identifier namespace used by persisted carts and orders.
  const id='api:'+x.id.trim();
  if(seen.has(id))return [];
  seen.add(id);
  const price=x.pricePen==null?NaN:Number(x.pricePen);
  const image=x.image_url||x.imageUrl||'';
  const imageUrl=typeof image==='string'&&(/^https:\/\/[^\s"'<>]+$/i.test(image)||/^\/api\/v1\/mobile\/images\/[a-zA-Z0-9/_-]+$/.test(image))?image:'';
  return [{
   id,name:x.name.trim(),desc:typeof x.description==='string'?x.description:'',
   cat:typeof x.category==='string'&&x.category.trim()?x.category.trim():'Otros',
   price:Number.isFinite(price)&&price>=0?price:0,
   disabled:!Number.isFinite(price)||price<=0,
   imageUrl,isPublished:true,pic:1
  }];
 });
}
async function fetchConfig({strict=false}={}){
 if(!API_BASE){if(strict)throw Error('API de locales no configurada');return false}
 try{
  const controller=strict?new AbortController():null;
  const timeout=controller?setTimeout(()=>controller.abort(),15000):null;
  let r;
  try{r=await fetch(API_BASE+'/api/v1/mobile/config?appId='+encodeURIComponent(APP_ID),{cache:'no-store',...(controller?{signal:controller.signal}:{})})}
  finally{if(timeout)clearTimeout(timeout)}
  if(!r.ok)throw Error('El Administrador respondió HTTP '+r.status+' al consultar el catálogo.');
  const c=await r.json();
  if(!c.ready||!Array.isArray(c.stores))throw Error('El Administrador no tiene catálogo publicado para esta aplicación.');
  // Locales: solo los publicados por el administrador.
  const revisionChanged=st.configReady&&publishedRevision!==c.revision;
  publishedRevision=c.revision;
  publishedPaymentImages=c.paymentImages&&typeof c.paymentImages==='object'?c.paymentImages:{};
  publishedPaymentWaitMinutes=Number.isInteger(c.paymentWaitMinutes)&&c.paymentWaitMinutes>0?c.paymentWaitMinutes:10;
  publishedReminderCount=Number.isInteger(c.reminderCount)&&c.reminderCount>=0?c.reminderCount:2;
  shops.splice(0,shops.length,...c.stores.map(x=>({...x,addr:x.address,radiusKm:x.radiusKm==null&&x.radius_km==null?null:Number(x.radiusKm??x.radius_km),deliveryFeePen:x.deliveryFeePen,consultOrderAvailability:typeof (x.consultOrderAvailability??x.consult_order_availability)==='boolean'?(x.consultOrderAvailability??x.consult_order_availability):null,reservation_enabled:x.reservationSettings?.enabled===true,reservationAcceptingRequests:x.reservationSettings?.acceptingRequests===true})));
  // Productos: mostrar exclusivamente el catálogo publicado por la API.
  // La lista se reconstruye, no se concatena incrementalmente, para evitar duplicados.
  products.splice(0,products.length,...productsFromApi(c.products));
  catalogPublished=true;
  publishedPromotions=Array.isArray(c.promotions)?c.promotions.filter(p=>p&&typeof p.title==='string'&&p.title.trim()):[];
  publishedVacancies=Array.isArray(c.jobVacancies)?c.jobVacancies:[];
  storeGeocoding=false;
  if(st.coords)resolveStoreDistances();
  st.configReady=true;
  if(revisionChanged&&!['SUBMITTING','PENDING','ACCEPTED'].includes(window.B3OrderAvailability?.readInteraction?.()?.status)){
   deliveryValidationGeneration++;window.B3OrderAvailability?.clear();st.quote=null;st.store='';clearDeliveryAvailability();
  }
  if(st.store&&!shops.some(x=>String(x.id)===String(st.store))&&
     !['SUBMITTING','PENDING','ACCEPTED'].includes(window.B3OrderAvailability?.readInteraction?.()?.status)){
   deliveryValidationGeneration++;window.B3OrderAvailability?.clear();st.quote=null;st.store='';clearDeliveryAvailability();
  }
  catalogRequestFinished=true;
  save();if(st.stage!=='splash')render();if(st.stage==='reservationPicker')autoCheckReservationQuote();return true;
 }catch(err){
  if(strict)throw Error('No se pudo actualizar la disponibilidad de locales: '+String(err?.message||'sin respuesta')+'.');
  const ongoing=['SUBMITTING','PENDING','ACCEPTED'].includes(window.B3OrderAvailability?.readInteraction?.()?.status);
  if(!ongoing){
   shops.splice(0,shops.length);st.configReady=false;st.quote=null;st.store='';
   clearDeliveryAvailability();products.splice(0,products.length);catalogPublished=false;publishedPromotions=[];
  }
  // An internet/catalog interruption must not erase a previously submitted order,
  // its stable idempotency key or a confirmed agent decision.
  catalogRequestFinished=true;
  console.warn('Mobile configuration unavailable',err.message);
  if(st.stage!=='splash')render();return false;
 }
}
/** Provisional client-side quote from the latest published B3 config.
 * No road kilometres and no commercial/authoritative order confirmation.
 */
function eligibleDeliveryCandidates(destination,storeList=shops){
 const latitude=Number(destination?.latitude),longitude=Number(destination?.longitude);
 if(destination?.latitude==null||destination?.longitude==null||
    !Number.isFinite(latitude)||!Number.isFinite(longitude)||
    latitude<-90||latitude>90||longitude<-180||longitude>180)
  throw Error('No se pudo verificar la ubicación de entrega. Comprueba la dirección o usa GPS.');
 if(!st.configReady)throw Error('Primero necesitamos consultar los locales y tarifas publicadas.');
 // Availability is different from being administratively active. In particular,
 // delivery_enabled:true does not override today's published closed hours.
 const enabled=storeList.filter(store=>store&&store.active===true&&store.delivery_enabled===true);
 if(!enabled.length)throw Error('No hay locales habilitados para delivery en la publicación actual.');
 const open=enabled.filter(store=>store.hoursConfigured===true&&store.isOpen===true);
 if(!open.length){
  if(enabled.length===1&&enabled[0].hoursConfigured===true&&enabled[0].isOpen===false)
   throw Error(String(enabled[0].name||'El local publicado')+' está cerrado en este momento. No hay otros locales abiertos publicados para delivery.');
  throw Error('No hay locales con horario abierto confirmado para delivery en este momento.');
 }
 const radians=x=>x*Math.PI/180;
 const candidates=[];
 let configured=0;
 for(const store of open){
  if(store.latitude==null||store.longitude==null)continue;
  const lat=Number(store.latitude),lng=Number(store.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||
     lat<-90||lat>90||lng<-180||lng>180)continue;
  const radiusRaw=store.radiusKm??store.radius_km;
  const radius=radiusRaw==null?null:Number(radiusRaw);
  if(radius!==null&&(!Number.isFinite(radius)||radius<0))continue;
  const mode=store.deliveryPricingMode??store.delivery_pricing_mode;
  if(mode!=='FIXED'&&mode!=='PER_KM')continue;
  const amountRaw=mode==='FIXED'?(store.deliveryFeePen??store.delivery_fee_pen):
   (store.deliveryRatePerKmPen??store.delivery_rate_per_km_pen);
  if(amountRaw==null||amountRaw==='')continue;
  const amount=Number(amountRaw);
  if(!Number.isFinite(amount)||amount<0)continue;
  configured++;
  const dLat=radians(lat-latitude),dLng=radians(lng-longitude);
  const a=Math.sin(dLat/2)**2+
    Math.cos(radians(latitude))*Math.cos(radians(lat))*Math.sin(dLng/2)**2;
  const km=6371.0088*2*Math.atan2(Math.sqrt(Math.max(0,Math.min(1,a))),Math.sqrt(Math.max(0,1-a)));
  if(radius!==null&&km>radius+1e-8)continue;
  candidates.push({store,km,mode,amount});
 }
 candidates.sort((a,b)=>a.km-b.km||String(a.store.id).localeCompare(String(b.store.id)));
 if(!candidates.length){
  if(!configured)throw Error('Los locales abiertos para delivery no tienen coordenadas o tarifas válidas publicadas.');
  throw Error('La dirección está fuera del radio de cobertura de los locales abiertos para delivery.');
 }
 return candidates;
}
function quoteForDeliveryCandidate(selected){ const fee=selected.mode==='FIXED'?selected.amount:
  Math.round((selected.km*selected.amount+Number.EPSILON)*100)/100;
 return {
  storeId:selected.store.id,storeName:selected.store.name,mode:'delivery',
  paymentMethods:Array.isArray(selected.store.paymentMethods?.delivery)?[...selected.store.paymentMethods.delivery]:[],
  deliveryFeePen:fee,straightDistanceKm:Math.round(selected.km*100)/100,
  routeDistanceKm:null,distanceSource:'STRAIGHT_LINE',
  deliveryPricingMode:selected.mode,
  ratePerKmPen:selected.mode==='PER_KM'?selected.amount:null,
  provisional:true,quoteOrigin:'ANDROID_LOCAL',
  notice:'Cálculo aproximado en línea recta basado en locales y tarifas publicados. No se ha confirmado un pedido.'
 };
}

function storeAvailabilitySetting(store){
 const value=store?.consultOrderAvailability??store?.consult_order_availability;
 return typeof value==='boolean'?value:null; // unknown is not equivalent to false
}
function clearDeliveryAvailability(){
 deliveryAvailability={status:'IDLE',storeName:'',candidateNames:[],message:''};
}
function invalidateDeliverySelection(){
 if(st.mode!=='delivery')return;
 // Navigating the app must not delete an assigned conversation.
 if(['SUBMITTING','PENDING','ACCEPTED'].includes(window.B3OrderAvailability?.readInteraction?.()?.status))return;
 deliveryValidationGeneration++;deliveryRequestPending=false;
 window.B3OrderAvailability?.clear();
 st.quote=null;st.store='';clearDeliveryAvailability();
}
function deliveryQuoteValid(){
 if(st.mode!=='delivery'||!st.quote||!st.store)return false;
 const fee=Number(st.quote.deliveryFeePen);
 if(st.quote.deliveryFeePen==null||!Number.isFinite(fee)||fee<0||
    st.quote.destinationKey!==deliveryAddressKey(st.profile.address,st.profile.district)||
    !Number.isFinite(st.quote.quotedAt)||
    (st.quote.quoteOrigin!=='ANDROID_CATALOG_ACCEPTED'&&Date.now()-st.quote.quotedAt>=900000))return false;
 if(st.quote.quoteOrigin==='ANDROID_CATALOG_ACCEPTED'){
  const deadline=Date.parse(window.B3OrderAvailability?.readInteraction?.()?.paymentExpiresAt||'');
  if(!Number.isFinite(deadline)||Date.now()>=deadline)return false;
 }
 if(st.quote.quoteOrigin==='ANDROID_CATALOG_ACCEPTED'){
  const entry=window.B3OrderAvailability?.readInteraction?.();
  return entry?.status==='ACCEPTED'&&entry.body?.storeId===st.store&&entry.body?.catalogRevision===publishedRevision&&
    st.quote.storeId===st.store&&st.quote.quoteRevision===publishedRevision&&
    st.quote.distanceSource==='STRAIGHT_LINE'&&
    st.quote.cartSignature===currentCartSignature()&&
    shops.some(x=>x.id===st.store&&x.active===true&&x.delivery_enabled===true);
 }
 if(st.quote.serverValidated===true){
  const total=Number(st.quote.serverTotalPen),serverSubtotal=Number(st.quote.serverSubtotalPen);
  return st.quote.distanceSource==='SERVER_ROUTE'&&Number.isFinite(total)&&
    Number.isFinite(serverSubtotal)&&Math.abs(subtotal()-serverSubtotal)<.015&&
    Math.abs(total-serverSubtotal-fee)<.015&&
    window.B3OrderAvailability?.read()?.validationId===st.quote.validationId&&
    shops.some(x=>String(x.id)===String(st.store)&&x.active===true&&x.delivery_enabled===true);
 }
 return false; // Local Haversine quotes are reference-only; no checkout authority.
}
function orderTotal(){
 return st.mode==='delivery'&&deliveryQuoteValid()&&st.quote.serverValidated===true?
  Number(st.quote.serverTotalPen):
  subtotal()+(st.mode==='delivery'&&deliveryQuoteValid()?Number(st.quote.deliveryFeePen):0);
}
function checkoutCartIssue(){
 if(!st.cart.length)return 'Agrega un producto a tu carrito para continuar.';
 if(st.cart.some(item=>!product(item.id)||promotionNotPurchasable(product(item.id))))return 'Hay un producto que ya no está disponible. Revisa tu carrito.';
 return '';
}
function publishedOrderItems(){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!st.cart.length||st.cart.length>50)throw Error('El pedido debe tener entre 1 y 50 productos.');
 return st.cart.map(x=>{
  const p=product(x.id),id=String(x.id).replace(/^api:/,'');
  if(!p?.isPublished||promotionNotPurchasable(p)||!String(x.id).startsWith('api:')||!uuid.test(id)||
    !Number.isInteger(x.qty)||x.qty<1||x.qty>99)
   throw Error('Solo puedes validar productos publicados y cantidades válidas. Retira los productos de muestra.');
  return {productId:id,quantity:x.qty};
 });
}
// UI ticket snapshot from the published B3 catalogue, not a payment authorization.
// The administrator must recalculate the price rather than trust FORM values.
function requireImmediateOrderFlow(){
 if(st.scheduleMode==='reservation')window.B3ReservationForms.schedule(st.reservationAt);
}
function deliveryOrderTicketForm(address,district){
 requireImmediateOrderFlow();
 const items=publishedOrderItems();
 let subtotalCents=0;
 // Product titles are the left column; quantity and line total are the right.
 // Keep the exact published name (including 1/4, 1/2, combo presentation).
 const lines=items.map(({productId,quantity})=>{
  const p=product('api:'+productId),cents=Math.round(Number(p?.price)*100);
  if(!p?.isPublished||p.disabled||typeof p.name!=='string'||!p.name.trim()||
     /[\x00-\x1f\x7f]/.test(p.name)||!Number.isSafeInteger(cents)||cents<0)
   throw Error('No se puede preparar el ticket: revisa el catálogo publicado.');
  const lineCents=cents*quantity;
  if(!Number.isSafeInteger(lineCents)||!Number.isSafeInteger(subtotalCents+lineCents))
   throw Error('El importe del ticket supera el límite permitido.');
  subtotalCents+=lineCents;
  return {name:p.name.trim(),quantity,lineCents};
 });
 if(Math.abs(subtotalCents/100-subtotal())>.015)
  throw Error('El subtotal del ticket no coincide con el carrito publicado.');
 const reserved=new Set(['subtotal','dirección y referencia','productos restantes','productos']);
 const used=new Set();
 const named=lines.map(({name,quantity,lineCents})=>{
  if(name.length>80)throw Error('Un nombre de producto supera los 80 caracteres permitidos por el FORM.');
  let label=name;
  // The FORM requires distinct variable names. Preserve the product name;
  // add a suffix only when two catalog entries share that exact same name.
  let n=2;
  while(reserved.has(label.toLocaleLowerCase('es-PE'))||used.has(label.toLocaleLowerCase('es-PE'))){
   const suffix=' ('+n+++')';
   if(name.length+suffix.length>80)
    throw Error('Hay productos con nombres repetidos demasiado largos para el FORM.');
   label=name+suffix;
  }
  used.add(label.toLocaleLowerCase('es-PE'));
  return {variable:label,value:quantity+' × '+cash(lineCents/100)};
 });
 const shown=named.length<=8?named:[...named.slice(0,7)];
 if(named.length>8){
  const overflow=lines.slice(7).map(x=>x.name+' ('+x.quantity+' × '+cash(x.lineCents/100)+')').join(' · ');
  if(overflow.length>500)
   throw Error('El pedido tiene demasiados productos para mostrar su detalle completo en el FORM. Reduce la cantidad de productos distintos.');
  shown.push({variable:'Productos restantes',value:overflow});
 }
 const addr=String(address||'').trim(),area=String(district||'').trim();
 if(addr.length<6||addr.length>180||area.length<2||area.length>80)
  throw Error('Confirma una dirección válida antes de crear el ticket.');
 const reference=String(st.profile.reference||'').trim();
 if(reference.length>180||/[\x00-\x1f\x7f]/.test(reference))
  throw Error('Revisa la referencia de entrega.');
 const destination=addr+', '+area+(reference?' — '+reference:'');
 if(destination.length>500)
  throw Error('La dirección y referencia superan los 500 caracteres permitidos para el formulario.');
 const fields=[
  ...shown,
  {variable:'Subtotal',value:cash(subtotalCents/100)},
  {variable:'Dirección y referencia',value:destination}
 ];
 const scheduled=st.scheduleMode==='reservation';
 if(scheduled){const when=window.B3ReservationForms.schedule(st.reservationAt);if(fields.length===10){const merged=fields.splice(6,2);fields.splice(6,0,{variable:'Detalle adicional',value:merged.map(f=>f.variable+': '+f.value).join(' · ')});}fields.unshift({variable:'Fecha',value:when.date+' · '+(()=>{const [h,m]=st.reservationAt.split('T')[1].split(':').map(Number);return (h%12||12)+':'+String(m).padStart(2,'0')+' '+(h<12?'a. m.':'p. m.');})()});}
 const title=scheduled?'VALIDACIÓN DE RESERVA':'VALIDACIÓN DE PEDIDO',subtitle=scheduled?'Confirmar disponibilidad para delivery programado':'Confirmar disponibilidad para delivery';
 if(fields.length>10||fields.some(({variable,value})=>
    variable.length>80||value.length>500||!value.trim()))
  throw Error('El formulario supera los límites permitidos de variables.');
 return {title,subtitle,fields};
}
let agentDecisionTimer=null,agentDecisionPolling=false;
// Never retry a confirmed order's delivery quotation without a bound.
let acceptedQuoteFailures=0,acceptedQuotePaused=false,acceptedQuoteInteractionId='';
let pendingDeliveryQuote=null;
const precomputedDeliveryQuotes=new Map();
// A quote already calculated before contacting the agent is bound to the exact
// interaction, store, catalog, address and cart. It is NOT payment approval.
const APPROVAL_QUOTE_KEY='b3-preapproval-delivery-quote-v1';
function rememberPreApprovalQuote(entry,selected,address,district,quote){
 if(!entry?.interactionId||quote?.storeId!==selected?.id||quote.revision!==publishedRevision||
    quote.distanceSource!=='STRAIGHT_LINE'||!Number.isFinite(Number(quote.deliveryFeePen))||
    Number(quote.deliveryFeePen)<0||!Array.isArray(quote.paymentMethods)||!quote.paymentMethods.length)return;
 localStorage.setItem(APPROVAL_QUOTE_KEY,JSON.stringify({
  interactionId:entry.interactionId,storeId:selected.id,revision:publishedRevision,
  addressKey:deliveryAddressKey(address,district),cartSignature:currentCartSignature(),
  quote
 }));
}
function preApprovalQuoteFor(entry,selected,address,district){
 try{
  const record=JSON.parse(localStorage.getItem(APPROVAL_QUOTE_KEY)||'null');
  if(!record||!entry?.interactionId||record.interactionId!==entry.interactionId||
     record.storeId!==selected?.id||record.revision!==publishedRevision||
     record.addressKey!==deliveryAddressKey(address,district)||
     record.cartSignature!==currentCartSignature())return null;
  const quote=record.quote;
  if(!quote||quote.storeId!==selected.id||quote.revision!==publishedRevision||
     quote.distanceSource!=='STRAIGHT_LINE'||
     quote.deliveryFeePen==null||!Number.isFinite(Number(quote.deliveryFeePen))||
     Number(quote.deliveryFeePen)<0||!Array.isArray(quote.paymentMethods)||
     !quote.paymentMethods.length)return null;
  return quote;
 }catch{return null}
}
function deliveryQuoteKey(storeId,address,district,loc){
 return JSON.stringify([storeId,publishedRevision,deliveryAddressKey(address,district),
  loc?.latitude,loc?.longitude]);
}
function prepareDeliveryQuotes(candidates,address,district,loc){
 precomputedDeliveryQuotes.clear();
 for(const candidate of candidates){
  const local=quoteForDeliveryCandidate(candidate);
  if(!Array.isArray(local.paymentMethods)||!local.paymentMethods.length)continue;
  const key=deliveryQuoteKey(candidate.store.id,address,district,loc);
  precomputedDeliveryQuotes.set(key,{...local,revision:publishedRevision,
   quoteOrigin:'ANDROID_CATALOG_ACCEPTED'});
 }
 console.info('[B3 order timing] delivery_quotes_prepared',precomputedDeliveryQuotes.size);
}
// All pricing inputs come from the published catalog loaded at splash.
function acceptedCatalogQuote(selected,address,district){
 const loc=deliveryLocation;
 if(!selected?.id||!hasDeliveryDestination(address,district)||
    !Number.isFinite(loc?.latitude)||!Number.isFinite(loc?.longitude))
  throw Error('No hay coordenadas válidas de entrega para calcular el delivery.');
 const key=deliveryQuoteKey(selected.id,address,district,loc);
 const precomputed=precomputedDeliveryQuotes.get(key);
 if(precomputed)return precomputed;
 // Recovery only (e.g. the app was restarted while the agent was deciding):
 // normal checkout already calculated every candidate before sending the FORM.
 const candidate=eligibleDeliveryCandidates(loc).find(x=>x.store.id===selected.id);
 if(!candidate)throw Error('La sede que aceptó no cumple la cobertura y tarifa publicadas.');
 const local=quoteForDeliveryCandidate(candidate);
 if(!Array.isArray(local.paymentMethods)||!local.paymentMethods.length)
  throw Error('La sede no tiene medios de pago habilitados para delivery.');
 return {...local,revision:publishedRevision,quoteOrigin:'ANDROID_CATALOG_ACCEPTED'};
}
function warmAcceptedStoreQuote(entry,selected,address,district){
 if(!entry?.interactionId)return;
 const loc=deliveryLocation;
 const key=JSON.stringify([entry.interactionId,selected?.id,publishedRevision,
  deliveryAddressKey(address,district),loc?.latitude,loc?.longitude]);
 try{
  const quote=acceptedCatalogQuote(selected,address,district);
  pendingDeliveryQuote={key,quote};
  rememberPreApprovalQuote(entry,selected,address,district,quote);
 }catch{pendingDeliveryQuote=null}
}
async function acceptedStoreQuote(entry,selected,address,district){
 const existing=preApprovalQuoteFor(entry,selected,address,district);
 if(existing)return existing;
 const loc=deliveryLocation;
 const key=JSON.stringify([entry.interactionId,selected.id,publishedRevision,
  deliveryAddressKey(address,district),loc?.latitude,loc?.longitude]);
 if(pendingDeliveryQuote?.key===key)return pendingDeliveryQuote.quote;
 const quote=acceptedCatalogQuote(selected,address,district);
 pendingDeliveryQuote={key,quote};
 return quote;
}
function currentCartSignature(){
 return JSON.stringify(publishedOrderItems().slice().sort((a,b)=>a.productId.localeCompare(b.productId)));
}
function resetDeliveryOrderContact(){
 st.orderContactDraft=null;
 st.deliveryContactConfirmed=false;
}
function currentDeliveryOrderContact(){
 if(!st.orderContactDraft){
  const p=st.profile||{};
  st.orderContactDraft={first:String(p.first||''),last:String(p.last||''),
   phone:String(p.phone||''),doc:String(p.doc||'')};
 }
 return st.orderContactDraft;
}
function deliveryContactReady(){
 const p=st.orderContactDraft;
 return st.deliveryContactConfirmed===true&&!!p&&
  typeof p.first==='string'&&p.first.trim().length>=2&&p.first.trim().length<=60&&
  typeof p.last==='string'&&p.last.trim().length>=2&&p.last.trim().length<=60&&
  typeof p.phone==='string'&&/^9[0-9]{8}$/.test(p.phone);
}
function deliveryReviewKey(){
 const c=currentDeliveryOrderContact();
 return JSON.stringify([st.profile.address,st.profile.district,st.profile.reference,
  c.first,c.last,c.phone,c.doc,st.cart.map(i=>[i.id,i.qty])]);
}
function deliveryRequestCustomer(address,district){
 if(!deliveryContactReady())throw Error('Confirma nombres, apellidos y celular para este pedido.');
 const person=st.orderContactDraft;
 return {firstName:person.first.trim(),lastName:person.last.trim(),phone:person.phone,
  address:String(address||'').trim(),district:String(district||'').trim(),
  reference:String(st.profile.reference||'').trim(),mode:'delivery'};
}
function requestSeriesKey(address,district){
 return JSON.stringify({appId:APP_ID,revision:publishedRevision,items:currentCartSignature(),
  address:String(address).trim(),district:String(district).trim()});
}
function interactionMatchesCart(entry,address,district){
 if(!entry?.body)return false;
 try{
  const old=JSON.parse(entry.fingerprint);
  const oldCustomer=entry.body.customer;
  const currentCustomer=deliveryContactReady()?deliveryRequestCustomer(address,district):null;
  return old.address===address&&old.district===district&&
   JSON.stringify(entry.body.items)===currentCartSignature()&&
   (!oldCustomer||!currentCustomer||JSON.stringify(oldCustomer)===JSON.stringify(currentCustomer));
 }catch(_){return false}
}
function stopAgentDecisionPoll(){
 if(agentDecisionTimer!==null)clearTimeout(agentDecisionTimer);
 agentDecisionTimer=null;
}
// GET de estado separado del reintento POST del FORM. Los cooldowns del
// FORM se conservan en order-availability.js y nunca bloquean este GET.
let firstStatusCheckInteractionId=null;
function agentStatusPollDelay(delay=6000,entry=null){
 // Accepted products need only local quote completion, not another status GET.
 if(entry?.agentDecision==='ACCEPTED'&&entry.messageDelivered===true)return 100;
 // First check promptly after the ticket is delivered. Subsequent reads are
 // spaced to avoid exhausting the shared 10-per-minute Admin request counter.
 if(entry?.interactionId&&entry.messageDelivered===true&&
    entry.agentDecision!=='ACCEPTED'&&entry.status==='PENDING'&&
    firstStatusCheckInteractionId!==entry.interactionId){
  firstStatusCheckInteractionId=entry.interactionId;
  return 1200;
 }
 return Math.max(10500,Number.isFinite(delay)?delay:10500);
}
function b3OrderTiming(stage,started){
 // Solo etapa y duracion: nunca identificadores, telefonos ni direcciones.
 console.info('[B3 order timing]',stage,Math.round(performance.now()-started)+'ms');
}
let formDeliveryPending=null;
function ensureFormDelivery(entry){
 if(!entry?.interactionId||!(entry.body?.customer||entry.orderForm?.title==='VALIDACIÓN DE RECOJO')||entry.messageDelivered===true||
    entry.messageDeliveryUncertain===true||entry.messageDeliveryBlocked===true||
    (Number.isFinite(entry.messageRetryAt)&&entry.messageRetryAt>Date.now())||
    !['PENDING','ACCEPTED'].includes(entry.status)||formDeliveryPending)return;
 const started=performance.now(),interactionId=entry.interactionId;
 formDeliveryPending=Promise.resolve().then(()=>window.B3OrderAvailability.sendInteractionMessage(entry))
  .catch(error=>{
   // El cliente mantiene la proteccion de idempotencia y el motivo de bloqueo.
   console.warn('[B3 order] FORM delivery not confirmed',error?.code||'HTTP_ERROR');
  }).finally(()=>{
   b3OrderTiming('form_delivery',started);
   formDeliveryPending=null;
   const current=window.B3OrderAvailability?.readInteraction?.();
   if(current?.interactionId===interactionId&&st.stage==='availability'&&
      ['PENDING','ACCEPTED'].includes(current.status)){
    render();
    if(!agentDecisionPolling)scheduleAgentDecisionPoll(1000);
   }
  });
}
function formWaitingMessage(entry){
 if(entry?.messageDeliveryBlocked===true)
  return 'Tu solicitud está registrada, pero no pudimos entregar sus detalles a la sede. Puedes cancelar la solicitud y elegir otra modalidad de entrega.';
 if(entry?.messageDeliveryUncertain===true)
  return 'Tu solicitud está registrada. Estamos verificando si la sede recibió los detalles. No volveremos a enviarlos sin confirmación.';
 return 'Tu solicitud está registrada. Estamos confirmando los detalles con la sede. No necesitas enviarla nuevamente.';
}
function scheduleAgentDecisionPoll(delay=2000){
 stopAgentDecisionPoll();
 if(agentDecisionPolling||acceptedQuotePaused)return;
 const entry=window.B3OrderAvailability?.readInteraction?.();
 if(entry?.status==='ACCEPTED'&&entry.agentDecision==='ACCEPTED'&&
    st.stage!=='availability'&&(st.stage!=='chat'||!!entry.paymentExpiresAt))return;
 if(!['PENDING','ACCEPTED','SUBMITTING'].includes(entry?.status))return;
 if(entry.status!=='SUBMITTING'&&!entry.interactionId)return;
 agentDecisionTimer=setTimeout(()=>{agentDecisionTimer=null;void pollAgentDecision()},
  agentStatusPollDelay(delay,entry));
}
async function completeAcceptedQuote(entry){
 const api=window.B3OrderAvailability;
 if(acceptedQuoteInteractionId!==entry.interactionId){acceptedQuoteInteractionId=entry.interactionId;acceptedQuoteFailures=0;acceptedQuotePaused=false;}
 const address=st.profile.address,district=st.profile.district;
 if(!interactionMatchesCart(entry,address,district))
  throw Error('El carrito cambió después de la aceptación. La solicitud anterior debe cancelarse.');
 if(entry.status!=='ACCEPTED')throw Error('Todavía no existe una aceptación válida del agente.');
 if(entry.body?.customer&&entry.messageDelivered!==true)throw Error('El formulario de aprobación todavía no tiene entrega confirmada.');
 if(entry.body.catalogRevision!==publishedRevision)throw Error('El catálogo cambió después de la aceptación. Debes cancelar y solicitar una nueva confirmación.');
 const selected=shops.find(s=>s.id===entry.body.storeId);
 if(!selected)throw Error('La sede que aceptó ya no aparece en el catálogo publicado.');
 deliveryValidationStep='COTIZANDO_DELIVERY';
 deliveryAvailability={status:'CHECKING_STORES',storeName:selected.name,candidateNames:[],
  message:'Solicitud aceptada. Calculando delivery desde '+selected.name+'.'};
 render();
 // The signed-in agent accepted the exact request. Use its previously
 // calculated delivery price; geocode again only to recover a missing quote.
 if(!preApprovalQuoteFor(entry,selected,address,district)&&!hasDeliveryDestination(address,district)){
  const geocoded=await geocodeDeliveryDestination(address,district);
  if(st.stage!=='availability')return false;
  deliveryLocation={...geocoded,key:deliveryAddressKey(address,district)};
 }
 const quote=await acceptedStoreQuote(entry,selected,address,district);
 if(st.stage!=='availability'||st.profile.address!==address||st.profile.district!==district)return false;
 if(quote.storeId!==selected.id)throw Error('La cotización no corresponde al local que aceptó.');
 if(quote.revision!==publishedRevision)throw Error('La carta cambió. Necesitamos revisar tu pedido.');
 const fee=Number(quote.deliveryFeePen);
 if(!Number.isFinite(fee)||fee<0)throw Error('No se pudo determinar el costo del delivery.');
 // Android starts the payment clock from the verified agent acceptance.
 // No payment POST, extra TU VERSO read or fee recalculation is necessary here.
 deliveryValidationStep='HABILITANDO_PAGO';
 const wait=api.startLocalPaymentWindow(entry,publishedPaymentWaitMinutes);
 if(wait.status!=='PAYMENT_PENDING')throw Error('No se pudo iniciar el plazo local de pago.');
 if(st.stage!=='availability')return false;
 st.store=selected.id;
 st.quote={storeId:selected.id,storeName:selected.name,deliveryFeePen:fee,
  paymentMethods:quote.paymentMethods.filter(x=>['yape','plin','card','cash'].includes(x)),
  routeDistanceKm:Number.isFinite(Number(quote.routeDistanceKm))?Number(quote.routeDistanceKm):null,
  distanceSource:'STRAIGHT_LINE',quoteOrigin:'ANDROID_CATALOG_ACCEPTED',serverValidated:false,
  provisional:true,quoteRevision:quote.revision,cartSignature:currentCartSignature(),
  quotedAt:Date.now(),destinationKey:deliveryAddressKey(address,district)};
 acceptedQuoteFailures=0;acceptedQuotePaused=false;
 st.pay='';save();
 // Do not leave the tracking chat covering the payment choices after acceptance.
 closeChatOverlay();
 screen('payment');
 showOrderAcceptedOnce(entry);
 return true;
}
function revealVerifiedResponse(entry,kind,decision){
 if(!entry?.interactionId||!['ACCEPTED','REJECTED'].includes(decision))return;
 const key='b3-response-revealed-v1:'+kind+':'+entry.interactionId;
 if(localStorage.getItem(key)===decision)return;
 localStorage.setItem(key,decision);
 if(document.visibilityState==='visible'&&navigator.vibrate){
  try{navigator.vibrate([180,110,180,110,180])}catch{}
 }
 if(kind==='payment'){
  if(st.stage!=='paymentOutcome')screen('paymentOutcome');
 }else if(st.stage!=='availability'){
  screen('availability');
 }
}
async function pollAgentDecision(){
 const api=window.B3OrderAvailability,entry=api?.readInteraction?.();
 if(agentDecisionPolling||checkoutCancelInFlight||
    !['PENDING','ACCEPTED','SUBMITTING'].includes(entry?.status)||
    (entry.status!=='SUBMITTING'&&!entry.interactionId))return;
 if(entry.status==='ACCEPTED'&&entry.agentDecision==='ACCEPTED'&&
    st.stage!=='availability'&&(st.stage!=='chat'||!!entry.paymentExpiresAt))return;
 agentDecisionPolling=true;
 let retryMs=2000;
 try{
  if(entry.status==='SUBMITTING'&&!entry.interactionId){
   if(st.stage==='availability'){
    deliveryAvailability={status:'CREATE_UNCERTAIN',storeName:'',candidateNames:[],
     message:'Recuperando la solicitud original sin duplicarla.'};render();
   }
   await api.createInteraction(entry);
   window.AndroidBridge?.requestPersonalPushToken?.();
  }
  if(entry.cancelRequested){
   if(!entry.interactionId)throw Error('Esperando identificar la solicitud antes de cancelarla.');
   await api.closeCommunication(entry,{reason:'CLIENT_CANCELLED'});
   stopAgentDecisionPoll();
   ++deliveryValidationGeneration;st.quote=null;st.store='';st.pay='';
   clearDeliveryAvailability();resetDeliveryOrderContact();save();nav('inicio');toast('Solicitud cancelada.');return;
  }
  // Un POST FORM lento no puede bloquear la lectura del GET de respuesta.
  if((entry.body?.customer||entry.orderForm?.title==='VALIDACIÓN DE RECOJO')&&entry.messageDelivered!==true){
   if(st.stage==='availability'){
    deliveryAvailability={status:'CREATE_UNCERTAIN',
     storeName:shops.find(s=>s.id===entry.body.storeId)?.name||'',candidateNames:[],
     message:formWaitingMessage(entry)};render();
   }
   ensureFormDelivery(entry);
  }
  if(entry.status==='ACCEPTED'&&entry.agentDecision==='ACCEPTED'){
   if(entry.orderForm?.title==='VALIDACIÓN DE RECOJO'){
    if(entry.messageDelivered===true)completeAcceptedPickup(entry);
    else ensureFormDelivery(entry);
    return;
   }
   if(st.stage==='availability'){
    if(entry.body?.customer&&entry.messageDelivered!==true){
     deliveryAvailability={status:'CREATE_UNCERTAIN',storeName:'',candidateNames:[],
      message:formWaitingMessage(entry)};render();
    }else await completeAcceptedQuote(entry);
   }else if(st.stage==='chat'&&(!entry.body?.customer||entry.messageDelivered===true)){
    screen('availability');
    await completeAcceptedQuote(entry);
   }
   return;
  }
  const pollStarted=performance.now();
  let result;
  try{result=await api.pollInteraction(entry)}
  finally{b3OrderTiming('agent_status',pollStarted)}
  // A previous order must never update the screen of a new checkout.
  if(checkoutCancelInFlight||api.readInteraction?.()?.interactionId!==entry.interactionId)return;
  const store=shops.find(x=>x.id===entry.body.storeId);
  if(result.clientStatus==='EXPIRED'||result.clientStatus==='CANCELLED'){
   resetDeliveryOrderContact();
   const cancelled=result.clientStatus==='CANCELLED';
   deliveryAvailability={status:cancelled?'CANCELLED':'UNAVAILABLE',storeName:store?.name||'',candidateNames:[],
    message:cancelled?'La solicitud fue cancelada. Conservamos los productos del carrito.':
     'Esta solicitud de Delivery ya no está vigente. No volveremos a enviarla automáticamente.',
    reason:cancelled?'CUSTOMER_CANCELLED':'EXPIRED'};
   if(st.stage==='availability')render();else if(chatOverlay)refreshChatTimeline();else toast('Tu solicitud ya no está activa.');
   return;
  }
  if(result.decision==='ACCEPTED'){
   const updated=api.readInteraction?.()||entry;
   if(updated.orderForm?.title==='VALIDACIÓN DE RECOJO'){
    if(updated.messageDelivered===true){revealVerifiedResponse(updated,'order','ACCEPTED');completeAcceptedPickup(updated);}
    else ensureFormDelivery(updated);
    return;
   }
   if(updated.body?.customer&&updated.messageDelivered!==true){
    if(st.stage==='availability'){
     deliveryAvailability={status:'CREATE_UNCERTAIN',storeName:store?.name||'',candidateNames:[],
      message:formWaitingMessage(updated)};render();
    }else if(chatOverlay)refreshChatTimeline();else if(st.stage!=='chat'){render();toast('La sede respondió. Sincronizando los detalles del pedido.')}
   }else if(st.stage==='availability')await completeAcceptedQuote(updated);
   else if(st.stage==='chat'){
    revealVerifiedResponse(updated,'order','ACCEPTED');await completeAcceptedQuote(updated);
   }else{revealVerifiedResponse(updated,'order','ACCEPTED');await completeAcceptedQuote(updated);}
   return;
  }
  if(result.decision==='REJECTED'){
   if(entry.orderForm?.title==='VALIDACIÓN DE RECOJO'){
    pickupRequestError='La tienda seleccionada no tiene disponible el producto solicitado. Puedes elegir otra tienda para realizar tu pedido.';
    revealVerifiedResponse(api.readInteraction?.()||entry,'order','REJECTED');render();return;
   }
   // A verified rejection ends this interaction. No automatic retry or
   // re-routing to another store without explicit customer action.
   api.markRejectedStore(requestSeriesKey(st.profile.address,st.profile.district),entry.body.storeId);
   stopAgentDecisionPoll();
   ++deliveryValidationGeneration;
   deliveryRequestPending=false;
   const closedWithoutDecision=api.readInteraction?.()?.rejectionReason==='AGENT_CLOSED_WITHOUT_CONFIRMATION';
   const unconfirmedClosure=api.readInteraction?.()?.rejectionReason==='AGENT_CLOSED_UNCONFIRMED';
   deliveryAvailability={status:'REJECTED',storeName:store?.name||'',candidateNames:[],
    message:(store?.name||'La sede consultada')+
     (closedWithoutDecision?' cerró la atención sin confirmar tu pedido.':
      unconfirmedClosure?' finalizó la atención sin confirmar los productos.':' no confirmó la disponibilidad de los productos solicitados.')+
     ' Puedes revisar la carta y elegir otros productos para un pedido nuevo.',
    reason:closedWithoutDecision?'AGENT_CLOSED':'AGENT_REJECTED'};
   revealVerifiedResponse(api.readInteraction?.()||entry,'order','REJECTED');render();
   return;
  }
  if(st.stage==='availability'){
   // After a failed cancellation, keep the explicit retry action visible while
   // silently polling the SAME interaction for a confirmed terminal status.
   if(deliveryAvailability.reason==='CANCEL_NOT_CONFIRMED')return;
   deliveryAvailability={status:entry.body?.customer&&entry.messageDelivered!==true?
     'CREATE_UNCERTAIN':'WAITING_APPROVAL',
    storeName:store?.name||'',candidateNames:[],
    message:entry.body?.customer&&entry.messageDelivered!==true?
     formWaitingMessage(api.readInteraction?.()||entry):
     'La sede responderá cuando revise tu pedido.'};
   render();
  }
 }catch(error){
  const latest=api?.readInteraction?.();
  if(st.stage==='availability'&&deliveryAvailability.reason==='CANCEL_NOT_CONFIRMED')return;
  const pending=['PENDING','SUBMITTING'].includes(latest?.status);
  const recovering=pending&&!latest?.interactionId;
  const sending=pending&&latest?.interactionId&&latest.body?.customer&&latest.messageDelivered!==true;
  const transientDeliveryFailure=[429,500,502,503,504].includes(error?.httpStatus)||
   ['TIMEOUT','CONNECTION_FAILED'].includes(error?.code);
  const quotePending=latest?.status==='ACCEPTED'&&latest.agentDecision==='ACCEPTED'&&
   (!latest.body?.customer||latest.messageDelivered===true);
  if(quotePending){
   if(acceptedQuoteInteractionId!==latest.interactionId){
    acceptedQuoteInteractionId=latest.interactionId;acceptedQuoteFailures=0;
   }
   acceptedQuoteFailures++;
   // Hard business errors need an explicit retry; transient errors get at most
   // three automatic attempts. Never create another interaction.
   acceptedQuotePaused=!transientDeliveryFailure||acceptedQuoteFailures>=3;
  }
  retryMs=quotePending?(error?.httpStatus===429?65000:12000):
   error?.httpStatus===429&&!latest?.messageRetryAt?65000:8000;
  const acceptedStore=quotePending?shops.find(s=>s.id===latest.body?.storeId):null;
  deliveryAvailability={
   status:quotePending?'QUOTE_UNAVAILABLE':recovering||sending?'CREATE_UNCERTAIN':
    pending?'WAITING_APPROVAL':'ERROR',
   storeName:acceptedStore?.name||'',candidateNames:[],
   message:quotePending?
    (acceptedQuotePaused?
     (deliveryValidationStep==='HABILITANDO_PAGO'?
      'La tarifa se obtuvo, pero no se pudo habilitar el plazo de pago. No se realizó ningún cobro. Puedes reintentar sin enviar otro pedido.':
      'La sede confirmó los productos, pero no fue posible verificar la tarifa de Delivery. No se realizó ningún cobro. Puedes reintentar sin enviar otro pedido.'):
     (deliveryValidationStep==='HABILITANDO_PAGO'?
      'La tarifa está confirmada. Estamos reintentando habilitar el pago sin generar otro pedido.':
      'La sede aceptó los productos. Estamos reintentando obtener la tarifa de delivery sin crear otro pedido.')):
    recovering?'Estamos comprobando que tu solicitud haya quedado registrada. No la enviaremos dos veces.':
    sending?formWaitingMessage(latest):
    pending?'Tu solicitud está registrada. Estamos verificando la respuesta de la sede.':
     error?.httpStatus||/HTTP\s*\d{3}|demasiadas consultas/i.test(String(error?.message||''))?
      'No pudimos continuar con tu pedido. No se realizará ningún cobro.':
      error?.message||'No pudimos continuar con tu pedido. No se realizará ningún cobro.'};
  if(st.stage==='availability')render();
 }finally{
  agentDecisionPolling=false;
  refreshChatTimeline();
  const current=api?.readInteraction?.();
  retryMs=agentStatusPollDelay(retryMs);
  if(['PENDING','SUBMITTING'].includes(current?.status)||
     current?.status==='ACCEPTED'&&(current.agentDecision!=='ACCEPTED'||
      st.stage==='availability'||st.stage==='chat'&&!current.paymentExpiresAt))
   scheduleAgentDecisionPoll(retryMs);
 }
}
async function requestBackendOrderAvailability({address,district,run,silent}){
 requireImmediateOrderFlow();
 const api=window.B3OrderAvailability;
 if(!api?.checkAgentAvailability||!api?.quoteDelivery||!api?.createInteraction||
    !api?.sendInteractionMessage||!api?.pollInteraction)
  throw Error('Actualiza Android para utilizar el envío independiente del mensaje.');
 const active=()=>run===deliveryValidationGeneration&&st.mode==='delivery'&&
  st.profile.address===address&&st.profile.district===district&&(silent||st.stage==='availability');
 deliveryValidationStep='RECUPERANDO_SOLICITUD';
 const prior=api.readInteraction?.();
 if(prior&&['PENDING','ACCEPTED','SUBMITTING'].includes(prior.status)){
  if(!interactionMatchesCart(prior,address,district))
   throw Error('Existe una solicitud anterior con productos diferentes. Cancélala antes de empezar otra.');
  const store=shops.find(s=>s.id===prior.body.storeId);
  deliveryAvailability={status:prior.messageDelivered===false?'CREATE_UNCERTAIN':'WAITING_APPROVAL',
   storeName:store?.name||'Sede seleccionada',candidateNames:[],
   message:prior.messageDelivered===false?'La solicitud ya existe. Confirmando el ticket de aprobación con la sede.':
    'Esperando respuesta del local. Continuaremos automáticamente.'};
  st.store=prior.body.storeId;save();render();
  // Even a persisted ACCEPTED can denote only automatic interaction assignment.
  // Always re-read the actual agent reply before allowing checkout.
  scheduleAgentDecisionPoll(1000);
  return false;
 }
 deliveryValidationStep='UBICACION';
 let loc=hasDeliveryDestination(address,district)?deliveryLocation:null;
 if(!loc){
  loc=await geocodeDeliveryDestination(address,district);
  if(!active())return false;
  deliveryLocation={...loc,key:deliveryAddressKey(address,district)};
 }
 deliveryValidationStep='COBERTURA_Y_HORARIO';
 let candidates;
 try{candidates=eligibleDeliveryCandidates(loc)}
 catch(error){
  // Valid location without an eligible store is a business outcome,
  // not a temporary network failure.
  if(/^No hay locales habilitados para delivery|^No hay locales con horario abierto|^La dirección está fuera del radio|está cerrado en este momento\./.test(String(error?.message||''))){
   deliveryAvailability={status:'UNAVAILABLE',storeName:'',candidateNames:[],
    message:String(error.message)+' Conservamos tu carrito. Puedes elegir recojo en tienda o intentar Delivery más tarde.',reason:'NO_COVERAGE'};
    screen('availability');return false;
  }
  throw error;
 }
 // Calculate and cache each eligible store's delivery fee BEFORE checking an
 // agent or creating a TU VERSO interaction. Acceptance only reads this value.
 prepareDeliveryQuotes(candidates,address,district,loc);
 const tried=new Set(api.rejectedStores(requestSeriesKey(address,district)));
 const consultable=candidates.filter(({store})=>storeAvailabilitySetting(store)===true&&!tried.has(store.id));
 if(!consultable.length){
  deliveryAvailability={status:'UNAVAILABLE',storeName:'',candidateNames:[],
   message:'Ninguna sede elegible puede recibir esta solicitud de Delivery en este momento. No se ha enviado un nuevo pedido. Puedes elegir Recojo en tienda o intentar Delivery más tarde.',reason:'NO_ELIGIBLE'};
   screen('availability');return false;
 }
 let selected=null;
 let agentChecksFailed=false;
 for(const {store} of consultable){
  if(!active())return false;
  deliveryAvailability={status:'CHECKING_STORES',storeName:store.name,candidateNames:[],
   message:'Consultando atención en '+store.name+'.'};
  render();
  deliveryValidationStep='DISPONIBILIDAD_AGENTE';
  let check;
  try{check=await api.checkAgentAvailability({appId:APP_ID,storeId:store.id})}
  catch(error){
   if(!active())return false;
   agentChecksFailed=true;
   // A failed connectivity check says NOTHING about the agent's status.
   // Check other eligible stores without creating a new interaction.
   continue;
  }
  if(!active())return false;
  if(check.available){selected=store;break}
 }
 if(!selected){
  deliveryAvailability={status:'UNAVAILABLE',storeName:'',candidateNames:[],
   message:agentChecksFailed?
    'No pudimos confirmar la conexión con los agentes de las sedes disponibles. No se envió ningún pedido. Puedes volver a consultar o elegir Recojo en tienda.':
    'Por ahora, ninguna de las sedes elegibles tiene personal disponible para confirmar tu pedido por Delivery. No se ha enviado un nuevo pedido. Puedes elegir Recojo en tienda o intentar Delivery más tarde.',reason:agentChecksFailed?'AGENT_CHECK_FAILED':'NO_AGENTS'};
   screen('availability');return false;
 }
 st.store=selected.id;st.quote=null;save();
 deliveryValidationStep='PREPARANDO_INTERACCION';
 await validateCartPromotionsBeforeRequest();
 if(!active())return false;
 const entry=api.prepareInteraction({appId:APP_ID,storeId:selected.id,catalogRevision:publishedRevision,
  items:publishedOrderItems(),address,district,customer:deliveryRequestCustomer(address,district),
  orderForm:deliveryOrderTicketForm(address,district)});
 deliveryAvailability={status:'CREATE_UNCERTAIN',storeName:selected.name,candidateNames:[],
  message:'Enviando la solicitud. Continuaremos automáticamente cuando el local responda.'};
 render();
 let response;
 deliveryValidationStep='CREANDO_INTERACCION';
 try{response=await api.createInteraction(entry)}
 catch(error){
  // A 503 or lost HTTP acknowledgement cannot prove the conversation was not created.
  if(error?.httpStatus===503||error?.httpStatus===429||
     ['TIMEOUT','CONNECTION_FAILED'].includes(error?.code)){
   deliveryAvailability={status:'CREATE_UNCERTAIN',storeName:selected.name,candidateNames:[],
    message:'La solicitud fue enviada. Verificando su confirmación sin duplicarla.'};
   save();render();scheduleAgentDecisionPoll(8000);return false;
  }
  throw error;
 }
 if(entry.interactionId)window.AndroidBridge?.requestPersonalPushToken?.();
 if(!active())return false;
 if(response.status!=='PENDING')throw Error('No se confirmó la solicitud pendiente.');
 // The interactionId was saved before attempting the second HTTP request.
 deliveryAvailability={status:'CREATE_UNCERTAIN',storeName:selected.name,candidateNames:[],
  message:'Solicitud creada. Enviando el ticket de aprobación a '+selected.name+'.'};
 save();render();
 if(entry.body?.customer&&entry.messageDelivered!==true){
  deliveryValidationStep='ENTREGANDO_DETALLE';
  // Enviar FORM en paralelo: el polling puede detectar la respuesta del
  // asesor aunque la confirmacion de entrega tarde. Nunca permite pagar sin ACK.
  ensureFormDelivery(entry);
 }
 // Prepare the accepted-store delivery fee during the human approval wait.
 // Nothing here starts the payment clock or authorizes checkout.
 warmAcceptedStoreQuote(entry,selected,address,district);
 if(!active())return false;
 deliveryValidationStep='ESPERANDO_RESPUESTA';
 deliveryAvailability={status:'WAITING_APPROVAL',storeName:selected.name,candidateNames:[],
  message:'Esperando confirmación de '+selected.name+'. No necesitas pulsar ningún botón.'};
 save();render();scheduleAgentDecisionPoll(1000);
 return false;
}
// Branded confirmation replaces WebView window.confirm (which exposes
// appassets.androidplatform.net) and never changes route or resets checkout.
let b3ConfirmDismiss=null;
function confirmB3({title,description,confirmLabel='Confirmar',danger=false}){
 if(b3ConfirmDismiss)return Promise.resolve(false);
 return new Promise(resolve=>{
  const active=document.activeElement;
  const layer=document.createElement('div');
  layer.className='b3-confirm-layer';
  layer.innerHTML='<div class="b3-confirm-backdrop"></div>'+
   '<section class="b3-confirm-card" role="dialog" aria-modal="true" aria-labelledby="b3-confirm-title" aria-describedby="b3-confirm-detail">'+
    '<span class="b3-confirm-kicker">POLLOS B3 · TU PEDIDO</span>'+
    '<div class="b3-confirm-icon">'+ic('info',24)+'</div>'+
    '<h2 id="b3-confirm-title">'+esc(title)+'</h2>'+
    '<p id="b3-confirm-detail">'+esc(description)+'</p>'+
    '<button type="button" class="b3-confirm-accept '+(danger?'danger':'')+'" data-b3-confirm="yes">'+esc(confirmLabel)+'</button>'+
    '<button type="button" class="b3-confirm-decline" data-b3-confirm="no">Continuar con mi pedido</button>'+
   '</section>';
  const close=accepted=>{
   if(b3ConfirmDismiss!==dismiss)return;
   b3ConfirmDismiss=null;
   layer.remove();resolve(accepted);
   if(active?.isConnected)active.focus({preventScroll:true});
  };
  const dismiss=()=>close(false);
  b3ConfirmDismiss=dismiss;
  layer.addEventListener('click',event=>{
   const action=event.target.closest('[data-b3-confirm]');
   if(!action)return;
   close(action.getAttribute('data-b3-confirm')==='yes');
  });
  document.body.appendChild(layer);
  layer.querySelector('[data-b3-confirm="no"]')?.focus({preventScroll:true});
 });
}
async function cancelPersonalCheckout(reason='CANCEL',skipConfirm=false){
 if(checkoutCancelInFlight)return;
 const api=window.B3OrderAvailability,entry=api?.readInteraction?.();
 if(!entry||!['SUBMITTING','PENDING','ACCEPTED'].includes(entry.status)){
  if(reason==='MODIFY')nav('carta');else nav('inicio');
  return;
 }
 const adding=reason==='MODIFY';
 if(!skipConfirm&&!await confirmB3(adding?{
  title:'¿Cambiar los productos?',
  description:'Para modificar el carrito es necesario cancelar la solicitud actual. Si vuelves a pedir delivery, necesitarás otra confirmación de una sede.',
  confirmLabel:'Cancelar solicitud y editar',danger:true
 }:{
  title:'¿Cancelar tu solicitud?',
  description:'Avisaremos a la sede y detendremos los recordatorios cuando la cancelación quede confirmada.',
  confirmLabel:'Sí, cancelar solicitud',danger:true
 }))return;
 if(entry.status==='SUBMITTING'&&!entry.interactionId){
  api.requestCancelWhenRecovered(entry);
  deliveryAvailability={status:'CREATE_UNCERTAIN',storeName:'',candidateNames:[],
   message:'Cancelación solicitada. Primero debemos recuperar la confirmación de envío para avisar a la sede.'};
  screen('availability');scheduleAgentDecisionPoll(1000);return;
 }
 checkoutCancelInFlight=true;
 checkoutReviewNote='Cancelando tu solicitud...';
 render();
 try{
  await api.closeCommunication(entry,{reason:'CLIENT_CANCELLED'});
  stopAgentDecisionPoll();
  ++deliveryValidationGeneration;st.quote=null;st.store='';st.pay='';
  clearDeliveryAvailability();checkoutReviewNote='';
  resetDeliveryOrderContact();save();
  if(adding){nav('carta');toast('Solicitud anterior cancelada. Puedes modificar tu carrito.');}
  else{
   deliveryAvailability={status:'CANCELLED',storeName:'',candidateNames:[],
    message:'Tu solicitud fue cancelada. Conservamos los productos de tu carrito. No se enviará otro pedido automáticamente.',
    reason:'CUSTOMER_CANCELLED'};
   screen('availability');
  }
 }catch(error){
  checkoutReviewNote=error.message||'No se pudo confirmar la cancelación. Intenta nuevamente.';
  if(st.stage==='availability')deliveryAvailability={status:'ERROR',storeName:'',candidateNames:[],
   message:'No pudimos confirmar la cancelación. Tu solicitud podría seguir activa. Puedes volver a solicitar la cancelación sin crear otro pedido.',reason:'CANCEL_NOT_CONFIRMED'};
 }finally{
  checkoutCancelInFlight=false;
  render();
 }
}
async function cancelApprovedForCartChange(){return cancelPersonalCheckout('MODIFY')}
async function checkDeliveryBackendHealth(){
 if(deliveryHealthPending)return;
 if(!window.B3OrderAvailability?.checkConnection){
  deliveryHealthMessage='Esta versión de la app no puede verificar la conexión al Administrador.';
  render();return;
 }
 deliveryHealthPending=true;deliveryHealthMessage='';render();
 try{
  const result=await window.B3OrderAvailability.checkConnection();
  const status=Number(result.status);
  deliveryHealthMessage=result.online?
   'El Administrador está disponible y su base de datos respondió correctamente. Esto no confirma que TU VERSO tenga solicitudes habilitadas.':
   result.liveOnline && status===503?
   'El Administrador está encendido (GET /health/live: HTTP 200), pero su base de datos no está lista (GET /health/ready: HTTP 503). Verifica PostgreSQL del Administrador.':
   result.liveOnline?
   'El Administrador responde (GET /health/live: HTTP 200), pero su comprobación de disponibilidad falló (GET /health/ready: HTTP '+status+'). Revisa el backend.':
   'El túnel no confirmó el servicio esperado (GET /health/ready: HTTP '+status+
   '; GET /health/live: '+(result.liveStatus==null?'sin respuesta JSON':('HTTP '+result.liveStatus))+'). Comprueba que la URL y el puerto del Administrador sean correctos.';
 }catch{
  deliveryHealthMessage='No pudimos contactar al Administrador. Comprueba la conexión de internet y que el túnel HTTPS siga activo.';
 }finally{deliveryHealthPending=false;render();}
}
async function resolveDelivery({silent=false,skipConfig=false}={}){
 if(st.scheduleMode==='reservation')requireImmediateOrderFlow();
 if(deliveryRequestPending)return false;
 const run=++deliveryValidationGeneration;
 const address=String(st.profile.address||'').trim(),district=String(st.profile.district||'').trim();
 if(address.length<6||district.length<2){
  deliveryRequestError='Ingresa una dirección completa y un distrito para verificar la cobertura.';
  if(!silent)screen('deliveryAddress');else render();return false;
 }
 if(!deliveryContactReady()&&!['SUBMITTING','PENDING','ACCEPTED'].includes(
   window.B3OrderAvailability?.readInteraction?.()?.status)){
  checkoutPending=true;
  deliveryRequestError='';
  currentDeliveryOrderContact();
  screen('identity');return false;
 }
 // A new order must be explicitly reviewed before any network request.
 if(!['SUBMITTING','PENDING','ACCEPTED'].includes(
    window.B3OrderAvailability?.readInteraction?.()?.status)&&
    confirmedDeliveryReviewKey!==deliveryReviewKey()){
  screen('confirmDetails');return false;
 }
 deliveryValidationStep='CATALOGO_PUBLICADO';
 deliveryRequestPending=true;deliveryRequestError='';deliveryHealthMessage='';st.quote=null;st.store='';
 deliveryAvailability={status:'CHECKING',storeName:'',candidateNames:[],message:''};
 if(!silent){fulfillmentModal=null;screen('availability')}else render();
 try{
  if(!skipConfig)await fetchConfig({strict:true});
  if(run!==deliveryValidationGeneration)return false;
  if(!st.configReady)throw Error('No se pudo consultar la configuración publicada.');
  if(st.mode!=='delivery'||st.profile.address!==address||st.profile.district!==district||
   (!silent&&st.stage!=='availability'))return false;
  // The Administrator, not Android, decides every eligible store and road-based fee.
  // Independent contract: only a matching store may create an interaction.
  // Pending interactions cannot be treated as approved payments.
  const ready=await requestBackendOrderAvailability({address,district,run,silent});
  if(run!==deliveryValidationGeneration)return false;
  if(!ready&&silent&&deliveryAvailability.status!=='UNAVAILABLE')screen('availability');
  return ready;
 }catch(error){
  if(run!==deliveryValidationGeneration)return false;
  if(error?.code==='PROMOTIONS_REMOVED'){
   deliveryRequestError='';clearDeliveryAvailability();screen('cart');
   toast(error.message,{durationMs:5500});return false;
  }
  st.quote=null;st.store='';
  // Do not display backend HTTP status codes or internal processing stages.
  deliveryRequestError=error?.httpStatus||
   /HTTP\s*\d{3}|demasiadas consultas/i.test(String(error?.message||''))?
   'No pudimos completar la solicitud. Puedes revisar la entrega o elegir otra modalidad.':
   error?.message||'No se pudo verificar la disponibilidad.';
  deliveryAvailability={status:'ERROR',storeName:'',candidateNames:[],message:deliveryRequestError};
  save();if(silent)screen('availability');return false;
 }finally{
  if(run===deliveryValidationGeneration){
   deliveryRequestPending=false;if(st.stage!=='splash')render();
  }
 }
}
function resolveStoreDistances(){
 if(storeGeocoding||!st.coords||!window.AndroidBridge?.geocodeStores)return;
 const needs=shops.filter(s=>s.active!==false&&(s.latitude==null||s.longitude==null)&&
  typeof (s.address||s.addr)==='string'&&(s.address||s.addr).includes('Santa Anita'));
 if(!needs.length)return;
 storeGeocoding=true;
 window.AndroidBridge.geocodeStores(JSON.stringify(needs.map(s=>({id:String(s.id),address:s.address||s.addr}))));
}
window.b3StoreCoordinates=json=>{
 storeGeocoding=false;
 let found=[];try{found=JSON.parse(json)}catch{return}
 for(const c of found){
  const store=shops.find(s=>String(s.id)===String(c.id));
  if(store&&Number.isFinite(c.latitude)&&Number.isFinite(c.longitude)){
   store.latitude=c.latitude;store.longitude=c.longitude;
  }
 }
 if(st.stage==='app'&&st.tab==='inicio')render();
};
window.b3DeliveryGpsAddress=(token,street,district,hasNumber,error)=>{
 if(!deliveryGpsPending||String(token)!==deliveryGpsToken)return;
 deliveryGpsPending=false;
 if(error||!String(street||'').trim()){
  deliveryGpsMessage='No se pudo identificar la calle automáticamente. Completa calle, número y distrito; puedes conservar las coordenadas GPS como punto de entrega.';
 }else{
  st.profile.address=String(street).trim();
  // A GPS result without a verified administrative district requires manual confirmation.
  st.profile.district=String(district||'').trim();
  deliveryGpsMessage=hasNumber
   ?'Dirección encontrada. Confirma el distrito antes de continuar.'
   :'Ubicación encontrada. Completa el número de puerta y el distrito antes de continuar.';
  if(!st.profile.district)deliveryGpsMessage='Encontramos la calle, pero no pudimos confirmar el distrito. Escríbelo antes de consultar sedes.';
 }
 if(deliveryLocation?.source==='gps')deliveryLocation.key=deliveryAddressKey(st.profile.address,st.profile.district);
 deliveryRequestError='';save();render();
 if(st.stage==='reservationPicker'&&st.scheduleMode==='reservation'&&st.mode==='delivery'&&!error&&hasNumber&&st.profile.district){reservationAddressEditing=false;render();autoCheckReservationQuote();}
};
// Android permission allows access but cannot switch the device's master GPS
// toggle on. Offer a user-controlled route to the proper system settings.
let locationSettingsModal=null;
let locationPromptDismissed=false;
function showLocationSettingsPrompt(code){
 if(locationSettingsModal||locationPromptDismissed)return;
 const permissions=code==='PERMISSION_DENIED'||code==='LOCATION_PRECISION_REQUIRED';
 const prompt=code==='LOCATION_DISABLED'?
  'La ubicación del teléfono está apagada. Para ver las sedes cercanas, actívala en Ajustes de Android.':
  code==='LOCATION_PRECISION_REQUIRED'?
   'Android permite una ubicación aproximada, pero no hay un proveedor disponible. Puedes habilitar la ubicación precisa de Pollos B3 o escribir tu dirección.':
   'Pollos B3 no tiene permiso para usar la ubicación. Puedes activarlo en los permisos de la aplicación o continuar sin GPS.';
 const layer=document.createElement('div');
 layer.className='b3-location-permission-layer';
 layer.innerHTML='<div class="b3-location-permission-backdrop"></div>'+
  '<section class="b3-location-permission-sheet" role="dialog" aria-modal="true" aria-labelledby="b3-location-title">'+
  '<span class="b3-location-kicker">POLLOS B3 · UBICACIÓN</span>'+
  '<h2 id="b3-location-title">Activa tu ubicación cuando la necesites</h2>'+
  '<p>'+esc(prompt)+'</p>'+
  '<button type="button" class="primary full" data-location-settings="1">'+
   (permissions?'Abrir permisos de Pollos B3':'Abrir ajustes de ubicación')+'</button>'+
  '<button type="button" class="outline full" data-location-later="1">Ahora no, continuar sin GPS</button>'+
  '</section>';
 layer.addEventListener('click',event=>{
  const settings=event.target.closest('[data-location-settings]');
  const later=event.target.closest('[data-location-later]');
  const outside=event.target.closest('.b3-location-permission-backdrop');
  if(!settings&&!later&&!outside)return;
  layer.remove();locationSettingsModal=null;
  // Returning from Android Settings must never reopen this sheet on its own.
  // Only another explicit tap on "Usar mi ubicación" resets this dismissal.
  locationPromptDismissed=true;deliveryGpsRequested=false;
  if(later||outside)return;
  if(permissions)window.AndroidBridge?.openAppLocationSettings?.();
  else window.AndroidBridge?.openLocationSettings?.();
 });
 document.body.appendChild(layer);
 locationSettingsModal=layer;
}
window.b3NativeLocation=(lat,lng,error)=>{
 const forDelivery=deliveryGpsRequested;
 deliveryGpsRequested=false;
 if(error){
  if(['LOCATION_DISABLED','LOCATION_PRECISION_REQUIRED','PERMISSION_DENIED'].includes(error)){
   // A location failure must never trap the user or re-prompt automatically.
   deliveryGpsRequested=false;
   showLocationSettingsPrompt(error);
  }else toast(error);
  return;
 }
 if(!Number.isFinite(lat)||!Number.isFinite(lng)){
  toast('No fue posible obtener coordenadas. Puedes escribir la dirección manualmente.');
  return;
 }
 st.coords={lat,lng};save();resolveStoreDistances();
 if(forDelivery&&(fulfillmentModal==='delivery'||st.stage==='deliveryAddress'||(st.stage==='reservationPicker'&&st.mode==='delivery'))){
  if(st.stage==='reservationPicker'){resetReservationQuote();reservationAddressEditing=true;st.store='';st.pay='';}
  st.profile.address=v('address')||st.profile.address;
  st.profile.district=v('district')||st.profile.district;
  st.profile.reference=v('reference')||st.profile.reference;
  deliveryLocation={latitude:lat,longitude:lng,key:deliveryAddressKey(st.profile.address,st.profile.district),source:'gps'};
  deliveryRequestError='';deliveryGpsMessage='Buscando la dirección de tu ubicación actual...';
  if(window.AndroidBridge?.reverseGeocodeDeliveryLocation){
   deliveryGpsPending=true;
   const token=deliveryGpsToken=String(++deliveryGeocodeSequence);
   try{
    window.AndroidBridge.reverseGeocodeDeliveryLocation(JSON.stringify({token,latitude:lat,longitude:lng}));
    setTimeout(()=>{
     if(deliveryGpsPending&&deliveryGpsToken===token)
      window.b3DeliveryGpsAddress(token,'','',false,'No se pudo identificar la dirección');
    },12000);
   }catch(e){window.b3DeliveryGpsAddress(token,'','',false,'Servicio no disponible')}
  }else{
   deliveryGpsPending=false;
   deliveryGpsMessage='GPS recibido. Esta versión no identifica la calle: complétala manualmente antes de continuar.';
  }
  save();render();return;
 }
 if(fulfillmentModal==='pickup'||st.stage==='locations'||(st.stage==='app'&&st.tab==='inicio')){render();return}
 toast('Ubicación recibida. Verifica la dirección escrita.');
};
async function confirmStore(mode,id,{showDetails=false}={}){
 if(mode!=='pickup')return toast('Para delivery, confirma la dirección y solicita una tarifa de reparto.');
 if(checkoutRefreshPending)return false;
 checkoutRefreshPending=true;checkoutReviewNote='';render();
 try{
  // Do not accept a pickup store from a stale home card or cached location list.
  await fetchConfig({strict:true});
  const selected=shops.find(x=>String(x.id)===String(id));
  if(!eligibleForPickup(selected)){
   checkoutReviewNote='Este local está cerrado o dejó de aceptar recojos. Selecciona otro local disponible.';
   if(String(st.store)===String(id)){st.store='';st.pay='';save()}
   if(fulfillmentModal){fulfillmentModal='pickup';render()}
   else screen('locations');
   return false;
  }
  const previousStore=String(st.store||'');
  const previousMode=st.mode;
  if(previousMode!=='pickup')return false; // A store response must not silently choose another modality.
  st.store=selected.id;st.fulfillment='pickup';st.quote=null;
  if(previousMode!=='pickup'||previousStore!==String(selected.id)){
   st.pay='';st.cash='';
  }
  save();
  if(checkoutPending){
   checkoutPending=false;
   const issue=checkoutCartIssue();
   if(issue){checkoutReviewNote=issue;screen('cart');return false}
   screen('identity');return true;
  }
  if(showDetails){screen('localDetail');return true}
  fulfillmentModal=null;
  if(st.cart.length)screen('cart');
  else nav('carta');
  return true;
 }catch(err){
  checkoutReviewNote=err?.message||'No se pudo actualizar el horario del local. Intenta nuevamente.';
  if(fulfillmentModal){fulfillmentModal='pickup';render()}
  else screen('locations');
  return false;
 }finally{
  checkoutRefreshPending=false;
  render();
 }
}

const save=()=>{const {stage,tab,selected,qty,notice,step,coords,quote,configReady,...d}=st;localStorage.setItem(K,JSON.stringify(d));};
window.b3GoogleAuthResult=reply=>{
 const pending=googleSignInPending;
 googleSignInPending=false;
 if(reply?.status==='SIGNED_IN'){
  const uid=String(reply.uid||''),email=String(reply.email||'');
  if(reply.emailVerified!==true||uid.length<1||uid.length>128||
     !/^\S+@\S+\.\S+$/.test(email)){
   if(pending)toast('Google no devolvió una identidad verificable.');
   if(st.stage==='login')render();
   return;
  }
  st.registered=true;st.authProvider='google';st.authUid=uid;
  st.authDisplayName=String(reply.displayName||'').slice(0,120);
  st.authGoogleEmail=email.slice(0,254);
  if(!st.profile.email)st.profile.email=st.authGoogleEmail;
  save();
  if(pending)enterApp();
  else if((st.stage==='app'&&st.tab==='cuenta')||st.stage==='login')render();
  return;
 }
 if(reply?.status==='SIGNED_OUT'){
  if(st.authProvider==='google'){
   st.registered=false;st.authProvider='';st.authUid='';
   st.authDisplayName='';st.authGoogleEmail='';save();
   if(st.stage==='login'||st.stage==='app')render();
  }
  return;
 }
 if(st.stage==='login')render();
 if(reply?.status==='ERROR'&&pending)
  toast(String(reply.message||'No fue posible ingresar con Google.').slice(0,190));
};
const subtotal=()=>st.cart.reduce((s,x)=>s+x.qty*(products.find(p=>p.id===x.id)?.price||0),0), cartCount=()=>st.cart.reduce((s,x)=>s+x.qty,0);
const product=id=>products.find(x=>x.id===id);
// Toast independiente del render: las respuestas de la app no reconstruyen la pantalla.
let noticeTimer=null,noticeNode=null,noticeKind='',noticeText='',noticeCritical=false;
let noticeCount=0,noticeLastAt=0;
const B3_TOAST_ENTER_MS=260,B3_TOAST_EXIT_MS=220;
function dismissNotice(){
 if(noticeTimer!==null){clearTimeout(noticeTimer);noticeTimer=null}
 const node=noticeNode;
 if(!node)return;
 noticeNode=null;noticeKind='';noticeText='';noticeCount=0;noticeCritical=false;
 node.classList.remove('b3-toast-visible');
 node.classList.add('b3-toast-leaving');
 setTimeout(()=>node.remove(),B3_TOAST_EXIT_MS);
}
function queueNotice(t,options={}){
 const text=String(t||'').trim();
 if(!text)return;
 const critical=options.critical===true||
  /no pudimos confirmar (?:el pago|la cancelaci[oó]n)|pedido rechazado|pago (?:rechazado|fallido)/i.test(text);
 // Un aviso crítico permanece visible hasta que el usuario lo cierre.
 if(noticeNode&&noticeCritical&&!critical)return;
 const kind=options.kind==='cart'?'cart':
  critical||/^(?:no |error|primero |ingresa |completa |verifica |selecciona )|no pudimos|no fue posible/i.test(text)?'warning':'info';
 const now=Date.now();
 const same=noticeNode&&noticeKind===kind&&
  (kind==='cart'||noticeText===text)&&now-noticeLastAt<1800;
 if(noticeTimer!==null){clearTimeout(noticeTimer);noticeTimer=null}
 if(noticeNode&&!same){noticeNode.remove();noticeNode=null}
 noticeCount=same&&kind==='cart'?noticeCount+Math.max(1,Number(options.quantity)||1):
  kind==='cart'?Math.max(1,Number(options.quantity)||1):1;
 noticeLastAt=now;noticeKind=kind;noticeText=text;noticeCritical=critical;
 const title=kind==='cart'?(noticeCount===1?'Producto agregado':noticeCount+' productos agregados'):text;
 const description=kind==='cart'?'Tu carrito se actualizó':'';
 const icon=kind==='cart'?ic('check',19):kind==='warning'?ic('info',19):ic('check',19);
 const node=same?noticeNode:document.createElement('div');
 node.className='b3-toast-premium b3-toast-'+kind+(same?' b3-toast-visible':'');
 node.setAttribute('role',critical||kind==='warning'?'alert':'status');
 node.setAttribute('aria-live',critical||kind==='warning'?'assertive':'polite');
 node.innerHTML='<span class="b3-toast-icon" aria-hidden="true">'+icon+'</span>'+
  '<span class="b3-toast-content"><strong>'+esc(title)+'</strong>'+
  (description?'<small>'+esc(description)+'</small>':'')+'</span>'+
  (critical?'<button class="b3-toast-close" type="button" aria-label="Cerrar aviso">'+ic('close',17)+'</button>':'');
 if(!same){
  document.body.appendChild(node);
  noticeNode=node;
  requestAnimationFrame(()=>{if(noticeNode===node)node.classList.add('b3-toast-visible')});
 }
 if(critical)node.querySelector('.b3-toast-close')?.addEventListener('click',dismissNotice,{once:true});
 else noticeTimer=setTimeout(dismissNotice,Number.isFinite(options.durationMs)?Math.max(500,Math.min(10000,options.durationMs)):(kind==='cart'?1800:kind==='warning'?4500:2600));
}
function toast(t,options={}){queueNotice(t,options)}
// Draft for a second purchase: never mutate the items of the in-flight interaction.
const B3_NEXT_CART_KEY='b3-next-cart-draft-v1';
function nextCartDraft(){
 try{const raw=JSON.parse(localStorage.getItem(B3_NEXT_CART_KEY)||'[]');
  return Array.isArray(raw)?raw.filter(x=>typeof x?.id==='string'&&Number.isInteger(x.qty)&&x.qty>0&&x.qty<=99).slice(0,100):[]}
 catch{return []}
}
function saveNextCartDraft(items){localStorage.setItem(B3_NEXT_CART_KEY,JSON.stringify(items))}
function shoppingCart(){return activePersonalCheckout()?nextCartDraft():st.cart}
function shoppingSubtotal(){return shoppingCart().reduce((sum,x)=>sum+x.qty*(product(x.id)?.price||0),0)}
function shoppingCount(){return shoppingCart().reduce((sum,x)=>sum+x.qty,0)}
function activePersonalCheckout(){
 const entry=window.B3OrderAvailability?.readInteraction?.();
 // A payment-approved order recorded in local history no longer blocks a new purchase.
 if(entry?.paymentConfirmation?.status==='ACCEPTED'&&
    st.orders?.some(o=>o?.interactionId===entry.interactionId&&o.paymentStatus==='ACCEPTED'))return null;
 return ['SUBMITTING','PENDING','ACCEPTED'].includes(entry?.status)?entry:null;
}
function showOrderAcceptedOnce(entry){
 if(!entry?.interactionId||entry.agentDecision!=='ACCEPTED')return;
 const key='b3-last-accepted-notice-v1';
 if(localStorage.getItem(key)===entry.interactionId)return;
 localStorage.setItem(key,entry.interactionId);
 toast('¡Tu pedido fue aceptado!',{durationMs:2000});
}
function personalCheckoutBanner(){
 const entry=window.B3OrderAvailability?.readInteraction?.();
 if(!entry?.interactionId||entry.paymentConfirmation?.status==='ACCEPTED'&&
   st.orders?.some(o=>o?.interactionId===entry.interactionId&&o.paymentStatus==='ACCEPTED'))return '';
 const payment=entry.paymentConfirmation?.status;
 let title='',detail='',symbol='clock';
 if(payment==='SENT'||payment==='PREPARED'){
  title='Tu pago está en validación';detail='Toca para consultar la respuesta de la sede.';
 }else if(payment==='REJECTED'){
  title='Tu pago requiere atención';detail='Toca para ver el resultado.';symbol='info';
 }else if(payment==='ACCEPTED'){
  title='Pago confirmado';detail='Toca para ver el resultado.';symbol='check';
 }else if(entry.status==='REJECTED'){
  title='Productos no confirmados';detail='Toca para revisar la respuesta.';symbol='info';
 }else if(entry.status==='ACCEPTED'){
  title='Tu pedido fue aceptado';detail='Continúa con el pago.';symbol='check';
 }else if(['SUBMITTING','PENDING'].includes(entry.status)){
  title='Tu pedido está en validación';detail='Toca para ver el estado de tu solicitud.';
 }else return '';
 return `<button type="button" class="b3-checkout-floating" data-checkout-return="1" aria-label="Ver estado de mi pedido">
   <span class="b3-checkout-floating-icon">${ic(symbol,20)}</span>
   <span><strong>${esc(title)}</strong><small>${esc(detail)}</small></span>
   ${ic('chev',16)}</button>`;
}
function returnToPersonalCheckout(){
 const entry=window.B3OrderAvailability?.readInteraction?.();
 if(!entry)return;
 if(['ACCEPTED','REJECTED'].includes(entry.paymentConfirmation?.status))screen('paymentOutcome');
 else if(entry.paymentConfirmation?.status==='PREPARED'&&deliveryQuoteValid())screen('paymentProofPreview');
 else if(entry.paymentConfirmation)screen('paymentWaiting');
 else if(entry.status==='ACCEPTED'&&(deliveryQuoteValid()||entry.orderForm?.title==='VALIDACIÓN DE RECOJO'))screen('payment');
 else if(entry.status==='REJECTED'){
  const store=shops.find(x=>x.id===entry.body?.storeId);
  const closedWithoutDecision=entry.rejectionReason==='AGENT_CLOSED_WITHOUT_CONFIRMATION';
  const unconfirmedClosure=entry.rejectionReason==='AGENT_CLOSED_UNCONFIRMED';
  deliveryAvailability={status:'REJECTED',storeName:store?.name||'',candidateNames:[],
   message:(store?.name||'La sede consultada')+
    (closedWithoutDecision?' cerró la atención sin confirmar el pedido.':
     unconfirmedClosure?' finalizó la atención sin confirmar los productos.':' no confirmó la disponibilidad de los productos solicitados.')+
    ' No se reenviará automáticamente. Puedes elegir otros productos.'};
  screen('availability');
 }else screen('availability');
}
function openAlternateFulfillment(message){
 // A product rejection never implies Delivery is unavailable: start a NEW cart.
 if(window.B3OrderAvailability?.readInteraction?.()?.status==='REJECTED'){
  beginNewCheckoutAfterRejection();nav('carta');return;
 }
 // Only an unavailable fulfillment state reaches here; never retry automatically.
 fulfillmentOutcomeNote=String(message||'No hay delivery disponible. Elige otra forma de recibir tu pedido.');
 st.quote=null;st.store='';st.pay='';checkoutPending=false;
 screen('choice');
}
function screen(n){
 if(n==='chat'){openChatOverlay();return}
 if(n==='inicio'||n==='app'&&window.B3OrderAvailability?.readInteraction?.()?.status==='REJECTED'){
  nav('inicio');return;
 }
 // The accepted and quoted request is already past availability.
 // Never return to the agent-checking phase from an approved payment screen.
 if(n==='availability'&&['prepaymentReview','payment','summary'].includes(st.stage)&&
    activePersonalCheckout()?.status==='ACCEPTED'&&deliveryQuoteValid()){
  nav('inicio');return;
 }
 selectedHomeStore=null;if(n!=='vacancyDetail')selectedVacancyId=null;if(n==='choice'){st.stage='app';st.tab='inicio';fulfillmentModal='choose';render();return}if(n==='login' && st.stage==='app')loginFromAccount=true;fulfillmentModal=null;st.stage=n;window.scrollTo({top:0});render();if(n==='notifications')void fetchNotifications();if(n==='reservationPicker'&&st.mode==='delivery')autoCheckReservationQuote()}
// Returning Home after a confirmed rejection is a NEW order, not a resume.
// Preserve profile/address/favorites but discard rejected checkout and old cart.
function beginNewCheckoutAfterRejection(){
 const api=window.B3OrderAvailability,entry=api?.readInteraction?.();
 if(entry?.status!=='REJECTED'||!api.dismissRejectedInteraction?.(entry.interactionId))return false;
 stopAgentDecisionPoll();
 ++deliveryValidationGeneration;
 deliveryRequestPending=false;deliveryRequestError='';
 checkoutRefreshPending=false;checkoutReviewNote='';
 st.cart=[];st.quote=null;st.store='';st.pay='';st.cash='';
 resetDeliveryOrderContact();
 if(st.scheduleMode!=='reservation')st.reservationAt='';st.fulfillment='';st.pickupOrigin='';st.selected='';st.qty=1;st.coords=null;
 fulfillmentOutcomeNote='';
 clearDeliveryAvailability();save();
 return true;
}
function beginNewOrderAfterPayment(){
 const api=window.B3OrderAvailability,entry=api?.readInteraction?.();
 if(entry?.paymentConfirmation?.status!=='ACCEPTED')return false;
 // Never release an interaction unless the real approval is safely indexed.
 if(!recordVerifiedPaymentOrder(entry)||
    !st.orders?.some(o=>o.interactionId===entry.interactionId&&o.paymentStatus==='ACCEPTED'))return false;
 try{if(!api.archiveConfirmedInteraction?.(entry.interactionId))return false}
 catch(error){console.warn('[B3 order] Paid order could not be archived',error?.name||'STORAGE_ERROR');return false}
 stopAgentDecisionPoll();
 if(paymentDecisionTimer!==null)clearTimeout(paymentDecisionTimer);
 paymentDecisionTimer=null;
 ++deliveryValidationGeneration;
 deliveryRequestPending=false;deliveryRequestError='';paymentFormError='';
 checkoutRefreshPending=false;checkoutReviewNote='';checkoutPending=false;
 if(st.scheduleMode!=='reservation')st.reservationAt='';st.store='';
 st.quote=null;st.pay='';st.cash='';st.fulfillment='';st.pickupOrigin='';
 // A paid and archived order must not leak its items into the next checkout.
 // The verified order is already indexed in st.orders above.
 st.cart=nextCartDraft();saveNextCartDraft([]);
 st.coords=null;st.selected='';st.qty=1;
 resetDeliveryOrderContact();clearDeliveryAvailability();
 save();
 return true;
}
function nav(tab){
 if(tab==='chat'){openChatOverlay();return}
 if(tab==='inicio'||tab==='carta')beginNewOrderAfterPayment();
 if(tab==='inicio')beginNewCheckoutAfterRejection();
 checkoutPending=false;selectedHomeStore=null;selectedVacancyId=null;fulfillmentModal=null;
 st.tab=tab;st.stage='app';window.scrollTo({top:0});render();
 if(tab==='carta')void syncPromotionCatalog();
}
function bar(){return `<nav class="bar" aria-label="Navegación"><button class="${st.tab==='inicio'?'active':''}" data-tab="inicio">${ic('home')}<span>Inicio</span></button><button class="${st.tab==='carta'?'active':''}" data-tab="carta">${ic('menu')}<span>Carta</span></button><button class="chat-center" data-screen="chat" aria-label="Abrir chat">${ic('chat',24)}</button><button class="${st.tab==='pedidos'?'active':''}" data-tab="pedidos">${ic('orders')}<span>Pedidos</span></button><button class="${st.tab==='cuenta'?'active':''}" data-tab="cuenta">${ic('account')}<span>Mi Cuenta</span></button></nav>`}
const img=(p,c='',priority=false)=>{const src=photo(p);const eager=priority||c==='hero-img';return src?`<img class="${c}" src="${esc(src)}" loading="${eager?'eager':'lazy'}" decoding="async" ${eager?'fetchpriority="high"':''} alt="Imagen publicada de ${esc(p.name||'producto')}">`:`<div class="b3-no-photo ${c}" aria-label="Sin fotografía publicada"></div>`};
function savedAddresses(){return Array.isArray(st.addresses)?st.addresses.filter(x=>x&&typeof x.id==='string'&&typeof x.street==='string'&&typeof x.district==='string'):[]}
function pickSavedAddress(id,quote=false){
 const item=savedAddresses().find(x=>x.id===id);if(!item)return toast('Dirección no disponible');
 st.profile.address=item.street;st.profile.district=item.district;st.profile.reference=item.reference||'';deliveryLocation=null;
 // Saving an address cannot change the selected fulfillment mode.
 if(st.mode==='delivery')invalidateDeliverySelection();save();
 if(quote&&st.mode==='delivery'){void resolveDelivery()}else{render();toast('Dirección seleccionada')}
}
function savedAddressesHtml(selectForDelivery=false){
 return [...savedAddresses()].sort((a,b)=>Number(b.id===st.defaultAddressId)-Number(a.id===st.defaultAddressId)).map(a=>`<article class="b3-address-card">
  <div class="b3-address-top"><span class="b3-address-symbol">${ic(a.kind==='Trabajo'?'store':'home',20)}</span><strong>${esc(a.label||a.kind||'Otra dirección')}</strong>${st.defaultAddressId===a.id?'<span class="b3-address-default">Predeterminada</span>':''}</div>
  <p>${esc(a.street)} · ${esc(a.district)}, Lima</p>${a.reference?`<small>Referencia: ${esc(a.reference)}</small>`:''}
  <div class="b3-address-actions">
   ${selectForDelivery?`<button data-address-choose="${esc(a.id)}">Usar para Delivery</button>`:`<button data-address-default="${esc(a.id)}">${st.defaultAddressId===a.id?'Seleccionada':'Predeterminada'}</button>`}
   <button data-address-edit="${esc(a.id)}">Editar</button>
   <button class="danger" data-address-delete="${esc(a.id)}">Eliminar</button>
  </div>
 </article>`).join('')
}
function addressesScreen(){
 return `<div class="page b3-address-page">${heading('Mis direcciones','app')}
 <p class="sub">Guarda tus lugares de entrega y elige uno como predeterminado.</p>
 ${savedAddresses().length?savedAddressesHtml():'<div class="empty-state"><h2>Aún no tienes direcciones guardadas</h2><p>Agrega tu primera dirección para tus próximos pedidos.</p></div>'}
 <button class="primary full" data-address-create="1">${ic('pin',18)} Agregar nueva dirección</button>
 <p class="smallprint">Tus direcciones guardadas permanecen en este dispositivo. Guardar una dirección no solicita por sí mismo una cotización de reparto.</p></div>`;
}
function addressEditScreen(){
 const a=savedAddresses().find(x=>x.id===addressEditId)||{};
 return `<div class="page b3-address-page form">${heading(addressEditId?'Editar dirección':'Nueva dirección','address')}
 <p class="sub">Agrega una dirección para usarla después en Delivery.</p>
 <label>Identificar dirección<select id="saved-kind"><option value="Casa" ${a.kind==='Casa'?'selected':''}>Casa</option><option value="Trabajo" ${a.kind==='Trabajo'?'selected':''}>Trabajo</option><option value="Otra" ${a.kind==='Otra'?'selected':''}>Otra</option></select></label>
 <label>Nombre de la dirección (opcional)<input id="saved-label" maxlength="50" placeholder="Ej. Casa de mamá" value="${esc(a.label||'')}"></label>
 <label>Distrito<input id="saved-district" maxlength="80" placeholder="Ej. Santa Anita" value="${esc(a.district||'')}"></label>
 <label>Avenida, calle y número<input id="saved-street" maxlength="180" autocomplete="street-address" placeholder="Nombre de calle y número" value="${esc(a.street||'')}"></label>
 <label>Referencia (opcional)<input id="saved-reference" maxlength="180" placeholder="Piso, departamento o puerta" value="${esc(a.reference||'')}"></label>
 <label class="b3-address-check"><input type="checkbox" id="saved-default" ${!savedAddresses().length||st.defaultAddressId===a.id?'checked':''}> Establecer como predeterminada</label>
 <button class="primary full" data-address-save="1">Guardar dirección</button></div>`;
}
function deliveryConfigured(){return st.mode==='delivery'&&!!st.profile.address&&!!st.profile.district}
function pickupConfigured(){return st.mode==='pickup'&&!!shops.find(s=>s.id===st.store&&eligibleForPickup(s))}
function headerAddress(){
 if(deliveryConfigured())return {label:'Enviar a:',line1:st.profile.address,line2:[st.profile.district,st.profile.reference].filter(Boolean).join(' · ')};
 const store=shops.find(s=>s.id===st.store);
 if(pickupConfigured()&&store)return {label:'Retiro en:',line1:store.name,line2:[store.address,straightDistanceKm(store)].filter(Boolean).join(' · ')};
 return {label:'¿Para dónde hoy?',line1:'Configura tu entrega o recojo',line2:''};
}
function fulfillmentHeader(){
 const value=headerAddress();
 const modeLabel=st.mode==='delivery'?'Delivery':st.mode==='pickup'?'Recojo en tienda':'Elegir modalidad';
 return `<header class="b3-compact-header">
   <img class="b3-header-logo" src="images/pollosb3-header-logo.png" alt="Pollos B3">
   <div class="b3-header-location-group">
    <div class="b3-header-topline">
     <span class="b3-destination-label">${esc(value.label)}</span>
     <button class="b3-fulfillment-pill" type="button" data-open-fulfillment="1" aria-label="Modalidad actual: ${esc(modeLabel)}. Cambiar modalidad de entrega">
      ${ic(st.mode==='delivery'?'bike':st.mode==='pickup'?'store':'chev',14)}
      <span>${esc(modeLabel)}</span>
      ${ic('chev',13)}
     </button>
    </div>
    <button class="b3-header-target" type="button" data-open-fulfillment="1" aria-label="Cambiar dirección o destino del pedido">
     <span class="b3-destination-line">${esc(value.line1)}</span>
     ${value.line2?`<span class="b3-destination-line">${esc(value.line2)}</span>`:''}
    </button>
   </div>
   <button class="b3-header-edit" type="button" data-open-fulfillment="1" aria-label="Editar destino">${ic('chev',19)}</button>
 </header>`;
}
function fulfillmentOverlay(){
 if(!fulfillmentModal)return '';
 const choice=fulfillmentModal==='choose';
 const pick=fulfillmentModal==='pickup';
 const delivery=fulfillmentModal==='delivery';
 const rows=shops.filter(s=>s.active!==false).sort((a,b)=>{
  const x=straightDistanceKm(a),y=straightDistanceKm(b);
  return x&&y?Number.parseFloat(x)-Number.parseFloat(y):x?-1:y?1:0;
 });
 const modeButtons=`<div class="b3-modal-modes">
   <button type="button" data-modal-mode="delivery" class="${st.mode==='delivery'?'chosen':''}">${ic('bike',25)}<strong>Pollo Delivery</strong><small>A donde estés</small></button>
   <button type="button" data-modal-mode="pickup" class="${st.mode==='pickup'?'chosen':''}">${ic('store',25)}<strong>Pide y Retira</strong><small>Recoge en el local</small></button>
 </div>`;
 const deliveryPanel=`<div class="b3-modal-fields">
   ${savedAddresses().length?`<div class="b3-modal-saved"><h3>Mis direcciones guardadas</h3>${savedAddressesHtml(true)}</div>`:''}
   <button type="button" class="outline full" data-gps="1">${ic('pin',18)} Usar mi ubicación actual como destino</button>
   <p class="smallprint">${hasDeliveryDestination(st.profile.address,st.profile.district)&&deliveryLocation.source==='gps'?'GPS seleccionado como destino. Revisa calle y número.':'Puedes usar GPS para completar la dirección o ingresarla manualmente.'}</p>
   ${deliveryGpsMessage?`<div class="notice" role="status">${esc(deliveryGpsMessage)}</div>`:''}
   <label>Dirección completa<input id="address" autocomplete="street-address" placeholder="Calle, avenida, número e interior" value="${esc(st.profile.address)}"></label>
   <label>Distrito<input id="district" placeholder="Distrito de entrega" value="${esc(st.profile.district||'')}"></label>
   
   <label>Referencia (opcional)<input id="reference" placeholder="Piso, puerta u otras indicaciones" value="${esc(st.profile.reference||'')}"></label>
   <label class="b3-address-check"><input type="checkbox" id="delivery-save-address"> Guardar esta dirección para próximos pedidos</label>
   <div class="b3-modal-info">La cobertura y el costo de reparto deben verificarse con la web administrativa. No se asignará una tienda sin validación.</div>
   ${deliveryRequestError?`<div class="notice" role="alert">${esc(deliveryRequestError)}</div>`:""}
   <button type="button" class="primary full" data-modal-save-delivery="1" ${deliveryRequestPending?"disabled":""}>${deliveryRequestPending?"Buscando sedes...":"Consultar disponibilidad"}</button>
 </div>`;
 const pickupPanel=`<div class="b3-modal-fields"><p class="smallprint">Elige dónde recogerás tu pedido. Consulta cómo llegar antes de seleccionar la tienda.</p>
   <p class="smallprint">La ubicación es opcional: selecciona directamente la tienda para recoger tu pedido.</p>
   <div class="b3-modal-store-list">${rows.length?rows.map(s=>`<div class="b3-modal-store">
     <div class="b3-store-top"><strong>${esc(s.name)}</strong>${storeStatusHtml(s)}</div>
     ${s.address?`<span class="b3-store-line">${ic('pin',15)}${esc(s.address)}</span>`:''}
     ${straightDistanceKm(s)?`<span class="b3-store-line">${ic('map',15)}${esc(straightDistanceKm(s))}</span>`:''}
     ${pickupPaymentWarning(s)}
     ${s.address||s.addr?`<button type="button" class="outline full" data-openmaps="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address||s.addr)}">${ic("map",16)} Cómo llegar con Google Maps</button>`:""}
     ${eligibleForPickup(s)?`<button type="button" class="b3-store-select" data-modal-pickstore="${esc(s.id)}" ${checkoutRefreshPending?'disabled':''}>${checkoutRefreshPending?'Verificando...':'Elegir local'} ${ic('chev',16)}</button>`:'<span class="b3-store-unavailable">No disponible para retiro inmediato</span>'}
   </div>`).join(''):'<div class="notice">No hay locales activos publicados por la web administrativa.</div>'}</div>
 </div>`;
 return `<style>.b3-modal-sheet.b3-pickup-fullscreen{position:fixed!important;inset:0!important;width:100%!important;max-width:none!important;height:100dvh!important;min-height:100dvh!important;max-height:100dvh!important;border-radius:0!important;overflow-y:auto!important;box-sizing:border-box!important;padding-top:max(18px,env(safe-area-inset-top))!important;padding-bottom:max(30px,env(safe-area-inset-bottom))!important}.b3-pickup-fullscreen .b3-modal-handle{display:none!important}.b3-pickup-fullscreen .b3-modal-store .outline{margin:8px 0}</style><div class="b3-modal-backdrop" data-modal-close="1">
   <section class="b3-modal-sheet ${pick?'b3-pickup-fullscreen':''}" role="dialog" aria-modal="true" aria-label="Configurar pedido">
    <div class="b3-modal-handle" aria-hidden="true"></div>
    <div class="b3-modal-heading"><div><h2>${choice?'¿Para dónde hoy?':delivery?'Pollo Delivery':'Pide y Retira'}</h2><p>${choice?'Elige cómo quieres recibir tu pedido':delivery?'Indica dónde entregaremos tu pedido':'Elige dónde recogerás tu pedido'}</p></div>
    <button type="button" data-modal-close="1" class="b3-modal-close" aria-label="Cerrar">${ic('close',21)}</button></div>
    ${choice&&fulfillmentOutcomeNote?`<div class="b3-fulfillment-outcome-banner" role="status"><strong>Tu pedido sigue en el carrito</strong><p>${esc(fulfillmentOutcomeNote)}</p></div>`:'' }
    ${!choice?`<button type="button" class="b3-modal-back" data-modal-back="1">${ic('back',17)} Cambiar modalidad</button>`:''}
    ${choice?modeButtons:delivery?deliveryPanel:pickupPanel}
   </section></div>`;
}
function main(){return `<div class="shell"><main class="main">${st.tab==='inicio'?home():st.tab==='carta'?carta():st.tab==='pedidos'?orders():account()}</main>${personalCheckoutBanner()}${shoppingCount()?`<button class="float-cart" data-screen="cart" aria-label="Abrir carrito">${ic('cart',19)}<b>${cash(shoppingSubtotal())}</b><span>${shoppingCount()}</span></button>`:''}${bar()}</div>${selectedHomeStore?homeStoreSheet():fulfillmentOverlay()}`}

/* Published B3 stores, one independently configurable schedule for each weekday. */
const storeDayNames=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const storeDayKeys=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const validStoreTime=t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t);
function storeTime(t){const [h,m]=t.split(':').map(Number);return (h%12||12)+':'+String(m).padStart(2,'0')+(h<12?' a. m.':' p. m.')}
function storeDailyHours(s){
 const raw=s.weeklyHours||s.weekly_hours||s.openingHours||s.opening_hours||s.schedule||s.hours;
 return storeDayNames.map((day,i)=>{
  if(!raw)return {day,description:'Horario no publicado'};
  const item=Array.isArray(raw)?raw[i]:raw[storeDayKeys[i]]??raw[day.toLowerCase()]??raw[String((i+1)%7)];
  if(item===false||item?.closed===true||item?.isClosed===true)return {day,description:'Cerrado'};
  if(typeof item==='string')return {day,description:item.slice(0,90)};
  const open=item?.open||item?.opensAt||item?.openTime||item?.open_time;
  const close=item?.close||item?.closesAt||item?.closeTime||item?.close_time;
  return {day,description:validStoreTime(open)&&validStoreTime(close)?storeTime(open)+' – '+storeTime(close):'Horario no publicado'};
 });
}
function storeBadge(s){
 if(s.hoursConfigured!==true||typeof s.isOpen!=='boolean')return '<span class="b3-store-badge unknown">Horario pendiente</span>';
 return '<span class="b3-store-badge '+(s.isOpen?'open':'closed')+'">'+(s.isOpen?'Abierto':'Cerrado')+'</span>';
}
function storeToday(s){
 if(s.hoursConfigured!==true||typeof s.isOpen!=='boolean')return 'Horario no confirmado';
 if(s.isOpen&&validStoreTime(s.closesAt))return 'Cierra a las '+storeTime(s.closesAt);
 if(!s.isOpen&&validStoreTime(s.opensAt))return 'Abre a las '+storeTime(s.opensAt);
 return s.isOpen?'En horario de atención':'Fuera del horario de atención';
}
function storeHomeCard(s){
 return '<button class="b3-home-store-card" type="button" data-home-store="'+esc(String(s.id))+'">'+
 '<span class="b3-home-store-symbol">'+ic('store',24)+'</span>'+
 '<span class="b3-home-store-copy"><strong>'+esc(s.name||'Sede')+'</strong><small>'+esc(s.address||s.addr||'Dirección no publicada')+'</small><small>'+esc(storeToday(s))+'</small><small class="b3-home-store-distance">'+esc(straightDistanceKm(s)||'Distancia no disponible')+'</small></span>'+
 '<span class="b3-home-store-end">'+storeBadge(s)+ic('chev',17)+'</span></button>';
}
function homeStores(){
 const rows=shops.filter(s=>s.active!==false);
 if(!rows.length)return '<section class="block b3-home-stores"><div class="section-head"><h2>Nuestras sedes</h2></div><p class="b3-stores-empty">Las sedes aparecerán cuando Pollos B3 publique sus datos oficiales.</p></section>';
 const index=((st.local%rows.length)+rows.length)%rows.length;
 return '<section class="block b3-home-stores" aria-label="Nuestras sedes"><div class="section-head"><h2>Nuestras sedes</h2><span class="minor">Desliza para explorar</span></div>'+
 storeHomeCard(rows[index])+'<div class="dots" role="group" aria-label="Cambiar sede">'+rows.map((_,i)=>'<button data-home-local="'+i+'" aria-label="Sede '+(i+1)+'" aria-pressed="'+(index===i)+'" class="'+(index===i?'on':'')+'"></button>').join('')+'</div></section>';
}
function homeStoreSheet(){
 const s=shops.find(x=>String(x.id)===String(selectedHomeStore));if(!s)return '';
 const addr=s.address||s.addr||'';
 const cover=s.photoUrl||s.photo_url||s.imageUrl||s.image_url||'';
 const safeCover=typeof cover==='string'&&/^https:\/\//i.test(cover);
 const directions=addr?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(addr+', Perú'):'';
 const km=straightDistanceKm(s);
 return '<div class="b3-modal-backdrop b3-store-detail-backdrop" data-home-store-close="1"><section class="b3-modal-sheet b3-store-detail" role="dialog" aria-modal="true" aria-label="Información de sede">'+
 '<div class="b3-modal-handle" aria-hidden="true"></div><button class="b3-store-detail-close" data-home-store-close="1" aria-label="Cerrar">'+ic('close',20)+'</button>'+
 (safeCover?'<img class="b3-store-detail-photo" src="'+esc(cover)+'" alt="Fotografía publicada de la sede">':'')+
 '<h2>'+esc(s.name||'Sede')+'</h2><p>'+ic('pin',16)+' '+esc(addr||'Dirección no publicada')+'</p>'+
 '<div class="b3-store-detail-status">'+storeBadge(s)+'<span>'+esc(storeToday(s))+'</span></div>'+
 '<p class="b3-store-km">'+ic('map',16)+' '+esc(km||'Distancia pendiente de ubicación y coordenadas')+'</p>'+
 '<div class="b3-store-detail-week"><h3>'+ic('clock',18)+' Horario de atención</h3>'+
 storeDailyHours(s).map(d=>'<div><span>'+d.day+'</span><strong>'+esc(d.description)+'</strong></div>').join('')+'</div>'+
 '<div class="b3-store-detail-modes"><h3>¿Cómo deseas recibir tu pedido?</h3>'+
 '<button data-home-store-mode="delivery" '+(!storeAllowed(s,'delivery')?'disabled':'')+'>'+ic('bike',20)+'<span>Pollo Delivery<small>Verificar cobertura</small></span>'+ic('chev',17)+'</button>'+
 '<button data-home-store-mode="pickup" '+(!eligibleForPickup(s)?'disabled':'')+'>'+ic('store',20)+'<span>Pide y Retira<small>Recoge en esta sede</small></span>'+ic('chev',17)+'</button></div>'+
 (directions?'<button class="b3-store-directions" data-openmaps="'+esc(directions)+'">'+ic('map',18)+' Cómo llegar</button>':'')+
 '</section></div>';
}


const ORDER_STAGES=[['RECEIVED','Pedido recibido','Registrado'],['ACCEPTED','Aceptado','Confirmado por el local'],['PREPARING','En preparación','Preparando el pedido'],['DISPATCH','En despacho','Listo para su entrega'],['DELIVERED','Entregado','Pedido finalizado']];
const TRACK_WINDOW=3600000;
// Short display reference derived from the canonical interaction UUID.
// An exact global consecutive B3-000000001 requires a centralized sequence;
// never generate a shared sequential number independently on each device.
function orderPublicCode(o){
 const uuid=String(o?.interactionId||o?.id||'');
 return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(uuid)?
  'B3-'+uuid.replace(/-/g,'').slice(0,12).toUpperCase():
  String(o?.orderCode||o?.id||'Pedido');
}
const DELIVERY_STATUS_WORDS={
 'en preparacion':'PREPARING','preparacion':'PREPARING',
 'preparando':'PREPARING','pedido en preparacion':'PREPARING',
 'en despacho':'DISPATCH','despacho':'DISPATCH',
 'despachado':'DISPATCH','en camino':'DISPATCH',
 'listo para recoger':'DISPATCH','pedido listo para recoger':'DISPATCH',
 'listo para recojo':'DISPATCH','pedido listo para recojo':'DISPATCH',
 'salio a reparto':'DISPATCH','pedido en despacho':'DISPATCH',
 'entregado':'DELIVERED','pedido entregado':'DELIVERED'
};
function agentOrderStage(message){
 if(typeof message!=='string')return null;
 const normalized=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .trim().toLocaleLowerCase('es-PE').replace(/[.!]+$/,'').trim().replace(/\s+/g,' ');
 return DELIVERY_STATUS_WORDS[normalized]||null;
}
let trackingPollTimer=null,trackingPollBusy=false;
let trackingRoundRobin=0;
function visibleLiveOrder(){
 // Track confirmed orders while any screen is visible, not just My Orders.
 const eligible=(st.orders||[]).filter(o=>o?.interactionId&&o.demo!==true&&
  o.paymentStatus==='ACCEPTED'&&o.status!=='DELIVERED'&&
  window.B3OrderAvailability?.readOrderInteraction?.(o.interactionId));
 if(!eligible.length)return null;
 if(st.stage==='orderDetail'){
  const selected=eligible.find(o=>o.id===selectedOrderId);
  if(selected)return selected;
 }
 return eligible[trackingRoundRobin%eligible.length];
}
function scheduleLiveTracking(delay=10000){
 if(trackingPollTimer!==null){clearTimeout(trackingPollTimer);trackingPollTimer=null}
 const order=visibleLiveOrder();
 if(!order||order.demo===true||order.paymentStatus!=='ACCEPTED'||
    order.status==='DELIVERED'||trackingPollBusy)return;
 trackingPollTimer=setTimeout(()=>{
  trackingPollTimer=null;void refreshLiveTracking();
 },Math.max(1500,delay));
}
function vibrateCartAddition(){
 // Subtle tactile confirmation only after an item is successfully added.
 if(typeof document==='undefined'||document.visibilityState!=='visible')return;
 if(typeof navigator==='undefined'||typeof navigator.vibrate!=='function')return;
 try{navigator.vibrate(90)}catch{}
}
function vibrateConfirmedOrderStage(stage){
 // Only notify for a verified, newly persisted state while the app is visible.
 // The browser/Android decides whether vibration is permitted by device settings.
 if(typeof document==='undefined'||document.visibilityState!=='visible')return;
 if(typeof navigator==='undefined'||typeof navigator.vibrate!=='function')return;
 try{navigator.vibrate(stage==='DELIVERED'?[200,100,200]:250)}catch{}
}
async function refreshLiveTracking(){
 if(trackingPollBusy)return;
 const order=visibleLiveOrder(),api=window.B3OrderAvailability;
 const entry=order?.interactionId?api?.readOrderInteraction?.(order.interactionId):null;
 if(!order||!entry||order.interactionId!==entry.interactionId||
    order.paymentStatus!=='ACCEPTED'||order.status==='DELIVERED'||
    typeof api.readTrackingMessages!=='function')return;
 trackingPollBusy=true;
 let nextDelay=10000;
 try{
  const result=await api.readTrackingMessages(entry);
  if(!result.available)return;
  const messages=result.messages;
  // Prefer the verified payment-approval message as chronology barrier.
  const approvalId=order.paymentAgentMessageId;
  const approvalIndex=messages.findIndex(m=>m.id===approvalId);
  // When the canonical approval message has fallen out of a bounded history,
  // require a timestamp strictly later than the local acceptance record.
  const minimumTime=Number(order.paymentApprovedAt||order.ts)||0;
  let changed=false,delivered=false,notifiedStage=null;
  for(let i=0;i<messages.length;i++){
   if(approvalIndex>=0&&i<=approvalIndex)continue;
   const message=messages[i];
   const at=Date.parse(message.createdAt);
   if(!Number.isFinite(at)||at<minimumTime-3000&&approvalIndex<0)continue;
   const stage=agentOrderStage(message.text);
   if(!stage)continue;
   const before=ORDER_STAGES.findIndex(row=>row[0]===order.status);
   const after=ORDER_STAGES.findIndex(row=>row[0]===stage);
   if(after<=before||after<2)continue;
   order.status=stage;
   order.lastTrackingMessageId=message.id;
   order.lastTrackingAt=at;
   if(stage==='DELIVERED'&&(!order.deliveredAt||order.deliveredAt<=0)){
    order.deliveredAt=at;order.reviewDismissed=false;order.deliveryNoticePending=true;delivered=true;
   }
   changed=true;
   notifiedStage=stage;
  }
  if(changed){
   save();
   vibrateConfirmedOrderStage(notifiedStage);
   render();
   if(delivered){afterOrderDelivered(order);void closeDeliveredOrderCommunication(order)}
  }
 }catch(error){
  nextDelay=error?.httpStatus===429?65000:15000;
 }finally{
  trackingPollBusy=false;
  trackingRoundRobin++;
  if(visibleLiveOrder())scheduleLiveTracking(nextDelay);
 }
}

const deliveryCloseInFlight=new Set();
async function closeDeliveredOrderCommunication(order){
 if(!order?.interactionId||order.communicationClosedAt||deliveryCloseInFlight.has(order.interactionId))return;
 const api=window.B3OrderAvailability;
 const entry=api?.readOrderInteraction?.(order.interactionId);
 if(!entry||entry.interactionId!==order.interactionId||!api.closeCommunication)return;
 deliveryCloseInFlight.add(order.interactionId);
 try{
  // The agent's verified DELIVERED message is the delivery notice.
  // The public close API has no free-text message field; do not fabricate one.
  const response=await api.closeCommunication(entry,{reason:'ORDER_DELIVERED'});
  if(response.communicationStatus==='CLOSED'){
   order.communicationClosedAt=Date.now();save();render();
  }
 }catch(error){
  console.warn('[B3 order] Delivery communication close not confirmed',error?.message||'CLOSE_FAILED');
 }finally{deliveryCloseInFlight.delete(order.interactionId)}
}
function isDemoOrder(o){return o?.demo===true||String(o?.id||'').startsWith('B3-DEMO-')}
function orderDelivered(o){return o?.status==='DELIVERED'&&Number.isFinite(o.deliveredAt)&&o.deliveredAt>0}
function activeTracking(o){return o?.status==='DELIVERED'?orderDelivered(o)&&Date.now()-o.deliveredAt<TRACK_WINDOW:true}
function findLocalOrder(id){return Array.isArray(st.orders)?st.orders.find(o=>o.id===id):null}
function normalizedBasket(items){return JSON.stringify([...items].sort((a,b)=>String(a.id).localeCompare(String(b.id))).map(x=>[x.id,x.qty]))}
function basketNames(items){return items.map(x=>{const p=product(x.id);return (p?p.name:'Producto anterior')+' ×'+x.qty}).join(' · ')}
function favoriteCard(){
 const f=st.favorite;if(!f||!Array.isArray(f.items)||!f.items.length)return '';
 const available=f.items.every(x=>{const p=product(x.id);return p&&!p.disabled});
 const total=f.items.reduce((n,x)=>n+(product(x.id)?.price||0)*x.qty,0);
 const first=product(f.items[0].id);
 return '<section class="b3-favorite-home"><div class="b3-feature-title">'+ic('heart',20)+'<h2>Vuelve a pedir tu favorito</h2></div><div class="b3-favorite-row">'+(first?img(first,'b3-favorite-thumb'):'')+'<p>'+esc(basketNames(f.items))+'</p></div><strong>'+cash(total)+'</strong><small>Precio actual estimado; no incluye Delivery</small><div class="b3-favorite-actions"><button data-fav-reorder="1" '+(!available?'disabled':'')+'>Pedir de nuevo</button><button data-fav-remove="1">Quitar favorito</button></div></section>';
}
function orderStageDisplay(order,id,title,info){
 if(id!=='DISPATCH')return {title,info};
 return order?.mode==='pickup'
  ?{title:'Listo para recoger',info:'Tu pedido está listo para recoger en la sede'}
  :{title:'En camino',info:'Tu pedido salió para entrega'};
}
function trackCard(o){
 const index=Math.max(0,ORDER_STAGES.findIndex(row=>row[0]===o.status));
 return '<div class="b3-track">'+(isDemoOrder(o)?'<p class="b3-demo-alert">REGISTRO LOCAL ANTERIOR — Los estados no están confirmados por Pollos B3.</p>':'')+
 '<div class="b3-track-heading"><strong>Seguimiento visual</strong><span>'+Math.round((index+1)/ORDER_STAGES.length*100)+'% de etapas</span></div>'+
 '<div class="b3-track-bar"><div style="width:'+((index+1)/ORDER_STAGES.length*100)+'%"></div></div>'+
 ORDER_STAGES.map(([id,title,info],i)=>{
  const completed=i<=index;
  const display=orderStageDisplay(o,id,title,info);
  return '<div class="b3-track-stage '+(completed?'done':i===index+1?'current':'upcoming')+'"><span class="b3-track-dot">'+(completed?'✓':i+1)+'</span><div><b>'+esc(display.title)+'</b><small>'+(completed?'Completado':i===index+1?esc(display.info):'Pendiente')+'</small></div></div>';
 }).join('')+
 
 (!isDemoOrder(o)&&o.status!=='DELIVERED'?'<button class="outline full" data-tracking-refresh="1">Actualizar seguimiento</button>':'')+'</div>';
}
function orderDetail(){
 const confirmed=window.B3OrderAvailability?.readInteraction?.();
 if(confirmed?.interactionId===selectedOrderId&&confirmed.paymentConfirmation?.status==='ACCEPTED'){
  if(confirmed.orderForm?.title==='VALIDACIÓN DE RECOJO')recordVerifiedPickupOrder(confirmed);
  else recordVerifiedPaymentOrder(confirmed);
 }
 const o=findLocalOrder(selectedOrderId);
 if(!o)return '<div class="page">'+heading('Pedido no disponible','app')+'</div>';
 const active=activeTracking(o);
 return '<div class="page b3-order-detail">'+heading('Pedido '+esc(orderPublicCode(o)),'app')+
 (active?trackCard(o):'<div class="b3-track-done">'+ic('check',22)+'<div><b>Pedido entregado</b><small>El seguimiento activo finalizó una hora después de la entrega.</small></div></div>')+
 '<div class="b3-order-recap"><h3>Resumen</h3><p>'+esc(basketNames(o.items))+'</p><strong>'+cash(o.total||0)+'</strong></div>'+
 (orderDelivered(o)?'<button class="primary full" data-repeat-order="'+esc(o.id)+'">Pedir de nuevo</button>'+(o.review?'<p class="smallprint">Opinión guardada en este dispositivo.</p>':'<button class="outline full" data-open-review="'+esc(o.id)+'">Calificar pedido</button>'):'')+'</div>';
}
function deliveredNotice(){
 const o=findLocalOrder(deliveredNoticeOrderId);
 if(!o||!orderDelivered(o)||!o.deliveryNoticePending)return '';
 return '<div class="b3-overlay"><div class="b3-bottom-sheet" role="dialog" aria-modal="true" aria-label="Pedido entregado"><div class="b3-sheet-grip"></div><h2>¡Tu pedido fue entregado!</h2><p>El pedido <strong>'+esc(orderPublicCode(o))+'</strong> figura como entregado.</p><button class="primary full" data-delivery-notice-ok="1">Aceptar</button></div></div>';
}
function favoritePrompt(){
 const o=findLocalOrder(favoritePromptOrderId);
 if(!o||!orderDelivered(o)||o.favoritePromptDone)return '';
 return '<div class="b3-overlay"><div class="b3-bottom-sheet" role="dialog" aria-modal="true" aria-label="Guardar favorito"><div class="b3-sheet-grip"></div><h2>¿Actualizar tu favorito?</h2><p>¿Quieres guardar este pedido para volver a pedirlo fácilmente?</p><p class="b3-feedback-order">'+esc(basketNames(o.items))+'</p><button class="primary full" data-accept-favorite="1">Sí, guardar como favorito</button><button class="outline full" data-decline-favorite="1">Conservar el favorito anterior</button></div></div>';
}
function reviewSheet(){
 const o=findLocalOrder(reviewSheetOrderId);
 if(!o||!orderDelivered(o)||o.review)return '';
 const submission=o.surveySubmission;
 return '<div class="b3-overlay"><div class="b3-bottom-sheet" role="dialog" aria-modal="true" aria-label="Encuesta de satisfacción"><div class="b3-sheet-grip"></div><h2>¿Qué tal estuvo tu pedido?</h2><p>Tu opinión nos ayuda a mejorar.</p>'+
 '<button type="button" data-review-close="1" aria-label="Cerrar encuesta" style="position:absolute;right:20px;top:18px;border:0;background:transparent;font-size:30px;line-height:1;padding:8px;cursor:pointer">×</button><div class="b3-rating-stars">'+[1,2,3,4,5].map(n=>'<button data-review-star="'+n+'" '+(reviewSending||submission?'disabled':'')+' aria-label="'+n+' estrellas">'+((submission?.rating||reviewScore)>=n?'★':'☆')+'</button>').join('')+'</div>'+
 '<div class="b3-feedback-tags">'+['Sabor','Temperatura','Tiempo','Presentación','Atención'].map(k=>'<button class="'+((submission?.tags||reviewTags).includes(k)?'selected':'')+'" data-review-tag="'+k+'" '+(reviewSending||submission?'disabled':'')+'>'+k+'</button>').join('')+'</div>'+
 '<label>Comentario (opcional)<textarea id="review-comment" maxlength="500" rows="3" '+(reviewSending||submission?'disabled':'')+' placeholder="Cuéntanos tu experiencia">'+esc(submission?.comment||'')+'</textarea></label>'+
 (reviewSendError?'<div class="notice" role="alert">'+esc(reviewSendError)+'</div>':'')+
 '<button class="primary full" data-review-send="1" '+(reviewSending?'disabled':'')+'>'+
 (reviewSending?'Enviando encuesta...':submission?'Reintentar envío':'Enviar opinión')+'</button>'+
 '<small>La encuesta se envía a Pollos B3. Solo aparecerá como registrada cuando el servidor la confirme.</small></div></div>';
}
function newSurveyId(){
 const bytes=new Uint8Array(16);
 if(!globalThis.crypto?.getRandomValues)throw Error('No se puede generar un identificador seguro de encuesta.');
 globalThis.crypto.getRandomValues(bytes);
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
async function sendDeliveredSurvey(order){
 if(reviewSending||!order||!orderDelivered(order)||order.review)return;
 if(!order.interactionId||!order.storeId||!window.B3OrderAvailability?.submitOrderSurvey){
  reviewSendError='Esta versión no puede enviar encuestas para el pedido seleccionado.';
  render();return;
 }
 let submission=order.surveySubmission;
 if(!submission){
  const rating=reviewScore;
  if(!Number.isInteger(rating)||rating<1||rating>5){
   toast('Selecciona una calificación de 1 a 5 estrellas');return;
  }
  const comment=(document.getElementById('review-comment')?.value||'').trim();
  if(comment.length>500){toast('El comentario no puede superar 500 caracteres');return}
  try{submission={key:newSurveyId(),rating,tags:[...reviewTags],comment}}
  catch(error){
   reviewSendError=String(error?.message||'No se pudo preparar un envío seguro de la encuesta.');
   render();return;
  }
  order.surveySubmission=submission;
  save(); // Keep the idempotency key and exact payload for any retry.
 }
 reviewSending=true;reviewSendError='';render();
 try{
  const result=await window.B3OrderAvailability.submitOrderSurvey({
   interactionId:order.interactionId,storeId:order.storeId,
   idempotencyKey:submission.key,rating:submission.rating,
   tags:submission.tags,comment:submission.comment
  });
  order.review={score:submission.rating,tags:submission.tags,comment:submission.comment,
   createdAt:Date.parse(result.createdAt)||Date.now(),surveyId:result.surveyId,stored:true};
  delete order.surveySubmission;
  order.reviewDismissed=false;
  reviewSheetOrderId=null;
  save();
  toast('Encuesta enviada a Pollos B3',{durationMs:2000});
 }catch(error){
  reviewSendError=String(error?.message||'No se pudo entregar la encuesta. Puedes reintentar.');
 }finally{reviewSending=false;render()}
}
function afterOrderDelivered(o){
 if(!orderDelivered(o))return;
 if(o.deliveryNoticePending){deliveredNoticeOrderId=o.id;favoritePromptOrderId=null;reviewSheetOrderId=null;render();return}
 if(!o.favoritePromptDone&&(!st.favorite||normalizedBasket(st.favorite.items)!==normalizedBasket(o.items))){favoritePromptOrderId=o.id;reviewSheetOrderId=null;render();return}
 if(!o.review&&!o.reviewDismissed){reviewSheetOrderId=o.id;reviewScore=0;reviewTags=[];render()}
}

const menuCategories=['Todos','Pollos','Promociones','Combos','Bebidas'];
const categoryMatches=(p,c)=>String(p.cat||'').trim().toLocaleLowerCase('es-PE')===c.toLocaleLowerCase('es-PE');
const comboProducts=()=>products.filter(p=>categoryMatches(p,'Combos'));

let promoHomeSince=0,promoNoticeTimer=null,promoNoticeBusy=false,promoNoticeShown=new Set(),promoNoticeItems=[],promoNoticeIndex=0,promoNoticeRotation=null,promoLastCheck=0;
let promotionSyncAt=0,promotionSyncPromise=null;
function promoHomeEligible(){return st.stage==='app'&&st.tab==='inicio'&&!fulfillmentModal&&!selectedHomeStore&&document.visibilityState==='visible'&&!root.querySelector('[role="dialog"],[aria-modal="true"]')}
function promoVisibleNow(p,now=new Date()){
 if(p.active===false)return false;
 if(!p.startDate||!p.endDate||!p.startTime||!p.endTime||!Array.isArray(p.weekdays))return !(p.starts_at&&new Date(p.starts_at)>now)&&!(p.ends_at&&new Date(p.ends_at)<now);
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 const date=parts.year+'-'+parts.month+'-'+parts.day,clock=parts.hour+':'+parts.minute,day=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(parts.weekday)+1;
 return date>=p.startDate&&date<=p.endDate&&clock>=p.startTime&&clock<p.endTime&&p.weekdays.includes(day);
}
const promoKey=p=>String(p.id||p.title);
function closePromoNotice(){
 clearInterval(promoNoticeRotation);promoNoticeRotation=null;promoNoticeItems=[];
 const el=document.getElementById('b3-promo-notice');if(el){el.style.opacity='0';el.style.pointerEvents='none';setTimeout(()=>el.remove(),180)}
}
function linkedPromoProduct(p){
 // Only open a product actually published in the current catalog.
 const raw=p?.productId??p?.product_id??p?.product?.id??p?.linkedProductId??null;
 if(typeof raw!=='string'||!raw.trim())return null;
 const id=raw.startsWith('api:')?raw:'api:'+raw;
 return products.find(item=>item.id===id&&item.isPublished===true)||null;
}
function scheduledPromotionForProduct(item){
 if(!item?.isPublished)return null;
 return publishedPromotions.find(p=>linkedPromoProduct(p)?.id===item.id)||null;
}
function promotionOutsideSchedule(item){
 const promotion=scheduledPromotionForProduct(item);
 return !!item?.isPublished&&((promotion&&!promoVisibleNow(promotion))||
  (categoryMatches(item,'Promociones')&&!promotion));
}
function promotionNotPurchasable(item){return !!item&&(item.disabled||promotionOutsideSchedule(item));}
function openLinkedPromoProduct(){
 const p=promoNoticeItems[promoNoticeIndex],linked=linkedPromoProduct(p);
 if(!linked||promotionNotPurchasable(linked)){toast('Esta promoción no está disponible en este horario.');return}
 closePromoNotice();st.selected=linked.id;st.qty=1;screen('detail');
}
function paintPromoNotice(){
 const el=document.getElementById('b3-promo-notice');if(!el)return;
 promoNoticeItems=promoNoticeItems.filter(p=>promoVisibleNow(p)&&linkedPromoProduct(p));if(!promoNoticeItems.length){closePromoNotice();return}
 promoNoticeIndex=(promoNoticeIndex+promoNoticeItems.length)%promoNoticeItems.length;
 const p=promoNoticeItems[promoNoticeIndex],linked=linkedPromoProduct(p);
 el.querySelector('[data-promo-title]').textContent=p.title;
 const image=el.querySelector('[data-promo-image]'),price=el.querySelector('[data-promo-price]'),open=el.querySelector('[data-open-promo]');
 const src=linked?.imageUrl||'';
 image.hidden=!src;
 if(src){image.src=src.startsWith('/')?API_BASE+src:src;image.alt='Imagen de '+linked.name}else image.removeAttribute('src');
 price.textContent=linked?linked.name+' · '+cash(linked.price):'';
 const inactive=!linked||promotionNotPurchasable(linked);
 const tag=el.querySelector('[data-promo-inactive]');tag.hidden=!inactive;tag.textContent=linked?'DESACTIVADO':'PRODUCTO NO DISPONIBLE';
 open.disabled=inactive;open.textContent=inactive?'No disponible':'Ver producto';open.style.opacity=inactive?'.55':'1';
 el.querySelector('[data-promo-dots]').replaceChildren(...promoNoticeItems.map((_,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label','Promoción '+(i+1));b.style.cssText='border:0;border-radius:50%;width:9px;height:9px;padding:0;background:'+(i===promoNoticeIndex?'#b91c1c':'#ddd');b.onclick=()=>{promoNoticeIndex=i;paintPromoNotice()};return b}));
}
function showPromoNotice(items){
 if(!promoHomeEligible()||document.getElementById('b3-promo-notice'))return;
 promoNoticeItems=items;promoNoticeIndex=0;items.forEach(p=>promoNoticeShown.add(promoKey(p)));
 const el=document.createElement('div');el.id='b3-promo-notice';el.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .18s ease';
 el.innerHTML='<section role="dialog" aria-modal="true" aria-label="Promociones" style="box-sizing:border-box;width:min(86vw,420px);max-height:85vh;max-height:85dvh;display:flex;flex-direction:column;justify-content:flex-start;overflow:auto;background:#fff;color:#222;border-radius:22px;padding:18px 18px 20px;box-shadow:0 16px 50px #0004;text-align:center;position:relative"><button data-close-promo aria-label="Cerrar" style="position:absolute;right:12px;top:10px;border:0;background:transparent;font-size:24px;color:#555">×</button><div style="font-size:11px;letter-spacing:2px;color:#b91c1c;font-weight:800;margin:24px 0 8px">PROMOCIÓN ESPECIAL</div><h2 data-promo-title style="font-size:clamp(22px,5vw,29px);line-height:1.2;overflow-wrap:anywhere;margin:8px 0 12px"></h2><img data-promo-image hidden style="width:100%;max-height:43vh;object-fit:contain;border-radius:12px;margin:0 auto 10px" alt=""><div data-promo-price style="font-weight:700;margin-bottom:8px"></div><div data-promo-inactive hidden style="color:#b91c1c;font-weight:800;margin-bottom:10px" role="status">DESACTIVADO</div><button data-open-promo style="width:100%;border:0;background:#b91c1c;color:white;border-radius:12px;padding:13px;font-weight:700">Ver promoción</button><div data-promo-dots style="display:flex;justify-content:center;gap:8px;margin-top:14px"></div></section>';
 document.body.append(el);requestAnimationFrame(()=>{el.style.opacity='1'});paintPromoNotice();
 el.querySelector('[data-close-promo]').onclick=closePromoNotice;
 el.querySelector('[data-open-promo]').onclick=openLinkedPromoProduct;
 let x=0;el.addEventListener('touchstart',e=>{x=e.touches[0].clientX},{passive:true});el.addEventListener('touchend',e=>{const d=e.changedTouches[0].clientX-x;if(Math.abs(d)>35){promoNoticeIndex+=d<0?1:-1;paintPromoNotice()}},{passive:true});
 promoNoticeRotation=setInterval(()=>{if(!promoHomeEligible()){closePromoNotice();return}if(promoNoticeItems.length>1)promoNoticeIndex++;paintPromoNotice()},5000);
}
async function syncPromotionCatalog({force=false}={}){
 if(!API_BASE||document.visibilityState!=='visible')return false;
 if(promotionSyncPromise)return promotionSyncPromise;
 if(!force&&Date.now()-promotionSyncAt<30000)return true;
 promotionSyncAt=Date.now();
 promotionSyncPromise=(async()=>{
  try{
   // One published snapshot feeds both the popup and the catalog.
   // Do not use fetchConfig here: it also resets delivery availability on revision changes.
   const response=await fetch(API_BASE+'/api/v1/mobile/config?appId='+encodeURIComponent(APP_ID),{cache:'no-store'});
   if(!response.ok)return false;
   const c=await response.json();
   if(!c.ready||!Array.isArray(c.promotions))return false;
   // Refresh promotion schedules only. Keep the catalog, prices and images untouched.
   publishedPromotions=c.promotions.filter(p=>p&&typeof p.title==='string'&&p.title.trim());
   if(st.stage==='app'&&(st.tab==='inicio'||st.tab==='carta'))render();
   return true;
  }catch{return false}
  finally{promotionSyncPromise=null}
 })();
 return promotionSyncPromise;
}
async function tickPromoNotice(){
 if(!promoHomeEligible()){promoHomeSince=0;closePromoNotice();return}
 if(!promoHomeSince)promoHomeSince=Date.now();
 if(Date.now()-promoHomeSince<3000||promoNoticeBusy||document.getElementById('b3-promo-notice')||!API_BASE)return;
 promoNoticeBusy=true;
 try{
  if(!await syncPromotionCatalog())return;
  if(!promoHomeEligible())return;
  const items=publishedPromotions.filter(p=>promoVisibleNow(p)&&linkedPromoProduct(p)&&!promoNoticeShown.has(promoKey(p)));
  if(items.length)showPromoNotice(items);
 }finally{promoNoticeBusy=false}
}
setInterval(tickPromoNotice,1000);
setInterval(()=>{
 if(document.visibilityState==='visible'&&st.stage==='app'&&st.tab==='carta')render();
},60000);

function home(){
  const featured=products.slice(0,4);
  const f=featured.length?featured[st.carousel%featured.length]:null;
  const heroVisual=f;
  const promos=comboProducts();
  const pp=promos.length?promos[st.promo%promos.length]:null;
  const shop=shops.length?shops[st.local%shops.length]:null;
  return `<div class="home home-v10">
    ${fulfillmentHeader()}
    ${favoriteCard()}
    <section class="hero-carousel" aria-label="Productos destacados">
      <div class="section-head section-head-featured"><h2>Para disfrutar hoy</h2></div>
      ${f?`<div class="hero-card" data-product="${f.id}" tabindex="0" role="button" aria-label="Ver ${esc(f.name)}">
        ${img(heroVisual,'hero-img')}
        <div class="hero-scrim"></div>
        <div class="hero-top"><span>DESTACADO</span><small>${st.carousel%featured.length+1} / ${featured.length}</small></div>
        <div class="hero-overlay"><div><span class="hero-label">POLLOS B3</span><h2>${esc(f.name)}</h2><strong>${cash(f.price)}</strong></div></div>
        <button class="add-feature" data-quick="${f.id}" aria-label="Seleccionar ${esc(f.name)}">${ic('plus',22)}</button>
      </div>`:'<div class="notice">La empresa todavía no ha publicado productos destacados.</div>'}
      <div class="dots dots-feature" role="group" aria-label="Cambiar destacado">${featured.map((_,i)=>`<button aria-label="Destacado ${i+1}" aria-pressed="${i===st.carousel%featured.length}" class="${i===st.carousel%featured.length?'on':''}" data-carousel="${i}"></button>`).join('')}</div>
    </section>
    <section class="block recommendations" aria-label="Productos recomendados">
      <div class="section-head"><h2>Te recomendamos</h2><button data-tab="carta">Ver carta ${ic('chev',16)}</button></div>
      <div class="reco-scroll">${products.slice(0,3).map(p=>`<article class="reco"><button class="reco-view" data-product="${p.id}" aria-label="Ver ${esc(p.name)}">${img(p)}<span class="reco-name">${esc(p.name)}</span></button><div class="reco-bottom"><b>${cash(p.price)}</b><button data-quick="${p.id}" aria-label="Seleccionar ${esc(p.name)}">${ic('plus',18)}</button></div></article>`).join('')}</div>
    </section>
    <section class="block recommendations" aria-label="Combos para compartir">
      <div class="section-head"><h2>Combos para compartir</h2></div>
      <div class="reco-scroll" style="display:flex;gap:12px;overflow-x:auto">${promos.map(p=>`<article class="reco" style="flex:0 0 calc((100% - 12px)/2);min-width:0"><button class="reco-view" data-product="${p.id}" aria-label="Ver ${esc(p.name)}">${img(p)}<span class="reco-name">${esc(p.name)}</span></button><div class="reco-bottom"><b>${p.disabled?'Consultar':cash(p.price)}</b><button data-quick="${p.id}" ${p.disabled?'disabled':''} aria-label="Seleccionar ${esc(p.name)}">${ic('plus',18)}</button></div></article>`).join('')||'<div class="notice">No hay combos publicados.</div>'}</div>
    </section>
    ${homeStores()}
    <p class="home-disclaimer">Prototipo de Pollos B3. Imágenes, nombres comerciales, precios, combos y ubicaciones sujetos a confirmación antes de la publicación.</p>
  </div>`;
}
function card(p,index=-1){const inactive=promotionOutsideSchedule(p),blocked=promotionNotPurchasable(p);return `<article class="item" style="${inactive?'filter:grayscale(1);opacity:.62;':''}" ${blocked?'':'data-product="'+esc(p.id)+'"'}><div class="item-picture">${img(p,'',index>=0&&index<2)}<span>${inactive?'DESACTIVADO':p.isPublished?'Publicado':'Referencial'}</span></div><div class="item-text"><strong>${esc(p.name)}</strong>${inactive?'<small style="color:#b91c1c;font-weight:800">DESACTIVADO · Fuera del horario de promoción</small>':''}<div class="item-bottom"><b>${p.disabled?'Consultar':cash(p.price)}</b><button data-quick="${p.id}" ${blocked?'disabled':''} aria-label="Agregar ${esc(p.name)}">${ic('plus',20)}</button></div></div></article>`}
function carta(){const term=(st.search||'').toLocaleLowerCase('es-PE');const list=products.filter(p=>(st.category==='Todos'||categoryMatches(p,st.category))&&(!term||(p.name+' '+p.desc+' '+p.cat).toLocaleLowerCase('es-PE').includes(term))).sort((a,b)=>{const pa=Number(a.price),pb=Number(b.price);return (Number.isFinite(pa)?pa:Infinity)-(Number.isFinite(pb)?pb:Infinity)||String(a.name||'').localeCompare(String(b.name||''),'es-PE')});return `<div class="carta"><h1>La carta</h1><p>Elige lo que más te gusta.</p><div class="filters">${menuCategories.map(c=>`<button data-filter="${esc(c)}" class="${c===st.category?'selected':''}">${esc(c)}</button>`).join('')}</div><div class="search-feedback">${st.search?`Resultados para «${esc(st.search)}» · <button data-clearsearch="1">Limpiar búsqueda</button>`:''}</div><div class="cards">${list.map((p,i)=>card(p,i)).join('')||'<p class="search-empty">No encontramos productos en esta demostración.</p>'}</div><p class="smallprint">Los productos de muestra son referenciales; los productos publicados se identifican en cada tarjeta. No hay pedidos ni cobros reales habilitados.</p></div>`}
let b3OrdersFilter='all';
function b3OrderStatus(o){
 const code=String(o.status||'');
 const stage=ORDER_STAGES.find(x=>x[0]===code);
 return stage?orderStageDisplay(o,code,stage[1],stage[2]).title:'Sin procesar';
}
function b3OrderCard(o){
 const done=orderDelivered(o),label=b3OrderStatus(o);
 const statusClass=done?'done':o.status==='ACCEPTED'?'accepted':o.status==='PREPARING'?'preparing':o.status==='DISPATCH'?'dispatch':'pending';
 return '<article class="b3-orders-card">'+
 '<button class="b3-orders-card-main" data-order-open="'+esc(o.id)+'" aria-label="Ver detalle del pedido '+esc(orderPublicCode(o))+'">'+
 '<span class="b3-orders-icon">'+ic(done?'check':'orders',23)+'</span>'+
 '<span class="b3-orders-info"><b>'+esc(orderPublicCode(o))+'</b><small>'+new Date(Number.isFinite(o.ts)&&o.ts>0?o.ts:o.paymentApprovedAt).toLocaleDateString('es-PE',{day:'2-digit',month:'short',year:'numeric'})+' · '+(isDemoOrder(o)?'Pedido de prueba':'Pedido')+'</small><span class="b3-orders-status '+statusClass+'">'+esc(label)+'</span></span>'+
 '<span class="b3-orders-price"><strong>'+cash(o.total||0)+'</strong>'+ic('chev',18)+'</span></button>'+
 (done?'<div class="b3-orders-card-footer"><button data-repeat-order="'+esc(o.id)+'">'+ic('cart',16)+' Volver a pedir</button>'+(o.review?'<span class="b3-orders-reviewed">'+ic('check',15)+' Opinión enviada</span>':'<button data-open-review="'+esc(o.id)+'">'+ic('check',15)+' '+(o.surveySubmission?'Reintentar encuesta':'Calificar pedido')+'</button>')+'</div>':'')+
 '</article>';
}
function orders(){
 const confirmed=window.B3OrderAvailability?.readInteraction?.();
 if(confirmed?.paymentConfirmation?.status==='ACCEPTED'){
  if(confirmed.orderForm?.title==='VALIDACIÓN DE RECOJO')recordVerifiedPickupOrder(confirmed);
  else recordVerifiedPaymentOrder(confirmed);
 }
 const list=Array.isArray(st.orders)?st.orders.filter(o=>o&&typeof o.id==='string'&&
  Date.now()-(Number.isFinite(o.ts)&&o.ts>0?o.ts:o.paymentApprovedAt)<60*24*3600000):[];
 const active=list.filter(o=>!orderDelivered(o)),history=list.filter(o=>orderDelivered(o));
 const shownActive=true;
 const shownHistory=true;
 const filters=[['all','Todos',list.length],['active','En seguimiento',active.length],['history','Entregados',history.length]];
 const css='<style>'+
 '.b3-orders-page{padding-bottom:100px}.b3-orders-intro{display:flex;align-items:center;justify-content:space-between;gap:12px}.b3-orders-intro h1{margin-bottom:5px}.b3-orders-intro p{color:#747474;margin:0;font-size:13px}.b3-orders-intro-icon{width:48px;height:48px;border-radius:15px;background:#fff0f1;color:#d50b27;display:grid;place-items:center;flex-shrink:0}'+
 '.b3-orders-summary{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin:22px 0 18px}.b3-orders-summary>div{border:1px solid #e9e9e9;border-radius:16px;background:#fff;padding:14px 16px;display:flex;flex-direction:column;gap:4px}.b3-orders-summary b{font-size:24px;color:#222}.b3-orders-summary small{font-size:12px;color:#777}'+
 '.b3-orders-filters{display:flex;gap:8px;overflow-x:auto;padding:2px 0 8px;scrollbar-width:none}.b3-orders-filters::-webkit-scrollbar{display:none}.b3-orders-filters button{flex-shrink:0;border:1px solid #e7e7e7;background:white;border-radius:999px;padding:9px 13px;color:#555;font-size:12px;font-weight:700}.b3-orders-filters button.selected{background:#cf0925;border-color:#cf0925;color:white}.b3-orders-filters span{opacity:.7;margin-left:3px}'+
 '.b3-orders-group{margin-top:20px}.b3-orders-group h2{font-size:17px;margin:0 0 12px;color:#222}.b3-orders-card{border:1px solid #e9e9e9;border-radius:18px;background:white;margin-bottom:12px;overflow:hidden;box-shadow:0 3px 12px rgba(0,0,0,.035)}.b3-orders-card-main{width:100%;display:flex;align-items:center;gap:11px;text-align:left;border:0;background:transparent;padding:15px 12px;color:inherit;min-width:0}.b3-orders-icon{width:42px;height:42px;flex-shrink:0;border-radius:13px;background:#fff1f2;color:#c70926;display:grid;place-items:center}.b3-orders-info{min-width:0;flex:1;display:flex;flex-direction:column;align-items:flex-start;gap:5px}.b3-orders-info b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}.b3-orders-info small{color:#777;font-size:11px}.b3-orders-status{font-size:10px;font-weight:750;border-radius:999px;padding:5px 9px;background:#f1f1f1;color:#555}.b3-orders-status.done{background:#e7f7ee;color:#167647}.b3-orders-status.accepted{background:#fff3d7;color:#976000}.b3-orders-status.preparing{background:#fff1e4;color:#b45c0c}.b3-orders-status.dispatch{background:#e9f2ff;color:#2866b0}.b3-orders-price{display:flex;align-items:center;gap:4px;flex-shrink:0;color:#888}.b3-orders-price strong{font-size:15px;color:#b90925;white-space:nowrap}.b3-orders-card-footer{border-top:1px solid #f0f0f0;display:flex;justify-content:space-between;gap:6px;padding:8px 12px}.b3-orders-reviewed{display:flex;align-items:center;gap:5px;padding:8px 3px;color:#167647;font-size:12px;font-weight:700}.b3-orders-card-footer button{border:0;background:transparent;color:#c50925;font-size:12px;font-weight:700;display:flex;align-items:center;gap:5px;padding:8px 3px}.b3-orders-empty-group{padding:16px;color:#777;background:#f8f8f8;border-radius:12px;font-size:13px}'+
 '</style>';
 return '<div class="page b3-orders-page">'+css+
 '<div class="b3-orders-intro"><div><h1>Mis pedidos</h1><p>Consulta tus pedidos y su seguimiento.</p></div><span class="b3-orders-intro-icon">'+ic('orders',25)+'</span></div>'+
 (list.length?(shownActive?'<section class="b3-orders-group"><h2>En seguimiento</h2>'+(active.length?active.map(b3OrderCard).join(''):'<p class="b3-orders-empty-group">No tienes pedidos en seguimiento.</p>')+'</section>':'')+
 (shownHistory?'<section class="b3-orders-group"><h2>Historial de entregas</h2>'+(history.length?history.map(b3OrderCard).join(''):'<p class="b3-orders-empty-group">Todavía no tienes pedidos entregados.</p>')+'</section>':''):
 '<div class="empty-state"><h2>Aún no tienes pedidos</h2><p>Cuando confirmes un pedido podrás consultar aquí su información.</p><button class="primary" data-tab="carta">Ver la carta</button></div>')+'</div>';
}
function account(){let rows=[['Mi perfil','user','profile'],['Direcciones guardadas','pin','address'],['Métodos de pago','card','methods'],['Notificaciones','bell','notifications'],['Nuestra Historia','book','history'],['Trabaja con nosotros','store','jobs'],['Privacidad y protección de datos','shield','privacy'],['Sobre la App','info','about']];return `<div class="page acc"><h1>Mi Cuenta</h1><button class="profile-line" data-screen="login">${ic('user',31)}<div><b>${st.registered?esc(st.authProvider==='google'?(st.authDisplayName||st.authGoogleEmail):st.profile.first||'Teléfono registrado'):'Inicia sesión'}</b><small>${st.registered?(st.authProvider==='google'?'Sesión verificada con Google · datos locales':'Teléfono guardado sin verificación de identidad'):'Para acceder a tu historial y datos guardados'}</small></div>${ic('chev')}</button><div class="rows">${rows.map(([label,icon,screen])=>`<button data-screen="${screen}">${ic(icon,20)}<span>${label}</span>${screen==='notifications'&&notificationUnreadCount()?`<b class="b3-account-notification-count">${notificationUnreadCount()}</b>`:''}${ic('chev',17)}</button>`).join('')}</div><h2 class="group-label">Ayuda</h2><div class="rows"><button data-screen="faq">${ic('help',20)}<span>Preguntas frecuentes</span>${ic('chev',17)}</button><button data-screen="claims">${ic('book',20)}<span>Libro de reclamaciones</span>${ic('chev',17)}</button></div>${st.registered?'<button class="logout" data-logout="1">Cerrar sesión</button>':''}</div>`}
function splash(){return `<div class="splash b3-splash" aria-label="Pollos B3, la pollería más viral de Santa Anita">
  <div class="b3-splash-halo" aria-hidden="true"></div>
  <img class="b3-splash-logo" src="images/pollosb3-header-logo.png" alt="Pollos B3">
  <h1 class="b3-splash-slogan"><span>LA POLLERÍA MÁS VIRAL DE</span><strong>SANTA ANITA</strong></h1>
  <div class="b3-splash-loading"><span>${splashLoadError?"NO PUDIMOS CARGAR LA CARTA":"PREPARANDO TU CARTA..."}</span>${splashLoadError?'<p role="alert" style="color:white;text-align:center;padding:12px">Revisa tu conexión. La carta no está disponible.</p><button type="button" data-splash-retry="1" style="background:white;color:#a90016;border:0;border-radius:24px;padding:12px 24px;font-weight:700">Reintentar</button>':'<div class="b3-splash-track" role="progressbar" aria-label="Preparando la carta"><i></i></div>'}</div>
</div>`}
function login(){return `<div class="login"><div class="login-photo">${products.length?img(products[0]):'<img src="images/pollosb3-header-logo.png" alt="Pollos B3" loading="eager">'}</div><div class="login-body"><h1>Bienvenido a <em>Pollos B3</em></h1><p>Tu pollo favorito está a unos toques de distancia.</p><button class="primary" data-screen="signin-phone">${ic('phone')} Continuar con teléfono</button><button class="outline b3-google-btn" data-google-login="1" ${googleSignInPending?'disabled':''}><span class="b3-google-mark" aria-hidden="true">G</span> ${googleSignInPending?'Conectando con Google...':'Continuar con Google'}</button><span class="or">o</span><button class="guest" data-guest="1">Continuar como invitado</button><small class="hint">El teléfono se guarda como dato de contacto sin verificación por SMS. Google permite iniciar sesión con tu cuenta.</small></div></div>`}
function heading(title,back){return `<div class="screen-heading"><button aria-label="Regresar" data-screen="${back||'app'}">${ic('back')}</button>${title?`<h1>${esc(title)}</h1>`:''}</div>`}
// Reservation is a request, NOT an automatically accepted commercial order.
// This UI is isolated until the Administrator publishes a reservation contract.
function reservationMinLead(store){
 // The inspected Admin contract currently publishes reservationSettings.preparationMinutes,
 // which is preparation duration, NOT a minimum booking lead time.
 // Never misuse preparation time as a booking restriction.
 const raw=store?.reservationMinimumMinutes;
 return Number.isInteger(raw)&&raw>=0&&raw<=10080?raw:null;
}
function reservationTimeValue(input){
 if(typeof input!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(input))return NaN;
 const [d,t]=input.split('T'),[y,m,day]=d.split('-').map(Number),[h,min]=t.split(':').map(Number);
 const parsed=new Date(Date.UTC(y,m-1,day,h+5,min));
 // America/Lima has fixed UTC-5 for the operational dates used by Pollos B3.
 const check=new Date(Date.UTC(y,m-1,day));
 return check.getUTCFullYear()===y&&check.getUTCMonth()===m-1&&check.getUTCDate()===day?parsed.getTime():NaN;
}
let reservationAddressEditing=false;
let reservationQuote=null;
let reservationQuoteBusy=false;
let reservationQuoteError='';
let reservationQuoteGeneration=0;
 function resetReservationQuote(){++reservationQuoteGeneration;reservationQuote=null;reservationQuoteBusy=false;reservationQuoteError='';reservationAddressEditing=false;}
// For Delivery the Admin selects the eligible store using the same location and
// online-agent principle as immediate Delivery; no customer store selection.
// For pickup the current reservations quote contract requires a storeId, so
// Android tries eligible published stores until the Admin confirms an online agent.
async function checkReservationQuote(){
 if(st.scheduleMode!=='reservation'||reservationQuoteBusy)return;
 if(!API_BASE){reservationQuoteError='No pudimos consultar las reservas. Intenta nuevamente.';render();return}
 let when;
 try{when=window.B3ReservationForms.schedule(st.reservationAt)}
 catch(error){reservationQuoteError=error.message;render();return}
 if(when.from<=Date.now()){
  reservationQuoteError='Selecciona una fecha y hora futuras.';render();return;
 }
 const permitted=shops.filter(x=>x?.active===true&&x.reservation_enabled===true&&
   x.reservationAcceptingRequests===true&&x[st.mode+'_enabled']===true);
 if(st.mode!=='delivery'&&!permitted.length){
  reservationQuoteError='En este momento no hay sedes disponibles para recibir reservas.';render();return;
 }
 const generation=++reservationQuoteGeneration;
 const scheduledAt=st.reservationAt;
 const mode=st.mode;
 const params={appId:APP_ID,catalogRevision:publishedRevision,mode,
  date:scheduledAt.slice(0,10),time:scheduledAt.slice(11)};
 if(mode==='delivery'){
  const address=String(st.profile.address||'').trim(),district=String(st.profile.district||'').trim();
  if(address.length<6||district.length<2){
   reservationQuoteError='Primero completa la dirección y distrito de entrega.';render();return;
  }
  let loc=deliveryLocation;
  try{
   if(!hasDeliveryDestination(address,district)){
    loc=await geocodeDeliveryDestination(address,district);
    if(generation!==reservationQuoteGeneration)return;
    deliveryLocation={...loc,key:deliveryAddressKey(address,district)};
   }
  }catch(error){if(generation===reservationQuoteGeneration){reservationQuoteError='No pudimos verificar tu dirección. Revísala e intenta nuevamente.';render()}return}
  if(!loc||!Number.isFinite(loc.latitude)||!Number.isFinite(loc.longitude)){
   reservationQuoteError='No pudimos verificar la ubicación de entrega.';render();return;
  }
  Object.assign(params,{latitude:loc.latitude,longitude:loc.longitude,useGps:true,
   address,district,reference:st.profile.reference||''});
 }
 reservationQuoteBusy=true;reservationQuote=null;reservationQuoteError='';st.store='';st.pay='';render();
 try{
  let selected=null;
  if(mode==='delivery'){
   const api=window.B3OrderAvailability;
   if(!api?.checkAgentAvailability)throw Error('No se pudo consultar la atención de Delivery.');
   const candidates=eligibleDeliveryCandidates(deliveryLocation).filter(c=>storeAvailabilitySetting(c.store)===true);
   for(const candidate of candidates){
    if(generation!==reservationQuoteGeneration)return;
    const quote=quoteForDeliveryCandidate(candidate);
    if(!quote.paymentMethods.length)continue;
    const check=await api.checkAgentAvailability({appId:APP_ID,storeId:candidate.store.id});
    if(generation!==reservationQuoteGeneration)return;
    if(check.available){selected={...quote,date:params.date,time:params.time,revision:publishedRevision,agentAvailable:true,acceptingRequests:true};break;}
   }
  }else for(const candidate of permitted){
   if(generation!==reservationQuoteGeneration)return;
   const query=candidate?{...params,storeId:candidate.id}:params;
   const response=await fetch(API_BASE+'/api/v1/mobile/reservations/quote',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(query),cache:'no-store'});
   const result=await response.json().catch(()=>({}));
   if(!response.ok){
    if(mode==='pickup'&&[404,409].includes(response.status))continue;
    throw Error(response.status===503?'La atención de reservas no está disponible por ahora.':
     'No encontramos una sede que pueda atender la reserva en este momento.');
   }
   const matching=permitted.find(x=>x.id===result.storeId);
   if(!matching||candidate&&result.storeId!==candidate.id||
      result.date!==params.date||result.time!==params.time||
      result.mode!==mode||result.revision!==publishedRevision||
      !Array.isArray(result.paymentMethods)||
      !Number.isFinite(result.deliveryFeePen)||result.deliveryFeePen<0||
      result.agentAvailable!==true||result.acceptingRequests!==true)
     throw Error('No pudimos confirmar la disponibilidad. Vuelve a consultar.');
   selected=result;break;
  }
  if(!selected)throw Error('Ninguna sede tiene un agente disponible para confirmar esta reserva.');
  if(generation!==reservationQuoteGeneration||st.scheduleMode!=='reservation'||st.reservationAt!==scheduledAt||st.mode!==mode)return;
  st.store=selected.storeId;
  reservationQuote={...selected,dateTime:scheduledAt};
  st.pay='';
  save();
 }catch(error){if(generation===reservationQuoteGeneration)reservationQuoteError=
   error.message||'No pudimos consultar la reserva.'}
 finally{if(generation===reservationQuoteGeneration){reservationQuoteBusy=false;render()}}
}
function reservationSummary(){
 if(st.scheduleMode!=='reservation'||!st.reservationAt)return '';
 try{
  const when=window.B3ReservationForms.schedule(st.reservationAt);
  return 'Reserva para el '+when.date+' · '+when.interval;
 }catch{return ''}
}
// Build a truthful reservation preview from the published store and verified quote.
// This is never sent through the immediate-order API, which does not certify bookings.
function reservationFormPreview(){
 if(st.scheduleMode!=='reservation')return {error:'Selecciona Programar reserva.'};
 const selected=shops.find(x=>String(x.id)===String(reservationQuote?.storeId));
 if(!selected||!reservationQuote||reservationQuote.dateTime!==st.reservationAt)
  return {error:'Consulta primero la disponibilidad de tu reserva.'};
 const lead=reservationMinLead(selected);
 let when;
 try{when=window.B3ReservationForms.schedule(st.reservationAt)}
 catch(error){return {error:error.message}}
 if(when.from<=Date.now()||(lead!==null&&when.from<Date.now()+lead*60000))
  return {error:lead===null?'El intervalo de reserva debe comenzar en el futuro.':'El inicio del intervalo no cumple la anticipación mínima publicada.'};
 const offered=paymentOptions().map(x=>x[0]);
 const available=offered.filter(x=>reservationQuote.paymentMethods.includes(x));
 if(!available.includes(st.pay))return {error:'Selecciona un método de pago habilitado para esta sede y la cotización de reserva.'};
 const priceReady=reservationQuote.storeId===st.store&&reservationQuote.mode===st.mode;
 if(!priceReady)return {error:'Primero se requiere una cotización de Delivery válida para calcular el total y el vuelto.'};
 try{
  const items=publishedOrderItems().map(i=>({name:product('api:'+i.productId).name,quantity:i.quantity}));
  const fee=st.mode==='delivery'?Number(reservationQuote.deliveryFeePen):0;
  const amount=st.reservationCashExact?undefined:st.reservationCashAmount;
  const form=window.B3ReservationForms.request({
   dateTime:st.reservationAt,mode:st.mode,items,subtotal:subtotal(),
   deliveryFee:fee,total:subtotal()+fee,
   destination:st.mode==='delivery'?[st.profile.address,st.profile.district,st.profile.reference].filter(Boolean).join(', '):'Recojo en sede',
   method:st.pay,amount,exact:st.reservationCashExact,allowedMethods:available
  });
  return {form,when};
 }catch(error){return {error:error.message||'No se pudo construir la reserva.'}}
}
function scheduleChoice(){
 if(st.mode==='delivery'){
  const graphic=(choice,file,fallback,label,kicker,description)=>'<button type="button" aria-label="'+label+'" data-schedule-choice="'+choice+'" style="display:grid;grid-template-columns:minmax(0,42%) minmax(0,1fr) 16px;align-items:center;gap:12px;width:100%;padding:10px;text-align:left;border:1px solid #e8e4df;border-radius:20px;background:#fff;color:#211c19;box-shadow:0 5px 18px rgba(40,20,10,.07);cursor:pointer;box-sizing:border-box"><img src="images/'+file+'" alt="'+label+'" onerror="this.onerror=null;this.src=\'images/'+fallback+'\'" style="display:block;width:100%;aspect-ratio:1;object-fit:contain;border-radius:13px;background:#171512"><span style="display:flex;flex-direction:column;gap:7px;min-width:0"><span style="font-size:10px;font-weight:800;letter-spacing:.07em;color:#a51d35">'+kicker+'</span><strong style="font-size:clamp(16px,4.6vw,21px);line-height:1.12;font-weight:800">'+label+'</strong><span style="font-size:12px;line-height:1.4;color:#69635f">'+description+'</span></span><span style="color:#c80020" aria-hidden="true">'+ic('chev',18)+'</span></button>';
  return '<div class="page b3-schedule-page">'+heading('¿Cuándo deseas recibirlo?','choice')+
   '<p class="sub">Modalidad seleccionada: Delivery</p><div role="group" aria-label="Elegir cuándo recibir el pedido" style="display:grid;gap:14px">'+
   graphic('now','b3-entrega-ahora.webp','b3-receive-now.svg','Entrega ahora','ATENCIÓN INMEDIATA','Recibe tu pedido lo antes posible.')+
   graphic('reservation','b3-programar-delivery.webp','b3-receive-reservation.svg','Programa tu Delivery','ELIGE TU HORARIO','Selecciona la fecha y hora que prefieras.')+'</div></div>';
 }

 return '<div class="page b3-schedule-page">'+heading('¿Cuándo deseas recogerlo?','choice')+
  '<p class="sub">Modalidad seleccionada: Pide y Retira</p><div role="group" aria-label="Elegir cuándo recoger el pedido" style="display:grid;gap:14px">'+
  '<button type="button" data-schedule-choice="now" style="display:grid;grid-template-columns:minmax(0,42%) minmax(0,1fr) 16px;align-items:center;gap:12px;width:100%;padding:10px;text-align:left;border:1px solid #e8e4df;border-radius:20px;background:#fff;color:#211c19;box-shadow:0 5px 18px rgba(40,20,10,.07);cursor:pointer;box-sizing:border-box"><img src="images/b3-recojo-ahora.png" alt="Pollo B3 entregando un pedido en el mostrador" style="display:block;width:100%;aspect-ratio:1;object-fit:contain;border-radius:13px;background:#fff1e7"><span style="display:flex;flex-direction:column;gap:7px;min-width:0"><span style="font-size:10px;font-weight:800;letter-spacing:.07em;color:#a51d35">ATENCIÓN INMEDIATA</span><strong style="font-size:clamp(16px,4.6vw,21px);line-height:1.12;font-weight:800">Recoger ahora</strong><span style="font-size:12px;line-height:1.4;color:#69635f">Solicita tu pedido para recogerlo en tienda lo antes posible.</span></span><span style="color:#c80020" aria-hidden="true">'+ic('chev',18)+'</span></button>'+
  '<button type="button" data-schedule-choice="reservation" style="display:grid;grid-template-columns:minmax(0,42%) minmax(0,1fr) 16px;align-items:center;gap:12px;width:100%;padding:10px;text-align:left;border:1px solid #e8e4df;border-radius:20px;background:#fff;color:#211c19;box-shadow:0 5px 18px rgba(40,20,10,.07);cursor:pointer;box-sizing:border-box"><img src="images/b3-programar-recojo.png" alt="Pollo B3 tomando nota de un recojo programado" style="display:block;width:100%;aspect-ratio:1;object-fit:contain;border-radius:13px;background:#fff1e7"><span style="display:flex;flex-direction:column;gap:7px;min-width:0"><span style="font-size:10px;font-weight:800;letter-spacing:.07em;color:#a51d35">ELIGE TU HORARIO</span><strong style="font-size:clamp(16px,4.6vw,21px);line-height:1.12;font-weight:800">Programar recojo</strong><span style="font-size:12px;line-height:1.4;color:#69635f">Selecciona la fecha y hora para retirar tu pedido.</span></span><span style="color:#c80020" aria-hidden="true">'+ic('chev',18)+'</span></button></div></div>';
}
// Query reservations automatically after a user change, never during rendering.
function autoCheckReservationQuote(){
 if(st.stage!=='reservationPicker'||st.scheduleMode!=='reservation'||
    !st.reservationAt||reservationQuoteBusy||reservationQuote?.dateTime===st.reservationAt)return;
 if(st.mode==='delivery'&&
    (String(st.profile.address||'').trim().length<6||
     String(st.profile.district||'').trim().length<2)){
  reservationQuoteError='Primero completa la dirección y distrito de entrega.';
  render();return;
 }
 void checkReservationQuote();
}
function reservationPicker(){
 const selected=reservationQuote?shops.find(x=>x.id===reservationQuote.storeId):null;
 const methods=selected&&reservationQuote?paymentOptions().filter(x=>reservationQuote.paymentMethods.includes(x[0])):[];
 const preview=reservationQuote?reservationFormPreview():null;
 return '<div class="page">'+heading('Programar reserva','scheduleChoice')+
  '<p class="sub">Elige cuándo deseas '+(st.mode==='delivery'?'recibir tu Delivery.':'recoger tu pedido.')+
  ' Buscaremos automáticamente una sede disponible.</p>'+
  '<label>Fecha y hora de la reserva<input id="b3-reservation-at" type="datetime-local" value="'+esc(st.reservationAt)+'"></label>'+
  (reservationSummary()?'<div class="summary-card"><b>'+esc(reservationSummary())+'</b></div>':'')+
  '<p class="smallprint">Horario aproximado: 15 minutos antes y 15 después de la hora seleccionada.</p>'+
  (st.mode==='delivery'?
   '<div class="summary-card"><b>Dirección de entrega</b><p>'+
     esc([st.profile.address,st.profile.district].filter(Boolean).join(', ')||'Todavía no indicada')+
   '</p><button type="button" class="outline full" data-gps="1" '+(deliveryGpsPending?'disabled':'')+'>'+ic('pin',18)+' Usar mi ubicación actual</button>'+(deliveryGpsMessage?'<p class="smallprint">'+esc(deliveryGpsMessage)+'</p>':'')+'<button type="button" class="outline full" data-reservation-address="1">'+
   (reservationAddressEditing?'Ocultar edición':'Editar dirección')+'</button>'+
   (reservationAddressEditing?
    '<label>Dirección<input id="b3-reservation-address" value="'+esc(st.profile.address)+'"></label>'+
    '<label>Distrito<input id="b3-reservation-district" value="'+esc(st.profile.district)+'"></label>'+
    '<label>Referencia<input id="b3-reservation-reference" value="'+esc(st.profile.reference||'')+'"></label>'+
    '<button type="button" class="primary full" data-reservation-address-save="1">Guardar dirección</button>':'')+
   '</div>':'')+
  (reservationQuoteBusy?'<div class="notice" role="status">Buscando automáticamente una sede disponible...</div>':
   !st.reservationAt?'<div class="notice">Selecciona fecha y hora para consultar disponibilidad.</div>':
   '')+
  (reservationQuoteError?'<div class="notice" role="alert">'+esc(reservationQuoteError)+'</div>':'')+
  (st.mode==='pickup'&&reservationQuote?.mode==='pickup'&&reservationQuote.dateTime===st.reservationAt?'<div class="summary-card"><b>Sede confirmada:</b> '+esc(shops.find(x=>x.id===reservationQuote.storeId)?.name||'Sede asignada')+'<p>Un agente está disponible para revisar la solicitud. Los productos se confirmarán antes del pago.</p></div>':'')+
  (st.mode==='pickup'?'<button class="primary full" data-reservation-verify="1" '+(reservationQuoteBusy||!reservationQuote||reservationQuote.dateTime!==st.reservationAt?'disabled':'')+'>'+(reservationQuoteBusy?'Consultando disponibilidad...':'Continuar con recojo programado')+'</button>':reservationQuote?'<button class="primary full" data-reservation-verify="1">Continuar con la reserva</button>':'')+
  '<button class="outline full" data-schedule-choice="now">Cambiar a pedido inmediato (sin reserva)</button>'+
  '</div>';
}
function choice(){return `<div class="page">${heading('Cómo recibir tu pedido','app')}<p class="sub">Puedes modificar esta selección antes de pagar.</p><div class="choice-list">${[['delivery','bike','Pollo Delivery','Te lo llevamos'],['pickup','store','Pide y Retira','Elige dónde recoger']].map(([m,icon,title,desc])=>`<button data-mode="${m}">${ic(icon,34)}<div><b>${title}</b><span>${desc}</span></div>${ic('chev')}</button>`).join('')}</div></div>`}
function locations(){
 const list=availableStores('pickup');
 const ordered=st.coords?[...list].sort((a,b)=>{
  const da=straightDistanceKm(a),db=straightDistanceKm(b);
  if(!da&&!db)return 0;if(!da)return 1;if(!db)return -1;
  return Number.parseFloat(da)-Number.parseFloat(db);
 }):list;
 return `<div class="page pickup-page">${heading('Pide y Retira','choice')}
 <p class="sub">Selecciona el local donde recogerás tu pedido.</p>
 ${checkoutReviewNote?`<div class="notice" role="alert">${esc(checkoutReviewNote)}</div>`:''}
 <section class="summary-card" aria-label="Alternativa de recojo programado">
  <strong>¿Prefieres recogerlo otro día o a otra hora?</strong>
  <p>Programa tu recojo según los horarios y la disponibilidad de reservas de la sede.</p>
  <button type="button" class="primary full" data-schedule-choice="reservation">Programar mi recojo</button>
 </section>
 <div class="locations pickup-list">
  ${ordered.length?ordered.map(s=>`<div class="pickup-location ${eligibleForPickup(s)?'':'unavailable'}">
     <div class="pickup-location-title"><b>${esc(s.name)}</b>${storeStatusHtml(s)}</div>
     ${s.address?`<p class="pickup-address">${ic('pin',17)} ${esc(s.address)}</p>`:''}
     ${straightDistanceKm(s)?`<p class="pickup-distance">${ic('map',16)} ${esc(straightDistanceKm(s))}</p>`:''}
     ${pickupPaymentWarning(s)}
     <div class="pickup-actions">
      ${(s.address||s.addr)?`<button type="button" class="outline" data-openmaps="${esc('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(s.address||s.addr))}">${ic('map',17)} Cómo llegar</button>`:''}
      ${eligibleForPickup(s)?`<button class="primary" data-pickstore="${esc(s.id)}" ${checkoutRefreshPending?'disabled':''}>${checkoutRefreshPending?'Verificando...':'Elegir local'}</button>`:'<span class="smallprint">No disponible para recojo inmediato</span>'}
     </div>
   </div>`).join(''):'<div class="notice">No hay locales publicados por la administración. Consulta más adelante.</div>'}
 </div></div>`;
}
function localDetail(){
 const s=shops.find(x=>x.id===st.store);
 if(!s||!eligibleForPickup(s))return locations();
 const addr=s.addr||s.address||'';
 const url='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(addr);
 return `<div class="page pickup-page">${heading('Tu local de retiro','locations')}
   <h1>${esc(s.name)}</h1>
   ${addr?`<div class="detail-row">${ic('pin')}<span>${esc(addr)}</span></div>`:''}
   ${storeStatusHtml(s)}
   ${pickupPaymentWarning(s)}
   ${straightDistanceKm(s)?`<p class="pickup-distance">${ic('map',16)} ${esc(straightDistanceKm(s))}</p>`:''}
   ${addr?`<button class="outline full" data-openmaps="${url}">${ic('map')} Cómo llegar con Google Maps</button>`:''}
   <button class="primary full" data-start="1" ${checkoutRefreshPending?'disabled':''}>${checkoutRefreshPending?'Verificando local...':'Continuar con Pide y Retira'}</button>
 </div>`;
}
function detail(){let p=product(st.selected);if(p&&promotionNotPurchasable(p))return '<div class="page">'+heading('Promoción desactivada','app')+'<div class="notice" role="status">Esta promoción está fuera de su fecha u horario de disponibilidad.</div><button class="primary full" data-tab="carta">Volver a la carta</button></div>';if(!p)return `<div class="page"><div class="empty-state"><h2>No hay productos publicados</h2><p>La carta estará disponible cuando Pollos B3 publique sus productos.</p><button class="primary" data-tab="carta">Volver a la carta</button></div></div>`;return `<div class="detail">${heading('','app')}<div class="detail-photo">${img(p)}<small>${p.isPublished?'Imagen publicada':'Imagen referencial'}</small></div><div class="detail-content"><h1>${esc(p.name)}</h1><p>${esc(p.desc)}</p><div class="detail-price"><strong>${cash(p.price)}</strong><div class="counter"><button data-qty="-1">−</button><span>${st.qty}</span><button data-qty="1">+</button></div></div><button class="primary full" data-add="1">Agregar · ${cash(p.price*st.qty)}</button></div></div>`}
function cart(){
 const draft=!!activePersonalCheckout();
 const cartItems=shoppingCart();
 const rows=cartItems.map(x=>{
  const p=product(x.id);
  if(!p)return '<div class="cart-row"><div><strong>Producto retirado de la carta</strong><p>Quítalo para continuar.</p></div><button class="remove" data-remove="'+esc(x.id)+'" aria-label="Quitar producto">'+ic('trash',18)+'</button></div>';
  return '<div class="cart-row">'+img(p)+'<div><strong>'+esc(p.name)+'</strong><span>'+cash(p.price)+'</span><div class="counter"><button data-cartdelta="'+esc(p.id)+'|-1">−</button><b>'+x.qty+'</b><button data-cartdelta="'+esc(p.id)+'|1">+</button></div></div><button class="remove" data-remove="'+esc(p.id)+'" aria-label="Quitar producto">'+ic('trash',18)+'</button></div>';
 }).join('');
 return `<div class="page">${heading('Tu carrito','app')}
 ${personalCheckoutBanner()}
 ${!cartItems.length?'<div class="empty-state"><h2>Tu carrito está vacío</h2><button class="primary" data-tab="carta">Ver la carta</button></div>':`
  <div>${rows}</div><div class="totals">
   <p><span>Subtotal</span><b>${cash(shoppingSubtotal())}</b></p>
   <p><span>Delivery</span><span>${draft?'Se calculará al enviar':st.mode==='delivery'?(deliveryQuoteValid()?cash(st.quote.deliveryFeePen):'Pendiente de cotizar'):'No aplica'}</span></p>
   <p class="grand"><b>Total estimado</b><strong>${draft?'Pendiente de validar':st.mode==='delivery'&&!deliveryQuoteValid()?'Por cotizar':cash(orderTotal())}</strong></p>
  </div>${st.mode==='delivery'&&deliveryQuoteValid()? `<p class="smallprint">Desde ${esc(st.quote.storeName||'sede disponible')} · ${st.quote.serverValidated?'Cotización del servidor':Number(st.quote.straightDistanceKm).toFixed(2)+' km aproximados en línea recta · '+(st.quote.deliveryPricingMode==='FIXED'?'tarifa fija':'tarifa por km')}.</p>`:''}
  ${checkoutReviewNote?`<div class="notice" role="alert">${esc(checkoutReviewNote)}</div>`:''}
  <p class="smallprint">No se enviarán pedidos reales ni se harán cobros en esta versión de prueba.</p>
  <button class="outline full" data-tab="carta">Seguir pidiendo</button>
  ${draft?'<div class="notice">Este es un carrito nuevo, separado del pedido en validación. Podrás enviarlo cuando finalice la solicitud activa.</div><button class="outline full" data-checkout-return="1">Ver pedido en validación</button>':`<button class="primary full" data-screen="identity" ${checkoutRefreshPending?"disabled":""}>${checkoutRefreshPending?"Actualizando disponibilidad...":"Continuar con pedido de prueba"}</button>`}`}
 </div>`;
}
function availability(){
 const pickupEntry=window.B3OrderAvailability?.readInteraction?.();
 if(st.mode==='pickup'&&pickupEntry?.orderForm?.title==='VALIDACIÓN DE RECOJO'){
  const status=pickupEntry.status;
  const accepted=status==='ACCEPTED'&&pickupEntry.agentDecision==='ACCEPTED'&&pickupEntry.messageDelivered===true;
  const rejected=status==='REJECTED'||status==='CANCELLED'||status==='EXPIRED';
  const store=shops.find(x=>x.id===pickupEntry.body?.storeId);
  if(!accepted&&!rejected)return pickupAgentWaitView(pickupEntry);
  return '<div class="page">'+heading('Disponibilidad de recojo','cart')+
   '<div class="summary-card"><h2>'+(rejected?'Productos no confirmados':accepted?'Pedido aceptado':'Consultando disponibilidad')+'</h2>'+
   '<p>'+(rejected?'La tienda seleccionada no tiene disponible el producto solicitado. ¿Deseas elegir otra tienda para realizar tu pedido?':accepted?'La tienda aceptó tu solicitud. Puedes continuar al siguiente paso.':formWaitingMessage(pickupEntry))+'</p>'+
   '<p><b>Tienda:</b> '+esc(store?.name||'Sede seleccionada')+'</p></div>'+
   (rejected?'<button class="primary full" data-screen="locations">Elegir otra tienda</button>':
    accepted?'<button class="primary full" data-screen="payment">Continuar al pago</button>':
    '<p class="smallprint">Esperando confirmación del agente. No se enviará un pedido duplicado.</p><button class="outline full" data-checkout-cancel="1">Cancelar solicitud</button>')+
   '</div>';
 }
 const activeEntry=activePersonalCheckout();
 const rejectedEntry=window.B3OrderAvailability?.readInteraction?.();
 const status=['IDLE','REJECTED','CANCELLED'].includes(deliveryAvailability.status)&&
  ['REJECTED','CANCELLED'].includes(rejectedEntry?.status)?rejectedEntry.status:deliveryAvailability.status;
 const checking=status==='CHECKING'||status==='CHECKING_STORES';
 const acceptedQuote=activeEntry?.status==='ACCEPTED'&&
  activeEntry.agentDecision==='ACCEPTED'&&
  (!activeEntry.body?.customer||activeEntry.messageDelivered===true);
 const waiting=status==='WAITING_APPROVAL'||status==='CREATE_UNCERTAIN'||
  acceptedQuote&&['QUOTE_UNAVAILABLE','CHECKING_STORES'].includes(status);
 const provisionalFee=waiting&&st.quote?.quoteOrigin==='ADMIN_API_PRE_APPROVAL'&&
  Number.isFinite(Number(st.quote.deliveryFeePen))&&Number.isFinite(Number(st.quote.estimatedTotalPen));
 const ready=!checking&&!waiting&&status==='READY'&&deliveryQuoteValid();
 const required=!checking&&status==='APPROVAL_REQUIRED';
 const failed=!checking&&!waiting&&(status==='ERROR'||status==='UNAVAILABLE'||status==='REJECTED');
 const names=deliveryAvailability.candidateNames||[];
 // No checkout milestones, payment, or retry CTA after a terminal outcome.
 // Preserve the cart and let the customer explicitly choose delivery or pickup.
 if(['REJECTED','UNAVAILABLE','CANCELLED'].includes(status)){
  const rejected=status==='REJECTED',cancelled=status==='CANCELLED';
  const headingText=cancelled?'Solicitud cancelada':rejected?'Productos del pedido no confirmados':
    deliveryAvailability.reason==='NO_AGENTS'?'Delivery sin atención disponible por ahora':
    'No podemos confirmar tu Delivery por el momento';
  const note=cancelled?'No enviaremos otra solicitud automáticamente.':
   rejected?'El rechazo de estos productos no significa que Delivery esté deshabilitado.':'No se ha creado una nueva solicitud de atención.';
  return `<div class="page b3-fulfillment-outcome">
   ${heading('Opciones para tu pedido','app')}
   <section class="b3-fulfillment-outcome-card" role="status">
    <span class="b3-fulfillment-outcome-kicker">POLLOS B3 · TU PEDIDO</span>
    <div class="b3-fulfillment-outcome-icon">${ic('store',30)}</div>
    <h2>${esc(headingText)}</h2>
    <p>${esc(deliveryAvailability.message||'Puedes revisar otras formas de recibir tu pedido.')}</p>
    <div class="b3-fulfillment-outcome-info">${ic('cart',17)}
      <span>${rejected?'Puedes elegir otros productos y enviar una nueva solicitud de disponibilidad.':'Conservamos tus productos y cantidades en el carrito.'}</span>
    </div>
    <p class="b3-fulfillment-outcome-note">${esc(note)}</p>
   </section>
   <div class="b3-fulfillment-outcome-actions">
    ${rejected?'<button class="primary full" data-rejected-new-catalog="1">Elegir otros productos</button>':'<button class="primary full" data-availability-pickup="1">Elegir Recojo en tienda</button>'}
    ${!rejected&&!cancelled?'<button class="outline full" data-availability-retry="1">Volver a intentar Delivery</button>':''}
     <button class="outline full" data-checkout-leave="1">Volver al inicio</button>
   </div>
  </div>`;
 }
 if(waiting){
  const request=window.B3OrderAvailability?.readInteraction?.();
  const confirmed=!!request?.interactionId;
  const responded=request?.agentDecision==='ACCEPTED';
  const relayDone=!request?.body?.customer||request.messageDelivered===true;
  const selectedStore=shops.find(s=>s.id===request?.body?.storeId);
  const storedFee=responded&&relayDone&&selectedStore?
   preApprovalQuoteFor(request,selectedStore,st.profile.address,st.profile.district):null;
  const title=request?.cancelRequested?'Cancelando tu solicitud':responded?'La sede respondió a tu solicitud':
   confirmed&&!relayDone?'Estamos confirmando tu pedido':
   status==='CREATE_UNCERTAIN'?'Estamos registrando tu solicitud':'Esperando confirmación de la sede';
  const detail=deliveryAvailability.message||
   'Tu solicitud sigue activa y se actualizará automáticamente.';
  const store=deliveryAvailability.storeName||'Sede asignada';
  return `<div class="page b3-single-wait">
   ${heading('Estado de tu solicitud','app')}
   <section class="b3-single-wait-main" aria-live="polite">
    <span class="b3-single-wait-label">POLLOS B3 · DELIVERY</span>
    <div class="b3-checkout-orbit" aria-hidden="true">
     <div class="b3-checkout-orbit-core">${ic('store',31)}</div>
     <i class="b3-orbit-particle first"></i><i class="b3-orbit-particle second"></i>
    </div>
    <h2>${esc(title)}</h2>
    <p class="b3-single-wait-detail">${esc(detail)}</p>
    <div class="b3-single-wait-progress" aria-label="Progreso de la solicitud">
     <span class="${confirmed?'complete':'current'}">${ic(confirmed?'check':'clock',16)} Solicitud</span>
     <span class="${confirmed&&relayDone&&!responded?'current':confirmed&&relayDone?'complete':''}">${ic(confirmed&&relayDone?'check':'clock',16)} Detalle</span>
     <span class="${responded&&relayDone?'complete':responded?'current':''}">${ic(responded?'check':'clock',16)} Respuesta</span>
    </div>
    <div class="b3-single-wait-store">${ic('store',17)} <strong>${esc(store)}</strong></div>
   </section>
   <div class="b3-single-wait-footer">
    <p class="b3-single-wait-summary">${cartCount()} producto(s) · Subtotal ${cash(subtotal())} · ${storedFee?'Delivery calculado '+cash(storedFee.deliveryFeePen):'Delivery por confirmar'}</p>
    ${status==='QUOTE_UNAVAILABLE'&&acceptedQuote?
      '<button class="outline full" data-quote-retry="1">Reintentar continuar al pago</button>':''}
    ${activeEntry?`<button class="primary full" data-checkout-leave="1">Seguir explorando la app</button>
      <button class="outline full" data-checkout-cancel="1" ${checkoutCancelInFlight?'disabled':''}>${checkoutCancelInFlight?'Cancelando solicitud…':'Cancelar solicitud'}</button>`:
      '<p class="smallprint">Verificando la solicitud original. No se enviará una segunda interacción.</p>'}
   </div>
  </div>`;
 }
 const title=checking?'Buscando una sede para ti':waiting?(status==='CREATE_UNCERTAIN'?'Registrando solicitud de atención':'Esperando confirmación de la sede'):ready?'Tenemos una sede disponible':status==='REJECTED'?'Los productos no fueron confirmados':status==='UNAVAILABLE'?'No encontramos una sede disponible':required?'Tu pedido necesita confirmación':'No pudimos completar la consulta';
 const detail=checking?deliveryAvailability.message||'Consultamos la capacidad del asesor y la tarifa del local elegido.'
  :waiting?deliveryAvailability.message
  :ready?'La sede respondió. Revisa el total y las formas de pago antes de continuar.'
  :required?'La primera sede elegible requiere una respuesta real del equipo antes de confirmar tu pedido.'
  :deliveryAvailability.message||'Verifica tu dirección e inténtalo otra vez.';
 return `<div class="page b3-availability-page">${heading(activeEntry?'Estado de tu solicitud':'Consultar disponibilidad',activeEntry?'app':'deliveryAddress')}
  <div class="b3-availability-step"><span>01 <i></i> 02 <i></i> 03</span><small>Carrito · Dirección · Disponibilidad</small></div>
  <section class="b3-availability-card" aria-live="polite">
   <div class="b3-availability-orb ${checking?'checking':waiting?'awaiting':ready?'ready':required?'awaiting':'failed'}" aria-hidden="true">${ic(checking?'clock':ready?'check':required?'store':'close',34)}</div>
   <span class="b3-availability-eyebrow">POLLOS B3 · DELIVERY</span>
   <h2>${esc(title)}</h2><p>${esc(detail)}</p>
   <div class="b3-availability-milestones">
    <div><span class="b3-availability-check">${ic('check',16)}</span><span>Dirección registrada</span></div>
    <div><span class="b3-availability-check ${checking?'animated':''}">${ic(checking?'clock':'check',16)}</span><span>Locales y cobertura</span></div>
    <div><span class="b3-availability-check ${ready?'':'muted'}">${ic(ready?'check':'clock',16)}</span><span>Confirmación de la sede</span></div>
   </div>
  </section>
  <section class="b3-availability-order"><div class="b3-availability-overline">TU PEDIDO</div>
   <p><span>${cartCount()} producto(s)</span><strong>${cash(subtotal())}</strong></p>
   <p><span>Delivery</span><strong>${ready||provisionalFee?cash(st.quote.deliveryFeePen):'Por confirmar'}</strong></p>
   <div class="b3-availability-total"><span>${ready?'Total estimado':provisionalFee?'Total provisional (pendiente de aprobación)':'Subtotal de productos'}</span><b>${cash(ready?orderTotal():provisionalFee?st.quote.estimatedTotalPen:subtotal())}</b></div>
   <small>${esc(st.profile.address||'')} · ${esc(st.profile.district||'')}</small>
  </section>
  ${required?`<div class="b3-availability-message" role="status">
    <strong>${esc(deliveryAvailability.storeName||'Sede seleccionada')} requiere aprobación</strong>
    <p>${esc(deliveryAvailability.message)}</p>
    ${names.length>1?'<small>Si esta sede rechaza la solicitud, no se enviará automáticamente a otra.</small>':''}
   </div>`:''}
  ${failed?`<div class="notice" role="alert">${esc(deliveryAvailability.message)}</div>`:''}
  ${waiting?`<div class="b3-checkout-motion" role="status" aria-label="Solicitud activa en validación"><div class="b3-checkout-orbit"><div class="b3-checkout-orbit-core">${ic('store',31)}</div><i class="b3-orbit-particle first"></i><i class="b3-orbit-particle second"></i></div><strong>Conectados con la sede</strong><span>La solicitud sigue activa. Puedes continuar usando la aplicación mientras la sede responde.</span><div class="b3-checkout-motion-steps"><b>Enviada</b><b>En validación</b><b>Respuesta</b></div></div>`:''}
  ${ready?`<div class="b3-availability-selected">${ic('store',22)}<span><strong>${esc(st.quote.storeName||'Sede disponible')}</strong><small>${st.quote.serverValidated?'Sede y tarifa verificadas por el servidor': 'Delivery referencial · '+Number(st.quote.straightDistanceKm).toFixed(2)+' km en línea recta'}</small></span></div>
   <button class="primary full" data-availability-continue="1">Continuar con mi pedido ${ic('chev',18)}</button>`:''}
  ${!deliveryRequestPending&&['UNAVAILABLE','REJECTED'].includes(status)?
    '<button class="primary full" data-change-fulfillment="1">Cambiar método de entrega</button>':''}
  ${deliveryRequestPending?'<div class="b3-availability-wait">'+(waiting?'Esperando la decisión de la sede…':'Consultando locales disponibles…')+'</div>':''}
  ${activeEntry?`<div class="b3-checkout-wait-actions"><button class="primary full" data-checkout-leave="1">Seguir explorando la app</button><button class="outline full" data-checkout-cancel="1" ${checkoutCancelInFlight?'disabled':''}>${checkoutCancelInFlight?'Cancelando solicitud…':deliveryAvailability.reason==='CANCEL_NOT_CONFIRMED'?'Reintentar cancelación':'Cancelar solicitud'}</button></div>`:''}
  ${!activeEntry&&!waiting&&status!=='REJECTED'?'<button class="outline full" data-screen="deliveryAddress">Modificar dirección de entrega</button>':''}
 </div>`;
}
function identity(){
 const p=st.mode==='delivery'?currentDeliveryOrderContact():st.profile;
 return `<div class="page form">${heading('Datos de este pedido','cart')}<p class="sub">${st.mode==='delivery'?'Confirma o cambia el nombre de quien recibirá este pedido. Puedes pedir para otra persona sin modificar tu perfil.':'Confirma los datos de quien recibirá el pedido.'}</p><label>Nombres<input id="first" autocomplete="given-name" value="${esc(p.first)}" maxlength="60" placeholder="Ingresa sus nombres"></label><label>Apellidos<input id="last" autocomplete="family-name" value="${esc(p.last)}" maxlength="60" placeholder="Ingresa sus apellidos"></label><label>DNI o CE (opcional)<input id="doc" autocomplete="off" value="${esc(p.doc)}" placeholder="Solo si necesitas un comprobante"></label><button class="primary full" data-identity-next="1">Continuar</button></div>`;
}
function phone(){
 const p=st.mode==='delivery'?currentDeliveryOrderContact():st.profile;
 return `<div class="page form">${heading('Teléfono de este pedido','identity')}<p class="sub">Confirma el celular de la persona que recibirá el pedido. Puedes cambiarlo en cada nueva solicitud.</p><label>Celular de Perú<div class="phone-field"><b>+51</b><input id="phone" inputmode="numeric" maxlength="9" value="${esc(p.phone)}" placeholder="9 dígitos"></div></label><button class="primary full" data-phone-next="1">Continuar</button></div>`;
}
function confirmDetails(){
 const p=currentDeliveryOrderContact();
 return `<div class="page form">${heading('Confirma los datos de tu pedido','phone')}
  <p class="sub">Revisa los datos antes de enviar la solicitud a la sede. Todavía no se ha enviado ningún pedido.</p>
  <div class="summary-card">
   <h2>Persona que recibirá</h2>
   <p><b>Nombres:</b> ${esc(p.first)} ${esc(p.last)}</p>
   <p><b>Teléfono:</b> +51 ${esc(p.phone)}</p>
   <p><b>DNI o CE:</b> ${esc(p.doc||'No indicado (opcional)')}</p>
   <button type="button" class="outline full" data-review-edit="identity">Editar datos personales</button>
   <button type="button" class="outline full" data-review-edit="phone">Editar teléfono</button>
   <hr>
   <h2>Entrega</h2>
   <p><b>Dirección:</b> ${esc(st.profile.address)}</p>
   <p><b>Distrito:</b> ${esc(st.profile.district)}</p>
   <p><b>Referencia:</b> ${esc(st.profile.reference||'No indicada')}</p>
   <button type="button" class="outline full" data-review-edit="deliveryAddress">Editar dirección</button>
  </div>
  <button type="button" class="primary full" data-review-confirm="1">Confirmar datos y enviar solicitud</button>
  <p class="smallprint">Después de enviar la solicitud, cualquier cambio requiere cancelarla primero.</p>
 </div>`;
}
function personalCheckoutCountdown(){
 const entry=window.B3OrderAvailability?.readInteraction?.();
 const ms=Date.parse(entry?.paymentExpiresAt||'')-Date.now();
 if(!Number.isFinite(ms))return 'Pendiente de confirmar';
 if(ms<=0)return 'Plazo vencido';
 const seconds=Math.ceil(ms/1000);
 return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
}
function personalCheckoutTimeHtml(){
 const entry=window.B3OrderAvailability?.readInteraction?.();
 if(!entry?.paymentExpiresAt)return '';
 return `<div class="b3-checkout-clock" role="status">Tiempo disponible para el pago: <strong data-checkout-remaining>${personalCheckoutCountdown()}</strong></div>`;
}
function prepaymentReview(){
 const entry=window.B3OrderAvailability?.readInteraction?.();
 // A stale checkout screen must not show an empty or unrelated cart as an approved order.
 if(!entry||entry.status!=='ACCEPTED'||!st.cart.length||checkoutCartIssue()){
  return '<div class="page">'+heading('Revisa tu pedido','inicio')+
   '<div class="notice" role="status">No hay una solicitud aceptada con productos vigentes para revisar. Comprueba tu carrito antes de continuar.</div>'+
   '<button class="primary full" data-tab="carta">Ir a la carta</button></div>';
 }
 const valid=entry?.status==='ACCEPTED'&&deliveryQuoteValid();
 const store=shops.find(x=>x.id===st.store);
 const items=st.cart.map(item=>{const p=product(item.id);return '<p>'+esc(p?.name||'Producto')+' ×'+item.qty+' <b>'+cash((p?.price||0)*item.qty)+'</b></p>'}).join('');
 return `<div class="page">${heading('Revisa tu pedido','inicio')}
  <div class="summary-card">
   <h2>${valid?'¡El local aceptó tu solicitud!':'Cotización pendiente de verificar'}</h2>
   <p>${esc(store?.name||'Sede por confirmar')} · ${esc(st.profile.address||'')} · ${esc(st.profile.district||'')}</p>
   <hr>${items}<hr>
   <p>Productos <b>${cash(subtotal())}</b></p>
   <p>Delivery <b>${valid?cash(st.quote.deliveryFeePen):'Por confirmar'}</b></p>
   <p class="grand">Total a pagar <strong>${valid?cash(orderTotal()):'Pendiente'}</strong></p>
  </div>
  ${personalCheckoutTimeHtml()}
  <p class="b3-checkout-price-note">El delivery se estima por la distancia en línea recta y la tarifa publicada de la sede, sin Google Routes. El importe se muestra antes de elegir cómo pagar.</p>
  ${checkoutReviewNote?'<div class="notice" role="alert">'+esc(checkoutReviewNote)+'</div>':''}
  <p class="smallprint">La sede deberá validar el pago antes de registrar el pedido.</p>
  <button class="primary full" data-prepay-payment="1" ${valid?'':'disabled'}>Elegir método de pago</button>
  <button class="outline full" data-prepay-add="1">Agregar o cambiar productos</button>
  <button class="outline full" data-prepay-cancel="1">Cancelar mi solicitud</button>
  <button class="outline full" data-checkout-leave="1">Seguir explorando la app</button>
  ${!valid?'<button class="outline full" data-prepay-retry="1">Reintentar cotización</button>':''}
 </div>`;
}
function paymentInstructions(){
 const valid=pickupPaymentReady()||st.mode==='delivery'&&st.quote?.quoteOrigin==='ANDROID_CATALOG_ACCEPTED'&&deliveryQuoteValid()&&window.B3OrderAvailability?.readInteraction?.()?.status==='ACCEPTED';
 const image=paymentImageUrl(st.pay);
 const title=({yape:'Yape',plin:'Plin',card:'Tarjeta'})[st.pay]||'';
 if(!valid||!paymentOptions().some(x=>x[0]===st.pay)||!title)return '<div class="page"><div class="notice">Selecciona un método válido.</div><button class="outline full" data-screen="payment">Volver</button></div>';
 return '<div class="page">'+heading('Pago con '+title,'payment')+personalCheckoutTimeHtml()+
  '<div class="summary-card"><h2>Total a pagar</h2><p class="grand"><strong>'+cash(orderTotal())+'</strong></p></div>'+
  (image?'<img src="'+esc(image)+'" alt="Imagen de pago '+esc(title)+'" style="display:block;width:100%;max-width:320px;margin:16px auto;object-fit:contain">':'<div class="notice">La sede no ha publicado una imagen para este método.</div>')+
  '<p class="smallprint">Verifica los datos del destinatario antes de pagar. El comprobante deberá validarlo la sede.</p>'+
  '<button class="outline full" data-payment-save-image="1" '+(!image?'disabled':'')+'>Guardar imagen de pago</button>'+
  '<button class="primary full" data-payment-done="1" '+(!image?'disabled':'')+'>Pago realizado</button></div>';
}
function paymentProofPreview(){
 if(!isPaymentFormReady())return '<div class="page"><div class="notice">Solicitud no disponible.</div></div>';
 if(st.pay==='cash'){return '<div class="page">'+heading('Pago al recibir','payment')+personalCheckoutTimeHtml()+'<div class="summary-card"><p>Productos <b>'+cash(subtotal())+'</b></p>'+(st.mode==='pickup'?'<p>Recojo en tienda · Sin delivery</p>':'<p>Delivery <b>'+cash(st.quote.deliveryFeePen)+'</b></p>')+'<p class="grand">Total <strong>'+cash(orderTotal())+'</strong></p></div><label>¿Con cuánto vas a pagar?<input id="b3-cash-amount" type="number" min="'+orderTotal()+'" step="0.01" value="'+esc(st.cash||'')+'"></label><button class="outline full" data-cash-exact="1">Tengo el monto exacto</button><p>Vuelto: <b id="b3-cash-change">'+cash(Math.max(0,Number(st.cash||0)-orderTotal()))+'</b></p>'+(paymentFormError?'<div class="notice">'+esc(paymentFormError)+'</div>':'')+'<button class="primary full" data-payment-confirm="1" '+(paymentFormBusy?'disabled':'')+'>Confirmar pedido</button></div>';}
 const form=st.mode==='pickup'?{form:{title:'PAGO RECOJO - '+({yape:'YAPE',plin:'PLIN',card:'TARJETA'}[st.pay]||''),fields:[{variable:'Pedido',value:st.cart.map(x=>product(x.id)?.name+' ×'+x.qty).join(', ')},{variable:'Tienda de recojo',value:shops.find(x=>x.id===st.store)?.name||''},{variable:'Total',value:cash(orderTotal())}]}}:paymentConfirmationForm(),confirmation=window.B3OrderAvailability?.readInteraction?.()?.paymentConfirmation;
 return '<div class="page">'+heading('Confirmar pago','paymentInstructions')+personalCheckoutTimeHtml()+
 '<p class="sub">Adjunta el comprobante. Se enviará como imagen dentro del mismo FORM de pago.</p>'+ 
 '<label>Comprobante JPG/PNG (máximo 4 MB)<input type="file" id="b3-payment-proof" accept="image/jpeg,image/png"></label>'+ 
 (receiptPreviewUrl?'<img src="'+esc(receiptPreviewUrl)+'" alt="Comprobante seleccionado" style="display:block;max-height:300px;max-width:100%;margin:12px auto;object-fit:contain">':'')+
 '<div class="summary-card"><h2>'+esc(form.form.title)+'</h2>'+
 form.form.fields.map(f=>'<p>'+esc(f.variable)+': <b>'+esc(f.value)+'</b></p>').join('')+'</div>'+
 (paymentFormError?'<div class="notice" role="alert">'+esc(paymentFormError)+'</div>':'')+
 '<button class="primary full" data-payment-confirm="1" '+(paymentFormBusy||(confirmation&&confirmation.status!=='PREPARED')||(!receiptFileSelected&&!(window.B3OrderAvailability?.readInteraction?.()?.receiptUpload?.status==='UPLOADED'&&window.B3OrderAvailability?.readInteraction?.()?.receiptUpload?.imageUrl))?'disabled':'')+'>'+
 (paymentFormBusy?'Enviando...':confirmation?.status==='PREPARED'?'Reintentar envío del comprobante':confirmation?'Solicitud de pago iniciada':'Confirmar pago')+'</button>'+
 '<p class="smallprint">Enviar el formulario no significa que el pago haya sido aceptado.</p></div>';
}
function isPaymentFormReady(){
 if(st.mode==='pickup')return pickupPaymentReady()&&paymentOptions().some(x=>x[0]===st.pay);
 return st.mode==='delivery'&&st.quote?.quoteOrigin==='ANDROID_CATALOG_ACCEPTED'&&
  deliveryQuoteValid()&&paymentOptions().some(x=>x[0]===st.pay)&&
  ['yape','plin','card','cash'].includes(st.pay);
}
function paymentWaiting(){
 const c=window.B3OrderAvailability?.readInteraction?.()?.paymentConfirmation;
 const cashOrder=/^PAGO (AL RECIBIR|DE RESERVA - EFECTIVO)$/.test(c?.form?.form?.title||'');
 return '<div class="page b3-payment-status-page">'+heading(cashOrder?'Confirmación del pedido':'Confirmación de pago','app')+
  '<div class="b3-payment-status-main" role="status" aria-live="polite">'+
  '<div class="b3-payment-status-anim" aria-hidden="true"><div class="b3-payment-status-ring"></div><div class="b3-payment-status-center">'+ic(cashOrder?'store':'card',34)+'</div><span class="b3-payment-status-orbit"></span></div>'+
  '<div class="b3-payment-status-eyebrow">POLLOS B3 · VALIDACIÓN</div>'+
  '<h2>'+(cashOrder?'Estamos confirmando tu pedido':'Estamos verificando tu pago')+'</h2>'+
  '<p>'+(cashOrder?(c?.status==='SENT'?'La sede está revisando tu solicitud. Te avisaremos en cuanto confirme.':'Estamos verificando el envío de tu solicitud a la sede. No se enviará de nuevo automáticamente.'):(c?.status==='SENT'?'La sede está revisando el comprobante. Te avisaremos en cuanto confirme.':'Estamos verificando la entrega del comprobante a la sede. No se enviará de nuevo automáticamente.'))+'</p>'+
  '<div class="b3-payment-status-note"><span class="b3-payment-status-dot"></span>Esperando confirmación del asesor</div>'+
  '</div>'+
  (paymentFormError?'<div class="notice" role="alert">'+esc(paymentFormError)+'</div>':'')+
  '<p class="smallprint" style="text-align:center">'+(cashOrder?'Pagarás en efectivo al recibir tu pedido. Tu solicitud está pendiente de aprobación.':'El comprobante enviado no representa una aprobación. Conservamos tu solicitud mientras esperamos la respuesta real.')+'</p>'+
  '<button class="outline full" data-checkout-leave="1">Seguir explorando</button></div>';
}
// Clear only the exact products belonging to a payment-approved interaction.
// If the customer has begun another basket, never remove those new items.
function clearApprovedOrderBasket(entry){
 if(entry?.paymentConfirmation?.status!=='ACCEPTED'||!entry.paymentConfirmation.agentMessageId||
    !Array.isArray(st.cart)||!st.cart.length||!Array.isArray(entry.body?.items))return false;
 const original=entry.body.items.map(i=>[String(i.productId||'').toLowerCase(),Number(i.quantity)])
  .sort((a,b)=>a[0].localeCompare(b[0]));
 const current=st.cart.map(i=>[String(i.id||'').replace(/^api:/,'').toLowerCase(),Number(i.qty)])
  .sort((a,b)=>a[0].localeCompare(b[0]));
 if(!original.length||original.length!==current.length||
    original.some(([id,qty],i)=>!id||!Number.isInteger(qty)||qty<=0||
      current[i][0]!==id||current[i][1]!==qty))return false;
 st.cart=[];
 st.selected='';
 st.qty=1;
 st.cash='';
 st.quote=null;
 save();
 return true;
}
// Registramos una sola entrada local por interacción con la segunda validación real.
// Solo se registran pedidos confirmados por la interacción comercial.
function recordVerifiedPickupOrder(entry){
 const confirmation=entry?.paymentConfirmation;
 if(confirmation?.status!=='ACCEPTED'||!confirmation.agentMessageId||!entry?.interactionId)return false;
 if(!Array.isArray(st.orders))st.orders=[];
 const previous=st.orders.find(x=>x.interactionId===entry.interactionId);
 if(previous){
  if(!Number.isFinite(previous.ts)||previous.ts<=0){
   previous.ts=Number.isFinite(previous.paymentApprovedAt)&&previous.paymentApprovedAt>0?previous.paymentApprovedAt:Date.now();save();
  }
  return true;
 }
 const fields=confirmation.form?.form?.fields||[];
 const amount=fields.find(x=>x.variable==='Total')?.value;
 const total=Number(String(amount||'').replace('S/','').trim());
 if(!Number.isFinite(total)||total<=0)return false;
 st.orders.unshift({id:entry.interactionId,interactionId:entry.interactionId,
  code:orderPublicCode(entry),ts:Date.now(),status:'ACCEPTED',paymentStatus:'ACCEPTED',
  mode:'pickup',storeId:entry.body.storeId,total,paymentApprovedAt:Date.now(),
  items:entry.body.items.map(x=>({id:'api:'+x.productId,qty:x.quantity}))});
 save();vibrateConfirmedOrderStage('ACCEPTED');clearApprovedOrderBasket(entry);return true;
}
function recordVerifiedPaymentOrder(entry){
 const approval=entry?.paymentConfirmation;
 if(!entry?.interactionId||approval?.status!=='ACCEPTED'||!approval.agentMessageId)return false;
 if(!Array.isArray(st.orders))st.orders=[];
 const previouslyRecorded=st.orders.find(o=>o?.interactionId===entry.interactionId||o?.id===entry.interactionId);
 if(previouslyRecorded){
  if(previouslyRecorded.paymentStatus==='ACCEPTED'&&previouslyRecorded.status==='RECEIVED'){
   previouslyRecorded.status='ACCEPTED';previouslyRecorded.paymentApprovedAt=previouslyRecorded.paymentApprovedAt||Date.now();save();
  }
  if(previouslyRecorded.paymentStatus==='ACCEPTED')clearApprovedOrderBasket(entry);
  return true;
 }
 const allFields=approval.form?.form?.fields;
 const cashOrder=/^PAGO (AL RECIBIR|DE RESERVA - EFECTIVO)$/.test(approval.form?.form?.title||'');
 const fields=Array.isArray(allFields)?allFields.filter(f=>!['Fecha','Paga con','Vuelto'].includes(f.variable)):null;
 // Payment FORM v2 includes the public order code as its first of six fields.
 // Validate the complete certified payload before indexing the local history.
 if(!Array.isArray(fields)||fields.length!==6||
    fields.map(f=>f?.variable).join('|')!=='N.º de pedido|Pedido|Subtotal|Delivery|Dirección|Total'||
    fields[0]?.value!==orderPublicCode(entry))return false;
 const amount=String(fields[5].value||'').match(/^S\/\s*(\d+(?:\.\d{1,2})?)$/);
 const total=amount?Number(amount[1]):NaN;
 const items=entry.body?.items?.map(x=>({id:'api:'+x.productId,qty:x.quantity}))||[];
 if(!Number.isFinite(total)||total<=0||!items.length||
    items.some(x=>!/^api:[0-9a-f-]{36}$/i.test(x.id)||!Number.isInteger(x.qty)||x.qty<1))return false;
 const payLabel=approval.form?.form?.title?.match(/^PAGO (?:REALIZADO|DE RESERVA) - (YAPE|PLIN|TARJETA)$/);
 if(!payLabel&&!cashOrder)return false;
 const pay=cashOrder?'cash':{YAPE:'yape',PLIN:'plin',TARJETA:'card'}[payLabel[1]];
 // This is a durable, locally indexed record of the confirmed conversation.
 // It is not a new commercial order on the Administrator backend.
 st.orders.unshift({
  id:entry.interactionId,interactionId:entry.interactionId,ts:Date.now(),
  total,items,mode:'delivery',pay,
  status:'ACCEPTED',paymentStatus:'ACCEPTED',collectionStatus:cashOrder?'PENDING_CASH':'PAID',paymentAgentMessageId:approval.agentMessageId,
  paymentApprovedAt:Date.now(),orderCode:'B3-'+entry.interactionId.replace(/-/g,'').slice(0,12).toUpperCase(),
  storeId:entry.body.storeId,address:entry.body.customer?.address||'',
  district:entry.body.customer?.district||'',
  demo:false,deliveredAt:null,favoritePromptDone:false,reviewDismissed:false
 });
 save(); // Persist the confirmed order before changing the checkout basket.
 vibrateConfirmedOrderStage('ACCEPTED');
 clearApprovedOrderBasket(entry);
 return true;
}
// The current Android checkout API does not include an order-preparation ETA.
// Only show one if the published store has an explicit, valid duration field.
function publishedPreparationTime(storeId){
 const store=shops.find(x=>String(x.id)===String(storeId));
 // /api/v1/mobile/config publishes this exact field for delivery.
 // "preparationMinutes" on the store is a reservation field; never use it.
 const value=store?.deliveryPreparationMinutes;
 if(value===undefined||value===null||value==='')return null;
 const minutes=Number(value);
 return Number.isInteger(minutes)&&minutes>0&&minutes<=240?minutes:null;
}
function paymentOutcome(){
 const pickupEntry=window.B3OrderAvailability?.readInteraction?.();
 if(pickupEntry?.orderForm?.title==='VALIDACIÓN DE RECOJO'){
  const status=pickupEntry.paymentConfirmation?.status;
  if(!['ACCEPTED','REJECTED'].includes(status))return paymentWaiting();
  if(status==='ACCEPTED')recordVerifiedPickupOrder(pickupEntry);
  const store=shops.find(x=>String(x.id)===String(pickupEntry.body?.storeId));
  const originalFields=pickupEntry.orderForm?.fields||[];
  const originalValue=name=>originalFields.find(x=>x.variable===name)?.value||'';
  const scheduled=originalValue('Modalidad')==='Recojo programado';
  const scheduledAt=scheduled?String(originalValue('Fecha y hora')):'';
  const scheduledMs=scheduled?reservationTimeValue(scheduledAt):NaN;
  const formatTime=ms=>new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(ms));
  const formatDate=ms=>new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(ms));
  const rawPrep=scheduled?store?.reservationSettings?.preparationMinutes:
    (store?.pickupPreparationMinutes??store?.pickup_preparation_minutes);
  const prep=rawPrep!==null&&rawPrep!==undefined&&rawPrep!==''?Number(rawPrep):NaN;
  const validPrep=Number.isInteger(prep)&&prep>0&&prep<=240;
  const accepted=status==='ACCEPTED';
  return '<div class="page b3-payment-status-page">'+heading('Confirmación de recojo','app')+
   '<div class="b3-payment-status-main '+(accepted?'b3-payment-status-approved':'b3-payment-status-rejected')+'" role="status">'+
   '<div class="b3-payment-status-result-icon" aria-hidden="true">'+ic(accepted?'check':'info',43)+'</div>'+
   '<div class="b3-payment-status-eyebrow">POLLOS B3 · PIDE Y RETIRA</div>'+
   '<h2>'+(accepted?'¡Pedido confirmado!':'Pedido no confirmado')+'</h2>'+
   '<p>'+(accepted?'La sede confirmó tu pedido para recojo.':'La sede no confirmó el pago. Comunícate con ella antes de intentarlo nuevamente.')+'</p>'+
   (accepted?'<div class="b3-payment-status-note">'+
    '<span class="b3-payment-prep-label">Sede de recojo</span><strong>'+esc(store?.name||originalValue('Tienda de recojo')||'Sede asignada')+'</strong>'+
    (scheduled&&Number.isFinite(scheduledMs)?
      '<span class="b3-payment-prep-label">Recojo programado · '+esc(formatDate(scheduledMs))+'</span>'+
      '<strong>'+esc(formatTime(scheduledMs-15*60000))+' – '+esc(formatTime(scheduledMs+15*60000))+'</strong>'+
      '<small>Puedes recoger tu pedido desde 15 minutos antes hasta 15 minutos después de la hora programada ('+esc(formatTime(scheduledMs))+').</small>':
      scheduled?'<small>Consulta el horario programado con la sede.</small>':
      '<span class="b3-payment-prep-label">Tiempo estimado de preparación</span>'+
      (validPrep?'<strong class="b3-payment-prep-minutes">'+prep+' minutos</strong><small>Tiempo de preparación en tienda. No es una cuenta regresiva.</small>':
       '<small>La sede confirmará el tiempo de preparación para recojo.</small>'))+
    (scheduled&&validPrep?'<small>Preparación configurada: '+prep+' minutos. El intervalo de recojo corresponde al horario programado.</small>':'')+
    '</div><p class="smallprint">Consulta el seguimiento de tu pedido desde Mis pedidos.</p>':'')+
   '</div>'+
   (accepted?'<button class="primary full" data-tab="pedidos">Ver mis pedidos</button>':'')+
   '<button class="outline full" data-tab="inicio">'+(accepted?'Realizar otro pedido':'Volver al inicio')+'</button></div>';
 }
 const currentEntry=window.B3OrderAvailability?.readInteraction?.();
 const c=currentEntry?.paymentConfirmation;
 if(!['ACCEPTED','REJECTED'].includes(c?.status))return paymentWaiting();
 const approved=c.status==='ACCEPTED';
 const cashOrder=/^PAGO (AL RECIBIR|DE RESERVA - EFECTIVO)$/.test(c.form?.form?.title||'');
 if(approved)recordVerifiedPaymentOrder(currentEntry);
 const scheduled=(c.form?.form?.title||'').startsWith('PAGO DE RESERVA');
 if(approved&&scheduled){
  const dateField=c.form.form.fields.find(f=>f.variable==='Fecha')?.value||'';
  const match=dateField.match(/^(\d{2})\/(\d{2})\/(\d{4}) · (\d{1,2}):(\d{2}) ([ap])\. m\.$/);
  let when=null;
  if(match){const [,d,m,y,h,min,period]=match;const hour=Number(h)%12+(period==='p'?12:0);try{when=window.B3ReservationForms.schedule(y+'-'+m+'-'+d+'T'+String(hour).padStart(2,'0')+':'+min)}catch{}}
  return '<div class="page b3-payment-status-page">'+heading('Confirmación del pedido','app')+
   '<div class="b3-payment-status-main b3-payment-status-approved" role="status">'+
   '<div class="b3-payment-status-result-icon" aria-hidden="true">'+ic('check',43)+'</div>'+
   '<div class="b3-payment-status-eyebrow">POLLOS B3 · TU PEDIDO</div><h2>¡Pedido confirmado!</h2>'+
   '<p>Tu reserva ha sido registrada correctamente.</p><div class="b3-payment-status-note">'+
   (when?'<span class="b3-payment-prep-label">Fecha de entrega</span><strong>'+esc(when.date)+'</strong><span class="b3-payment-prep-label">Horario programado de entrega</span><strong>'+esc(when.interval)+'</strong>':'<span>Horario solicitado: '+esc(dateField||'Consulta con la sede')+'</span>')+
   '</div><p>'+(cashOrder?'Pagarás en efectivo al recibir tu pedido.':'Tu pago ha sido aprobado por la sede.')+'</p></div>'+
   '<button class="primary full" data-tab="pedidos">Ver seguimiento del pedido</button><button class="outline full" data-tab="inicio">Realizar otro pedido</button></div>';
 }
 const minutes=approved?publishedPreparationTime(currentEntry?.body?.storeId):null;
 return '<div class="page b3-payment-status-page">'+heading(cashOrder?'Confirmación del pedido':approved?'Pago confirmado':'Validación del pago','app')+
 '<div class="b3-payment-status-main '+(approved?'b3-payment-status-approved':'b3-payment-status-rejected')+'" role="status">'+
 '<div class="b3-payment-status-result-icon" aria-hidden="true">'+ic(approved?'check':'info',43)+'</div>'+
 '<div class="b3-payment-status-eyebrow">POLLOS B3 · TU PEDIDO</div>'+
 '<h2>'+(approved?(cashOrder?'¡Pedido confirmado!':'¡Pago confirmado!'):(cashOrder?'Pedido no confirmado':'El pago no fue aprobado'))+'</h2>'+
 '<p>'+(approved?(cashOrder?'La sede confirmó tu pedido. Pagarás en efectivo al recibirlo.':'Tu comprobante fue aprobado por la sede. <strong>Tu pedido ya está listo para ser atendido.</strong>'):
 'La sede no confirmó el pago. Comunícate con la sede antes de volver a intentarlo.')+'</p>'+
 (approved?'<div class="b3-payment-status-note">'+
 (minutes!==null?'<span class="b3-payment-prep-label">Tiempo estimado de preparación</span><strong class="b3-payment-prep-minutes">'+minutes+' minutos</strong><span class="b3-payment-prep-context">'+ic('store',18)+' Antes de salir de tienda</span><small>El tiempo de traslado hasta tu domicilio no está incluido.</small>':
 'Tiempo estimado de preparación pendiente de confirmación por la sede.')+
 '</div><p class="smallprint">Puedes consultar el avance real desde Mis pedidos. La preparación comienza cuando la sede lo indique.</p>':'')+
 '</div>'+
 (approved?'<button class="primary full" data-tab="pedidos">Ver seguimiento del pedido</button>':'')+
 '<button class="outline full" data-tab="inicio">'+(approved?'Realizar otro pedido':'Volver al inicio')+'</button></div>';
}
async function submitPaymentForm(){

 if(paymentFormBusy)return;
 const api=window.B3OrderAvailability,entry=api?.readInteraction?.();
 if(!entry||!isPaymentFormReady())return toast('La solicitud no permite confirmar el pago.');
 paymentFormBusy=true;paymentFormError='';render();
 try{
  if(st.pay==='cash'){await api.preparePaymentConfirmation(entry,st.mode==='pickup'?pickupPaymentForm():paymentConfirmationForm());}else{
  if(!receiptFileSelected&&!(entry.receiptUpload?.status==='UPLOADED'&&entry.receiptUpload?.imageUrl))
   throw Error('Selecciona un comprobante antes de confirmar el pago.');
  const uploaded=await api.uploadPaymentReceipt(entry);
  if(typeof uploaded.imageUrl!=='string'||!/^https:\/\/[^\s<>"']+\/api\/v1\/mobile\/payment-receipts\/images\/[0-9a-f-]{36}$/i.test(uploaded.imageUrl))
   throw Error('El Administrador no devolvió una URL HTTPS válida del comprobante.');
  await api.preparePaymentConfirmation(api.readInteraction(),st.mode==='pickup'?pickupPaymentForm(uploaded.imageUrl):paymentConfirmationForm(uploaded.imageUrl));}
  screen('paymentWaiting');
  await api.sendPaymentConfirmation(api.readInteraction());
  if(st.stage==='paymentWaiting')render();
  schedulePaymentDecisionPoll(1000);
 }catch(error){
  paymentFormError=String(error?.message||'No se pudo confirmar el envío del formulario');
  const confirmation=api.readInteraction()?.paymentConfirmation;
  // A local validation rejection cannot have reached HTTP. Keep the user on
  // the proof screen so the corrected APK can retry the same prepared message.
  if(confirmation?.status==='PREPARED')screen('paymentProofPreview');
  else if(confirmation&&st.stage!=='paymentWaiting')screen('paymentWaiting');
  else render();
 }finally{
  paymentFormBusy=false;
  if(['paymentProofPreview','paymentWaiting'].includes(st.stage))render();
 }
}
function schedulePaymentDecisionPoll(delay=8500){
 if(paymentDecisionTimer!==null)clearTimeout(paymentDecisionTimer);
 paymentDecisionTimer=null;
 if(paymentDecisionBusy||window.B3OrderAvailability?.readInteraction?.()?.paymentConfirmation?.status!=='SENT')return;
 paymentDecisionTimer=setTimeout(()=>{paymentDecisionTimer=null;void pollPaymentDecision()},Math.max(1000,delay));
}
async function pollPaymentDecision(){
 if(paymentDecisionBusy)return;
 const api=window.B3OrderAvailability,entry=api?.readInteraction?.();
 if(entry?.paymentConfirmation?.status!=='SENT')return;
 paymentDecisionBusy=true;let delay=8500;
 try{
  const started=performance.now();
  const result=await api.pollPaymentConfirmation(entry);
  b3OrderTiming('payment_status',started);
  if(['ACCEPTED','REJECTED'].includes(result.decision)){
   const current=api.readInteraction?.();
   if(current?.interactionId!==entry.interactionId)return;
   if(result.decision==='ACCEPTED'){
    if(current.orderForm?.title==='VALIDACIÓN DE RECOJO')recordVerifiedPickupOrder(current);
    else recordVerifiedPaymentOrder(current);
   }
   revealVerifiedResponse(current,'payment',result.decision);
   return;
  }
 }catch(error){
  delay=error?.httpStatus===429?65000:8000;
  paymentFormError='No pudimos actualizar la respuesta. La solicitud sigue registrada.';
  if(st.stage==='paymentWaiting')render();
 }finally{
  paymentDecisionBusy=false;
  if(api.readInteraction()?.paymentConfirmation?.status==='SENT')schedulePaymentDecisionPoll(delay);
 }
}
let pickupRequestBusy=false,pickupRequestError='';
async function submitPickupRequest(){
 if(pickupRequestBusy)return;
 const api=window.B3OrderAvailability;
 pickupRequestBusy=true;pickupRequestError='';screen('pickupRequestPending');
 try{
  if(!api?.prepareInteraction||!api?.createInteraction||!api?.sendInteractionMessage||!api?.pollInteraction)
   throw Error('Actualiza la aplicación para solicitar el recojo.');
  await fetchConfig({strict:true});
  const selected=shops.find(x=>String(x.id)===String(st.store));
  if(!selected||(st.scheduleMode==='reservation'?
     !(selected.active===true&&selected.pickup_enabled===true&&selected.reservation_enabled===true&&
       selected.reservationAcceptingRequests===true&&reservationQuote?.storeId===selected.id&&
       reservationQuote?.dateTime===st.reservationAt&&reservationQuote?.agentAvailable===true&&
       reservationQuote?.acceptingRequests===true):!eligibleForPickup(selected)))
   throw Error('El local ya no está habilitado para este recojo.');
  await validateCartPromotionsBeforeRequest();
  const items=publishedOrderItems();
  if(!/^9[0-9]{8}$/.test(String(st.profile.phone||'').trim())||!String(st.profile.first||'').trim()||
     !String(st.profile.last||'').trim())throw Error('Confirma tus nombres y celular.');
  const input={storeName:selected.name,customerName:[st.profile.first,st.profile.last].filter(Boolean).join(' '),customerPhone:st.profile.phone,when:st.scheduleMode==='reservation'?'scheduled':'now',
   dateTime:st.reservationAt,items:st.cart.map(x=>{const p=product(x.id);return {
    name:p?.name,quantity:x.qty,unitPrice:p?.price};})};
  const form=window.B3PickupOrderContract.approval(input).form;
  const prior=api.readInteraction?.();
  if(prior&&['SUBMITTING','PENDING','ACCEPTED'].includes(prior.status)){
   if(prior.body?.storeId!==selected.id||prior.orderForm?.title!=='VALIDACIÓN DE RECOJO')
    throw Error('Existe otra solicitud activa. Resuélvela antes de crear un pedido.');
   screen('availability');scheduleAgentDecisionPoll(1000);return;
  }
  const entry=api.prepareInteraction({appId:APP_ID,storeId:selected.id,
   catalogRevision:publishedRevision,items,orderForm:form});
  await api.createInteraction(entry);
  const current=api.readInteraction?.()||entry;
  if(current.interactionId&&current.messageDelivered!==true)ensureFormDelivery(current);
  screen('availability');scheduleAgentDecisionPoll(1200);
 }catch(error){
  if(error?.code==='PROMOTIONS_REMOVED'){
   pickupRequestError='';screen('cart');toast(error.message,{durationMs:5500});
  }else{
   pickupRequestError=String(error?.message||'No se pudo solicitar el recojo.');
   render();
  }
 }finally{pickupRequestBusy=false;if(st.stage==='pickupRequestPending')render();}
}
function completeAcceptedPickup(entry){
 if(entry?.status!=='ACCEPTED'||entry.agentDecision!=='ACCEPTED'||entry.messageDelivered!==true)return;
 if(st.mode!=='pickup'||entry.body?.storeId!==st.store)return;
 const api=window.B3OrderAvailability;
 try{api.startLocalPaymentWindow(entry,publishedPaymentWaitMinutes);pickupRequestError='';if(st.stage==='availability')screen('payment');}
 catch(error){pickupRequestError=String(error.message||'No se pudo habilitar el pago');render();}
}
function pickupAgentWaitView(entry,{preparing=false}={}){
 const confirmed=!!entry?.interactionId;
 const delivered=entry?.messageDelivered===true;
 const responded=entry?.agentDecision==='ACCEPTED';
 const store=shops.find(x=>String(x.id)===String(entry?.body?.storeId||st.store));
 const title=preparing?'Registrando tu solicitud':!confirmed?'Confirmando el registro':
  !delivered?'Enviando el detalle de tu pedido':'Esperando confirmación de la sede';
 const detail=preparing?'Estamos verificando tus datos antes de enviar la solicitud.':
  entry?formWaitingMessage(entry):'Tu solicitud se está preparando. El pago se habilitará después de la aceptación.';
 return `<div class="page b3-single-wait">${heading('Validación de recojo','app')}
 <section class="b3-single-wait-main" aria-live="polite" role="status">
  <span class="b3-single-wait-label">POLLOS B3 · PIDE Y RETIRA</span>
  <div class="b3-checkout-orbit" aria-hidden="true">
   <div class="b3-checkout-orbit-core">${ic('store',31)}</div>
   <i class="b3-orbit-particle first"></i><i class="b3-orbit-particle second"></i>
  </div>
  <h2>${esc(title)}</h2><p class="b3-single-wait-detail">${esc(detail)}</p>
  <div class="b3-single-wait-progress" aria-label="Progreso de la solicitud">
   <span class="${confirmed?'complete':'current'}">${ic(confirmed?'check':'clock',16)} Solicitud</span>
   <span class="${confirmed&&delivered?'complete':confirmed?'current':''}">${ic(confirmed&&delivered?'check':'clock',16)} Detalle</span>
   <span class="${responded&&delivered?'complete':delivered?'current':''}">${ic(responded?'check':'clock',16)} Respuesta</span>
  </div>
  <div class="b3-single-wait-store">${ic('store',17)} <strong>${esc(store?.name||'Sede asignada')}</strong></div>
 </section>
 <div class="b3-single-wait-footer">
  <p class="b3-single-wait-summary">${cartCount()} producto(s) · Subtotal ${cash(subtotal())} · Recojo en tienda</p>
  ${pickupRequestError?'<div class="notice" role="alert">'+esc(pickupRequestError)+'</div>':''}
  ${entry?.interactionId?'<button class="primary full" data-checkout-leave="1">Seguir explorando la app</button>':''}
  ${entry?.interactionId?'<button class="outline full" data-checkout-cancel="1" '+(checkoutCancelInFlight?'disabled':'')+'>'+(checkoutCancelInFlight?'Cancelando solicitud…':'Cancelar solicitud')+'</button>':
   pickupRequestError?'<button class="outline full" data-screen="identity">Corregir datos</button>':
   '<p class="smallprint">Verificando el registro original. No se enviará otra solicitud automáticamente.</p>'}
 </div></div>`;
}
function pickupRequestPending(){
 return pickupAgentWaitView(window.B3OrderAvailability?.readInteraction?.(),{preparing:true});
}
function payment(){
 const available=paymentOptions();
 const selected=shops.find(x=>String(x.id)===String(st.store));
 const missing=st.configReady&&!available.length;
 const acceptedDelivery=(st.mode==='delivery'&&st.quote?.quoteOrigin==='ANDROID_CATALOG_ACCEPTED'&&deliveryQuoteValid()&&window.B3OrderAvailability?.readInteraction?.()?.status==='ACCEPTED')||pickupPaymentReady();
 const awaitingDigitalAcceptance=['yape','plin'].includes(st.pay)&&!acceptedDelivery;
 return `<div class="page">${heading(acceptedDelivery?'Pagar pedido':'Método de pago',acceptedDelivery?'inicio':'prepaymentReview')}
 ${acceptedDelivery?`<div class="summary-card"><h2>Pedido aceptado · ${esc(selected?.name||'Sede asignada')}</h2><p>Productos <b>${cash(subtotal())}</b></p>${st.mode==='pickup'?'<p>Recojo en tienda · Sin delivery</p>':`<p>Delivery <b>${cash(st.quote.deliveryFeePen)}</b></p>`}<p class="grand">Total a pagar <strong>${cash(orderTotal())}</strong></p></div>${personalCheckoutTimeHtml()}`:''}
 <p class="sub">${acceptedDelivery?'Toca cómo deseas pagar. Se mostrará la imagen configurada por la sede.':'Solo aparecen los métodos habilitados para la sede.'}</p>
 <div class="method-list">${available.map(([id,title,sub])=>`<button class="${st.pay===id?'chosen':''}" data-pay="${id}">${ic(id==='cash'?'store':'card')}<span><b>${title}</b><small>${sub}</small></span><span class="radio"></span></button>`).join('')}</div>
 ${missing?`<div class="notice" role="alert">${esc(selected?.name||'La sede asignada')} no tiene métodos de pago publicados para ${st.mode==='delivery'?'delivery':'recojo'}. Deben habilitarse desde el administrador web antes de continuar.</div>${!acceptedDelivery?`<button type="button" class="outline full" data-screen="${st.mode==='delivery'?'deliveryAddress':'locations'}">Cambiar sede o modalidad</button>`:''}`:''}
 ${!missing&&st.pay==='cash'?`<div class="notice" role="status">Pago al recibir: indica el monto y confirma tu pedido.</div>${acceptedDelivery?'<button class="primary full" data-payment-start="1">Continuar</button>':''}`:''}
 ${checkoutReviewNote?`<div class="notice" role="alert">${esc(checkoutReviewNote)}</div>`:''}
 ${awaitingDigitalAcceptance?'<div class="notice" role="status">Yape y Plin requieren aceptación previa de la tienda. La imagen de pago y el comprobante se habilitarán después de la aceptación.</div>':''}
 ${acceptedDelivery?
   '<div class="b3-payment-secondary-actions" style="display:flex;justify-content:center;gap:18px;flex-wrap:wrap;margin:18px 0 8px"><button type="button" data-prepay-add="1" style="border:0;background:none;color:#8e2432;font-size:14px;text-decoration:underline;padding:8px">Cambiar productos</button><button type="button" data-prepay-cancel="1" style="border:0;background:none;color:#8e2432;font-size:14px;text-decoration:underline;padding:8px">Cancelar solicitud</button></div>':
   `<button class="primary full" data-pay-next="1" ${missing||checkoutRefreshPending?'disabled':''}>${checkoutRefreshPending?'Verificando locales y costo...':'Continuar'}</button>`}
 </div>`;
}
function summary(){
 const selectedStore=shops.find(x=>String(x.id)===String(st.store));
 const items=st.cart.map(x=>{const p=product(x.id);return '<p>'+esc(p?.name||'Producto retirado')+' ×'+x.qty+' <b>'+(p?cash(x.qty*p.price):'Revisar')+'</b></p>'}).join('');
 const methods={yape:'Yape',plin:'Plin',card:'Tarjeta',click:'Click to Pay',cash:'Efectivo al recibir'};
 return `<div class="page">${heading('Resumen de tu pedido',st.mode==='delivery'&&st.quote?.quoteOrigin==='ANDROID_CATALOG_ACCEPTED'?'inicio':'payment')}<div class="summary-card">
 <h2>${st.mode==='delivery'?'Delivery':'Recojo en tienda'}</h2>
 <p>${st.mode==='delivery'?esc(st.profile.address+', '+(st.profile.district||'')):(selectedStore?esc(selectedStore.name+' · '+(selectedStore.address||selectedStore.addr||'')):'Local por confirmar')}</p>
 <hr><p>Pago: <b>${esc(methods[st.pay]||'Por seleccionar')}</b></p>
 ${items}<hr><p>Subtotal <b>${cash(subtotal())}</b></p>
 <p>Delivery <span>${st.mode==='delivery'?(deliveryQuoteValid()?cash(st.quote.deliveryFeePen):'Pendiente de cotizar'):'No aplica'}</span></p>
 ${st.mode==='delivery'&&deliveryQuoteValid()?`<p>Sede: ${esc(st.quote.storeName||selectedStore?.name||'Asignada por cobertura')} · ${st.quote.serverValidated?'Cotización de servidor':Number(st.quote.straightDistanceKm).toFixed(2)+' km aproximados en línea recta · '+(st.quote.deliveryPricingMode==='FIXED'?'Tarifa fija':'Tarifa por kilómetro')}</p><p class="smallprint">${st.quote.serverValidated?'Disponibilidad validada. No reserva productos ni crea un pedido comercial.':'Distancia estimada, no equivale a un recorrido por carretera.'}</p>`:''}
 <p class="grand">Total estimado <strong>${st.mode==='delivery'&&!deliveryQuoteValid()?'Pendiente de cotizar':cash(orderTotal())}</strong></p>
 </div>${checkoutReviewNote?`<div class="notice" role="alert">${esc(checkoutReviewNote)}</div>`:''}
 <div class="notice">Para confirmar un pedido, inicia una solicitud con la sede desde Delivery o Pide y Retira.</div>
 <button class="primary full" data-screen="cart">Volver al carrito</button></div>`;
}
function success(){const o=st.orders[0];return `<div class="success"><div class="success-mark">${ic('info',54)}</div><h1>Registro anterior en este dispositivo</h1><p>Este registro local no confirma un pedido comercial, su aceptación ni su pago.</p><div class="success-box"><b>${esc(o?.id||'')}</b><span>${cash(o?.total||0)}</span><small>Registro histórico local</small></div><button class="primary full" data-tab="pedidos">Ver mis pedidos</button><button class="outline full" data-tab="inicio">Volver al inicio</button></div>`}
// The chat is a read-only view of the current device's verified interaction.
const B3_CHAT_ACTIVITY=Object.freeze({
 prepared:'Estamos preparando tu solicitud.',
 created:'La solicitud quedó registrada para la sede.',
 detail_delivered:'Se confirmó el envío del detalle a la conversación.',
 accepted:'La sede respondió que acepta tu solicitud.',
 rejected:'La sede no confirmó los productos de esta solicitud.',
 expired:'La solicitud venció.',
 cancelled:'La cancelación fue confirmada.',
 cancel_requested:'Solicitaste cancelar; esperamos confirmación.',
 cancelled_before_send:'Se descartó la solicitud local sin confirmación de creación.',
 payment_window:'La sede aceptó y se habilitó el plazo para elegir cómo pagar.'
});
function chatTranscript(){
 const entry=window.B3OrderAvailability?.readInteraction?.();
 if(!entry)return '<div class="b3-chat-empty">Aún no tienes una solicitud registrada. Cuando envíes un pedido, aquí aparecerá su seguimiento.</div>';
 const activities=Array.isArray(entry.activity)?entry.activity.filter(x=>x&&
   Object.prototype.hasOwnProperty.call(B3_CHAT_ACTIVITY,x.type)&&Number.isFinite(x.at)):[];
 const lines=activities.map((item,i)=>({kind:'system',
   text:B3_CHAT_ACTIVITY[item.type],time:item.at,order:i}));
 if(entry.interactionId&&!activities.some(x=>x.type==='created'))
   lines.push({kind:'system',text:'Esta solicitud fue registrada anteriormente.',
     time:Number(entry.createdAt)||Date.now(),order:2});
 if(entry.status==='SUBMITTING'&&!entry.interactionId)
   lines.push({kind:'live',text:'Confirmando el registro de tu solicitud. No se enviará un pedido duplicado.',time:Date.now(),order:100});
 else if(entry.interactionId&&entry.body?.customer&&entry.messageDelivered!==true)
   lines.push({kind:'live',text:'La interacción existe. El detalle sigue pendiente de confirmación; continuamos consultando al asesor.',time:Date.now(),order:100});
 else if(['PENDING','ACCEPTED'].includes(entry.status)&&entry.agentDecision!=='ACCEPTED'&&entry.agentDecision!=='REJECTED')
   lines.push({kind:'live',text:'Esperando la respuesta de la sede. Actualizaremos el chat al recibirla.',time:Date.now(),order:100});
 const messages=Array.isArray(entry.agentMessages)?entry.agentMessages:[];
 const seen=new Set();
 for(const msg of messages){
   if(!msg||typeof msg.id!=='string'||seen.has(msg.id)||typeof msg.text!=='string'||msg.text.length>8000)continue;
   const date=Date.parse(msg.createdAt);
   if(!Number.isFinite(date))continue;
   seen.add(msg.id);
   lines.push({kind:'advisor',text:msg.text,time:date,order:50});
 }
 lines.sort((a,b)=>a.time-b.time||a.order-b.order);
 return lines.slice(-65).map(line=>{
   const date=new Date(line.time);
   const clock=Number.isFinite(date.getTime())?date.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'}):'';
   const who=line.kind==='advisor'?'Asesor de la sede':line.kind==='live'?'En proceso':'Pollos B3 · Sistema';
   return '<div class="b3-chat-line '+(line.kind==='advisor'?'advisor':line.kind==='live'?'live':'system')+'">'+
    '<div class="b3-chat-author">'+esc(who)+'<time>'+esc(clock)+'</time></div>'+
    '<p>'+esc(line.text)+'</p></div>';
 }).join('');
}
function chatStatusLine(){
 const entry=window.B3OrderAvailability?.readInteraction?.();
 if(!entry)return 'Sin solicitudes recientes';
 if(entry.status==='EXPIRED')return 'Solicitud vencida';
 if(entry.status==='CANCELLED')return 'Solicitud cancelada';
 if(entry.status==='REJECTED'||entry.agentDecision==='REJECTED')return 'Productos del pedido no confirmados';
 if(entry.agentDecision==='ACCEPTED'){
  if(entry.paymentExpiresAt)return 'Solicitud aceptada · Revisa tu pedido';
  if(entry.body?.customer&&entry.messageDelivered!==true)
   return 'Solicitud aceptada · Confirmando el detalle';
  return deliveryAvailability.status==='QUOTE_UNAVAILABLE'?
   'Solicitud aceptada · Preparando pantalla de pago':
   'Solicitud aceptada · Abriendo métodos de pago';
 }
 if(entry.interactionId)return 'Solicitud en validación';
 return 'Preparando solicitud';
}
function refreshChatTimeline(){
 if(!chatOverlay)return;
 const history=chatOverlay.querySelector('#b3-chat-history');
 if(!history)return;
 const atBottom=history.scrollHeight-history.scrollTop-history.clientHeight<90;
 const next=chatTranscript();
 if(history.innerHTML!==next){
   history.innerHTML=next;
   if(atBottom)history.scrollTop=history.scrollHeight;
 }
 const status=chatOverlay.querySelector('#b3-chat-status');
 if(status)status.textContent=chatStatusLine();
}
// The overlay lives outside #app so its opening/closing never rebuilds forms.
let chatOverlay=null,chatRestoreFocus=null;
function openChatOverlay(){
 if(chatOverlay)return;
 const current=document.activeElement;
 chatRestoreFocus=current&&root.contains(current)?current:null;
 const layer=document.createElement('div');
 layer.className='b3-chat-modal-layer';
 layer.innerHTML='<div class="b3-chat-modal-backdrop" data-chat-close="1" aria-hidden="true"></div>'+
  '<section class="b3-chat-panel" role="dialog" aria-modal="true" aria-label="Seguimiento del pedido">'+chat()+'</section>';
 layer.addEventListener('click',event=>{
  const action=event.target.closest('[data-chat-close],[data-checkout-return]');
  if(!action||!layer.contains(action))return;
  if(action.hasAttribute('data-chat-close')){closeChatOverlay();return}
  closeChatOverlay();
  returnToPersonalCheckout(); // Only on intentional "Ver estado".
 });
 document.body.appendChild(layer);
 chatOverlay=layer;
 const close=layer.querySelector('[data-chat-close]:not(.b3-chat-modal-backdrop)');
 if(close)close.focus({preventScroll:true});
 const list=layer.querySelector('#b3-chat-history');
 if(list)list.scrollTop=list.scrollHeight;
}
function closeChatOverlay(){
 if(!chatOverlay)return;
 chatOverlay.remove();
 chatOverlay=null;
 const focus=chatRestoreFocus;
 chatRestoreFocus=null;
 if(focus?.isConnected)focus.focus({preventScroll:true});
}
function chat(){
 const entry=window.B3OrderAvailability?.readInteraction?.();
 const open=!!entry&&['PREPARED','SUBMITTING','PENDING','ACCEPTED'].includes(entry.status);
 return '<div class="chat-screen b3-order-chat">'+
  '<div class="b3-chat-modal-header"><div><small>POLLOS B3 · ATENCIÓN</small><strong>Seguimiento del pedido</strong></div><button type="button" data-chat-close="1" aria-label="Cerrar chat y continuar donde estaba">'+ic('close',20)+'</button></div>'+
  '<div class="chat-info b3-chat-info">'+ic('chat',20)+'<span id="b3-chat-status">'+esc(chatStatusLine())+'</span></div>'+
  '<div id="b3-chat-history" class="chat-messages b3-chat-history" role="log" aria-label="Historial de la solicitud">'+chatTranscript()+'</div>'+
  (open?'<button type="button" class="outline full b3-chat-return" data-checkout-return="1">Ver estado de mi solicitud</button>':'')+
  '<div class="b3-chat-readonly">'+ic('info',17)+' <span>Seguimiento de solo lectura. Solo se muestran eventos confirmados y mensajes reales del asesor.</span></div>'+
 '</div>';
}
function about(){return `<div class="page about b3-about-new">${heading('Sobre la app','app')}
 <div class="about-copy"><h2>Pollos B3</h2><p>La aplicación móvil para conocer la carta, consultar locales y preparar pedidos de Delivery o recojo.</p>
 <div class="b3-about-facts"><div><strong>Aplicación</strong><span>Pollos B3 · Android</span></div><div><strong>Versión</strong><span>Versión Android instalada</span></div><div><strong>API del administrador</strong><span>${esc(API_BASE?new URL(API_BASE).hostname:'No configurada')}</span></div><div><strong>Estado</strong><span>Disponibilidad sujeta a la configuración publicada y confirmación de la sede</span></div></div>
 <p class="b3-about-owner">Pollos B3 · Todos los derechos reservados.</p></div>
 <div class="b3-about-credit"><p>Desarrollo tecnológico</p><img src="images/integra-b2g-new.webp" alt="INTEGRA B2G" loading="lazy"><strong>INTEGRA B2G</strong><span>Soluciones tecnológicas para Pollos B3</span></div>
 </div>`}
function vacancyPhoto(v){
 const src=v.imageUrl;
 if(typeof src!=='string')return '';
 if(!/^\/api\/v1\/mobile\/images\/[0-9a-f-]{36}$/.test(src)||!API_BASE)return '';
 return '<img src="'+esc(API_BASE+src)+'" alt="Imagen publicada para '+esc(v.title)+'" loading="lazy">';
}
function jobsScreen(){
 const items=visibleVacancies().filter(v=>v&&typeof v.id==='string'&&typeof v.title==='string');
 return '<div class="page b3-jobs">'+heading('Trabaja con nosotros','app')+
 '<p class="sub">Conoce las oportunidades publicadas por Pollos B3.</p>'+ 
 (items.length?'<div class="b3-job-list">'+items.map(v=>
  '<button class="b3-job-card" data-vacancy="'+esc(v.id)+'">'+
  '<span class="b3-job-thumb">'+(vacancyPhoto(v)||ic('store',26))+'</span>'+
  '<span class="b3-job-copy">'+'<strong>'+esc(v.title)+'</strong>'+
  '<small>'+esc(v.summary||'Conoce los detalles de esta vacante.')+'</small>'+
  (v.locationLabel?'<span class="b3-job-location">'+ic('pin',13)+' '+esc(v.locationLabel)+'</span>':'')+
  '<span class="b3-job-more">Ver detalle '+ic('chev',14)+'</span></span></button>').join('')+'</div>':
 '<div class="empty-state">'+ic('store',34)+'<h2>No hay vacantes publicadas por ahora</h2><p>Las oportunidades aparecerán aquí cuando Pollos B3 las publique.</p></div>')+'</div>';
}
function vacancyDetail(){
 const v=visibleVacancies().find(x=>x.id===selectedVacancyId);
 if(!v)return jobsScreen();
 const rows=[['Puesto',v.title],['Horario',v.schedule],['Modalidad',v.employmentType],['Sede',v.locationLabel]].filter(x=>x[1]);
 const phone=String(v.whatsappPhone||'');
 const allowed=/^519\d{8}$/.test(phone);
 return '<div class="page b3-job-detail">'+heading('Detalle de vacante','jobs')+
 '<div class="b3-job-hero">'+(vacancyPhoto(v)||'<div class="b3-job-placeholder">'+ic('store',35)+'</div>')+'</div>'+
 '<h2>'+esc(v.title)+'</h2>'+ 
 (v.summary?'<p class="sub">'+esc(v.summary)+'</p>':'')+
 '<div class="b3-job-facts">'+rows.map(([name,value])=>'<div><strong>'+esc(name)+'</strong><span>'+esc(value)+'</span></div>').join('')+'</div>'+
 (v.description?'<section class="b3-job-section"><h3>Descripción</h3><p>'+esc(v.description)+'</p></section>':'')+
 (v.requirements?'<section class="b3-job-section"><h3>Requisitos</h3><p>'+esc(v.requirements)+'</p></section>':'')+
 (allowed?'<button type="button" class="b3-job-whatsapp" data-apply-vacancy="'+esc(v.id)+'">'+ic('chat',22)+' '+'Postular por WhatsApp'+'</button>':
 '<p class="smallprint">Contacto de postulación no disponible.</p>')+
 '</div>';
}
function applyVacancy(id){
 const v=visibleVacancies().find(x=>x.id===id);
 if(!v||!/^519\d{8}$/.test(String(v.whatsappPhone||'')))return toast('WhatsApp de postulación no disponible');
 const message='Hola, estoy interesado(a) en trabajar en Pollos B3. Quisiera información sobre la vacante de '+v.title+'.';
 const url='https://wa.me/'+v.whatsappPhone+'?text='+encodeURIComponent(message);
 if(window.AndroidBridge?.openApplicantWhatsApp)window.AndroidBridge.openApplicantWhatsApp(url);
 else window.open(url,'_blank','noopener,noreferrer');
}
function deliveryStepDescription(){
 const stages={
  CATALOGO_PUBLICADO:'Comprobando la carta, las sedes y sus horarios.',
  UBICACION:'Verificando las coordenadas del destino.',
  COBERTURA_Y_HORARIO:'Revisando cobertura y horarios de delivery.',
  DISPONIBILIDAD_AGENTE:'Consultando si la sede tiene un agente disponible.',
  PREPARANDO_INTERACCION:'Preparando la solicitud para la sede.',
  CREANDO_INTERACCION:'Registrando la solicitud sin duplicados.',
  ENTREGANDO_DETALLE:'Enviando los detalles del pedido.'
 };
 return stages[deliveryValidationStep]||'Consultando la disponibilidad del delivery.';
}
function address(){return `<div class="page form b3-address-page">${heading('Dirección de Delivery','choice')}
 <p class="sub">Elige una dirección guardada o escribe una nueva. Puedes usarla solo para este pedido.</p>
 ${savedAddresses().length?'<div class="b3-modal-saved"><h3>Mis direcciones</h3>'+savedAddressesHtml(true)+'</div>':''}
 <button type="button" class="outline full" data-gps="1">${ic('pin',18)} Usar mi ubicación actual como destino</button>
 <p class="smallprint">El GPS intentará completar calle y distrito. Revisa siempre el número de puerta. La distancia es aproximada en línea recta.</p>
 ${deliveryGpsMessage?`<div class="notice" role="status">${esc(deliveryGpsMessage)}</div>`:''}
 ${hasDeliveryDestination(st.profile.address,st.profile.district)&&deliveryLocation.source==='gps'?'<div class="notice">Ubicación GPS seleccionada para esta dirección.</div>':''}
 <label>Dirección completa<input id="address" maxlength="180" autocomplete="street-address" placeholder="Calle, avenida y número" value="${esc(st.profile.address||'')}"></label>
 <label>Distrito<input id="district" maxlength="80" value="${esc(st.profile.district||'')}"></label>
 
 <label>Referencia (opcional)<input id="reference" maxlength="180" value="${esc(st.profile.reference||'')}"></label>
 <label class="b3-address-check"><input type="checkbox" id="delivery-save-address"> Guardar para próximos pedidos</label>
 ${deliveryRequestError?`<div class="notice" role="alert">${esc(deliveryRequestError)}</div>`:""}
 ${deliveryRequestPending?'<div class="notice" role="status">'+esc(deliveryStepDescription())+'</div>':''}
 <button class="primary full" data-address-next="1" ${deliveryRequestPending?"disabled":""}>${deliveryRequestPending?"Buscando sedes...":"Consultar disponibilidad"}</button>
 ${deliveryRequestPending&&!activePersonalCheckout()?'<button type="button" class="outline full" data-delivery-stop-check="1">Detener búsqueda y revisar dirección</button>':''}</div>`}
function maybeSaveDeliveryAddress(){
 if(!document.getElementById('delivery-save-address')?.checked)return;
 const street=v('address'),district=v('district'),reference=v('reference');
 if(street.length<6||district.length<2)return;
 const existing=savedAddresses().find(a=>a.street.toLowerCase()===street.toLowerCase()&&a.district.toLowerCase()===district.toLowerCase());
 if(existing)return;
 const id='addr-'+Date.now()+'-'+Math.floor(Math.random()*10000);
 st.addresses=[...savedAddresses(),{id,kind:'Casa',label:'',street,district,reference}];
 if(!st.defaultAddressId)st.defaultAddressId=id;
}
function profileScreen(){
 const p=st.profile||{};
 return `<div class="page form b3-profile-page">
   ${heading('Mi perfil','app')}
   <div class="b3-profile-hero"><span class="b3-profile-avatar">${ic('user',31)}</span><div><strong>Mis datos personales</strong><small>Actualiza la información para tus pedidos.</small></div></div>
   <label>Nombres<input id="profile-first" autocomplete="given-name" maxlength="80" value="${esc(p.first||'')}" placeholder="Tus nombres"></label>
   <label>Apellidos<input id="profile-last" autocomplete="family-name" maxlength="80" value="${esc(p.last||'')}" placeholder="Tus apellidos"></label>
   <label>Celular de Perú<div class="phone-field"><b>+51</b><input id="profile-phone" inputmode="numeric" maxlength="9" value="${esc(p.phone||'')}" placeholder="9 dígitos"></div></label>
   <p class="smallprint">Validamos el formato del celular; todavía no enviamos códigos de verificación ni SMS.</p>
   <label>Correo electrónico (opcional)<input id="profile-email" type="email" autocomplete="email" maxlength="150" value="${esc(p.email||'')}" placeholder="correo@ejemplo.com"></label>
   <label>Fecha de nacimiento (opcional)<input id="profile-birthday" type="date" max="${new Date().toISOString().slice(0,10)}" value="${esc(p.birthday||'')}"></label>
   <label class="b3-profile-optin"><input type="checkbox" id="profile-marketing" ${p.marketingConsent===true?'checked':''}><span><strong>Ofertas y novedades</strong><small>Quiero recibir promociones de Pollos B3. Puedes retirar tu autorización cuando quieras.</small></span></label>
   <p class="smallprint">Los datos del perfil se guardan en este dispositivo. Los datos de contacto confirmados para un pedido pueden enviarse al servicio que lo gestiona. Marcar esta casilla no activa por sí solo mensajes promocionales.</p>
   <button class="primary full" data-profile-save="1">Guardar cambios</button>
 </div>`;
}
function saveProfile(){
 const first=v('profile-first'),last=v('profile-last'),phone=v('profile-phone'),email=v('profile-email'),birthday=v('profile-birthday');
 if(first.length<2||last.length<2)return toast('Completa tus nombres y apellidos');
 if(phone&&!/^9\d{8}$/.test(phone))return toast('Ingresa un celular peruano válido de 9 dígitos');
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return toast('Verifica el correo electrónico');
 if(birthday&&(birthday>new Date().toISOString().slice(0,10)||!/^\d{4}-\d{2}-\d{2}$/.test(birthday)))return toast('Fecha de nacimiento inválida');
 st.profile={...st.profile,first,last,phone,email,birthday,marketingConsent:!!document.getElementById('profile-marketing')?.checked};
 save();nav('cuenta');toast('Perfil actualizado en este dispositivo');
}
const b3FrequentlyAsked=[
 ['¿Puedo usar la app sin crear una cuenta?','Sí. Puedes continuar como invitado para explorar la carta y las opciones de entrega o recojo.'],
 ['¿Cómo hago un pedido de Delivery?','Elige Pollo Delivery, indica una dirección y revisa los productos. La sede, cobertura y tarifa se validarán con la configuración publicada cuando el servicio esté habilitado.'],
 ['¿Puedo recoger mi pedido en un local?','Sí. Selecciona Pide y Retira y elige una sede disponible. Verifica el local antes de continuar.'],
 ['¿Cómo se calcula el costo de Delivery?','Cada local puede tener un costo fijo o una tarifa por kilómetro, de acuerdo con lo configurado por Pollos B3. La cotización depende de la cobertura y de la información publicada.'],
 ['¿Cuáles son los horarios de atención?','Consulta Nuestros locales para ver los horarios publicados por cada sede. La disponibilidad puede cambiar.'],
 ['¿Cómo puedo consultar la carta y los precios?','En Carta encontrarás los productos y precios del catálogo publicado por Pollos B3. Si no hay catálogo disponible, no se mostrarán productos ficticios.'],
 ['¿Qué métodos de pago hay?','Los métodos disponibles dependen de la sede y del tipo de pedido. Sigue las instrucciones de pago publicadas y espera la confirmación correspondiente.'],
 ['¿Puedo guardar varias direcciones?','Sí. En Mi Cuenta → Mis direcciones puedes agregar, editar, eliminar y elegir una dirección predeterminada. Las direcciones guardadas permanecen en este dispositivo.'],
 ['¿Puedo hacer un pedido para otra persona?','Sí. Cada nuevo pedido solicita confirmar los nombres y el celular de quien lo recibirá. Estos datos pueden ser diferentes de tu perfil.'],
 ['¿Cómo sé dónde está mi pedido?','Consulta Mis pedidos para ver los estados disponibles. La aceptación y el pago requieren confirmación de la sede; una solicitud enviada no equivale a un pedido aceptado.'],
 ['¿Cómo consulto promociones?','Las promociones aparecerán en la app cuando Pollos B3 las publique oficialmente. Su disponibilidad y condiciones dependen del negocio.'],
 ['¿Cómo me comunico con Pollos B3?','Utiliza los canales de contacto publicados por Pollos B3. Cuando exista una interacción con la sede, podrás consultar los mensajes y eventos disponibles en su seguimiento.'],
 ['¿Dónde puedo presentar un reclamo o queja?','En Mi Cuenta → Libro de Reclamaciones. Cuando Pollos B3 configure su enlace oficial podrás acceder desde ahí. No confundas la sección con un registro de reclamos dentro de la app.']
];
function faqScreen(){return `<div class="page b3-faq">${heading('Preguntas frecuentes','app')}
 <p class="sub">Respuestas sobre el funcionamiento de la aplicación y cómo preparar tus pedidos.</p>
 <div class="b3-faq-list">${b3FrequentlyAsked.map(([q,a],i)=>`<details class="b3-faq-item" ${i===0?'open':''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
 <p class="smallprint">Los horarios, precios, productos y promociones válidos son únicamente los publicados por Pollos B3.</p></div>`}
function complaintsScreen(){const valid=typeof complaintsBookUrl==='string'&&/^https:\/\/[^\s/]+/.test(complaintsBookUrl);
 return `<div class="page b3-complaints">${heading('Libro de Reclamaciones','app')}
 <div class="b3-claims-mark">${ic('book',27)}<div><h2>Libro de Reclamaciones</h2><p>Pollos B3 · Atención al consumidor</p></div></div>
 <p class="sub">Puedes presentar una queja por la atención recibida o un reclamo relacionado con un producto o servicio a través del Libro de Reclamaciones del proveedor.</p>
 <div class="b3-claims-info"><strong>¿Cuál es la diferencia?</strong><p><b>Reclamo:</b> disconformidad con el producto o servicio.</p><p><b>Queja:</b> descontento con la atención al público.</p><p>El proveedor dispone de hasta 15 días hábiles improrrogables para responder.</p></div>
 ${valid?`<button class="primary full" data-book-open="1">Abrir Libro de Reclamaciones ${ic('chev',17)}</button><p class="smallprint">El registro se realizará fuera de esta app, en el enlace configurado por Pollos B3. Solicita y conserva una copia o código para el seguimiento.</p>`:
 '<div class="b3-claims-pending"><strong>Enlace del Libro aún no configurado</strong><p>Pollos B3 debe publicar el acceso a su Libro de Reclamaciones oficial. Esta pantalla no recibe ni registra reclamos. Puedes solicitar el Libro directamente al establecimiento.</p></div>'}
 <button class="outline full" data-book-guidance="1">Información oficial del consumidor</button>
 <p class="smallprint">Presentar un reclamo no requiere pago. Para habilitar el Libro electrónico, se deben verificar los datos legales y el mecanismo de constancia correspondiente.</p></div>`}
function openComplaintsUrl(guidance=false){
 const url=guidance?'https://consumidor.gob.pe/libro-de-reclamaciones/':complaintsBookUrl;
 if(typeof url!=='string'||!/^https:\/\//.test(url))return toast('Libro de Reclamaciones no configurado');
 if(window.AndroidBridge?.openComplaintsBook)window.AndroidBridge.openComplaintsBook(url);
 else window.open(url,'_blank','noopener,noreferrer');
}
function privacyScreen(){
 const saved=savedAddresses().length;
 return `<div class="page b3-privacy-page">${heading('Privacidad y protección de datos','app')}
 <div class="b3-privacy-intro">${ic('shield',28)}<div><h2>Tú controlas tu información</h2><p>Conoce qué datos guarda esta aplicación en el dispositivo y cuándo puede comunicarse con los servicios del negocio.</p></div></div>
 <section class="b3-privacy-section"><h3>¿Qué datos utiliza la app?</h3><p>Los datos que ingreses voluntariamente en Mi perfil y durante la preparación de pedidos: nombre, apellidos, celular, correo, fecha de nacimiento opcional, direcciones y referencias de entrega. También se conservan el carrito y los registros locales de pedidos en este dispositivo.</p><p>No es necesario registrarse para explorar la carta.</p></section>
 <section class="b3-privacy-section"><h3>¿Para qué se usan?</h3><p>Para completar formularios con mayor facilidad, elegir direcciones y preparar pedidos. Al solicitar un pedido, los datos que confirmes pueden enviarse al servidor para gestionar la disponibilidad, la atención y el pago. Guardar el perfil o una dirección no equivale a enviar un pedido.</p></section>
 <section class="b3-privacy-section"><h3>Almacenamiento y servicios externos</h3><p>Los datos del perfil, las direcciones guardadas y tus preferencias se almacenan localmente en la aplicación mediante el almacenamiento del dispositivo. No se cifran de forma independiente dentro de ese almacenamiento ni existe todavía una cuenta remota para sincronizarlos.</p><p>Al consultar el catálogo o solicitar una cotización de Delivery, la aplicación puede comunicarse con el servidor de Pollos B3. La dirección de entrega introducida para cotizar puede enviarse al servidor y utilizarse para consultar rutas. Las consultas no se realizan simplemente por guardar una dirección.</p></section>
 <section class="b3-privacy-section"><h3>Ubicación y permisos</h3><p>La ubicación GPS es opcional. Se solicita permiso cuando eliges utilizar tu ubicación; puedes rechazarlo y escribir la dirección manualmente. Podrás administrar los permisos desde los ajustes de Android.</p></section>
 <section class="b3-privacy-section"><h3>Publicidad y comunicaciones</h3><p>El consentimiento para ofertas y novedades es opcional y está desactivado por defecto. Puedes cambiarlo desde Mi perfil. Guardarlo aquí no activa envíos de WhatsApp, SMS o notificaciones promocionales.</p><button class="b3-privacy-secondary" data-screen="profile">Administrar consentimiento ${ic('chev',15)}</button></section>
 <section class="b3-privacy-section"><h3>Tus derechos</h3><p>En Perú, la Ley N.° 29733 reconoce derechos relacionados con el tratamiento de datos personales, incluidos acceso, rectificación, cancelación y oposición, conforme a la normativa aplicable.</p><p>Pollos B3 debe disponer de una política de privacidad oficial, identificar al responsable del tratamiento y ofrecer un canal para ejercer estos derechos. Esta pantalla informativa no sustituye esa política.</p><button class="b3-privacy-secondary" data-privacy-law="1">Consultar normativa peruana ${ic('chev',15)}</button></section>
 <section class="b3-privacy-delete"><h3>Mis datos en este teléfono</h3><p>${saved===1?'1 dirección guardada':saved+' direcciones guardadas'} · Perfil y preferencias de esta instalación.</p><p>Si borras los datos locales, desaparecerán del dispositivo el perfil, las direcciones, el carrito, los registros locales de pedidos y las preferencias guardadas. No solicita eliminar información que pudiera existir en sistemas externos.</p><button class="outline full" data-privacy-clear="1">Borrar mis datos locales</button></section>
 <p class="smallprint">Información sobre el funcionamiento de la aplicación. Consulta la política de privacidad oficial de Pollos B3 cuando esté publicada.</p></div>`;
}
function notificationImageUrl(raw){
 if(typeof raw!=='string'||!NOTIFICATIONS_API_BASE)return '';
 if(!/^\/api\/v1\/mobile\/notification-images\/[a-zA-Z0-9-]+(?:\?appId=com\.integrab2g\.pollosb3)?$/.test(raw))return '';
 return NOTIFICATIONS_API_BASE+raw;
}
async function fetchNotifications(){
 const requestId=++notificationsRequestId;
 if(!NOTIFICATIONS_API_BASE){notificationsError='No está configurada la API de notificaciones.';notificationsLoaded=false;if(['notifications','notificationDetail'].includes(st.stage))render();return}
 notificationsLoading=true;notificationsError='';
 if(['notifications','notificationDetail'].includes(st.stage))render();
 try{
  const response=await fetch(NOTIFICATIONS_API_BASE+'/api/v1/mobile/notifications?appId='+encodeURIComponent(APP_ID),{cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  if(data.ready!==true||!Array.isArray(data.notifications))throw Error('Respuesta inválida');
  const seen=new Set(),now=Date.now();
  const next=data.notifications.filter(n=>{
   if(!n||typeof n.id!=='string'||typeof n.title!=='string'||typeof n.message!=='string'||seen.has(n.id))return false;
   seen.add(n.id);
   const begin=n.scheduledAt?Date.parse(n.scheduledAt):NaN,expiry=n.expiresAt?Date.parse(n.expiresAt):NaN;
   return (!Number.isFinite(begin)||begin<=now)&&(!Number.isFinite(expiry)||expiry>now);
  }).map(n=>({id:n.id,title:n.title,message:n.message,imageUrl:notificationImageUrl(n.imageUrl),scheduledAt:n.scheduledAt,expiresAt:n.expiresAt,
   productId:typeof n.productId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(n.productId)?n.productId:null}));
  if(requestId!==notificationsRequestId)return;
  commercialNotifications=next;notificationsLoaded=true;notificationsError='';
  if(pendingPushNotificationId){
   const id=pendingPushNotificationId;
   if(next.some(n=>n.id===id)){markNotificationRead(id);pendingPushNotificationId=''}
   else pendingPushNotificationId=''; // Never display outdated or withdrawn offers.
  }
  if(st.stage==='notificationDetail'&&next.some(n=>n.id===selectedNotificationId))markNotificationRead(selectedNotificationId);
 }catch(error){
  if(requestId!==notificationsRequestId)return;
  notificationsError='No pudimos consultar los avisos. Comprueba tu conexión y vuelve a intentar.';
  console.warn('Pollos B3 notifications unavailable',error.message);
 }finally{
  if(requestId===notificationsRequestId){notificationsLoading=false;if(['notifications','notificationDetail','app'].includes(st.stage))render()}
 }
}
function notificationsScreen(){
 const items=liveNotifications();
 const unread=notificationUnreadCount();
 const rows=items.map(n=>{
  const date=n.scheduledAt?new Date(n.scheduledAt):null;
  const stamp=date&&Number.isFinite(date.getTime())?date.toLocaleString('es-PE',{timeZone:'America/Lima',dateStyle:'medium',timeStyle:'short'}):'';
  const isUnread=!readNotificationIds.includes(n.id);
  return `<button class="b3-commercial-notification ${isUnread?'b3-notification-unread':''}" data-notification-open="${esc(n.id)}" aria-label="Abrir aviso: ${esc(n.title)}">
   ${n.imageUrl?`<img class="b3-notification-image" src="${esc(n.imageUrl)}" alt="" loading="lazy">`:''}
   <div class="b3-notification-body"><small>${isUnread?'<span class="b3-unread-dot" aria-hidden="true"></span>NUEVO · ':''}POLLOS B3 ${stamp?'· '+esc(stamp):''}</small><h2>${esc(n.title)}</h2><p>${esc(n.message)}</p><span class="b3-notification-more">Ver detalle →</span></div>
  </button>`;
 }).join('');
 return `<div class="page b3-notifications-page">${heading('Notificaciones','app')}
  <div class="b3-notification-inbox-head"><strong>${unread?unread+' sin leer':'Tus novedades'}</strong><button type="button" data-notifications-refresh="1" ${notificationsLoading?'disabled':''}>${notificationsLoading?'Actualizando...':'Actualizar'}</button></div>
  ${notificationsError?`<div class="notice" role="status">${esc(notificationsError)}</div>`:''}
  ${notificationsLoading&&!rows?'<p class="smallprint" role="status">Consultando novedades...</p>':''}
  ${rows||(!notificationsLoading&&!notificationsError?'<div class="empty-state"><h2>No hay novedades vigentes</h2><p>Las promociones aparecerán cuando se publiquen.</p></div>':'')}
  <div class="b3-marketing-opt-in b3-marketing-compact">
   <div class="b3-marketing-compact-icon" aria-hidden="true">${ic('bell',18)}</div>
   <div class="b3-marketing-compact-content"><strong>Avisos en mi celular</strong><p>Ofertas y novedades</p></div>
   <button class="outline" type="button" data-marketing-toggle="1" aria-label="${window.AndroidBridge?.marketingNotificationsEnabled?.()?'Desactivar':'Activar'} avisos comerciales">${window.AndroidBridge?.marketingNotificationsEnabled?.()?'Desactivar':'Activar'}</button>
  </div>
  <p class="smallprint">Se muestran hasta 20 avisos vigentes, del más reciente al más antiguo. Los avisos sin vencimiento permanecen 7 días. Lecturas guardadas en este dispositivo.</p>
 </div>`;
}
function openPrivacyLaw(){
 const url='https://www.gob.pe/institucion/anpd/normas-legales/6554453-16-2024-jus';
 if(window.AndroidBridge?.openComplaintsBook)window.AndroidBridge.openComplaintsBook(url);
 else window.open(url,'_blank','noopener,noreferrer');
}
function infoScreen(){const content={methods:['Métodos de pago','Podrás elegir el método de pago en el paso de compra. No guardamos tarjetas.'],history:['Nuestra Historia','Contenido oficial de la historia de Pollos B3 pendiente de recibir.']};let [title,body]=content[st.stage]||['Información',''];return `<div class="page">${heading(title,'app')}<p class="sub">${esc(body)}</p></div>`}
function signin(){return `<div class="page form">${heading('Continuar con teléfono','login')}<p class="sub">Ingresa tu celular peruano. No enviamos SMS ni verificamos que seas titular de este número. Para cada pedido deberás confirmar los datos del destinatario.</p><label>Celular (+51)<input id="signin-value" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="9" pattern="9[0-9]{8}" placeholder="9 dígitos"></label><button class="primary full" data-phone-continue="1">Continuar sin verificación SMS</button><p class="smallprint">Tu número se guarda en este dispositivo como dato de contacto, no como identidad verificada.</p></div>`}
function render(){
 // Resume an acknowledged-delivery notice after app restart without reopening
 // favorites or surveys before the customer accepts the delivery message.
 if(st.stage==='app'&&!deliveredNoticeOrderId&&!favoritePromptOrderId&&!reviewSheetOrderId){
  const pending=(Array.isArray(st.orders)?st.orders:[]).find(o=>o?.deliveryNoticePending&&orderDelivered(o));
  if(pending)deliveredNoticeOrderId=pending.id;
 }
 if(visibleLiveOrder()&&!trackingPollBusy&&trackingPollTimer===null)scheduleLiveTracking(3000);else if(!visibleLiveOrder()&&trackingPollTimer!==null){clearTimeout(trackingPollTimer);trackingPollTimer=null}if(['PENDING','ACCEPTED','SUBMITTING'].includes(window.B3OrderAvailability?.readInteraction?.()?.status)&&!agentDecisionTimer&&!agentDecisionPolling)scheduleAgentDecisionPoll(1500);if(st.stage==='app'&&st.tab==='inicio'&&!homeLocationPrompted){homeLocationPrompted=true}if(window.AndroidBridge?.setSplash)window.AndroidBridge.setSplash(st.stage==='splash');let html='';if(st.stage==='splash')html=splash();else if(st.stage==='login')html=login();else if(st.stage==='app')html=main();else if(st.stage==='choice')html=choice();else if(st.stage==='scheduleChoice')html=scheduleChoice();else if(st.stage==='reservationPicker')html=reservationPicker();else if(st.stage==='locations')html=locations();else if(st.stage==='localDetail')html=localDetail();else if(st.stage==='orderDetail')html=orderDetail();else if(st.stage==='profile')html=profileScreen();else if(st.stage==='address')html=addressesScreen();else if(st.stage==='addressEdit')html=addressEditScreen();else if(st.stage==='deliveryAddress')html=address();else if(st.stage==='availability')html=availability();else if(st.stage==='detail')html=detail();else if(st.stage==='cart')html=cart();else if(st.stage==='identity')html=identity();else if(st.stage==='phone')html=phone();else if(st.stage==='pickupRequestPending')html=pickupRequestPending();else if(st.stage==='confirmDetails')html=confirmDetails();else if(st.stage==='prepaymentReview')html=prepaymentReview();else if(st.stage==='payment')html=payment();else if(st.stage==='paymentInstructions')html=paymentInstructions();else if(st.stage==='paymentProofPreview')html=paymentProofPreview();else if(st.stage==='paymentWaiting')html=paymentWaiting();else if(st.stage==='paymentOutcome')html=paymentOutcome();else if(st.stage==='summary')html=summary();else if(st.stage==='success')html=success();else if(st.stage==='chat')html=chat();else if(st.stage==='jobs')html=jobsScreen();else if(st.stage==='vacancyDetail')html=vacancyDetail();else if(st.stage==='about')html=about();else if(st.stage==='faq')html=faqScreen();else if(st.stage==='claims')html=complaintsScreen();else if(st.stage==='privacy')html=privacyScreen();else if(st.stage==='notifications')html=notificationsScreen();else if(st.stage==='notificationDetail')html=notificationDetailScreen();else if(st.stage.startsWith('signin-'))html=signin();else html=infoScreen();root.innerHTML=html+(st.stage!=='availability'&&st.stage!=='chat'&&st.stage!=='splash'&&st.stage!=='prepaymentReview'&&st.stage!=='payment'?personalCheckoutBanner():'')+(!['splash','login','app','chat','signin-phone','signin-email'].includes(st.stage)?
  `<button class="persistent-chat ${st.stage==='availability'?'b3-wait-chat-fab':''}" data-screen="chat" aria-label="Abrir chat flotante y regresar a mi pedido sin perder avances">${ic('chat',23)}</button>`:'')+deliveredNotice()+favoritePrompt()+reviewSheet()+marketingPrompt();if(st.stage==='app'&&st.tab==='inicio')scheduleMarketingPrompt();}
function v(id){return document.getElementById(id)?.value.trim()||''}
function checkoutSnapshot(){
 return {store:String(st.store||''),total:Math.round(orderTotal()*100),
  items:st.cart.map(x=>{const p=product(x.id);return [x.id,x.qty,p?.price??'missing'].join(':')}).join('|')};
}
async function revalidateCheckout(next){
 
 if(checkoutRefreshPending)return false;
 checkoutRefreshPending=true;checkoutReviewNote='';render();
 const before=checkoutSnapshot();
 try{
  // Never rely on the cached isOpen flag; request live published hours/availability.
  await fetchConfig({strict:true});
  const issue=checkoutCartIssue();
  if(issue){checkoutReviewNote=issue;screen('cart');return false}
  if(st.mode==='delivery'){
   if(!hasDeliveryDestination(st.profile.address,st.profile.district)){
    deliveryRequestError='Confirma la dirección de entrega antes de calcular el costo.';
    screen('deliveryAddress');return false
   }
   if(!await resolveDelivery({silent:true,skipConfig:true})){
    checkoutReviewNote=deliveryRequestError||deliveryAvailability.message||'Se necesita validar disponibilidad.';
    if(st.stage!=='availability')screen('availability');return false
   }
  }else if(st.mode==='pickup'){
   if(!eligibleForPickup(shops.find(x=>String(x.id)===String(st.store)))){
    checkoutReviewNote='El local de recojo ya no está abierto o no acepta pedidos.';
    screen('locations');return false
   }
   // Pickup has no delivery fee. Fresh GET already checked this store's
   // published pickup flag and opening hours; no fulfillment POST is required.
  }else{checkoutReviewNote='Selecciona Delivery o Pide y Retira.';screen('choice');return false}
  const after=checkoutSnapshot();
  const changed=before.store!==after.store||before.total!==after.total||before.items!==after.items;
  if(['summary','confirm'].includes(next)&&!paymentOptions().some(x=>x[0]===st.pay)){
   st.pay='';checkoutReviewNote='La sede asignada actualizó los medios de pago disponibles. Selecciona uno para continuar.';
   save();screen('payment');return false
  }
  if(changed){
   checkoutReviewNote='Se actualizó la sede, el costo o el catálogo. Revisa el nuevo total y vuelve a continuar.';
   if(next==='summary'){screen('payment');return false}
   if(next==='confirm'){screen('summary');return false}
  }
  if((next==='summary'||next==='confirm')&&st.pay==='cash'&&
    (!Number.isFinite(Number(st.cash))||Number(st.cash)<orderTotal())){
   checkoutReviewNote='El monto en efectivo es menor al total actualizado. Ajusta con cuánto pagarás.';
   screen('payment');return false
  }
  save();
  if(next==='confirm'){checkoutReviewNote='Este recorrido anterior no registra pedidos. Inicia una nueva solicitud desde Delivery o Pide y Retira.';screen('cart');return false;}
  else screen(next);
  return true;
 }catch(err){
  checkoutReviewNote=err.message||'No se pudo comprobar la disponibilidad.';
  // Fail closed: a previous estimate cannot remain valid when refreshing fails.
  if(st.mode==='delivery'){
   st.quote=null;st.store='';deliveryRequestError=checkoutReviewNote;save();
   if(next==='cart')screen('cart');else screen('deliveryAddress');
  }else{
   // Pickup also needs a fresh, successful GET before the customer can proceed.
   // Route back to store selection rather than leaving a stale payment/summary.
   if(st.mode==='pickup')screen('locations');
   else render();
  }
  return false;
 }finally{checkoutRefreshPending=false;render()}
}
function startCheckout(){
 const issue=checkoutCartIssue();if(issue){toast(issue);return}
 if(st.mode==='pickup'&&!st.pickupScheduleSelected){checkoutPending=true;screen('scheduleChoice');return}
 if(st.scheduleMode==='reservation'){checkoutPending=false;screen('reservationPicker');return}
 if(!st.mode){checkoutPending=true;screen('choice');return}
 if(st.mode==='delivery'){
  // A fresh checkout must reconfirm who receives the order.
  // Do not reset the identity of an active or uncertain interaction.
  if(!['PREPARED','SUBMITTING','PENDING','ACCEPTED'].includes(
     window.B3OrderAvailability?.readInteraction?.()?.status))
   resetDeliveryOrderContact();
  checkoutPending=true;
  if(!hasDeliveryDestination(st.profile.address,st.profile.district)){screen('deliveryAddress');return}
  confirmedDeliveryReviewKey=null;
  if(!deliveryContactReady()){screen('identity');return}
  screen('confirmDetails');return
 }
 checkoutPending=false;void revalidateCheckout('identity');
}
function animateAddedProduct(fromRect,imageSrc,quantity=1){
  // Solo animación visual: el carrito ya fue actualizado por addToCart.
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  requestAnimationFrame(()=>{
    const target=root.querySelector('.float-cart');
    if(!target)return;
    const finish=()=>{
      target.classList.remove('b3-cart-added');
      void target.offsetWidth;
      target.classList.add('b3-cart-added');
      const chip=document.createElement('span');
      chip.className='b3-cart-added-chip';
      chip.textContent='+'+quantity;
      chip.setAttribute('aria-hidden','true');
      target.appendChild(chip);
      chip.addEventListener('animationend',()=>chip.remove(),{once:true});
    };
    if(!fromRect){finish();return}
    const to=target.getBoundingClientRect();
    const size=50;
    const sourceX=fromRect.left+fromRect.width/2;
    const sourceY=fromRect.top+fromRect.height/2;
    const endX=to.left+to.width/2;
    const endY=to.top+to.height/2;
    const flyer=document.createElement(imageSrc?'img':'span');
    flyer.className='b3-fly-to-cart';
    flyer.setAttribute('aria-hidden','true');
    if(imageSrc){flyer.src=imageSrc;flyer.alt='';flyer.onerror=()=>{flyer.remove();finish()}}
    else flyer.textContent='+';
    flyer.style.left=(sourceX-size/2)+'px';
    flyer.style.top=(sourceY-size/2)+'px';
    document.body.appendChild(flyer);
    if(typeof flyer.animate!=='function'){flyer.remove();finish();return}
    const dx=endX-sourceX,dy=endY-sourceY;
    const flight=flyer.animate([
      {transform:'translate(0px,0px) scale(.83)',opacity:0.92,offset:0},
      {transform:'translate('+dx*.46+'px,'+(dy*.38-48)+'px) scale(1)',opacity:1,offset:.48},
      {transform:'translate('+dx+'px,'+dy+'px) scale(.22)',opacity:.2,offset:1}
    ],{duration:580,easing:'cubic-bezier(.2,.75,.3,1)',fill:'forwards'});
    flight.onfinish=()=>{flyer.remove();finish()};
    flight.oncancel=()=>flyer.remove();
  });
}
let promotionValidationBusy=false;
async function validatePromotionFromApi(item){
 if(!item?.isPublished||(!scheduledPromotionForProduct(item)&&!categoryMatches(item,'Promociones')))return true;
 if(!API_BASE)return false;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch(API_BASE+'/api/v1/mobile/config?appId='+encodeURIComponent(APP_ID),{cache:'no-store',signal:controller.signal});
  if(!response.ok)return false;
  const config=await response.json();
  if(!config.ready||!Array.isArray(config.promotions))return false;
  const rawId=item.id.replace(/^api:/,'');
  const linked=config.promotions.find(p=>{
   const id=p?.productId??p?.product_id??p?.product?.id??p?.linkedProductId;
   return typeof id==='string'&&id.replace(/^api:/,'')===rawId;
  });
  if(!linked||!promoVisibleNow(linked))return false;
  publishedPromotions=config.promotions;
  return true;
 }catch{return false}finally{clearTimeout(timeout)}
}
async function validateCartPromotionsBeforeRequest(){
 const promoItems=st.cart.map(x=>product(x.id)).filter(p=>p?.isPublished&&(scheduledPromotionForProduct(p)||categoryMatches(p,'Promociones')));
 if(!promoItems.length)return;
 const expired=[];
 for(const p of promoItems){
  if(!await validatePromotionFromApi(p))expired.push(p);
 }
 if(!expired.length)return;
 const removed=new Set(expired.map(p=>p.id));
 st.cart=st.cart.filter(x=>!removed.has(x.id));
 // Do not alter submitted interactions. This check runs before preparing a new request.
 st.quote=null;confirmedDeliveryReviewKey=null;
 save();
 const names=expired.map(p=>'«'+p.name+'»').join(', ');
 const message=(expired.length===1?'La promoción '+names+' ya no está vigente y fue retirada de tu carrito.':'Las promociones '+names+' ya no están vigentes y fueron retiradas de tu carrito.')+
  (st.cart.length?' Revisa el total actualizado antes de confirmar nuevamente.':' Tu carrito está vacío; puedes elegir otros productos.');
 const error=new Error(message);error.code='PROMOTIONS_REMOVED';
 throw error;
}
function addToCart(id,qty=1){let p=product(id);if(!p||promotionNotPurchasable(p))return false;if(activePersonalCheckout()){const draft=nextCartDraft();let found=draft.find(x=>x.id===id);if(found)found.qty=Math.min(99,found.qty+qty);else draft.push({id,qty:Math.min(99,qty)});saveNextCartDraft(draft)}else{let found=st.cart.find(x=>x.id===id);if(found)found.qty+=qty;else st.cart.push({id,qty});invalidateDeliverySelection();save()}vibrateCartAddition();toast('Producto agregado',{kind:'cart',quantity:qty});return true}

root.addEventListener('click',async e=>{const orderFilter=e.target.closest('[data-orders-filter]');if(orderFilter){const next=orderFilter.dataset.ordersFilter;if(['all','active','history'].includes(next)){b3OrdersFilter=next;render()}return}if(e.target.closest('[data-splash-retry]')){void initializeCatalogAtSplash();return}let b=e.target.closest('[data-delivery-notice-ok],[data-notification-open],[data-notification-catalog],[data-marketing-first-accept],[data-marketing-first-later],[data-marketing-toggle],[data-notifications-refresh],[data-order-open],[data-demo-next],[data-repeat-order],[data-fav-reorder],[data-fav-remove],[data-accept-favorite],[data-decline-favorite],[data-open-review],[data-review-backdrop],[data-review-close],[data-review-star],[data-review-tag],[data-review-send],[data-privacy-clear],[data-privacy-law],[data-book-open],[data-book-guidance],[data-profile-save],[data-address-create],[data-address-edit],[data-address-delete],[data-address-default],[data-address-choose],[data-address-save],[data-vacancy],[data-apply-vacancy],[data-home-store],[data-home-store-close],[data-home-store-mode],[data-home-local],[data-open-fulfillment],[data-modal-mode],[data-modal-save-delivery],[data-modal-pickstore],[data-modal-close],[data-modal-back],[data-gps],[data-pickup-origin-save],[data-clearsearch],[data-tab],[data-screen],[data-guest],[data-schedule-choice],[data-reservation-verify],[data-reservation-address],[data-reservation-address-save],[data-reservation-pay],[data-reservation-cash-mode],[data-mode],[data-store],[data-pickstore],[data-fulfillment],[data-start],[data-product],[data-quick],[data-add],[data-qty],[data-filter],[data-carousel],[data-promo],[data-local],[data-cartdelta],[data-remove],[data-prepay-payment],[data-prepay-add],[data-prepay-cancel],[data-prepay-retry],[data-checkout-return],[data-checkout-leave],[data-checkout-cancel],[data-availability-continue],[data-quote-retry],[data-change-fulfillment],[data-availability-pickup],[data-rejected-new-catalog],[data-availability-retry],[data-identity-next],[data-phone-next],[data-address-next],[data-review-confirm],[data-review-edit],[data-pay],[data-payment-start],[data-payment-done],[data-payment-save-image],[data-payment-confirm],[data-pay-next],[data-confirm],[data-google-login],[data-phone-continue],[data-logout],[data-openmaps],[data-clear]');if(!b)return;
const liveRequest=window.B3OrderAvailability?.readInteraction?.();
if(activePersonalCheckout()&&
   (b.hasAttribute('data-identity-next')||b.hasAttribute('data-phone-next')||
    b.hasAttribute('data-address-next')||b.hasAttribute('data-modal-save-delivery')||
    b.hasAttribute('data-modal-mode')||b.hasAttribute('data-mode'))){
 toast('Primero debes cancelar la solicitud actual para cambiar la dirección o modalidad.');
 returnToPersonalCheckout();
 return;
}
if(b.dataset.orderOpen){
 const o=findLocalOrder(b.dataset.orderOpen);if(!o)return;
 selectedOrderId=o.id;screen('orderDetail');return;
}
if(b.hasAttribute('data-tracking-refresh')){void refreshLiveTracking();return}
if(b.dataset.repeatOrder||b.hasAttribute('data-fav-reorder')){
 const from=b.dataset.repeatOrder?findLocalOrder(b.dataset.repeatOrder)?.items:st.favorite?.items;
 if(!Array.isArray(from)||!from.length)return;
 if(!from.every(x=>{const p=product(x.id);return p&&!p.disabled&&Number.isInteger(x.qty)&&x.qty>0}))return toast('Uno de los productos ya no está disponible');
 st.cart=from.map(x=>({id:x.id,qty:x.qty}));
 st.store='';st.quote=null;save();screen('choice');return;
}
if(b.hasAttribute('data-fav-remove')){
 void confirmB3({title:'¿Quitar el pedido favorito?',
  description:'Dejará de aparecer en tus favoritos. Tu carrito actual no cambiará.',
  confirmLabel:'Quitar de favoritos',danger:true}).then(yes=>{
   if(yes){st.favorite=null;save();render()}
  });
 return;
}
if(b.hasAttribute('data-delivery-notice-ok')){
 const o=findLocalOrder(deliveredNoticeOrderId);if(!o)return;
 o.deliveryNoticePending=false;deliveredNoticeOrderId=null;save();afterOrderDelivered(o);render();return;
}
if(b.hasAttribute('data-accept-favorite')||b.hasAttribute('data-decline-favorite')){
 const o=findLocalOrder(favoritePromptOrderId);if(!o)return;
 if(b.hasAttribute('data-accept-favorite'))st.favorite={items:o.items.map(x=>({id:x.id,qty:x.qty})),createdAt:Date.now()};
 o.favoritePromptDone=true;favoritePromptOrderId=null;save();render();
 if(!o.review&&!o.reviewDismissed){reviewSheetOrderId=o.id;reviewScore=0;reviewTags=[];render()}
 return;
}
if(b.dataset.openReview){
 const o=findLocalOrder(b.dataset.openReview);if(!orderDelivered(o)||o.review)return;
 reviewSheetOrderId=o.id;reviewScore=0;reviewTags=[];reviewSendError='';render();return;
}
if(b.hasAttribute('data-review-close')||b.hasAttribute('data-review-backdrop')){
 if(b.hasAttribute('data-review-backdrop')&&e.target!==b)return;
 const o=findLocalOrder(reviewSheetOrderId);if(o){o.reviewDismissed=true;save()}
 reviewSheetOrderId=null;reviewSendError='';render();return;
}
if(b.dataset.reviewStar){if(reviewSending||findLocalOrder(reviewSheetOrderId)?.surveySubmission)return;const comment=document.getElementById('review-comment')?.value||'';reviewScore=Number(b.dataset.reviewStar);render();const input=document.getElementById('review-comment');if(input)input.value=comment;return}
if(b.dataset.reviewTag){
 if(reviewSending||findLocalOrder(reviewSheetOrderId)?.surveySubmission)return;
 const tag=b.dataset.reviewTag;
 reviewTags=reviewTags.includes(tag)?reviewTags.filter(x=>x!==tag):[...reviewTags,tag];
 const comment=document.getElementById('review-comment')?.value||'';
 render();const area=document.getElementById('review-comment');if(area)area.value=comment;return;
}
if(b.hasAttribute('data-review-send')){
 const o=findLocalOrder(reviewSheetOrderId);
 if(o)void sendDeliveredSurvey(o);
 return;
}
if(b.hasAttribute('data-privacy-law')){openPrivacyLaw();return}
if(b.hasAttribute('data-privacy-clear')){
 void confirmB3({title:'¿Eliminar tus datos locales?',
  description:'Se borrarán el perfil, las direcciones, el carrito y los datos guardados en este teléfono. Esta acción no cancela una solicitud real en la sede.',
  confirmLabel:'Sí, eliminar mis datos',danger:true}).then(yes=>{
   if(!yes)return;
   window.B3OrderAvailability?.eraseLocalIdentity();localStorage.removeItem(K);location.reload();
  });
 return;
}
if(b.hasAttribute('data-book-open')){openComplaintsUrl(false);return}
if(b.hasAttribute('data-book-guidance')){openComplaintsUrl(true);return}
if(b.dataset.vacancy){selectedVacancyId=b.dataset.vacancy;screen('vacancyDetail');return}
if(b.dataset.applyVacancy){applyVacancy(b.dataset.applyVacancy);return}
if(b.hasAttribute('data-home-store-close')){if(b.classList.contains('b3-store-detail-backdrop')&&e.target!==b)return;selectedHomeStore=null;render();return}
if(b.dataset.homeStore){selectedHomeStore=b.dataset.homeStore;render();return}
if(b.dataset.homeLocal!==undefined){carouselMotion.pauseUntil=Date.now()+6000;animateCarousel('local',Number(b.dataset.homeLocal));return}
if(b.dataset.homeStoreMode){const mode=b.dataset.homeStoreMode,s=shops.find(x=>String(x.id)===String(selectedHomeStore));if(!storeAllowed(s,mode)||(mode==='pickup'&&!eligibleForPickup(s)))return;selectedHomeStore=null;if(mode==='pickup'){st.mode='pickup';save();void confirmStore('pickup',s.id)}else{st.mode='delivery';st.store='';st.quote=null;save();fulfillmentModal='delivery';render()}return}
if(b.hasAttribute('data-open-fulfillment')){fulfillmentModal='choose';if(API_BASE)void fetchConfig();render();return}
if(b.hasAttribute('data-modal-close')){if(b.classList.contains('b3-modal-backdrop')&&e.target!==b)return;checkoutPending=false;fulfillmentModal=null;fulfillmentOutcomeNote='';render();return}
if(b.hasAttribute('data-modal-back')){fulfillmentModal='choose';render();return}
if(b.dataset.modalMode){
 const next=b.dataset.modalMode;
 if(next!=='delivery'&&next!=='pickup')return;
 if(st.mode!==next){st.pickupScheduleSelected=false;deliveryValidationGeneration++;deliveryRequestPending=false;window.B3OrderAvailability?.clear();st.mode=next;if(st.scheduleMode==='reservation'){resetReservationQuote();}else st.reservationAt='';st.store='';st.quote=null;st.pay='';st.coords=null;save();if(st.cart.length)queueNotice('Al cambiar de modalidad se deberán verificar los productos, precios y medios de pago.')}
 fulfillmentOutcomeNote='';scheduleReturnToModal=true;fulfillmentModal=null;screen('scheduleChoice');return;
}
if(b.hasAttribute('data-profile-save')){saveProfile();return}
if(b.dataset.addressCreate){addressEditId=null;screen('addressEdit');return}
if(b.dataset.addressEdit){addressEditId=b.dataset.addressEdit;screen('addressEdit');return}
if(b.dataset.addressDelete){
 const item=savedAddresses().find(a=>a.id===b.dataset.addressDelete);
 if(!item)return;
 void confirmB3({title:'¿Eliminar esta dirección?',
  description:'La dirección guardada dejará de aparecer en tu cuenta. No modificará una solicitud ya enviada.',
  confirmLabel:'Eliminar dirección',danger:true}).then(yes=>{
   if(!yes)return;
   st.addresses=savedAddresses().filter(a=>a.id!==item.id);
   if(st.defaultAddressId===item.id)st.defaultAddressId=st.addresses[0]?.id||null;
   save();render();
  });
 return;
}
if(b.dataset.addressDefault){if(!savedAddresses().some(a=>a.id===b.dataset.addressDefault))return;st.defaultAddressId=b.dataset.addressDefault;save();render();return}
if(b.dataset.addressChoose){pickSavedAddress(b.dataset.addressChoose,true);return}
if(b.hasAttribute('data-address-save')){
 const street=v('saved-street'),district=v('saved-district');
 if(street.length<6||district.length<2)return toast('Completa la dirección y el distrito');
 const id=addressEditId||'addr-'+Date.now()+'-'+Math.floor(Math.random()*10000);
 const entry={id,kind:v('saved-kind'),label:v('saved-label'),street,district,reference:v('saved-reference')};
 st.addresses=[...savedAddresses().filter(a=>a.id!==id),entry];
 if(!st.defaultAddressId||document.getElementById('saved-default')?.checked)st.defaultAddressId=id;
 addressEditId=null;save();screen('address');return;
}
if(b.hasAttribute('data-modal-save-delivery')){
 if(deliveryRequestPending)return;
 if(v('address').length<6||v('district').length<2)return toast('Completa la dirección y el distrito');
 if(!['PREPARED','SUBMITTING','PENDING','ACCEPTED'].includes(
    window.B3OrderAvailability?.readInteraction?.()?.status))resetDeliveryOrderContact();
 st.profile.address=v('address');st.profile.district=v('district');st.profile.reference=v('reference');if(st.mode==='delivery')invalidateDeliverySelection();maybeSaveDeliveryAddress();
 save();if(st.scheduleMode==='reservation'){screen('reservationPicker');return}if(st.mode==='delivery')void resolveDelivery();else render();return;
}
if(b.dataset.modalPickstore){void confirmStore('pickup',b.dataset.modalPickstore);return;}
if(b.hasAttribute('data-gps')){locationPromptDismissed=false;deliveryGpsRequested=fulfillmentModal==='delivery'||st.stage==='deliveryAddress'||(st.stage==='reservationPicker'&&st.mode==='delivery');if(window.AndroidBridge?.requestLocation)window.AndroidBridge.requestLocation();else if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>window.b3NativeLocation(p.coords.latitude,p.coords.longitude,null),()=>window.b3NativeLocation(null,null,'Permiso denegado o GPS desactivado'),{enableHighAccuracy:true,timeout:12000});else {deliveryGpsRequested=false;toast('GPS no disponible. Ingresa la dirección manualmente.')}return}if(b.hasAttribute('data-pickup-origin-save')){st.pickupOrigin=v('pickup-origin');st.coords=null;save();render();return}if(b.hasAttribute('data-clearsearch')){st.search='';render();return}if(b.hasAttribute('data-checkout-return')){returnToPersonalCheckout();return}
if(b.hasAttribute('data-checkout-leave')){nav('inicio');return}
if(b.hasAttribute('data-rejected-new-catalog')){
 if(window.B3OrderAvailability?.readInteraction?.()?.status!=='REJECTED')return;
 if(!beginNewCheckoutAfterRejection())return;
 nav('carta');return;
}
if(b.hasAttribute('data-checkout-cancel')){void cancelPersonalCheckout('CANCEL',deliveryAvailability.reason==='CANCEL_NOT_CONFIRMED');return}
if(b.dataset.tab){if(b.dataset.tab==='carta')st.search='';nav(b.dataset.tab);return}if(b.hasAttribute('data-marketing-first-later')){localStorage.setItem(MARKETING_PROMPT_KEY,'later');marketingPromptVisible=false;render();return}
if(b.hasAttribute('data-marketing-first-accept')){localStorage.setItem(MARKETING_PROMPT_KEY,'accepted');marketingPromptVisible=false;render();window.AndroidBridge?.setMarketingNotificationsEnabled?.(true);return}
if(b.hasAttribute('data-marketing-toggle')){if(window.AndroidBridge?.setMarketingNotificationsEnabled){window.AndroidBridge.setMarketingNotificationsEnabled(!window.AndroidBridge.marketingNotificationsEnabled());}else toast('Las notificaciones push solo están disponibles en Android.');return}
if(b.dataset.notificationOpen){openNotificationDetail(b.dataset.notificationOpen);return}
if(b.hasAttribute('data-notification-catalog')){nav('carta');return}
if(b.hasAttribute('data-notifications-refresh')){void fetchNotifications();return}
if(b.dataset.screen){
 if(b.dataset.screen==='chat'){openChatOverlay();return}
 if(activePersonalCheckout()&&['deliveryAddress','identity','phone','choice','locations'].includes(b.dataset.screen)){
  nav('inicio');toast('Tu solicitud sigue activa. Cancélala antes de modificar la compra.');return;
 }
 if(b.dataset.screen==='detail'&&!st.selected)return;
 if(b.dataset.screen==='identity'){
  if(activePersonalCheckout()){returnToPersonalCheckout();return}
  startCheckout();return
 }
 if(b.dataset.screen==='cart'){
  screen('cart');
  // Viewing the subtotal must never start a delivery availability consultation.
  if(st.mode==='pickup'&&st.store&&st.pickupScheduleSelected)void revalidateCheckout('cart');
  return;
 }
 if(checkoutPending&&!['choice','locations','deliveryAddress'].includes(b.dataset.screen))checkoutPending=false;
 screen(b.dataset.screen);return;
}
if(b.hasAttribute('data-guest')){if(st.authProvider==='google')window.AndroidBridge?.signOutGoogle?.();st.registered=false;st.authProvider='guest';st.authUid='';st.authDisplayName='';st.authGoogleEmail='';save();enterApp();return}
if(b.dataset.scheduleChoice){
 const choice=b.dataset.scheduleChoice;
 if(choice==='reservation'){
   if(activePersonalCheckout()||['PREPARED','SUBMITTING','PENDING','ACCEPTED'].includes(window.B3OrderAvailability?.readInteraction?.()?.status))return toast('Finaliza o cancela tu solicitud activa antes de programar una reserva.');
   ++deliveryValidationGeneration;deliveryRequestPending=false;resetReservationQuote();st.scheduleMode='reservation';if(st.mode==='pickup')st.pickupScheduleSelected=true;save();screen('reservationPicker');return}
 if(choice==='now'){resetReservationQuote();st.scheduleMode='now';st.reservationAt='';if(st.mode==='pickup')st.pickupScheduleSelected=true;save();
   if(scheduleReturnToModal){scheduleReturnToModal=false;st.stage='app';st.tab='inicio';fulfillmentModal=st.mode;render();if(st.mode==='pickup'&&API_BASE)void fetchConfig();return}
   if(st.mode==='delivery')screen('deliveryAddress');
   else {screen('locations');if(API_BASE)void fetchConfig()}
   return}
}
if(b.hasAttribute('data-reservation-address')){
 reservationAddressEditing=!reservationAddressEditing;
 render();return;
}
if(b.hasAttribute('data-reservation-address-save')){
 const address=v('b3-reservation-address'),district=v('b3-reservation-district'),reference=v('b3-reservation-reference');
 if(address.trim().length<6||district.trim().length<2)return toast('Ingresa una dirección completa y el distrito.');
 st.profile.address=address.trim();st.profile.district=district.trim();st.profile.reference=reference.trim();
 if(deliveryLocation?.source!=='gps'||deliveryLocation.key!==deliveryAddressKey(st.profile.address,st.profile.district))deliveryLocation=null;reservationQuote=null;st.store='';st.pay='';
 reservationQuoteError='';reservationQuoteBusy=false;++reservationQuoteGeneration;reservationAddressEditing=false;save();render();autoCheckReservationQuote();return;
}
if(b.dataset.reservationPay){
 if(!reservationQuote||!reservationQuote.paymentMethods.includes(b.dataset.reservationPay)||
    !paymentOptions().some(x=>x[0]===b.dataset.reservationPay))return toast('Método no habilitado para esta sede.');
 st.pay=b.dataset.reservationPay;save();render();return;
}
if(b.dataset.reservationCashMode){
 st.reservationCashExact=b.dataset.reservationCashMode==='exact';
 if(st.reservationCashExact)st.reservationCashAmount='';
 save();render();return;
}
if(b.hasAttribute('data-reservation-verify')){
 st.reservationAt=document.getElementById('b3-reservation-at')?.value||st.reservationAt;
 if(!st.reservationCashExact)
  st.reservationCashAmount=document.getElementById('b3-reservation-cash-amount')?.value||st.reservationCashAmount;
 save();
 if(st.mode==='delivery'){
  if(!reservationQuote||reservationQuote.dateTime!==st.reservationAt||reservationQuote.mode!=='delivery')return toast('Consulta primero la disponibilidad de tu reserva.');
  const when=window.B3ReservationForms.schedule(st.reservationAt);
  if(when.from<=Date.now())return toast('Selecciona una fecha y hora futuras.');
 }else if(st.mode!=='pickup'){const preview=reservationFormPreview();if(!preview.form)return toast(preview.error||'No se pudo preparar esta reserva.');}
 if(st.mode==='pickup'){
  const when=window.B3ReservationForms.schedule(st.reservationAt);
  if(when.from<=Date.now())return toast('Selecciona una fecha y hora futuras.');
  const selected=shops.find(x=>String(x.id)===String(st.store));
  if(reservationQuoteBusy)return toast('Espera mientras verificamos la disponibilidad de la reserva.');
  if(!reservationQuote||reservationQuote.dateTime!==st.reservationAt||reservationQuote.mode!=='pickup'||
     reservationQuote.storeId!==st.store||reservationQuote.agentAvailable!==true||
     reservationQuote.acceptingRequests!==true)return toast('Primero confirma la disponibilidad de tu recojo programado.');
  if(!selected||selected.active!==true||selected.reservation_enabled!==true||
     selected.pickup_enabled!==true||selected.reservationAcceptingRequests!==true)
   return toast('La tienda ya no está habilitada para recojo programado. Vuelve a consultar.');
  const lead=reservationMinLead(selected);
  if(lead!==null&&when.from<Date.now()+lead*60000)return toast('El horario no cumple la anticipación mínima publicada.');
  if(!Array.isArray(reservationQuote.paymentMethods)||!reservationQuote.paymentMethods.length)
   return toast('La tienda no tiene métodos de pago habilitados para esta reserva.');
  checkoutPending=true;screen('identity');return;
 }
 resetDeliveryOrderContact();checkoutPending=true;confirmedDeliveryReviewKey=null;screen('identity');
 return;
}
if(b.dataset.mode){if(activePersonalCheckout()){returnToPersonalCheckout();return}if(st.mode!==b.dataset.mode){st.pickupScheduleSelected=false;deliveryValidationGeneration++;deliveryRequestPending=false;window.B3OrderAvailability?.clear();st.store='';st.quote=null;clearDeliveryAvailability();st.pay='';st.coords=null;if(st.cart.length)queueNotice('Modalidad modificada. Verifica productos, importes y pagos.')}st.mode=b.dataset.mode;scheduleReturnToModal=false;save();screen('scheduleChoice');return}
if(b.dataset.store){if(st.mode==='pickup'&&!st.pickupScheduleSelected){checkoutPending=true;screen('scheduleChoice');return}void confirmStore('pickup',b.dataset.store,{showDetails:!checkoutPending});return}if(b.dataset.pickstore){if(st.mode==='pickup'&&!st.pickupScheduleSelected){checkoutPending=true;screen('scheduleChoice');return}void confirmStore('pickup',b.dataset.pickstore,{showDetails:!checkoutPending});return}
if(b.dataset.fulfillment){st.fulfillment=b.dataset.fulfillment;render();return}
if(b.hasAttribute('data-start')){
 if(st.stage==='localDetail'&&st.mode==='pickup'){if(!st.pickupScheduleSelected){checkoutPending=true;screen('scheduleChoice');return}void confirmStore('pickup',st.store);return}
 if(st.selected&&product(st.selected)){screen('detail');return}
 nav('carta');return;
}
if(b.dataset.product||b.dataset.quick){
 const requested=b.dataset.product||b.dataset.quick;
 const selectedProduct=product(requested);
 if(!selectedProduct||promotionNotPurchasable(selectedProduct))return toast('Este producto no está disponible en la carta actual.');
 st.selected=requested;st.qty=1;
 // Browsing a product must never require delivery coverage or a pickup location.
 screen('detail');return;
}
if(b.dataset.qty){st.qty=Math.max(1,Math.min(30,st.qty+Number(b.dataset.qty)));render();return}
if(b.hasAttribute('data-add')){
 if(promotionValidationBusy)return;
 const requested=st.selected,selected=product(requested);
 const photo=root.querySelector('.detail-photo img'),source=photo||b,r=source.getBoundingClientRect();
 const fromRect={left:r.left,top:r.top,width:r.width,height:r.height},imageSrc=photo?.currentSrc||photo?.src||'',qty=st.qty;
 if(selected?.isPublished&&categoryMatches(selected,'Promociones')){
  promotionValidationBusy=true;b.disabled=true;
  try{
   if(!await validatePromotionFromApi(selected)){
    toast('Esta promoción ya no está activa o está fuera de fecha u horario.');
    render();return;
   }
   if(st.selected!==requested)return;
  }finally{promotionValidationBusy=false;b.disabled=false}
 }
 if(addToCart(requested,qty)){nav('carta');animateAddedProduct(fromRect,imageSrc,qty)}
 else toast('Esta promoción o producto ya no está disponible.');
 return;
}
if(b.dataset.filter){st.category=b.dataset.filter;render();return}
if(b.dataset.carousel!==undefined){carouselMotion.pauseUntil=Date.now()+6000;animateCarousel('hero',Number(b.dataset.carousel));return}if(b.dataset.promo!==undefined){carouselMotion.pauseUntil=Date.now()+6000;animateCarousel('promo',Number(b.dataset.promo));return}if(b.dataset.local!==undefined){st.local=Number(b.dataset.local);render();return}
if(b.dataset.cartdelta){let [id,delta]=b.dataset.cartdelta.split('|');const draft=!!activePersonalCheckout(),items=draft?nextCartDraft():st.cart;let c=items.find(x=>x.id===id);if(c){c.qty=Math.min(99,c.qty+Number(delta));const next=items.filter(x=>x.qty>0);if(draft)saveNextCartDraft(next);else{st.cart=next;invalidateDeliverySelection();save()}render()}return}
if(b.dataset.remove){if(activePersonalCheckout())saveNextCartDraft(nextCartDraft().filter(x=>x.id!==b.dataset.remove));else{st.cart=st.cart.filter(x=>x.id!==b.dataset.remove);invalidateDeliverySelection();save()}render();return}
if(b.hasAttribute('data-prepay-payment')){
 if(!deliveryQuoteValid()||window.B3OrderAvailability?.readInteraction?.()?.status!=='ACCEPTED')
  return toast('Primero necesitamos la aceptación del local y una cotización vigente.');
 st.pay='';save();screen('payment');return;
}
if(b.hasAttribute('data-prepay-add')){void cancelApprovedForCartChange();return}
if(b.hasAttribute('data-prepay-cancel')){void cancelPersonalCheckout('CANCEL');return}
if(b.hasAttribute('data-prepay-retry')){screen('availability');void resolveDelivery();return}
if(b.hasAttribute('data-availability-continue')){
 if(deliveryRequestPending||deliveryAvailability.status!=='READY'||!deliveryQuoteValid())return toast('Primero necesitamos confirmar una sede disponible.');
 if(checkoutPending){checkoutPending=false;screen('identity')}else screen('cart');return;
}
if(b.hasAttribute('data-quote-retry')){
 const entry=window.B3OrderAvailability?.readInteraction?.();
 if(st.stage==='availability'&&entry?.status==='ACCEPTED'&&
    entry.agentDecision==='ACCEPTED'&&
    (!entry.body?.customer||entry.messageDelivered===true)&&!agentDecisionPolling){
  acceptedQuotePaused=false;acceptedQuoteFailures=0;
  deliveryAvailability={status:'CHECKING_STORES',storeName:deliveryAvailability.storeName,
   candidateNames:[],message:'Conservamos tu aceptación. Reintentando solamente la tarifa de delivery.'};
  render();
  scheduleAgentDecisionPoll(100);
 }
 return;
}
if(b.hasAttribute('data-change-fulfillment')){
 if(deliveryRequestPending||activePersonalCheckout())return;
 openAlternateFulfillment(deliveryAvailability.message);
 return;
}
if(b.hasAttribute('data-availability-pickup')){
  if(deliveryRequestPending||activePersonalCheckout()||
    !['UNAVAILABLE','CANCELLED'].includes(deliveryAvailability.status))return;
  ++deliveryValidationGeneration;
  st.mode='pickup';st.quote=null;st.store='';st.pay='';st.cash='';
  deliveryRequestError='';checkoutPending=false;clearDeliveryAvailability();save();
  screen('locations');if(API_BASE)void fetchConfig();return;
 }
 if(b.hasAttribute('data-availability-retry')){
  if(!deliveryRequestPending&&['ERROR','UNAVAILABLE'].includes(deliveryAvailability.status)&&
     !activePersonalCheckout()&&window.B3OrderAvailability?.readInteraction?.()?.status!=='REJECTED'){
   if(!['PREPARED','SUBMITTING','PENDING','ACCEPTED'].includes(
      window.B3OrderAvailability?.readInteraction?.()?.status))resetDeliveryOrderContact();
   void resolveDelivery();
  }
  return;
 }
if(b.hasAttribute('data-delivery-stop-check')){
 if(activePersonalCheckout())return toast('La solicitud ya fue enviada. Puedes consultar su estado sin duplicarla.');
 ++deliveryValidationGeneration;deliveryRequestPending=false;deliveryValidationStep='DETENIDO';
 deliveryRequestError='Consulta detenida. Revisa tu dirección y vuelve a intentarlo cuando quieras.';
 screen('deliveryAddress');return;
}
if(b.hasAttribute('data-address-next')){if(deliveryRequestPending)return;if(v('address').length<6||v('district').length<2)return toast('Completa tu dirección y distrito');if(!['PREPARED','SUBMITTING','PENDING','ACCEPTED'].includes(window.B3OrderAvailability?.readInteraction?.()?.status))resetDeliveryOrderContact();st.profile.address=v('address');st.profile.district=v('district');st.profile.reference=v('reference');if(st.mode==='delivery')invalidateDeliverySelection();maybeSaveDeliveryAddress();save();if(st.scheduleMode==='reservation'){screen('reservationPicker');return}if(st.mode==='delivery')void resolveDelivery();else render();return}
if(b.hasAttribute('data-identity-next')){
 if(v('first').length<2||v('last').length<2||v('first').length>60||v('last').length>60)
  return toast('Ingresa nombres y apellidos de hasta 60 caracteres');
 if(st.mode==='delivery'){
  const p=currentDeliveryOrderContact();
  p.first=v('first');p.last=v('last');p.doc=v('doc');
  st.deliveryContactConfirmed=false;
 }else{
  st.profile.first=v('first');st.profile.last=v('last');st.profile.doc=v('doc');
 }
 save();screen('phone');return;
}
if(b.dataset.reviewEdit){
 if(activePersonalCheckout())returnToPersonalCheckout();
 else{confirmedDeliveryReviewKey=null;screen(b.dataset.reviewEdit)}
 return;
}
if(b.hasAttribute('data-review-confirm')){
 if(activePersonalCheckout())returnToPersonalCheckout();
 else if(!deliveryContactReady()||!st.profile.address||!st.profile.district)
  toast('Revisa primero los datos de contacto y de entrega.');
 else {
  confirmedDeliveryReviewKey=deliveryReviewKey();
  void resolveDelivery();
 }
 return;
}
if(b.hasAttribute('data-phone-next')){
 if(!/^9\d{8}$/.test(v('phone')))return toast('Ingresa un celular peruano válido de 9 dígitos');
 if(st.mode==='delivery'){
  currentDeliveryOrderContact().phone=v('phone');
  st.deliveryContactConfirmed=true;
 }else st.profile.phone=v('phone');
 save();
 if(st.mode==='delivery'){
  if(!st.profile.address||!st.profile.district){screen('deliveryAddress');return}
  confirmedDeliveryReviewKey=null;
  screen('confirmDetails');return
 }
 // Pickup cannot enter payments before a real interaction FORM and verified agent acceptance.
 // Fail closed until the dedicated pickup request contract is available.
 checkoutPending=false;
 void submitPickupRequest();return}
if(b.hasAttribute('data-payment-start')){if(st.mode==='pickup'&&!pickupPaymentReady())return toast('Primero espera la aceptación del recojo.');if(!paymentOptions().some(x=>x[0]===st.pay))return toast('Elige un método habilitado');if(st.pay==='cash'){st.cash='';paymentFormError='';screen('paymentProofPreview');return}if(!paymentImageUrl(st.pay))return toast('No hay imagen de pago configurada');screen('paymentInstructions');return}
if(b.hasAttribute('data-payment-done')){if(isPaymentFormReady()){paymentFormError='';receiptFileSelected=false;if(receiptPreviewUrl)URL.revokeObjectURL(receiptPreviewUrl);receiptPreviewUrl='';screen('paymentProofPreview')}return}
if(b.hasAttribute('data-cash-exact')){st.cash=orderTotal().toFixed(2);save();render();return}
if(b.hasAttribute('data-payment-confirm')){if(st.pay==='cash'){const raw=v('b3-cash-amount');if(!/^\d+(?:\.\d{1,2})?$/.test(raw)||Number(raw)<orderTotal())return toast('Ingresa un monto válido igual o mayor al total');st.cash=raw;save();}void submitPaymentForm();return}
if(b.hasAttribute('data-payment-save-image')){const url=paymentImageUrl(st.pay);if(url&&window.AndroidBridge?.downloadPaymentImage)window.AndroidBridge.downloadPaymentImage(url);else toast('La descarga de imágenes requiere una actualización de Android');return}
if(b.dataset.pay){
 const method=b.dataset.pay;
 if(!paymentOptions().some(x=>x[0]===method))return toast('Método no habilitado');
 const accepted=pickupPaymentReady()||st.mode==='delivery'&&st.quote?.quoteOrigin==='ANDROID_CATALOG_ACCEPTED';
 if(accepted&&st.mode==='delivery'&&(!deliveryQuoteValid()||
    window.B3OrderAvailability?.readInteraction?.()?.status!=='ACCEPTED'))
  return toast('La aceptación y la cotización deben estar vigentes.');
 st.pay=method;checkoutReviewNote='';save();
 if(accepted&&method!=='cash'){
  if(!paymentImageUrl(method)){render();toast('La sede no ha publicado la imagen de pago. Selecciona otro método.');return}
  screen('paymentInstructions');return;
 }
 render();return;
}
if(b.hasAttribute('data-pay-next')){
 if(checkoutRefreshPending)return;
 if(!paymentOptions().some(x=>x[0]===st.pay))return toast('Elige un método de pago habilitado');
 if(st.mode==='pickup'){if(!pickupPaymentReady())return toast('La tienda todavía no confirmó el recojo.');if(st.pay==='cash'){st.cash='';screen('paymentProofPreview');return;}if(!paymentImageUrl(st.pay))return toast('La sede no publicó imagen de pago.');screen('paymentInstructions');return;}
 if(['yape','plin','card'].includes(st.pay)){
  const entry=window.B3OrderAvailability?.readInteraction?.();
  if((st.mode!=='delivery'||st.quote?.quoteOrigin!=='ANDROID_CATALOG_ACCEPTED'||!deliveryQuoteValid()||entry?.status!=='ACCEPTED')&&!pickupPaymentReady())
   return toast('Primero la tienda debe aceptar tu pedido antes de mostrar el pago.');
  if(!paymentImageUrl(st.pay))return toast('La sede no ha publicado una imagen de pago para este método.');
  screen('paymentInstructions');return;
 }
 if(st.mode==='delivery'&&st.quote?.quoteOrigin==='ANDROID_CATALOG_ACCEPTED'){
  if(window.B3OrderAvailability?.readInteraction?.()?.status!=='ACCEPTED'||!deliveryQuoteValid())return toast('La aceptación de la tienda debe estar vigente.');
  screen('paymentProofPreview');return;
 }
 if(st.pay==='cash')st.cash=v('cash');
 save();void revalidateCheckout('summary');return;
}
if(b.hasAttribute('data-confirm')){toast('Este recorrido no confirma pedidos. Inicia una solicitud con la sede.');screen('cart');return}
if(b.hasAttribute('data-google-login')){if(googleSignInPending)return;if(!window.AndroidBridge?.signInWithGoogle){toast('El acceso con Google requiere actualizar Android.');return}googleSignInPending=true;render();window.AndroidBridge.signInWithGoogle();return}

if(b.hasAttribute('data-phone-continue')){const phone=v('signin-value');if(!/^9\d{8}$/.test(phone))return toast('Ingresa un celular peruano válido de 9 dígitos');if(st.authProvider==='google')window.AndroidBridge?.signOutGoogle?.();st.registered=true;st.authProvider='local-phone';st.authUid='';st.authDisplayName='';st.authGoogleEmail='';st.profile.phone=phone;save();enterApp();return}
if(b.hasAttribute('data-logout')){if(st.authProvider==='google'){window.AndroidBridge?.signOutGoogle?.();return}st.registered=false;st.authProvider='';st.authUid='';save();render();return}
if(b.dataset.openmaps){if(window.AndroidBridge?.openMaps)window.AndroidBridge.openMaps(b.dataset.openmaps);else window.open(b.dataset.openmaps,'_blank');return}
if(b.hasAttribute('data-clear')){
 void confirmB3({title:'¿Eliminar datos locales?',
  description:'Se eliminarán los datos de esta aplicación guardados en este teléfono, incluidos perfil, direcciones y registros locales.',
  confirmLabel:'Eliminar datos locales',danger:true}).then(yes=>{
   if(yes){localStorage.removeItem(K);location.reload()}
  });
 return;
}
});
root.addEventListener('change',e=>{
 if(e.target?.id==='b3-reservation-at'){st.reservationAt=e.target.value;reservationQuote=null;reservationQuoteBusy=false;reservationQuoteError='';st.store='';st.pay='';++reservationQuoteGeneration;save();render();autoCheckReservationQuote();return}
 if(e.target?.id==='b3-reservation-cash-amount'){st.reservationCashAmount=e.target.value;save();render();return}
 if(e.target?.id!=='b3-payment-proof')return;const file=e.target.files?.[0];if(receiptPreviewUrl)URL.revokeObjectURL(receiptPreviewUrl);receiptPreviewUrl='';receiptFileSelected=false;if(!file)return;if(!['image/jpeg','image/png'].includes(file.type)||file.size>4*1024*1024||file.size===0){toast('Elige una imagen JPG o PNG de hasta 4 MB');render();return}receiptFileSelected=true;receiptPreviewUrl=URL.createObjectURL(file);render()});
document.addEventListener('keydown',e=>{
 if(e.key!=='Escape')return;
 if(b3ConfirmDismiss){e.preventDefault();b3ConfirmDismiss();return}
 if(chatOverlay){e.preventDefault();closeChatOverlay()}
});
root.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&(e.target.matches('.hero-card[role=button],.promo-card[role=button]'))){e.preventDefault();e.target.click()}});
root.addEventListener('submit',e=>{if(e.target.id==='home-search-form'){e.preventDefault();st.search=(document.getElementById('home-search-field')?.value||'').trim().slice(0,60);st.category='Todos';nav('carta');return}if(e.target.id==='chat-form'){e.preventDefault();toast('El chat se habilitará después de confirmar el pago.')}});
root.addEventListener('input',e=>{if(e.target.id==='address'||e.target.id==='district'){
 deliveryGpsPending=false; // Do not overwrite customer edits with a delayed GPS reverse-geocoding callback.
 const correctingGpsDistrict=e.target.id==='district'&&deliveryLocation?.source==='gps'&&
  String(document.getElementById('address')?.value||'').trim()===st.profile.address;
 if(correctingGpsDistrict){
  st.profile.district=e.target.value.trim();
  deliveryLocation.key=deliveryAddressKey(st.profile.address,st.profile.district);
  deliveryGpsMessage='Distrito corregido. Conservamos el punto GPS elegido para esta misma dirección.';
 }else{
  deliveryLocation=null;invalidateDeliverySelection();
  deliveryGpsMessage='Dirección editada: se volverá a verificar su ubicación antes de calcular el reparto.';
 }
 deliveryRequestError='';const warning=root.querySelector('[role="alert"]');if(warning)warning.remove()
}if(e.target.id==='cash'){st.cash=e.target.value;let change=document.getElementById('change');if(change)change.textContent=Number(st.cash)>=orderTotal()?`Vuelto referencial: ${cash(Number(st.cash)-orderTotal())}`:'Ingresa un monto igual o mayor al total';}});

/* Carruseles B3: animación física horizontal, gestos táctiles y autoplay sin reconstruir Inicio.
   Solo se desplazan tarjetas visuales; selección de productos y checkout siguen intactos. */
const carouselMotion={active:null,touch:null,pauseUntil:0,suppressClickUntil:0};
const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
function carouselCount(kind){
 return kind==='hero'?Math.min(products.length,4):kind==='local'?shops.filter(s=>s.active!==false).length:
  0;
}
function updateCarouselDots(kind){
 const section=root.querySelector(kind==='hero'?'.hero-carousel':kind==='local'?'.b3-home-stores':'.promos');
 const key=kind==='hero'?'carousel':kind==='local'?'local':'promo',len=carouselCount(kind);
 if(!section||!len)return;
 section.querySelectorAll('.dots button').forEach((b,i)=>{
  const active=i===st[key]%len;b.classList.toggle('on',active);
  b.setAttribute('aria-pressed',String(active));
 });
}
function prepareCarouselMotion(kind,target,direction){
 if(st.stage!=='app'||st.tab!=='inicio'||fulfillmentModal||selectedHomeStore||carouselMotion.active)return null;
 const len=carouselCount(kind),key=kind==='hero'?'carousel':kind==='local'?'local':'promo';
 if(len<2)return null;
 const from=((st[key]%len)+len)%len,to=((target%len)+len)%len;
 if(to===from)return null;
 const selector=kind==='hero'?'.hero-carousel .hero-card':kind==='local'?'.b3-home-stores .b3-home-store-card':'.promos .promo-card';
 const current=root.querySelector(selector);
 if(!current)return null;
 const width=current.getBoundingClientRect().width,height=current.getBoundingClientRect().height;
 if(width<20||height<20)return null;
 st[key]=to;
 let next;
 try{const scratch=document.createElement('div');scratch.innerHTML=home();next=scratch.querySelector(selector);}
 finally{st[key]=from;}
 if(!next)return null;
 const stage=document.createElement('div');
 stage.className='b3-carousel-motion '+(kind==='hero'?'b3-motion-hero':kind==='local'?'b3-motion-local':'b3-motion-promo');
 stage.style.height=height+'px';
 current.replaceWith(stage);
 stage.append(current,next);
 const motion={stage,current,next,width,direction:direction<0?-1:1,key,to,kind,done:false};
 carouselMotion.active=motion;
 moveCarousel(motion,0);
 return motion;
}
function moveCarousel(m,dx){
 m.current.style.transform='translate3d('+Math.round(dx)+'px,0,0) scale('+(1-Math.min(Math.abs(dx)/m.width,.9)*.035)+')';
 m.next.style.transform='translate3d('+Math.round(dx+m.direction*m.width)+'px,0,0) scale(.985)';
 m.current.style.opacity=String(1-Math.min(Math.abs(dx)/m.width,.9)*.22);
}
function completeCarouselMotion(m,accepted){
 if(!m||m.done)return;
 m.done=true;
 if(accepted){
  st[m.key]=m.to;updateCarouselDots(m.kind);
 }
 const finish=()=>{
  if(carouselMotion.active!==m)return;
  m.current.style.cssText='';m.next.style.cssText='';
  if(m.stage.isConnected)m.stage.replaceWith(accepted?m.next:m.current);
  carouselMotion.active=null;
 };
 if(!m.stage.isConnected){finish();return;}
 if(reducedMotion()){finish();return;}
 m.current.style.transition='transform 390ms cubic-bezier(.2,.82,.22,1), opacity 390ms ease';
 m.next.style.transition='transform 390ms cubic-bezier(.2,.82,.22,1), opacity 390ms ease';
 m.current.style.willChange='transform,opacity';
 m.next.style.willChange='transform,opacity';
 requestAnimationFrame(()=>{
  if(!m.stage.isConnected){finish();return;}
  moveCarousel(m,accepted?-m.direction*m.width:0);
  m.next.style.opacity=accepted?'1':'.78';
 });
 setTimeout(finish,460);
}
function animateCarousel(kind,index,direction,automatic=false){
 const len=carouselCount(kind);if(len<2||carouselMotion.active)return;
 const key=kind==='hero'?'carousel':kind==='local'?'local':'promo';
 const from=((st[key]%len)+len)%len,to=((index%len)+len)%len;
 if(from===to)return;
 const dir=direction||((to-from+len)%len <=len/2?1:-1);
 const motion=prepareCarouselMotion(kind,to,dir);
 if(!motion)return;
 if(!automatic||reducedMotion()){completeCarouselMotion(motion,true);return;}
 // Autoplay recrea el arrastre táctil real con la misma función de movimiento.
 // Después usa exactamente la misma animación de soltado que el dedo.
 const start=performance.now(),dragDuration=180,dragFraction=.48;
 function dragFrame(now){
  if(carouselMotion.active!==motion||!motion.stage.isConnected)return;
  const progress=Math.min(1,(now-start)/dragDuration);
  moveCarousel(motion,-motion.direction*motion.width*dragFraction*progress);
  if(progress<1)requestAnimationFrame(dragFrame);
  else completeCarouselMotion(motion,true);
 }
 requestAnimationFrame(dragFrame);
}
root.addEventListener('click',e=>{
 if(Date.now()<carouselMotion.suppressClickUntil&&e.target.closest('.hero-carousel,.promos,.b3-home-stores')){
  e.preventDefault();e.stopImmediatePropagation();
 }
},true);
root.addEventListener('touchstart',e=>{
 const el=e.target.closest('.hero-carousel .hero-card,.promos .promo-card,.b3-home-stores .b3-home-store-card');
 if(!el||e.touches.length!==1||e.target.closest('[data-quick]'))return;
 const kind=el.classList.contains('hero-card')?'hero':el.classList.contains('b3-home-store-card')?'local':'promo';
 if(carouselCount(kind)<2||carouselMotion.active)return;
 carouselMotion.touch={kind,startX:e.touches[0].clientX,startY:e.touches[0].clientY,dx:0,motion:null};
}, {passive:true});
root.addEventListener('touchmove',e=>{
 const t=carouselMotion.touch;if(!t||e.touches.length!==1)return;
 const dx=e.touches[0].clientX-t.startX,dy=e.touches[0].clientY-t.startY;
 if(!t.motion&&Math.abs(dx)<10)return;
 if(!t.motion&&Math.abs(dy)>Math.abs(dx)*.9){carouselMotion.touch=null;return}
 if(e.cancelable)e.preventDefault();
 if(!t.motion){
  const len=carouselCount(t.kind),key=t.kind==='hero'?'carousel':kind==='local'?'local':'promo';
  const direction=dx<0?1:-1;
  t.motion=prepareCarouselMotion(t.kind,(st[key]+direction+len)%len,direction);
  if(!t.motion){carouselMotion.touch=null;return}
 }
 t.dx=Math.max(-t.motion.width*.92,Math.min(t.motion.width*.92,dx));
 moveCarousel(t.motion,t.dx);
}, {passive:false});
function finishCarouselTouch(cancelled){
 const t=carouselMotion.touch;carouselMotion.touch=null;
 if(!t?.motion)return;
 const threshold=Math.max(42,Math.min(76,t.motion.width*.17));
 const accepted=!cancelled&&Math.abs(t.dx)>=threshold&&Math.sign(t.dx)===-t.motion.direction;
 carouselMotion.suppressClickUntil=Date.now()+450;
 carouselMotion.pauseUntil=Date.now()+6500;
 completeCarouselMotion(t.motion,accepted);
}
root.addEventListener('touchend',()=>finishCarouselTouch(false),{passive:true});
root.addEventListener('touchcancel',()=>finishCarouselTouch(true),{passive:true});
let autoplayTick=0;
setInterval(()=>{
 if(st.stage!=='app'||st.tab!=='inicio'||document.hidden||fulfillmentModal||selectedHomeStore||
    carouselMotion.active||carouselMotion.touch||Date.now()<carouselMotion.pauseUntil)return;
 autoplayTick++;
 if(autoplayTick%5!==0)return;
 // Los dos carruseles se desplazan en secuencia corta y no reinician toda Inicio.
 const heroCount=carouselCount('hero');
 if(heroCount>1)animateCarousel('hero',(st.carousel+1)%heroCount,1,true);
 setTimeout(()=>{
  if(st.stage!=='app'||st.tab!=='inicio'||document.hidden||fulfillmentModal||selectedHomeStore||
     carouselMotion.active||carouselMotion.touch||Date.now()<carouselMotion.pauseUntil)return;
  const promoCount=carouselCount('promo');
  if(promoCount>1)animateCarousel('promo',(st.promo+1)%promoCount,1,true);
 },750);
 setTimeout(()=>{
  if(st.stage!=='app'||st.tab!=='inicio'||document.hidden||fulfillmentModal||selectedHomeStore||carouselMotion.active||carouselMotion.touch||Date.now()<carouselMotion.pauseUntil)return;
  const count=carouselCount('local');if(count>1)animateCarousel('local',(st.local+1)%count,1,true);
 },1550);
},1000);
// Android App Link /abrir: keep the current single-page navigation, do not require sign-in.
window.b3MarketingStatus=(enabled,message)=>{if(enabled)localStorage.setItem(MARKETING_PROMPT_KEY,'enabled');if(st.stage==='notifications'){render();if(message)toast(message)}else if(message&&st.stage==='app')toast(message)};
window.b3OpenNotifications=(id)=>{openPushNotification(id)};
window.b3PersonalPushToken=(token)=>{
 const entry=window.B3OrderAvailability?.readInteraction?.();
 if(!entry?.interactionId||!['PENDING','SUBMITTING','ACCEPTED'].includes(entry.status))return;
 void window.B3OrderAvailability.registerPersonalDevice(entry,token).catch(()=>{
  // Push is optional; the authorized interaction remains available in-app.
 });
};
window.b3OpenPersonalOrderNotification=(id)=>{
 const entry=window.B3OrderAvailability?.readInteraction?.();
 if(!entry||entry.interactionId!==id)return;
 // The clock is owned by Android and already persisted for this interaction.
 // Opening a push must never ask the Administrator to initiate/check that clock.
 if(entry.paymentExpiresAt&&Date.parse(entry.paymentExpiresAt)<=Date.now()&&!entry.paymentConfirmation){
  showLocalPaymentExpiry(entry);
 }else returnToPersonalCheckout();
};
window.b3OpenFromLink=()=>{
  reviewSheetOrderId=null;
  favoritePromptOrderId=null;
  deliveredNoticeOrderId=null;
  loginFromAccount=false;
  nav('inicio');
};
window.handleB3Back=()=>{
  if(b3ConfirmDismiss){b3ConfirmDismiss();return true}
  if(chatOverlay){closeChatOverlay();return true}
  if(marketingPromptVisible){localStorage.setItem(MARKETING_PROMPT_KEY,'later');marketingPromptVisible=false;render();return true}
  if(locationSettingsModal){locationPromptDismissed=true;deliveryGpsRequested=false;locationSettingsModal.remove();locationSettingsModal=null;return true}
  if(fulfillmentModal){checkoutPending=false;fulfillmentModal=null;render();return true}
  if(st.stage==='app'){
    if(st.tab!=='inicio'){nav('inicio');return true}
    return false; // Native Activity exits; never navigate to splash.
  }
  if(st.stage==='splash')return false;
  if(st.stage==='availability'&&window.B3OrderAvailability?.readInteraction?.()?.status==='REJECTED'){
    nav('inicio');return true;
  }
  if(['availability','prepaymentReview','payment','paymentInstructions','paymentProofPreview','paymentWaiting','summary'].includes(st.stage)&&activePersonalCheckout()){
    nav('inicio');return true;
  }
  if(st.stage==='login'){
    if(loginFromAccount){loginFromAccount=false;nav('cuenta');return true}
    return false; // First launch login: close app on Back, not splash.
  }
  if(st.stage.startsWith('signin-')){screen('login');return true}
  if(checkoutPending)checkoutPending=false;
  const previous={confirmDetails:'phone',availability:'deliveryAddress',notificationDetail:'notifications',orderDetail:'app',addressEdit:'address',deliveryAddress:'choice',address:'app',jobs:'app',vacancyDetail:'jobs',choice:'app',locations:'choice',localDetail:'locations',address:'choice',detail:'app',cart:'app',identity:'cart',phone:'identity',payment:'phone',summary:'payment',chat:'app',about:'app',success:'app'};
  screen(previous[st.stage]||'app');return true
};
// Keep image warmup bounded: WebView's HTTP cache handles subsequent requests.
// Prefetching every store's payment artwork can waste mobile data and memory.
function preloadPublishedPaymentImages(){
 if(!API_BASE||typeof Image==='undefined')return Promise.resolve();
 const urls=new Set();
 function addPath(path){
  if(typeof path==='string'&&path.startsWith('/api/v1/mobile/images/')&&
     !path.includes('..')&&!/[?#]/.test(path))urls.add(API_BASE+path);
 }
 for(const method of ['yape','plin','card'])addPath(publishedPaymentImages[method]);
 const selected=shops.find(store=>String(store.id)===String(st.store));
 if(selected)for(const method of ['yape','plin','card']){
  addPath(selected.paymentOptions?.[st.mode]?.find(x=>x?.method===method)?.imageUrl);
 }
 return Promise.all([...urls].slice(0,6).map(url=>new Promise(resolve=>{
  if(prefetchedPaymentImages.has(url)){resolve();return}
  const image=new Image();
  image.onload=()=>{if(prefetchedPaymentImages.size>=24)prefetchedPaymentImages.clear();prefetchedPaymentImages.add(url);resolve()};
  image.onerror=()=>resolve();
  image.src=url;
 })));
}
async function preloadInitialCatalogImages(){
 // Prioritize visible catalog artwork; leave the rest to native lazy loading.
 const sources=[...new Set(products.slice(0,2).map(p=>photo(p)).filter(Boolean))];
 if(!sources.length||typeof Image==='undefined')return;
 await Promise.race([Promise.all(sources.map(src=>new Promise(resolve=>{
  const image=new Image();image.onload=resolve;image.onerror=resolve;image.src=src;if(image.complete)resolve();
 }))),new Promise(resolve=>setTimeout(resolve,900))]);
}
async function initializeCatalogAtSplash(){
 if(splashRequestPending||st.stage!=='splash')return;
 splashRequestPending=true;splashLoadError=false;render();
 const started=Date.now();
 try{
  await fetchConfig({strict:true});
  // Start payment image fetch during splash. Slow images never block the storefront.
  void preloadPublishedPaymentImages().catch(error=>console.warn('Payment image prefetch',error?.message||'error'));
  await Promise.all([preloadInitialCatalogImages(),new Promise(resolve=>setTimeout(resolve,Math.max(0,700-(Date.now()-started))))]);
  if(st.stage==='splash')screen(enteredBefore?'app':'login');
 }catch(error){
  splashLoadError=true;
  console.warn('Initial catalog unavailable',error?.message||'error');
  if(st.stage==='splash')render();
 }finally{splashRequestPending=false}
}
render();
window.AndroidBridge?.requestGoogleAuthState?.();
const activeAtLaunch=window.B3OrderAvailability?.readInteraction?.();
if(activeAtLaunch&&['PENDING','SUBMITTING','ACCEPTED'].includes(activeAtLaunch.status))
 window.AndroidBridge?.requestPersonalPushToken?.();
void initializeCatalogAtSplash();
// Las notificaciones son opcionales y no bloquean Inicio.
void fetchNotifications();
// Android computes the deadline from the published minutes and verified
// acceptance. No additional server request is made when the timer expires.
let lastLocalExpiryInteractionId='';
function showLocalPaymentExpiry(entry){
 if(!entry?.interactionId||entry.status!=='ACCEPTED'||entry.paymentConfirmation||
    !Number.isFinite(Date.parse(entry.paymentExpiresAt||''))||
    Date.now()<Date.parse(entry.paymentExpiresAt))return;
 if(lastLocalExpiryInteractionId===entry.interactionId)return;
 lastLocalExpiryInteractionId=entry.interactionId;
 st.quote=null;st.store='';st.pay='';
 deliveryAvailability={status:'ERROR',storeName:'',candidateNames:[],
  message:'El plazo para pagar terminó. No se enviarán comprobantes fuera de plazo.'};
 save();
 closeChatOverlay();
 if(['payment','paymentInstructions','paymentProofPreview','prepaymentReview','availability'].includes(st.stage))
  screen('availability');
 else render();
}
setInterval(()=>{
 const entry=window.B3OrderAvailability?.readInteraction?.();
 const deadline=Date.parse(entry?.paymentExpiresAt||'');
 if(!Number.isFinite(deadline)||entry?.status!=='ACCEPTED')return;
 const label=personalCheckoutCountdown();
 document.querySelectorAll('[data-checkout-remaining]').forEach(node=>{if(node.textContent!==label)node.textContent=label});
 if(Date.now()>=deadline&&!entry.paymentConfirmation)
  showLocalPaymentExpiry(entry);
},1000);
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState!=='visible')return;
 if(st.stage==='app'&&(st.tab==='inicio'||st.tab==='carta'))void syncPromotionCatalog();
 const entry=window.B3OrderAvailability?.readInteraction?.();
 if(!entry)return;
 if(['SUBMITTING','PENDING'].includes(entry.status))scheduleAgentDecisionPoll(500);
 if(entry.paymentConfirmation?.status==='SENT')schedulePaymentDecisionPoll(1000);
 if(['SUBMITTING','PENDING','ACCEPTED'].includes(entry.status))window.AndroidBridge?.requestPersonalPushToken?.();
});
if(activeAtLaunch?.paymentConfirmation?.status==='SENT')schedulePaymentDecisionPoll(2000);
// La salida del splash espera datos esenciales, sin temporizador fijo.
})();
 document.addEventListener('input',e=>{if(e.target?.id==='b3-cash-amount'){const n=document.getElementById('b3-cash-change');if(n)n.textContent=cash(Math.max(0,Number(e.target.value||0)-orderTotal()));}});
