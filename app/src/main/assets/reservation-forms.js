/* Pollos B3: deterministic reservation FORM builder. No server calls or simulated approvals.
 * Source amounts and allowed payment methods must come from the published Admin contract.
 */
(function(root){
 'use strict';
 const LIMIT=10,VALUE_LIMIT=500,LABEL_LIMIT=80;
 const MONEY=n=>'S/ '+(n/100).toFixed(2);
 const cents=n=>{
   if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>9999999.99)
     throw Error('Importe monetario no válido.');
   const value=Math.round(n*100);
   if(Math.abs(n*100-value)>0.001)throw Error('El importe debe tener como máximo dos decimales.');
   return value;
 };
 const pad=n=>String(n).padStart(2,'0');
 const localDate=ms=>{
   const d=new Date(ms-5*3600000);
   return pad(d.getUTCDate())+'/'+pad(d.getUTCMonth()+1)+'/'+d.getUTCFullYear();
 };
 const localTime=ms=>{
   const d=new Date(ms-5*3600000),h=d.getUTCHours();
   return (h%12||12)+':'+pad(d.getUTCMinutes())+' '+(h<12?'a. m.':'p. m.');
 };
 function schedule(dateTime){
   if(typeof dateTime!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(dateTime))
     throw Error('Fecha y hora de reserva inválidas.');
   const [date,time]=dateTime.split('T'),[y,m,d]=date.split('-').map(Number),[h,min]=time.split(':').map(Number);
   const utc=Date.UTC(y,m-1,d,h+5,min);
   const check=new Date(Date.UTC(y,m-1,d));
   if(check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d)
     throw Error('Fecha de reserva inexistente.');
   const from=utc-15*60000,to=utc+15*60000;
   return {selectedAt:utc,from,to,date:localDate(utc),
     interval:localDate(from)===localDate(to)?
       localTime(from)+' – '+localTime(to):
       localDate(from)+' '+localTime(from)+' – '+localDate(to)+' '+localTime(to)};
 }
 function moneyInput(value){
   const raw=String(value??'').trim();
   if(!/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,2})?$/.test(raw))
     throw Error('Indica un monto en soles válido, con hasta dos decimales.');
   return cents(Number(raw));
 }
 function payment({method,total,amount,exact=false,allowedMethods}){
   if(!Array.isArray(allowedMethods)||!allowedMethods.includes(method)||
      !['cash','yape','plin','card'].includes(method))
     throw Error('El método de pago no está habilitado por la sede.');
   const totalCents=cents(total);
   if(method!=='cash')return {method,totalCents,label:{yape:'Yape',plin:'Plin',card:'Tarjeta'}[method],status:'PENDIENTE'};
   const handed=exact?totalCents:moneyInput(amount);
   if(!exact&&handed<=totalCents)
     throw Error('Para otro monto, el efectivo debe ser mayor al total.');
   return {method,totalCents,label:'Efectivo contraentrega',amountCents:handed,
     changeCents:handed-totalCents,status:'PENDIENTE DE COBRO'};
 }
 function validateFields(fields){
   if(!Array.isArray(fields)||fields.length<1||fields.length>LIMIT)
     throw Error('El FORM admite como máximo diez variables.');
   const seen=new Set();
   fields.forEach(f=>{
     if(!f||typeof f.variable!=='string'||typeof f.value!=='string'||
       !f.variable.trim()||f.variable.length>LABEL_LIMIT||
       !f.value.trim()||f.value.length>VALUE_LIMIT||
       /[\x00-\x1f\x7f]/.test(f.variable+f.value)||
       seen.has(f.variable.toLocaleLowerCase('es-PE')))
       throw Error('El FORM incluye campos inválidos, duplicados o demasiado largos.');
     seen.add(f.variable.toLocaleLowerCase('es-PE'));
   });
   return fields;
 }
 function products({items,maxFields}){
   if(!Array.isArray(items)||!items.length||items.length>50||
      !Number.isInteger(maxFields)||maxFields<1||maxFields>LIMIT)
     throw Error('El pedido no tiene productos válidos.');
   const chunks=[];
   for(const item of items){
     if(!item||typeof item.name!=='string'||!item.name.trim()||
        /[\x00-\x1f\x7f]/.test(item.name)||!Number.isInteger(item.quantity)||
        item.quantity<1||item.quantity>99)throw Error('Producto inválido para el FORM.');
     // All quantities and names remain legible; no truncation or invented line prices.
     const line=item.name.trim()+' × '+item.quantity;
     if(line.length>VALUE_LIMIT)
       throw Error('El nombre del producto no cabe en una variable del FORM.');
     let chunk=chunks[chunks.length-1];
     if(!chunk||chunk.length+3+line.length>VALUE_LIMIT){chunks.push(line)}
     else chunks[chunks.length-1]+=' · '+line;
   }
   if(chunks.length>maxFields)
     throw Error('El detalle completo excede la capacidad del FORM (diez variables). No se enviará incompleto.');
   return chunks.map((value,i)=>({variable:'Productos '+(i+1),value}));
 }
 function request({dateTime,mode,items,subtotal,deliveryFee,total,destination,method,amount,exact,allowedMethods}){
   const when=schedule(dateTime);
   if(!['delivery','pickup'].includes(mode))throw Error('Modalidad de reserva inválida.');
   const sub=cents(subtotal),fee=cents(deliveryFee);
   if(sub+fee!==cents(total))throw Error('El total no coincide con productos y delivery.');
   if(mode==='pickup'&&fee!==0)throw Error('Recojo no puede tener cargo de delivery.');
   const pay=payment({method,total,amount,exact,allowedMethods});
   const destinationText=String(destination||'').trim();
   if(mode==='delivery'&&!destinationText)throw Error('Falta la dirección de entrega.');
   const metadata=[
     {variable:'Fecha de reserva',value:when.date},
     {variable:'Intervalo',value:when.interval},
     {variable:'Modalidad',value:mode==='delivery'?'Delivery':'Recojo en tienda'},
     {variable:'Importes',value:'Subtotal '+MONEY(sub)+' · Delivery '+MONEY(fee)+' · Total '+MONEY(pay.totalCents)},
     {variable:'Forma de pago',value:pay.label+(method==='cash'?
       ' · Paga con '+MONEY(pay.amountCents)+' · Vuelto '+MONEY(pay.changeCents):
       ' · Pago pendiente de confirmación')},
     {variable:'Destino',value:mode==='delivery'?destinationText:'Recojo en sede asignada'}
   ];
   const fields=validateFields([...products({items,maxFields:LIMIT-metadata.length}),...metadata]);
   return {title:'VALIDACIÓN DE RESERVA',
     subtitle:'Confirmar disponibilidad para '+(mode==='delivery'?'delivery':'recojo')+' programado',
     fields};
 }
 function paymentProof({dateTime,mode,orderCode,items,subtotal,deliveryFee,total,destination,method,allowedMethods,imageUrl}){
   if(!['yape','plin','card'].includes(method))throw Error('Efectivo no requiere comprobante anticipado.');
   const when=schedule(dateTime);
   const pay=payment({method,total,allowedMethods});
   const sub=cents(subtotal),fee=cents(deliveryFee);
   if(sub+fee!==pay.totalCents||(mode==='pickup'&&fee!==0))
     throw Error('El comprobante no coincide con los importes.');
   const metadata=[
     {variable:'N.º de pedido',value:String(orderCode||'')},
     {variable:'Fecha de reserva',value:when.date},
     {variable:'Intervalo',value:when.interval},
     {variable:'Modalidad',value:mode==='delivery'?'Delivery':'Recojo en tienda'},
     {variable:'Importes',value:'Subtotal '+MONEY(sub)+' · Delivery '+MONEY(fee)+' · Total '+MONEY(pay.totalCents)},
     {variable:'Dirección',value:mode==='delivery'?String(destination||'').trim():'Recojo en sede asignada'},
     {variable:'Forma de pago',value:pay.label}
   ];
   const fields=validateFields([...products({items,maxFields:LIMIT-metadata.length}),...metadata]);
   if(typeof imageUrl!=='string'||!/^https:\/\/[^\s<>"']+$/.test(imageUrl))
     throw Error('Falta un comprobante HTTPS validado.');
   return {type:'FORM',form:{title:'PAGO DE RESERVA REALIZADO - '+pay.label.toLocaleUpperCase('es-PE'),
     subtitle:'Comprobante adjunto',imageUrl,fields}};
 }
 root.B3ReservationForms=Object.freeze({schedule,payment,request,paymentProof,validateFields,products});
})(typeof window!=='undefined'?window:globalThis);
