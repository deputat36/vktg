import { loadData, makeLabels } from '../core/data.js';
import { analyzeDeal } from '../core/engine.js';
import { buildDealPassport } from '../core/dealSchema.js';

const baseDeal = {
  mode: 'Задаток',
  stage: 'Задаток планируется',
  lawyer: 'Рябушкина',
  manager: 'Ковтун',
  representationModel: 'both_sides_two_spn',
  sellerRepresentation: 'our_spn',
  buyerRepresentation: 'our_spn',
  sellerSpn: 'СПН продавца',
  buyerSpn: 'СПН покупателя',
  sellerPhone: '+7 900 000-00-01',
  buyerPhone: '+7 900 000-00-02',
  sellerCount: '1',
  buyerCount: '1',
  sellerMainName: 'Продавец',
  buyerMainName: 'Покупатель',
  objectType: 'Квартира в многоквартирном доме',
  rightForm: 'Весь объект целиком',
  address: 'Борисоглебск, тестовый адрес',
  cadObject: '36:00:0000000:100',
  cadLand: '',
  priceFact: '3500000',
  priceContract: '3500000',
  priceComment: '',
  included: '',
  excluded: '',
  releaseInfo: 'Освобождение по договоренности',
  basis: ['sale'],
  payments: ['cash'],
  settlements: ['safe'],
  certificates: [],
  flags: [],
  bankType: 'Не выбран / не требуется',
  bankInfo: '',
  stEgrn: 'получено',
  stRegistered: 'получено',
  folderLink: 'https://disk.yandex.ru/test',
  questions: '',
  sellerSideComment: '',
  buyerSideComment: '',
  registrationFeeAmount: '4000',
  landRegistrationFeeAmount: '700',
  evaluationCost: '',
  sbrCost: '3400',
  notaryCost: '',
  bankInsuranceCost: '',
  otherCosts: '',
  costsComment: ''
};

const scenarios = [
  {
    id: 'flat_cash',
    title: 'Обычная квартира без ипотеки',
    patch: {},
    expect: { noStop: true, noBroker: true, noManager: true, requiredAbsent: ['порядок расчетов'] }
  },
  {
    id: 'house_land',
    title: 'Дом + земля',
    patch: { objectType: 'Жилой дом + земельный участок', cadLand: '36:00:0000000:200', flags: ['landBoundary'] },
    expect: { nspd: true, docsSellerHas: 'ЕГРН на земельный участок' }
  },
  {
    id: 'land_missing_cad',
    title: 'Дом без кадастрового номера земли',
    patch: { objectType: 'Жилой дом + земельный участок', cadLand: '', flags: ['landBoundary'] },
    expect: { stopHas: 'кадастрового номера земли', requiredHas: 'кадастровый номер земли' }
  },
  {
    id: 'share',
    title: 'Доля',
    patch: { objectType: 'Доля в объекте недвижимости', rightForm: 'Доля в праве / часть объекта', flags: ['shareDeal'] },
    expect: { stopHas: 'Доля', manager: true }
  },
  {
    id: 'mortgage_sber',
    title: 'Ипотека / Сбер / СБР',
    patch: { payments: ['mortgage'], settlements: ['safe'], bankType: 'Сбер / Домклик', bankInfo: 'Одобрение есть', evaluationCost: '4000' },
    expect: { broker: true, bankHas: 'Отчет об оценке' }
  },
  {
    id: 'matcap',
    title: 'Маткапитал',
    patch: { payments: ['matcap'], settlements: ['pensionFund'], certificates: ['matcap'], flags: ['minorBuyer'], buyerSideComment: 'Доли детям после сделки' },
    expect: { broker: true, docsBuyerHas: 'материнского капитала', toHas: 'СФР' }
  },
  {
    id: 'minor_owner',
    title: 'Ребенок собственник',
    patch: { sellerCount: '2', flags: ['minorSeller'], sellerSideComment: 'Один собственник несовершеннолетний' },
    expect: { stopHas: 'Несовершеннолетний собственник', manager: true, opika: true, docsSellerHas: 'Свидетельство о рождении' }
  },
  {
    id: 'child_nominal',
    title: 'Детский номинальный счет',
    patch: { payments: ['nominalChild'], settlements: ['nominalPermission'], certificates: ['nominalChild'], buyerSideComment: 'Покупка за деньги с номинального счета ребенка' },
    expect: { stopHas: 'номинального счета', manager: true, broker: true, docsBuyerHas: 'номинальному счету' }
  },
  {
    id: 'svo_child_money',
    title: 'Средства детей по СВО',
    patch: { payments: ['svoChildAccount'], settlements: ['nominalPermission'], certificates: ['svoChildAccount'], buyerSideComment: 'Используются выплаты на счете ребенка' },
    expect: { stopHas: 'выплаты на счетах детей', manager: true, docsBuyerHas: 'источник средств ребенка' }
  },
  {
    id: 'external_agency',
    title: 'Другое агентство',
    patch: { representationModel: 'external_agency', sellerRepresentation: 'external_agency', buyerRepresentation: 'our_spn', sellerPartnerName: 'АН Партнер' },
    expect: { actionHas: 'другого агентства' }
  },
  {
    id: 'unknown_basis',
    title: 'Основание только из ЕГРН',
    patch: { basis: ['extractOnly'] },
    expect: { stopHas: 'Неясное основание права', requiredHas: 'документ-основание права' }
  },
  {
    id: 'risky_payment',
    title: 'Наличные до регистрации',
    patch: { settlements: ['directBefore', 'cashReceipt'] },
    expect: { warnHas: 'рискованный порядок расчетов', manager: true }
  }
];

