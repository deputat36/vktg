import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {validateCatalog} from '../assets/js/preparation/model.js';
const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const errors=validateCatalog(JSON.parse(read('config/preparation-catalog.json')));
assert.deepEqual(errors,[]);
for(const path of ['assets/js/preparation/model.js','assets/js/preparation/app.js','assets/js/preparation/editor.js']){
  const text=read(path);
  assert.ok(!/localStorage|sessionStorage|indexedDB|sendBeacon|supabase|\.rpc\(|console\./i.test(text),`${path}: forbidden storage/network/logging dependency`);
  assert.ok(!/from\s+['"](?:https?:|\.\.\/nav-v2)/.test(text),`${path}: dependency leak`);
}
for(const path of ['preparation.html','preparation-rules.html']){
  const html=read(path);
  assert.ok(html.includes("script-src 'self'; style-src 'self'; connect-src 'self'"));
  assert.ok(!html.includes('unsafe-inline'));assert.ok(html.includes('no-referrer'));
  assert.ok(!/<script(?![^>]*src=)[^>]*>\s*\S/.test(html));
}
console.log('Preparation helper: catalog, isolated dependencies, no persistence/logging, strict CSP passed.');
