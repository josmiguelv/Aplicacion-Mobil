import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const s=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8')
const begin=s.indexOf('function reservationMinLead(store){')
const end=s.indexOf('function choice(){return',begin)
assert.ok(begin>=0&&end>begin,'Reservation functions must be present')
const code=s.slice(begin,end)
const fn=new Function('st','shops','Date','Intl','esc','heading','ic',code+
  ';return {at:reservationTimeValue,summary:reservationSummary,lead:reservationMinLead}')
const make=()=>fn({scheduleMode:'reservation',reservationAt:'2026-11-28T20:00',mode:'delivery',store:''},[],Date,Intl,x=>x,()=>'',()=>'')

test('date-time validator handles Peru local time including late hours',()=>{
 const {at}=make()
 assert.equal(new Date(at('2026-11-28T20:00')).toISOString(),'2026-11-29T01:00:00.000Z')
 assert.equal(new Date(at('2026-11-28T23:45')).toISOString(),'2026-11-29T04:45:00.000Z')
 assert.ok(Number.isNaN(at('2026-02-30T09:00')))
 assert.ok(Number.isNaN(at('2026-11-28T25:00')))
})

test('reservation summary offers a 30-minute window, crossing midnight',()=>{
 const f=fn({scheduleMode:'reservation',reservationAt:'2026-11-28T23:45',mode:'delivery',store:''},[],Date,Intl,x=>x,()=>'',()=>'')
 const value=f.summary()
 assert.match(value,/23:45|11:45/)
 assert.match(value,/00:15|12:15/)
})

test('unknown reservation lead does not default to fabricated 60 minutes',()=>{
 assert.equal(make().lead(undefined),null)
 assert.equal(make().lead({reservationMinimumMinutes:60}),60)
 assert.equal(make().lead({reservationMinimumMinutes:'60'}),null)
})

test('reservation is shown after Delivery or Recojo, immediate flow remains present',()=>{
 assert.match(s,/function scheduleChoice\(\)/)
 assert.match(s,/data-schedule-choice="now"/)
 assert.match(s,/data-schedule-choice="reservation"/)
 assert.match(s,/if\(st\.mode==='delivery'\)screen\('deliveryAddress'\)/)
 assert.match(s,/scheduleReturnToModal=true/)
})

test('no reservation may be submitted as an immediate order until public API supports it',()=>{
 assert.match(s,/if\(st\.scheduleMode==='reservation'\)throw Error\('La reserva requiere la API pública/)
 assert.match(s,/if\(st\.scheduleMode==='reservation'\)\{checkoutReviewNote=/)
 assert.match(s,/No enviaremos un pedido inmediato haciéndolo pasar por una reserva/)
})