function mergeDeal(patch) {
  return { ...baseDeal, ...patch };
}
function contains(list, text) {
  return (list || []).some((item) => String(item).toLowerCase().includes(String(text).toLowerCase()));
}
function assertScenario(result, passport, expect) {
  const checks = [];
  const add = (name, ok, details = '') => checks.push({ name, ok, details });
  if (expect.noStop) add('нет стоп-факторов', result.stop.length === 0, result.stop.join('; '));
  if (expect.stopHas) add('есть нужный стоп-фактор', contains(result.stop, expect.stopHas), result.stop.join('; '));
  if (expect.warnHas) add('есть нужное предупреждение', contains(result.warn, expect.warnHas), result.warn.join('; '));
  if (expect.requiredHas) add('есть нужный недостающий пункт', contains(result.missing, expect.requiredHas), result.missing.join('; '));
  if (expect.requiredAbsent) expect.requiredAbsent.forEach((item) => add('нет лишнего недостающего: ' + item, !contains(result.missing, item), result.missing.join('; ')));
  if (expect.broker) add('подключается брокер', passport.schema.needs.broker === true, JSON.stringify(passport.schema.needs));
  if (expect.noBroker) add('брокер не подключается', passport.schema.needs.broker === false, JSON.stringify(passport.schema.needs));
  if (expect.manager) add('подключается менеджер', passport.schema.needs.manager === true, JSON.stringify(passport.schema.needs));
  if (expect.noManager) add('менеджер не подключается', passport.schema.needs.manager === false, JSON.stringify(passport.schema.needs));
  if (expect.opika) add('подключается опека', passport.schema.needs.opika === true, JSON.stringify(passport.schema.needs));
  if (expect.nspd) add('нужна проверка НСПД', passport.schema.needs.nspd === true, JSON.stringify(passport.schema.needs));
  if (expect.docsSellerHas) add('документы продавца содержат: ' + expect.docsSellerHas, contains(result.docsSeller, expect.docsSellerHas), result.docsSeller.join('; '));
  if (expect.docsBuyerHas) add('документы покупателя содержат: ' + expect.docsBuyerHas, contains(result.docsBuyer, expect.docsBuyerHas), result.docsBuyer.join('; '));
  if (expect.bankHas) add('банк содержит: ' + expect.bankHas, contains(result.bank, expect.bankHas), result.bank.join('; '));
  if (expect.actionHas) add('действия содержат: ' + expect.actionHas, contains(result.actions, expect.actionHas), result.actions.join('; '));
  if (expect.toHas) add('передать содержит: ' + expect.toHas, contains(result.to, expect.toHas), result.to.join('; '));
  add('готовность рассчитана', Number.isFinite(result.ready) && result.ready >= 0 && result.ready <= 100, String(result.ready));
  add('решение есть', Boolean(result.decision), result.decision);
  add('паспорт сделки построен', Boolean(passport.schema && passport.short), JSON.stringify(passport.short));
  return checks;
}
function runOne(data, labels, scenario) {
  const deal = mergeDeal(scenario.patch);
  const result = analyzeDeal(deal, data);
  const passport = buildDealPassport(deal, labels);
  const checks = assertScenario(result, passport, scenario.expect);
  const failed = checks.filter((item) => !item.ok);
  return { scenario, deal, result, passport, checks, ok: failed.length === 0, failed };
}
function statusBadge(row) {
  if (row.ok) return '<span class="test-ok">OK</span>';
  const failedCritical = row.failed.length;
  return `<span class="test-fail">Ошибка: ${failedCritical}</span>`;
}
function renderSummary(rows) {
  const ok = rows.filter((row) => row.ok).length;
  const fail = rows.length - ok;
  const checks = rows.reduce((sum, row) => sum + row.checks.length, 0);
  const failedChecks = rows.reduce((sum, row) => sum + row.failed.length, 0);
  document.getElementById('testSummary').innerHTML = `
    <div class="test-metric"><b>${rows.length}</b><span>сценариев</span></div>
    <div class="test-metric"><b>${ok}</b><span>успешно</span></div>
    <div class="test-metric"><b>${fail}</b><span>с ошибками</span></div>
    <div class="test-metric"><b>${checks - failedChecks}/${checks}</b><span>проверок прошло</span></div>
  `;
}
function renderRows(rows, filter = 'all') {
  const visible = rows.filter((row) => filter === 'all' || (filter === 'ok' ? row.ok : !row.ok));
  document.getElementById('testResults').innerHTML = `
    <table class="test-table">
      <thead><tr><th>Статус</th><th>Сценарий</th><th>Решение</th><th>Проверки</th></tr></thead>
      <tbody>${visible.map((row) => `
        <tr>
          <td>${statusBadge(row)}</td>
          <td><b>${row.scenario.title}</b><br><span class="test-details">${row.scenario.id}</span></td>
          <td class="test-details">${row.result.decision}<br>Готовность: <b>${row.result.ready}%</b><br>Передать: ${row.result.to.join(', ')}</td>
          <td class="test-details">
            ${row.failed.length ? '<b>Ошибки:</b><ul>' + row.failed.map((item) => `<li>${item.name}: ${item.details || 'нет деталей'}</li>`).join('') + '</ul>' : '<span class="test-ok">все проверки прошли</span>'}
            <details><summary>Все проверки</summary><ul>${row.checks.map((item) => `<li>${item.ok ? '✅' : '❌'} ${item.name}${item.details ? ': ' + item.details : ''}</li>`).join('')}</ul></details>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
}
function renderRaw(rows) {
  const failed = rows.filter((row) => !row.ok);
  document.getElementById('testRaw').textContent = JSON.stringify(failed.length ? failed.map((row) => ({ id: row.scenario.id, failed: row.failed, result: { decision: row.result.decision, stop: row.result.stop, warn: row.result.warn, missing: row.result.missing, to: row.result.to } })) : { ok: true, message: 'Ошибок не найдено' }, null, 2);
}
async function runTests() {
  const data = await loadData();
  const labels = makeLabels(data);
  const rows = scenarios.map((scenario) => runOne(data, labels, scenario));
  window.__navTestRows = rows;
  renderSummary(rows);
  renderRows(rows, document.querySelector('.test-filter button.active')?.dataset.filter || 'all');
  renderRaw(rows);
  document.getElementById('testLastRun').textContent = new Date().toLocaleString('ru-RU');
}
function bind() {
  document.getElementById('btnRunTests').onclick = runTests;
  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll('[data-filter]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      renderRows(window.__navTestRows || [], button.dataset.filter);
    };
  });
}

bind();
runTests().catch((error) => {
  document.getElementById('testResults').innerHTML = `<div class="test-section" style="padding:14px"><span class="test-fail">Ошибка запуска</span><pre class="test-code">${String(error.stack || error)}</pre></div>`;
});
