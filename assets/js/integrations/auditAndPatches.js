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

function value(id) {
  return get(id)?.value || '';
}

function ensureExtraSummary() {
  const summary = get('summary');
  if (!summary || !get('sellerCount')) return;

  let box = get('extraPartySummaryBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'extraPartySummaryBox';
    box.className = 'box blue';
    summary.appendChild(box);
  }

  box.innerHTML = `
    <h3>Стороны и деньги</h3>
    <table>
      <tr><th>Продавцы</th><td>${esc(value('sellerCount') || '—')}<br>${esc(value('sellerMainName'))}<br>${esc(value('sellerSideComment'))}</td></tr>
      <tr><th>Покупатели</th><td>${esc(value('buyerCount') || '—')}<br>${esc(value('buyerMainName'))}<br>${esc(value('buyerSideComment'))}</td></tr>
      <tr><th>Комиссия продавца</th><td>${esc(value('sellerRealtorCommission') || '—')}<br>${esc(value('sellerCommissionComment'))}</td></tr>
      <tr><th>Комиссия покупателя</th><td>${esc(value('buyerRealtorCommission') || '—')}<br>${esc(value('buyerCommissionComment'))}</td></tr>
      <tr><th>Расходы</th><td>Госпошлина: ${esc(value('registrationFeeAmount') || '—')}; земля: ${esc(value('landRegistrationFeeAmount') || '—')}; оценка: ${esc(value('evaluationCost') || '—')}; СБР: ${esc(value('sbrCost') || '—')}; нотариус: ${esc(value('notaryCost') || '—')}</td></tr>
    </table>
  `;
}

function ensureLawyerFinanceBox() {
  const lawyer = get('lawyerTab');
  if (!lawyer || !get('sellerCount')) return;

  let box = get('lawyerFinanceBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'lawyerFinanceBox';
    box.className = 'box greenBox';
    lawyer.appendChild(box);
  }

  box.innerHTML = `
    <h3>Стороны / комиссии / расходы для юриста</h3>
    <table>
      <tr><th>Продавцы</th><td>${esc(value('sellerCount') || '—')}<br>${esc(value('sellerMainName'))}<br>${esc(value('sellerSideComment'))}</td></tr>
      <tr><th>Покупатели</th><td>${esc(value('buyerCount') || '—')}<br>${esc(value('buyerMainName'))}<br>${esc(value('buyerSideComment'))}</td></tr>
      <tr><th>Комиссия продавца</th><td>${esc(value('sellerRealtorCommission') || '—')}<br>${esc(value('sellerCommissionComment'))}</td></tr>
      <tr><th>Комиссия покупателя</th><td>${esc(value('buyerRealtorCommission') || '—')}<br>${esc(value('buyerCommissionComment'))}</td></tr>
      <tr><th>Общая комиссия / распределение</th><td>${esc(value('totalOfficeCommission') || '—')}<br>${esc(value('commissionDistribution'))}</td></tr>
      <tr><th>Госпошлина</th><td>Плательщик: ${esc(value('registrationFeePayer') || '—')}<br>Право: ${esc(value('registrationFeeAmount') || '—')}<br>Земля: ${esc(value('landRegistrationFeeAmount') || '—')}</td></tr>
      <tr><th>Банк / сделочные расходы</th><td>Оценка: ${esc(value('evaluationCost') || '—')}<br>СБР: ${esc(value('sbrCost') || '—')}<br>Нотариус: ${esc(value('notaryCost') || '—')}<br>Страховка/банк: ${esc(value('bankInsuranceCost') || '—')}<br>Прочее: ${esc(value('otherCosts') || '—')}</td></tr>
      <tr><th>Комментарий по расходам</th><td>${esc(value('costsComment') || '—')}</td></tr>
    </table>
  `;
}

function ensureAuditTab() {
  if (get('systemAudit')) return;
  const tabs = document.querySelector('.tabs');
  const result = document.querySelector('.result');
  if (!tabs || !result) return;

  const btn = document.createElement('button');
  btn.className = 'tab';
  btn.dataset.tab = 'systemAudit';
  btn.textContent = 'Проверка';
  tabs.appendChild(btn);

  const page = document.createElement('div');
  page.id = 'systemAudit';
  page.className = 'tabpage';
  result.appendChild(page);

  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    document.querySelectorAll('.tabpage').forEach((item) => item.classList.remove('active'));
    btn.classList.add('active');
    page.classList.add('active');
    renderAudit();
  };
}

function checkItem(title, ok, comment) {
  return `<tr><td>${ok ? '✅' : '⚠️'}</td><td>${esc(title)}</td><td>${esc(comment || '')}</td></tr>`;
}

function renderAudit() {
  const page = get('systemAudit');
  if (!page) return;

  const checks = [
    ['Основная форма', Boolean(get('mode') && get('objectType') && get('priceFact')), 'Базовые поля сделки'],
    ['Стороны сделки', Boolean(get('sellerCount') && get('buyerCount')), 'Количество продавцов/покупателей и комментарии'],
    ['Финансы и комиссии', Boolean(get('sellerRealtorCommission') && get('registrationFeeAmount')), 'Комиссии, госпошлина, оценка, СБР'],
    ['Вкладка Финансы', Boolean(get('financeSummary')), 'Сводка расходов и комиссий'],
    ['Supabase-панель', Boolean(get('cloudPanel')), 'Вход, сохранение, мои сделки'],
    ['Состояние входа', Boolean(get('authStateBox')), 'Понятный статус авторизации'],
    ['Вкладка Решения', Boolean(get('dealReviews')), 'Решение юриста/брокера/менеджера'],
    ['Вкладка Задачи', Boolean(get('dealTasks')), 'Задачи по открытой сделке'],
    ['Карточка юристу + финансы', Boolean(get('lawyerFinanceBox')), 'Дополнительная финансовая часть карточки'],
    ['Сохранение новых полей', Boolean(get('sellerCount')), 'Поля сохраняются через getDeal() при экспорте/Supabase']
  ];

  page.innerHTML = `
    <h2>Проверка системы</h2>
    <div class="box blue">
      <p>Эта вкладка проверяет, загрузились ли основные модули интерфейса. Если есть предупреждения — обновите страницу с очисткой кэша или пришлите скрин этой вкладки.</p>
      <table><tr><th></th><th>Блок</th><th>Комментарий</th></tr>${checks.map((item) => checkItem(item[0], item[1], item[2])).join('')}</table>
    </div>
  `;
}

function refreshPatches() {
  ensureExtraSummary();
  ensureLawyerFinanceBox();
  renderAudit();
}

function start() {
  ensureAuditTab();
  refreshPatches();
  document.addEventListener('input', () => setTimeout(refreshPatches, 0));
  document.addEventListener('change', () => setTimeout(refreshPatches, 0));
  document.addEventListener('click', () => setTimeout(refreshPatches, 30));
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (document.querySelector('.tabs') && document.getElementById('summary')) {
    clearInterval(timer);
    start();
  }
  if (attempts > 50) clearInterval(timer);
}, 200);
