const DRAFT_KEY = 'nav_deal_draft_v2';

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

function draftKey(deal, missing) {
  return encodeURIComponent(JSON.stringify({
    preparationMode: deal.preparationMode || '',
    representation: deal.representation || '',
    stage: deal.stage || '',
    objectType: deal.objectType || '',
    address: deal.address || '',
    missing
  }));
}

function panelHtml(deal) {
  const missing = missingItems(deal);
  const key = draftKey(deal, missing);
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
      <button class="btn light" type="button" data-spn-clear-draft="1">Начать заново</button>
    </div>
    <div class="actions" style="justify-content:flex-start">${items}</div>
    ${missingText}
  </section>`;
}

function renderGuard() {
  const existing = document.querySelector('[data-spn-draft-guard]');
  const draft = readDraft();
  if (!hasUsefulDraft(draft)) {
    existing?.remove();
    return;
  }

  const app = document.getElementById('app');
  if (!app) return;

  const html = panelHtml(draft);
  const key = html.match(/data-draft-key="([^"]+)"/)?.[1] || '';
  if (existing?.dataset.draftKey === key) return;

  if (existing) {
    existing.outerHTML = html;
    bindClear();
    return;
  }

  const shell = document.createElement('main');
  shell.className = 'nav-v2-shell';
  shell.dataset.spnDraftGuardShell = 'true';
  shell.innerHTML = html;
  app.parentNode.insertBefore(shell, app);
  bindClear();
}

function bindClear() {
  document.querySelector('[data-spn-clear-draft]')?.addEventListener('click', () => {
    if (!confirm('Очистить локальный черновик и начать новую сделку с чистого листа?')) return;
    localStorage.removeItem(DRAFT_KEY);
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

document.addEventListener('input', schedule, true);
document.addEventListener('click', schedule, true);
window.addEventListener('storage', schedule);

renderGuard();
