import { loadData } from '../core/data.js';
import { analyzeDeal } from '../core/engine.js';
import { normalizeDeal } from '../core/dealSchema.js';
import { getDeal, applyDealPatch } from '../ui/form.js';

function get(id) { return document.getElementById(id); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function hasText(list, text) { return (list || []).some((item) => String(item).toLowerCase().includes(text.toLowerCase())); }

const REQUIRED_ELEMENTS = [
  ['mode', 'Режим'], ['stage', 'Этап'], ['sellerSpn', 'СПН продавца'], ['buyerSpn', 'СПН покупателя'], ['sellerPhone', 'Телефон продавца'], ['buyerPhone', 'Телефон покупателя'],
  ['sellerCount', 'Количество продавцов'], ['buyerCount', 'Количество покупателей'], ['sellerMainName', 'Основной продавец'], ['buyerMainName', 'Основной покупатель'],
  ['sellerRealtorCommission', 'Комиссия продавца'], ['buyerRealtorCommission', 'Комиссия покупателя'], ['registrationFeeAmount', 'Госпошлина'], ['evaluationCost', 'Оценка'], ['sbrCost', 'СБР'],
  ['objectType', 'Тип объекта'], ['rightForm', 'Форма права'], ['address', 'Адрес'], ['cadObject', 'КН объекта'], ['priceFact', 'Фактическая цена'], ['priceContract', 'Цена в договоре'],
  ['basisBox', 'Основания'], ['paymentsBox', 'Источники денег'], ['settlementsBox', 'Порядок расчетов'], ['certificatesBox', 'Сертификаты'], ['flagsBox', 'Особенности'],
  ['summary', 'Сводка'], ['now', 'Что сейчас'], ['lawyerTab', 'Карточка юристу'], ['broker', 'Брокеру'], ['docs', 'Документы'], ['client', 'Клиенту'], ['financeSummary', 'Финансы']
];

const WIZARD_ELEMENTS = [
  ['smartDealIntake', 'Умное заполнение'], ['smartWizardShell', 'Пошаговый мастер'], ['smartWizardTitle', 'Заголовок шага'], ['smartWizardProgress', 'Прогресс мастера'], ['btnSmartWizardPrev', 'Назад'], ['btnSmartWizardNext', 'Далее'], ['smartNeededDetails', 'Нужные уточнения']
];

const DEMO_CASES = [
  {
    title: 'Обычная квартира, безопасный расчет',
    patch: { objectType: 'Квартира в многоквартирном доме', rightForm: 'Весь объект целиком', address: 'Борисоглебск, ул. Тестовая, 1', cadObject: '36:04:0000000:1111', priceFact: '3500000', priceContract: '3500000', sellerPhone: '+7 900 000-00-01', buyerPhone: '+7 900 000-00-02', sellerCount: '1', buyerCount: '1', sellerMainName: 'Тестовый продавец', buyerMainName: 'Тестовый покупатель', sellerRealtorCommission: '59000', buyerRealtorCommission: '0', totalOfficeCommission: '59000', registrationFeeAmount: '4000', basis: ['sale'], payments: ['transfer'], settlements: ['accreditive'], certificates: [], flags: [], stEgrn: 'получено', stRegistered: 'получено', folderLink: 'https://disk.yandex.ru/test' },
    expected: { maxStop: 0, settlementSafe: true, requiredMax: 1 }
  },
  {
    title: 'Квартира, ипотека Сбер + маткапитал',
    patch: { objectType: 'Квартира в многоквартирном доме', rightForm: 'Весь объект целиком', address: 'Борисоглебск, ул. Ипотечная, 2', cadObject: '36:04:0000000:2222', priceFact: '4200000', priceContract: '4200000', sellerPhone: '+7 900 000-00-03', buyerPhone: '+7 900 000-00-04', sellerCount: '1', buyerCount: '2', sellerRealtorCommission: '59000', totalOfficeCommission: '59000', registrationFeeAmount: '4000', evaluationCost: '5000', sbrCost: '3400', bankType: 'Сбер / Домклик', basis: ['sale'], payments: ['mortgage', 'matcap'], settlements: ['safe', 'pensionFund'], certificates: ['matcap'], flags: ['spouse', 'minorBuyer'], stEgrn: 'получено', stRegistered: 'получено', folderLink: 'https://disk.yandex.ru/test' },
    expected: { mustHaveBank: true, hasChildren: true, broker: true, docBuyerText: 'материнского' }
  },
  {
    title: 'Дом + участок, ипотека',
    patch: { objectType: 'Жилой дом + земельный участок', rightForm: 'Весь объект целиком', address: 'Борисоглебск, ул. Домовая, 3', cadObject: '36:04:0000000:3333', cadLand: '36:04:0000000:3334', priceFact: '6000000', priceContract: '6000000', sellerPhone: '+7 900 000-00-05', buyerPhone: '+7 900 000-00-06', sellerCount: '1', buyerCount: '1', sellerRealtorCommission: '109000', totalOfficeCommission: '109000', registrationFeeAmount: '4000', landRegistrationFeeAmount: '700', evaluationCost: '9000', sbrCost: '3400', bankType: 'Сбер / Домклик', basis: ['sale', 'admin'], payments: ['mortgage'], settlements: ['safe'], certificates: [], flags: ['landBoundary', 'landUse'], stEgrn: 'получено', stRegistered: 'получено', folderLink: 'https://disk.yandex.ru/test' },
    expected: { mustHaveLand: true, nspd: true, broker: true }
  },
  {
    title: 'Доля в квартире',
    patch: { objectType: 'Квартира в многоквартирном доме', rightForm: 'Доля в праве на квартиру', address: 'Борисоглебск, ул. Долевая, 4', cadObject: '36:04:0000000:4444', priceFact: '900000', priceContract: '900000', sellerPhone: '+7 900 000-00-07', buyerPhone: '+7 900 000-00-08', sellerCount: '1', buyerCount: '1', basis: ['sale'], payments: ['transfer'], settlements: ['accreditive'], certificates: [], flags: ['shareDeal', 'preemptive'], stEgrn: 'получено', stRegistered: 'получено', folderLink: 'https://disk.yandex.ru/test' },
    expected: { minStop: 1, manager: true }
  },
  {
    title: 'Несовершеннолетний собственник',
    patch: { objectType: 'Квартира в многоквартирном доме', rightForm: 'Весь объект целиком', address: 'Борисоглебск, ул. Опеки, 5', cadObject: '36:04:0000000:5555', priceFact: '3000000', priceContract: '3000000', sellerPhone: '+7 900 000-00-09', buyerPhone: '+7 900 000-00-10', sellerCount: '2', buyerCount: '1', basis: ['sale'], payments: ['transfer'], settlements: ['accreditive'], certificates: [], flags: ['minorSeller'], stEgrn: 'получено', stRegistered: 'получено', folderLink: 'https://disk.yandex.ru/test' },
    expected: { minStop: 1, hasChildren: true, opika: true, docSellerText: 'ребенка' }
  },
  {
    title: 'Детский номинальный счет / СВО-средства',
    patch: { objectType: 'Квартира в многоквартирном доме', rightForm: 'Весь объект целиком', address: 'Борисоглебск, ул. Детская, 6', cadObject: '36:04:0000000:6666', priceFact: '3600000', priceContract: '3600000', sellerPhone: '+7 900 000-00-11', buyerPhone: '+7 900 000-00-12', sellerCount: '1', buyerCount: '2', basis: ['sale'], payments: ['nominalChild', 'svoChildAccount'], settlements: ['nominalPermission'], certificates: ['nominalChild', 'svoChildAccount'], flags: ['minorBuyer'], stEgrn: 'получено', stRegistered: 'получено', folderLink: 'https://disk.yandex.ru/test' },
    expected: { minStop: 1, hasChildren: true, childMoney: true, manager: true, docBuyerText: 'номинальному' }
  },
  {
    title: 'Неизвестное основание права',
    patch: { objectType: 'Квартира в многоквартирном доме', rightForm: 'Весь объект целиком', address: 'Борисоглебск, ул. Неясная, 7', cadObject: '36:04:0000000:7777', priceFact: '3100000', priceContract: '3100000', sellerPhone: '+7 900 000-00-13', buyerPhone: '+7 900 000-00-14', sellerCount: '1', buyerCount: '1', basis: ['extractOnly'], payments: ['transfer'], settlements: ['safe'], certificates: [], flags: [], stEgrn: 'получено', stRegistered: 'получено', folderLink: 'https://disk.yandex.ru/test' },
    expected: { minStop: 1, requiredText: 'документ-основание' }
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
  document.querySelector('[data-tab="testSuite"]')?.classList.add('active');
  get('testSuite')?.classList.add('active');
  renderHome();
}

function row(ok, name, comment) { return `<tr><td>${ok ? '✅' : '❌'}</td><td>${esc(name)}</td><td>${esc(comment || '')}</td></tr>`; }

function renderHome() {
  const page = get('testSuite');
  if (!page) return;
  page.innerHTML = `
    <h2>Тестовый режим</h2>
    <div class="box blue">
      <p>Тесты проверяют интерфейс, пошаговый мастер, паспорт сделки, источники денег, порядок расчетов, детские сценарии, документы, юриста, брокера и финансы. Данные в Supabase не сохраняются.</p>
      <div class="actions" style="justify-content:flex-start">
        <button id="btnRunAllTests" class="green" type="button">Проверить все сценарии</button>
        <button id="btnRunUiTests" class="light" type="button">Проверить интерфейс</button>
        <button id="btnRunWizardTests" class="light" type="button">Проверить мастер</button>
      </div>
    </div>
    <div id="testSuiteResults"></div>
  `;
  get('btnRunAllTests').onclick = runAllTests;
  get('btnRunUiTests').onclick = runUiTests;
  get('btnRunWizardTests').onclick = runWizardTests;
}

async function runUiTests() {
  const results = REQUIRED_ELEMENTS.map(([id, name]) => [Boolean(get(id)), name, get(id) ? 'Найдено' : 'Не найдено #' + id]);
  showResults('Проверка интерфейса', results);
}

async function runWizardTests() {
  const results = WIZARD_ELEMENTS.map(([id, name]) => [Boolean(get(id)), name, get(id) ? 'Найдено' : 'Не найдено #' + id]);
  const stages = [...document.querySelectorAll('#smartDealIntake .smart-stage'), get('smartNeededDetails')].filter(Boolean);
  results.push([stages.length >= 10, 'Количество шагов мастера', 'Найдено шагов: ' + stages.length]);
  results.push([document.body.dataset.smartWizard === '1' || Boolean(get('smartWizardShell')), 'Пошаговый режим доступен', 'data-smart-wizard=' + (document.body.dataset.smartWizard || 'не установлен')]);
  showResults('Проверка пошагового мастера', results);
}

async function runAllTests() {
  const data = await loadData();
  const results = [];
  REQUIRED_ELEMENTS.forEach(([id, name]) => results.push([Boolean(get(id)), 'Интерфейс: ' + name, get(id) ? 'ОК' : 'Не найден элемент #' + id]));
  WIZARD_ELEMENTS.forEach(([id, name]) => results.push([Boolean(get(id)), 'Мастер: ' + name, get(id) ? 'ОК' : 'Не найден элемент #' + id]));

  for (const testCase of DEMO_CASES) {
    try {
      applyDealPatch(testCase.patch);
      const deal = getDeal();
      const schema = normalizeDeal(deal);
      const analysis = analyzeDeal(deal, data);
      const savedFieldsOk = checkSavedFields(deal, testCase.patch);
      results.push([savedFieldsOk.ok, testCase.title + ': поля сохранились', savedFieldsOk.comment]);
      runExpectations(results, testCase, analysis, schema);
      results.push([Boolean(analysis.decision), testCase.title + ': решение сформировано', analysis.decision]);
      results.push([Array.isArray(analysis.docsSeller) && analysis.docsSeller.length > 0, testCase.title + ': документы продавца', 'Документов: ' + analysis.docsSeller.length]);
      results.push([Array.isArray(analysis.docsBuyer) && analysis.docsBuyer.length > 0, testCase.title + ': документы покупателя', 'Документов: ' + analysis.docsBuyer.length]);
    } catch (error) {
      results.push([false, testCase.title, error.message]);
    }
  }
  showResults('Полная проверка сценариев', results);
}

function runExpectations(results, testCase, analysis, schema) {
  const e = testCase.expected || {};
  if (e.minStop !== undefined) results.push([analysis.stop.length >= e.minStop, testCase.title + ': стоп-фактор', 'Стоп-факторов: ' + analysis.stop.length]);
  if (e.maxStop !== undefined) results.push([analysis.stop.length <= e.maxStop, testCase.title + ': без лишних стоп-факторов', 'Стоп-факторов: ' + analysis.stop.length]);
  if (e.requiredMax !== undefined) results.push([analysis.missing.length <= e.requiredMax, testCase.title + ': минимум заполнен', 'Не хватает: ' + analysis.missing.length]);
  if (e.requiredText) results.push([hasText(analysis.missing, e.requiredText), testCase.title + ': недостающее поле ' + e.requiredText, analysis.missing.join('; ')]);
  if (e.mustHaveBank) results.push([analysis.bank.length > 0, testCase.title + ': банковские документы', 'Банк-документов: ' + analysis.bank.length]);
  if (e.mustHaveLand) results.push([hasText(analysis.docsSeller, 'земель'), testCase.title + ': документы по земле', analysis.docsSeller.join('; ')]);
  if (e.nspd) results.push([schema.needs.nspd === true, testCase.title + ': требуется НСПД', String(schema.needs.nspd)]);
  if (e.broker) results.push([schema.needs.broker === true, testCase.title + ': подключается брокер', String(schema.needs.broker)]);
  if (e.manager) results.push([schema.needs.manager === true, testCase.title + ': подключается менеджер', String(schema.needs.manager)]);
  if (e.opika) results.push([schema.needs.opika === true, testCase.title + ': требуется опека', String(schema.needs.opika)]);
  if (e.hasChildren) results.push([schema.owners.hasChildren === true, testCase.title + ': дети определены', String(schema.owners.hasChildren)]);
  if (e.childMoney) results.push([schema.money.hasChildMoney === true, testCase.title + ': детские деньги определены', String(schema.money.hasChildMoney)]);
  if (e.settlementSafe) results.push([schema.money.safeSettlement === true, testCase.title + ': безопасный расчет определен', String(schema.money.safeSettlement)]);
  if (e.docSellerText) results.push([hasText(analysis.docsSeller, e.docSellerText), testCase.title + ': документ продавца содержит ' + e.docSellerText, analysis.docsSeller.join('; ')]);
  if (e.docBuyerText) results.push([hasText(analysis.docsBuyer, e.docBuyerText), testCase.title + ': документ покупателя содержит ' + e.docBuyerText, analysis.docsBuyer.join('; ')]);
}

function checkSavedFields(deal, patch) {
  const important = ['sellerCount', 'buyerCount', 'sellerPhone', 'buyerPhone', 'sellerRealtorCommission', 'registrationFeeAmount', 'objectType', 'rightForm', 'priceFact', 'priceContract'];
  const missing = important.filter((key) => patch[key] !== undefined && String(deal[key] || '') !== String(patch[key] || ''));
  const listFields = ['basis', 'payments', 'settlements', 'certificates', 'flags'];
  listFields.forEach((key) => {
    if (!patch[key]) return;
    const expected = [...patch[key]].sort().join('|');
    const actual = [...(deal[key] || [])].sort().join('|');
    if (expected !== actual) missing.push(key);
  });
  return { ok: missing.length === 0, comment: missing.length ? 'Не совпали поля: ' + missing.join(', ') : 'Ключевые поля сохранены' };
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
  if (attempts > 80) clearInterval(timer);
}, 200);
