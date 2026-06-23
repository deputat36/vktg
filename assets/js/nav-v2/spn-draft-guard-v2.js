const DRAFT_KEY = 'nav_deal_draft_v2';
const DRAFT_UPDATED_KEY = 'nav_deal_draft_v2_updated_at';
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const LABELS = {
  preparationMode: {
    consult: 'консультация',
    deposit: 'подготовка к задатку',
    deal: 'подготовка сделки',
    check_docs: 'проверка документов',
    rework: 'доработка заявки'
  },
  representation: {
    seller: 'продавец',
    buyer: 'покупатель',
    one_spn_both: 'обе стороны, один СПН',
    both: 'обе стороны, два СПН',
    partner_agency: 'партнерская сделка',
    unknown: 'пока не ясно'
  },
  stage: {
    lead_only: 'только клиент',
    object_chosen: 'объект выбран',
    terms_discussed: 'условия обсуждены',
    urgent_deposit: 'срочный задаток',
    deposit_exists: 'задаток уже был',
    main_deal: 'основная сделка',
    legal_problem: 'нужен юрист'
  },
  objectType: {
    flat_mkd: 'квартира в МКД',
    flat_ground: 'квартира на земле',
    room: 'комната',
    share: 'доля',
    share_room: 'доля / комната',
    house_land: 'дом с участком',
    house: 'дом',
    land: 'земельный участок',
    new_building: 'новостройка / ДДУ / уступка',
    commercial: 'коммерция'
  }
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[char]));
}

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function readUpdatedAt() {
  const value = localStorage.getItem(DRAFT_UPDATED_KEY);
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function filled(value) {
  return String(value ?? '').trim().length > 0;
}

function arr(deal, key) {
  return Array.isArray(deal?.[key]) ? deal[key] : [];
}

function hasBuyer(deal) {
  if (deal.hasBuyer === true) return true;
  if (deal.hasBuyer === false) return false;
  return ['buyer', 'one_spn_both', 'both', 'partner_agency'].includes(deal.representation)
    || ['terms_discussed', 'urgent_deposit', 'deposit_exists', 'main_deal'].includes(deal.stage);
}

function needsDeposit(deal) {
  return deal.preparationMode === 'deposit'
    || ['urgent_deposit', 'deposit_exists'].includes(deal.stage)
    || (['terms_discussed', 'main_deal'].includes(deal.stage) && hasBuyer(deal));
}

function hasUsefulDraft(deal) {
  return deal && Object.keys(deal).some((key) => !key.startsWith('_') && filled(deal[key]));
}

function label(group, value, fallback = 'не указано') {
  return LABELS[group]?.[value] || value || fallback;
}

function missingItems(deal) {
  const items = [];
  if (!filled(deal.preparationMode)) items.push('что готовим');
  if (!filled(deal.representation)) items.push('кого сопровождаем');
  if (!filled(deal.stage)) items.push('стадия');
  if (!filled(deal.objectType)) items.push('тип объекта');
  if (!filled(deal.address) && deal.stage !== 'lead_only') items.push('адрес или ориентир');
  if (hasBuyer(deal) && !arr(deal, 'payments').length && !filled(deal.moneyComment)) items.push('источник денег покупателя');
  if (needsDeposit(deal) && deal.settlementsAgreed !== true) items.push('расчеты');
  if (needsDeposit(deal) && deal.expensesAgreed !== true) items.push('расходы');
  if (!filled(deal.clientNextStep)) items.push('ближайший шаг');
  return items;
}

function summary(deal) {
  return [
    `задача: ${label('preparationMode', deal.preparationMode)}`,
    `сторона: ${label('representation', deal.representation)}`,
    `стадия: ${label('stage', deal.stage)}`,
    `объект: ${label('objectType', deal.objectType)}`,
    `адрес: ${deal.address || 'не указан'}`
  ];
}

function draftKey(deal, missing, updatedAt) {
  return encodeURIComponent(JSON.stringify({
    preparationMode: deal.preparationMode || '',
    representation: deal.representation || '',
    stage: deal.stage || '',
    objectType: deal.objectType || '',
    address: deal.address || '',
    missing,
    updatedAt: updatedAt || ''
  }));
}

function formatAge(updatedAt) {
  if (!updatedAt) return null;
  const elapsed = Math.max(0, Date.now() - updatedAt);
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 2) return 'только что';
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн. назад`;
}

function freshnessHtml(updatedAt) {
  if (!updatedAt) {
    return '<div class="status warn" style="margin-top:10px"><b>Возраст черновика неизвестен.</b> Он создан до включения контроля времени. Перед продолжением перепроверьте клиента, объект и текущие условия.</div>';
  }

  const age = formatAge(updatedAt);
  if (Date.now() - updatedAt >= STALE_AFTER_MS) {
    return `<div class="status warn" style="margin-top:10px"><b>Черновик давно не обновлялся: ${esc(age)}.</b> Перед сохранением уточните у клиента цену, состав участников, расчеты, расходы и документы.</div>`;
  }

  return `<div class="status ok" style="margin-top:10px">Последнее изменение: ${esc(age)}.</div>`;
}

function panelHtml(deal) {
  const missing = missingItems(deal);
  const updatedAt = readUpdatedAt();
  const key = draftKey(deal, missing, updatedAt);
  const items = summary(deal).map((item) => `<span class="pill blue">${esc(item)}</span>`).join(' ');
  const missingText = missing.length
    ? `<div class="status warn" style="margin-top:10px">Перед сохранением проверьте: ${esc(missing.join(', '))}.</div>`
    : '<div class="status ok" style="margin-top:10px">Ключевые ориентиры черновика заполнены.</div>';

  return `<section class="card" data-spn-draft-guard="true" data-draft-key="${key}">
    <div class="section-title">
      <div>
        <h2>Продолжается локальный черновик</h2>
        <p class="muted">Это ещё не сделка в CRM. Проверьте, что черновик относится к текущему клиенту, или начните заново.</p>
      </div>
      <div class="actions">
        <button class="btn primary" type="button" data-spn-continue-draft="1">Продолжить</button>
        <button class="btn light" type="button" data-spn-clear-draft="1">Начать заново</button>
      </div>
    </div>
    <div class="actions" style="justify-content:flex-start">${items}</div>
    ${freshnessHtml(updatedAt)}
    ${missingText}
  </section>`;
}

function renderGuard() {
  const existing = document.querySelector('[data-spn-draft-guard]');
  const draft = readDraft();
  if (!hasUsefulDraft(draft)) {
    existing?.closest('[data-spn-draft-guard-shell]')?.remove();
    existing?.remove();
    localStorage.removeItem(DRAFT_UPDATED_KEY);
    return;
  }

  const app = document.getElementById('app');
  if (!app) return;

  const html = panelHtml(draft);
  const key = html.match(/data-draft-key="([^"]+)"/)?.[1] || '';
  if (existing?.dataset.draftKey === key) return;

  if (existing) {
    existing.outerHTML = html;
    bindActions();
    return;
  }

  const shell = document.createElement('main');
  shell.className = 'nav-v2-shell';
  shell.dataset.spnDraftGuardShell = 'true';
  shell.innerHTML = html;
  app.parentNode.insertBefore(shell, app);
  bindActions();
}

function bindActions() {
  document.querySelector('[data-spn-continue-draft]')?.addEventListener('click', () => {
    document.getElementById('app')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => document.querySelector('#app input, #app textarea, #app button')?.focus(), 350);
  }, { once: true });

  document.querySelector('[data-spn-clear-draft]')?.addEventListener('click', () => {
    if (!confirm('Очистить локальный черновик и начать новую сделку с чистого листа?')) return;
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_UPDATED_KEY);
    location.reload();
  }, { once: true });
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    renderGuard();
  });
}

function markDraftChanged() {
  window.setTimeout(() => {
    const draft = readDraft();
    if (hasUsefulDraft(draft)) localStorage.setItem(DRAFT_UPDATED_KEY, new Date().toISOString());
    else localStorage.removeItem(DRAFT_UPDATED_KEY);
    schedule();
  }, 0);
}

document.addEventListener('input', markDraftChanged, true);
document.addEventListener('click', (event) => {
  if (event.target?.closest?.('[data-click], #saveDraftBtn')) markDraftChanged();
  else schedule();
}, true);
window.addEventListener('storage', schedule);

renderGuard();
