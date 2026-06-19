const DRAFT_KEY = 'nav_deal_draft_v2';
let scheduled = false;
let observerStarted = false;

const FLAG_LABELS = {
  minorSeller: 'ребёнок-собственник',
  minorBuyer: 'ребёнок-покупатель',
  minorRegistered: 'зарегистрированы дети',
  spouse: 'супруг/супруга',
  powerOfAttorney: 'доверенность',
  shares: 'доли / часть объекта',
  sellerWillNotAttend: 'продавец не будет лично',
  encumbrance: 'арест / обременение',
  sellerBankruptcyRisk: 'риск банкротства продавца',
  redevelopment: 'перепланировка',
  unpaidUtilities: 'долги / коммунальные вопросы',
  alternativeDeal: 'цепочка / альтернатива',
  urgentTerms: 'сжатые сроки'
};

const PAYMENT_LABELS = {
  mortgage: 'ипотека',
  matcap: 'маткапитал',
  certificate: 'сертификат / субсидия',
  militaryMortgage: 'военная ипотека / НИС',
  nominalChild: 'детский номинальный счёт',
  svoChildAccount: 'деньги детей / СВО',
  installment: 'рассрочка / остаток долга'
};

const BASIS_LABELS = {
  inheritLaw: 'наследство по закону',
  inheritWill: 'наследство по завещанию',
  privat: 'приватизация',
  court: 'решение суда'
};

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function arr(key) {
  const deal = readDraft();
  return Array.isArray(deal[key]) ? deal[key] : [];
}

function flags() {
  const deal = readDraft();
  const base = Array.isArray(deal.flags) ? deal.flags : [];
  if ((deal.legalForm === 'share' || deal.shareSale === true) && !base.includes('shares')) return [...base, 'shares'];
  return base;
}

function hasFlag(value) {
  return flags().includes(value);
}

function hasPayment(value) {
  return arr('payments').includes(value);
}

