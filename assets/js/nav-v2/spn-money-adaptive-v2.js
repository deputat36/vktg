import './broker-scope-correction-v2.js?v=20260716-01';

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

function sourceSection() {
  return section('1. Источник денег', 'Источник денег определяет, кто нужен дальше: брокер — только по ипотеке; маткапитал, сертификаты и оформление сделки ведут СПН и юрист.', `<div class="option-grid">
    ${option('Собственные средства', 'Деньги покупателя без банка и сертификатов.', 'toggle:payments:cash', hasPayment('cash'))}
    ${option('Ипотека', 'Банк, консультация, подбор программы и одобрение.', 'toggle:payments:mortgage', hasPayment('mortgage'), 'брокер')}
    ${option('Маткапитал', 'Доли детям, сроки СФР, порядок расчётов.', 'toggle:payments:matcap', hasPayment('matcap'), 'СПН/юрист')}
    ${option('Сертификат / субсидия', 'Проверить вид сертификата, сроки и условия.', 'toggle:payments:certificate', hasPayment('certificate'), 'СПН/юрист')}
    ${option('Военная ипотека / НИС', 'Ипотечная программа со специальными требованиями.', 'toggle:payments:militaryMortgage', hasPayment('militaryMortgage'), 'брокер')}
    ${option('Детский номинальный счёт', 'Нужен юрист до движения денег.', 'toggle:payments:nominalChild', hasPayment('nominalChild'), 'стоп-фактор')}
    ${option('Деньги детей / СВО', 'Проверить законность и порядок использования.', 'toggle:payments:svoChildAccount', hasPayment('svoChildAccount'), 'юрист')}
    ${option('Рассрочка / остаток долга', 'Нужно безопасно закрепить условия.', 'toggle:payments:installment', hasPayment('installment'), 'условия')}
  </div>`);
}

function decisionSection() {
  const selected = arr('payments');
  if (!selected.length) {
    return `<div class="status warn" style="margin-top:12px">Источник денег пока не выбран. Выберите хотя бы один вариант выше, чтобы открылся нужный набор уточнений.</div>`;
  }

  const needsBroker = selected.some((item) => ['mortgage', 'militaryMortgage'].includes(item));
  const needsLawyer = selected.some((item) => ['matcap', 'certificate', 'nominalChild', 'svoChildAccount', 'installment'].includes(item));

  const chips = [];
  if (needsBroker) chips.push('<span class="pill blue">брокер: консультация, программа, одобрение</span>');
  if (needsLawyer) chips.push('<span class="pill yellow">СПН и юрист: условия и оформление сделки</span>');
  if (!needsBroker && !needsLawyer) chips.push('<span class="pill green">обычный денежный сценарий</span>');

  return `<div class="status" style="margin-top:12px"><b>Маршрут по деньгам</b><div class="actions" style="justify-content:flex-start;margin-top:8px">${chips.join('')}</div></div>`;
}

function workingFieldsSection() {
  return section('2. Рабочие суммы и сроки', 'Заполняем то, что помогает понять готовность покупателя к задатку и сделке.', `<div class="grid">
    <div>${field('buyerInitialAmount', 'Сколько денег есть сейчас?', 'number')}</div>
    <div>${field('buyerNeededAmount', 'Сколько нужно добрать / одобрить?', 'number')}</div>
  </div>
  <div class="grid">
    <div>${field('moneyReadyDate', 'Когда деньги будут готовы?', 'text', 'сейчас, после одобрения, после продажи, дата')}</div>
    <div>${field('paymentDecisionMaker', 'Кто решает по деньгам?', 'text', 'сам покупатель, супруг, родители, банк')}</div>
  </div>`);
}

