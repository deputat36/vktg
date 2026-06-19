const DRAFT_KEY = 'nav_deal_draft_v2';
let scheduled = false;
let observerStarted = false;

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function arr(key) {
  const deal = readDraft();
  return Array.isArray(deal[key]) ? deal[key] : [];
}

function hasSettlement(value) {
  return arr('settlements').includes(value);
}

function hasPayment(value) {
  return arr('payments').includes(value);
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

function detailsSection(title, note, content, open = false) {
  return `<details class="status" style="margin-top:12px" ${open ? 'open' : ''}>
    <summary><b>${esc(title)}</b></summary>
    ${note ? `<p class="muted" style="margin:8px 0 10px">${esc(note)}</p>` : ''}
    ${content}
  </details>`;
}

function routeHint() {
  const delayed = hasSettlement('afterRegistration') || hasSettlement('pensionFund');
  const protectedMethod = hasSettlement('sbr') || hasSettlement('accreditive') || hasSettlement('cell') || hasSettlement('notaryDeposit');
  const bankOrProgram = hasPayment('mortgage') || hasPayment('militaryMortgage') || hasPayment('matcap') || hasPayment('certificate');

  if (delayed) return `<div class="status warn" style="margin-top:10px"><b>Внимание:</b> часть оплаты после регистрации. Сроки и условия нужно прописать до задатка.</div>`;
  if (protectedMethod) return `<div class="status ok" style="margin-top:10px">Выбран защищённый способ расчёта. Проверьте условия раскрытия и расходы.</div>`;
  if (bankOrProgram) return `<div class="status warn" style="margin-top:10px">Есть банк, маткапитал или сертификат. Сроки перечисления нужно сверить заранее.</div>`;
  return `<div class="status" style="margin-top:10px">Выберите способ расчёта, чтобы увидеть подсказку по маршруту.</div>`;
}

function methodSection() {
  return section('1. Схема расчётов', 'Сначала определяем, когда и каким способом проходит оплата.', `<div class="option-grid">
    ${option('Перед сделкой', 'Оплата до подписания основного договора.', 'toggle:settlements:beforeDeal', hasSettlement('beforeDeal'))}
    ${option('На сделке', 'Оплата в день подписания.', 'toggle:settlements:onDeal', hasSettlement('onDeal'))}
    ${option('СБР', 'Сервис безопасных расчётов.', 'toggle:settlements:sbr', hasSettlement('sbr'), 'защита')}
    ${option('Аккредитив', 'Банк раскрывает сумму по условиям.', 'toggle:settlements:accreditive', hasSettlement('accreditive'), 'банк')}
    ${option('Ячейка', 'Доступ по согласованным условиям.', 'toggle:settlements:cell', hasSettlement('cell'), 'условия')}
    ${option('Депозит нотариуса', 'Расчёт через нотариуса.', 'toggle:settlements:notaryDeposit', hasSettlement('notaryDeposit'), 'нотариус')}
    ${option('После регистрации', 'Часть оплаты после перехода права.', 'toggle:settlements:afterRegistration', hasSettlement('afterRegistration'), 'риск')}
    ${option('СФР / сертификат после регистрации', 'Оплата по программе после регистрации.', 'toggle:settlements:pensionFund', hasSettlement('pensionFund'), 'сроки')}
  </div>${routeHint()}`);
}

function safetySection() {
  const deal = readDraft();
  return section('2. Безопасность расчётов', 'До задатка стороны должны одинаково понимать порядок оплаты.', `<div class="option-grid">
    ${option('Расчёты согласованы', 'Можно фиксировать порядок в задатке.', 'set:settlementsAgreed:true', deal.settlementsAgreed === true)}
    ${option('Расчёты НЕ согласованы', 'Сначала согласовать условия.', 'set:settlementsAgreed:false', deal.settlementsAgreed === false, 'стоп')}
  </div>
  <div class="grid" style="margin-top:12px">
    <div>${field('settlementDate', 'Когда продавец получает оплату?', 'text', 'на сделке, после регистрации, дата')}</div>
    <div>${field('settlementResponsible', 'Кто контролирует расчёты?', 'text', 'СПН, брокер, юрист, банк')}</div>
  </div>
  ${textarea('settlementProtection', 'Что важно прописать?', 'Условия раскрытия, сроки, расписка, передача ключей, ответственность за задержку.')}`);
}

function expenseSection() {
  const deal = readDraft();
  return section('3. Расходы сторон', 'Расходы лучше согласовать до задатка.', `<div class="option-grid">
    ${option('Расходы согласованы', 'Стороны понимают, кто что оплачивает.', 'set:expensesAgreed:true', deal.expensesAgreed === true)}
    ${option('Расходы НЕ согласованы', 'Нужно обсудить до задатка.', 'set:expensesAgreed:false', deal.expensesAgreed === false, 'уточнить')}
  </div>
  <div class="option-grid" style="margin-top:12px">
    ${option('Нотариус — покупатель', 'Оплачивает покупатель.', 'set:notaryPayer:buyer', deal.notaryPayer === 'buyer')}
    ${option('Нотариус — продавец', 'Оплачивает продавец.', 'set:notaryPayer:seller', deal.notaryPayer === 'seller')}
    ${option('Нотариус пополам', 'Расход делится.', 'set:notaryPayer:split', deal.notaryPayer === 'split')}
    ${option('Нотариус не нужен / не ясно', 'Пока не определено.', 'set:notaryPayer:unknown', deal.notaryPayer === 'unknown')}
  </div>`);
}

function conditionalDetails() {
  const blocks = [];

  if (hasSettlement('sbr') || hasSettlement('accreditive') || hasSettlement('cell') || hasSettlement('notaryDeposit')) {
    blocks.push(detailsSection('Условия раскрытия / доступа', 'Заполняется для защищённых способов расчёта.', textarea('settlementAccessConditions', 'Условия получения оплаты', 'После регистрации, по выписке ЕГРН, после передачи объекта, кто контролирует?'), true));
  }

  if (hasSettlement('afterRegistration') || hasSettlement('pensionFund')) {
    blocks.push(detailsSection('Оплата после регистрации', 'Зона повышенного внимания. Нужно прописать сроки и ответственность.', `<div class="grid">
      <div>${field('postRegistrationAmount', 'Сумма после регистрации', 'number')}</div>
      <div>${field('postRegistrationDeadline', 'Срок перечисления')}</div>
    </div>
    ${textarea('postRegistrationRiskComment', 'Как защищаем продавца?', 'Сроки, ответственность за задержку, передача объекта, подтверждение оплаты.')}`, true));
  }

  if (!blocks.length) return `<div class="status ok" style="margin-top:12px">Дополнительные уточнения по расчётам пока не нужны.</div>`;
  return blocks.join('');
}

function internalCostsSection() {
  return detailsSection('4. Комиссии и сервисные расходы', 'Эти поля нужны для внутреннего контроля, но не должны мешать первичному маршруту.', `<div class="grid">
    <div>${field('buyerCompanyFee', 'Комиссия покупателя', 'number')}</div>
    <div>${field('sellerCompanyFee', 'Комиссия продавца', 'number')}</div>
  </div>
  <div class="grid">
    <div>${field('bankServiceFee', 'Расходы банка / сервиса')}</div>
    <div>${field('notaryFeeEstimate', 'Ориентир по нотариусу')}</div>
  </div>
  ${textarea('expensesComment', 'Комментарий по расходам', 'Нотариус, госпошлина, банк, оценка, справки, доверенности.')}`);
}

function termsStepHtml() {
  return `<div id="adaptiveTermsStep">
    <h2>Расчёты и расходы</h2>
    <p class="muted">Сначала фиксируем схему и безопасность, потом расходы и технические детали.</p>
    ${methodSection()}
    ${safetySection()}
    ${expenseSection()}
    ${section('4. Уточнения по выбранной схеме', 'Дополнительные вопросы появляются только для выбранных способов расчёта.', conditionalDetails())}
    ${internalCostsSection()}
    ${section('5. Короткий комментарий по расчётам', 'Кратко: когда оплата, кто платит расходы, что важно прописать.', textarea('settlementsComment', 'Комментарий по расчётам', 'Когда оплата, как защищаем стороны, какие расходы спорные?'))}
  </div>`;
}

function findTermsCard() {
  const headings = [...document.querySelectorAll('#app h2')];
  const heading = headings.find((node) => node.textContent.trim().startsWith('Расчёты и расходы'));
  return heading?.closest?.('.card') || null;
}

function replaceTermsStep(card) {
  if (card.querySelector('#adaptiveTermsStep')) return;

  const title = card.querySelector('.section-title');
  const pageStatus = card.querySelector('#pageStatus');
  if (!title || !pageStatus) return;

  let node = title.nextSibling;
  while (node && node !== pageStatus) {
    const next = node.nextSibling;
    node.remove();
    node = next;
  }

  pageStatus.insertAdjacentHTML('beforebegin', termsStepHtml());
}

function apply() {
  const card = findTermsCard();
  if (!card) return;
  replaceTermsStep(card);
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
  if (event.target?.closest?.('#adaptiveTermsStep [data-field]')) return;
  schedule();
}, true);
window.addEventListener('storage', schedule);
