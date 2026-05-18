function get(id) {
  return document.getElementById(id);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function money(value) {
  const raw = String(value || '').replace(/[^0-9.,-]/g, '').replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function fmt(n) {
  return n ? new Intl.NumberFormat('ru-RU').format(n) + ' ₽' : '—';
}

function input(id, label, placeholder = '') {
  return `<label>${label}<input id="${id}" placeholder="${placeholder}"></label>`;
}

function textarea(id, label, placeholder = '') {
  return `<label>${label}<textarea id="${id}" placeholder="${placeholder}"></textarea></label>`;
}

function ensureRestoredFields() {
  if (get('sellerCount')) return;

  const mainSection = [...document.querySelectorAll('aside .section')].find((section) => section.textContent.includes('Основное'));
  const objectSection = [...document.querySelectorAll('aside .section')].find((section) => section.textContent.includes('Объект'));
  if (!mainSection || !objectSection) return;

  const parties = document.createElement('section');
  parties.className = 'section';
  parties.id = 'partiesFinanceSection';
  parties.innerHTML = `
    <h2>Стороны сделки</h2>
    <div class="row">
      ${input('sellerCount', 'Количество продавцов', 'например: 1')}
      ${input('buyerCount', 'Количество покупателей', 'например: 1')}
    </div>
    <div class="row">
      ${input('sellerMainName', 'Основной продавец / представитель', 'ФИО или коротко')}
      ${input('buyerMainName', 'Основной покупатель / представитель', 'ФИО или коротко')}
    </div>
    <div class="row">
      ${textarea('sellerSideComment', 'Комментарий по стороне продавца', 'несовершеннолетние, доверенность, супруг, наследники, доли...')}
      ${textarea('buyerSideComment', 'Комментарий по стороне покупателя', 'ипотека, сертификаты, несколько покупателей, маткапитал...')}
    </div>
  `;
  mainSection.insertAdjacentElement('afterend', parties);

  const finance = document.createElement('section');
  finance.className = 'section';
  finance.id = 'financeSection';
  finance.innerHTML = `
    <h2>Финансы / комиссии / расходы</h2>
    <h3>Комиссии</h3>
    <div class="row">
      ${input('sellerRealtorCommission', 'Комиссия со стороны продавца', 'например: 59 000')}
      ${input('buyerRealtorCommission', 'Комиссия со стороны покупателя', 'например: 0 / 50 000')}
    </div>
    <div class="row">
      ${textarea('sellerCommissionComment', 'Комментарий по комиссии продавца', 'кто платит, когда, по какому договору')}
      ${textarea('buyerCommissionComment', 'Комментарий по комиссии покупателя', 'кто платит, когда, по какому договору')}
    </div>
    <div class="row">
      ${input('totalOfficeCommission', 'Общая комиссия офиса', 'сумма или формула')}
      ${textarea('commissionDistribution', 'Распределение комиссии', 'между СПН продавца/покупателя, офисом, партнерами')}
    </div>
    <h3>Расходы сделки</h3>
    <div class="row">
      <label>Кто оплачивает госпошлину
        <select id="registrationFeePayer">
          <option>Не указано</option>
          <option>Покупатель</option>
          <option>Продавец</option>
          <option>50/50</option>
          <option>По договоренности</option>
        </select>
      </label>
      ${input('registrationFeeAmount', 'Госпошлина за регистрацию права', '4000')}
    </div>
    <div class="row">
      ${input('landRegistrationFeeAmount', 'Госпошлина по земле', '700')}
      ${input('evaluationCost', 'Оценка объекта', 'квартира 3000–5000, дом 6000–9000')}
    </div>
    <div class="row">
      ${input('sbrCost', 'СБР / безопасные расчеты', 'Сбер сейчас 3400')}
      ${input('notaryCost', 'Нотариус', 'если требуется')}
    </div>
    <div class="row">
      ${input('bankInsuranceCost', 'Страховка / услуги банка', 'если ипотека')}
      ${input('otherCosts', 'Прочие расходы', 'курьер, доверенность, выписки...')}
    </div>
    ${textarea('costsComment', 'Комментарий по расходам', 'что обязательно, от чего можно отказаться, что согласовать с клиентом')}
  `;
  objectSection.insertAdjacentElement('afterend', finance);
}

function ensureFinanceTab() {
  if (get('financeSummary')) return;
  const tabs = document.querySelector('.tabs');
  const result = document.querySelector('.result');
  if (!tabs || !result) return;

  const btn = document.createElement('button');
  btn.className = 'tab';
  btn.dataset.tab = 'financeSummary';
  btn.textContent = 'Финансы';
  tabs.appendChild(btn);

  const page = document.createElement('div');
  page.id = 'financeSummary';
  page.className = 'tabpage';
  result.appendChild(page);

  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    document.querySelectorAll('.tabpage').forEach((item) => item.classList.remove('active'));
    btn.classList.add('active');
    page.classList.add('active');
    renderFinanceSummary();
  };
}

function renderFinanceSummary() {
  const page = get('financeSummary');
  if (!page) return;

  const sellerCommission = money(get('sellerRealtorCommission')?.value);
  const buyerCommission = money(get('buyerRealtorCommission')?.value);
  const registration = money(get('registrationFeeAmount')?.value);
  const landRegistration = money(get('landRegistrationFeeAmount')?.value);
  const evaluation = money(get('evaluationCost')?.value);
  const sbr = money(get('sbrCost')?.value);
  const notary = money(get('notaryCost')?.value);
  const insurance = money(get('bankInsuranceCost')?.value);
  const other = money(get('otherCosts')?.value);
  const totalCosts = registration + landRegistration + evaluation + sbr + notary + insurance + other;

  page.innerHTML = `
    <h2>Финансы / комиссии / расходы</h2>
    <div class="metrics">
      <div class="metric"><b>${fmt(sellerCommission + buyerCommission)}</b><span>комиссия по заполненным полям</span></div>
      <div class="metric"><b>${fmt(totalCosts)}</b><span>ориентировочные расходы сделки</span></div>
      <div class="metric"><b>${esc(get('registrationFeePayer')?.value || '—')}</b><span>кто платит госпошлину</span></div>
      <div class="metric"><b>${esc(get('totalOfficeCommission')?.value || '—')}</b><span>общая комиссия офиса</span></div>
    </div>
    <div class="box blue">
      <h3>Стороны</h3>
      <table>
        <tr><th>Продавцы</th><td>${esc(get('sellerCount')?.value || '—')}<br>${esc(get('sellerMainName')?.value || '')}<br>${esc(get('sellerSideComment')?.value || '')}</td></tr>
        <tr><th>Покупатели</th><td>${esc(get('buyerCount')?.value || '—')}<br>${esc(get('buyerMainName')?.value || '')}<br>${esc(get('buyerSideComment')?.value || '')}</td></tr>
      </table>
    </div>
    <div class="box greenBox">
      <h3>Комиссии</h3>
      <table>
        <tr><th>Со стороны продавца</th><td>${esc(get('sellerRealtorCommission')?.value || '—')}<br>${esc(get('sellerCommissionComment')?.value || '')}</td></tr>
        <tr><th>Со стороны покупателя</th><td>${esc(get('buyerRealtorCommission')?.value || '—')}<br>${esc(get('buyerCommissionComment')?.value || '')}</td></tr>
        <tr><th>Распределение</th><td>${esc(get('commissionDistribution')?.value || '—')}</td></tr>
      </table>
    </div>
    <div class="box orangeBox">
      <h3>Расходы</h3>
      <table>
        <tr><th>Регистрация права</th><td>${esc(get('registrationFeeAmount')?.value || '—')}</td><th>Земля</th><td>${esc(get('landRegistrationFeeAmount')?.value || '—')}</td></tr>
        <tr><th>Оценка</th><td>${esc(get('evaluationCost')?.value || '—')}</td><th>СБР</th><td>${esc(get('sbrCost')?.value || '—')}</td></tr>
        <tr><th>Нотариус</th><td>${esc(get('notaryCost')?.value || '—')}</td><th>Страховка / банк</th><td>${esc(get('bankInsuranceCost')?.value || '—')}</td></tr>
        <tr><th>Прочее</th><td colspan="3">${esc(get('otherCosts')?.value || '—')}</td></tr>
        <tr><th>Комментарий</th><td colspan="3">${esc(get('costsComment')?.value || '—')}</td></tr>
      </table>
    </div>
  `;
}

function bindRefresh() {
  document.addEventListener('input', () => renderFinanceSummary());
  document.addEventListener('change', () => renderFinanceSummary());
}

function start() {
  ensureRestoredFields();
  ensureFinanceTab();
  bindRefresh();
  renderFinanceSummary();
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (document.querySelector('aside .section') && document.querySelector('.tabs')) {
    clearInterval(timer);
    start();
  }
  if (attempts > 50) clearInterval(timer);
}, 200);
