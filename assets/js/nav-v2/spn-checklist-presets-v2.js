const DRAFT_KEY = 'nav_deal_draft_v2';
const RESULTS_KEY = 'nav_spn_wizard_test_results_v2';
const TARGET_URL = './spn-v2.html?test=20260617-89';

const scenarioTitles = {
  simple_flat: 'Сценарий 1. Простая квартира',
  house_land: 'Сценарий 2. Дом с участком',
  share_house: 'Сценарий 3. Доля / часть дома',
  matcap_minor: 'Сценарий 4. Маткапитал / ребёнок-покупатель',
  post_registration: 'Сценарий 5. Расчёт после регистрации'
};

const scenarios = {
  simple_flat: {
    preparationMode: 'deposit',
    representation: 'one_spn_both',
    stage: 'terms_discussed',
    hasSeller: true,
    hasBuyer: true,
    objectType: 'flat_mkd',
    objectCategory: 'flat',
    apartmentKind: 'flat_mkd',
    address: 'Тест: простая квартира',
    priceTotal: '3500000',
    depositAmount: '50000',
    flags: ['oneAdultSeller'],
    basis: ['sale'],
    buyerMode: 'one',
    payments: ['cash'],
    priceAgreed: true,
    settlementsAgreed: true,
    expensesAgreed: true,
    clientNextStep: 'Проверить стандартные документы и назначить задаток.',
    spnFinalComment: 'Тестовый сценарий: простая квартира без сложных рисков.'
  },
  house_land: {
    preparationMode: 'deposit',
    representation: 'seller',
    stage: 'object_chosen',
    hasSeller: true,
    hasBuyer: false,
    objectType: 'house_land',
    objectCategory: 'house_land',
    address: 'Тест: дом с участком',
    priceTotal: '5200000',
    houseArea: '95',
    landArea: '8 соток',
    landCategory: 'земли населённых пунктов',
    landUse: 'ИЖС',
    flags: ['oneAdultSeller'],
    basis: ['sale'],
    priceAgreed: true,
    clientNextStep: 'Проверить документы на дом и землю.',
    objectComment: 'Тест: проверить, что кадастровые номера дома и земли находятся в блоке для юриста.'
  },
  share_house: {
    preparationMode: 'check_docs',
    representation: 'seller',
    stage: 'legal_problem',
    hasSeller: true,
    hasBuyer: false,
    objectType: 'house_land',
    objectCategory: 'house_land',
    legalForm: 'share',
    shareSale: true,
    shareBaseObject: 'house_land',
    address: 'Тест: доля в доме',
    priceTotal: '2500000',
    flags: ['shares'],
    basis: ['sale'],
    shareSize: '1/2',
    shareSeparateEntrance: 'yes',
    shareSeparateYard: 'yes',
    shareUseOrder: 'fact',
    priceAgreed: true,
    lawyerCheckedBeforeDeposit: false,
    clientNextStep: 'Передать юристу условия доли и порядок пользования.',
    riskComment: 'Тест: доля должна быть юридической формой, а не отдельным типом недвижимости.'
  },
  matcap_minor: {
    preparationMode: 'deposit',
    representation: 'buyer',
    stage: 'terms_discussed',
    hasSeller: false,
    hasBuyer: true,
    objectType: 'flat_mkd',
    objectCategory: 'flat',
    apartmentKind: 'flat_mkd',
    address: 'Тест: покупатель с маткапиталом',
    priceTotal: '4200000',
    buyerMode: 'multiple',
    flags: ['minorBuyer'],
    payments: ['mortgage', 'matcap'],
    bankName: 'Тестовый банк',
    mortgageApproved: 'в процессе',
    matcapOwner: 'мама',
    priceAgreed: true,
    settlementsAgreed: false,
    expensesAgreed: false,
    clientNextStep: 'Подключить брокера и юриста до задатка.',
    moneyComment: 'Тест: итог должен подсказать юриста и брокера.'
  },
  post_registration: {
    preparationMode: 'deposit',
    representation: 'one_spn_both',
    stage: 'urgent_deposit',
    hasSeller: true,
    hasBuyer: true,
    objectType: 'flat_mkd',
    objectCategory: 'flat',
    apartmentKind: 'flat_mkd',
    address: 'Тест: расчёт после регистрации',
    priceTotal: '3900000',
    depositAmount: '70000',
    flags: ['oneAdultSeller'],
    basis: ['sale'],
    buyerMode: 'one',
    payments: ['certificate'],
    settlements: ['afterRegistration', 'pensionFund'],
    priceAgreed: true,
    settlementsAgreed: false,
    expensesAgreed: true,
    postRegistrationAmount: '600000',
    postRegistrationDeadline: 'до 30 дней после регистрации',
    clientNextStep: 'Согласовать защиту продавца по сумме после регистрации.',
    settlementsComment: 'Тест: финальный экран должен показать риск оплаты после регистрации.'
  }
};

function readResults() {
  try { return JSON.parse(localStorage.getItem(RESULTS_KEY) || '{}'); } catch (_) { return {}; }
}