function conditionalDetails() {
  const blocks = [];

  if (hasPayment('mortgage') || hasPayment('militaryMortgage')) {
    blocks.push(detailsSection('Ипотека / банк', 'Брокер консультирует, подбирает программу, помогает получить одобрение и обучает СПН по ипотеке. Подготовку самой сделки ведут СПН и юрист.', `<div class="grid">
      <div>${field('bankName', 'Банк / программа')}</div>
      <div>${field('mortgageApproved', 'Одобрение есть?', 'text', 'да, нет, в процессе')}</div>
    </div>
    <div class="grid">
      <div>${field('mortgageAmount', 'Сумма кредита', 'number')}</div>
      <div>${field('mortgageDeadline', 'Срок одобрения / сделки')}</div>
    </div>
    ${textarea('mortgageComment', 'Что важно по ипотеке?', 'Первоначальный взнос, созаёмщики, ограничения банка, выбранная программа, статус одобрения.')}`, true));
  }

  if (hasPayment('matcap')) {
    blocks.push(detailsSection('Маткапитал', 'Маткапитал ведут СПН и юрист: условия использования, доли детям, СФР и порядок расчётов.', `<div class="grid">
      <div>${field('matcapAmount', 'Сумма маткапитала', 'number')}</div>
      <div>${field('matcapOwner', 'На кого сертификат?')}</div>
    </div>
    ${textarea('matcapComment', 'Что важно по маткапиталу?', 'Доли детям, СФР, сроки перечисления, ипотека или без ипотеки.')}`, true));
  }

  if (hasPayment('certificate')) {
    blocks.push(detailsSection('Сертификат / субсидия', 'Сертификат ведут СПН и юрист: проверяют условия, сроки, требования к объекту и схему расчётов.', `<div class="grid">
      <div>${field('certificateType', 'Какой сертификат?')}</div>
      <div>${field('certificateAmount', 'Сумма сертификата', 'number')}</div>
    </div>
    <div class="grid">
      <div>${field('certificateDeadline', 'До какого срока использовать?')}</div>
    </div>
    ${textarea('certificateComment', 'Что важно по сертификату?', 'Орган, условия, сроки оплаты, требования к объекту, недостающая сумма.')}`, true));
  }

  if (hasPayment('nominalChild') || hasPayment('svoChildAccount')) {
    blocks.push(detailsSection('Детские деньги / номинальный счёт', 'Стоп-фактор для самостоятельного задатка. Нужно показать юристу.', textarea('childMoneyComment', 'Что известно по детским деньгам?', 'Чьи деньги, основание, разрешение, счёт, кто представитель, можно ли использовать на этот объект?'), true));
  }

  if (hasPayment('installment')) {
    blocks.push(detailsSection('Рассрочка / остаток долга', 'Нужно чётко закрепить условия, сроки и ответственность.', `<div class="grid">
      <div>${field('installmentAmount', 'Сумма остатка / рассрочки', 'number')}</div>
      <div>${field('installmentDeadline', 'До какого срока оплатить?')}</div>
    </div>
    ${textarea('installmentComment', 'Условия рассрочки', 'График, обеспечение, когда регистрация, что будет при просрочке.')}`, true));
  }

  if (!blocks.length) {
    return `<div class="status ok" style="margin-top:12px">Дополнительные денежные уточнения пока не нужны.</div>`;
  }

  return blocks.join('');
}

function moneyStepHtml() {
  return `<div id="adaptiveMoneyStep">
    <h2>Деньги покупателя</h2>
    <p class="muted">Сначала выберите источник денег. После этого откроются только нужные уточнения.</p>
    ${sourceSection()}
    ${decisionSection()}
    ${workingFieldsSection()}
    ${section('3. Уточнения по выбранным источникам', 'Ипотека, маткапитал, сертификат, детские деньги и рассрочка открывают свои вопросы.', conditionalDetails())}
    ${section('4. Короткий комментарий по деньгам', 'Кратко: где деньги, когда готовы, что может задержать задаток или сделку.', textarea('moneyComment', 'Комментарий по деньгам', 'Где деньги, когда готовы, условия банка/сертификата/маткапитала?'))}
  </div>`;
}

function findMoneyCard() {
  const headings = [...document.querySelectorAll('#app h2')];
  const heading = headings.find((node) => node.textContent.trim().startsWith('Деньги покупателя'));
  return heading?.closest?.('.card') || null;
}

function replaceMoneyStep(card) {
  if (card.querySelector('#adaptiveMoneyStep')) return;

  const title = card.querySelector('.section-title');
  const pageStatus = card.querySelector('#pageStatus');
  if (!title || !pageStatus) return;

  let node = title.nextSibling;
  while (node && node !== pageStatus) {
    const next = node.nextSibling;
    node.remove();
    node = next;
  }

  pageStatus.insertAdjacentHTML('beforebegin', moneyStepHtml());
}

function apply() {
  const card = findMoneyCard();
  if (!card) return;
  replaceMoneyStep(card);
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
  if (event.target?.closest?.('#adaptiveMoneyStep [data-field]')) return;
  schedule();
}, true);
window.addEventListener('storage', schedule);
