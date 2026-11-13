/* POLLOS B3 — V10 responsive. Prototipo offline: precios y productos referenciales, sin cobros reales. */
(()=>{'use strict';
const K='b3-v6-demo-20261110', root=document.getElementById('app');
const products=[
{id:'p1',name:'1 Pollo a la Brasa',price:47.99,cat:'Pollos',pic:1,desc:'Pollo a la brasa. Acompañamientos sujetos a confirmación de la carta.'},
{id:'p2',name:'1/2 Pollo a la Brasa',price:26.99,cat:'Pollos',pic:2,desc:'Medio pollo a la brasa. Presentación referencial.'},
{id:'p3',name:'1/4 Pollo con Papas',price:12.99,cat:'Pollos',pic:3,desc:'Cuarto de pollo a la brasa con papas. Referencial.'},
{id:'p4',name:'Combo 1',price:57.99,cat:'Promociones',pic:1,desc:'Combo comercial de referencia; verificar contenido y vigencia.'},
{id:'p5',name:'Combo 2',price:31.99,cat:'Promociones',pic:2,desc:'Combo comercial de referencia; verificar contenido y vigencia.'},
{id:'p6',name:'Combo 3',price:61,cat:'Promociones',pic:3,desc:'Combo mostrado en material de referencia. Precio sujeto a validación.'},
{id:'p7',name:'Combo 4',price:71,cat:'Promociones',pic:4,desc:'Combo mostrado en material de referencia. Precio sujeto a validación.'},
{id:'p8',name:'Bebida',price:0,cat:'Bebidas',pic:4,desc:'Consultar presentaciones y precios. No disponible para compra de prueba.',disabled:true}
];
// Los locales se reciben exclusivamente desde el catálogo publicado en la web administrativa.
const shops=[];
let st={coords:null,quote:null,configReady:false,stage:'splash',tab:'inicio',category:'Todos',cart:[],orders:[],profile:{first:'',last:'',phone:'',doc:'',email:'',address:'',reference:''},registered:false,mode:'',pickupOrigin:'',fulfillment:'',store:'',pay:'yape',cash:'',selected:'',qty:1,carousel:0,promo:0,local:0,chat:[],last:'',step:'',notice:'',consent:false};
try{const d=JSON.parse(localStorage.getItem(K)||'{}');st={...st,...d,stage:'splash',tab:'inicio',selected:'',notice:'',configReady:false,quote:null}}catch{}
if(st.mode==='dine_in')st.mode=''; // Retirado de la navegación de Pollos B3 V11.
// Demo-only flag: stores whether the visitor already chose guest access or test sign-in.
let enteredBefore=localStorage.getItem('b3-visitor-entered-v9')==='1';
let loginFromAccount=false;
let fulfillmentModal=null; // null | choose | delivery | pickup; transient UI state, never persisted

const enterApp=()=>{localStorage.setItem('b3-visitor-entered-v9','1');enteredBefore=true;nav('inicio')};
const icons={home:'<path d="m3 10 9-7 9 7v10h-6v-6H9v6H3z"/>',menu:'<path d="M5 5h14M5 10h14M5 15h14M5 20h14"/>',orders:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 9h6M9 13h6"/>',account:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3-7 8-7s8 3 8 7"/>',chat:'<path d="M21 11a8 8 0 0 1-8 8 9 9 0 0 1-4-.9L3 21l2-5a8 8 0 1 1 16-5z"/>',back:'<path d="m15 5-7 7 7 7"/>',cart:'<path d="M3 4h2l2 12h11l3-9H6M10 21h.01M18 21h.01"/>',close:'<path d="m5 5 14 14M19 5 5 19"/>',pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',chev:'<path d="m9 5 7 7-7 7"/>',bike:'<circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M7 17l4-8 5 8M11 9H7M14 7h4l2 3"/>',store:'<path d="M3 10V5h18v5l-2 3H5zM5 13v8h14v-8M9 21v-6h6v6"/>',check:'<path d="m4 12 5 5 11-11"/>',card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2l-2 2v2M12 18h.01"/>',minus:'<path d="M5 12h14"/>',plus:'<path d="M5 12h14M12 5v14"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3-7 8-7s8 3 8 7"/>',trash:'<path d="M4 7h16M10 4h4M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',mail:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="m2 7 10 7 10-7"/>',bell:'<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4"/>',shield:'<path d="M12 2 4 6v6c0 5 4 8 8 10 4-2 8-5 8-10V6z"/>',book:'<path d="M3 4h8v16H3zM13 4h8v16h-8z"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',phone:'<path d="M7 3 4 6c0 8 6 14 14 14l3-3-5-4-3 3a12 12 0 0 1-5-5l3-3z"/>'};
const ic=(n,s=22)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[n]||icons.info}</svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cash=n=>'S/ '+Number(n).toFixed(2), photo=p=>p.imageUrl&&(/^https:\/\//.test(p.imageUrl)||p.imageUrl.startsWith('/api/v1/mobile/images/'))?(p.imageUrl.startsWith('/')?API_BASE+p.imageUrl:p.imageUrl):`images/combo${p.pic||p}.jpg`;
// App ID is registered by the super administrator. An app ID maps to exactly one tenant on the server.
const APP_ID='com.integrab2g.pollosb3';
// Configure only an HTTPS address when the admin server is deployed; never place credentials in Android.
const API_BASE=(()=>{
 const raw=window.AndroidBridge?.getApiBase?.()||'';
 return /^https:\/\//.test(raw)?raw.replace(/\/+$/,''):'';
})();
let publishedRevision=0;
let publishedPromotions=[];
function modeName(m){return ({delivery:'Pollo Delivery',pickup:'Pide y Retira'})[m]||'Elegir modalidad'}
const storeAllowed=(s,m)=>!!s&&s.active!==false&&(m==='delivery'?s.delivery_enabled!==false:m==='pickup'?s.pickup_enabled!==false:s.dine_in_enabled===true);
function availableStores(m){return shops.filter(s=>s.active!==false)}
function localIsClosed(s){return s.hoursConfigured===true&&s.isOpen===false}
function eligibleForPickup(s){return !!s&&s.active!==false&&s.pickup_enabled===true&&!localIsClosed(s)}
function storeStatusHtml(s){
 if(s.hoursConfigured!==true)return '';
 const state=s.isOpen===true?'Abierto':'Cerrado';
 const until=s.isOpen===true&&/^([01]\\d|2[0-3]):[0-5]\\d$/.test(s.closesAt||'')?' · Hasta las '+esc(s.closesAt):'';
 return '<span class="pickup-status '+(s.isOpen===true?'open':'closed')+'">'+state+until+'</span>';
}
function straightDistanceKm(s){
 if(!st.coords||!Number.isFinite(st.coords.lat)||!Number.isFinite(st.coords.lng)||
  !Number.isFinite(Number(s.latitude))||!Number.isFinite(Number(s.longitude))||s.latitude==null||s.longitude==null)return '';
 const rad=x=>x*Math.PI/180,dLat=rad(Number(s.latitude)-st.coords.lat),dLon=rad(Number(s.longitude)-st.coords.lng);
 const a=Math.sin(dLat/2)**2+Math.cos(rad(st.coords.lat))*Math.cos(rad(Number(s.latitude)))*Math.sin(dLon/2)**2;
 return (6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))).toFixed(1)+' km aprox. en línea recta';
}
function paymentOptions(){const s=shops.find(x=>x.id===st.store);const choices=[['yape','Yape','Pago digital sujeto a integración'],['plin','Plin','Pago digital sujeto a integración'],['card','Tarjeta','Pasarela de pago pendiente'],['cash','Pago al recibir','En efectivo, con cálculo de vuelto']];if(!st.configReady||!s)return choices;return choices.filter(x=>(s.paymentMethods?.[st.mode]||[]).includes(x[0]))}
async function fetchConfig(){if(!API_BASE)return;try{const r=await fetch(API_BASE+'/api/v1/mobile/config?appId='+encodeURIComponent(APP_ID),{cache:'no-store'});if(!r.ok)throw Error('API unavailable');const c=await r.json();if(!c.ready){shops.splice(0);st.configReady=false;st.quote=null;render();return}if(!Array.isArray(c.products)||!Array.isArray(c.stores))throw Error('Invalid schema');const revisionChanged=st.configReady&&publishedRevision!==c.revision;publishedRevision=c.revision;publishedPromotions=Array.isArray(c.promotions)?c.promotions:[];if(st.cart.length&&revisionChanged){st.cart=[];st.notice='La carta publicada cambió. Verifica y vuelve a agregar los productos.'}products.splice(0,products.length,...c.products.map(x=>({id:x.id,name:x.name,desc:x.description||'',cat:x.category||'Otros',price:Number(x.pricePen),imageUrl:x.image_url||x.imageUrl,pic:1})));shops.splice(0,shops.length,...c.stores.map(x=>({...x,addr:x.address,radiusKm:Number(x.radiusKm),deliveryFeePen:x.deliveryFeePen})));st.configReady=true;if(revisionChanged){st.quote=null;st.store=''}save();render()}catch(err){console.warn('Catalog unavailable; demo unchanged',err.message)}}
async function resolveDelivery(){if(!st.configReady){toast('Ubicación guardada. La asignación automática requiere conectar la web.');if(st.selected)screen('detail');else nav('carta');return}
 if(!st.coords)return toast('Confirma el punto de entrega usando GPS. La dirección escrita aún no puede geocodificarse.');
 try{const response=await fetch(API_BASE+'/api/v1/mobile/fulfillment/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appId:APP_ID,mode:'delivery',latitude:st.coords.lat,longitude:st.coords.lng})});const result=await response.json();if(!response.ok)throw Error(result.error||'Sin cobertura disponible');st.store=result.storeId;st.quote=result;save();if(st.selected)screen('detail');else nav('carta')}catch(err){toast(err.message)}}
window.b3NativeLocation=(lat,lng,error)=>{if(error){toast(error);return}if(!Number.isFinite(lat)||!Number.isFinite(lng))return toast('No fue posible obtener coordenadas');st.coords={lat,lng};save();if(st.stage==='locations'){render();return}toast('Ubicación recibida. Verifica la dirección escrita.')};
async function confirmStore(mode,id){st.store=id;st.quote=null;const s=shops.find(x=>x.id===id);if(!storeAllowed(s,mode)||(mode==='pickup'&&!eligibleForPickup(s)))return toast('Este local no está disponible para retiro inmediato');if(st.configReady){try{const r=await fetch(API_BASE+'/api/v1/mobile/fulfillment/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appId:APP_ID,mode,storeId:id})});const result=await r.json();if(!r.ok)throw Error(result.error||'Local no disponible');st.quote=result}catch(err){return toast(err.message)}}save();if(st.selected)screen('detail');else nav('carta')}

const save=()=>{const {stage,tab,selected,qty,notice,step,coords,quote,configReady,...d}=st;localStorage.setItem(K,JSON.stringify(d));};
const subtotal=()=>st.cart.reduce((s,x)=>s+x.qty*products.find(p=>p.id===x.id).price,0), cartCount=()=>st.cart.reduce((s,x)=>s+x.qty,0);
const product=id=>products.find(x=>x.id===id);
function toast(t){st.notice=t;render();setTimeout(()=>{if(st.notice===t){st.notice='';render()}},2400)}
function screen(n){if(n==='login' && st.stage==='app')loginFromAccount=true;st.stage=n;window.scrollTo({top:0});render()}
function nav(tab){st.tab=tab;st.stage='app';window.scrollTo({top:0});render()}
function bar(){return `<nav class="bar" aria-label="Navegación"><button class="${st.tab==='inicio'?'active':''}" data-tab="inicio">${ic('home')}<span>Inicio</span></button><button class="${st.tab==='carta'?'active':''}" data-tab="carta">${ic('menu')}<span>Carta</span></button><button class="chat-center" data-screen="chat" aria-label="Abrir chat">${ic('chat',24)}</button><button class="${st.tab==='pedidos'?'active':''}" data-tab="pedidos">${ic('orders')}<span>Pedidos</span></button><button class="${st.tab==='cuenta'?'active':''}" data-tab="cuenta">${ic('account')}<span>Mi Cuenta</span></button></nav>`}
const demo=`<div class="demo">PILOTO · PRECIOS Y FOTOS REFERENCIALES · SIN COBROS REALES</div>`;
const img=(p,c='')=>`<img class="${c}" src="${photo(p)}" alt="Imagen referencial de ${esc(p.name||'combo')}">`;
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
 return \`<header class="b3-compact-header">
   <img class="b3-header-logo" src="images/pollosb3-header-logo.png" alt="Pollos B3">
   <button class="b3-header-target" type="button" data-open-fulfillment="1" aria-label="Cambiar modalidad o destino del pedido">
    <span class="b3-destination-label">\${esc(value.label)}</span>
    <span class="b3-destination-line">\${esc(value.line1)}</span>
    \${value.line2?\`<span class="b3-destination-line">\${esc(value.line2)}</span>\`:''}
   </button>
   <button class="b3-header-edit" type="button" data-open-fulfillment="1" aria-label="Editar destino">\${ic('chev',19)}</button>
 </header>\`;
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
 const modeButtons=\`<div class="b3-modal-modes">
   <button type="button" data-modal-mode="delivery" class="\${st.mode==='delivery'?'chosen':''}">\${ic('bike',25)}<strong>Pollo Delivery</strong><small>A donde estés</small></button>
   <button type="button" data-modal-mode="pickup" class="\${st.mode==='pickup'?'chosen':''}">\${ic('store',25)}<strong>Pide y Retira</strong><small>Recoge en el local</small></button>
 </div>\`;
 const deliveryPanel=\`<div class="b3-modal-fields">
   <button type="button" class="outline full" data-gps="1">\${ic('pin',18)} Usar mi ubicación actual</button>
   <p class="smallprint">\${st.coords?'Ubicación GPS recibida. Verifica tu dirección.':'La ubicación es opcional. Puedes ingresar la dirección manualmente.'}</p>
   <label>Dirección completa<input id="address" autocomplete="street-address" placeholder="Calle, avenida, número e interior" value="\${esc(st.profile.address)}"></label>
   <label>Distrito<input id="district" placeholder="Distrito de entrega" value="\${esc(st.profile.district||'')}"></label>
   <label>Referencia (opcional)<input id="reference" placeholder="Piso, puerta u otras indicaciones" value="\${esc(st.profile.reference||'')}"></label>
   <div class="b3-modal-info">La cobertura y el costo de reparto deben verificarse con la web administrativa. No se asignará una tienda sin validación.</div>
   <button type="button" class="primary full" data-modal-save-delivery="1">Confirmar dirección</button>
 </div>\`;
 const pickupPanel=\`<div class="b3-modal-fields">
   <button type="button" class="outline full" data-gps="1">\${ic('pin',18)} Usar mi ubicación actual</button>
   <label>O ingresa una dirección de referencia<input id="pickup-origin" placeholder="Calle, número y distrito" value="\${esc(st.pickupOrigin||'')}"></label>
   <button type="button" class="outline full" data-pickup-origin-save="1">Guardar dirección de referencia</button>
   \${!st.coords?'<p class="smallprint">Los kilómetros se mostrarán cuando se conozcan las coordenadas de origen y destino.</p>':''}
   <div class="b3-modal-store-list">\${rows.length?rows.map(s=>\`<div class="b3-modal-store">
     <div class="b3-store-top"><strong>\${esc(s.name)}</strong>\${storeStatusHtml(s)}</div>
     \${s.address?\`<span class="b3-store-line">\${ic('pin',15)}\${esc(s.address)}</span>\`:''}
     \${straightDistanceKm(s)?\`<span class="b3-store-line">\${ic('map',15)}\${esc(straightDistanceKm(s))}</span>\`:''}
     \${eligibleForPickup(s)?\`<button type="button" class="b3-store-select" data-modal-pickstore="\${esc(s.id)}">Elegir local \${ic('chev',16)}</button>\`:'<span class="b3-store-unavailable">No disponible para retiro inmediato</span>'}
   </div>\`).join(''):'<div class="notice">No hay locales activos publicados por la web administrativa.</div>'}</div>
 </div>\`;
 return \`<div class="b3-modal-backdrop" data-modal-close="1">
   <section class="b3-modal-sheet" role="dialog" aria-modal="true" aria-label="Configurar pedido">
    <div class="b3-modal-handle" aria-hidden="true"></div>
    <div class="b3-modal-heading"><div><h2>\${choice?'¿Para dónde hoy?':delivery?'Pollo Delivery':'Pide y Retira'}</h2><p>\${choice?'Elige cómo quieres recibir tu pedido':delivery?'Indica dónde entregaremos tu pedido':'Elige dónde recogerás tu pedido'}</p></div>
    <button type="button" data-modal-close="1" class="b3-modal-close" aria-label="Cerrar">\${ic('close',21)}</button></div>
    \${!choice?\`<button type="button" class="b3-modal-back" data-modal-back="1">\${ic('back',17)} Cambiar modalidad</button>\`:''}
    \${choice?modeButtons:delivery?deliveryPanel:pickupPanel}
   </section></div>\`;
}
function main(){return \`<div class="shell">\${demo}<main class="main">\${st.tab==='inicio'?home():st.tab==='carta'?carta():st.tab==='pedidos'?orders():account()}</main>\${cartCount()?\`<button class="float-cart" data-screen="cart" aria-label="Abrir carrito">\${ic('cart',19)}<b>\${cash(subtotal())}</b><span>\${cartCount()}</span></button>\`:''}\${bar()}</div>\${fulfillmentOverlay()}\`}
function home(){
  const featured=products.slice(0,4);
  const f=featured.length?featured[st.carousel%featured.length]:null;
  const promos=st.configReady?publishedPromotions:products.filter(p=>p.cat==='Promociones');
  const pp=promos.length?promos[st.promo%promos.length]:null;
  const shop=shops.length?shops[st.local%shops.length]:null;
  return `<div class="home home-v10">
    ${fulfillmentHeader()}
    <section class="hero-carousel" aria-label="Destacados referenciales">
      <div class="section-head section-head-featured"><h2>Para disfrutar hoy</h2><span class="minor">Productos de demostración</span></div>
      ${f?`<div class="hero-card" data-product="${f.id}" tabindex="0" role="button" aria-label="Ver ${esc(f.name)}">
        ${img(f,'hero-img')}
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
      ${pp?(st.configReady?`<div class="promo-card published-promotion" role="status"><div class="promo-info"><span>PROMOCIÓN PUBLICADA</span><strong>${esc(pp.title)}</strong><small>Consulta los productos participantes en la carta.</small></div></div>`:`<div class="promo-card" data-product="${pp.id}" role="button" tabindex="0" aria-label="Ver ${esc(pp.name)}">${img(pp)}<div class="promo-info"><span>COMBO DE DEMOSTRACIÓN</span><strong>${esc(pp.name)}</strong><b>${cash(pp.price)}</b></div></div>`):'<div class="notice">No hay promociones publicadas.</div>'}
      <div class="dots" role="group" aria-label="Cambiar combo">${promos.map((_,i)=>`<button aria-label="Combo ${i+1}" aria-pressed="${st.promo%promos.length===i}" data-promo="${i}" class="${st.promo%promos.length===i?'on':''}"></button>`).join('')}</div>
    </section>
    <section class="block locality" aria-label="Locales de Pollos B3">
      <div class="section-head"><h2>Nuestros locales</h2><span class="minor">${shops.length?"Locales publicados":""}</span></div>
      ${shop?`<div class="store-carousel"><div class="store-pic">${ic('store',40)}</div><div class="store-content"><span class="store-eyebrow">PUNTO DE ATENCIÓN</span><strong>${esc(shop.name)}</strong>${shop.address?`<p>${esc(shop.address)}</p>`:''}${storeStatusHtml(shop)}<button data-store="${shop.id}">Ver detalles ${ic('chev',16)}</button></div></div>`:'<div class="notice">No hay locales activos publicados.</div>'}
      <div class="dots" role="group" aria-label="Cambiar local">${shops.map((_,i)=>`<button aria-label="Local ${i+1}" aria-pressed="${st.local%shops.length===i}" data-local="${i}" class="${st.local%shops.length===i?'on':''}"></button>`).join('')}</div>
    </section>
    <p class="home-disclaimer">Prototipo de Pollos B3. Imágenes, nombres comerciales, precios, combos y ubicaciones sujetos a confirmación antes de la publicación.</p>
  </div>`;
}
function card(p){return `<article class="item" data-product="${p.id}"><div class="item-picture">${img(p)}<span>Referencial</span></div><div class="item-text"><strong>${esc(p.name)}</strong><div class="item-bottom"><b>${p.disabled?'Consultar':cash(p.price)}</b><button data-quick="${p.id}" ${p.disabled?'disabled':''} aria-label="Agregar ${esc(p.name)}">${ic('plus',20)}</button></div></div></article>`}
function carta(){const term=(st.search||'').toLocaleLowerCase('es-PE');const list=products.filter(p=>(st.category==='Todos'||p.cat===st.category)&&(!term||(p.name+' '+p.desc+' '+p.cat).toLocaleLowerCase('es-PE').includes(term)));return `<div class="carta"><h1>La carta</h1><p>Elige lo que más te gusta.</p><div class="filters">${['Todos','Pollos','Promociones','Bebidas'].map(c=>`<button data-filter="${c}" class="${c===st.category?'selected':''}">${c}</button>`).join('')}</div><div class="search-feedback">${st.search?`Resultados para «${esc(st.search)}» · <button data-clearsearch="1">Limpiar búsqueda</button>`:''}</div><div class="cards">${list.map(card).join('')||'<p class="search-empty">No encontramos productos en esta demostración.</p>'}</div><p class="smallprint">Productos, fotografías, precios y promociones de demostración: verificar con Pollos B3 antes de publicar.</p></div>`}
function orders(){return `<div class="page"><h1>Mis pedidos</h1><p class="sub">Consulta tus compras de los últimos 2 meses.</p>${!st.registered?`<div class="empty-state">${ic('lock',35)}<h2>Inicia sesión para ver tus pedidos</h2><p>En esta demostración, el acceso es local. No uses tus credenciales reales.</p><button class="primary" data-screen="login">Iniciar sesión</button></div>`:(()=>{const recent=st.orders.filter(o=>Date.now()-o.ts<60*24*60*60*1000);return recent.length?recent.map(o=>`<div class="order"><b>Pedido ${esc(o.id)}</b><span>${new Date(o.ts).toLocaleDateString('es-PE')}</span><strong>${cash(o.total)}</strong><small>SIMULADO · No enviado al local</small></div>`).join(''):`<div class="empty-state">${ic('orders',34)}<h2>Aún no tienes pedidos</h2><p>Cuando realices pedidos de prueba aparecerán aquí.</p><button class="primary" data-tab="carta">Ver la carta</button></div>`})()}</div>`}
function account(){let rows=[['Mi perfil','user','profile'],['Direcciones guardadas','pin','address'],['Métodos de pago','card','methods'],['Notificaciones','bell','notifications'],['Nuestra Historia','book','history'],['Trabaja con nosotros','store','jobs'],['Privacidad y protección de datos','shield','privacy'],['Sobre la App','info','about']];return `<div class="page acc"><h1>Mi Cuenta</h1><button class="profile-line" data-screen="login">${ic('user',31)}<div><b>${st.registered?esc(st.profile.first||'Cuenta de prueba'):'Inicia sesión'}</b><small>${st.registered?'Cuenta local de demostración':'Para acceder a tu historial y datos guardados'}</small></div>${ic('chev')}</button><div class="rows">${rows.map(([label,icon,screen])=>`<button data-screen="${screen}">${ic(icon,20)}<span>${label}</span>${ic('chev',17)}</button>`).join('')}</div><h2 class="group-label">Ayuda</h2><div class="rows"><button data-screen="faq">${ic('help',20)}<span>Preguntas frecuentes</span>${ic('chev',17)}</button><button data-screen="claims">${ic('book',20)}<span>Libro de reclamaciones</span>${ic('chev',17)}</button></div>${st.registered?'<button class="logout" data-logout="1">Cerrar sesión de prueba</button>':''}</div>`}
function splash(){return `<div class="splash splash-photo" role="img" aria-label="La pollería más viral de Santa Anita"></div>`}
function login(){return `<div class="login"><div class="login-photo">${img(products[0])}</div><div class="login-body"><h1>Bienvenido a <em>Pollos B3</em></h1><p>Tu pollo favorito está a unos toques de distancia.</p><button class="primary" data-screen="signin-phone">${ic('phone')} Continuar con número</button><button class="outline" data-screen="signin-email">${ic('mail')} Continuar con correo</button><button class="outline facebook" data-social="facebook"><b>f</b> Continuar con Facebook</button><span class="or">o</span><button class="guest" data-guest="1">Continuar como invitado</button><small class="hint">Accesos de demostración. No ingreses contraseñas reales.</small></div></div>`}
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
     <div class="pickup-actions">
      ${eligibleForPickup(s)?`<button class="primary" data-pickstore="${esc(s.id)}">Elegir local</button>`:'<span class="smallprint">No disponible para recojo inmediato</span>'}
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
   ${straightDistanceKm(s)?`<p class="pickup-distance">${ic('map',16)} ${esc(straightDistanceKm(s))}</p>`:''}
   ${addr?`<button class="outline full" data-openmaps="${url}">${ic('map')} Cómo llegar con Google Maps</button>`:''}
   <button class="primary full" data-start="1">Continuar con Pide y Retira</button>
 </div>`;
}
function detail(){let p=product(st.selected)||products[0];return `<div class="detail">${heading('',st.mode?'app':'choice')}<div class="detail-photo">${img(p)}<small>Imagen referencial</small></div><div class="detail-content"><h1>${esc(p.name)}</h1><p>${esc(p.desc)}</p><div class="detail-price"><strong>${cash(p.price)}</strong><div class="counter"><button data-qty="-1">−</button><span>${st.qty}</span><button data-qty="1">+</button></div></div><button class="primary full" data-add="1">Agregar · ${cash(p.price*st.qty)}</button></div></div>`}
function cart(){return `<div class="page">${heading('Tu carrito','app')}${!st.cart.length?`<div class="empty-state"><h2>Tu carrito está vacío</h2><button class="primary" data-tab="carta">Ver la carta</button></div>`:`<div>${st.cart.map(x=>{let p=product(x.id);return `<div class="cart-row">${img(p)}<div><strong>${esc(p.name)}</strong><span>${cash(p.price)}</span><div class="counter"><button data-cartdelta="${p.id}|-1">−</button><b>${x.qty}</b><button data-cartdelta="${p.id}|1">+</button></div></div><button class="remove" data-remove="${p.id}" aria-label="Quitar producto">${ic('trash',18)}</button></div>`}).join('')}</div><div class="totals"><p><span>Subtotal</span><b>${cash(subtotal())}</b></p><p><span>Delivery</span><span>${st.mode==='delivery'?(st.quote?cash(st.quote.deliveryFeePen):'Pendiente de cotizar'):'No aplica'}</span></p><p class="grand"><b>Total estimado</b><strong>${cash(subtotal()+(st.quote?.deliveryFeePen||0))}</strong></p></div><p class="smallprint">Los cargos de delivery, si aplican, se mostrarán antes de realizar un pago real.</p><button class="outline full" data-tab="carta">Seguir pidiendo</button><button class="primary full" data-screen="identity">Pagar</button>`}</div>`}
function identity(){return `<div class="page form">${heading('Tus datos','cart')}<p class="sub">Solo pedimos lo necesario para identificar tu pedido.</p><label>Nombres<input id="first" autocomplete="given-name" value="${esc(st.profile.first)}" placeholder="Ingresa tus nombres"></label><label>Apellidos<input id="last" autocomplete="family-name" value="${esc(st.profile.last)}" placeholder="Ingresa tus apellidos"></label><label>DNI o CE (opcional)<input id="doc" autocomplete="off" value="${esc(st.profile.doc)}" placeholder="Solo si necesitas un comprobante"></label><button class="primary full" data-identity-next="1">Continuar</button></div>`}
function phone(){return `<div class="page form">${heading('Tu teléfono','identity')}<p class="sub">Lo usaremos para identificar tu pedido. En esta demo no enviaremos mensajes ni códigos.</p><label>Celular de Perú<div class="phone-field"><b>+51</b><input id="phone" inputmode="numeric" maxlength="9" value="${esc(st.profile.phone)}" placeholder="9 dígitos"></div></label><button class="primary full" data-phone-next="1">Continuar</button></div>`}
function payment(){return `<div class="page">${heading('Método de pago','phone')}<p class="sub">Solo aparecen los métodos habilitados para tu local y modalidad. No hay cobros reales en este piloto.</p><div class="method-list">${paymentOptions().map(([id,title,sub])=>`<button class="${st.pay===id?'chosen':''}" data-pay="${id}">${ic(id==='cash'?'store':'card')}<span><b>${title}</b><small>${sub}</small></span><span class="radio"></span></button>`).join('')}</div>${st.configReady&&!paymentOptions().length?'<div class="notice">No hay pagos habilitados para esta modalidad y local.</div>':''}${st.pay==='cash'?`<label>¿Con cuánto vas a pagar?<input id="cash" inputmode="decimal" placeholder="Ej. 100" value="${esc(st.cash)}"></label><div class="notice" id="change">${Number(st.cash)>=subtotal()?`Vuelto referencial: ${cash(Number(st.cash)-subtotal())}`:'Ingresa un monto igual o mayor al total'}</div>`:''}<button class="primary full" data-pay-next="1">Continuar</button></div>`}
function summary(){let s=shops.find(x=>x.id===st.store);return `<div class="page">${heading('Resumen de tu pedido','payment')}<div class="summary-card"><h2>${st.mode==='delivery'?'Delivery':st.mode==='dine_in'?'Comer en tienda':'Recojo en tienda'}</h2><p>${st.mode==='delivery'?esc(st.profile.address+', '+(st.profile.district||'')):(s?esc(s.name+' · '+s.addr):'Local por confirmar')}</p><hr><p>Pago: <b>${{yape:'Yape',plin:'Plin',card:'Tarjeta',click:'Click to Pay',cash:'Efectivo al recibir'}[st.pay]}</b></p>${st.cart.map(x=>`<p>${esc(product(x.id).name)} ×${x.qty} <b>${cash(x.qty*product(x.id).price)}</b></p>`).join('')}<hr><p>Subtotal <b>${cash(subtotal())}</b></p><p>Delivery <span>${st.mode==='delivery'?(st.quote?cash(st.quote.deliveryFeePen):'Pendiente de cotizar'):'No aplica'}</span></p><p class="grand">Total estimado <strong>${cash(subtotal()+(st.quote?.deliveryFeePen||0))}</strong></p></div><div class="notice">No se confirmarán pagos ni enviarán pedidos al local. Confirmar únicamente para probar el recorrido.</div><button class="primary full" data-confirm="1">Confirmar pedido de prueba</button></div>`}
function success(){let o=st.orders[0];return `<div class="success"><div class="success-mark">${ic('check',54)}</div><h1>¡Pedido de prueba registrado!</h1><p>Este pedido se guardó en tu teléfono. <b>No fue enviado a Pollos B3 ni cobrado.</b></p><div class="success-box"><b>${esc(o?.id||'')}</b><span>${cash(o?.total||0)}</span><small>Simulación local</small></div><button class="primary full" data-tab="pedidos">Ver mis pedidos</button><button class="outline full" data-tab="inicio">Volver al inicio</button></div>`}
function chat(){return `<div class="chat-screen">${heading('Ayuda · Pollos B3','app')}<div class="chat-info">${ic('chat')}<span>Chat de demostración · TU VERSO aún no conectado</span></div><div class="chat-messages"><div class="message agent">¡Hola! Esta es una vista previa del chat. Cuando se integre TU VERSO, aquí podrás conversar con un agente de Pollos B3.</div>${st.chat.map(m=>`<div class="message customer">${esc(m)}</div>`).join('')}</div><form id="chat-form" class="chat-compose"><input id="chat-message" placeholder="Escribe un mensaje de prueba..." aria-label="Mensaje de prueba"><button type="submit">${ic('chev')}</button></form></div>`}
function about(){return `<div class="page about">${heading('Sobre la App','app')}<div class="about-copy"><p>Pollos B3 App para Android</p><p class="version">Versión 1.0.0</p><p>Todos los derechos reservados<br>Pollos B3</p></div><img class="integra-logo" src="images/integra.png" alt="Logotipo original INTEGRA B2G"><p class="smallprint">Piloto funcional sin servicios externos.</p></div>`}
function infoScreen(){const content={profile:['Mi perfil','Tu nombre y celular se utilizan para facilitar pedidos.'],address:['Direcciones guardadas','Las direcciones se guardan únicamente en este teléfono de prueba.'],methods:['Métodos de pago','Podrás elegir el método de pago en el paso de compra. No guardamos tarjetas.'],notifications:['Notificaciones','Las notificaciones estarán disponibles cuando se configure el servicio.'],history:['Nuestra Historia','Contenido oficial de la historia de Pollos B3 pendiente de recibir.'],jobs:['Trabaja con nosotros','Canal oficial de postulaciones pendiente de confirmar.'],privacy:['Privacidad y protección de datos','Este piloto guarda datos solo en el dispositivo. No uses información personal real para probarlo.'],faq:['Preguntas frecuentes','¿Puedo pedir sin registrarme? Sí. ¿El piloto cobra? No. ¿Funciona el chat con agentes? Aún no.'],claims:['Libro de reclamaciones','Se enlazará al Libro de Reclamaciones oficial cuando el negocio proporcione su dirección.']};let [title,body]=content[st.stage]||['Información',''];return `<div class="page">${heading(title,'app')}<p class="sub">${esc(body)}</p>${st.stage==='profile'?`<div class="profile-data">${esc((st.profile.first+' '+st.profile.last).trim()||'Sin nombre guardado')}<br>${esc(st.profile.phone||'Sin teléfono guardado')}</div>`:''}${st.stage==='privacy'?'<button class="outline full" data-clear="1">Eliminar datos locales de prueba</button>':''}</div>`}
function signin(){let byPhone=st.stage==='signin-phone';return `<div class="page form">${heading('Ingreso de demostración','login')}<p class="sub">Este acceso no verifica tu identidad y solo se utiliza para probar la navegación.</p><label>${byPhone?'Celular (+51)':'Correo electrónico'}<input id="signin-value" ${byPhone?'inputmode="numeric" maxlength="9"':'type="email"'} placeholder="${byPhone?'9 dígitos':'correo@ejemplo.com'}"></label><button class="primary full" data-demo-signin="${byPhone?'phone':'email'}">Entrar en modo prueba</button><p class="smallprint">No uses información real ni contraseñas.</p></div>`}
function render(){if(window.AndroidBridge?.setSplash)window.AndroidBridge.setSplash(st.stage==='splash');let html='';if(st.stage==='splash')html=splash();else if(st.stage==='login')html=login();else if(st.stage==='app')html=main();else if(st.stage==='choice')html=choice();else if(st.stage==='locations')html=locations();else if(st.stage==='localDetail')html=localDetail();else if(st.stage==='address')html=address();else if(st.stage==='detail')html=detail();else if(st.stage==='cart')html=cart();else if(st.stage==='identity')html=identity();else if(st.stage==='phone')html=phone();else if(st.stage==='payment')html=payment();else if(st.stage==='summary')html=summary();else if(st.stage==='success')html=success();else if(st.stage==='chat')html=chat();else if(st.stage==='about')html=about();else if(st.stage.startsWith('signin-'))html=signin();else html=infoScreen();root.innerHTML=html+(!['splash','login','app','chat','signin-phone','signin-email'].includes(st.stage)?`<button class="persistent-chat" data-screen="chat" aria-label="Abrir chat de ayuda">${ic('chat',23)}</button>`:'')+(st.notice?`<div class="toast">${esc(st.notice)}</div>`:'');}
function v(id){return document.getElementById(id)?.value.trim()||''}
function checkReady(){if(!st.mode){screen('choice');return false} if((st.mode==='pickup'||st.mode==='dine_in')&&!st.store){screen('locations');return false}if(st.mode==='delivery'&&(!st.profile.address||st.configReady&&!st.quote)){screen('address');return false}return true}
function addToCart(id,qty=1){let p=product(id);if(!p||p.disabled)return toast('Producto no disponible para esta demo');let found=st.cart.find(x=>x.id===id);if(found)found.qty+=qty;else st.cart.push({id,qty});save();toast('Agregado a tu pedido')}
function swipeHandler(el,startCb,nextCb){let x=null;el.addEventListener('touchstart',e=>{x=e.touches[0].clientX},{passive:true});el.addEventListener('touchend',e=>{if(x!==null){let dx=e.changedTouches[0].clientX-x;if(Math.abs(dx)>42)nextCb(dx<0?1:-1);x=null}},{passive:true})}
root.addEventListener('click',e=>{let b=e.target.closest('[data-gps],[data-pickup-origin-save],[data-clearsearch],[data-tab],[data-screen],[data-guest],[data-mode],[data-store],[data-pickstore],[data-fulfillment],[data-start],[data-product],[data-quick],[data-add],[data-qty],[data-filter],[data-carousel],[data-promo],[data-local],[data-cartdelta],[data-remove],[data-identity-next],[data-phone-next],[data-address-next],[data-pay],[data-pay-next],[data-confirm],[data-social],[data-demo-signin],[data-logout],[data-openmaps],[data-clear]');if(!b)return;
if(b.hasAttribute('data-gps')){if(window.AndroidBridge?.requestLocation)window.AndroidBridge.requestLocation();else if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>window.b3NativeLocation(p.coords.latitude,p.coords.longitude,null),()=>window.b3NativeLocation(null,null,'Permiso denegado o GPS desactivado'),{enableHighAccuracy:true,timeout:12000});else toast('GPS no disponible. Ingresa la dirección manualmente.');return}if(b.hasAttribute('data-pickup-origin-save')){st.pickupOrigin=v('pickup-origin');st.coords=null;save();render();return}if(b.hasAttribute('data-clearsearch')){st.search='';render();return}if(b.dataset.tab){if(b.dataset.tab==='carta')st.search='';nav(b.dataset.tab);return}if(b.dataset.screen){if(b.dataset.screen==='detail'&&!st.selected)return;screen(b.dataset.screen);return}
if(b.hasAttribute('data-guest')){st.registered=false;enterApp();return}
if(b.dataset.mode){if(st.mode!==b.dataset.mode){st.store='';st.quote=null;st.pay='';st.coords=null;if(st.cart.length)st.notice='Modalidad modificada. Verifica productos, importes y pagos.'}st.mode=b.dataset.mode;save();if(st.mode==='delivery')screen('address');else {screen('locations');if(API_BASE)void fetchConfig()}return}
if(b.dataset.store){const s=shops.find(x=>x.id===b.dataset.store);if(!eligibleForPickup(s))return toast('Local no disponible para recojo');st.store=b.dataset.store;st.quote=null;st.mode='pickup';screen('localDetail');return}if(b.dataset.pickstore){const s=shops.find(x=>x.id===b.dataset.pickstore);if(!eligibleForPickup(s))return toast('Local cerrado o no habilitado para recojo');st.store=b.dataset.pickstore;st.fulfillment='pickup';st.quote=null;screen('localDetail');return}
if(b.dataset.fulfillment){st.fulfillment=b.dataset.fulfillment;render();return}
if(b.hasAttribute('data-start')){if(!st.mode)return toast('Selecciona una modalidad');if(st.configReady&&!st.quote){confirmStore(st.mode,st.store);return}if(st.selected)screen('detail');else nav('carta');return}
if(b.dataset.product||b.dataset.quick){st.selected=b.dataset.product||b.dataset.quick;st.qty=1;if(!st.mode)screen('choice');else if(!checkReady())return;else screen('detail');return}
if(b.dataset.qty){st.qty=Math.max(1,Math.min(30,st.qty+Number(b.dataset.qty)));render();return}
if(b.hasAttribute('data-add')){addToCart(st.selected,st.qty);nav('carta');return}
if(b.dataset.filter){st.category=b.dataset.filter;render();return}
if(b.dataset.carousel!==undefined){st.carousel=Number(b.dataset.carousel);render();return}if(b.dataset.promo!==undefined){st.promo=Number(b.dataset.promo);render();return}if(b.dataset.local!==undefined){st.local=Number(b.dataset.local);render();return}
if(b.dataset.cartdelta){let [id,delta]=b.dataset.cartdelta.split('|');let c=st.cart.find(x=>x.id===id);if(c){c.qty+=Number(delta);st.cart=st.cart.filter(x=>x.qty>0);save();render()}return}
if(b.dataset.remove){st.cart=st.cart.filter(x=>x.id!==b.dataset.remove);save();render();return}
if(b.hasAttribute('data-address-next')){if(v('address').length<6||v('district').length<2)return toast('Completa tu dirección y distrito');st.profile.address=v('address');st.profile.district=v('district');st.profile.reference=v('reference');save();resolveDelivery();return}
if(b.hasAttribute('data-identity-next')){if(v('first').length<2||v('last').length<2)return toast('Ingresa tus nombres y apellidos');st.profile.first=v('first');st.profile.last=v('last');st.profile.doc=v('doc');save();screen('phone');return}
if(b.hasAttribute('data-phone-next')){if(!/^9\d{8}$/.test(v('phone')))return toast('Ingresa un celular peruano válido de 9 dígitos');st.profile.phone=v('phone');save();screen('payment');return}
if(b.dataset.pay){if(!paymentOptions().some(x=>x[0]===b.dataset.pay))return toast('Método no habilitado');st.pay=b.dataset.pay;render();return}
if(b.hasAttribute('data-pay-next')){if(!paymentOptions().some(x=>x[0]===st.pay))return toast('Elige un método de pago habilitado');if(st.configReady&&!st.quote)return toast('Debes validar local y modalidad primero');if(st.pay==='cash'){st.cash=v('cash');if(!st.cash||!Number.isFinite(Number(st.cash))||Number(st.cash)<subtotal())return toast('Ingresa un monto suficiente para pagar')}save();screen('summary');return}
if(b.hasAttribute('data-confirm')){if(st.configReady)return toast('Integración de pedidos y pagos reales pendiente. No se enviará ni cobrará el pedido.');const order={id:'B3-DEMO-'+String(Date.now()).slice(-6),ts:Date.now(),total:subtotal(),items:[...st.cart],mode:st.mode,pay:st.pay};st.orders.unshift(order);st.cart=[];save();screen('success');return}
if(b.dataset.social){toast('Facebook requiere una integración real. Usa invitado para probar.');return}
if(b.dataset.demoSignin){const x=v('signin-value');if(b.dataset.demoSignin==='phone'?!/^9\d{8}$/.test(x):!/^\S+@\S+\.\S+$/.test(x))return toast('Completa el dato con un formato válido');st.registered=true;if(b.dataset.demoSignin==='phone')st.profile.phone=x;else st.profile.email=x;save();enterApp();return}
if(b.hasAttribute('data-logout')){st.registered=false;save();render();return}
if(b.dataset.openmaps){if(window.AndroidBridge?.openMaps)window.AndroidBridge.openMaps(b.dataset.openmaps);else window.open(b.dataset.openmaps,'_blank');return}
if(b.hasAttribute('data-clear')){localStorage.removeItem(K);location.reload();return}
});
root.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&(e.target.matches('.hero-card[role=button],.promo-card[role=button]'))){e.preventDefault();e.target.click()}});
root.addEventListener('submit',e=>{if(e.target.id==='home-search-form'){e.preventDefault();st.search=(document.getElementById('home-search-field')?.value||'').trim().slice(0,60);st.category='Todos';nav('carta');return}if(e.target.id==='chat-form'){e.preventDefault();const m=v('chat-message');if(m){st.chat.push(m.slice(0,500));save();render()}}});
root.addEventListener('input',e=>{if(e.target.id==='cash'){st.cash=e.target.value;let change=document.getElementById('change');if(change)change.textContent=Number(st.cash)>=subtotal()?`Vuelto referencial: ${cash(Number(st.cash)-subtotal())}`:'Ingresa un monto igual o mayor al total';}});
let touchX=null;let touchTarget='';root.addEventListener('touchstart',e=>{const t=e.target.closest('.hero-card,.promo-card,.store-carousel');touchTarget=t?.className?.split(' ')[0]||'';touchX=t?e.touches[0].clientX:null},{passive:true});root.addEventListener('touchend',e=>{if(touchX===null)return;const d=e.changedTouches[0].clientX-touchX;touchX=null;if(Math.abs(d)<40)return;const step=d<0?1:-1;if(touchTarget==='hero-card')st.carousel=(st.carousel+4+step)%4;else if(touchTarget==='promo-card')st.promo=(st.promo+(st.configReady?publishedPromotions.length:products.filter(p=>p.cat==='Promociones').length)+step)%(st.configReady?publishedPromotions.length:products.filter(p=>p.cat==='Promociones').length);else if(touchTarget==='store-carousel')st.local=(st.local+4+step)%4;else return;const sy=window.scrollY;render();window.scrollTo(0,sy)},{passive:true});
let tick=0;setInterval(()=>{if(st.stage==='app'&&st.tab==='inicio'&&!document.hidden){tick++;if(tick%5===0){if(products.length)st.carousel=(st.carousel+1)%Math.min(products.length,4);const promoCount=st.configReady?publishedPromotions.length:products.filter(p=>p.cat==='Promociones').length;if(promoCount)st.promo=(st.promo+1)%promoCount;if(shops.length)st.local=(st.local+1)%shops.length;const sc=window.scrollY;render();window.scrollTo(0,sc)}}},1000);
window.handleB3Back=()=>{
  if(st.stage==='app'){
    if(st.tab!=='inicio'){nav('inicio');return true}
    return false; // Native Activity exits; never navigate to splash.
  }
  if(st.stage==='splash')return false;
  if(st.stage==='login'){
    if(loginFromAccount){loginFromAccount=false;nav('cuenta');return true}
    return false; // First launch login: close app on Back, not splash.
  }
  if(st.stage.startsWith('signin-')){screen('login');return true}
  const previous={choice:'app',locations:'choice',localDetail:'locations',address:'choice',detail:'app',cart:'app',identity:'cart',phone:'identity',payment:'phone',summary:'payment',chat:'app',about:'app',success:'app'};
  screen(previous[st.stage]||'app');return true
};
render();
fetchConfig();
// Present branded artwork only on cold launch, then clear it from the navigation stack.
setTimeout(()=>{if(st.stage==='splash')screen(enteredBefore?'app':'login')},1600);
})();