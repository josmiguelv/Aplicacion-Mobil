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
      const surveyReasons={
        'Invalid survey identifiers':'No se pudieron validar los identificadores del pedido y de la encuesta.',
        'Invalid survey payload':'La aplicación no construyó correctamente los datos de la encuesta.',
        'Invalid survey interactionId':'El identificador del pedido no tiene un formato válido.',
        'Invalid survey accessKey':'La autorización local del pedido no tiene un formato válido.',
        'Invalid survey idempotencyKey':'El identificador del envío de la encuesta no es válido.',
        'Invalid survey duplicateKey':'La encuesta está utilizando incorrectamente la clave del pedido.',
        'Invalid survey appId':'El identificador de la aplicación no corresponde a Pollos B3.',
        'Invalid survey storeId':'El identificador de la sede no es válido.',
        'Invalid survey rating':'La calificación debe ser un número entero de 1 a 5.',
        'Invalid survey tags':'Las categorías seleccionadas no cumplen el formato requerido.',
        'Invalid survey tag':'Una categoría de la encuesta no está permitida.',
        'Invalid survey comment':'El comentario supera el límite o contiene un formato inválido.'
      };
      const surveyFailure=reply.surveyValidationError&&surveyReasons[reply.surveyValidationError];
      const error = Error(reply.error==='LOCAL_CONTRACT_REJECTED'?
        (surveyFailure||'Android rechazó los datos antes de emitir la petición HTTP. Revisa los datos y actualiza la APK si persiste.'):
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
      }, action.operation==='INTERACTION_RECEIPT_UPLOAD'?65000:['INTERACTION_MESSAGE','INTERACTION_PAYMENT_FORM'].includes(action.operation)?35000:25000);
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
      'message429Attempts','messageDeliveryUncertain','messageDeliveryBlocked','paymentConfirmation','receiptUpload',
      'paymentStartedAt','paymentExpiresAt','paymentDurationMinutes','paymentClockSource']){
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
    if(!form||typeof form!=='object'||Array.isArray(form)||
      Object.keys(form).some(k=>!['title','subtitle','fields'].includes(k))||
      form.title!=='VALIDACIÓN DE PEDIDO'||
      form.subtitle!=='Confirmar disponibilidad para delivery'||
      !Array.isArray(form.fields)||form.fields.length<3||form.fields.length>10)
      throw Error('La validación requiere productos, subtotal y dirección (máximo diez variables).');
    const fields=form.fields.map(item=>{
      if(!item||typeof item!=='object'||Array.isArray(item)||
        Object.keys(item).some(k=>!['variable','value'].includes(k))||
        typeof item.variable!=='string'||item.variable.length>80||
        typeof item.value!=='string'||!item.value.trim()||item.value.length>500||
        /[\x00-\x1f]/.test(item.value))
        throw Error('Los campos del FORM no corresponden al contrato de aprobación.');
      return {variable:item.variable,value:item.value};
    });
    const labels=fields.map(f=>f.variable);
    const productFields=fields.length-2;
    const legacy=labels.join('|')==='Productos|Subtotal|Dirección y referencia';
    const indexed=productFields>=1&&productFields<=8&&
      labels.slice(0,productFields).every((name,i)=>
        name==='Producto '+(i+1)||
        (i===7&&name==='Productos 8 en adelante'))&&
      labels[productFields]==='Subtotal'&&
      labels[productFields+1]==='Dirección y referencia';
    const productNames=labels.slice(0,productFields);
    const uniqueNames=new Set(productNames.map(x=>x.trim().toLocaleLowerCase('es-PE')));
    const named=productFields>=1&&productFields<=8&&
      uniqueNames.size===productNames.length&&
      productNames.every((name,i)=>name.trim()&&
       !['subtotal','dirección y referencia','productos'].includes(name.trim().toLocaleLowerCase('es-PE'))&&
       (name!=='Productos restantes'||i===7))&&
      labels[productFields]==='Subtotal'&&
      labels[productFields+1]==='Dirección y referencia'&&
      fields.slice(0,productFields).every((field,i)=>
       field.variable==='Productos restantes'&&i===7?
        field.value.includes(' × S/ '):
        /^\d+ × S\/ \d+(?:\.\d{2})?$/.test(field.value));
    if(!legacy&&!indexed&&!named)throw Error('El FORM tiene nombres de variables incompatibles.');
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
    const canonicalClosed=['RESOLVED','CLOSED'].includes(data.operationalConversationStatus);
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
      // A technical agent assignment is not a commercial approval. During
      // a temporary history outage preserve only a previously verified answer.
      const agent=interpretAgentDecision(verifiedMessages);
      decision=agent.decision;
      agentMessageId=agent.agentMessageId;
      entry.status=decision||'PENDING';
    }
    else {
      // Do not erase an already verified reply when history is temporarily unavailable.
      const agent=interpretAgentDecision(verifiedMessages);
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
  // Android owns the checkout clock. Use the timestamp of the verified
  // outbound acceptance message, never a fresh timestamp on every render/retry.
  // This is a local client deadline, not a server-authoritative expiry.
  function startLocalPaymentWindow(entry,minutes){
    if(!entry||entry.status!=='ACCEPTED'||entry.agentDecision!=='ACCEPTED'||
       !UUID.test(entry.interactionId)||!UUID.test(entry.agentMessageId)||
       !Number.isInteger(minutes)||minutes<5||minutes>30)
      throw Error('No hay aceptación verificada o plazo configurado válido.');
    const latest=readInteraction();
    if(!latest||latest.interactionId!==entry.interactionId||
       latest.idempotencyKey!==entry.idempotencyKey||
       latest.status!=='ACCEPTED'||latest.agentDecision!=='ACCEPTED'||
       latest.agentMessageId!==entry.agentMessageId)
      throw Error('La confirmación del asesor cambió; revisa la solicitud.');
    const oldDeadline=Date.parse(latest.paymentExpiresAt||'');
    if(Number.isFinite(oldDeadline)){
      if(oldDeadline<=Date.now())throw Error('El plazo para pagar ya terminó.');
      entry.paymentExpiresAt=latest.paymentExpiresAt;
      return {status:'PAYMENT_PENDING',expiresAt:latest.paymentExpiresAt};
    }
    const accepted=Array.isArray(latest.agentMessages)?
      latest.agentMessages.find(m=>m.id===latest.agentMessageId):null;
    const verifiedAt=Date.parse(accepted?.createdAt||'');
    const startedAt=Number.isFinite(verifiedAt)&&verifiedAt<=Date.now()+120000?
      verifiedAt:Date.now();
    const expiresAt=new Date(startedAt+minutes*60000).toISOString();
    if(Date.parse(expiresAt)<=Date.now())
      throw Error('El plazo para pagar ya terminó.');
    latest.paymentStartedAt=new Date(startedAt).toISOString();
    latest.paymentExpiresAt=expiresAt;
    latest.paymentDurationMinutes=minutes;
    latest.paymentClockSource='ANDROID_LOCAL';
    persistInteraction(latest);
    entry.paymentStartedAt=latest.paymentStartedAt;
    entry.paymentExpiresAt=expiresAt;
    entry.paymentDurationMinutes=minutes;
    entry.paymentClockSource='ANDROID_LOCAL';
    recordActivity(latest,'payment_window');
    return {status:'PAYMENT_PENDING',expiresAt};
  }
  // Read-only verified OUTBOUND conversation messages for delivery follow-up.
  // This does not reinterpret the first order approval or mutate the payment.
  async function readTrackingMessages(entry){
    if(!entry||!UUID.test(entry.interactionId)||!UUID.test(entry.idempotencyKey))
      throw Error('No existe una interacción para seguir el pedido.');
    const response=await nativeRequest({operation:'INTERACTION_STATUS',
      interactionId:entry.interactionId,accessKey:entry.idempotencyKey,
      appId:entry.body.appId,storeId:entry.body.storeId});
    if(Number(response.status)!==200)
      throw responseError(response,'No se pudo actualizar el seguimiento del pedido');
    const data=response.data||{};
    if(data.interactionId!==entry.interactionId||data.storeId!==entry.body.storeId||
       !Array.isArray(data.agentMessages)||data.agentMessages.length>100||
       data.agentMessages.some(m=>!m||!UUID.test(m.id)||typeof m.text!=='string'||
        m.text.length>8000||typeof m.createdAt!=='string'))
      throw Error('La respuesta de seguimiento no corresponde a este pedido.');
    if(data.messagesAvailable!==true)
      return {available:false,messages:[],conversationState:data.conversationState};
    return {available:true,messages:data.agentMessages.map(m=>({
      id:m.id,text:m.text,createdAt:m.createdAt
    })),conversationState:data.conversationState};
  }
  async function uploadPaymentReceipt(entry) {
    if(!entry||entry.status!=='ACCEPTED'||entry.agentDecision!=='ACCEPTED'||
       !UUID.test(entry.interactionId)||!entry.paymentExpiresAt||
       Date.parse(entry.paymentExpiresAt)<=Date.now())
      throw Error('Este pedido ya no tiene un plazo activo para enviar comprobantes.');
    if(entry.receiptUpload?.status==='UPLOADED'&&entry.receiptUpload.imageUrl)
      return entry.receiptUpload;
    const current=readInteraction();
    if(!current||current.interactionId!==entry.interactionId)
      throw Error('El pedido cambió durante la carga del comprobante.');
    if(!current.receiptUpload)current.receiptUpload={receiptId:uuid(),status:'PREPARED'};
    const item=current.receiptUpload;
    if(item.status==='UPLOADING')
      throw Error('La carga del comprobante ya está en curso.');
    // Pre-migration builds called a removed route and saved a 404 as UNCERTAIN.
    // Only those old records may be retried using the consolidated endpoint.
    if(item.status==='UNCERTAIN'&&item.contractVersion===2&&!item.definitiveFailure)
      throw Error('No se confirmó la carga anterior. No la repetiremos automáticamente para evitar archivos duplicados.');
    item.contractVersion=2;
    item.status='UPLOADING';
    delete item.definitiveFailure;
    persistInteraction(current);
    let response;
    try{
      response=await nativeRequest({operation:'INTERACTION_RECEIPT_UPLOAD',
        interactionId:current.interactionId,accessKey:current.idempotencyKey,
        appId:current.body.appId,storeId:current.body.storeId,receiptId:item.receiptId});
    }catch(error){
      item.status='UNCERTAIN';persistInteraction(current);throw error;
    }
    const status=Number(response.status);
    const url=response.data?.imageUrl;
    let imageId='';
    try{
      const parsed=new URL(url);
      const match=parsed.pathname.match(/^\/api\/v1\/mobile\/payment-receipts\/images\/([0-9a-f-]{36})$/i);
      if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||
         !match||parsed.host.length<3||parsed.origin==='null')throw Error('INVALID_IMAGE_URL');
      imageId=match[1];
    }catch(_){/* Server response must contain a valid public HTTPS image URL. */}
    if(![200,201].includes(status)||typeof url!=='string'||!imageId||
       String(response.data?.imageId||'').toLowerCase()!==imageId.toLowerCase()){
      item.status='UNCERTAIN';
      if(status>=400&&status<500)item.definitiveFailure=true;
      persistInteraction(current);
      throw responseError(response,'No se pudo certificar la carga del comprobante');
    }
    item.status='UPLOADED';
    item.imageUrl=url;
    item.imageId=imageId;
    delete item.imagePath;
    persistInteraction(current);
    entry.receiptUpload=item;
    return item;
  }
  // A second FORM is independent of the store availability approval ticket.
  // Capture the verified outbound history BEFORE POST so the first "Aceptar"
  // cannot ever approve the payment.
  async function preparePaymentConfirmation(entry,form) {
    if(!entry||entry.status!=='ACCEPTED'||entry.agentDecision!=='ACCEPTED'||
       !UUID.test(entry.interactionId)||!entry.paymentExpiresAt)
      throw Error('La sede debe aprobar el pedido y habilitar el plazo de pago.');
    if(Date.parse(entry.paymentExpiresAt)<=Date.now())
      throw Error('El plazo de pago termino.');
    if(!form||form.type!=='FORM'||!form.form||
       !entry.receiptUpload||entry.receiptUpload.status!=='UPLOADED'||
       form.form.imageUrl!==entry.receiptUpload.imageUrl||
       !/^https:\/\/[^\s<>"']+$/i.test(form.form.imageUrl)||
       !/^PAGO REALIZADO - (YAPE|PLIN|TARJETA)$/.test(form.form.title)||
       !Array.isArray(form.form.fields)||form.form.fields.length!==6||
       form.form.fields.map(x=>x?.variable).join('|')!=='N.º de pedido|Pedido|Subtotal|Delivery|Dirección|Total'||
       form.form.fields[0]?.value!=='B3-'+entry.interactionId.replace(/-/g,'').slice(0,12).toUpperCase()||
       form.form.fields.some(x=>typeof x.value!=='string'||!x.value.trim()||x.value.length>500))
      throw Error('El formulario de pago no cumple el contrato de seis campos.');
    if(entry.paymentConfirmation){
      if(entry.paymentConfirmation.form?.form?.title!==form.form.title)
        throw Error('Este pedido ya tiene otra confirmacion de pago iniciada.');
      return entry.paymentConfirmation;
    }
    const response=await nativeRequest({operation:'INTERACTION_STATUS',
      interactionId:entry.interactionId,accessKey:entry.idempotencyKey,
      appId:entry.body.appId,storeId:entry.body.storeId});
    if(Number(response.status)!==200)throw responseError(response,'No se pudo verificar el historial previo al pago');
    const data=response.data||{};
    if(data.interactionId!==entry.interactionId||data.storeId!==entry.body.storeId||
       data.messagesAvailable!==true||!Array.isArray(data.agentMessages)||
       data.agentMessages.some(m=>!m||!UUID.test(m.id)))
      throw Error('No se pudo verificar el historial del agente. No se envio el FORM.');
    const current=readInteraction();
    if(current?.interactionId!==entry.interactionId)
      throw Error('El pedido cambio durante la preparacion del pago.');
    const confirmation={form,baselineIds:data.agentMessages.map(m=>m.id),
      messageKey:uuid(),status:'PREPARED'};
    current.paymentConfirmation=confirmation;
    persistInteraction(current);
    entry.paymentConfirmation=confirmation;
    return confirmation;
  }
  async function sendPaymentConfirmation(entry) {
    const confirmation=entry?.paymentConfirmation;
    if(!confirmation||!UUID.test(entry.interactionId)||!UUID.test(confirmation.messageKey))
      throw Error('Falta preparar la confirmacion de pago.');
    if(confirmation.status==='SENT'||confirmation.status==='ACCEPTED'||confirmation.status==='REJECTED')
      return confirmation;
    if(confirmation.status==='UNCERTAIN'||confirmation.status==='SENDING')
      throw Error('No se pudo verificar si el FORM llego. No se reenviara para evitar duplicados.');
    if(confirmation.status!=='PREPARED')
      throw Error('La confirmacion de pago esta en curso.');
    if(Date.parse(entry.paymentExpiresAt)<=Date.now())
      throw Error('El plazo de pago termino.');
    confirmation.status='SENDING';persistInteraction(entry);
    let response;
    try {
      response=await nativeRequest({operation:'INTERACTION_PAYMENT_FORM',
        interactionId:entry.interactionId,accessKey:entry.idempotencyKey,
        idempotencyKey:confirmation.messageKey,
        body:{appId:entry.body.appId,storeId:entry.body.storeId,form:confirmation.form.form}});
    }catch(error){
      // Native contract rejection happens BEFORE the HTTP request. It is safe
      // to correct the APK and retry the same FORM with its original message key.
      // Network errors remain UNCERTAIN: never resend without confirmation.
      confirmation.status=error?.code==='LOCAL_CONTRACT_REJECTED'?'PREPARED':'UNCERTAIN';
      persistInteraction(entry);
      throw error;
    }
    if(Number(response.status)!==200||response.data?.delivered!==true||
       response.data?.type!=='FORM'||response.data?.interactionId!==entry.interactionId||
       !UUID.test(response.data?.messageId||'')){
      confirmation.status='UNCERTAIN';persistInteraction(entry);
      throw responseError(response,'No se pudo certificar el FORM de pago');
    }
    confirmation.status='SENT';
    confirmation.messageId=response.data.messageId;
    persistInteraction(entry);
    return confirmation;
  }
  async function pollPaymentConfirmation(entry){
    const confirmation=entry?.paymentConfirmation;
    if(!confirmation||!['SENT','ACCEPTED','REJECTED'].includes(confirmation.status))
      return {decision:null,status:confirmation?.status||'NOT_SENT'};
    if(['ACCEPTED','REJECTED'].includes(confirmation.status))
      return {decision:confirmation.status,status:confirmation.status};
    const response=await nativeRequest({operation:'INTERACTION_STATUS',
      interactionId:entry.interactionId,accessKey:entry.idempotencyKey,
      appId:entry.body.appId,storeId:entry.body.storeId});
    if(Number(response.status)!==200)throw responseError(response,'No se pudo consultar la validacion de pago');
    const data=response.data||{};
    if(data.interactionId!==entry.interactionId||data.storeId!==entry.body.storeId||
       !Array.isArray(data.agentMessages)||data.agentMessages.some(m=>!m||!UUID.test(m.id)||typeof m.text!=='string'))
      throw Error('El historial de validacion no corresponde a este pedido.');
    if(data.messagesAvailable!==true)return {decision:null,status:'PENDING'};
    const baseline=new Set(confirmation.baselineIds);
    // Only NEW outbound messages qualify. Never reuse the earlier order approval.
    const fresh=data.agentMessages.filter(m=>!baseline.has(m.id));
    const answer=interpretAgentDecision(fresh);
    if(!answer.decision)return {decision:null,status:'PENDING'};
    confirmation.status=answer.decision;
    confirmation.agentMessageId=answer.agentMessageId;
    persistInteraction(entry);
    return {decision:answer.decision,status:answer.decision};
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
  // Payment start is idempotent on the server. If its response is lost, read
  // the same interaction's payment state before considering another POST.
  // Never open checkout from a locally guessed window or a stale interaction.
  async function readPaymentWait(entry){
    if(!entry||!UUID.test(entry.interactionId))throw Error('Interacción inválida.');
    const response=await nativeRequest({operation:'INTERACTION_PAYMENT_STATUS',interactionId:entry.interactionId,
      accessKey:entry.idempotencyKey,appId:entry.body.appId,storeId:entry.body.storeId});
    if(Number(response.status)!==200)throw responseError(response,'No se pudo actualizar el estado del pago');
    const data=response.data||{};
    if(data.status==='EXPIRED'){
      entry.status='EXPIRED';entry.paymentExpiresAt=data.expiresAt;
      persistInteraction(entry);recordActivity(entry,'expired');
    }else if(data.status==='PAYMENT_PENDING'&&
      Number.isFinite(Date.parse(data.expiresAt))&&Date.parse(data.expiresAt)>Date.now()){
      const current=readInteraction();
      if(!current||current.interactionId!==entry.interactionId||
         current.idempotencyKey!==entry.idempotencyKey)
        throw Error('La solicitud cambió durante la consulta del pago.');
      current.paymentExpiresAt=data.expiresAt;
      persistInteraction(current);
      entry.paymentExpiresAt=data.expiresAt;
      recordActivity(current,'payment_window');
    }
    return data;
  }
  async function beginPaymentWait(entry){
    if(!entry||entry.status!=='ACCEPTED'||entry.agentDecision!=='ACCEPTED'||
       !UUID.test(entry.interactionId))
      throw Error('Todavía no se confirmó el pedido.');
    const current=readInteraction();
    if(!current||current.interactionId!==entry.interactionId||
       current.idempotencyKey!==entry.idempotencyKey)
      throw Error('La solicitud cambió antes de habilitar el pago.');
    let response;
    try{
      response=await nativeRequest({operation:'INTERACTION_PAYMENT',interactionId:entry.interactionId,
        accessKey:entry.idempotencyKey,appId:entry.body.appId,storeId:entry.body.storeId});
    }catch(error){
      // Recover only by an authoritative GET. No duplicate POST and no invented timer.
      try{
        const recovered=await readPaymentWait(entry);
        if(recovered.status==='PAYMENT_PENDING'&&
           Number.isFinite(Date.parse(recovered.expiresAt))&&Date.parse(recovered.expiresAt)>Date.now())
          return recovered;
      }catch(_){/* Preserve the original transport error. */}
      throw error;
    }
    if(Number(response.status)!==200||response.data?.status!=='PAYMENT_PENDING'||
       !Number.isFinite(Date.parse(response.data.expiresAt))||
       Date.parse(response.data.expiresAt)<=Date.now()){
      const error=responseError(response,'No se pudo confirmar el plazo del pago');
      // A 5xx or uncertain success can mean the server committed despite an
      // invalid/lost response; check its state once before offering a retry.
      if(Number(response.status)>=500||Number(response.status)===200){
        try{
          const recovered=await readPaymentWait(entry);
          if(recovered.status==='PAYMENT_PENDING'&&
             Number.isFinite(Date.parse(recovered.expiresAt))&&Date.parse(recovered.expiresAt)>Date.now())
            return recovered;
        }catch(_){/* Do not mask the original failure. */}
      }
      throw error;
    }
    entry.paymentExpiresAt=response.data.expiresAt;
    const latest=readInteraction();
    if(!latest||latest.interactionId!==entry.interactionId||
       latest.idempotencyKey!==entry.idempotencyKey)
      throw Error('La solicitud cambió mientras se habilitaba el pago.');
    latest.paymentExpiresAt=response.data.expiresAt;
    persistInteraction(latest);
    recordActivity(latest,'payment_window');
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
  async function submitOrderSurvey({interactionId,storeId,idempotencyKey,rating,tags,comment}){
    const entry=readInteraction();
    const accepted=entry?.paymentConfirmation?.status==='ACCEPTED';
    if(!accepted||entry.interactionId!==interactionId||entry.body.storeId!==storeId||
       !UUID.test(entry.idempotencyKey)||!UUID.test(idempotencyKey)||
       entry.idempotencyKey===idempotencyKey)
      throw Error('No hay un pedido confirmado autorizado para esta encuesta.');
    const permitted=new Set(['Sabor','Temperatura','Tiempo','Presentación','Atención']);
    if(!Number.isInteger(rating)||rating<1||rating>5||
       !Array.isArray(tags)||tags.length>5||new Set(tags).size!==tags.length||
       tags.some(t=>!permitted.has(t))||typeof comment!=='string'||comment.length>500)
      throw Error('Revisa los datos de la encuesta.');
    const response=await nativeRequest({operation:'ORDER_SURVEY',
      interactionId,accessKey:entry.idempotencyKey,idempotencyKey,
      body:{appId:entry.body.appId,storeId,rating,tags,comment}});
    if(![200,201].includes(Number(response.status))||
       response.data?.stored!==true||response.data?.interactionId!==interactionId||
       !UUID.test(response.data?.surveyId||''))
      throw responseError(response,'No se pudo confirmar el registro de la encuesta');
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
    checkAgentAvailability,quoteDelivery,prepareInteraction,createInteraction,sendInteractionMessage,readInteraction,
    pollInteraction,cancelInteraction,requestCancelWhenRecovered,registerPersonalDevice,startLocalPaymentWindow,beginPaymentWait,readPaymentWait,
    submitOrderSurvey,readTrackingMessages,uploadPaymentReceipt,preparePaymentConfirmation,sendPaymentConfirmation,pollPaymentConfirmation,
    rejectedStores,markRejectedStore,dismissRejectedInteraction,eraseLocalIdentity});
})(window);
