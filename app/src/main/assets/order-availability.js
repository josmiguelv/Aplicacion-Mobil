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
  // Prevent simultaneous FORM POSTs when checkout and the status poll overlap.
  const formPostsInFlight = new Map();
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
      const error = Error(reply.error==='LOCAL_CONTRACT_REJECTED'?
        'Android rechazó el formato del FORM antes de emitir la petición HTTP.':
        'No fue posible completar la comunicación con el Administrador.');
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
      }, action.operation==='INTERACTION_MESSAGE'?35000:25000);
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
  async function readReservationSlots({appId,storeId,date,mode}){
    if(typeof appId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(appId)||
       !UUID.test(storeId)||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
       !['delivery','pickup'].includes(mode))
      throw Error('Sede, fecha o modalidad de programación inválidas.');
    const response=await nativeRequest({operation:'RESERVATION_SLOTS',appId,storeId,date,mode});
    if(Number(response.status)!==200)
      throw responseError(response,'No se pudieron consultar los horarios de programación');
    const data=response.data||{};
    if(data.appId!==appId||data.storeId!==storeId||data.date!==date||data.mode!==mode||
       !Number.isSafeInteger(data.revision)||data.revision<1||
       typeof data.enabled!=='boolean'||!Array.isArray(data.slots)||
       data.capacityVerified!==false||data.acceptingRequests!==false||
       data.slots.length>96||
       !data.slots.every(s=>s&&typeof s.time==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)&&
         typeof s.scheduledAt==='string'&&!Number.isNaN(Date.parse(s.scheduledAt))))
      throw Error('El Administrador devolvió horarios incompatibles o no verificados.');
    // The scheduling backend is read-only in this phase: never imply a slot is held.
    return data;
  }
  async function quoteDelivery({appId,storeId,address,district,latitude,longitude,useGps}) {
    if(typeof appId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(appId))
      throw Error('Identificador de aplicación inválido.');
    if(typeof address!=='string'||address.trim().length<6||typeof district!=='string'||
       district.trim().length<2) throw Error('Confirma la dirección para cotizar delivery.');
    const body={appId,mode:'delivery',address:address.trim(),district:district.trim(),
      city:'Lima',country:'Perú',useGps:useGps===true||Number.isFinite(latitude)&&Number.isFinite(longitude)};
    if(storeId!==undefined){
      if(!UUID.test(storeId))throw Error('La sede a cotizar no es válida.');
      body.storeId=storeId;
    }
    if(Number.isFinite(latitude)&&Number.isFinite(longitude)){
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
  // Poll and FORM POST can hold different snapshots of the same interaction.
  // Never let a stale status read erase an in-flight message's cooldown or ACK.
  function syncFormDeliveryState(entry) {
    const current=readInteraction();
    if(!entry||!current||current.interactionId!==entry.interactionId||
       current.idempotencyKey!==entry.idempotencyKey)return entry;
    for(const key of ['messageDelivered','messageIdempotencyKey','messageRetryAt',
      'message429Attempts','messageDeliveryUncertain','messageDeliveryBlocked']){
      if(Object.prototype.hasOwnProperty.call(current,key))entry[key]=current[key];
      else delete entry[key];
    }
    return entry;
  }
  // Only locally confirmed milestones are recorded; no simulated server replies.
  // Records stay within the same private, per-device interaction entry.
  const ACTIVITY_TYPES=new Set(['prepared','created','detail_delivered','accepted',
    'rejected','expired','cancelled','cancel_requested','cancelled_before_send','payment_window']);
  function recordActivity(entry,type) {
    if(!entry||!ACTIVITY_TYPES.has(type))return entry;
    const events=Array.isArray(entry.activity)?entry.activity.filter(e=>e&&
      ACTIVITY_TYPES.has(e.type)&&Number.isFinite(e.at)).slice(-39):[];
    if(!events.some(e=>e.type===type)){
      events.push({type,at:Date.now()});
      entry.activity=events;
      persistInteraction(entry);
    }
    return entry;
  }
  // Store the exact display ticket once, separate from the CREATE payload.
  // No Cliente or Teléfono fields: identity already travels with customer.
  function normalizeOrderForm(form) {
    const labels=['Productos','Subtotal','Dirección y referencia'];
    if(!form||typeof form!=='object'||Array.isArray(form)||
      Object.keys(form).some(k=>!['title','subtitle','fields'].includes(k))||
      form.title!=='VALIDACIÓN DE PEDIDO'||
      form.subtitle!=='Confirmar disponibilidad para delivery'||
      form.title.length>180||form.subtitle.length>350||
      !Array.isArray(form.fields)||form.fields.length!==3)
      throw Error('La solicitud de aprobación requiere exactamente tres variables.');
    const fields=form.fields.map((item,index)=>{
      if(!item||typeof item!=='object'||Array.isArray(item)||
        Object.keys(item).some(k=>!['variable','value'].includes(k))||
        item.variable!==labels[index]||item.variable.length>80||
        typeof item.value!=='string'||!item.value.trim()||item.value.length>500||
        /[\x00-\x09\x0b-\x1f]/.test(item.value))
        throw Error('Los campos del FORM no corresponden al contrato de aprobación.');
      return {variable:labels[index],value:item.value};
    });
    return {title:form.title,subtitle:form.subtitle,fields};
  }
  // Diagnostic metadata only. No UUIDs, client identity, addresses or JSON bodies.
  function formTrace(stage,fieldCount,status=0,returnedType='NONE',outcome='UNKNOWN') {
    try{
      root.AndroidBridge?.orderFormDiagnostic?.(stage,fieldCount,status,
        returnedType==='FORM'?'FORM':returnedType==='TEXT'?'TEXT':'OTHER',outcome);
    }catch(_){/* Diagnostics cannot interrupt checkout. */}
  }
  function prepareInteraction({appId,storeId,catalogRevision,items,address,district,customer,orderForm}) {
    if(typeof appId!=='string'||!UUID.test(storeId)||
      !Number.isSafeInteger(catalogRevision)||catalogRevision<1||
      !Array.isArray(items)||items.length<1||items.length>50||
      !items.every(i=>i&&UUID.test(i.productId)&&Number.isInteger(i.quantity)&&
        i.quantity>=1&&i.quantity<=99))
      throw Error('La solicitud de atención no tiene sede, revisión o productos publicados válidos.');
    // Only an explicitly completed delivery contact is added; existing clients remain compatible.
    let safeCustomer;
    if(customer!==undefined){
      const field=(value,min,max)=>typeof value==='string'&&value.trim().length>=min&&
        value.length<=max&&!/[\x00-\x1f]/.test(value);
      if(!customer||typeof customer!=='object'||Array.isArray(customer)||
        Object.keys(customer).some(k=>!['firstName','lastName','phone','address','district','reference','mode'].includes(k))||
        customer.mode!=='delivery'||!field(customer.firstName,2,60)||!field(customer.lastName,2,60)||
        typeof customer.phone!=='string'||!/^9[0-9]{8}$/.test(customer.phone)||
        !field(customer.address,6,180)||!field(customer.district,2,80)||
        (customer.reference!==undefined&&
         (typeof customer.reference!=='string'||customer.reference.length>180||
          /[\x00-\x1f]/.test(customer.reference))))
        throw Error('Completa nombres, apellidos, celular y dirección antes de enviar el pedido.');
      safeCustomer={firstName:customer.firstName.trim(),lastName:customer.lastName.trim(),
        phone:customer.phone,address:customer.address.trim(),district:customer.district.trim(),
        reference:String(customer.reference||'').trim(),mode:'delivery'};
      if(safeCustomer.address!==String(address||'').trim()||
        safeCustomer.district!==String(district||'').trim())
        throw Error('La dirección de la solicitud no coincide con la confirmada.');
    }
    const body={appId,storeId,catalogRevision,customerExternalId:externalCustomerId(),
      items:items.map(i=>({productId:i.productId,quantity:i.quantity}))
        .sort((a,b)=>a.productId.localeCompare(b.productId))};
    if(safeCustomer)body.customer=safeCustomer;
    // A submitted Delivery order must have the exact approval ticket before its message POST.
    // Do not change the CREATE payload or reissue an existing interaction.
    const formSnapshot=orderForm===undefined?null:normalizeOrderForm(orderForm);
    if(safeCustomer&&!formSnapshot)
      throw Error('La aprobación del pedido requiere un ticket FORM válido.');
    const fingerprint=JSON.stringify({...body,address:String(address||'').trim(),
      district:String(district||'').trim()});
    const prior=readInteraction();
    if(prior?.fingerprint===fingerprint&&!['REJECTED','CANCELLED','EXPIRED'].includes(prior.status)){
      // An older pending request may lack the ticket; upgrade the same request in place.
      // Never replace a snapshot that has already been sent or prepared.
      if(safeCustomer&&formSnapshot&&!prior.orderForm&&prior.messageDelivered!==true){
        prior.orderForm=formSnapshot;
        persistInteraction(prior);
      }
      return prior;
    }
    if(prior&&!['PREPARED','REJECTED','CANCELLED','EXPIRED'].includes(prior.status))
      throw Error('Ya existe una solicitud de atención iniciada. No enviaremos otro formulario mientras no se confirme su resolución.');
    const now=Date.now();
    const creationKey=uuid();
    let formKey=uuid();
    while(formKey===creationKey)formKey=uuid();
    return persistInteraction({fingerprint,body,
      ...(formSnapshot?{orderForm:formSnapshot}:{}),
      idempotencyKey:creationKey,messageIdempotencyKey:formKey,
      interactionId:null,status:'PREPARED',createdAt:now,
      activity:[{type:'prepared',at:now}]});
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
    if(!UUID.test(data.interactionId)||!['PENDING','ACCEPTED','REJECTED','EXPIRED'].includes(data.status)||
      data.storeId!==entry.body.storeId||
      typeof data.externalReference!=='string'||!data.externalReference.startsWith('mobile:'))
      throw Error('La respuesta de TU VERSO no confirmó una interacción pendiente válida.');
    // Persist the server-confirmed interaction before the separate message POST.
    entry.status='PENDING';entry.interactionId=data.interactionId;
    entry.messageDelivered=!entry.body.customer;
    persistInteraction(entry);
    recordActivity(entry,'created'); // Confirmed by the Administrator's 200/201 response.
    return {...data,status:'PENDING'};
  }
  async function sendInteractionMessage(entry) {
    const interactionId=entry?.interactionId;
    if(UUID.test(interactionId)&&formPostsInFlight.has(interactionId))
      return formPostsInFlight.get(interactionId);
    const task=sendInteractionMessageOnce(entry);
    if(UUID.test(interactionId))formPostsInFlight.set(interactionId,task);
    try{return await task;}
    finally{
      if(formPostsInFlight.get(interactionId)===task)formPostsInFlight.delete(interactionId);
    }
  }
  async function sendInteractionMessageOnce(entry) {
    syncFormDeliveryState(entry);
    if(!entry||!UUID.test(entry.interactionId)||!UUID.test(entry.idempotencyKey)||
       !entry.body?.customer||entry.body.customer.mode!=='delivery'||
       !['PENDING','ACCEPTED'].includes(entry.status))
      throw Error('No existe una solicitud de aprobación de Delivery pendiente.');
    if(entry.messageDelivered===true)return {interactionId:entry.interactionId,delivered:true};
    if(entry.messageDeliveryUncertain===true){
      const error=Error('La entrega del FORM no se pudo comprobar. No se reenviará automáticamente: se requiere confirmación del servidor.');
      error.code='FORM_DELIVERY_UNCERTAIN';throw error;
    }
    if(entry.messageDeliveryBlocked===true){
      const error=Error('El Administrador no confirmó el tipo FORM; no reenviamos el pedido.');
      error.code='FORM_CONTRACT_REJECTED';throw error;
    }
    // Persisted cooldown survives app restarts; no repeated POST during HTTP 429.
    if(Number.isFinite(entry.messageRetryAt)&&entry.messageRetryAt>Date.now()){
      const error=Error('El FORM tiene un reintento programado, sin crear otra interacción.');
      error.code='FORM_RETRY_DELAY';
      error.retryAfterMs=entry.messageRetryAt-Date.now();
      throw error;
    }
    if(!entry.orderForm)
      throw Error('Falta el ticket FORM obligatorio para la aprobación del pedido.');
    const messageBody={type:'FORM',appId:entry.body.appId,storeId:entry.body.storeId,
      form:normalizeOrderForm(entry.orderForm)};
    // Store a separate stable idempotency key BEFORE making any network request.
    if(!UUID.test(entry.messageIdempotencyKey)||entry.messageIdempotencyKey===entry.idempotencyKey){
      let next=uuid();
      while(next===entry.idempotencyKey)next=uuid();
      entry.messageIdempotencyKey=next;
      persistInteraction(entry);
    }
    formTrace('JS_BUILD',messageBody.form.fields.length,0,'FORM');
    let response;
    try{
      response=await nativeRequest({operation:'INTERACTION_MESSAGE',
        interactionId:entry.interactionId,accessKey:entry.idempotencyKey,
        idempotencyKey:entry.messageIdempotencyKey,body:messageBody});
    }catch(error){
      // Timeout / transport failures could happen after the server accepted FORM.
      if(['TIMEOUT','NETWORK_OR_CONTRACT_ERROR','CONNECTION_FAILED','REDIRECT_BLOCKED'].includes(error?.code)){
        entry.messageDeliveryUncertain=true;persistInteraction(entry);
      }
      if(error?.code==='LOCAL_CONTRACT_REJECTED'){
        entry.messageDeliveryBlocked=true;persistInteraction(entry);
      }
      throw error;
    }
    const data=response.data||{};
    formTrace('JS_RESPONSE',messageBody.form.fields.length,Number(response.status),
      data.type,data.delivered===true?'ACK':'NO_ACK');
    if(Number(response.status)!==200){
      const status=Number(response.status);
      if([400,409].includes(status)){
        entry.messageDeliveryBlocked=true;persistInteraction(entry);
      }
      if(status===429){
        // Each 429 increases the delay: 30 s, 60 s, 120 s, 240 s, then 5 min.
        // The message payload, interaction and idempotency key do not change.
        const attempts=Math.min(20,(Number.isInteger(entry.message429Attempts)?
          Math.max(0,entry.message429Attempts):0)+1);
        const backoffMs=Math.min(300000,30000*Math.pow(2,Math.min(4,attempts-1)));
        entry.message429Attempts=attempts;
        entry.messageRetryAt=Date.now()+backoffMs;
        persistInteraction(entry);
      }
      if(status===503){
        entry.messageDeliveryUncertain=true;persistInteraction(entry);
      }
      if(status===400&&data.error==='Datos de solicitud de texto inválidos'){
        const error=Error('HTTP 400: el Administrador solo admite el contrato TEXT en /message y rechaza type FORM.');
        error.httpStatus=400;error.code='ADMIN_FORM_UNSUPPORTED';throw error;
      }
      throw responseError(response,'No se pudo confirmar el ticket del pedido');
    }
    if(data.interactionId!==entry.interactionId||data.delivered!==true||
       !UUID.test(data.messageId)||data.type!=='FORM'){
      // A 200 without explicit FORM acknowledgement is NOT proof of delivery.
      entry.messageDeliveryBlocked=true;persistInteraction(entry);
      const error=Error('El Administrador respondió HTTP 200 pero no certificó type FORM y los identificadores del mensaje.');
      error.httpStatus=200;error.code='FORM_ACK_INVALID';throw error;
    }
    entry.messageDelivered=true;
    delete entry.messageRetryAt;
    delete entry.message429Attempts;
    persistInteraction(entry);
    recordActivity(entry,'detail_delivered'); // Only a typed FORM acknowledgement confirms delivery.
    return data;
  }
  const SERIES_KEY='b3-mobile-rejected-stores-v1';
  // A rejected interaction is terminal. Dismiss only the local checkout record
  // after an explicit customer navigation; never cancel/reopen it on the server.
  function dismissRejectedInteraction(interactionId){
    const entry=readInteraction();
    if(entry?.status!=='REJECTED'||!UUID.test(interactionId)||
       entry.interactionId!==interactionId)return false;
    root.localStorage.removeItem(INTERACTION_KEY);
    // A new order is a new consultation, even if the address and store match.
    root.localStorage.removeItem(SERIES_KEY);
    return true;
  }
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
  // Pollos B3 mobile owns agent-text decisions and how the order proceeds.
  // Use complete, exact approval/rejection words; never infer from INBOUND text.
  function interpretAgentDecision(agentMessages) {
    for(const message of agentMessages) {
      const text=message.text.trim().toLocaleLowerCase('es-PE').replace(/[.!]+$/,'').trim();
      if(['aceptar','acepto','aceptado','aceptada'].includes(text))
        return {decision:'ACCEPTED',agentMessageId:message.id};
      if(['rechazar','rechazado','rechazada'].includes(text))
        return {decision:'REJECTED',agentMessageId:message.id};
    }
    return {decision:null,agentMessageId:null};
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
       !['PENDING','ACCEPTED','REJECTED','EXPIRED','CANCELLED'].includes(data.status)||
       !Array.isArray(data.agentMessages)||data.agentMessages.length>100||
       data.agentMessages.some(m=>!m||!UUID.test(m.id)||typeof m.text!=='string'||
         m.text.length>8000||typeof m.createdAt!=='string'))
      throw Error('La respuesta del asesor no coincide con esta interacción.');
    // FORM delivery state can have changed while the status GET was in flight.
    syncFormDeliveryState(entry);
    // The Administrator returns only verified OUTBOUND conversation messages.
    // Never replace a verified snapshot after a transient history-read outage.
    if(data.messagesAvailable===true)
      entry.agentMessages=data.agentMessages.slice(-40).map(m=>({
        id:m.id,text:m.text,createdAt:m.createdAt
      }));
    // A verified terminal canonical conversation with no commercial decision
    // is a rejection, not an endlessly pending interaction. Require a readable
    // agent-message snapshot: a transient history outage cannot reject an order.
    // TU VERSO closure can be projected by the Administrator either as its
    // verified operational status or as the explicit normalized lifecycle.
    // Never infer closure from an absent status, timeout or lack of messages.
    const canonicalClosed=['RESOLVED','CLOSED'].includes(data.operationalConversationStatus)||
      data.conversationState==='CLOSED';
    // Closure is an authoritative S2S fact even if message history is down.
    // Preserve any previously verified ACEPTADO; never infer one from an outage.
    const verifiedMessages=data.messagesAvailable===true?data.agentMessages:
      Array.isArray(entry.agentMessages)?entry.agentMessages:[];
    const closureDecision=canonicalClosed?interpretAgentDecision(verifiedMessages):null;
    // A formal TU VERSO status takes precedence over chat text, especially rejection/expiry.
    let decision=null,agentMessageId=null;
    if(data.status==='EXPIRED')entry.status='EXPIRED';
    else if(data.status==='CANCELLED')entry.status='CANCELLED';
    else if(data.status==='REJECTED'){entry.status='REJECTED';decision='REJECTED';}
    else if(canonicalClosed){
      decision=closureDecision.decision||(entry.agentDecision==='ACCEPTED'?'ACCEPTED':'REJECTED');
      agentMessageId=closureDecision.agentMessageId||
        (decision==='ACCEPTED'?entry.agentMessageId:null);
      entry.status=decision;
      if(decision==='REJECTED'&&!agentMessageId)
        entry.rejectionReason=data.messagesAvailable===true?'AGENT_CLOSED_WITHOUT_CONFIRMATION':
          'AGENT_CLOSED_UNCONFIRMED';
    }
    else if(data.status==='ACCEPTED'){
      // Technical acceptance/assignment does not confirm the commercial order.
      const agent=interpretAgentDecision(data.agentMessages);
      decision=agent.decision;agentMessageId=agent.agentMessageId;
      entry.status=decision||'PENDING';
    }
    else {
      const agent=interpretAgentDecision(data.agentMessages);
      decision=agent.decision;agentMessageId=agent.agentMessageId;
      if(decision==='ACCEPTED')entry.status='ACCEPTED';
      else if(decision==='REJECTED')entry.status='REJECTED';
      else entry.status='PENDING';
    }
    if(decision){entry.agentDecision=decision;entry.agentMessageId=agentMessageId;}
    persistInteraction(entry);
    if(entry.status==='EXPIRED')recordActivity(entry,'expired');
    else if(entry.status==='CANCELLED')recordActivity(entry,'cancelled');
    else if(decision==='ACCEPTED')recordActivity(entry,'accepted');
    else if(decision==='REJECTED')recordActivity(entry,'rejected');
    return {interactionId:data.interactionId,storeId:data.storeId,status:data.status,
      decision,agentMessageId,clientStatus:entry.status};
  }
  async function registerPersonalDevice(entry,fcmToken){
    if(!entry||!UUID.test(entry.interactionId)||!UUID.test(entry.idempotencyKey))
      throw Error('No existe una solicitud a la cual asociar el dispositivo.');
    if(typeof fcmToken!=='string'||fcmToken.length<50||fcmToken.length>4096||
       !/^[A-Za-z0-9_:.-]+$/.test(fcmToken))throw Error('Token de notificación inválido.');
    const response=await nativeRequest({operation:'INTERACTION_DEVICE',interactionId:entry.interactionId,
      accessKey:entry.idempotencyKey,appId:entry.body.appId,storeId:entry.body.storeId,fcmToken});
    if(Number(response.status)!==200||response.data?.registered!==true)
      throw responseError(response,'No se pudo registrar la notificación individual');
    return response.data;
  }
  async function beginPaymentWait(entry){
    if(!entry||entry.status!=='ACCEPTED'||!UUID.test(entry.interactionId))
      throw Error('Todavía no se confirmó el pedido.');
    const response=await nativeRequest({operation:'INTERACTION_PAYMENT',interactionId:entry.interactionId,
      accessKey:entry.idempotencyKey,appId:entry.body.appId,storeId:entry.body.storeId});
    if(Number(response.status)!==200||response.data?.status!=='PAYMENT_PENDING'||
      !Number.isFinite(Date.parse(response.data.expiresAt)))
      throw responseError(response,'No se pudo confirmar el plazo del pago');
    entry.paymentExpiresAt=response.data.expiresAt;
    persistInteraction(entry);
    recordActivity(entry,'payment_window');
    return response.data;
  }
  async function readPaymentWait(entry){
    if(!entry||!UUID.test(entry.interactionId))throw Error('Interacción inválida.');
    const response=await nativeRequest({operation:'INTERACTION_PAYMENT_STATUS',interactionId:entry.interactionId,
      accessKey:entry.idempotencyKey,appId:entry.body.appId,storeId:entry.body.storeId});
    if(Number(response.status)!==200)throw responseError(response,'No se pudo actualizar el estado del pago');
    if(response.data?.status==='EXPIRED'){
      entry.status='EXPIRED';entry.paymentExpiresAt=response.data.expiresAt;
      persistInteraction(entry);recordActivity(entry,'expired');
    }
    return response.data;
  }
  function requestCancelWhenRecovered(entry){
    if(!entry||entry.status!=='SUBMITTING'||entry.interactionId)throw Error('La solicitud ya permite cancelación directa.');
    entry.cancelRequested=true;
    persistInteraction(entry);
    return recordActivity(entry,'cancel_requested');
  }
  async function cancelInteraction(entry,{reason='MODIFY'}={}){
    if(!entry||!UUID.test(entry.idempotencyKey))throw Error('No hay solicitud que cancelar.');
    if(entry.status==='CANCELLED')return {status:'CANCELLED'};
    if(!UUID.test(entry.interactionId)){
      entry.status='CANCELLED';persistInteraction(entry);
      recordActivity(entry,'cancelled_before_send');
      return {status:'CANCELLED'};
    }
    const response=await nativeRequest({operation:'INTERACTION_CANCEL',interactionId:entry.interactionId,
      accessKey:entry.idempotencyKey,appId:entry.body.appId,storeId:entry.body.storeId,reason});
    if(Number(response.status)!==200||response.data?.status!=='CANCELLED')
      throw responseError(response,'No se pudo notificar la cancelación de la solicitud');
    entry.status='CANCELLED';persistInteraction(entry);
    recordActivity(entry,'cancelled');
    return response.data;
  }
  function eraseLocalIdentity() {
    clear();
    root.localStorage.removeItem(CUSTOMER_KEY);
    root.localStorage.removeItem(INTERACTION_KEY);
    root.localStorage.removeItem(SERIES_KEY);
  }
  // Scheduled orders are server-owned and persist across Android restarts.
  // Never reuse a NOW order or post another FORM on an uncertain response.
  const RESERVATION_KEY='b3-mobile-scheduled-reservation-v1';
  const statuses=new Set(['CREATING','FORM_UNCERTAIN','AWAITING_AGENT',
    'AWAITING_PAYMENT','CONFIRMED','REJECTED','CANCELLED','EXPIRED']);
  function readReservation(){
    try {
      const e=JSON.parse(root.localStorage.getItem(RESERVATION_KEY)||'null');
      if(!e||!UUID.test(e.idempotencyKey)||!UUID.test(e.accessKey)||
         !/^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/.test(e.appId)||
         !e.body||typeof e.body!=='object'||(e.reservationId&&!UUID.test(e.reservationId)))return null;
      return e;
    }catch(_){return null;}
  }
  function persistReservation(e){
    root.localStorage.setItem(RESERVATION_KEY,JSON.stringify(e));
    return e;
  }
  function activeReservation(){
    const e=readReservation();
    return e&&!['REJECTED','CANCELLED','EXPIRED','CONFIRMED'].includes(e.status)?e:null;
  }
  function discardTerminalReservation(){
    const e=readReservation();
    if(!e||!['REJECTED','CANCELLED','EXPIRED','CONFIRMED'].includes(e.status))return false;
    root.localStorage.removeItem(RESERVATION_KEY);return true;
  }
  function verifyQuote(input,data){
    if(!data||data.revision!==input.catalogRevision||
       data.mode!==input.mode||data.date!==input.date||data.time!==input.time||
       !UUID.test(data.storeId)||data.agentAvailable!==true||
       data.capacityAvailable!==true||data.provisional!==true||data.acceptingRequests!==true||
       !Number.isInteger(data.preparationMinutes)||data.preparationMinutes<1||data.preparationMinutes>240||
       !Number.isFinite(data.deliveryFeePen)||data.deliveryFeePen<0||
       !Array.isArray(data.paymentMethods)||!data.paymentMethods.every(x=>['cash','yape','plin','card'].includes(x)))
       throw Error('El Administrador no confirmó disponibilidad preliminar de la reserva.');
    return data;
  }
  async function quoteReservation(body){
    const response=await nativeRequest({operation:'RESERVATION_QUOTE',body});
    if(Number(response.status)!==200)throw responseError(response,'No se pudo validar el horario programado');
    return verifyQuote(body,response.data||{});
  }
  function prepareReservation(body,quoted){
    const existing=activeReservation();
    if(existing)throw Error('Tienes una reserva en validación. Consulta o cancela esa solicitud primero.');
    verifyQuote(body,quoted);
    if(body.storeId!==quoted.storeId||
       body.mode==='delivery'&&body.expectedDeliveryFeePen!==Math.round(quoted.deliveryFeePen*100))
      throw Error('La sede o tarifa de la reserva cambiaron. Revisa el importe.');
    const pending={appId:body.appId,body,quote:quoted,idempotencyKey:uuid(),
      accessKey:uuid(),status:'CREATING',reservationId:null,createdAt:Date.now()};
    if(pending.idempotencyKey===pending.accessKey)pending.accessKey=uuid();
    return persistReservation(pending);
  }
  function applyReservationResult(entry,response,{expectedStatus=[200,201,202]}={}){
    if(!expectedStatus.includes(Number(response.status)))
      throw responseError(response,'No se pudo comprobar la reserva');
    const d=response.data||{};
    if(!UUID.test(d.id)||d.storeId!==entry.body.storeId||
       d.mode!==entry.body.mode||d.date!==entry.body.date||d.time!==entry.body.time||
       !statuses.has(d.status)||!['NOT_SELECTED','AWAITING_VERIFICATION','VERIFIED','DUE_AT_RECEIPT'].includes(d.paymentStatus))
       throw Error('El Administrador respondió una reserva diferente o incompatible.');
    entry.reservationId=d.id;entry.status=d.status;entry.lastResult=d;
    persistReservation(entry);
    return d;
  }
  async function createReservation(entry){
    if(!entry||!UUID.test(entry.idempotencyKey)||!UUID.test(entry.accessKey))
      throw Error('No existe una solicitud programada.');
    if(entry.reservationId)return statusReservation(entry);
    let response;
    try{response=await nativeRequest({operation:'RESERVATION_CREATE',body:entry.body,
      idempotencyKey:entry.idempotencyKey,accessKey:entry.accessKey});}
    catch(e){
      entry.uncertain=true;persistReservation(entry);throw e;
    }
    if(Number(response.status)>=500){
      entry.uncertain=true;persistReservation(entry);
      throw responseError(response,'No se pudo verificar si se creó la reserva. Consulta el estado antes de volver a intentar.');
    }
    return applyReservationResult(entry,response,{expectedStatus:[200,201,202]});
  }
  async function recoverReservation(entry){
    if(!entry||!UUID.test(entry.idempotencyKey))throw Error('Sin solicitud para recuperar.');
    const response=await nativeRequest({operation:'RESERVATION_RECOVER',
      idempotencyKey:entry.idempotencyKey,appId:entry.appId,accessKey:entry.accessKey});
    if(Number(response.status)!==200)
      throw responseError(response,'No encontramos una solicitud confirmada. No generaremos una segunda reserva.');
    return applyReservationResult(entry,response);
  }
  async function statusReservation(entry){
    if(!entry)return null;
    if(!entry.reservationId)return recoverReservation(entry);
    const response=await nativeRequest({operation:'RESERVATION_STATUS',
      reservationId:entry.reservationId,appId:entry.appId,accessKey:entry.accessKey});
    return applyReservationResult(entry,response);
  }
  async function payReservation(entry,method){
    if(!entry?.reservationId||entry.status!=='AWAITING_PAYMENT'||
       !['cash','yape','plin','card'].includes(method))throw Error('Método o estado de pago inválido.');
    const response=await nativeRequest({operation:'RESERVATION_PAYMENT',
      reservationId:entry.reservationId,appId:entry.appId,accessKey:entry.accessKey,method});
    return applyReservationResult(entry,response);
  }
  async function cancelReservation(entry){
    if(!entry?.reservationId||entry.status==='CONFIRMED')throw Error('La reserva confirmada se gestiona con el local.');
    const response=await nativeRequest({operation:'RESERVATION_CANCEL',
      reservationId:entry.reservationId,appId:entry.appId,accessKey:entry.accessKey});
    return applyReservationResult(entry,response);
  }

  root.b3OrderAvailabilityNativeResponse = onNativeReply;
  root.B3OrderAvailability = Object.freeze({getExternalCustomerId:externalCustomerId,prepare,execute,clear,read,checkConnection,
    checkAgentAvailability,readReservationSlots,readReservation,activeReservation,discardTerminalReservation,quoteReservation,prepareReservation,createReservation,recoverReservation,statusReservation,payReservation,cancelReservation,quoteDelivery,prepareInteraction,createInteraction,sendInteractionMessage,readInteraction,
    pollInteraction,cancelInteraction,requestCancelWhenRecovered,registerPersonalDevice,beginPaymentWait,readPaymentWait,
    rejectedStores,markRejectedStore,dismissRejectedInteraction,eraseLocalIdentity});
})(window);
