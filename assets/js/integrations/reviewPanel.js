import { listDealReviews, addDealReview, REVIEW_DECISIONS, REVIEW_ROLES } from './reviews.js';

let currentDealId = null;
let currentDealTitle = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function ensureTab() {
  if (document.getElementById('dealReviews')) return;
  const tabs = document.querySelector('.tabs');
  const result = document.querySelector('.result');
  if (!tabs || !result) return;

  const btn = document.createElement('button');
  btn.className = 'tab';
  btn.dataset.tab = 'dealReviews';
  btn.textContent = 'Решения';
  tabs.appendChild(btn);

  const page = document.createElement('div');
  page.id = 'dealReviews';
  page.className = 'tabpage';
  page.innerHTML = '<h2>Решения по сделке</h2><div id="reviewPanelBody" class="box blue">Откройте сделку из Supabase, чтобы добавить решение юриста, брокера или менеджера.</div>';
  result.appendChild(page);

  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    document.querySelectorAll('.tabpage').forEach((item) => item.classList.remove('active'));
    btn.classList.add('active');
    page.classList.add('active');
    renderPanel();
  };
}

function decisionLabel(value) {
  return (REVIEW_DECISIONS.find((item) => item[0] === value) || [value, value])[1];
}

function roleLabel(value) {
  return (REVIEW_ROLES.find((item) => item[0] === value) || [value, value])[1];
}

async function renderPanel() {
  const body = document.getElementById('reviewPanelBody');
  if (!body) return;

  if (!currentDealId) {
    body.className = 'box blue';
    body.innerHTML = 'Откройте сделку из Supabase, чтобы добавить решение юриста, брокера или менеджера.';
    return;
  }

  body.className = 'box blue';
  body.innerHTML = '<p>Загрузка решений...</p>';

  try {
    const items = await listDealReviews(currentDealId);
    body.innerHTML = `
      <h3>${esc(currentDealTitle || 'Открытая сделка')}</h3>
      <div class="row">
        <label>Кто оставляет решение
          <select id="reviewRole">${REVIEW_ROLES.map((item) => `<option value="${item[0]}">${esc(item[1])}</option>`).join('')}</select>
        </label>
        <label>Решение
          <select id="reviewDecision">${REVIEW_DECISIONS.map((item) => `<option value="${item[0]}">${esc(item[1])}</option>`).join('')}</select>
        </label>
      </div>
      <label>Комментарий / что нужно сделать
        <textarea id="reviewComment" placeholder="Например: нужна свежая ЕГРН с ЭЦП, справка о зарегистрированных, уточнить порядок расчетов..."></textarea>
      </label>
      <button id="btnAddReview" class="green">Добавить решение</button>
      <h3>История решений</h3>
      ${items.length ? renderReviews(items) : '<div class="box grayBox">Решений пока нет.</div>'}
    `;

    document.getElementById('btnAddReview').onclick = async () => {
      try {
        await addDealReview(
          currentDealId,
          document.getElementById('reviewRole').value,
          document.getElementById('reviewDecision').value,
          document.getElementById('reviewComment').value
        );
        document.getElementById('reviewComment').value = '';
        await renderPanel();
        alert('Решение добавлено');
      } catch (error) {
        alert('Ошибка добавления решения: ' + error.message);
      }
    };
  } catch (error) {
    body.className = 'box redBox';
    body.innerHTML = 'Ошибка загрузки решений: ' + esc(error.message);
  }
}

function renderReviews(items) {
  return '<table><tr><th>Дата</th><th>Роль</th><th>Решение</th><th>Комментарий</th></tr>' +
    items.map((item) => '<tr><td>' + new Date(item.created_at).toLocaleString('ru-RU') + '</td><td>' + esc(roleLabel(item.reviewer_role)) + '</td><td>' + esc(decisionLabel(item.decision)) + '</td><td>' + esc(item.comment || '—') + '</td></tr>').join('') +
    '</table>';
}

function start() {
  ensureTab();
  window.addEventListener('navigatorDealOpened', (event) => {
    currentDealId = event.detail?.id || null;
    currentDealTitle = event.detail?.title || null;
    renderPanel();
  });
  window.addEventListener('navigatorDealSaved', (event) => {
    currentDealId = event.detail?.id || currentDealId;
    currentDealTitle = event.detail?.title || currentDealTitle;
    renderPanel();
  });
}

start();
