import { loadData } from '../core/data.js';
import { analyzeDeal } from '../core/engine.js';
import { getDeal, applyDealPatch } from '../ui/form.js';

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

const REQUIRED_ELEMENTS = [
  ['mode', 'Режим'],
  ['stage', 'Этап'],
  ['sellerSpn', 'СПН продавца'],
  ['buyerSpn', 'СПН покупателя'],
  ['sellerPhone', 'Телефон продавца'],
  ['buyerPhone', 'Телефон покупателя'],
  ['sellerCount', 'Количество продавцов'],
  ['buyerCount', 'Количество покупателей'],
  ['sellerMainName', 'Основной продавец'],
  ['buyerMainName', 'Основной покупатель'],
  ['sellerRealtorCommission', 'Комиссия продавца'],
  ['buyerRealtorCommission', 'Комиссия покупателя'],
  ['registrationFeeAmount', 'Госпошлина'],
  ['evaluationCost', 'Оценка'],
  ['sbrCost', 'СБР'],
  ['objectType', 'Тип объекта'],
  ['rightForm', 'Форма права'],
  ['address', 'Адрес'],
  ['cadObject', 'КН объекта'],
  ['priceFact', 'Фактическая цена'],
  ['priceContract', 'Цена в договоре'],
  ['basisBox', 'Основания'],
  ['paymentsBox', 'Расчет'],
  ['certificatesBox', 'Сертификаты'],
  ['flagsBox', 'Особенности'],
  ['summary', 'Сводка'],
  ['lawyerTab', 'Карточка юристу'],
  ['docs', 'Документы'],
  ['client', 'Клиенту'],
  ['financeSummary', 'Финансы'],
  ['systemAudit', 'Проверка']
];