function saveResults(results) {
  localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
}

function runScenario(key) {
  const scenario = scenarios[key];
  if (!scenario) return;
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...scenario, testScenario: key, createdFromChecklist: true }));
  window.location.href = TARGET_URL;
}

function clearScenario() {
  localStorage.removeItem(DRAFT_KEY);
  window.location.href = TARGET_URL;
}

function resultBlock(key) {
  const results = readResults();
  const item = results[key] || {};
  const status = item.status || '';
  const comment = item.comment || '';
  return `<div class="card" style="box-shadow:none;margin-top:12px" data-result-block="${key}">
    <h4>Результат проверки</h4>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn ${status === 'ok' ? 'green' : 'light'}" type="button" data-result-status="ok" data-result-key="${key}">ОК</button>
      <button class="btn ${status === 'problem' ? 'primary' : 'light'}" type="button" data-result-status="problem" data-result-key="${key}">Есть проблема</button>
      <button class="btn light" type="button" data-result-status="clear" data-result-key="${key}">Сбросить</button>
    </div>
    <div class="field" style="margin-top:10px">
      <label>Комментарий по сценарию</label>
      <textarea data-result-comment="${key}" placeholder="Что лишнее, что не появилось, что непонятно?">${escapeHtml(comment)}</textarea>
    </div>
  </div>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function enhanceScenarioCards() {
  Object.keys(scenarioTitles).forEach((key) => {
    const button = document.querySelector(`[data-preset="${key}"]`);
    const card = button?.closest?.('.deal-card');
    if (!card || card.querySelector(`[data-result-block="${key}"]`)) return;
    card.insertAdjacentHTML('beforeend', resultBlock(key));
  });
}

function reportText() {
  const results = readResults();
  const lines = ['Отчёт по проверке мастера СПН', ''];
  Object.entries(scenarioTitles).forEach(([key, title]) => {
    const item = results[key] || {};
    const statusText = item.status === 'ok' ? 'ОК' : item.status === 'problem' ? 'Есть проблема' : 'Не проверено';
    lines.push(`${title}: ${statusText}`);
    if (item.comment) lines.push(`Комментарий: ${item.comment}`);
    lines.push('');
  });
  return lines.join('\n').trim();
}

function injectReportPanel() {
  const main = document.querySelector('main.nav-v2-shell');
  const marker = document.getElementById('checklistReportPanel');
  if (!main || marker) return;
  main.insertAdjacentHTML('beforeend', `<section class="card" id="checklistReportPanel">
    <h2>Итоговый отчёт по проверке</h2>
    <p class="muted">После прохождения сценариев можно скопировать общий отчёт и отправить его в работу.</p>
    <div class="field"><label>Отчёт</label><textarea id="checklistReportText" readonly style="min-height:190px">${escapeHtml(reportText())}</textarea></div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn primary" type="button" data-copy-report="1">Скопировать отчёт</button>
      <button class="btn light" type="button" data-clear-results="1">Очистить результаты</button>
    </div>
  </section>`);
}

function refreshReport() {
  const report = document.getElementById('checklistReportText');
  if (report) report.value = reportText();
}

function setResult(key, status) {
  const results = readResults();
  if (status === 'clear') delete results[key];
  else results[key] = { ...(results[key] || {}), status, updated_at: new Date().toISOString() };
  saveResults(results);
  location.reload();
}

function setComment(key, comment) {
  const results = readResults();
  results[key] = { ...(results[key] || {}), comment, updated_at: new Date().toISOString() };
  saveResults(results);
  refreshReport();
}

document.addEventListener('click', (event) => {
  const presetButton = event.target.closest('[data-preset]');
  if (presetButton) {
    event.preventDefault();
    runScenario(presetButton.dataset.preset);
    return;
  }

  const clearButton = event.target.closest('[data-clear-draft]');
  if (clearButton) {
    event.preventDefault();
    clearScenario();
    return;
  }

  const resultButton = event.target.closest('[data-result-status]');
  if (resultButton) {
    event.preventDefault();
    setResult(resultButton.dataset.resultKey, resultButton.dataset.resultStatus);
    return;
  }

  const copyReport = event.target.closest('[data-copy-report]');
  if (copyReport) {
    event.preventDefault();
    navigator.clipboard?.writeText(reportText()).then(() => {
      copyReport.textContent = 'Отчёт скопирован';
      setTimeout(() => { copyReport.textContent = 'Скопировать отчёт'; }, 1500);
    });
    return;
  }

  const clearResults = event.target.closest('[data-clear-results]');
  if (clearResults) {
    event.preventDefault();
    if (confirm('Очистить результаты проверки?')) {
      localStorage.removeItem(RESULTS_KEY);
      location.reload();
    }
  }
});

document.addEventListener('input', (event) => {
  const comment = event.target.closest('[data-result-comment]');
  if (!comment) return;
  setComment(comment.dataset.resultComment, comment.value);
});

enhanceScenarioCards();
injectReportPanel();
refreshReport();
