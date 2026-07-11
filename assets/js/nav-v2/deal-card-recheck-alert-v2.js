import { esc } from './supabase-v2.js';
import { applyDealCardBazaHints } from './deal-card-baza-hints-v2.js?v=20260711-03';

let userRole = '';
let cardData = null;
let profileData = null;
let rerenderHookBound = false;

function list(data, key) {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

function canSeeRecheckAlert() {
  return ['owner', 'admin', 'manager', 'lawyer'].includes(String(userRole || '').toLowerCase());
}

function timeOf(item) {
  return new Date(item?.created_at || 0).getTime() || 0;
}

function importantCycleEvents() {
  return list(cardData, 'events')
    .filter((event) => ['spn_rework_submitted', 'returned_to_spn_rework', 'status_changed'].includes(event.event_type))
    .sort((a, b) => timeOf(b) - timeOf(a));
}

function latestSubmitEvent() {
  const latestCycleEvent = importantCycleEvents()[0] || null;
  if (latestCycleEvent?.event_type !== 'spn_rework_submitted') return null;
  return latestCycleEvent;
}

function latestSubmitComment(event) {
  const eventTime = timeOf(event);
  return list(cardData, 'comments')
    .filter((comment) => timeOf(comment) >= eventTime)
    .filter((comment) => /повторно проверить|доработан|доработана|исправлен|исправлено|заявка доработана/i.test(String(comment.body || '')))
    .sort((a, b) => timeOf(b) - timeOf(a))[0] || null;
}

function openTab(tabName) {
  const tab = document.querySelector(`[data-tab="${tabName}"]`);
  if (tab) {
    tab.click();
    setTimeout(() => document.querySelector('.tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    return;
  }
  location.hash = tabName;
  location.reload();
}

function alertHtml(event, comment) {
  const eventDate = event?.created_at ? new Date(event.created_at).toLocaleString('ru-RU') : '';
  const commentText = String(comment?.body || '').trim();
  return `<section id="spnRecheckAlert" class="card" style="border:2px solid rgba(22,163,74,.28);background:#f7fff9">
    <div class="section-title">
      <div>
        <h2>СПН отправил доработку на повторную проверку</h2>
        <p class="muted">Карточка снова в статусе «Юрист». Это не первичная передача, а возврат после исправлений.</p>
      </div>
      <span class="pill green">повторная проверка</span>
    </div>
    ${eventDate ? `<div class="status ok">Событие зафиксировано: ${esc(eventDate)}</div>` : ''}
    ${commentText ? `<div class="list"><div class="list-item"><b>Комментарий СПН:</b><p class="muted">${esc(commentText)}</p></div></div>` : '<div class="status warn">Комментарий СПН не найден после события повторной отправки. Проверьте вкладку «Комментарии».</div>'}
    <div class="actions" style="justify-content:flex-start">
      <button id="openRecheckComments" class="btn light" type="button">Открыть комментарии</button>
      <button id="openRecheckHistory" class="btn light" type="button">Открыть историю</button>
      <button id="copyRecheckComment" class="btn primary" type="button">Скопировать комментарий СПН</button>
    </div>
  </section>`;
}

function bindAlertActions() {
  const comments = document.getElementById('openRecheckComments');
  if (comments && !comments.dataset.bound) {
    comments.dataset.bound = '1';
    comments.onclick = () => openTab('comments');
  }

  const history = document.getElementById('openRecheckHistory');
  if (history && !history.dataset.bound) {
    history.dataset.bound = '1';
    history.onclick = () => openTab('history');
  }

  const copy = document.getElementById('copyRecheckComment');
  if (copy && !copy.dataset.bound) {
    copy.dataset.bound = '1';
    copy.onclick = async () => {
      const event = latestSubmitEvent();
      const text = String(latestSubmitComment(event)?.body || '').trim() || 'Заявка доработана. Прошу повторно проверить.';
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = 'Скопировано';
        setTimeout(() => copy.textContent = 'Скопировать комментарий СПН', 1500);
      } catch (_) {
        copy.textContent = 'Не удалось скопировать';
        setTimeout(() => copy.textContent = 'Скопировать комментарий СПН', 1800);
      }
    };
  }
}

function placeAlert() {
  if (!cardData || !canSeeRecheckAlert()) return;
  if (cardData?.deal?.status !== 'need_lawyer') return;
  const event = latestSubmitEvent();
  if (!event) return;
  const main = document.querySelector('main.nav-v2-shell');
  if (!main) return;
  if (!document.getElementById('spnRecheckAlert')) {
    const anchor = document.getElementById('spnReworkTopAlert') || main.querySelector('.hero') || main.firstElementChild;
    if (anchor) anchor.insertAdjacentHTML('afterend', alertHtml(event, latestSubmitComment(event)));
  }
  bindAlertActions();
}

function applyCardEnhancements() {
  placeAlert();
  void applyDealCardBazaHints(cardData, profileData);
}

function bindRerenderHook() {
  if (rerenderHookBound) return;
  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-tab], [data-tab-shortcut]')) return;
    queueMicrotask(applyCardEnhancements);
  });
  rerenderHookBound = true;
}

export function applyDealCardRecheckAlert(data, profile) {
  try {
    cardData = data;
    profileData = profile || data?.profile || null;
    userRole = profileData?.role || '';
    applyCardEnhancements();
    bindRerenderHook();
  } catch (_) {
    // Этот explicit hook не должен ломать основную карточку сделки.
  }
}
