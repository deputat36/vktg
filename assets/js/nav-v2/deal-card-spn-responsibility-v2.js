import { rpc } from './supabase-v2.js';

const BOX_ID = 'dealCardSpnResponsibilityV2';
let busy = false;
let lastKey = '';

function dealId() {
  return new URLSearchParams(location.search).get('id') || '';
}

function text(value) {
  return String(value || '').trim();
}

function nameOf(person) {
  return text(person?.name) || text(person?.email) || '';
}

function target() {
  const main = document.querySelector('#app main.nav-v2-shell') || document.querySelector('#app main');
  if (!main) return null;
  return main.querySelector('#dealResponsibilitySnapshotV2') || main.querySelector('.tabs') || main.querySelector('.card') || main;
}

function line(title, value, ok) {
  const cls = ok ? 'status ok' : 'status warn';
  return `<div class="${cls}"><b>${title}:</b> ${value || 'не назначен'}</div>`;
}

function draw(snapshot) {
  const place = target();
  if (!place) return false;

  const seller = nameOf(snapshot?.seller_spn);
  const buyer = nameOf(snapshot?.buyer_spn);
  const manager = nameOf(snapshot?.manager);
  const key = JSON.stringify({ seller, buyer, manager });
  if (key === lastKey && document.getElementById(BOX_ID)) return true;
  lastKey = key;

  let box = document.getElementById(BOX_ID);
  if (!box) {
    box = document.createElement('section');
    box.id = BOX_ID;
    box.className = 'card';
    box.style.margin = '14px 0';
    place.after(box);
  }

  const sameSpn = seller && buyer && seller === buyer;
  box.innerHTML = `<h2>СПН по сделке</h2>
    <p class="muted">Короткая видимость для руководителя, юриста и команды: кто ведёт продавца и покупателя.</p>
    ${sameSpn ? line('СПН сделки', `${seller} ведёт продавца и покупателя`, true) : `${line('СПН продавца', seller, Boolean(seller))}${line('СПН покупателя', buyer, Boolean(buyer))}`}
    ${manager ? line('Менеджер', manager, true) : ''}`;
  return true;
}

async function load() {
  const id = dealId();
  if (!id || busy) return;
  busy = true;
  try {
    const snapshot = await rpc('nav_v2_get_deal_responsibility_snapshot', { p_deal_id: id }, 10000);
    draw(snapshot || {});
  } catch (_) {
    // Основная карточка сама покажет ошибки доступа. Этот блок является вспомогательным.
  } finally {
    busy = false;
  }
}

function ensure() {
  if (!document.getElementById(BOX_ID) && !busy) load();
}

window.addEventListener('nav-v2:deal-card-updated', load);
window.addEventListener('nav-v2:document-workflow-updated', load);
window.addEventListener('nav-v2:task-updated', load);

const app = document.getElementById('app');
if (app) new MutationObserver(ensure).observe(app, { childList: true, subtree: true });
load();