const DEMO_CASES = [
  {
    title: 'Квартира, наличный/безналичный расчет, 1 продавец, 1 покупатель',
    patch: { objectType: 'Квартира в многоквартирном доме', rightForm: 'Весь объект целиком', address: 'Борисоглебск, ул. Тестовая, 1', cadObject: '36:04:0000000:1111', priceFact: '3500000', priceContract: '3500000', sellerPhone: '+7 900 000-00-01', buyerPhone: '+7 900 000-00-02', sellerCount: '1', buyerCount: '1', sellerMainName: 'Тестовый продавец', buyerMainName: 'Тестовый покупатель', sellerRealtorCommission: '59000', buyerRealtorCommission: '0', totalOfficeCommission: '59000', registrationFeeAmount: '4000', basis: ['sale'], payments: ['accreditive'], certificates: [], flags: [] },
    expected: { maxStop: 0 }
  },
  {
    title: 'Квартира, Сбер + маткапитал',
    patch: { objectType: 'Квартира в многоквартирном доме', rightForm: 'Весь объект целиком', address: 'Борисоглебск, ул. Ипотечная, 2', cadObject: '36:04:0000000:2222', priceFact: '4200000', priceContract: '4200000', sellerPhone: '+7 900 000-00-03', buyerPhone: '+7 900 000-00-04', sellerCount: '1', buyerCount: '2', sellerRealtorCommission: '59000', totalOfficeCommission: '59000', registrationFeeAmount: '4000', evaluationCost: '5000', sbrCost: '3400', bankType: 'Сбер / Домклик', basis: ['sale'], payments: ['mortgage', 'safe'], certificates: ['matcap'], flags: ['spouse'] },
    expected: { mustHaveBank: true }
  },
  {
    title: 'Дом + участок, ипотека',
    patch: { objectType: 'Жилой дом + земельный участок', rightForm: 'Весь объект целиком', address: 'Борисоглебск, ул. Домовая, 3', cadObject: '36:04:0000000:3333', cadLand: '36:04:0000000:3334', priceFact: '6000000', priceContract: '6000000', sellerPhone: '+7 900 000-00-05', buyerPhone: '+7 900 000-00-06', sellerCount: '1', buyerCount: '1', sellerRealtorCommission: '109000', totalOfficeCommission: '109000', registrationFeeAmount: '4000', landRegistrationFeeAmount: '700', evaluationCost: '9000', sbrCost: '3400', bankType: 'Сбер / Домклик', basis: ['sale', 'admin'], payments: ['mortgage', 'safe'], certificates: [], flags: ['landBoundary', 'landUse'] },
    expected: { mustHaveLand: true }
  },
  {
    title: 'Доля в квартире — должен быть стоп-фактор',
    patch: { objectType: 'Квартира в многоквартирном доме', rightForm: 'Доля в праве на квартиру', address: 'Борисоглебск, ул. Долевая, 4', cadObject: '36:04:0000000:4444', priceFact: '900000', priceContract: '900000', sellerPhone: '+7 900 000-00-07', buyerPhone: '+7 900 000-00-08', sellerCount: '1', buyerCount: '1', basis: ['sale'], payments: ['transfer'], certificates: [], flags: ['shareDeal', 'preemptive'] },
    expected: { minStop: 1 }
  },
  {
    title: 'Несовершеннолетний собственник — должен быть стоп-фактор',
    patch: { objectType: 'Квартира в многоквартирном доме', rightForm: 'Весь объект целиком', address: 'Борисоглебск, ул. Опеки, 5', cadObject: '36:04:0000000:5555', priceFact: '3000000', priceContract: '3000000', sellerPhone: '+7 900 000-00-09', buyerPhone: '+7 900 000-00-10', sellerCount: '2', buyerCount: '1', basis: ['sale'], payments: ['transfer'], certificates: [], flags: ['minorSeller'] },
    expected: { minStop: 1 }
  },
  {
    title: 'Военная ипотека / НИС',
    patch: { objectType: 'Квартира в многоквартирном доме', rightForm: 'Весь объект целиком', address: 'Борисоглебск, ул. НИС, 6', cadObject: '36:04:0000000:6666', priceFact: '3800000', priceContract: '3800000', sellerPhone: '+7 900 000-00-11', buyerPhone: '+7 900 000-00-12', sellerCount: '1', buyerCount: '1', bankType: 'Сбер / Домклик', basis: ['sale'], payments: ['mortgage', 'safe'], certificates: ['nis'], flags: [] },
    expected: { mustHaveBank: true }
  }
];

function ensureTab() {
  let page = get('testSuite');
  if (!page) {
    const tabs = document.querySelector('.tabs');
    const result = document.querySelector('.result');
    if (!tabs || !result) return false;

    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.dataset.tab = 'testSuite';
    btn.textContent = 'Тесты';
    btn.id = 'testSuiteTabButton';
    tabs.appendChild(btn);

    page = document.createElement('div');
    page.id = 'testSuite';
    page.className = 'tabpage';
    result.appendChild(page);

    btn.addEventListener('click', () => activateTestsTab());
  }

  if (!page.innerHTML.trim()) renderHome();
  return true;
}

function activateTestsTab() {
  ensureTab();
  document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
  document.querySelectorAll('.tabpage').forEach((item) => item.classList.remove('active'));
  const btn = document.querySelector('[data-tab="testSuite"]');
  const page = get('testSuite');
  btn?.classList.add('active');
  page?.classList.add('active');
  renderHome();
}

function row(ok, name, comment) {
  return `<tr><td>${ok ? '✅' : '❌'}</td><td>${esc(name)}</td><td>${esc(comment || '')}</td></tr>`;
}

function renderHome() {
  const page = get('testSuite');
  if (!page) return;
  page.innerHTML = `
    <h2>Тестовый режим</h2>
    <div class="box blue">
      <p>Тесты проверяют интерфейс, заполнение формы, анализ рисков, сохранение восстановленных полей сторон/финансов и работу ключевых вкладок. Тесты не сохраняют данные в Supabase.</p>
      <div class="actions" style="justify-content:flex-start">
        <button id="btnRunAllTests" class="green" type="button">Проверить все сценарии</button>
        <button id="btnRunUiTests" class="light" type="button">Проверить интерфейс</button>
      </div>
    </div>
    <div id="testSuiteResults"></div>
  `;
  get('btnRunAllTests').onclick = runAllTests;
  get('btnRunUiTests').onclick = runUiTests;
}

