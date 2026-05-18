import { $, esc } from '../core/utils.js';

export function fillSelect(id, values) {
  $(id).innerHTML = values.map((value) => `<option>${esc(value)}</option>`).join('');
}

export function renderChecks(containerId, name, rows) {
  $(containerId).innerHTML = rows.map(([id, title]) => `
    <label class="check">
      <input type="checkbox" name="${esc(name)}" value="${esc(id)}"> ${esc(title)}
    </label>
  `).join('');
}

export function renderInputs(data) {
  $('scenarios').innerHTML = data.scenarios.map((scenario) => `
    <button class="orange" data-scenario="${esc(scenario.id)}">${esc(scenario.title)}</button>
  `).join('');

  fillSelect('sellerSpn', data.staff.spn);
  fillSelect('buyerSpn', data.staff.spn);
  fillSelect('manager', data.staff.managers);
  $('lawyer').value = data.office_settings.default_lawyer;
  $('manager').value = data.office_settings.default_manager;

  renderChecks('basisBox', 'basis', data.dictionaries.basis);
  renderChecks('paymentsBox', 'payments', data.dictionaries.payments);
  renderChecks('certificatesBox', 'certificates', data.dictionaries.certificates);
  renderChecks('flagsBox', 'flags', data.dictionaries.flags);
}

export function checkedValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

export function setCheckedValues(name, values = []) {
  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = values.includes(input.value);
  });
}

function value(id) {
  const element = $(id);
  return element ? element.value : '';
}

export function getDeal() {
  return {
    mode: $('mode').value,
    stage: $('stage').value,
    lawyer: $('lawyer').value,
    manager: $('manager').value,
    sellerSpn: $('sellerSpn').value,
    buyerSpn: $('buyerSpn').value,
    sellerPhone: $('sellerPhone').value,
    buyerPhone: $('buyerPhone').value,
    sellerCount: value('sellerCount'),
    buyerCount: value('buyerCount'),
    sellerMainName: value('sellerMainName'),
    buyerMainName: value('buyerMainName'),
    sellerSideComment: value('sellerSideComment'),
    buyerSideComment: value('buyerSideComment'),
    sellerRealtorCommission: value('sellerRealtorCommission'),
    buyerRealtorCommission: value('buyerRealtorCommission'),
    sellerCommissionComment: value('sellerCommissionComment'),
    buyerCommissionComment: value('buyerCommissionComment'),
    totalOfficeCommission: value('totalOfficeCommission'),
    commissionDistribution: value('commissionDistribution'),
    registrationFeePayer: value('registrationFeePayer'),
    registrationFeeAmount: value('registrationFeeAmount'),
    landRegistrationFeeAmount: value('landRegistrationFeeAmount'),
    evaluationCost: value('evaluationCost'),
    sbrCost: value('sbrCost'),
    notaryCost: value('notaryCost'),
    bankInsuranceCost: value('bankInsuranceCost'),
    otherCosts: value('otherCosts'),
    costsComment: value('costsComment'),
    objectType: $('objectType').value,
    rightForm: $('rightForm').value,
    address: $('address').value,
    cadObject: $('cadObject').value,
    cadLand: $('cadLand').value,
    priceFact: $('priceFact').value,
    priceContract: $('priceContract').value,
    priceComment: $('priceComment').value,
    included: $('included').value,
    excluded: $('excluded').value,
    releaseInfo: $('releaseInfo').value,
    basis: checkedValues('basis'),
    payments: checkedValues('payments'),
    certificates: checkedValues('certificates'),
    bankType: $('bankType').value,
    bankInfo: $('bankInfo').value,
    flags: checkedValues('flags'),
    stEgrn: $('stEgrn').value,
    stRegistered: $('stRegistered').value,
    folderLink: $('folderLink').value,
    questions: $('questions').value
  };
}

export function applyDealPatch(patch = {}) {
  Object.entries(patch).forEach(([key, value]) => {
    if (['basis', 'payments', 'certificates', 'flags'].includes(key)) {
      setCheckedValues(key, value || []);
      return;
    }
    const element = $(key);
    if (element) element.value = value ?? '';
  });
}

export function bindTabs() {
  document.querySelectorAll('.tab').forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
      document.querySelectorAll('.tabpage').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      $(button.dataset.tab).classList.add('active');
    };
  });
}