// Focused, dependency-free checks of the actual order-experience helpers in app.js.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const app=readFileSync('app/src/main/assets/app.js','utf8');
const start=app.indexOf('const ORDER_STAGES='),end=app.indexOf('function home(){',start);
assert.ok(start>=0&&end>start,'Expected helpers in app.js');
const order={id:'B3-DEMO-TEST',ts:1000,demo:true,status:'RECEIVED',items:[{id:'p1',qty:1}],total:30,reviewDismissed:false};
const state={orders:[order],favorite:null};
const fakeDate={now:()=>0};
const sandbox={st:state,Date:fakeDate,product:id=>id==='p1'?{id,name:'Producto de prueba',price:30}:null,
 cash:n=>'S/ '+n,esc:v=>String(v),ic:()=>'<svg></svg>',img:()=>'<img>',heading:()=>'',render:()=>{},
 selectedOrderId:order.id,favoritePromptOrderId:null,reviewSheetOrderId:null,reviewScore:0,reviewTags:[]};
const helpers=runInNewContext(app.slice(start,end)+'\n({ORDER_STAGES,isDemoOrder,orderDelivered,activeTracking,normalizedBasket,trackCard,orderDetail,favoriteCard,favoritePrompt,reviewSheet,afterOrderDelivered})',sandbox);
assert.deepEqual(Array.from(helpers.ORDER_STAGES,x=>x[0]),['RECEIVED','ACCEPTED','PREPARING','DISPATCH','DELIVERED']);
assert.equal(helpers.isDemoOrder(order),true);
assert.match(helpers.trackCard(order),/SIMULACIÓN LOCAL/);
assert.match(helpers.orderDetail(),/Seguimiento visual/);
assert.equal(helpers.orderDelivered(order),false);
order.status='DELIVERED';order.deliveredAt=1000;
fakeDate.now=()=>1000+59*60*1000;
assert.equal(helpers.orderDelivered(order),true);
assert.equal(helpers.activeTracking(order),true,'59 min still active');
fakeDate.now=()=>1000+60*60*1000;
assert.equal(helpers.activeTracking(order),false,'60 min no active tracking');
assert.match(helpers.orderDetail(),/seguimiento activo finalizó/);
assert.match(helpers.orderDetail(),/Pedir de nuevo/);
assert.equal(helpers.normalizedBasket([{id:'p2',qty:1},{id:'p1',qty:2}]),helpers.normalizedBasket([{id:'p1',qty:2},{id:'p2',qty:1}]));
state.favorite={items:[{id:'p1',qty:1}]};
assert.match(helpers.favoriteCard(),/Pedir de nuevo/);
assert.match(helpers.favoriteCard(),/b3-favorite-thumb/);
assert.equal(helpers.reviewSheet(),'');
order.review=null;
sandbox.reviewSheetOrderId=order.id;
assert.match(helpers.reviewSheet(),/Cerrar/);
order.review={score:4,localOnly:true};
assert.equal(helpers.reviewSheet(),'');
console.log('PASS: five stages, simulation label, sixty-minute cutoff, favorite and dismissible survey');
