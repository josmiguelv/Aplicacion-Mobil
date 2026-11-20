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
  function eraseLocalIdentity() {
    clear();
    root.localStorage.removeItem(CUSTOMER_KEY);
  }
  root.b3OrderAvailabilityNativeResponse = onNativeReply;
  root.B3OrderAvailability = Object.freeze({prepare,execute,clear,read,checkConnection,eraseLocalIdentity});
})(window);
