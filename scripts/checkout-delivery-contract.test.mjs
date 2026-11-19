import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'

const source=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8')
const extract=name=>{
 const expr=new RegExp('function '+name+'\\(\\)\\{[\\s\\S]*?\\n\\}')
 const match=source.match(expr)
 assert.ok(match,'Function '+name+' must exist')
 return match[0]
}
const quoteLogic=extract('deliveryQuoteValid')
const cartLogic=extract('checkoutCartIssue')
const totalLogic=source.match(/function orderTotal\(\)\{[^}]+\}/)?.[0]
assert.ok(totalLogic)

const store={id:'b3-local-1',active:true,delivery_enabled:true}
function functions(st,shops=[store],catalog=[]){
 const context={st,shops,product:id=>catalog.find(p=>p.id===id),subtotal:()=>20}
 vm.runInNewContext(quoteLogic,context)
 vm.runInNewContext(totalLogic,context)
 vm.runInNewContext(cartLogic,context)
 return context
}
test('delivery exige sede y tarifa verificable, no asume reparto gratuito',()=>{
 const st={mode:'delivery',store:'b3-local-1',quote:null,cart:[{id:'p',qty:1}]}
 const ctx=functions(st)
 assert.equal(ctx.deliveryQuoteValid(),false)
 st.quote={deliveryFeePen:4}
 assert.equal(ctx.deliveryQuoteValid(),true)
 assert.equal(ctx.orderTotal(),24)
 st.quote={deliveryFeePen:'texto'}
 assert.equal(ctx.deliveryQuoteValid(),false)
 st.quote={deliveryFeePen:-2}
 assert.equal(ctx.deliveryQuoteValid(),false)
})
test('recojo no requiere cotización de delivery y el total no suma reparto',()=>{
 const ctx=functions({mode:'pickup',store:'b3-local-1',quote:null,cart:[]})
 assert.equal(ctx.deliveryQuoteValid(),false)
 assert.equal(ctx.orderTotal(),20)
 assert.match(source,/if\(st\.mode==='pickup'&&!eligibleForPickup/)
})
test('pedido con producto retirado se detiene antes de confirmar',()=>{
 const st={mode:'pickup',store:'b3-local-1',quote:null,cart:[{id:'faltante',qty:1}]}
 assert.match(functions(st).checkoutCartIssue(),/no está disponible/)
 assert.equal(functions(st,[store],[{id:'faltante',disabled:false}]).checkoutCartIssue(),'')
})
test('la compra de prueba nunca se presenta como pedido enviado o cobrado',()=>{
 assert.match(source,/Recorrido de prueba: no se confirmarán pagos ni se enviarán pedidos/)
 assert.match(source,/demo:true/)
 assert.match(source,/Continuar con pedido de prueba/)
 assert.doesNotMatch(source,/if\(st\.configReady\)return toast\('Integración de pedidos/)
})