function hasBasis(value) {
  return arr('basis').includes(value);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function option(title, text, action, active = false, note = '') {
  return `<button type="button" class="option ${active ? 'active' : ''}" data-action="${esc(action)}"><b>${esc(title)}</b><span>${esc(text || '')}</span>${note ? `<em class="small">${esc(note)}</em>` : ''}</button>`;
}

function field(key, label, type = 'text', placeholder = '') {
  const deal = readDraft();
  return `<div class="field"><label>${esc(label)}</label><input data-field="${esc(key)}" type="${esc(type)}" value="${esc(deal[key] || '')}" placeholder="${esc(placeholder)}"></div>`;
}

function textarea(key, label, placeholder = '') {
  const deal = readDraft();
  return `<div class="field"><label>${esc(label)}</label><textarea data-field="${esc(key)}" placeholder="${esc(placeholder)}">${esc(deal[key] || '')}</textarea></div>`;
}

function section(title, note, content) {
  return `<div class="card" style="box-shadow:none;margin-top:12px">
    <h3>${esc(title)}</h3>
    ${note ? `<p class="muted" style="margin:4px 0 10px">${esc(note)}</p>` : ''}
    ${content}
  </div>`;
}

function riskSummaryItems() {
  const deal = readDraft();
  const items = [];

  flags().forEach((flag) => {
    if (FLAG_LABELS[flag]) items.push(FLAG_LABELS[flag]);
  });

  arr('payments').forEach((payment) => {
    if (PAYMENT_LABELS[payment]) items.push(PAYMENT_LABELS[payment]);
  });

  arr('basis').forEach((basis) => {
    if (BASIS_LABELS[basis]) items.push(BASIS_LABELS[basis]);
  });

  if (deal.objectType === 'room') items.push('комната');
  if (deal.objectType === 'flat_ground') items.push('квартира на земле');
  if (deal.objectType === 'house_land') items.push('дом и земля проверяются вместе');
  if (deal.shareSale === true || deal.legalForm === 'share') items.push('продаётся доля / часть объекта');
  if (deal.settlementsAgreed === false) items.push('расчёты не согласованы');
  if (deal.expensesAgreed === false) items.push('расходы не согласованы');
  if (deal.priceAgreed === false) items.push('цена не согласована');
  if (deal.lawyerCheckedBeforeDeposit === false) items.push('юрист ещё не проверял риски');

  return [...new Set(items)];
}

function riskLevel(items) {
  const redMarkers = ['ребёнок-собственник', 'ребёнок-покупатель', 'детский номинальный счёт', 'деньги детей / СВО', 'арест / обременение', 'решение суда', 'цена не согласована', 'расчёты не согласованы'];
  const yellowMarkers = ['доверенность', 'доли / часть объекта', 'супруг/супруга', 'наследство', 'приватизация', 'маткапитал', 'сертификат', 'ипотека', 'расходы не согласованы'];
  if (items.some((item) => redMarkers.some((marker) => item.includes(marker)))) return ['error', 'Есть стоп-факторы или вопросы до задатка'];
  if (items.some((item) => yellowMarkers.some((marker) => item.includes(marker)))) return ['warn', 'Есть вопросы для проверки'];
  return ['ok', 'Явных дополнительных рисков пока нет'];
}

function summarySection() {
  const items = riskSummaryItems();
  const [statusClass, title] = riskLevel(items);
  if (!items.length) {
    return section('1. Что уже выявлено системой', 'Навигатор собирает риски из предыдущих шагов.', `<div class="status ok">По выбранным ответам явных дополнительных рисков пока нет.</div>`);
  }

  return section('1. Что уже выявлено системой', 'Это собрано автоматически из предыдущих ответов. Здесь не нужно заполнять всё заново.', `<div class="status ${statusClass}"><b>${esc(title)}</b></div>
    <div class="actions" style="justify-content:flex-start;margin-top:10px">${items.map((item) => `<span class="pill blue">${esc(item)}</span>`).join('')}</div>`);
}

function checklistSection() {
  return section('2. Контрольные вопросы перед сохранением', 'Отметьте только то, что ещё не было отмечено раньше или всплыло в разговоре.', `<div class="option-grid">
    ${option('Зарегистрированы дети', 'Проверить выписку и сроки снятия с регистрации.', 'toggle:flags:minorRegistered', hasFlag('minorRegistered'))}
    ${option('Долги / коммунальные вопросы', 'Уточнить справки, оплату и дату закрытия долга.', 'sellerFlag:unpaidUtilities', hasFlag('unpaidUtilities'))}
    ${option('Перепланировка', 'Проверить документы и влияние на ипотеку.', 'sellerFlag:redevelopment', hasFlag('redevelopment'))}
    ${option('Цепочка / альтернатива', 'Есть зависимость от другой сделки или регистрации.', 'sellerFlag:alternativeDeal', hasFlag('alternativeDeal'))}
    ${option('Сжатые сроки', 'Нужно сразу назначить ответственных и даты.', 'sellerFlag:urgentTerms', hasFlag('urgentTerms'))}
    ${option('Риск банкротства продавца', 'Нужна дополнительная проверка продавца.', 'sellerFlag:sellerBankruptcyRisk', hasFlag('sellerBankruptcyRisk'))}
  </div>`);
}

function actionSection() {
  const items = riskSummaryItems();
  const [statusClass] = riskLevel(items);
  let hint = 'Можно сохранить черновик и передать по маршруту.';
  if (statusClass === 'error') hint = 'Перед задатком лучше зафиксировать следующий шаг по проверке.';
  if (statusClass === 'warn') hint = 'Нужно указать, кто и что проверяет дальше.';

  return section('3. Что мешает двигаться дальше', hint, `<div class="grid">
    <div>${field('riskOwner', 'Кто должен проверить?', 'text', 'юрист, брокер, менеджер, СПН')}</div>
    <div>${field('riskDeadline', 'До какого срока?', 'text', 'сегодня, до задатка, до сделки')}</div>
  </div>
  ${textarea('riskActionPlan', 'Что нужно сделать по рискам?', 'Запросить документ, показать юристу, уточнить банк, согласовать расходы, проверить регистрацию.')}`);
}

function riskCommentSection() {
  return section('4. Короткий комментарий по рискам', 'Пишите только то, что важно передать дальше. Не нужно дублировать всю заявку.', textarea('riskComment', 'Комментарий по рискам', 'Что настораживает, чего не хватает, что уже обещали, что срочно проверить?'));
}

function risksStepHtml() {
  return `<div id="adaptiveRisksStep">
    <h2>Дополнительные риски</h2>
    <p class="muted">Финальный контроль перед итогом. Этот шаг не дублирует предыдущие блоки, а собирает главное.</p>
    ${summarySection()}
    ${checklistSection()}
    ${actionSection()}
    ${riskCommentSection()}
  </div>`;
}

function findRisksCard() {
  const headings = [...document.querySelectorAll('#app h2')];
  const heading = headings.find((node) => node.textContent.trim().startsWith('Дополнительные риски'));
  return heading?.closest?.('.card') || null;
}

function replaceRisksStep(card) {
  if (card.querySelector('#adaptiveRisksStep')) return;

  const title = card.querySelector('.section-title');
  const pageStatus = card.querySelector('#pageStatus');
  if (!title || !pageStatus) return;

  let node = title.nextSibling;
  while (node && node !== pageStatus) {
    const next = node.nextSibling;
    node.remove();
    node = next;
  }

  pageStatus.insertAdjacentHTML('beforebegin', risksStepHtml());
}

function apply() {
  const card = findRisksCard();
  if (!card) return;
  replaceRisksStep(card);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    apply();
  }, 80);
}

function startObserver() {
  if (observerStarted) return;
  const host = document.getElementById('app');
  if (!host) return;
  observerStarted = true;
  const observer = new MutationObserver(() => schedule());
  observer.observe(host, { childList: true, subtree: true });
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  startObserver();
  apply();
  if (observerStarted && attempts >= 10) clearInterval(timer);
  if (attempts >= 40) clearInterval(timer);
}, 150);

document.addEventListener('click', schedule, true);
document.addEventListener('input', (event) => {
  if (event.target?.closest?.('#adaptiveRisksStep [data-field]')) return;
  schedule();
}, true);
window.addEventListener('storage', schedule);
