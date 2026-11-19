import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'

const js=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8')
const match=js.match(/function notificationLinkedProduct\(item\)\{[\s\S]*?\n\}/)
assert.ok(match,'notificationLinkedProduct must be defined')

// Execute the real pure lookup helper against a controlled catalog, not only a text pattern.
const uuid='123e4567-e89b-12d3-a456-426614174000'
function resolve(item, catalog){
 const context={product:id=>catalog.find(p=>p.id===id)}
 return vm.runInNewContext('('+match[0]+')',context)(item)
}
test('UUID real de producto publicado resuelve al ID interno api:UUID',()=>{
 const published={id:'api:'+uuid,name:'Producto de prueba',isPublished:true,disabled:false}
 assert.equal(resolve({productId:uuid},[published]),published)
 assert.match(js,/data-product="\$\{esc\(linkedProductId\)\}"/)
 assert.match(js,/const linkedProductId=linkedProduct\?\.id\|\|''/)
})
test('producto no publicado, deshabilitado o inexistente no permite pedido',()=>{
 assert.equal(resolve({productId:uuid},[{id:'api:'+uuid,isPublished:false,disabled:false}]),null)
 assert.equal(resolve({productId:uuid},[{id:'api:'+uuid,isPublished:true,disabled:true}]),null)
 assert.equal(resolve({productId:uuid},[]),null)
})
test('notificación sin producto o identificador inválido conserva acceso a carta',()=>{
 assert.equal(resolve({},[]),null)
 assert.equal(resolve({productId:'p1'},[{id:'p1',isPublished:true,disabled:false}]),null)
 assert.match(js,/data-notification-catalog="1">Explorar la carta/)
 assert.match(js,/canOrderProduct\?/)
})
test('notificación y catálogo preservan el contrato de IDs y navegación existente',()=>{
 assert.match(js,/productId:typeof n\.productId/)
 assert.match(js,/const id='api:'\+x\.id\.trim\(\)/)
 assert.match(js,/st\.selected=b\.dataset\.product\|\|b\.dataset\.quick/)
})
