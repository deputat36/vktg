import { rpc } from './supabase-v2.js';

const ID = 'dealResponsibilitySnapshotV2';
let cachedSnapshot = null;
let loading = false;
let lastKey = '';

function dealId() {
  return new URLSearchParams(location.search).get('id') || '';
}

function text(value) {
  return String(value || '').trim();
}

function appendLine(root, title, value) {
  const div = document.createElement('div');
  div.className = 'status';
  const b = document.createElement('b');
  b.textContent = title + ': ';
  div.appendChild(b);
  div.appendChild(document.createTextNode(value || '—'));
  root.appendChild(div);
}

function appendList(root, title, items) {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = title;
  const ul = document.createElement('ul');
  (Array.isArray(items) ? items : []).forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  });
  details.appendChild(summary);
  details.appendChild(ul);
  root.appendChild(details);
}

function openCounts(counts) {
  const data = counts || {};
  const client = Number(data.client_documents || 0) + Number(data.client_tasks || 0);
  const legal = Number(data.legal_documents || 0) + Number(data.legal_tasks || 0);
  const broker = Number(data.broker_tasks || 0);
  const parts = [];
  if (client) parts.push('СПН: ' + client);
  if (legal) parts.push('юрист: ' + legal);
  if (broker) parts.push('брокер: ' + broker);
  return parts.join(' · ') || 'нет открытых действий';
}

function target() {
  const main = document.querySelector('#app main.nav-v2-shell') || document.querySelector('#app main');
  if (!main) return null;
  return main.querySelector('.tabs') || main.querySelector('.card') || main;
}

function snapshotKey(snapshot) {
  return JSON.stringify({
    clients: snapshot?.client_owner_text || '',
    lawyer: snapshot?.legal_owner_text || '',
    action: snapshot?.next_handoff_action || '',
    counts: snapshot?.open_counts || {}
  });
}

function ensureBox(place) {
  let box = document.getElementById(ID);
  if (box) return box;
  box = document.createElement('section');
  box.id = ID;
  box.className = 'card';
  box.style.margin = '14px 0';
  box.style.borderLeft = '4px solid rgba(37,99,235,.45)';
  place.after(box);
  return box;
}

function draw(snapshot, force = false) {
  const place = target();
  if (!place) return false;
  const key = snapshotKey(snapshot);
  if (!force && key === lastKey && document.getElementById(ID)) return true;
  lastKey = key;
  const box = ensureBox(place);
  box.innerHTML = '';
  const h2 = document.createElement('h2');
  h2.textContent = 'Ответственность и передача юристу';
  const p = document.createElement('p');
  p.className = 'muted';
  p.textContent = 'СПН главный по клиентам. Юрист главный по рискам и договорам.';
  box.appendChild(h2);
  box.appendChild(p);
  appendLine(box, 'Клиенты', text(snapshot.client_owner_text) || 'СПН по клиентам не назначен');
  appendLine(box, 'Юрист', text(snapshot.legal_owner_text) || 'Юридическая ответственность не определена');
  appendLine(box, 'Открытые действия', openCounts(snapshot.open_counts));
  appendLine(box, 'Ближайший фокус', text(snapshot.next_handoff_action) || 'Проверить карточку');
  const contract = snapshot.handoff_contract || {};
  appendList(box, 'Что СПН передает юристу', contract.spn_must_provide);
  appendList(box, 'Что юрист возвращает СПН', contract.lawyer_must_provide);
  appendList(box, 'Что СПН делает после ответа юриста', contract.spn_after_lawyer);
  return true;
}

async function load() {
  const id = dealId();
  if (!id || loading) return;
  loading = true;
  try {
    cachedSnapshot = await rpc('nav_v2_get_deal_responsibility_snapshot', { p_deal_id: id }, 10000);
    draw(cachedSnapshot || {}, true);
  } catch (_) {
    // Карточка может быть еще не авторизована или сессия может обновляться основным модулем.
  } finally {
    loading = false;
  }
}

function ensureRendered() {
  if (cachedSnapshot && !document.getElementById(ID)) draw(cachedSnapshot, true);
  if (!cachedSnapshot && !loading && target()) load();
}

window.addEventListener('nav-v2:deal-card-updated', load);
window.addEventListener('nav-v2:document-workflow-updated', load);
window.addEventListener('nav-v2:task-updated', load);

const app = document.getElementById('app');
if (app) {
  new MutationObserver(ensureRendered).observe(app, { childList: true, subtree: true });
}

load();
