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
    ['Карточка юристу + финансы', Boolean(String(get('lawyerTab')?.innerHTML || '').includes('Стороны / комиссии / расходы для юриста')), 'Финансовая часть теперь отрисовывается в ui/render.js'],
    ['Сводка + стороны и деньги', Boolean(String(get('summary')?.innerHTML || '').includes('Стороны и деньги')), 'Блок теперь отрисовывается в ui/render.js'],
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

function start() {
  ensureAuditTab();
  renderAudit();
  document.addEventListener('input', () => setTimeout(renderAudit, 0));
  document.addEventListener('change', () => setTimeout(renderAudit, 0));
  document.addEventListener('click', () => setTimeout(renderAudit, 30));
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
