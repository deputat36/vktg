import './cloudRolePatch.js';

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
  ensureFinanceTab();
  bindRefresh();
  renderFinanceSummary();
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (document.querySelector('.tabs') && get('sellerCount') && get('sellerRealtorCommission')) {
    clearInterval(timer);
    start();
  }
  if (attempts > 50) clearInterval(timer);
}, 200);
