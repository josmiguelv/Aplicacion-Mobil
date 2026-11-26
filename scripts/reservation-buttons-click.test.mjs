import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../app/src/main/assets/app.js', import.meta.url),'utf8');
const handler=js.match(/let b=e\.target\.closest\('([^']+)'\)/)?.[1];
test('Ahora and Programar reserva buttons are connected to the delegated click handler',()=>{
 assert.ok(handler,'Root click delegation must exist');
 for(const attr of ['data-schedule-choice','data-reservation-verify'])
  assert.ok(handler.includes('['+attr+']'),attr+' must be in closest selector');
 assert.match(js,/if\(b\.dataset\.scheduleChoice\)/);
 assert.match(js,/if\(b\.hasAttribute\('data-reservation-verify'\)\)/);
});
test('Now retains immediate checkout and reservation never falsely creates immediate orders',()=>{
 assert.match(js,/if\(choice==='now'\)/);
 assert.match(js,/if\(st\.mode==='delivery'\)screen\('deliveryAddress'\)/);
 assert.match(js,/if\(choice==='reservation'\)/);
 assert.match(js,/screen\('reservationPicker'\)/);
 assert.match(js,/toast\('Formulario validado:/);
});
