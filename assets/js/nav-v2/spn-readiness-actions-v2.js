const DRAFT_KEY = 'nav_deal_draft_v2';

const stepTitles = [
  'Что готовим',
  'Кого представляем',
  'Объект',
  'Участники',
  'Документы',
  'Деньги',
  'Расчеты',
  'Расходы',
  'Итог'
];

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') || {}; } catch (_) { return {}; }
}

function arr(value) { return Array.isArray(value) ? value : []; }
function filled(value) { return String(value ?? '').trim().length > 0; }
function moneyFilled(value) { return Number(String(value || '').replace(',', '.')) > 0; }

function missingItems(d) {
  const items = [
    { step: 0, title: 'Выбрать цель подготовки: задаток, сделка или консультация', done: filled(d.preparationMode) },
    { step: 1, title: 'Указать, кого представляет компания', done: filled(d.representation) },
    { step: 2, title: 'Выбрать тип объекта', done: filled(d.objectType) },
    { step: 2, title: 'Указать адрес объекта', done: filled(d.address) },
    { step: 2, title: 'Указать цену объекта', done: moneyFilled(d.priceTotal) },
    { step: 2, title: 'Указать сумму задатка/аванса', done: d.preparationMode !== 'deposit' || moneyFilled(d.depositAmount) },
    { step: 3, title: 'Отметить участников и особенности: собственники, дети, супруг, доверенность, доли', done: arr(d.flags).length > 0 || filled(d.sellerPhone) || filled(d.buyerPhone) },
    { step: 4, title: 'Отметить основание права', done: arr(d.basis).length > 0 },
    { step: 5, title: 'Отметить источник денег покупателя', done: arr(d.payments).length > 0 },
    { step: 6, title: 'Выбрать способ расчетов', done: arr(d.settlements).length > 0 },
    { step: 6, title: 'Согласовать порядок расчетов', done: d.settlementsAgreed === true },
    { step: 7, title: 'Согласовать расходы между сторонами', done: d.expensesAgreed === true },
    { step: 8, title: 'Написать комментарий СПН для юриста', done: filled(d.spnFinalComment) },
    { step: 8, title: 'Указать следующий шаг с клиентом', done: filled(d.clientNextStep) }
  ];
  return items.filter((item) => !item.done);
}

function firstMissingStep() {
  const first = missingItems(readDraft())[0];
  return first ? first.step : null;
}

function goToFirstMissing() {
  const step = firstMissingStep();
  if (step === null) return;
  const button = document.querySelector(`.step-pill[data-step="${step}"]`);
  if (button) {
    button.click();
    setTimeout(() => button.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  }
}

function missingText() {
  const items = missingItems(readDraft());
  if (!items.length) return 'Ключевых пробелов в анкете СПН нет.';
  const lines = ['Что нужно дозаполнить в заявке перед юристом/задатком', ''];
  items.forEach((item, index) => lines.push(`${index + 1}. ${stepTitles[item.step]} — ${item.title}`));
  return lines.join('\n');
}

async function copyMissing() {
  const button = document.getElementById('copyAllMissingSpn');
  try {
    await navigator.clipboard.writeText(missingText());
    if (button) {
      button.textContent = 'Скопировано';
      setTimeout(() => button.textContent = 'Скопировать все пробелы', 1500);
    }
  } catch (_) {
    alert('Не удалось скопировать автоматически. Откройте финальный шаг и скопируйте текст передачи вручную.');
  }
}

function findReadinessCard() {
  return [...document.querySelectorAll('aside.steps .card')].find((card) => card.querySelector('h3')?.textContent?.trim() === 'Готовность заявки');
}

function renderActions() {
  const card = findReadinessCard();
  if (!card) return;
  const old = document.getElementById('spnReadinessActions');
  if (old) old.remove();

  const items = missingItems(readDraft());
  const box = document.createElement('div');
  box.id = 'spnReadinessActions';
  box.className = 'actions';
  box.style.justifyContent = 'flex-start';
  box.style.marginTop = '10px';
  box.innerHTML = items.length
    ? '<button id="goFirstMissingSpn" class="btn light" type="button">Перейти к первому пробелу</button><button id="copyAllMissingSpn" class="btn light" type="button">Скопировать все пробелы</button>'
    : '<span class="pill green">Все ключевые пункты заполнены</span>';
  card.appendChild(box);

  document.getElementById('goFirstMissingSpn')?.addEventListener('click', goToFirstMissing);
  document.getElementById('copyAllMissingSpn')?.addEventListener('click', copyMissing);
}

function scheduleRender() {
  window.requestAnimationFrame(renderActions);
}

new MutationObserver(scheduleRender).observe(document.body, { childList: true, subtree: true });
document.addEventListener('input', scheduleRender, true);
document.addEventListener('click', () => setTimeout(renderActions, 0), true);
renderActions();
