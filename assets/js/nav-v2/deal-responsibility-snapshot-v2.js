import { rpc } from './supabase-v2.js';
import { renderDealCardSpnResponsibility } from './deal-card-spn-responsibility-v2.js?v=20260711-05';

const ID = 'dealResponsibilitySnapshotV2';
let cachedSnapshot = null;
let loadingPromise = null;
let lastKey = '';
let lastCardData = null;

function dealId() {
  return new URLSearchParams(location.search).get('id') || '';
}

function text(value) {
  return String(value || '').trim();
}

function appendLine(root, title, value, className = 'status') {
  const div = document.createElement('div');
  div.className = className;
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

function readinessClass(snapshot) {
  if (snapshot?.handoff_ready === true) return 'status ok';
  const gaps = Number(snapshot?.handoff_gap_count || 0);
  return gaps > 3 ? 'status error' : 'status warn';
}

function appendHandoffReadiness(root, snapshot) {
  const score = Number(snapshot?.handoff_readiness_score ?? 0);
  const gaps = Array.isArray(snapshot?.handoff_gaps) ? snapshot.handoff_gaps : [];
  const title = snapshot?.handoff_ready ? 'Готовность передачи юристу' : 'Пробелы передачи юристу';
  const line = `${Number.isFinite(score) ? score : 0}% · ${text(snapshot?.handoff_status_text) || 'Проверьте данные перед юридической проверкой'}`;
  appendLine(root, title, line, readinessClass(snapshot));
  if (gaps.length) appendList(root, 'Что СПН должен дозаполнить перед юристом', gaps);
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
    counts: snapshot?.open_counts || {},
    gaps: snapshot?.handoff_gaps || [],
    score: snapshot?.handoff_readiness_score || 0,
    ready: snapshot?.handoff_ready === true
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
  if (!force && key === lastKey && document.getElementById(ID)) {
    renderDealCardSpnResponsibility(snapshot);
    return true;
  }
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
  appendHandoffReadiness(box, snapshot || {});
  appendLine(box, 'Открытые действия', openCounts(snapshot.open_counts));
  appendLine(box, 'Ближайший фокус', text(snapshot.next_handoff_action) || 'Проверить карточку');
  const contract = snapshot.handoff_contract || {};
  appendList(box, 'Что СПН передает юристу', contract.spn_must_provide);
  appendList(box, 'Что юрист возвращает СПН', contract.lawyer_must_provide);
  appendList(box, 'Что СПН делает после ответа юриста', contract.spn_after_lawyer);
  renderDealCardSpnResponsibility(snapshot);
  return true;
}

async function refreshSnapshot() {
  const id = dealId();
  if (!id) return;
  if (!loadingPromise) {
    loadingPromise = rpc('nav_v2_get_deal_responsibility_snapshot', { p_deal_id: id }, 10000)
      .then((snapshot) => {
        cachedSnapshot = snapshot || {};
        draw(cachedSnapshot, true);
        return cachedSnapshot;
      })
      .catch(() => null)
      .finally(() => {
        loadingPromise = null;
      });
  }
  await loadingPromise;
}

export function applyDealResponsibilitySnapshot(cardData) {
  try {
    const shouldRefresh = !cachedSnapshot || (cardData && cardData !== lastCardData);
    lastCardData = cardData || lastCardData;
    if (cachedSnapshot) draw(cachedSnapshot, true);
    if (shouldRefresh) void refreshSnapshot();
  } catch (_) {
    // Основная карточка сама показывает ошибки доступа; snapshot является дополнением.
  }
}

window.addEventListener('nav-v2:document-workflow-updated', () => void refreshSnapshot());
window.addEventListener('nav-v2:task-updated', () => void refreshSnapshot());
