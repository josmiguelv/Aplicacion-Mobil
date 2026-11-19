import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'

const js=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8')

test('notificación sin producto conserva acceso genérico a carta',()=>{
 assert.match(js,/data-notification-catalog="1">Explorar la carta/)
 assert.match(js,/canOrderProduct\?/)
})
test('solo producto publicado disponible activa la ficha y el pedido',()=>{
 assert.match(js,/linkedProduct&&linkedProduct\.isPublished&&!linkedProduct\.disabled/)
 assert.match(js,/data-product="\$\{esc\(linkedProductId\)\}"/)
 assert.match(js,/productId:typeof n\.productId/)
 assert.match(js,/st\.selected=b\.dataset\.product\|\|b\.dataset\.quick/)
})
