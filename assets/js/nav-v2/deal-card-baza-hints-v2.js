import { getCachedUser, rpc, esc } from './supabase-v2.js';

const app = document.getElementById('app');
const dealId = new URLSearchParams(location.search).get('id');
const hintsUrl = './assets/data/nav-v2/baza-hints.json?v=20260710-0700';

let loading = false;

function list(data, key) {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

function safeSnapshotText(deal) {
  try {
    return JSON.stringify({
      deal_summary: deal?.deal_summary || {},
      wizard_snapshot: deal?.wizard_snapshot || {}
    }).toLowerCase();
  } catch (_) {
    return '';
  }
}

function isOpenTask(task) {
  return ['open', 'in_progress'].includes(task?.status);
}

function isOverdue(value) {
  if (!value) return false;
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return false;
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function collectSignals(card) {
  const deal = card?.deal || {};
  const documents = list(card, 'documents');
  const risks = list(card, 'risks');
  const tasks = list(card, 'tasks');
  const snapshotText = safeSnapshotText(deal);
  const signals = new Set();

  if (deal.has_mortgage === true || /ипотек|mortgage/.test(snapshotText)) {
    signals.add('mortgage');
  }

  if (/материн|маткап|maternity_capital|matcap/.test(snapshotText)) {
    signals.add('maternity_capital');
  }

  if (
    ['yellow', 'red'].includes(deal.risk_level)
    || risks.some((risk) => risk?.is_resolved !== true)
  ) {
    signals.add('legal_risk');
  }

  if (documents.some((doc) => ['needed', 'missing', 'requested', 'problem'].includes(doc?.status))) {
    signals.add('documents_missing');
  }

  if (tasks.some((task) => String(task?.source || '').startsWith('auto_quality_') && isOpenTask(task) && isOverdue(task?.due_date))) {
    signals.add('overdue_quality_tasks');
  }

  return signals;
}

function priorityWeight(priority) {
  return ({ high: 3, normal: 2, low: 1 })[priority] || 0;
}

function safeMaterialUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value, location.href);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch (_) {
    return '';
  }
  return '';
}

function hintCard(hint) {
  const materialUrl = safeMaterialUrl(hint.material_url);
  const priorityClass = hint.priority === 'high' ? 'yellow' : hint.priority === 'low' ? '' : 'blue';
  const materialLink = materialUrl
    ? `<a class="btn light" href="${esc(materialUrl)}" target="_blank" rel="noopener noreferrer">Открыть материал</a>`
    : '';

  return `<div class="list-item">
    <div class="section-title">
      <div>
        <b>${esc(hint.title || 'Подсказка по сделке')}</b>
        <span class="small">${esc(hint.reason || '')}</span>
      </div>
      <span class="pill ${priorityClass}">${esc(hint.role === 'all' ? 'для команды' : hint.role || 'all')}</span>
    </div>
    <p class="muted">${esc(hint.body || '')}</p>
    ${materialLink ? `<div class="actions" style="justify-content:flex-start">${materialLink}</div>` : ''}
  </div>`;
}

function renderHints(hints) {
  document.getElementById('bazaHintsBox')?.remove();
  if (!hints.length) return;

  const panel = document.createElement('section');
  panel.id = 'bazaHintsBox';
  panel.className = 'card';
  panel.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Подсказки по сделке</h2>
        <p class="muted">Справочные материалы BAZA. Блок работает только на чтение и не изменяет данные сделки.</p>
      </div>
      <span class="pill blue">BAZA</span>
    </div>
    <div class="list">${hints.map(hintCard).join('')}</div>`;

  const main = app?.querySelector('main.nav-v2-shell');
  const tabsSection = main?.querySelector('.tabs')?.closest('section.card');
  if (tabsSection) main.insertBefore(panel, tabsSection);
  else main?.appendChild(panel);
}

async function loadHints() {
  if (!app || !dealId || !getCachedUser() || loading || document.getElementById('bazaHintsBox')) return;
  loading = true;

  try {
    const [profilePayload, card, response] = await Promise.all([
      rpc('nav_v2_get_my_profile', {}, 12000),
      rpc('nav_v2_get_deal_card', { p_deal_id: dealId }, 15000),
      fetch(hintsUrl, { cache: 'no-store' })
    ]);

    if (!response.ok) throw new Error(`BAZA hints HTTP ${response.status}`);
    const sourceHints = await response.json();
    const profile = profilePayload?.profile || profilePayload || {};
    const role = String(profile.role || '').trim();
    const signals = collectSignals(card);

    const matched = (Array.isArray(sourceHints) ? sourceHints : [])
      .filter((hint) => hint?.is_active === true)
      .filter((hint) => hint.role === 'all' || hint.role === role)
      .filter((hint) => Array.isArray(hint.signals) && hint.signals.some((signal) => signals.has(signal)))
      .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority))
      .slice(0, 5);

    renderHints(matched);
  } catch (error) {
    console.warn('BAZA hints unavailable:', error);
  } finally {
    loading = false;
  }
}

if (app) {
  new MutationObserver(() => {
    if (app.querySelector('main.nav-v2-shell') && !document.getElementById('bazaHintsBox')) {
      loadHints();
    }
  }).observe(app, { childList: true, subtree: true });

  loadHints();
}
