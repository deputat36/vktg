import { rpc, esc } from './supabase-v2.js';

const SAVED_HANDOFF_KEY = 'nav_spn_saved_deal_handoff_v2';
const MARKER_TTL_MS = 15 * 60 * 1000;
let snapshotPromise = null;
let snapshotDealId = '';

function list(data, key) {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

function readMarker(dealId) {
  try {
    const marker = JSON.parse(sessionStorage.getItem(SAVED_HANDOFF_KEY) || 'null');
    if (!marker?.deal_id || marker.deal_id !== dealId) return null;
    if (!marker.saved_at || Date.now() - Number(marker.saved_at) > MARKER_TTL_MS) {
      sessionStorage.removeItem(SAVED_HANDOFF_KEY);
      return null;
    }
    return marker;
  } catch (_) {
    sessionStorage.removeItem(SAVED_HANDOFF_KEY);
    return null;
  }
}

function roleLabel(role) {
  return ({ spn: 'СПН', lawyer: 'Юрист', broker: 'Брокер', manager: 'Менеджер', owner: 'Владелец', admin: 'Администратор' })[role] || role || 'Ответственный не указан';
}

function dateText(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function openTasks(cardData) {
  return list(cardData, 'tasks')
    .filter((task) => ['open', 'in_progress'].includes(String(task?.status || '')))
    .sort((a, b) => {
      const aDue = a?.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b?.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
      return aDue - bDue;
    });
}

function nextTask(cardData) {
  return openTasks(cardData)[0] || null;
}

function responsibilityLines(snapshot, deal) {
  const lines = [];
  if (snapshot?.client_owner_text) lines.push(snapshot.client_owner_text);
  if (deal?.lawyer_needed) lines.push(snapshot?.legal_owner_text || 'Юрист нужен, но пока не назначен.');
  if (deal?.broker_needed) {
    lines.push(snapshot?.broker?.name ? `${snapshot.broker.name} отвечает за финансовую проверку.` : 'Брокер нужен, но пока не назначен.');
  }
  if (snapshot?.manager?.name) lines.push(`${snapshot.manager.name} контролирует движение сделки.`);
  else lines.push('Менеджер сделки пока не назначен.');
  return [...new Set(lines.filter(Boolean))];
}

function confirmationHtml(marker, snapshot, cardData) {
  const deal = cardData?.deal || {};
  const task = nextTask(cardData);
  const taskRole = task ? roleLabel(task.assigned_role) : '';
  const taskTitle = String(task?.title || '').trim();
  const due = dateText(task?.due_date);
  const nextAction = String(snapshot?.next_handoff_action || marker?.next_action || deal?.next_action || '').trim()
    || 'Откройте карточку и уточните следующий рабочий шаг.';
  const lines = responsibilityLines(snapshot, deal);
  const dueText = due
    ? `${due}${taskTitle ? ` · ${taskTitle}` : ''}`
    : 'Срок пока не назначен — откройте карточку и поставьте контрольную дату.';
  const ownerText = task
    ? `${taskRole}${taskTitle ? ` · ${taskTitle}` : ''}`
    : (snapshot?.client_owner_text || 'Ответственный за следующий шаг пока не определён.');

  return `<section id="spnSaveConfirmationV2" class="card" style="border:2px solid rgba(22,163,74,.3);background:#f7fff9" aria-labelledby="spnSaveConfirmationTitle" aria-live="polite">
    <div class="section-title">
      <div>
        <span class="pill green">Сделка сохранена</span>
        <h2 id="spnSaveConfirmationTitle" style="margin-top:10px">Передача сделки зафиксирована</h2>
        <p class="muted">Теперь видно, кто продолжает работу и что должно произойти дальше.</p>
      </div>
      <button id="closeSpnSaveConfirmation" class="btn light" type="button">Скрыть</button>
    </div>
    <div class="grid">
      <div class="card" style="box-shadow:none"><h3>Кому передано</h3><div class="list">${lines.map((line) => `<div class="list-item">${esc(line)}</div>`).join('') || '<div class="list-item">Назначения пока не определены.</div>'}</div></div>
      <div class="card" style="box-shadow:none"><h3>Что произойдёт дальше</h3><div class="status ok">${esc(nextAction)}</div></div>
    </div>
    <div class="grid">
      <div class="card" style="box-shadow:none"><h3>Ответственный</h3><p>${esc(ownerText)}</p></div>
      <div class="card" style="box-shadow:none"><h3>Контрольный срок</h3><p>${esc(dueText)}</p></div>
    </div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn primary" type="button" data-spn-save-open="tasks">Открыть задачи</button>
      <button class="btn light" type="button" data-spn-save-open="docs">Открыть документы</button>
      <a class="btn light" href="./deals-v2.html">Мои сделки</a>
      <a class="btn light" href="./spn-v2.html">Создать ещё сделку</a>
    </div>
  </section>`;
}

function openTab(name) {
  const button = document.querySelector(`[data-tab="${name}"]`);
  if (button) {
    button.click();
    queueMicrotask(() => document.querySelector('.tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return;
  }
  location.hash = name;
}

function bindActions() {
  document.querySelectorAll('[data-spn-save-open]').forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => openTab(button.dataset.spnSaveOpen));
  });
  const close = document.getElementById('closeSpnSaveConfirmation');
  if (close && !close.dataset.bound) {
    close.dataset.bound = '1';
    close.addEventListener('click', () => {
      sessionStorage.removeItem(SAVED_HANDOFF_KEY);
      document.getElementById('spnSaveConfirmationV2')?.remove();
    });
  }
}

async function getSnapshot(dealId) {
  if (snapshotPromise && snapshotDealId === dealId) return snapshotPromise;
  snapshotDealId = dealId;
  snapshotPromise = rpc('nav_v2_get_deal_responsibility_snapshot', { p_deal_id: dealId }, 15000)
    .catch(() => null);
  return snapshotPromise;
}

export async function applySpnSaveConfirmation(cardData) {
  const dealId = String(cardData?.deal?.id || '').trim();
  if (!dealId) return;
  const marker = readMarker(dealId);
  if (!marker) return;

  const main = document.querySelector('main.nav-v2-shell');
  if (!main) return;
  if (document.getElementById('spnSaveConfirmationV2')) {
    bindActions();
    return;
  }

  const snapshot = await getSnapshot(dealId);
  const anchor = main.querySelector('.hero') || main.firstElementChild;
  if (!anchor || document.getElementById('spnSaveConfirmationV2')) return;
  anchor.insertAdjacentHTML('afterend', confirmationHtml(marker, snapshot, cardData));
  bindActions();
}