async function runUiTests() {
  const results = REQUIRED_ELEMENTS.map(([id, name]) => [Boolean(get(id)), name, get(id) ? 'Найдено' : 'Не найдено']);
  showResults('Проверка интерфейса', results);
}

async function runAllTests() {
  const data = await loadData();
  const results = [];

  REQUIRED_ELEMENTS.forEach(([id, name]) => {
    results.push([Boolean(get(id)), 'Интерфейс: ' + name, get(id) ? 'ОК' : 'Не найден элемент #' + id]);
  });

  for (const testCase of DEMO_CASES) {
    try {
      applyDealPatch(testCase.patch);
      document.querySelector('input,select,textarea')?.dispatchEvent(new Event('input', { bubbles: true }));
      const deal = getDeal();
      const analysis = analyzeDeal(deal, data);

      const savedFieldsOk = checkSavedFields(deal, testCase.patch);
      results.push([savedFieldsOk.ok, testCase.title + ': поля сохранились в getDeal()', savedFieldsOk.comment]);

      if (testCase.expected?.minStop !== undefined) {
        results.push([analysis.stop.length >= testCase.expected.minStop, testCase.title + ': стоп-фактор', 'Стоп-факторов: ' + analysis.stop.length]);
      }
      if (testCase.expected?.maxStop !== undefined) {
        results.push([analysis.stop.length <= testCase.expected.maxStop, testCase.title + ': без лишних стоп-факторов', 'Стоп-факторов: ' + analysis.stop.length]);
      }
      if (testCase.expected?.mustHaveBank) {
        results.push([analysis.bank.length > 0, testCase.title + ': банковские документы', 'Банк-документов: ' + analysis.bank.length]);
      }
      if (testCase.expected?.mustHaveLand) {
        results.push([analysis.docsSeller.some((item) => String(item).toLowerCase().includes('зем')), testCase.title + ': документы по земле', analysis.docsSeller.join('; ')]);
      }
      results.push([Boolean(analysis.decision), testCase.title + ': решение сформировано', analysis.decision]);
    } catch (error) {
      results.push([false, testCase.title, error.message]);
    }
  }

  showResults('Полная проверка сценариев', results);
}

function checkSavedFields(deal, patch) {
  const important = ['sellerCount', 'buyerCount', 'sellerPhone', 'buyerPhone', 'sellerRealtorCommission', 'registrationFeeAmount', 'objectType', 'rightForm', 'priceFact', 'priceContract'];
  const missing = important.filter((key) => patch[key] !== undefined && String(deal[key] || '') !== String(patch[key] || ''));
  return {
    ok: missing.length === 0,
    comment: missing.length ? 'Не совпали поля: ' + missing.join(', ') : 'Ключевые поля сохранены'
  };
}

function showResults(title, results) {
  const target = get('testSuiteResults');
  if (!target) return;
  const ok = results.filter((item) => item[0]).length;
  const total = results.length;
  const failed = total - ok;
  target.innerHTML = `
    <div class="box ${failed ? 'orangeBox' : 'greenBox'}">
      <h3>${esc(title)}</h3>
      <p><b>${ok}/${total}</b> проверок успешно. Ошибок/предупреждений: <b>${failed}</b>.</p>
      <table><tr><th></th><th>Проверка</th><th>Комментарий</th></tr>${results.map((item) => row(item[0], item[1], item[2])).join('')}</table>
    </div>
  `;
}

function start() {
  ensureTab();
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-tab="testSuite"]');
    if (!btn) return;
    setTimeout(activateTestsTab, 0);
  }, true);
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (document.querySelector('.tabs') && get('summary')) {
    clearInterval(timer);
    start();
  }
  if (attempts > 50) clearInterval(timer);
}, 200);
