const DRAFT_KEY = 'nav_deal_draft_v2';
const TARGET_URL = './spn-v2.html?test=20260617-88';

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
  }
});
