/* Pollos B3 — contrato independiente de Pide y Retira.
 * Solo construye y valida formularios. No realiza pagos ni envía solicitudes.
 * La integración HTTP debe confirmar compatibilidad del Administrador antes de habilitarse.
 */
(function(root){
 'use strict';
 const safe=(v,max=500)=>typeof v==='string'&&v.trim()&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
 const money=n=>{const cents=Math.round(Number(n)*100);if(!Number.isSafeInteger(cents)||cents<0)throw Error('Importe inválido');return 'S/ '+(cents/100).toFixed(2)};
 function validate(input){
  if(!input||!safe(input.storeName,180)||!Array.isArray(input.items)||!input.items.length||input.items.length>50)throw Error('Selecciona una tienda y productos válidos');
  if(!['now','scheduled'].includes(input.when))throw Error('Selecciona retiro inmediato o programado');
  if(input.when==='scheduled'&&(!safe(input.dateTime,40)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.dateTime)||!Number.isFinite(Date.parse(input.dateTime))))throw Error('Fecha de retiro inválida');
  if(!input.items.every(x=>safe(x.name,80)&&Number.isInteger(x.quantity)&&x.quantity>0&&x.quantity<=99&&Number.isFinite(Number(x.unitPrice))&&Number(x.unitPrice)>0))throw Error('Productos inválidos');
  const total=input.items.reduce((sum,x)=>sum+Math.round(Number(x.unitPrice)*100)*x.quantity,0);
  if(!Number.isSafeInteger(total))throw Error('Total fuera de rango');
  return total/100;
 }
 function approval(input){
  const total=validate(input);
  const lines=input.items.map(x=>x.name+' × '+x.quantity+' ('+money(x.unitPrice*x.quantity)+')');
  if(!safe(input.customerName,120)||!/^\+[1-9][0-9]{6,14}$/.test(String(input.customerPhone||'')))throw Error('Confirma nombre y celular para el recojo');
  const fields=[
   {variable:'Cliente',value:input.customerName},
   {variable:'Celular',value:input.customerPhone},
   {variable:'Productos',value:lines.join(' · ')},
   {variable:'Subtotal',value:money(total)},
   {variable:'Tienda de recojo',value:input.storeName},
   {variable:'Modalidad',value:input.when==='now'?'Retirar ahora':'Recojo programado'}
  ];
  if(input.when==='scheduled')fields.push({variable:'Fecha y hora',value:input.dateTime});
  if(fields.some(x=>!safe(x.value)))throw Error('El detalle excede el máximo del FORM');
  return {type:'FORM',form:{title:'VALIDACIÓN DE RECOJO',subtitle:'Confirmar disponibilidad de productos para retiro en tienda',fields}};
 }
 function payment(input){
  const total=validate(input);
  if(!safe(input.orderCode,80)||!['yape','plin','card','cash'].includes(input.method))throw Error('Datos de pago inválidos');
  const fields=[
   {variable:'N.º de pedido',value:input.orderCode},
   {variable:'Pedido',value:input.items.map(x=>x.name+' x'+x.quantity).join(', ')},
   {variable:'Subtotal',value:money(total)},
   {variable:'Tienda de recojo',value:input.storeName},
   {variable:'Modalidad',value:input.when==='now'?'Retirar ahora':'Recojo programado'},
   {variable:'Total',value:money(total)}
  ];
  if(input.when==='scheduled')fields.push({variable:'Fecha y hora',value:input.dateTime});
  const names={yape:'YAPE',plin:'PLIN',card:'TARJETA'};
  if(input.method==='cash'){
   const amount=Math.round(Number(input.cashAmount)*100),due=Math.round(total*100);
   if(!Number.isSafeInteger(amount)||amount<due)throw Error('Monto en efectivo insuficiente');
   fields.push({variable:'Paga con',value:money(amount/100)},{variable:'Vuelto',value:money((amount-due)/100)});
  }else if(!safe(input.imageUrl,500)||!/^https:\/\/[^\s<>"']+\/api\/v1\/mobile\/payment-receipts\/images\/[0-9a-f-]{36}$/i.test(input.imageUrl)){
   throw Error('Comprobante no confirmado por el servidor');
  }
  if(fields.some(x=>!safe(x.value)))throw Error('Los datos exceden el máximo del FORM');
  return {type:'FORM',form:{title:input.method==='cash'?'PAGO RECOJO - EFECTIVO':'PAGO RECOJO - '+names[input.method],subtitle:input.method==='cash'?'Confirmar pago en efectivo al retirar':'Comprobante adjunto',...(input.method==='cash'?{}:{imageUrl:input.imageUrl}),fields}};
 }
 root.B3PickupOrderContract=Object.freeze({approval,payment,validate});
})(typeof window!=='undefined'?window:globalThis);
