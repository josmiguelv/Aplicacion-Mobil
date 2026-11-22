/* POLLOS B3 — V10 responsive. Prototipo offline: precios y productos referenciales, sin cobros reales. */
(()=>{'use strict';
const K='b3-v6-demo-20261110', root=document.getElementById('app');
const demoProducts=[
{id:'p1',name:'1 Pollo a la Brasa',price:47.99,cat:'Pollos',pic:1,desc:'Pollo a la brasa. Acompañamientos sujetos a confirmación de la carta.'},
{id:'p2',name:'1/2 Pollo a la Brasa',price:26.99,cat:'Pollos',pic:2,desc:'Medio pollo a la brasa. Presentación referencial.'},
{id:'p3',name:'1/4 Pollo con Papas',price:12.99,cat:'Pollos',pic:3,desc:'Cuarto de pollo a la brasa con papas. Referencial.'},
{id:'p4',name:'Combo 1',price:57.99,cat:'Promociones',pic:1,desc:'Combo comercial de referencia; verificar contenido y vigencia.'},
{id:'p5',name:'Combo 2',price:31.99,cat:'Promociones',pic:2,desc:'Combo comercial de referencia; verificar contenido y vigencia.'},
{id:'p6',name:'Combo 3',price:61,cat:'Promociones',pic:3,desc:'Combo mostrado en material de referencia. Precio sujeto a validación.'},
{id:'p7',name:'Combo 4',price:71,cat:'Promociones',pic:4,desc:'Combo mostrado en material de referencia. Precio sujeto a validación.'},
{id:'p8',name:'Bebida',price:0,cat:'Bebidas',pic:4,desc:'Consultar presentaciones y precios. No disponible para compra de prueba.',disabled:true}
].map(p=>({...p,isDemo:true}));
const products=[...demoProducts]; // Demo visible + productos publicados por API.
// Los locales se reciben exclusivamente desde el catálogo publicado en la web administrativa.
const defaultStoreSchedule=()=>Object.fromEntries(
 ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
 .map(day=>[day,{open:'11:00',close:'23:00'}])
);
// Datos de demostración solicitados: sin validación oficial de direcciones ni horarios.
const demoStores=[
 {id:'demo-nogales',name:'Los Nogales',address:'Av. Los Nogales 482, Santa Anita, Lima'},
 {id:'demo-eucaliptos',name:'Eucaliptos',address:'Av. Los Eucaliptos 1163, Santa Anita, Lima'},
 {id:'demo-ficus',name:'Los Ficus',address:'Av. Francisco Bolognesi 673, Santa Anita, Lima'},
 {id:'demo-universal',name:'Universal',address:'Av. Túpac Amaru 650, Santa Anita, Lima'}
].map(s=>({...s,isDemo:true,active:true,hoursConfigured:true,
 weeklyHours:defaultStoreSchedule(),pickup_enabled:true,delivery_enabled:true,latitude:null,longitude:null}));
const shops=[]; // Solo locales publicados por API; sin sucursales de demostración.
function resetDemoStores(){shops.splice(0,shops.length)}
function demoStoreClock(s){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Lima',weekday:'long',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const field=k=>parts.find(x=>x.type===k)?.value;
 const slot=s.weeklyHours?.[(field('weekday')||'').toLowerCase()];
 if(!slot?.open||!slot?.close)return {isOpen:false,closesAt:'',opensAt:''};
 const nowMinute=Number(field('hour'))*60+Number(field('minute'));
 const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
 const opening=minutes(slot.open),closing=minutes(slot.close);
 return {isOpen:closing>opening?nowMinute>=opening&&nowMinute<closing:nowMinute>=opening||nowMinute<closing,
  closesAt:slot.close,opensAt:slot.open};
}

let st={coords:null,quote:null,configReady:false,stage:'splash',tab:'inicio',category:'Todos',cart:[],orders:[],favorite:null,addresses:[],defaultAddressId:null,profile:{first:'',last:'',phone:'',doc:'',email:'',address:'',reference:''},registered:false,mode:'',pickupOrigin:'',fulfillment:'',store:'',pay:'yape',cash:'',selected:'',qty:1,carousel:0,promo:0,local:0,chat:[],last:'',step:'',notice:'',consent:false};
try{const d=JSON.parse(localStorage.getItem(K)||'{}');st={...st,...d,stage:'splash',tab:'inicio',selected:'',notice:'',configReady:false,quote:null}}catch{}
if(st.mode==='dine_in')st.mode=''; // Retirado de la navegación de Pollos B3 V11.
// Demo-only flag: stores whether the visitor already chose guest access or test sign-in.
let enteredBefore=localStorage.getItem('b3-visitor-entered-v9')==='1';
let loginFromAccount=false;
let addressEditId=null;
let selectedOrderId=null,reviewSheetOrderId=null,favoritePromptOrderId=null,reviewScore=0,reviewTags=[];
let fulfillmentModal=null; // null | choose | delivery | pickup; transient UI state, never persisted
let checkoutPending=false; // only when the client has explicitly chosen to continue the cart
let checkoutRefreshPending=false,checkoutReviewNote=''; // fresh availability at each checkout gate
let deliveryRequestPending=false,deliveryRequestError=''; // visible state while validating the address
let deliveryAvailability={status:'IDLE',storeName:'',candidateNames:[],message:''};
let deliveryValidationGeneration=0; // not persisted or treated as an agent decision
let deliveryHealthPending=false,deliveryHealthMessage=''; // transient read-only backend diagnostic
let deliveryGpsRequested=false,deliveryLocation=null,deliveryGeocodeTask=null,deliveryGeocodeSequence=0;
let deliveryGpsPending=false,deliveryGpsMessage='',deliveryGpsToken='';
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
 if(st.mode!=='delivery'||!pending||!['PREPARED','SUBMITTING','PENDING','ACCEPTED','REJECTED'].includes(pending.status))return;
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
// Las nueve fotos entregadas solo sustituyen recursos visuales de la DEMOSTRACIÓN local.
// Un catálogo publicado siempre utiliza las fotos autorizadas por la web administrativa.
const demoPhotoById={p1:5,p2:8,p3:1,p4:3,p5:2,p6:4,p7:7,p8:6};
const previewPhoto=n=>`images/b3-photo-${String(n).padStart(2,'0')}.webp`;
const cash=n=>'S/ '+Number(n).toFixed(2), photo=p=>p.imageUrl&&(/^https:\/\//.test(p.imageUrl)||p.imageUrl.startsWith('/api/v1/mobile/images/'))?(p.imageUrl.startsWith('/')?API_BASE+p.imageUrl:p.imageUrl):(p.isPublished?null:(p.previewPhoto||demoPhotoById[p.id]?previewPhoto(p.previewPhoto||demoPhotoById[p.id]):`images/combo${p.pic||p}.jpg`));
// App ID is registered by the super administrator. An app ID maps to exactly one tenant on the server.
const APP_ID='com.integrab2g.pollosb3';
// Configure only an HTTPS address when the admin server is deployed; never place credentials in Android.
const API_BASE=(()=>{
 const raw=window.AndroidBridge?.getApiBase?.()||'';
 return /^https:\/\//.test(raw)?raw.replace(/\/+$/,''):'';
})();
// Fase locales: conservar catálogo, imágenes, promociones y vacantes de demostración.
const catalogPublished=false;
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
let publishedPromotions=[];
let publishedVacancies=[];
let complaintsBookUrl=null;
// Demo-only artwork supplied by the user; never represented as a published vacancy.
const demonstrationVacancies=[
 {id:'demo-horneros',title:'Horneros con experiencia',summary:'Publicación de prueba basada en el afiche proporcionado.',description:'Se buscan horneros con experiencia.',requirements:'Experiencia como hornero.',schedule:'',employmentType:'',locationLabel:'',imageUrl:'images/demo-horneros.webp',whatsappPhone:'51937602607',isDemo:true},
 {id:'demo-cajeras-meseras',title:'Cajeras y meseras con experiencia',summary:'Publicación de prueba basada en el afiche proporcionado.',description:'Se buscan cajeras y meseras con experiencia.',requirements:'Experiencia en el puesto.',schedule:'Full time: 10:30 a. m. a 6:30 p. m. · Part time: 6:30 p. m. a 10:30 p. m.',employmentType:'Full time / Part time',locationLabel:'',imageUrl:'images/demo-cajeras-meseras.webp',whatsappPhone:'51937602607',isDemo:true}
];
function visibleVacancies(){return catalogPublished?publishedVacancies:demonstrationVacancies}
let selectedVacancyId=null;
function modeName(m){return ({delivery:'Pollo Delivery',pickup:'Pide y Retira'})[m]||'Elegir modalidad'}
const storeAllowed=(s,m)=>!!s&&s.active!==false&&(m==='delivery'?s.delivery_enabled!==false:m==='pickup'?s.pickup_enabled!==false:s.dine_in_enabled===true);
function availableStores(m){return shops.filter(s=>s.active!==false)}
function localIsClosed(s){return s.isDemo?!demoStoreClock(s).isOpen:s.hoursConfigured===true&&s.isOpen===false}
function eligibleForPickup(s){return !!s&&s.active!==false&&s.pickup_enabled===true&&
 (s.isDemo?!!demoStoreClock(s).isOpen:s.hoursConfigured===true&&s.isOpen===true)}
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
function paymentOptions(){
 const choices=[['yape','Yape','Pago digital sujeto a integración'],['plin','Plin','Pago digital sujeto a integración'],['card','Tarjeta','Pasarela de pago pendiente'],['cash','Pago al recibir','En efectivo, con cálculo de vuelto']];
 if(!st.configReady)return []; // No published store or payment methods: never assume enabled.
 const selected=shops.find(x=>String(x.id)===String(st.store));
 const published=st.mode==='delivery'&&Array.isArray(st.quote?.paymentMethods)
  ?st.quote.paymentMethods:selected?.paymentMethods?.[st.mode];
 return Array.isArray(published)?choices.filter(x=>published.includes(x[0])):[];
}
function productsFromApi(rows){
 if(!Array.isArray(rows))return [];
 const seen=new Set();
 return rows.flatMap(x=>{
  if(!x||typeof x.id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(x.id.trim())||typeof x.name!=='string'||!x.name.trim())return [];
  // Namespaced to keep demo identifiers and API identifiers independent.
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
  if(!r.ok)throw Error('API unavailable');
  const c=await r.json();
  if(!c.ready||!Array.isArray(c.stores))throw Error('Stores not published');
  // Locales: solo los publicados por el administrador.
  const revisionChanged=st.configReady&&publishedRevision!==c.revision;
  publishedRevision=c.revision;
  shops.splice(0,shops.length,...c.stores.map(x=>({...x,addr:x.address,radiusKm:x.radiusKm==null&&x.radius_km==null?null:Number(x.radiusKm??x.radius_km),deliveryFeePen:x.deliveryFeePen,consultOrderAvailability:typeof (x.consultOrderAvailability??x.consult_order_availability)==='boolean'?(x.consultOrderAvailability??x.consult_order_availability):null})));
  // Productos: conservar siempre la carta de muestra y anexar los publicados.
  // La lista se reconstruye, no se concatena incrementalmente, para evitar duplicados.
  products.splice(0,products.length,...demoProducts,...productsFromApi(c.products));
  storeGeocoding=false;
  if(st.coords)resolveStoreDistances();
  st.configReady=true;
  if(revisionChanged){deliveryValidationGeneration++;window.B3OrderAvailability?.clear();st.quote=null;st.store='';clearDeliveryAvailability()}
  if(st.store&&!shops.some(x=>String(x.id)===String(st.store))){deliveryValidationGeneration++;window.B3OrderAvailability?.clear();st.quote=null;st.store='';clearDeliveryAvailability()}
  catalogRequestFinished=true;
  save();if(st.stage!=='splash')render();return true;
 }catch(err){
  if(strict)throw Error('No se pudo actualizar la disponibilidad de locales. Intenta nuevamente.');
  shops.splice(0,shops.length);
  st.configReady=false;
  st.quote=null;st.store='';clearDeliveryAvailability();
  products.splice(0,products.length,...demoProducts);
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
function calculateLocalDeliveryQuote(destination,storeList=shops){
 return quoteForDeliveryCandidate(eligibleDeliveryCandidates(destination,storeList)[0]);
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
    (st.quote.quoteOrigin!=='ADMIN_API_ACCEPTED'&&Date.now()-st.quote.quotedAt>=900000))return false;
 if(st.quote.quoteOrigin==='ADMIN_API_ACCEPTED'){
  const deadline=Date.parse(window.B3OrderAvailability?.readInteraction?.()?.paymentExpiresAt||'');
  if(!Number.isFinite(deadline)||Date.now()>=deadline)return false;
 }
 if(st.quote.quoteOrigin==='ADMIN_API_ACCEPTED'){
  const entry=window.B3OrderAvailability?.readInteraction?.();
  return entry?.status==='ACCEPTED'&&entry.body?.storeId===st.store&&entry.body?.catalogRevision===publishedRevision&&
    st.quote.storeId===st.store&&st.quote.quoteRevision===publishedRevision&&
    st.quote.distanceSource==='SERVER_STRAIGHT_LINE'&&
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
 if(st.cart.some(item=>!product(item.id)||product(item.id).disabled))return 'Hay un producto que ya no está disponible. Revisa tu carrito.';
 return '';
}
function publishedOrderItems(){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!st.cart.length||st.cart.length>50)throw Error('El pedido debe tener entre 1 y 50 productos.');
 return st.cart.map(x=>{
  const p=product(x.id),id=String(x.id).replace(/^api:/,'');
  if(!p?.isPublished||p.disabled||!String(x.id).startsWith('api:')||!uuid.test(id)||
    !Number.isInteger(x.qty)||x.qty<1||x.qty>99)
   throw Error('Solo puedes validar productos publicados y cantidades válidas. Retira los productos de muestra.');
  return {productId:id,quantity:x.qty};
 });
}
function applyBackendQuote(result,entry,address,district){
 const fee=Number(result.deliveryFee),amount=Number(result.total),serverSubtotal=Number(result.subtotal);
 if(result.currency!=='PEN'||!result.store||!shops.some(s=>String(s.id)===String(result.store.id))||
  result.deliveryFee==null||result.total==null||result.subtotal==null||
  !Number.isFinite(fee)||fee<0||!Number.isFinite(amount)||!Number.isFinite(serverSubtotal)||
  Math.abs(amount-fee-serverSubtotal)>.015||Math.abs(serverSubtotal-subtotal())>.015)
  throw Error('La cotización del servidor no coincide con el catálogo. Revisa los productos y vuelve a intentarlo.');
 const dist=result.routeDistanceKm==null?null:Number(result.routeDistanceKm);
 st.store=result.store.id;
 st.quote={storeId:result.store.id,storeName:String(result.store.name||'Sede asignada'),
   deliveryFeePen:fee,serverSubtotalPen:serverSubtotal,serverTotalPen:amount,
   paymentMethods:Array.isArray(result.paymentMethods)?result.paymentMethods.filter(x=>['yape','plin','card','cash'].includes(x)):[],
   routeDistanceKm:Number.isFinite(dist)&&dist>=0?dist:null,distanceSource:'SERVER_ROUTE',
   quoteOrigin:'ADMIN_API',serverValidated:true,provisional:true,
   validationId:entry.validationId,quotedAt:Date.now(),destinationKey:deliveryAddressKey(address,district)};
 deliveryAvailability={status:'READY',storeName:st.quote.storeName,candidateNames:[],message:''};save();
}
let agentDecisionTimer=null,agentDecisionPolling=false;
function currentCartSignature(){
 return JSON.stringify(publishedOrderItems().slice().sort((a,b)=>a.productId.localeCompare(b.productId)));
}
function deliveryContactReady(){
 const p=st.profile||{};
 return typeof p.first==='string'&&p.first.trim().length>=2&&p.first.trim().length<=60&&
  typeof p.last==='string'&&p.last.trim().length>=2&&p.last.trim().length<=60&&
  typeof p.phone==='string'&&/^9[0-9]{8}$/.test(p.phone);
}
function deliveryRequestCustomer(address,district){
 if(!deliveryContactReady())throw Error('Completa nombres, apellidos y celular antes de enviar el pedido.');
 return {firstName:st.profile.first.trim(),lastName:st.profile.last.trim(),phone:st.profile.phone,
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
   (!oldCustomer||JSON.stringify(oldCustomer)===JSON.stringify(currentCustomer));
 }catch(_){return false}
}
function stopAgentDecisionPoll(){
 if(agentDecisionTimer!==null)clearTimeout(agentDecisionTimer);
 agentDecisionTimer=null;
}
function scheduleAgentDecisionPoll(delay=3200){
 stopAgentDecisionPoll();
 if(agentDecisionPolling)return;
 const entry=window.B3OrderAvailability?.readInteraction?.();
 if(entry?.status==='ACCEPTED'&&entry.agentDecision==='ACCEPTED'&&st.stage!=='availability')return;
 if(!['PENDING','ACCEPTED','SUBMITTING'].includes(entry?.status))return;
 if(st.stage==='availability'&&deliveryAvailability.status==='ERROR')return;
 if(entry.status!=='SUBMITTING'&&!entry.interactionId)return;
 agentDecisionTimer=setTimeout(()=>{agentDecisionTimer=null;void pollAgentDecision()},delay);
}
async function completeAcceptedQuote(entry){
 const api=window.B3OrderAvailability;
 const address=st.profile.address,district=st.profile.district;
 if(!interactionMatchesCart(entry,address,district))
  throw Error('El carrito cambió después de la aceptación. La solicitud anterior debe cancelarse.');
 if(entry.status!=='ACCEPTED')throw Error('Todavía no existe una aceptación válida del agente.');
 if(entry.body?.customer&&entry.messageDelivered!==true)throw Error('El envío del texto de esta solicitud aún no está confirmado.');
 if(entry.body.catalogRevision!==publishedRevision)throw Error('El catálogo cambió después de la aceptación. Debes cancelar y solicitar una nueva confirmación.');
 const selected=shops.find(s=>s.id===entry.body.storeId);
 if(!selected)throw Error('La sede que aceptó ya no aparece en el catálogo publicado.');
 deliveryAvailability={status:'CHECKING_STORES',storeName:selected.name,candidateNames:[],
  message:'Solicitud aceptada. Calculando delivery desde '+selected.name+'.'};
 render();
 const quote=await api.quoteDelivery({appId:APP_ID,storeId:selected.id,address,district,
  latitude:deliveryLocation?.latitude,longitude:deliveryLocation?.longitude,
  useGps:Number.isFinite(deliveryLocation?.latitude)&&Number.isFinite(deliveryLocation?.longitude)});
 if(st.stage!=='availability'||st.profile.address!==address||st.profile.district!==district)return false;
 if(quote.storeId!==selected.id)throw Error('La cotización no corresponde al local que aceptó.');
 if(quote.revision!==publishedRevision)throw Error('La carta cambió. Necesitamos revisar tu pedido.');
 const fee=Number(quote.deliveryFeePen);
 if(!Number.isFinite(fee)||fee<0)throw Error('No se pudo determinar el costo del delivery.');
 // The server starts the per-client payment window only after the agent reply
 // has been interpreted and a real, published delivery fee is available.
 const wait=await api.beginPaymentWait(entry);
 if(wait.status!=='PAYMENT_PENDING')throw Error('No se pudo iniciar el plazo de pago.');
 if(st.stage!=='availability')return false;
 st.store=selected.id;
 st.quote={storeId:selected.id,storeName:selected.name,deliveryFeePen:fee,
  paymentMethods:quote.paymentMethods.filter(x=>['yape','plin','card','cash'].includes(x)),
  routeDistanceKm:Number.isFinite(Number(quote.routeDistanceKm))?Number(quote.routeDistanceKm):null,
  distanceSource:'SERVER_STRAIGHT_LINE',quoteOrigin:'ADMIN_API_ACCEPTED',serverValidated:false,
  provisional:true,quoteRevision:quote.revision,cartSignature:currentCartSignature(),
  quotedAt:Date.now(),destinationKey:deliveryAddressKey(address,district)};
 st.pay='';save();screen('prepaymentReview');
 return true;
}
async function pollAgentDecision(){
 const api=window.B3OrderAvailability,entry=api?.readInteraction?.();
 if(agentDecisionPolling||
    !['PENDING','ACCEPTED','SUBMITTING'].includes(entry?.status)||
    (entry.status!=='SUBMITTING'&&!entry.interactionId))return;
 if(entry.status==='ACCEPTED'&&entry.agentDecision==='ACCEPTED'&&st.stage!=='availability')return;
 if(st.stage==='availability'&&deliveryAvailability.status==='ERROR')return;
 agentDecisionPolling=true;
 let retryMs=3200;
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
   await api.cancelInteraction(entry,{reason:'CANCEL'});
   stopAgentDecisionPoll();
   ++deliveryValidationGeneration;st.quote=null;st.store='';st.pay='';
   clearDeliveryAvailability();save();nav('inicio');toast('Solicitud cancelada.');return;
  }
  if(entry.body?.customer&&entry.messageDelivered!==true){
   if(st.stage==='availability'){
    deliveryAvailability={status:'CREATE_UNCERTAIN',storeName:'',candidateNames:[],
     message:'Confirmando entrega del detalle al asesor sin abrir otra conversación.'};render();
   }
   await api.sendInteractionMessage(entry);
  }
  if(entry.status==='ACCEPTED'&&entry.agentDecision==='ACCEPTED'){
   if(st.stage==='availability')await completeAcceptedQuote(entry);
   return;
  }
  const result=await api.pollInteraction(entry);
  const store=shops.find(x=>x.id===entry.body.storeId);
  if(result.clientStatus==='EXPIRED'||result.clientStatus==='CANCELLED'){
   deliveryAvailability={status:'ERROR',storeName:store?.name||'',candidateNames:[],
    message:'La solicitud dejó de estar vigente. No se continuará al pago.'};
   if(st.stage==='availability')render();else toast('La solicitud dejó de estar vigente.');
   return;
  }
  if(result.decision==='ACCEPTED'){
   if(st.stage==='availability')await completeAcceptedQuote(api.readInteraction());
   else{render();toast('¡La sede aceptó tu pedido! Revisa el total y continúa con el pago.');}
   return;
  }
  if(result.decision==='REJECTED'){
   api.markRejectedStore(requestSeriesKey(st.profile.address,st.profile.district),entry.body.storeId);
   deliveryAvailability={status:'CHECKING_STORES',storeName:store?.name||'',candidateNames:[],
    message:'Esta sede no puede atender el pedido. Buscaremos otra sede elegible.'};
   if(st.stage==='availability'){
    render();const run=++deliveryValidationGeneration;
    await requestBackendOrderAvailability({address:st.profile.address,district:st.profile.district,
     run,silent:false});
   }else{render();toast('La sede no pudo atender tu pedido. Revisa el estado de tu solicitud.');}
   return;
  }
  if(st.stage==='availability'){
   deliveryAvailability={status:'WAITING_APPROVAL',storeName:store?.name||'',candidateNames:[],
    message:'La solicitud está activa. La sede responderá cuando revise tu pedido.'};
   render();
  }
 }catch(error){
  const latest=api?.readInteraction?.();
  const pending=['PENDING','SUBMITTING'].includes(latest?.status);
  const recovering=pending&&!latest?.interactionId;
  const sending=pending&&latest?.interactionId&&latest.body?.customer&&latest.messageDelivered!==true;
  retryMs=8000;
  deliveryAvailability={status:recovering||sending?'CREATE_UNCERTAIN':pending?'WAITING_APPROVAL':'ERROR',storeName:'',candidateNames:[],
   message:recovering?'Recuperando confirmación de la solicitud enviada, con la misma clave.':
    sending?'La interacción existe. Verificando entrega del detalle sin duplicarlo.':
    pending?'La consulta tuvo una interrupción. Volveremos a revisar la misma solicitud.':
     error.message||'No pudimos continuar. Tu pedido no se cobrará.'};
  if(st.stage==='availability')render();
 }finally{
  agentDecisionPolling=false;
  const current=api?.readInteraction?.();
  if(['PENDING','SUBMITTING'].includes(current?.status)||
     current?.status==='ACCEPTED'&&current.agentDecision!=='ACCEPTED')
   scheduleAgentDecisionPoll(retryMs);
 }
}
async function requestBackendOrderAvailability({address,district,run,silent}){
 const api=window.B3OrderAvailability;
 if(!api?.checkAgentAvailability||!api?.quoteDelivery||!api?.createInteraction||
    !api?.sendInteractionMessage||!api?.pollInteraction)
  throw Error('Actualiza Android para utilizar el envío independiente del mensaje.');
 const active=()=>run===deliveryValidationGeneration&&st.mode==='delivery'&&
  st.profile.address===address&&st.profile.district===district&&(silent||st.stage==='availability');
 const prior=api.readInteraction?.();
 if(prior&&['PENDING','ACCEPTED','SUBMITTING'].includes(prior.status)){
  if(!interactionMatchesCart(prior,address,district))
   throw Error('Existe una solicitud anterior con productos diferentes. Cancélala antes de empezar otra.');
  const store=shops.find(s=>s.id===prior.body.storeId);
  deliveryAvailability={status:prior.messageDelivered===false?'CREATE_UNCERTAIN':'WAITING_APPROVAL',
   storeName:store?.name||'Sede seleccionada',candidateNames:[],
   message:prior.messageDelivered===false?'La solicitud ya existe. Confirmando el texto al asesor.':
    'Esperando respuesta del local. Continuaremos automáticamente.'};
  st.store=prior.body.storeId;save();render();
  // Even a persisted ACCEPTED can denote only automatic interaction assignment.
  // Always re-read the actual agent reply before allowing checkout.
  scheduleAgentDecisionPoll(1000);
  return false;
 }
 let loc=hasDeliveryDestination(address,district)?deliveryLocation:null;
 if(!loc){
  loc=await geocodeDeliveryDestination(address,district);
  if(!active())return false;
  deliveryLocation={...loc,key:deliveryAddressKey(address,district)};
 }
 const candidates=eligibleDeliveryCandidates(loc);
 const tried=new Set(api.rejectedStores(requestSeriesKey(address,district)));
 const consultable=candidates.filter(({store})=>storeAvailabilitySetting(store)===true&&!tried.has(store.id));
 if(!consultable.length){
  deliveryAvailability={status:'UNAVAILABLE',storeName:'',candidateNames:[],
   message:'Por ahora no tenemos locales disponibles para realizar tu delivery. Inténtalo más tarde.'};
  render();return false;
 }
 let selected=null;
 for(const {store} of consultable){
  if(!active())return false;
  deliveryAvailability={status:'CHECKING_STORES',storeName:store.name,candidateNames:[],
   message:'Consultando atención en '+store.name+'.'};
  render();
  const check=await api.checkAgentAvailability({appId:APP_ID,storeId:store.id});
  if(!active())return false;
  if(check.available){selected=store;break}
 }
 if(!selected){
  deliveryAvailability={status:'UNAVAILABLE',storeName:'',candidateNames:[],
   message:'Por ahora no tenemos locales disponibles para realizar tu delivery. Inténtalo más tarde.'};
  render();return false;
 }
 st.store=selected.id;st.quote=null;save();
 const entry=api.prepareInteraction({appId:APP_ID,storeId:selected.id,catalogRevision:publishedRevision,
  items:publishedOrderItems(),address,district,customer:deliveryRequestCustomer(address,district)});
 deliveryAvailability={status:'CREATE_UNCERTAIN',storeName:selected.name,candidateNames:[],
  message:'Enviando la solicitud. Continuaremos automáticamente cuando el local responda.'};
 render();
 let response;
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
 if(!active())return false;
 if(response.status!=='PENDING')throw Error('No se confirmó la solicitud pendiente.');
 // The interactionId was saved before attempting the second HTTP request.
 deliveryAvailability={status:'CREATE_UNCERTAIN',storeName:selected.name,candidateNames:[],
  message:'Solicitud creada. Enviando detalle al asesor de '+selected.name+'.'};
 save();render();
 if(entry.body?.customer&&entry.messageDelivered!==true){
  try{await api.sendInteractionMessage(entry)}
  catch(_){
   // No new interaction is created. The same message is retried idempotently.
   deliveryAvailability={status:'CREATE_UNCERTAIN',storeName:selected.name,candidateNames:[],
    message:'Solicitud creada. Confirmando entrega del texto al asesor. Reintentaremos sin duplicar.'};
   save();render();scheduleAgentDecisionPoll(8000);return false;
  }
 }
 if(!active())return false;
 deliveryAvailability={status:'WAITING_APPROVAL',storeName:selected.name,candidateNames:[],
  message:'Esperando confirmación de '+selected.name+'. No necesitas pulsar ningún botón.'};
 save();render();scheduleAgentDecisionPoll(1000);
 return false;
}
async function cancelPersonalCheckout(reason='CANCEL'){
 const api=window.B3OrderAvailability,entry=api?.readInteraction?.();
 if(!entry||!['SUBMITTING','PENDING','ACCEPTED'].includes(entry.status)){
  if(reason==='MODIFY')nav('carta');else nav('inicio');
  return;
 }
 const adding=reason==='MODIFY';
 if(!window.confirm(adding?
   '¿Agregar productos? Se cancelará la solicitud aceptada por la sede. El nuevo pedido necesitará otra validación.':
   '¿Cancelar esta solicitud? Avisaremos a la sede y detendremos los recordatorios.'))return;
 if(entry.status==='SUBMITTING'&&!entry.interactionId){
  api.requestCancelWhenRecovered(entry);
  deliveryAvailability={status:'CREATE_UNCERTAIN',storeName:'',candidateNames:[],
   message:'Cancelación solicitada. Primero debemos recuperar la confirmación de envío para avisar a la sede.'};
  screen('availability');scheduleAgentDecisionPoll(1000);return;
 }
 checkoutReviewNote='Notificando a la sede la cancelación de esta solicitud...';
 render();
 try{
  await api.cancelInteraction(entry,{reason});
  stopAgentDecisionPoll();
  ++deliveryValidationGeneration;st.quote=null;st.store='';st.pay='';
  clearDeliveryAvailability();checkoutReviewNote='';save();
  if(adding)nav('carta');else nav('inicio');
  toast(adding?'Solicitud anterior cancelada. Puedes modificar tu carrito.':'Solicitud cancelada.');
 }catch(error){
  checkoutReviewNote=error.message||'No se pudo confirmar la cancelación. Intenta nuevamente.';
  if(st.stage==='availability')deliveryAvailability={status:'WAITING_APPROVAL',storeName:'',candidateNames:[],
   message:'La cancelación aún no se confirmó. La solicitud sigue activa.'};
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
 if(deliveryRequestPending)return false;
 const run=++deliveryValidationGeneration;
 const address=String(st.profile.address||'').trim(),district=String(st.profile.district||'').trim();
 if(address.length<6||district.length<2){
  deliveryRequestError='Ingresa una dirección completa y un distrito para verificar la cobertura.';
  if(!silent)screen('deliveryAddress');else render();return false;
 }
 if(!deliveryContactReady()){
  checkoutPending=true;
  deliveryRequestError='';
  screen('identity');return false;
 }
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
  if(!ready&&silent)screen('availability');
  return ready;
 }catch(error){
  if(run!==deliveryValidationGeneration)return false;
  st.quote=null;st.store='';
  deliveryRequestError=error?.message||'No se pudo verificar la disponibilidad.';
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
  if(String(district||'').trim())st.profile.district=String(district).trim();
  deliveryGpsMessage=hasNumber
   ?'Dirección encontrada. Revisa la calle, el número y el distrito antes de continuar.'
   :'Ubicación encontrada. Completa el número de puerta y revisa el distrito.';
 }
 if(deliveryLocation?.source==='gps')deliveryLocation.key=deliveryAddressKey(st.profile.address,st.profile.district);
 deliveryRequestError='';save();render();
};
window.b3NativeLocation=(lat,lng,error)=>{
 const forDelivery=deliveryGpsRequested;
 deliveryGpsRequested=false;
 if(error){if(st.stage==='app'&&st.tab==='inicio')render();else toast(error);return}
 if(!Number.isFinite(lat)||!Number.isFinite(lng)){
  if(st.stage==='app'&&st.tab==='inicio')render();else toast('No fue posible obtener coordenadas');
  return;
 }
 st.coords={lat,lng};save();resolveStoreDistances();
 if(forDelivery&&(fulfillmentModal==='delivery'||st.stage==='deliveryAddress')){
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
  st.mode='pickup';st.store=selected.id;st.fulfillment='pickup';st.quote=null;
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
const subtotal=()=>st.cart.reduce((s,x)=>s+x.qty*(products.find(p=>p.id===x.id)?.price||0),0), cartCount=()=>st.cart.reduce((s,x)=>s+x.qty,0);
const product=id=>products.find(x=>x.id===id);
function toast(t){st.notice=t;render();setTimeout(()=>{if(st.notice===t){st.notice='';render()}},2400)}
function activePersonalCheckout(){
 const entry=window.B3OrderAvailability?.readInteraction?.();
 return ['SUBMITTING','PENDING','ACCEPTED'].includes(entry?.status)?entry:null;
}
function personalCheckoutBanner(){
 const entry=activePersonalCheckout();if(!entry)return '';
 const pending=entry.status!=='ACCEPTED';
 return `<button type="button" class="b3-checkout-floating" data-checkout-return="1" aria-label="Ver estado de mi solicitud">
   <span class="b3-checkout-floating-icon">${ic(pending?'clock':'check',20)}</span>
   <span><strong>${pending?'Tu pedido está en validación':'¡Tu pedido fue aceptado!'}</strong>
   <small>${pending?'Sigue activo. Toca para ver el estado.':'Continúa con el total y el pago.'}</small></span>
   ${ic('chev',16)}</button>`;
}
function returnToPersonalCheckout(){
 const entry=window.B3OrderAvailability?.readInteraction?.();
 if(!entry)return;
 if(entry.status==='ACCEPTED'&&deliveryQuoteValid())screen('prepaymentReview');
 else if(entry.status==='REJECTED'){screen('availability');void resolveDelivery()}
 else screen('availability');
}
function screen(n){selectedHomeStore=null;if(n!=='vacancyDetail')selectedVacancyId=null;if(n==='choice'){st.stage='app';st.tab='inicio';fulfillmentModal='choose';render();return}if(n==='login' && st.stage==='app')loginFromAccount=true;fulfillmentModal=null;st.stage=n;window.scrollTo({top:0});render();if(n==='notifications')void fetchNotifications()}
function nav(tab){checkoutPending=false;selectedHomeStore=null;selectedVacancyId=null;fulfillmentModal=null;st.tab=tab;st.stage='app';window.scrollTo({top:0});render()}
function bar(){return `<nav class="bar" aria-label="Navegación"><button class="${st.tab==='inicio'?'active':''}" data-tab="inicio">${ic('home')}<span>Inicio</span></button><button class="${st.tab==='carta'?'active':''}" data-tab="carta">${ic('menu')}<span>Carta</span></button><button class="chat-center" data-screen="chat" aria-label="Abrir chat">${ic('chat',24)}</button><button class="${st.tab==='pedidos'?'active':''}" data-tab="pedidos">${ic('orders')}<span>Pedidos</span></button><button class="${st.tab==='cuenta'?'active':''}" data-tab="cuenta">${ic('account')}<span>Mi Cuenta</span></button></nav>`}
const demo=`<div class="demo">PILOTO · PRECIOS Y FOTOS REFERENCIALES · SIN COBROS REALES</div>`;
const img=(p,c='')=>{const src=photo(p);return src?`<img class="${c}" src="${src}" loading="lazy" alt="Imagen ${p.isPublished?'publicada':'referencial'} de ${esc(p.name||'combo')}">`:`<div class="b3-no-photo ${c}" aria-label="Sin fotografía publicada"></div>`};
function savedAddresses(){return Array.isArray(st.addresses)?st.addresses.filter(x=>x&&typeof x.id==='string'&&typeof x.street==='string'&&typeof x.district==='string'):[]}
function pickSavedAddress(id,quote=false){
 const item=savedAddresses().find(x=>x.id===id);if(!item)return toast('Dirección no disponible');
 st.profile.address=item.street;st.profile.district=item.district;st.profile.reference=item.reference||'';deliveryLocation=null;
 st.mode='delivery';invalidateDeliverySelection();save();
 if(quote){void resolveDelivery()}else{render();toast('Dirección seleccionada')}
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
 <p class="smallprint">Tus direcciones se almacenan únicamente en este dispositivo durante el piloto. Guardarlas no consulta Google Routes ni calcula el reparto.</p></div>`;
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
 return `<header class="b3-compact-header">
   <img class="b3-header-logo" src="images/pollosb3-header-logo.png" alt="Pollos B3">
   <button class="b3-header-target" type="button" data-open-fulfillment="1" aria-label="Cambiar modalidad o destino del pedido">
    <span class="b3-destination-label">${esc(value.label)}</span>
    <span class="b3-destination-line">${esc(value.line1)}</span>
    ${value.line2?`<span class="b3-destination-line">${esc(value.line2)}</span>`:''}
   </button>
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
 const pickupPanel=`<div class="b3-modal-fields">
   <button type="button" class="outline full" data-gps="1">${ic('pin',18)} Usar mi ubicación actual</button>
   <label>O ingresa una dirección de referencia<input id="pickup-origin" placeholder="Calle, número y distrito" value="${esc(st.pickupOrigin||'')}"></label>
   <button type="button" class="outline full" data-pickup-origin-save="1">Guardar dirección de referencia</button>
   ${!st.coords?'<p class="smallprint">Los kilómetros se mostrarán cuando se conozcan las coordenadas de origen y destino.</p>':''}
   <div class="b3-modal-store-list">${rows.length?rows.map(s=>`<div class="b3-modal-store">
     <div class="b3-store-top"><strong>${esc(s.name)}</strong>${storeStatusHtml(s)}</div>
     ${s.address?`<span class="b3-store-line">${ic('pin',15)}${esc(s.address)}</span>`:''}
     ${straightDistanceKm(s)?`<span class="b3-store-line">${ic('map',15)}${esc(straightDistanceKm(s))}</span>`:''}
     ${pickupPaymentWarning(s)}
     ${eligibleForPickup(s)?`<button type="button" class="b3-store-select" data-modal-pickstore="${esc(s.id)}" ${checkoutRefreshPending?'disabled':''}>${checkoutRefreshPending?'Verificando...':'Elegir local'} ${ic('chev',16)}</button>`:'<span class="b3-store-unavailable">No disponible para retiro inmediato</span>'}
   </div>`).join(''):'<div class="notice">No hay locales activos publicados por la web administrativa.</div>'}</div>
 </div>`;
 return `<div class="b3-modal-backdrop" data-modal-close="1">
   <section class="b3-modal-sheet" role="dialog" aria-modal="true" aria-label="Configurar pedido">
    <div class="b3-modal-handle" aria-hidden="true"></div>
    <div class="b3-modal-heading"><div><h2>${choice?'¿Para dónde hoy?':delivery?'Pollo Delivery':'Pide y Retira'}</h2><p>${choice?'Elige cómo quieres recibir tu pedido':delivery?'Indica dónde entregaremos tu pedido':'Elige dónde recogerás tu pedido'}</p></div>
    <button type="button" data-modal-close="1" class="b3-modal-close" aria-label="Cerrar">${ic('close',21)}</button></div>
    ${!choice?`<button type="button" class="b3-modal-back" data-modal-back="1">${ic('back',17)} Cambiar modalidad</button>`:''}
    ${choice?modeButtons:delivery?deliveryPanel:pickupPanel}
   </section></div>`;
}
function main(){return `<div class="shell">${demo}<main class="main">${st.tab==='inicio'?home():st.tab==='carta'?carta():st.tab==='pedidos'?orders():account()}</main>${cartCount()?`<button class="float-cart" data-screen="cart" aria-label="Abrir carrito">${ic('cart',19)}<b>${cash(subtotal())}</b><span>${cartCount()}</span></button>`:''}${bar()}</div>${selectedHomeStore?homeStoreSheet():fulfillmentOverlay()}`}

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
 if(s.isDemo){const state=demoStoreClock(s);return '<span class="b3-store-badge '+(state.isOpen?'open':'closed')+'">'+(state.isOpen?'Abierto':'Cerrado')+'</span>'}
 if(s.hoursConfigured!==true||typeof s.isOpen!=='boolean')return '<span class="b3-store-badge unknown">Horario pendiente</span>';
 return '<span class="b3-store-badge '+(s.isOpen?'open':'closed')+'">'+(s.isOpen?'Abierto':'Cerrado')+'</span>';
}
function storeToday(s){
 if(s.isDemo){const state=demoStoreClock(s);return (state.isOpen?'Cierra a las '+storeTime(state.closesAt):'Abre a las '+storeTime(state.opensAt))+' · horario de prueba'}
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
 (rows[index].isDemo?'<p class="b3-stores-demo-note">SEDES DE DEMOSTRACIÓN · Direcciones y horarios por confirmar</p>':'')+storeHomeCard(rows[index])+'<div class="dots" role="group" aria-label="Cambiar sede">'+rows.map((_,i)=>'<button data-home-local="'+i+'" aria-label="Sede '+(i+1)+'" aria-pressed="'+(index===i)+'" class="'+(index===i?'on':'')+'"></button>').join('')+'</div></section>';
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
 (s.isDemo?'<p class="b3-stores-demo-note">DATOS DE DEMOSTRACIÓN · Pendientes de confirmación</p>':'')+'<h2>'+esc(s.name||'Sede')+'</h2><p>'+ic('pin',16)+' '+esc(addr||'Dirección no publicada')+'</p>'+
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
function trackCard(o){
 const index=Math.max(0,ORDER_STAGES.findIndex(row=>row[0]===o.status));
 return '<div class="b3-track">'+(isDemoOrder(o)?'<p class="b3-demo-alert">SIMULACIÓN LOCAL — No son estados reportados por Pollos B3.</p>':'')+
 '<div class="b3-track-heading"><strong>Seguimiento visual</strong><span>'+Math.round(index/4*100)+'% de etapas</span></div>'+
 '<div class="b3-track-bar"><div style="width:'+index/4*100+'%"></div></div>'+
 ORDER_STAGES.map(([id,title,info],i)=>'<div class="b3-track-stage '+(i<index?'done':i===index?'current':'upcoming')+'"><span class="b3-track-dot">'+(i<index?'✓':i+1)+'</span><div><b>'+title+'</b><small>'+(i<index?'Completado':i===index?info:'Pendiente')+'</small></div></div>').join('')+
 (isDemoOrder(o)&&o.status!=='DELIVERED'?'<button class="outline full" data-demo-next="'+esc(o.id)+'">Simular siguiente etapa</button>':'')+'</div>';
}
function orderDetail(){
 const o=findLocalOrder(selectedOrderId);
 if(!o)return '<div class="page">'+heading('Pedido no disponible','app')+'</div>';
 const active=activeTracking(o);
 return '<div class="page b3-order-detail">'+heading('Pedido '+esc(o.id),'app')+
 (active?trackCard(o):'<div class="b3-track-done">'+ic('check',22)+'<div><b>Pedido entregado</b><small>El seguimiento activo finalizó una hora después de la entrega.</small></div></div>')+
 '<div class="b3-order-recap"><h3>Resumen</h3><p>'+esc(basketNames(o.items))+'</p><strong>'+cash(o.total||0)+'</strong></div>'+
 (orderDelivered(o)?'<button class="primary full" data-repeat-order="'+esc(o.id)+'">Pedir de nuevo</button>'+(o.review?'<p class="smallprint">Opinión guardada en este dispositivo.</p>':'<button class="outline full" data-open-review="'+esc(o.id)+'">Calificar pedido</button>'):'')+'</div>';
}
function favoritePrompt(){
 const o=findLocalOrder(favoritePromptOrderId);
 if(!o||!orderDelivered(o)||o.favoritePromptDone)return '';
 return '<div class="b3-overlay"><div class="b3-bottom-sheet" role="dialog" aria-modal="true" aria-label="Guardar favorito"><div class="b3-sheet-grip"></div><h2>¿Actualizar tu favorito?</h2><p>¿Quieres guardar este pedido para volver a pedirlo fácilmente?</p><p class="b3-feedback-order">'+esc(basketNames(o.items))+'</p><button class="primary full" data-accept-favorite="1">Sí, guardar como favorito</button><button class="outline full" data-decline-favorite="1">Conservar el favorito anterior</button></div></div>';
}
function reviewSheet(){
 const o=findLocalOrder(reviewSheetOrderId);
 if(!o||!orderDelivered(o)||o.review)return '';
 return '<div class="b3-overlay" data-review-backdrop="1"><div class="b3-bottom-sheet" role="dialog" aria-modal="true" aria-label="Encuesta de satisfacción"><div class="b3-sheet-grip"></div><div class="b3-survey-head"><h2>¿Qué tal estuvo tu pedido?</h2><button data-review-close="1" aria-label="Cerrar">×</button></div><p>Tu opinión nos ayuda a mejorar.</p><div class="b3-rating-stars">'+[1,2,3,4,5].map(n=>'<button data-review-star="'+n+'" aria-label="'+n+' estrellas">'+(reviewScore>=n?'★':'☆')+'</button>').join('')+'</div><div class="b3-feedback-tags">'+['Sabor','Temperatura','Tiempo','Presentación','Atención'].map(k=>'<button class="'+(reviewTags.includes(k)?'selected':'')+'" data-review-tag="'+k+'">'+k+'</button>').join('')+'</div><label>Comentario (opcional)<textarea id="review-comment" maxlength="250" rows="3" placeholder="Cuéntanos tu experiencia"></textarea></label><button class="primary full" data-review-send="1">Enviar opinión</button>'+'<small>Solo se guarda en este dispositivo. No se envía al negocio.</small>'+'</div></div>';
}
function afterOrderDelivered(o){
 if(!orderDelivered(o))return;
 if(!o.favoritePromptDone&&(!st.favorite||normalizedBasket(st.favorite.items)!==normalizedBasket(o.items))){favoritePromptOrderId=o.id;reviewSheetOrderId=null;render();return}
 if(!o.review&&!o.reviewDismissed){reviewSheetOrderId=o.id;reviewScore=0;reviewTags=[];render()}
}

function home(){
  const featured=products.slice(0,4);
  const f=featured.length?featured[st.carousel%featured.length]:null;
  const heroVisual=f&&!catalogPublished&&f.id==='p4'?{...f,previewPhoto:9}:f;
  const promos=catalogPublished?publishedPromotions:products.filter(p=>p.cat==='Promociones');
  const pp=promos.length?promos[st.promo%promos.length]:null;
  const shop=shops.length?shops[st.local%shops.length]:null;
  return `<div class="home home-v10">
    ${fulfillmentHeader()}
    ${favoriteCard()}
    <section class="hero-carousel" aria-label="Destacados referenciales">
      <div class="section-head section-head-featured"><h2>Para disfrutar hoy</h2><span class="minor">Productos de demostración</span></div>
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
    <section class="block promos" aria-label="Combos referenciales">
      <div class="section-head"><h2>Combos para compartir</h2><span class="minor">Precios por validar</span></div>
      ${pp?(catalogPublished?`<div class="promo-card published-promotion" role="status"><div class="promo-info"><span>PROMOCIÓN PUBLICADA</span><strong>${esc(pp.title)}</strong><small>Consulta los productos participantes en la carta.</small></div></div>`:`<div class="promo-card" data-product="${pp.id}" role="button" tabindex="0" aria-label="Ver ${esc(pp.name)}">${img(pp)}<div class="promo-info"><span>COMBO DE DEMOSTRACIÓN</span><strong>${esc(pp.name)}</strong><b>${cash(pp.price)}</b></div></div>`):'<div class="notice">No hay promociones publicadas.</div>'}
      <div class="dots" role="group" aria-label="Cambiar combo">${promos.map((_,i)=>`<button aria-label="Combo ${i+1}" aria-pressed="${st.promo%promos.length===i}" data-promo="${i}" class="${st.promo%promos.length===i?'on':''}"></button>`).join('')}</div>
    </section>
    ${homeStores()}
    <p class="home-disclaimer">Prototipo de Pollos B3. Imágenes, nombres comerciales, precios, combos y ubicaciones sujetos a confirmación antes de la publicación.</p>
  </div>`;
}
function card(p){return `<article class="item" data-product="${esc(p.id)}"><div class="item-picture">${img(p)}<span>${p.isPublished?'Publicado':'Referencial'}</span></div><div class="item-text"><strong>${esc(p.name)}</strong><div class="item-bottom"><b>${p.disabled?'Consultar':cash(p.price)}</b><button data-quick="${p.id}" ${p.disabled?'disabled':''} aria-label="Agregar ${esc(p.name)}">${ic('plus',20)}</button></div></div></article>`}
function carta(){const term=(st.search||'').toLocaleLowerCase('es-PE');const list=products.filter(p=>(st.category==='Todos'||p.cat===st.category)&&(!term||(p.name+' '+p.desc+' '+p.cat).toLocaleLowerCase('es-PE').includes(term)));return `<div class="carta"><h1>La carta</h1><p>Elige lo que más te gusta.</p><div class="filters">${[...new Set(['Todos','Pollos','Promociones','Bebidas',...products.map(p=>p.cat)])].map(c=>`<button data-filter="${esc(c)}" class="${c===st.category?'selected':''}">${esc(c)}</button>`).join('')}</div><div class="search-feedback">${st.search?`Resultados para «${esc(st.search)}» · <button data-clearsearch="1">Limpiar búsqueda</button>`:''}</div><div class="cards">${list.map(card).join('')||'<p class="search-empty">No encontramos productos en esta demostración.</p>'}</div><p class="smallprint">Los productos de muestra son referenciales; los productos publicados se identifican en cada tarjeta. No hay pedidos ni cobros reales habilitados.</p></div>`}
function orders(){
 const list=Array.isArray(st.orders)?st.orders.filter(o=>o&&typeof o.id==='string'&&Date.now()-o.ts<60*24*3600000):[];
 return '<div class="page b3-orders-page"><h1>Mis pedidos</h1><p class="sub">Consulta tus pedidos locales. El seguimiento no requiere iniciar sesión.</p>'+
 (list.length?list.map(o=>'<button class="b3-order-entry" data-order-open="'+esc(o.id)+'"><span><b>'+esc(o.id)+'</b><small>'+new Date(o.ts).toLocaleDateString('es-PE')+' · '+(isDemoOrder(o)?'PEDIDO DE PRUEBA':'Pedido')+'</small></span><span><strong>'+cash(o.total||0)+'</strong><small>'+(ORDER_STAGES.find(r=>r[0]===o.status)?.[1]||'Sin procesar')+'</small></span></button>').join(''):'<div class="empty-state"><h2>Aún no tienes pedidos</h2><p>Cuando confirmes un pedido podrás consultar aquí su información.</p><button class="primary" data-tab="carta">Ver la carta</button></div>')+'</div>';
}
function account(){let rows=[['Mi perfil','user','profile'],['Direcciones guardadas','pin','address'],['Métodos de pago','card','methods'],['Notificaciones','bell','notifications'],['Nuestra Historia','book','history'],['Trabaja con nosotros','store','jobs'],['Privacidad y protección de datos','shield','privacy'],['Sobre la App','info','about']];return `<div class="page acc"><h1>Mi Cuenta</h1><button class="profile-line" data-screen="login">${ic('user',31)}<div><b>${st.registered?esc(st.profile.first||'Cuenta de prueba'):'Inicia sesión'}</b><small>${st.registered?'Cuenta local de demostración':'Para acceder a tu historial y datos guardados'}</small></div>${ic('chev')}</button><div class="rows">${rows.map(([label,icon,screen])=>`<button data-screen="${screen}">${ic(icon,20)}<span>${label}</span>${screen==='notifications'&&notificationUnreadCount()?`<b class="b3-account-notification-count">${notificationUnreadCount()}</b>`:''}${ic('chev',17)}</button>`).join('')}</div><h2 class="group-label">Ayuda</h2><div class="rows"><button data-screen="faq">${ic('help',20)}<span>Preguntas frecuentes</span>${ic('chev',17)}</button><button data-screen="claims">${ic('book',20)}<span>Libro de reclamaciones</span>${ic('chev',17)}</button></div>${st.registered?'<button class="logout" data-logout="1">Cerrar sesión de prueba</button>':''}</div>`}
function splash(){return `<div class="splash b3-splash" aria-label="Pollos B3, la pollería más viral de Santa Anita">
  <div class="b3-splash-halo" aria-hidden="true"></div>
  <img class="b3-splash-logo" src="images/pollosb3-header-logo.png" alt="Pollos B3">
  <h1 class="b3-splash-slogan"><span>LA POLLERÍA MÁS VIRAL DE</span><strong>SANTA ANITA</strong></h1>
  <div class="b3-splash-loading"><span>PREPARANDO TU CARTA...</span><div class="b3-splash-track" role="progressbar" aria-label="Preparando la carta"><i></i></div></div>
</div>`}
function login(){return `<div class="login"><div class="login-photo">${products.length?img(products[0]):'<img src="images/pollosb3-header-logo.png" alt="Pollos B3" loading="eager">'}</div><div class="login-body"><h1>Bienvenido a <em>Pollos B3</em></h1><p>Tu pollo favorito está a unos toques de distancia.</p><button class="primary" data-screen="signin-phone">${ic('phone')} Continuar con número</button><button class="outline" data-screen="signin-email">${ic('mail')} Continuar con correo</button><button class="outline facebook" data-social="facebook"><b>f</b> Continuar con Facebook</button><span class="or">o</span><button class="guest" data-guest="1">Continuar como invitado</button><small class="hint">Accesos de demostración. No ingreses contraseñas reales.</small></div></div>`}
function heading(title,back){return `<div class="screen-heading"><button aria-label="Regresar" data-screen="${back||'app'}">${ic('back')}</button>${title?`<h1>${esc(title)}</h1>`:''}</div>`}
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
 <div class="pickup-origin">
   <button class="outline full" data-gps="1">${ic('pin')} Usar mi ubicación actual</button>
   <p class="smallprint">${st.coords?'Distancias aproximadas calculadas con tu ubicación.':'Puedes ver los locales sin compartir tu ubicación.'}</p>
   <label>O ingresa una dirección de referencia
     <input id="pickup-origin" placeholder="Calle, número y distrito" value="${esc(st.pickupOrigin||'')}">
   </label>
   <button class="outline full" data-pickup-origin-save="1">Guardar dirección de referencia</button>
   ${st.pickupOrigin&&!st.coords?'<p class="smallprint">Dirección guardada. La distancia se calculará cuando se verifique su ubicación en el mapa; no se muestran kilómetros estimados sin coordenadas.</p>':''}
 </div>
 <div class="locations pickup-list">
  ${ordered.length?ordered.map(s=>`<div class="pickup-location ${eligibleForPickup(s)?'':'unavailable'}">
     <div class="pickup-location-title"><b>${esc(s.name)}</b>${storeStatusHtml(s)}</div>
     ${s.address?`<p class="pickup-address">${ic('pin',17)} ${esc(s.address)}</p>`:''}
     ${straightDistanceKm(s)?`<p class="pickup-distance">${ic('map',16)} ${esc(straightDistanceKm(s))}</p>`:''}
     ${pickupPaymentWarning(s)}
     <div class="pickup-actions">
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
function detail(){let p=product(st.selected);if(!p)return `<div class="page"><div class="empty-state"><h2>No hay productos publicados</h2><p>La carta estará disponible cuando Pollos B3 publique sus productos.</p><button class="primary" data-tab="carta">Volver a la carta</button></div></div>`;return `<div class="detail">${heading('','app')}<div class="detail-photo">${img(p)}<small>${p.isPublished?'Imagen publicada':'Imagen referencial'}</small></div><div class="detail-content"><h1>${esc(p.name)}</h1><p>${esc(p.desc)}</p><div class="detail-price"><strong>${cash(p.price)}</strong><div class="counter"><button data-qty="-1">−</button><span>${st.qty}</span><button data-qty="1">+</button></div></div><button class="primary full" data-add="1">Agregar · ${cash(p.price*st.qty)}</button></div></div>`}
function cart(){
 const rows=st.cart.map(x=>{
  const p=product(x.id);
  if(!p)return '<div class="cart-row"><div><strong>Producto retirado de la carta</strong><p>Quítalo para continuar.</p></div><button class="remove" data-remove="'+esc(x.id)+'" aria-label="Quitar producto">'+ic('trash',18)+'</button></div>';
  return '<div class="cart-row">'+img(p)+'<div><strong>'+esc(p.name)+'</strong><span>'+cash(p.price)+'</span><div class="counter"><button data-cartdelta="'+esc(p.id)+'|-1">−</button><b>'+x.qty+'</b><button data-cartdelta="'+esc(p.id)+'|1">+</button></div></div><button class="remove" data-remove="'+esc(p.id)+'" aria-label="Quitar producto">'+ic('trash',18)+'</button></div>';
 }).join('');
 return `<div class="page">${heading('Tu carrito','app')}
 ${!st.cart.length?'<div class="empty-state"><h2>Tu carrito está vacío</h2><button class="primary" data-tab="carta">Ver la carta</button></div>':`
  <div>${rows}</div><div class="totals">
   <p><span>Subtotal</span><b>${cash(subtotal())}</b></p>
   <p><span>Delivery</span><span>${st.mode==='delivery'?(deliveryQuoteValid()?cash(st.quote.deliveryFeePen):'Pendiente de cotizar'):'No aplica'}</span></p>
   <p class="grand"><b>Total estimado</b><strong>${st.mode==='delivery'&&!deliveryQuoteValid()?'Por cotizar':cash(orderTotal())}</strong></p>
  </div>${st.mode==='delivery'&&deliveryQuoteValid()? `<p class="smallprint">Desde ${esc(st.quote.storeName||'sede disponible')} · ${st.quote.serverValidated?'Cotización del servidor':Number(st.quote.straightDistanceKm).toFixed(2)+' km aproximados en línea recta · '+(st.quote.deliveryPricingMode==='FIXED'?'tarifa fija':'tarifa por km')}.</p>`:''}
  ${checkoutReviewNote?`<div class="notice" role="alert">${esc(checkoutReviewNote)}</div>`:''}
  <p class="smallprint">No se enviarán pedidos reales ni se harán cobros en esta versión de prueba.</p>
  <button class="outline full" data-tab="carta">Seguir pidiendo</button>
  <button class="primary full" data-screen="identity" ${checkoutRefreshPending?"disabled":""}>${checkoutRefreshPending?"Actualizando disponibilidad...":"Continuar con pedido de prueba"}</button>`}
 </div>`;
}
function availability(){
 const activeEntry=activePersonalCheckout();
 const status=deliveryAvailability.status;
 const checking=status==='CHECKING'||status==='CHECKING_STORES';
 const waiting=status==='WAITING_APPROVAL'||status==='CREATE_UNCERTAIN';
 const provisionalFee=waiting&&st.quote?.quoteOrigin==='ADMIN_API_PRE_APPROVAL'&&
  Number.isFinite(Number(st.quote.deliveryFeePen))&&Number.isFinite(Number(st.quote.estimatedTotalPen));
 const ready=!checking&&!waiting&&status==='READY'&&deliveryQuoteValid();
 const required=!checking&&status==='APPROVAL_REQUIRED';
 const failed=!checking&&!waiting&&(status==='ERROR'||status==='UNAVAILABLE');
 const names=deliveryAvailability.candidateNames||[];
 const title=checking?'Buscando una sede para ti':waiting?(status==='CREATE_UNCERTAIN'?'Registrando solicitud de atención':'Esperando confirmación de la sede'):ready?'Tenemos una sede disponible':status==='UNAVAILABLE'?'No hay sedes disponibles':required?'Tu pedido necesita confirmación':'No pudimos completar la consulta';
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
    ${names.length>1?'<small>Si esta sede rechaza el pedido, la integración consultará otra sede elegible.</small>':''}
   </div>`:''}
  ${failed?`<div class="notice" role="alert">${esc(deliveryAvailability.message)}</div>`:''}
  ${status==='ERROR'?`<button class="outline full" data-availability-health="1" ${deliveryHealthPending?'disabled':''}>${deliveryHealthPending?'Comprobando conexión…':'Verificar conexión con el servidor'}</button>`:''}
  ${deliveryHealthMessage?`<p class="smallprint" role="status">${esc(deliveryHealthMessage)}</p>`:''}
  ${waiting?`<div class="b3-checkout-motion" role="status" aria-label="Solicitud activa en validación"><div class="b3-checkout-orbit"><div class="b3-checkout-orbit-core">${ic('store',31)}</div><i class="b3-orbit-particle first"></i><i class="b3-orbit-particle second"></i></div><strong>Conectados con la sede</strong><span>La solicitud sigue activa. Puedes continuar usando la aplicación mientras la sede responde.</span><div class="b3-checkout-motion-steps"><b>Enviada</b><b>En validación</b><b>Respuesta</b></div></div>`:''}
  ${ready?`<div class="b3-availability-selected">${ic('store',22)}<span><strong>${esc(st.quote.storeName||'Sede disponible')}</strong><small>${st.quote.serverValidated?'Sede y tarifa verificadas por el servidor': 'Delivery referencial · '+Number(st.quote.straightDistanceKm).toFixed(2)+' km en línea recta'}</small></span></div>
   <button class="primary full" data-availability-continue="1">Continuar con mi pedido ${ic('chev',18)}</button>`:''}
  ${!deliveryRequestPending&&!ready&&!waiting?'<button class="primary full" data-availability-retry="1">Volver a comprobar</button>':''}
  ${deliveryRequestPending?'<div class="b3-availability-wait">'+(waiting?'Esperando la decisión de la sede…':'Consultando locales disponibles…')+'</div>':''}
  ${activeEntry?`<div class="b3-checkout-wait-actions"><button class="primary full" data-checkout-leave="1">Seguir explorando la app</button><button class="outline full" data-checkout-cancel="1">Cancelar solicitud</button></div>`:''}
  ${!activeEntry&&!waiting?'<button class="outline full" data-screen="deliveryAddress">Modificar dirección de entrega</button>':''}
  <p class="smallprint">Se puede enviar una interacción de atención a TU VERSO. No se crea un pedido definitivo ni se realizan cobros; PENDING no significa aprobación.</p>
 </div>`;
}
function identity(){return `<div class="page form">${heading('Tus datos','cart')}<p class="sub">Solo pedimos lo necesario para identificar tu pedido.</p><label>Nombres<input id="first" autocomplete="given-name" value="${esc(st.profile.first)}" maxlength="60" placeholder="Ingresa tus nombres"></label><label>Apellidos<input id="last" autocomplete="family-name" value="${esc(st.profile.last)}" maxlength="60" placeholder="Ingresa tus apellidos"></label><label>DNI o CE (opcional)<input id="doc" autocomplete="off" value="${esc(st.profile.doc)}" placeholder="Solo si necesitas un comprobante"></label><button class="primary full" data-identity-next="1">Continuar</button></div>`}
function phone(){return `<div class="page form">${heading('Tu teléfono','identity')}<p class="sub">Lo usaremos para identificar tu pedido. En esta demo no enviaremos mensajes ni códigos.</p><label>Celular de Perú<div class="phone-field"><b>+51</b><input id="phone" inputmode="numeric" maxlength="9" value="${esc(st.profile.phone)}" placeholder="9 dígitos"></div></label><button class="primary full" data-phone-next="1">Continuar</button></div>`}
function prepaymentReview(){
 const entry=window.B3OrderAvailability?.readInteraction?.();
 const valid=entry?.status==='ACCEPTED'&&deliveryQuoteValid();
 const store=shops.find(x=>x.id===st.store);
 const items=st.cart.map(item=>{const p=product(item.id);return '<p>'+esc(p?.name||'Producto')+' ×'+item.qty+' <b>'+cash((p?.price||0)*item.qty)+'</b></p>'}).join('');
 return `<div class="page">${heading('Revisa tu pedido','availability')}
  <div class="summary-card">
   <h2>${valid?'¡El local aceptó tu solicitud!':'Cotización pendiente de verificar'}</h2>
   <p>${esc(store?.name||'Sede por confirmar')} · ${esc(st.profile.address||'')} · ${esc(st.profile.district||'')}</p>
   <hr>${items}<hr>
   <p>Productos <b>${cash(subtotal())}</b></p>
   <p>Delivery <b>${valid?cash(st.quote.deliveryFeePen):'Por confirmar'}</b></p>
   <p class="grand">Total a pagar <strong>${valid?cash(orderTotal()):'Pendiente'}</strong></p>
  </div>
  ${checkoutReviewNote?'<div class="notice" role="alert">'+esc(checkoutReviewNote)+'</div>':''}
  <p class="smallprint">No se realizará ningún cobro. Solo podrás revisar los métodos de pago disponibles.</p>
  <button class="primary full" data-prepay-payment="1" ${valid?'':'disabled'}>Elegir método de pago</button>
  <button class="outline full" data-prepay-add="1">Agregar o cambiar productos</button>
  ${!valid?'<button class="outline full" data-prepay-retry="1">Reintentar cotización</button>':''}
 </div>`;
}
function payment(){
 const available=paymentOptions();
 const selected=shops.find(x=>String(x.id)===String(st.store));
 const missing=st.configReady&&!available.length;
 return `<div class="page">${heading('Método de pago','phone')}
 <p class="sub">Solo aparecen los métodos habilitados para tu local y modalidad. No hay cobros reales en este piloto.</p>
 <div class="method-list">${available.map(([id,title,sub])=>`<button class="${st.pay===id?'chosen':''}" data-pay="${id}">${ic(id==='cash'?'store':'card')}<span><b>${title}</b><small>${sub}</small></span><span class="radio"></span></button>`).join('')}</div>
 ${missing?`<div class="notice" role="alert">${esc(selected?.name||'La sede asignada')} no tiene métodos de pago publicados para ${st.mode==='delivery'?'delivery':'recojo'}. Deben habilitarse desde el administrador web antes de continuar.</div><button type="button" class="outline full" data-screen="${st.mode==='delivery'?'deliveryAddress':'locations'}">Cambiar sede o modalidad</button>`:''}
 ${!missing&&st.pay==='cash'?`<label>¿Con cuánto vas a pagar?<input id="cash" inputmode="decimal" placeholder="Ej. 100" value="${esc(st.cash)}"></label><div class="notice" id="change">${Number(st.cash)>=orderTotal()?`Vuelto referencial: ${cash(Number(st.cash)-orderTotal())}`:'Ingresa un monto igual o mayor al total'}</div>`:''}
 ${checkoutReviewNote?`<div class="notice" role="alert">${esc(checkoutReviewNote)}</div>`:''}
 ${st.mode==='delivery'&&st.quote?.quoteOrigin==='ADMIN_API_ACCEPTED'?
   '<div class="notice">Puedes revisar los métodos habilitados. La confirmación y el cobro quedan para la siguiente fase.</div>':
   `<button class="primary full" data-pay-next="1" ${missing||checkoutRefreshPending?'disabled':''}>${checkoutRefreshPending?'Verificando locales y costo...':'Continuar'}</button>`}</div>`;
}
function summary(){
 const selectedStore=shops.find(x=>String(x.id)===String(st.store));
 const items=st.cart.map(x=>{const p=product(x.id);return '<p>'+esc(p?.name||'Producto retirado')+' ×'+x.qty+' <b>'+(p?cash(x.qty*p.price):'Revisar')+'</b></p>'}).join('');
 const methods={yape:'Yape',plin:'Plin',card:'Tarjeta',click:'Click to Pay',cash:'Efectivo al recibir'};
 return `<div class="page">${heading('Resumen de tu pedido','payment')}<div class="summary-card">
 <h2>${st.mode==='delivery'?'Delivery':'Recojo en tienda'}</h2>
 <p>${st.mode==='delivery'?esc(st.profile.address+', '+(st.profile.district||'')):(selectedStore?esc(selectedStore.name+' · '+(selectedStore.address||selectedStore.addr||'')):'Local por confirmar')}</p>
 <hr><p>Pago: <b>${esc(methods[st.pay]||'Por seleccionar')}</b></p>
 ${items}<hr><p>Subtotal <b>${cash(subtotal())}</b></p>
 <p>Delivery <span>${st.mode==='delivery'?(deliveryQuoteValid()?cash(st.quote.deliveryFeePen):'Pendiente de cotizar'):'No aplica'}</span></p>
 ${st.mode==='delivery'&&deliveryQuoteValid()?`<p>Sede: ${esc(st.quote.storeName||selectedStore?.name||'Asignada por cobertura')} · ${st.quote.serverValidated?'Cotización de servidor':Number(st.quote.straightDistanceKm).toFixed(2)+' km aproximados en línea recta · '+(st.quote.deliveryPricingMode==='FIXED'?'Tarifa fija':'Tarifa por kilómetro')}</p><p class="smallprint">${st.quote.serverValidated?'Disponibilidad validada. No reserva productos ni crea un pedido comercial.':'Distancia estimada, no equivale a un recorrido por carretera.'}</p>`:''}
 <p class="grand">Total estimado <strong>${st.mode==='delivery'&&!deliveryQuoteValid()?'Pendiente de cotizar':cash(orderTotal())}</strong></p>
 </div>${checkoutReviewNote?`<div class="notice" role="alert">${esc(checkoutReviewNote)}</div>`:''}
 <div class="notice">Recorrido de prueba: no se confirmarán pagos ni se enviarán pedidos a Pollos B3.</div>
 <button class="primary full" data-confirm="1" ${checkoutRefreshPending?'disabled':''}>${checkoutRefreshPending?'Verificando disponibilidad...':'Registrar pedido de prueba'}</button></div>`;
}
function success(){let o=st.orders[0];return `<div class="success"><div class="success-mark">${ic('check',54)}</div><h1>¡Pedido de prueba registrado!</h1><p>Este pedido se guardó en tu teléfono. <b>No fue enviado a Pollos B3 ni cobrado.</b></p><div class="success-box"><b>${esc(o?.id||'')}</b><span>${cash(o?.total||0)}</span><small>Simulación local</small></div><button class="primary full" data-tab="pedidos">Ver mis pedidos</button><button class="outline full" data-tab="inicio">Volver al inicio</button></div>`}
function chat(){return `<div class="chat-screen">${heading('Ayuda · Pollos B3','app')}<div class="chat-info">${ic('chat')}<span>Chat exclusivo para pedidos pagados</span></div><div class="chat-messages"><div class="message agent">El chat estará disponible cuando tu pedido tenga un pago confirmado y la atención siga abierta. Durante la compra no es necesario enviar mensajes.</div></div><form id="chat-form" class="chat-compose"><input id="chat-message" placeholder="Mensajes deshabilitados hasta confirmar el pago" aria-label="Mensajes deshabilitados" disabled><button type="submit" disabled aria-label="Enviar mensaje deshabilitado">${ic('chev')}</button></form></div>`}
function about(){return `<div class="page about b3-about-new">${heading('Sobre la app','app')}
 <div class="about-copy"><h2>Pollos B3</h2><p>La aplicación móvil para conocer la carta, consultar locales y preparar pedidos de Delivery o recojo.</p>
 <div class="b3-about-facts"><div><strong>Aplicación</strong><span>Pollos B3 · Android</span></div><div><strong>Versión</strong><span>1.0.0 (piloto)</span></div><div><strong>Estado</strong><span>Pedidos y pagos reales aún no habilitados</span></div></div>
 <p class="b3-about-owner">Pollos B3 · Todos los derechos reservados.</p></div>
 <div class="b3-about-credit"><p>Desarrollo tecnológico</p><img src="images/integra-b2g-new.webp" alt="INTEGRA B2G" loading="lazy"><strong>INTEGRA B2G</strong><span>Soluciones tecnológicas para Pollos B3</span></div>
 </div>`}
function vacancyPhoto(v){
 const src=v.imageUrl;
 if(typeof src!=='string')return '';
 if(v.isDemo===true&&/^images\/demo-(?:horneros|cajeras-meseras)\.webp$/.test(src))return '<img src="'+esc(src)+'" alt="Afiche de demostración: '+esc(v.title)+'" loading="lazy">';
 if(!/^\/api\/v1\/mobile\/images\/[0-9a-f-]{36}$/.test(src)||!API_BASE)return '';
 return '<img src="'+esc(API_BASE+src)+'" alt="Imagen publicada para '+esc(v.title)+'" loading="lazy">';
}
function jobsScreen(){
 const items=visibleVacancies().filter(v=>v&&typeof v.id==='string'&&typeof v.title==='string');
 return '<div class="page b3-jobs">'+heading('Trabaja con nosotros','app')+
 '<p class="sub">'+(catalogPublished?'Conoce las oportunidades publicadas por Pollos B3.':'VACANTES DE DEMOSTRACIÓN · No representan ofertas laborales vigentes.')+'</p>'+
 (items.length?'<div class="b3-job-list">'+items.map(v=>
  '<button class="b3-job-card" data-vacancy="'+esc(v.id)+'">'+
  '<span class="b3-job-thumb">'+(vacancyPhoto(v)||ic('store',26))+'</span>'+
  '<span class="b3-job-copy">'+(v.isDemo?'<span class="b3-job-demo">PRUEBA</span>':'')+'<strong>'+esc(v.title)+'</strong>'+
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
 '<h2>'+esc(v.title)+'</h2>'+(v.isDemo?'<p class="b3-job-test-alert">VISTA DE PRUEBA · Esta publicación no confirma una vacante vigente.</p>':'')+
 (v.summary?'<p class="sub">'+esc(v.summary)+'</p>':'')+
 '<div class="b3-job-facts">'+rows.map(([name,value])=>'<div><strong>'+esc(name)+'</strong><span>'+esc(value)+'</span></div>').join('')+'</div>'+
 (v.description?'<section class="b3-job-section"><h3>Descripción</h3><p>'+esc(v.description)+'</p></section>':'')+
 (v.requirements?'<section class="b3-job-section"><h3>Requisitos</h3><p>'+esc(v.requirements)+'</p></section>':'')+
 (allowed?'<button type="button" class="b3-job-whatsapp" data-apply-vacancy="'+esc(v.id)+'">'+ic('chat',22)+' '+(v.isDemo?'Probar mensaje de WhatsApp':'Postular por WhatsApp')+'</button>':
 '<p class="smallprint">Contacto de postulación no disponible.</p>')+
 '</div>';
}
function applyVacancy(id){
 const v=visibleVacancies().find(x=>x.id===id);
 if(!v||!/^519\d{8}$/.test(String(v.whatsappPhone||'')))return toast('WhatsApp de postulación no disponible');
 const message='Hola, estoy interesado(a) en trabajar en Pollos B3. Quisiera información sobre la vacante de '+v.title+'.'+(v.isDemo?' [MENSAJE DE PRUEBA, NO POSTULACIÓN REAL]':'');
 const url='https://wa.me/'+v.whatsappPhone+'?text='+encodeURIComponent(message);
 if(window.AndroidBridge?.openApplicantWhatsApp)window.AndroidBridge.openApplicantWhatsApp(url);
 else window.open(url,'_blank','noopener,noreferrer');
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
 <button class="primary full" data-address-next="1" ${deliveryRequestPending?"disabled":""}>${deliveryRequestPending?"Buscando sedes...":"Consultar disponibilidad"}</button></div>`}
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
   <p class="smallprint">La información de este piloto se guarda solo en este teléfono, no en un perfil remoto. No se enviarán promociones sin una integración y consentimiento aplicables.</p>
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
 ['¿Cómo puedo consultar la carta y los precios?','En Carta encontrarás los productos y precios disponibles en el catálogo publicado. Durante el piloto puede haber contenido referencial claramente identificado.'],
 ['¿Qué métodos de pago hay?','Los métodos disponibles dependen de la sede y del tipo de pedido. Los pagos reales todavía requieren la integración y activación del servicio.'],
 ['¿Puedo guardar varias direcciones?','Sí. En Mi Cuenta → Mis direcciones puedes agregar, editar, eliminar y elegir una dirección predeterminada. Durante el piloto se guardan solo en este teléfono.'],
 ['¿Puedo hacer un pedido para otra persona?','Puedes introducir una dirección diferente sin guardarla. Antes de confirmar, verifica sus datos de entrega.'],
 ['¿Cómo sé dónde está mi pedido?','La consulta de estados de pedidos reales estará disponible cuando Pollos B3 habilite el sistema de pedidos. Esta versión piloto no confirma compras ni pagos.'],
 ['¿Cómo consulto promociones?','Las promociones aparecerán en la app cuando Pollos B3 las publique oficialmente. Su disponibilidad y condiciones dependen del negocio.'],
 ['¿Cómo me comunico con Pollos B3?','Usa los canales de contacto que el negocio publique. El chat de atención de esta versión piloto todavía no constituye una conversación con un asesor.'],
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
 <div class="b3-privacy-intro">${ic('shield',28)}<div><h2>Tú controlas tu información</h2><p>Conoce qué guarda este piloto de Pollos B3 y cómo administrarlo.</p></div></div>
 <section class="b3-privacy-section"><h3>¿Qué datos utiliza la app?</h3><p>Los datos que ingreses voluntariamente en Mi perfil y durante la preparación de pedidos: nombre, apellidos, celular, correo, fecha de nacimiento opcional, direcciones y referencias de entrega. También se conserva el carrito y la actividad de demostración en este dispositivo.</p><p>No es necesario registrarse para explorar la carta.</p></section>
 <section class="b3-privacy-section"><h3>¿Para qué se usan?</h3><p>Para completar formularios con mayor facilidad, elegir direcciones y preparar pedidos. Esta versión piloto no procesa pedidos ni cobros reales, y no sincroniza tu perfil o tus direcciones con una cuenta en línea.</p></section>
 <section class="b3-privacy-section"><h3>Almacenamiento y servicios externos</h3><p>Los datos del perfil, las direcciones guardadas y tus preferencias se almacenan localmente en la aplicación mediante el almacenamiento del dispositivo. No se cifran de forma independiente dentro de ese almacenamiento ni existe todavía una cuenta remota para sincronizarlos.</p><p>Al consultar el catálogo o solicitar una cotización de Delivery, la aplicación puede comunicarse con el servidor de Pollos B3. La dirección de entrega introducida para cotizar puede enviarse al servidor y utilizarse para consultar rutas. Las consultas no se realizan simplemente por guardar una dirección.</p></section>
 <section class="b3-privacy-section"><h3>Ubicación y permisos</h3><p>La ubicación GPS es opcional. Se solicita permiso cuando eliges utilizar tu ubicación; puedes rechazarlo y escribir la dirección manualmente. Podrás administrar los permisos desde los ajustes de Android.</p></section>
 <section class="b3-privacy-section"><h3>Publicidad y comunicaciones</h3><p>El consentimiento para ofertas y novedades es opcional y está desactivado por defecto. Puedes cambiarlo desde Mi perfil. Guardarlo aquí no activa envíos de WhatsApp, SMS o notificaciones promocionales.</p><button class="b3-privacy-secondary" data-screen="profile">Administrar consentimiento ${ic('chev',15)}</button></section>
 <section class="b3-privacy-section"><h3>Tus derechos</h3><p>En Perú, la Ley N.° 29733 reconoce derechos relacionados con el tratamiento de datos personales, incluidos acceso, rectificación, cancelación y oposición, conforme a la normativa aplicable.</p><p>Antes de lanzar cuentas y pedidos reales, Pollos B3 deberá publicar su política de privacidad definitiva, identificar al responsable y facilitar un canal verificable para ejercer estos derechos. Esta explicación del piloto no sustituye esa política legal.</p><button class="b3-privacy-secondary" data-privacy-law="1">Consultar normativa peruana ${ic('chev',15)}</button></section>
 <section class="b3-privacy-delete"><h3>Mis datos en este teléfono</h3><p>${saved===1?'1 dirección guardada':saved+' direcciones guardadas'} · Perfil y preferencias de esta instalación.</p><p>Si borras los datos locales, desaparecerán del dispositivo el perfil, las direcciones, el carrito, la actividad de prueba y las preferencias guardadas. No solicita eliminar información que pudiera existir en sistemas externos.</p><button class="outline full" data-privacy-clear="1">Borrar mis datos locales</button></section>
 <p class="smallprint">Información funcional del piloto, no una política corporativa final ni una garantía de tratamiento para servicios que todavía no están desplegados.</p></div>`;
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
function signin(){let byPhone=st.stage==='signin-phone';return `<div class="page form">${heading('Ingreso de demostración','login')}<p class="sub">Este acceso no verifica tu identidad y solo se utiliza para probar la navegación.</p><label>${byPhone?'Celular (+51)':'Correo electrónico'}<input id="signin-value" ${byPhone?'inputmode="numeric" maxlength="9"':'type="email"'} placeholder="${byPhone?'9 dígitos':'correo@ejemplo.com'}"></label><button class="primary full" data-demo-signin="${byPhone?'phone':'email'}">Entrar en modo prueba</button><p class="smallprint">No uses información real ni contraseñas.</p></div>`}
function render(){if(['PENDING','ACCEPTED','SUBMITTING'].includes(window.B3OrderAvailability?.readInteraction?.()?.status)&&!agentDecisionTimer&&!agentDecisionPolling)scheduleAgentDecisionPoll(1500);if(st.stage==='app'&&st.tab==='inicio'&&!homeLocationPrompted){homeLocationPrompted=true;setTimeout(()=>{if(st.stage==='app'&&st.tab==='inicio'&&window.AndroidBridge?.requestLocation)window.AndroidBridge.requestLocation()},150)}if(window.AndroidBridge?.setSplash)window.AndroidBridge.setSplash(st.stage==='splash');let html='';if(st.stage==='splash')html=splash();else if(st.stage==='login')html=login();else if(st.stage==='app')html=main();else if(st.stage==='choice')html=choice();else if(st.stage==='locations')html=locations();else if(st.stage==='localDetail')html=localDetail();else if(st.stage==='orderDetail')html=orderDetail();else if(st.stage==='profile')html=profileScreen();else if(st.stage==='address')html=addressesScreen();else if(st.stage==='addressEdit')html=addressEditScreen();else if(st.stage==='deliveryAddress')html=address();else if(st.stage==='availability')html=availability();else if(st.stage==='detail')html=detail();else if(st.stage==='cart')html=cart();else if(st.stage==='identity')html=identity();else if(st.stage==='phone')html=phone();else if(st.stage==='prepaymentReview')html=prepaymentReview();else if(st.stage==='payment')html=payment();else if(st.stage==='summary')html=summary();else if(st.stage==='success')html=success();else if(st.stage==='chat')html=chat();else if(st.stage==='jobs')html=jobsScreen();else if(st.stage==='vacancyDetail')html=vacancyDetail();else if(st.stage==='about')html=about();else if(st.stage==='faq')html=faqScreen();else if(st.stage==='claims')html=complaintsScreen();else if(st.stage==='privacy')html=privacyScreen();else if(st.stage==='notifications')html=notificationsScreen();else if(st.stage==='notificationDetail')html=notificationDetailScreen();else if(st.stage.startsWith('signin-'))html=signin();else html=infoScreen();root.innerHTML=html+(st.stage!=='availability'&&st.stage!=='splash'&&st.stage!=='prepaymentReview'&&st.stage!=='payment'?personalCheckoutBanner():'')+(!['splash','login','app','chat','signin-phone','signin-email'].includes(st.stage)?`<button class="persistent-chat" data-screen="chat" aria-label="Abrir chat de ayuda">${ic('chat',23)}</button>`:'')+(st.notice?`<div class="toast">${esc(st.notice)}</div>`:'')+favoritePrompt()+reviewSheet()+marketingPrompt();if(st.stage==='app'&&st.tab==='inicio')scheduleMarketingPrompt();}
function v(id){return document.getElementById(id)?.value.trim()||''}
function checkoutSnapshot(){
 return {store:String(st.store||''),total:Math.round(orderTotal()*100),
  items:st.cart.map(x=>{const p=product(x.id);return [x.id,x.qty,p?.price??'missing'].join(':')}).join('|')};
}
function finalizeDemoOrder(){
 const issue=checkoutCartIssue();if(issue){checkoutReviewNote=issue;screen('cart');return}
 if(st.mode==='delivery'&&!deliveryQuoteValid()){checkoutReviewNote='La sede debe validar disponibilidad y tarifa antes de continuar.';screen('availability');return}
 if(st.mode==='pickup'&&!eligibleForPickup(shops.find(x=>String(x.id)===String(st.store)))){checkoutReviewNote='El local de recojo ya no está disponible.';screen('locations');return}
 if(!paymentOptions().some(x=>x[0]===st.pay)){checkoutReviewNote='El método de pago ya no está disponible.';screen('payment');return}
 const order={id:'B3-DEMO-'+String(Date.now()),ts:Date.now(),total:orderTotal(),items:st.cart.map(x=>({id:x.id,qty:x.qty})),mode:st.mode,pay:st.pay,status:'RECEIVED',demo:true,deliveredAt:null,favoritePromptDone:false,reviewDismissed:false};
 st.orders.unshift(order);st.cart=[];save();screen('success');
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
  if(next==='confirm')finalizeDemoOrder();
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
 if(!st.mode){checkoutPending=true;screen('choice');return}
 if(st.mode==='delivery'){
  checkoutPending=true;
  if(!hasDeliveryDestination(st.profile.address,st.profile.district)){screen('deliveryAddress');return}
  void resolveDelivery();return
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
function addToCart(id,qty=1){if(activePersonalCheckout())return false;let p=product(id);if(!p||p.disabled)return false;let found=st.cart.find(x=>x.id===id);if(found)found.qty+=qty;else st.cart.push({id,qty});invalidateDeliverySelection();save();toast('Agregado a tu pedido');return true}
function swipeHandler(el,startCb,nextCb){let x=null;el.addEventListener('touchstart',e=>{x=e.touches[0].clientX},{passive:true});el.addEventListener('touchend',e=>{if(x!==null){let dx=e.changedTouches[0].clientX-x;if(Math.abs(dx)>42)nextCb(dx<0?1:-1);x=null}},{passive:true})}
root.addEventListener('click',e=>{let b=e.target.closest('[data-notification-open],[data-notification-catalog],[data-marketing-first-accept],[data-marketing-first-later],[data-marketing-toggle],[data-notifications-refresh],[data-order-open],[data-demo-next],[data-repeat-order],[data-fav-reorder],[data-fav-remove],[data-accept-favorite],[data-decline-favorite],[data-open-review],[data-review-backdrop],[data-review-close],[data-review-star],[data-review-tag],[data-review-send],[data-privacy-clear],[data-privacy-law],[data-book-open],[data-book-guidance],[data-profile-save],[data-address-create],[data-address-edit],[data-address-delete],[data-address-default],[data-address-choose],[data-address-save],[data-vacancy],[data-apply-vacancy],[data-home-store],[data-home-store-close],[data-home-store-mode],[data-home-local],[data-open-fulfillment],[data-modal-mode],[data-modal-save-delivery],[data-modal-pickstore],[data-modal-close],[data-modal-back],[data-gps],[data-pickup-origin-save],[data-clearsearch],[data-tab],[data-screen],[data-guest],[data-mode],[data-store],[data-pickstore],[data-fulfillment],[data-start],[data-product],[data-quick],[data-add],[data-qty],[data-filter],[data-carousel],[data-promo],[data-local],[data-cartdelta],[data-remove],[data-prepay-payment],[data-prepay-add],[data-prepay-cancel],[data-prepay-retry],[data-checkout-return],[data-checkout-leave],[data-checkout-cancel],[data-availability-continue],[data-availability-retry],[data-availability-health],[data-identity-next],[data-phone-next],[data-address-next],[data-pay],[data-pay-next],[data-confirm],[data-social],[data-demo-signin],[data-logout],[data-openmaps],[data-clear]');if(!b)return;
const liveRequest=window.B3OrderAvailability?.readInteraction?.();
if(['SUBMITTING','PENDING','ACCEPTED'].includes(liveRequest?.status)&&
   (b.hasAttribute('data-identity-next')||b.hasAttribute('data-phone-next')||
    b.hasAttribute('data-address-next')||b.hasAttribute('data-modal-save-delivery')||
    b.hasAttribute('data-modal-mode')||b.hasAttribute('data-mode'))){
 toast('Primero debes cancelar la solicitud actual para cambiar la dirección o modalidad.');
 returnToPersonalCheckout();
 return;
}
if(['SUBMITTING','PENDING','ACCEPTED'].includes(liveRequest?.status)&&
   (b.hasAttribute('data-add')||b.hasAttribute('data-cartdelta')||b.hasAttribute('data-remove'))){
 toast('Primero debes cancelar la solicitud actual para cambiar los productos.');
 screen(liveRequest.status==='ACCEPTED'?'prepaymentReview':'availability');
 return;
}
if(b.dataset.orderOpen){
 const o=findLocalOrder(b.dataset.orderOpen);if(!o)return;
 selectedOrderId=o.id;screen('orderDetail');return;
}
if(b.dataset.demoNext){
 const o=findLocalOrder(b.dataset.demoNext);if(!o||!isDemoOrder(o)||o.status==='DELIVERED')return;
 const i=ORDER_STAGES.findIndex(x=>x[0]===o.status);
 if(i<0||i>=4)return;
 o.status=ORDER_STAGES[i+1][0];
 if(o.status==='DELIVERED'){o.deliveredAt=Date.now();o.reviewDismissed=false}
 save();render();
 if(o.status==='DELIVERED')afterOrderDelivered(o);
 return;
}
if(b.dataset.repeatOrder||b.hasAttribute('data-fav-reorder')){
 const from=b.dataset.repeatOrder?findLocalOrder(b.dataset.repeatOrder)?.items:st.favorite?.items;
 if(!Array.isArray(from)||!from.length)return;
 if(!from.every(x=>{const p=product(x.id);return p&&!p.disabled&&Number.isInteger(x.qty)&&x.qty>0}))return toast('Uno de los productos ya no está disponible');
 st.cart=from.map(x=>({id:x.id,qty:x.qty}));
 st.store='';st.quote=null;save();screen('choice');return;
}
if(b.hasAttribute('data-fav-remove')){if(window.confirm('¿Quitar el pedido favorito?')){st.favorite=null;save();render()}return}
if(b.hasAttribute('data-accept-favorite')||b.hasAttribute('data-decline-favorite')){
 const o=findLocalOrder(favoritePromptOrderId);if(!o)return;
 if(b.hasAttribute('data-accept-favorite'))st.favorite={items:o.items.map(x=>({id:x.id,qty:x.qty})),createdAt:Date.now()};
 o.favoritePromptDone=true;favoritePromptOrderId=null;save();render();
 if(!o.review&&!o.reviewDismissed){reviewSheetOrderId=o.id;reviewScore=0;reviewTags=[];render()}
 return;
}
if(b.dataset.openReview){
 const o=findLocalOrder(b.dataset.openReview);if(!orderDelivered(o)||o.review)return;
 reviewSheetOrderId=o.id;reviewScore=0;reviewTags=[];render();return;
}
if(b.hasAttribute('data-review-close')||b.hasAttribute('data-review-backdrop')){
 if(b.hasAttribute('data-review-backdrop')&&e.target!==b)return;
 const o=findLocalOrder(reviewSheetOrderId);if(o){o.reviewDismissed=true;save()}
 reviewSheetOrderId=null;render();return;
}
if(b.dataset.reviewStar){const comment=document.getElementById('review-comment')?.value||'';reviewScore=Number(b.dataset.reviewStar);render();const input=document.getElementById('review-comment');if(input)input.value=comment;return}
if(b.dataset.reviewTag){
 const tag=b.dataset.reviewTag;
 reviewTags=reviewTags.includes(tag)?reviewTags.filter(x=>x!==tag):[...reviewTags,tag];
 const comment=document.getElementById('review-comment')?.value||'';
 render();const area=document.getElementById('review-comment');if(area)area.value=comment;return;
}
if(b.hasAttribute('data-review-send')){
 const o=findLocalOrder(reviewSheetOrderId);
 if(!o||!orderDelivered(o)||o.review)return;
 if(!Number.isInteger(reviewScore)||reviewScore<1||reviewScore>5)return toast('Selecciona una calificación de 1 a 5 estrellas');
 o.review={score:reviewScore,tags:[...reviewTags],comment:(document.getElementById('review-comment')?.value||'').trim().slice(0,250),createdAt:Date.now(),localOnly:true};
 reviewSheetOrderId=null;save();render();toast('Opinión guardada localmente; no enviada a Pollos B3');return;
}
if(b.hasAttribute('data-privacy-law')){openPrivacyLaw();return}
if(b.hasAttribute('data-privacy-clear')){if(!window.confirm('¿Borrar definitivamente los datos guardados en este dispositivo? Se eliminarán perfil, direcciones, carrito y datos de prueba.'))return;window.B3OrderAvailability?.eraseLocalIdentity();localStorage.removeItem(K);location.reload();return}
if(b.hasAttribute('data-book-open')){openComplaintsUrl(false);return}
if(b.hasAttribute('data-book-guidance')){openComplaintsUrl(true);return}
if(b.dataset.vacancy){selectedVacancyId=b.dataset.vacancy;screen('vacancyDetail');return}
if(b.dataset.applyVacancy){applyVacancy(b.dataset.applyVacancy);return}
if(b.hasAttribute('data-home-store-close')){if(b.classList.contains('b3-store-detail-backdrop')&&e.target!==b)return;selectedHomeStore=null;render();return}
if(b.dataset.homeStore){selectedHomeStore=b.dataset.homeStore;render();return}
if(b.dataset.homeLocal!==undefined){carouselMotion.pauseUntil=Date.now()+6000;animateCarousel('local',Number(b.dataset.homeLocal));return}
if(b.dataset.homeStoreMode){const mode=b.dataset.homeStoreMode,s=shops.find(x=>String(x.id)===String(selectedHomeStore));if(!storeAllowed(s,mode)||(mode==='pickup'&&!eligibleForPickup(s)))return;selectedHomeStore=null;if(mode==='pickup'){void confirmStore('pickup',s.id)}else{st.mode='delivery';st.store='';st.quote=null;fulfillmentModal='delivery';render()}return}
if(b.hasAttribute('data-open-fulfillment')){fulfillmentModal='choose';if(API_BASE)void fetchConfig();render();return}
if(b.hasAttribute('data-modal-close')){if(b.classList.contains('b3-modal-backdrop')&&e.target!==b)return;checkoutPending=false;fulfillmentModal=null;render();return}
if(b.hasAttribute('data-modal-back')){fulfillmentModal='choose';render();return}
if(b.dataset.modalMode){
 const next=b.dataset.modalMode;
 if(next!=='delivery'&&next!=='pickup')return;
 if(st.mode!==next){deliveryValidationGeneration++;deliveryRequestPending=false;window.B3OrderAvailability?.clear();st.mode=next;st.store='';st.quote=null;st.pay='';st.coords=null;save();if(st.cart.length)st.notice='Al cambiar de modalidad se deberán verificar los productos, precios y medios de pago.'}
 fulfillmentModal=next;render();if(next==='pickup'&&API_BASE)void fetchConfig();return;
}
if(b.hasAttribute('data-profile-save')){saveProfile();return}
if(b.dataset.addressCreate){addressEditId=null;screen('addressEdit');return}
if(b.dataset.addressEdit){addressEditId=b.dataset.addressEdit;screen('addressEdit');return}
if(b.dataset.addressDelete){
 const item=savedAddresses().find(a=>a.id===b.dataset.addressDelete);
 if(!item||!window.confirm('¿Eliminar esta dirección guardada?'))return;
 st.addresses=savedAddresses().filter(a=>a.id!==item.id);
 if(st.defaultAddressId===item.id)st.defaultAddressId=st.addresses[0]?.id||null;
 save();render();return
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
 st.mode='delivery';st.profile.address=v('address');st.profile.district=v('district');st.profile.reference=v('reference');invalidateDeliverySelection();maybeSaveDeliveryAddress();
 save();void resolveDelivery();return;
}
if(b.dataset.modalPickstore){void confirmStore('pickup',b.dataset.modalPickstore);return;}
if(b.hasAttribute('data-gps')){deliveryGpsRequested=fulfillmentModal==='delivery'||st.stage==='deliveryAddress';if(window.AndroidBridge?.requestLocation)window.AndroidBridge.requestLocation();else if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>window.b3NativeLocation(p.coords.latitude,p.coords.longitude,null),()=>window.b3NativeLocation(null,null,'Permiso denegado o GPS desactivado'),{enableHighAccuracy:true,timeout:12000});else {deliveryGpsRequested=false;toast('GPS no disponible. Ingresa la dirección manualmente.')}return}if(b.hasAttribute('data-pickup-origin-save')){st.pickupOrigin=v('pickup-origin');st.coords=null;save();render();return}if(b.hasAttribute('data-clearsearch')){st.search='';render();return}if(b.hasAttribute('data-checkout-return')){returnToPersonalCheckout();return}
if(b.hasAttribute('data-checkout-leave')){nav('inicio');return}
if(b.hasAttribute('data-checkout-cancel')){void cancelPersonalCheckout('CANCEL');return}
if(b.dataset.tab){if(b.dataset.tab==='carta')st.search='';nav(b.dataset.tab);return}if(b.hasAttribute('data-marketing-first-later')){localStorage.setItem(MARKETING_PROMPT_KEY,'later');marketingPromptVisible=false;render();return}
if(b.hasAttribute('data-marketing-first-accept')){localStorage.setItem(MARKETING_PROMPT_KEY,'accepted');marketingPromptVisible=false;render();window.AndroidBridge?.setMarketingNotificationsEnabled?.(true);return}
if(b.hasAttribute('data-marketing-toggle')){if(window.AndroidBridge?.setMarketingNotificationsEnabled){window.AndroidBridge.setMarketingNotificationsEnabled(!window.AndroidBridge.marketingNotificationsEnabled());}else toast('Las notificaciones push solo están disponibles en Android.');return}
if(b.dataset.notificationOpen){openNotificationDetail(b.dataset.notificationOpen);return}
if(b.hasAttribute('data-notification-catalog')){nav('carta');return}
if(b.hasAttribute('data-notifications-refresh')){void fetchNotifications();return}
if(b.dataset.screen){
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
  if(st.mode==='pickup'&&st.store)void revalidateCheckout('cart');
  return;
 }
 if(checkoutPending&&!['choice','locations','deliveryAddress'].includes(b.dataset.screen))checkoutPending=false;
 screen(b.dataset.screen);return;
}
if(b.hasAttribute('data-guest')){st.registered=false;enterApp();return}
if(b.dataset.mode){if(activePersonalCheckout()){returnToPersonalCheckout();return}if(st.mode!==b.dataset.mode){deliveryValidationGeneration++;deliveryRequestPending=false;window.B3OrderAvailability?.clear();st.store='';st.quote=null;clearDeliveryAvailability();st.pay='';st.coords=null;if(st.cart.length)st.notice='Modalidad modificada. Verifica productos, importes y pagos.'}st.mode=b.dataset.mode;save();if(st.mode==='delivery')screen('deliveryAddress');else {screen('locations');if(API_BASE)void fetchConfig()}return}
if(b.dataset.store){void confirmStore('pickup',b.dataset.store,{showDetails:!checkoutPending});return}if(b.dataset.pickstore){void confirmStore('pickup',b.dataset.pickstore,{showDetails:!checkoutPending});return}
if(b.dataset.fulfillment){st.fulfillment=b.dataset.fulfillment;render();return}
if(b.hasAttribute('data-start')){
 if(st.stage==='localDetail'&&st.mode==='pickup'){void confirmStore('pickup',st.store);return}
 if(st.selected&&product(st.selected)){screen('detail');return}
 nav('carta');return;
}
if(b.dataset.product||b.dataset.quick){
 const requested=b.dataset.product||b.dataset.quick;
 const selectedProduct=product(requested);
 if(!selectedProduct||selectedProduct.disabled)return toast('Este producto no está disponible en la carta actual.');
 st.selected=requested;st.qty=1;
 // Browsing a product must never require delivery coverage or a pickup location.
 screen('detail');return;
}
if(b.dataset.qty){st.qty=Math.max(1,Math.min(30,st.qty+Number(b.dataset.qty)));render();return}
if(b.hasAttribute('data-add')){const photo=root.querySelector('.detail-photo img');const source=photo||b;const r=source.getBoundingClientRect();const fromRect={left:r.left,top:r.top,width:r.width,height:r.height};const imageSrc=photo?.currentSrc||photo?.src||'';const qty=st.qty;if(addToCart(st.selected,qty)){nav('carta');animateAddedProduct(fromRect,imageSrc,qty)}else toast('Producto no disponible para esta demo');return}
if(b.dataset.filter){st.category=b.dataset.filter;render();return}
if(b.dataset.carousel!==undefined){carouselMotion.pauseUntil=Date.now()+6000;animateCarousel('hero',Number(b.dataset.carousel));return}if(b.dataset.promo!==undefined){carouselMotion.pauseUntil=Date.now()+6000;animateCarousel('promo',Number(b.dataset.promo));return}if(b.dataset.local!==undefined){st.local=Number(b.dataset.local);render();return}
if(b.dataset.cartdelta){let [id,delta]=b.dataset.cartdelta.split('|');let c=st.cart.find(x=>x.id===id);if(c){c.qty+=Number(delta);st.cart=st.cart.filter(x=>x.qty>0);invalidateDeliverySelection();save();render()}return}
if(b.dataset.remove){st.cart=st.cart.filter(x=>x.id!==b.dataset.remove);invalidateDeliverySelection();save();render();return}
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
if(b.hasAttribute('data-availability-retry')){if(!deliveryRequestPending)void resolveDelivery();return}
if(b.hasAttribute('data-availability-health')){void checkDeliveryBackendHealth();return}
if(b.hasAttribute('data-address-next')){if(deliveryRequestPending)return;if(v('address').length<6||v('district').length<2)return toast('Completa tu dirección y distrito');st.profile.address=v('address');st.profile.district=v('district');st.profile.reference=v('reference');st.mode='delivery';invalidateDeliverySelection();maybeSaveDeliveryAddress();save();void resolveDelivery();return}
if(b.hasAttribute('data-identity-next')){if(v('first').length<2||v('last').length<2||v('first').length>60||v('last').length>60)return toast('Ingresa nombres y apellidos de hasta 60 caracteres');st.profile.first=v('first');st.profile.last=v('last');st.profile.doc=v('doc');save();screen('phone');return}
if(b.hasAttribute('data-phone-next')){if(!/^9\d{8}$/.test(v('phone')))return toast('Ingresa un celular peruano válido de 9 dígitos');st.profile.phone=v('phone');save();
 if(st.mode==='delivery'){
  if(!st.profile.address||!st.profile.district){screen('deliveryAddress');return}
  void resolveDelivery();return
 }
 void revalidateCheckout('payment');return}
if(b.dataset.pay){if(!paymentOptions().some(x=>x[0]===b.dataset.pay))return toast('Método no habilitado');st.pay=b.dataset.pay;checkoutReviewNote='';render();return}
if(b.hasAttribute('data-pay-next')){if(st.mode==='delivery'&&st.quote?.quoteOrigin==='ADMIN_API_ACCEPTED')return toast('La integración de pagos se implementará en una fase posterior.');if(checkoutRefreshPending)return;if(!paymentOptions().some(x=>x[0]===st.pay))return toast('Elige un método de pago habilitado');if(st.pay==='cash')st.cash=v('cash');save();void revalidateCheckout('summary');return}
if(b.hasAttribute('data-confirm')){if(st.mode==='delivery'&&st.quote?.quoteOrigin==='ADMIN_API_ACCEPTED')return toast('Aún no se realizan cobros reales.');if(checkoutRefreshPending)return;void revalidateCheckout('confirm');return}
if(b.dataset.social){toast('Facebook requiere una integración real. Usa invitado para probar.');return}
if(b.dataset.demoSignin){const x=v('signin-value');if(b.dataset.demoSignin==='phone'?!/^9\d{8}$/.test(x):!/^\S+@\S+\.\S+$/.test(x))return toast('Completa el dato con un formato válido');st.registered=true;if(b.dataset.demoSignin==='phone')st.profile.phone=x;else st.profile.email=x;save();enterApp();return}
if(b.hasAttribute('data-logout')){st.registered=false;save();render();return}
if(b.dataset.openmaps){if(window.AndroidBridge?.openMaps)window.AndroidBridge.openMaps(b.dataset.openmaps);else window.open(b.dataset.openmaps,'_blank');return}
if(b.hasAttribute('data-clear')){if(!window.confirm('¿Eliminar los datos locales de demostración?'))return;localStorage.removeItem(K);location.reload();return}
});
root.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&(e.target.matches('.hero-card[role=button],.promo-card[role=button]'))){e.preventDefault();e.target.click()}});
root.addEventListener('submit',e=>{if(e.target.id==='home-search-form'){e.preventDefault();st.search=(document.getElementById('home-search-field')?.value||'').trim().slice(0,60);st.category='Todos';nav('carta');return}if(e.target.id==='chat-form'){e.preventDefault();toast('El chat se habilitará después de confirmar el pago.')}});
root.addEventListener('input',e=>{if(e.target.id==='address'||e.target.id==='district'){
 deliveryGpsPending=false; // Do not overwrite customer edits with a delayed GPS reverse-geocoding callback.
 deliveryLocation=null;invalidateDeliverySelection();
 deliveryGpsMessage='Dirección editada: se volverá a verificar su ubicación antes de calcular el reparto.';
 deliveryRequestError='';const warning=root.querySelector('[role="alert"]');if(warning)warning.remove()
}if(e.target.id==='cash'){st.cash=e.target.value;let change=document.getElementById('change');if(change)change.textContent=Number(st.cash)>=orderTotal()?`Vuelto referencial: ${cash(Number(st.cash)-orderTotal())}`:'Ingresa un monto igual o mayor al total';}});

/* Carruseles B3: animación física horizontal, gestos táctiles y autoplay sin reconstruir Inicio.
   Solo se desplazan tarjetas visuales; selección de productos y checkout siguen intactos. */
const carouselMotion={active:null,touch:null,pauseUntil:0,suppressClickUntil:0};
const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
function carouselCount(kind){
 return kind==='hero'?Math.min(products.length,4):kind==='local'?shops.filter(s=>s.active!==false).length:
  (catalogPublished?publishedPromotions.length:products.filter(p=>p.cat==='Promociones').length);
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
window.b3OpenFromLink=()=>{
  reviewSheetOrderId=null;
  favoritePromptOrderId=null;
  loginFromAccount=false;
  nav('inicio');
};
window.handleB3Back=()=>{
  if(marketingPromptVisible){localStorage.setItem(MARKETING_PROMPT_KEY,'later');marketingPromptVisible=false;render();return true}
  if(fulfillmentModal){checkoutPending=false;fulfillmentModal=null;render();return true}
  if(st.stage==='app'){
    if(st.tab!=='inicio'){nav('inicio');return true}
    return false; // Native Activity exits; never navigate to splash.
  }
  if(st.stage==='splash')return false;
  if(['availability','prepaymentReview','payment'].includes(st.stage)&&activePersonalCheckout()){
    nav('inicio');return true;
  }
  if(st.stage==='login'){
    if(loginFromAccount){loginFromAccount=false;nav('cuenta');return true}
    return false; // First launch login: close app on Back, not splash.
  }
  if(st.stage.startsWith('signin-')){screen('login');return true}
  if(checkoutPending)checkoutPending=false;
  const previous={availability:'deliveryAddress',notificationDetail:'notifications',orderDetail:'app',addressEdit:'address',deliveryAddress:'choice',address:'app',jobs:'app',vacancyDetail:'jobs',choice:'app',locations:'choice',localDetail:'locations',address:'choice',detail:'app',cart:'app',identity:'cart',phone:'identity',payment:'phone',summary:'payment',chat:'app',about:'app',success:'app'};
  screen(previous[st.stage]||'app');return true
};
render();
fetchConfig();
// Refresh inbox silently; individual offers are still validated when opened.
void fetchNotifications();
// Present branded artwork only on cold launch, then clear it from the navigation stack.
setTimeout(()=>{if(st.stage==='splash')screen(enteredBefore?'app':'login')},3000);
})();