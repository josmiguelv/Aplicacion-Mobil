import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const app=readFileSync(new URL('../app/src/main/assets/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/src/main/assets/styles.css',import.meta.url),'utf8');
const block=app.slice(app.indexOf('function scheduleChoice(){'),app.indexOf('function reservationPicker(){'));
test('two local illustrative images exist and contain accessible descriptions',()=>{
 for(const name of ['b3-receive-now.svg','b3-receive-reservation.svg']){
  const uri=new URL('../app/src/main/assets/images/'+name,import.meta.url);
  assert.ok(existsSync(uri),name);
  const image=readFileSync(uri,'utf8');
  assert.match(image,/^<svg /);
  assert.match(image,/<title /);
  assert.match(image,/<desc /);
  assert.match(block,new RegExp('images/'+name.replace('.','\\.')));
 }
});
test('both illustrations are inside their real action button; event handling is unchanged',()=>{
 assert.match(block,/data-schedule-choice="now"/);
 assert.match(block,/data-schedule-choice="reservation"/);
 assert.match(block,/b3-schedule-card/);
 assert.match(block,/loading="lazy"/);
 assert.match(app,/if\(b\.dataset\.scheduleChoice\)/);
 assert.match(app,/if\(choice==='reservation'\)/);
 assert.match(app,/if\(choice==='now'\)/);
});
test('responsive cards are accessible and do not affect other choice screens',()=>{
 assert.match(css,/\.b3-schedule-page \.b3-schedule-cards/);
 assert.match(css,/\.b3-schedule-page \.b3-schedule-card:focus-visible/);
 assert.match(css,/@media\(max-width:370px\)/);
 assert.match(css,/@media\(min-width:580px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
