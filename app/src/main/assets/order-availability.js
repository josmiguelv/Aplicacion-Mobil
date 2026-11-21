/* Pollos B3 - isolated Android order-availability client.
 * The Android native bridge performs HTTPS (no WebView CORS dependency).
 * Validation secrets live only in this WebView session, never in app state/logs.
 */
(function (root) {
  'use strict';
  const SESSION_KEY = 'b3-order-availability-session-v1';
  const CUSTOMER_KEY = 'b3-order-customer-external-v1';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const TOKEN = /^ordv1_[A-Za-z0-9_-]{43}$/;
  const requests = new Map();
  let sequence = 0;
  const secureBytes = length => {
    if (!root.crypto || typeof root.crypto.getRandomValues !== 'function')
      throw Error('La generación segura de identificadores no está disponible.');
    const bytes = new Uint8Array(length);
    root.crypto.getRandomValues(bytes);
    return bytes;
  };
  const base64url = bytes => root.btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  function uuid() {
    if (typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    const b = secureBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(n => n.toString(16).padStart(2, '0')).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }
  function externalCustomerId() {
    const saved = root.localStorage.getItem(CUSTOMER_KEY);
    if (typeof saved === 'string' && /^b3_[A-Za-z0-9_-]{24}$/.test(saved)) return saved;
    const id = 'b3_' + base64url(secureBytes(18));
    root.localStorage.setItem(CUSTOMER_KEY, id);
    return id;
  }
  function read() {
    try {
      const entry = JSON.parse(root.sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!entry || typeof entry.fingerprint !== 'string' || !TOKEN.test(entry.token) ||
        !UUID.test(entry.idempotencyKey) ||
        (entry.validationId && !UUID.test(entry.validationId))) return null;
      return entry;
    } catch (_) { return null; }
  }
  function save(entry) {
    root.sessionStorage.setItem(SESSION_KEY, JSON.stringify(entry));
    return entry;
  }
  function clear() {
    root.sessionStorage.removeItem(SESSION_KEY);
  }
  function prepare({appId, items, address, district, revision, latitude, longitude, useGps}) {
    if (typeof appId !== 'string' || !/^[a-zA-Z0-9._-]{3,180}$/.test(appId))
      throw Error('Identificador de aplicación inválido.');
    if (!Array.isArray(items) || items.length < 1 || items.length > 50 ||
      !items.every(x => x && UUID.test(x.productId) && Number.isInteger(x.quantity) &&
        x.quantity >= 1 && x.quantity <= 99))
      throw Error('La validación requiere productos publicados en la carta. Retira los productos de demostración.');
    const orderedItems = items.map(x => ({productId:x.productId.toLowerCase(),quantity:x.quantity}))
      .sort((a,b) => a.productId.localeCompare(b.productId));
    if (new Set(orderedItems.map(x => x.productId)).size !== orderedItems.length)
      throw Error('Hay productos duplicados en el carrito.');
    const gps = useGps === true && Number.isFinite(latitude) && Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
    const street = String(address || '').trim(), area = String(district || '').trim();
    if (!gps && (street.length < 6 || area.length < 2))
      throw Error('Completa la dirección y distrito para solicitar la validación.');
    const body = {appId, validationToken:'', customerExternalId:externalCustomerId(), items:orderedItems,
      address:street, district:area, city:'Lima', country:'Perú', useGps:gps};
    if (gps) { body.latitude = latitude; body.longitude = longitude; }
    const fingerprint = JSON.stringify({appId, items:orderedItems, address:street, district:area,
      gps:gps ? [latitude,longitude] : null, revision});
    const existing = read();
    if (existing && existing.fingerprint === fingerprint) return existing;
    const entry = {fingerprint, token:'ordv1_'+base64url(secureBytes(32)),
      idempotencyKey:uuid(), validationId:null, body, createdAt:Date.now(), lastStatus:null};
    entry.body.validationToken = entry.token;
    return save(entry);
  }
  function onNativeReply(raw) {
    let reply;
    try { reply = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return; }
    if (!reply || typeof reply.requestId !== 'string') return;
    const pending = requests.get(reply.requestId);
    if (!pending) return;
    root.clearTimeout(pending.timer);
    requests.delete(reply.requestId);
    if (reply.error) {
      const error = Error('No fue posible conectar con el servidor de validación.');
      error.code = String(reply.error);
      pending.reject(error);
    } else {
      pending.resolve(reply);
    }
  }
  function nativeRequest(action) {
    if (!root.AndroidBridge || typeof root.AndroidBridge.orderAvailabilityRequest !== 'function')
      return Promise.reject(Error('La conexión segura de pedidos requiere la aplicación Android actualizada.'));
    const requestId = 'oa_' + (++sequence);
    return new Promise((resolve,reject) => {
      const timer = root.setTimeout(() => {
        requests.delete(requestId);
        const error = Error('La consulta tardó demasiado. Puedes volver a comprobar sin duplicar tu solicitud.');
        error.code = 'TIMEOUT';
        reject(error);
      }, 25000);
      requests.set(requestId,{resolve,reject,timer});
      try {
        root.AndroidBridge.orderAvailabilityRequest(JSON.stringify({...action,requestId}));
      } catch (_) {
        root.clearTimeout(timer);
        requests.delete(requestId);
        reject(Error('No se pudo iniciar la consulta segura.'));
      }
    });
  }
  async function execute(entry) {
    if (!entry || !TOKEN.test(entry.token) || !UUID.test(entry.idempotencyKey))
      throw Error('No existe una solicitud de validación válida.');
    const action = entry.validationId ?
      {operation:'GET',validationId:entry.validationId,validationToken:entry.token} :
      {operation:'POST',idempotencyKey:entry.idempotencyKey,body:entry.body};
    const response = await nativeRequest(action);
    const code = Number(response.status);
    const data = response.data && typeof response.data === 'object' ? response.data : {};
    if (code !== 200 && code !== 202) {
      const err = Error(code===429?'Demasiadas consultas. Intenta nuevamente en unos segundos.':
        code===409?'La carta o los locales cambiaron. Actualiza tu pedido antes de volver a validar.':
        code===422?'La dirección necesita más detalles. Revísala.':
        code===404?'Esta validación ya no está disponible. Inicia una nueva solicitud.':
        'No se pudo validar el pedido en este momento.');
      err.httpStatus = code;
      // A missing/unauthorized/conflicting validation cannot be recovered with the old token.
      // Rate limits, server failures and network timeouts preserve idempotency for safe retries.
      if (code === 401 || code === 404 || code === 409) clear();
      throw err;
    }
    if (!UUID.test(data.validationId) || typeof data.status !== 'string' ||
      !['CHECKING_STORES','WAITING_APPROVAL','CREATE_UNCERTAIN','READY_FOR_PAYMENT','UNAVAILABLE','VALIDATION_ERROR','CANCELLED'].includes(data.status) ||
      (entry.validationId && entry.validationId !== data.validationId))
      throw Error('El servidor devolvió una validación incompleta o inconsistente.');
    entry.validationId = data.validationId;
    entry.lastStatus = data.status;
    save(entry);
    return data;
  }
  async function checkConnection() {
    // A readiness failure does not imply that the HTTPS tunnel itself is down.
    // Check the live endpoint only on failure, using read-only GET calls.
    const result = await nativeRequest({operation:'HEALTH'});
    const status = Number(result.status);
    const online = status === 200 && result.data?.status === 'ready';
    if (online) return {online:true,status,liveOnline:true,liveStatus:200};
    let liveStatus = null;
    try {
      const live = await nativeRequest({operation:'HEALTH_LIVE'});
      liveStatus = Number(live.status);
    } catch (_) { /* Readiness status remains authoritative. */ }
    return {online:false,status,liveOnline:liveStatus===200 && liveStatus!==null,
      liveStatus};
  }
  // Separate public mobile contract: no TU VERSO S2S token is ever present in Android.
  const INTERACTION_KEY = 'b3-mobile-interaction-request-v1';
  function responseError(response,context) {
    const status = Number(response?.status);
    const message = typeof response?.data?.error === 'string' ? response.data.error : '';
    const error = Error(status===429?context+': demasiadas consultas (HTTP 429).':
      status===409?context+': '+(message || 'La sede o el catálogo cambiaron. Verifica la configuración.')+' (HTTP 409).':
      status===503?context+' (HTTP 503): el Administrador no pudo completar esta operación. Revisa esta etapa específica; no implica necesariamente que TU VERSO esté desconectado.':
      context+' (HTTP '+(status || 'sin respuesta')+').');
    error.httpStatus = status;
    return error;
  }
  async function checkAgentAvailability({appId,storeId}) {
    if(typeof appId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(appId)||
      !UUID.test(storeId)) throw Error('Identificadores de sede o aplicación inválidos.');
    const response = await nativeRequest({operation:'AGENT_AVAILABILITY',appId,storeId});
    if(Number(response.status)!==200) throw responseError(response,'No se pudo consultar disponibilidad del asesor');
    const data=response.data||{};
    if(data.storeId!==storeId || !['AVAILABLE','UNAVAILABLE'].includes(data.status)||
       typeof data.available!=='boolean'||data.available!==(data.status==='AVAILABLE')||
       data.reservation!==false)
      throw Error('La disponibilidad de TU VERSO no corresponde a la sede solicitada.');
    return {storeId,status:data.status,available:data.available,checkedAt:data.checkedAt};
  }
  async function quoteDelivery({appId,storeId,address,district,latitude,longitude,useGps}) {
    if(typeof appId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(appId))
      throw Error('Identificador de aplicación inválido.');
    if(typeof address!=='string'||address.trim().length<6||typeof district!=='string'||
       district.trim().length<2) throw Error('Confirma la dirección para cotizar delivery.');
    const body={appId,mode:'delivery',address:address.trim(),district:district.trim(),
      city:'Lima',country:'Perú',useGps:useGps===true};
    if(storeId!==undefined){
      if(!UUID.test(storeId))throw Error('La sede a cotizar no es válida.');
      body.storeId=storeId;
    }
    if(useGps===true&&Number.isFinite(latitude)&&Number.isFinite(longitude)){
      body.latitude=latitude;body.longitude=longitude;
    }
    const response=await nativeRequest({operation:'DELIVERY_QUOTE',body});
    if(Number(response.status)!==200)throw responseError(response,'No se pudo cotizar el delivery');
    const data=response.data||{};
    if(!UUID.test(data.storeId)||(storeId&&data.storeId!==storeId)||
       !Number.isSafeInteger(data.revision)||data.revision<1||
       data.mode!=='delivery'||!Number.isFinite(Number(data.deliveryFeePen))||
       data.deliveryFeePen==null||Number(data.deliveryFeePen)<0||
       !Array.isArray(data.paymentMethods))
      throw Error('El Administrador devolvió una cotización incompleta.');
    return data;
  }
  function readInteraction() {
    try{
      const entry=JSON.parse(root.localStorage.getItem(INTERACTION_KEY)||'null');
      if(!entry||!UUID.test(entry.idempotencyKey)||
        typeof entry.fingerprint!=='string'||!entry.body||
        !['PREPARED','SUBMITTING','PENDING','ACCEPTED','REJECTED','CANCELLED','EXPIRED'].includes(entry.status)||
        (entry.interactionId&&!UUID.test(entry.interactionId)))return null;
      return entry;
    }catch(_){return null;}
  }
  function persistInteraction(entry) {
    root.localStorage.setItem(INTERACTION_KEY,JSON.stringify(entry));return entry;
  }
  function prepareInteraction({appId,storeId,catalogRevision,items,address,district}) {
    if(typeof appId!=='string'||!UUID.test(storeId)||
      !Number.isSafeInteger(catalogRevision)||catalogRevision<1||
      !Array.isArray(items)||items.length<1||items.length>50||
      !items.every(i=>i&&UUID.test(i.productId)&&Number.isInteger(i.quantity)&&
        i.quantity>=1&&i.quantity<=99))
      throw Error('La solicitud de atención no tiene sede, revisión o productos publicados válidos.');
    const body={appId,storeId,catalogRevision,customerExternalId:externalCustomerId(),
      items:items.map(i=>({productId:i.productId,quantity:i.quantity}))
        .sort((a,b)=>a.productId.localeCompare(b.productId))};
    const fingerprint=JSON.stringify({...body,address:String(address||'').trim(),
      district:String(district||'').trim()});
    const prior=readInteraction();
    if(prior?.fingerprint===fingerprint&&!['REJECTED','CANCELLED','EXPIRED'].includes(prior.status))return prior;
    if(prior&&!['PREPARED','REJECTED','CANCELLED','EXPIRED'].includes(prior.status))
      throw Error('Ya existe una solicitud de atención iniciada. No enviaremos otro formulario mientras no se confirme su resolución.');
    return persistInteraction({fingerprint,body,idempotencyKey:uuid(),interactionId:null,
      status:'PREPARED',createdAt:Date.now()});
  }
  async function createInteraction(entry) {
    if(!entry||!UUID.test(entry.idempotencyKey)||!entry.body)
      throw Error('No existe una solicitud de atención válida.');
    if(['PENDING','ACCEPTED'].includes(entry.status)&&UUID.test(entry.interactionId))
      return {interactionId:entry.interactionId,status:'PENDING',storeId:entry.body.storeId};
    entry.status='SUBMITTING';
    persistInteraction(entry); // Persist before network I/O: reuse the same key after timeout.
    const response=await nativeRequest({operation:'INTERACTION_CREATE',
      idempotencyKey:entry.idempotencyKey,body:entry.body});
    const status=Number(response.status);
    if(status!==201&&status!==200){
      if(status===409||status===400)
        {entry.status='PREPARED';persistInteraction(entry);}
      throw responseError(response,'No se pudo crear la interacción');
    }
    const data=response.data||{};
    if(!UUID.test(data.interactionId)||data.status!=='PENDING'||
      data.storeId!==entry.body.storeId||
      typeof data.externalReference!=='string'||!data.externalReference.startsWith('mobile:'))
      throw Error('La respuesta de TU VERSO no confirmó una interacción pendiente válida.');
    entry.status='PENDING';entry.interactionId=data.interactionId;
    persistInteraction(entry);
    return data;
  }
  const SERIES_KEY='b3-mobile-rejected-stores-v1';
  function rejectedStores(fingerprint){
    try{
      const data=JSON.parse(root.localStorage.getItem(SERIES_KEY)||'null');
      return data?.fingerprint===fingerprint&&Number.isFinite(data.createdAt)&&Date.now()-data.createdAt<300000&&Array.isArray(data.stores)?
        data.stores.filter(UUID.test.bind(UUID)).slice(0,30):[];
    }catch(_){return []}
  }
  function markRejectedStore(fingerprint,storeId){
    if(!UUID.test(storeId))throw Error('Sede rechazada inválida');
    const stores=[...new Set([...rejectedStores(fingerprint),storeId])].slice(0,30);
    root.localStorage.setItem(SERIES_KEY,JSON.stringify({fingerprint,stores,createdAt:Date.now()}));
    return stores;
  }
  async function pollInteraction(entry){
    if(!entry||!UUID.test(entry.interactionId)||!UUID.test(entry.idempotencyKey))
      throw Error('No existe interacción para consultar.');
    const response=await nativeRequest({operation:'INTERACTION_STATUS',
      interactionId:entry.interactionId,accessKey:entry.idempotencyKey,
      appId:entry.body.appId,storeId:entry.body.storeId});
    if(Number(response.status)!==200)
      throw responseError(response,'No se pudo consultar la decisión del asesor');
    const data=response.data||{};
    if(data.interactionId!==entry.interactionId||data.storeId!==entry.body.storeId||
       ![null,'ACCEPTED','REJECTED','CANCELLED'].includes(data.decision))
      throw Error('La respuesta del asesor no coincide con esta interacción.');
    if(data.decision==='ACCEPTED')entry.status='ACCEPTED';
    else if(data.decision==='REJECTED')entry.status='REJECTED';
    else if(data.decision==='CANCELLED')entry.status='CANCELLED';
    else if(data.status==='EXPIRED')entry.status='EXPIRED';
    persistInteraction(entry);
    return {...data,clientStatus:entry.status};
  }
  async function cancelInteraction(entry){
    if(!entry||!UUID.test(entry.idempotencyKey))throw Error('No hay solicitud que cancelar.');
    if(entry.status==='CANCELLED')return {status:'CANCELLED'};
    if(!UUID.test(entry.interactionId)){
      entry.status='CANCELLED';persistInteraction(entry);return {status:'CANCELLED'};
    }
    const response=await nativeRequest({operation:'INTERACTION_CANCEL',interactionId:entry.interactionId,
      accessKey:entry.idempotencyKey,appId:entry.body.appId,storeId:entry.body.storeId});
    if(Number(response.status)!==200||response.data?.status!=='CANCELLED')
      throw responseError(response,'No se pudo notificar la cancelación de la solicitud');
    entry.status='CANCELLED';persistInteraction(entry);
    return response.data;
  }
  function eraseLocalIdentity() {
    clear();
    root.localStorage.removeItem(CUSTOMER_KEY);
    root.localStorage.removeItem(INTERACTION_KEY);
    root.localStorage.removeItem(SERIES_KEY);
  }
  root.b3OrderAvailabilityNativeResponse = onNativeReply;
  root.B3OrderAvailability = Object.freeze({prepare,execute,clear,read,checkConnection,
    checkAgentAvailability,quoteDelivery,prepareInteraction,createInteraction,readInteraction,
    pollInteraction,cancelInteraction,rejectedStores,markRejectedStore,eraseLocalIdentity});
})(window);
