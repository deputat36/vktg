const DRAFT_KEY = 'nav_deal_draft_v2';
const RESUME_OBJECT_STEP_KEY = 'nav_spn_resume_object_step_v2';
let scheduled = false;

const OBJECT_TYPES = [
  {
    type: 'flat_mkd',
    category: 'flat',
    apartmentKind: 'flat_mkd',
    title: 'Квартира в МКД',
    text: 'Обычная квартира в многоквартирном доме.'
  },
  {
    type: 'flat_ground',
    category: 'flat',
    apartmentKind: 'flat_ground',
    title: 'Квартира на земле',
    text: 'Квартира с вопросами по земле, входу, коммуникациям и статусу дома.'
  },
  {
    type: 'room',
    category: 'room',
    title: 'Комната',
    text: 'Комната, коммуналка, общежитие — отдельный объект, не доля.'
  },
  {
    type: 'house_land',
    category: 'house_land',
    title: 'Дом с участком',
    text: 'Дом и земля проверяются вместе.'
  },
  {
    type: 'land',
    category: 'land',
    title: 'Земельный участок',
    text: 'Категория, ВРИ, межевание, ограничения.'
  },
  {
    type: 'new_building',
    category: 'new_building',
    title: 'Новостройка / ДДУ / уступка',
    text: 'Застройщик, ДДУ, уступка, эскроу.'
  },
  {
    type: 'commercial',
    category: 'commercial',
    title: 'Коммерция',
    text: 'Юрлица, назначение, арендатор, НДС.'
  }
];

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function writeDraft(deal) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(deal));
}

function flagsOf(deal) {
  return Array.isArray(deal.flags) ? deal.flags : [];
}

function physicalObjectSelected(deal) {
  return Boolean(deal.objectType && deal.objectType !== 'share');
}

function shareMarked(deal) {
  return flagsOf(deal).includes('shares') || deal.legalForm === 'share' || deal.shareSale === true || deal.objectType === 'share' || deal.objectCategory === 'share';
}

function fieldOption(value, label, current) {
  return `<option value="${value}" ${String(current || '') === value ? 'selected' : ''}>${label}</option>`;
}

function selectField(name, label, current, options) {
  return `<div class="field"><label>${label}</label><select data-field="${name}">${options.map((item) => fieldOption(item[0], item[1], current)).join('')}</select></div>`;
}

function inputField(name, label, current, placeholder = '') {
  return `<div class="field"><label>${label}</label><input data-field="${name}" type="text" value="${current || ''}" placeholder="${placeholder}"></div>`;
}

function textareaField(name, label, current, placeholder = '') {
  return `<div class="field"><label>${label}</label><textarea data-field="${name}" placeholder="${placeholder}">${current || ''}</textarea></div>`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function normalizeLegacyShare() {
  const deal = readDraft();
  if (deal.objectType !== 'share' && deal.objectCategory !== 'share') return false;

  const flags = new Set(flagsOf(deal));
  flags.add('shares');

  const next = {
    ...deal,
    legalForm: 'share',
    shareSale: true,
    flags: [...flags]
  };

  delete next.objectType;
  delete next.objectCategory;
  delete next.apartmentKind;

  writeDraft(next);
  sessionStorage.setItem(RESUME_OBJECT_STEP_KEY, '1');
  return true;
}

function setObjectType(type) {
  const config = OBJECT_TYPES.find((item) => item.type === type);
  if (!config) return;

  const deal = readDraft();
  const previousType = deal.objectType;

  deal.objectType = config.type;
  deal.objectCategory = config.category;
  if (config.apartmentKind) deal.apartmentKind = config.apartmentKind;
  else delete deal.apartmentKind;

  if (shareMarked(deal) && (!deal.shareBaseObject || deal.shareBaseObject === previousType || deal.shareBaseObject === 'share')) {
    deal.shareBaseObject = config.type;
  }

  writeDraft(deal);
  sessionStorage.setItem(RESUME_OBJECT_STEP_KEY, '1');
  location.reload();
}

function setLegalForm(mode) {
  const deal = readDraft();
  const flags = new Set(flagsOf(deal));

  if (mode === 'share') {
    flags.add('shares');
    deal.legalForm = 'share';
    deal.shareSale = true;
    if (physicalObjectSelected(deal)) deal.shareBaseObject = deal.objectType;
  } else {
    flags.delete('shares');
    deal.shareSale = false;
    delete deal.legalForm;
    delete deal.shareBaseObject;
    delete deal.shareSize;
    delete deal.shareSeparateEntrance;
    delete deal.shareSeparateYard;
    delete deal.shareUseOrder;
    delete deal.shareConflict;
    delete deal.shareRealUseComment;
  }

  deal.flags = [...flags];
  writeDraft(deal);
  sessionStorage.setItem(RESUME_OBJECT_STEP_KEY, '1');
  location.reload();
}

function updateDraftField(field, value) {
  const deal = readDraft();
  deal[field] = value;
  writeDraft(deal);
}

function resumeObjectStepIfNeeded() {
  if (sessionStorage.getItem(RESUME_OBJECT_STEP_KEY) !== '1') return;
  const buttons = [...document.querySelectorAll('[data-action^="step:"]')];
  const objectButton = buttons.find((button) => button.textContent.includes('Объект'));
  if (!objectButton) return;
  sessionStorage.removeItem(RESUME_OBJECT_STEP_KEY);
  objectButton.click();
}

function findObjectCard() {
  const headings = [...document.querySelectorAll('#app h2')];
  const heading = headings.find((node) => node.textContent.trim().startsWith('Что за объект'));
  return heading?.closest?.('.card') || null;
}

function objectTypeCard(item, deal) {
  const active = deal.objectType === item.type;
  return `<button class="option ${active ? 'active' : ''}" type="button" data-object-type="${item.type}">
    <b>${esc(item.title)}</b>
    <span>${esc(item.text)}</span>
  </button>`;
}

function legalFormBlock(deal) {
  if (!physicalObjectSelected(deal)) {
    return `<div class="status" style="margin-top:14px">
      <b>Юридическая форма объекта</b>
      <p class="muted" style="margin:6px 0 0">Сначала выберите тип объекта. После этого появится выбор: целый объект или доля / часть объекта.</p>
    </div>`;
  }

  const marked = shareMarked(deal);
  return `<div class="status" style="margin-top:14px">
    <b>Юридическая форма объекта</b>
    <p class="muted" style="margin:6px 0 10px">Теперь уточните, что продаётся юридически. Если это обычная продажа всего объекта — оставьте “Целый объект”.</p>
    <div class="option-grid">
      <button class="option ${!marked ? 'active' : ''}" type="button" data-legal-form="whole">
        <b>Целый объект</b>
        <span>Продаётся весь объект. Вопросы по доле не нужны.</span>
      </button>
      <button class="option ${marked ? 'active' : ''}" type="button" data-legal-form="share">
        <b>Доля / часть объекта</b>
        <span>Половина дома, доля в квартире, доля в земле или другом объекте.</span>
      </button>
    </div>
    ${marked ? shareFields(deal) : ''}
  </div>`;
}

function shareFields(deal) {
  const baseObject = deal.shareBaseObject || deal.objectType;
  return `<div class="grid" style="margin-top:12px">
    <div>${selectField('shareBaseObject', 'Доля в чём?', baseObject, [
      ['', 'Совпадает с выбранным объектом'],
      ['flat_mkd', 'в квартире в МКД'],
      ['flat_ground', 'в квартире на земле'],
      ['room', 'в комнате / коммунальном объекте'],
      ['house_land', 'в доме с участком'],
      ['house', 'в доме без уточнения земли'],
      ['land', 'в земельном участке'],
      ['commercial', 'в коммерции'],
      ['other', 'другое']
    ])}</div>
    <div>${inputField('shareSize', 'Размер доли', deal.shareSize, 'например: 1/2, 1/3')}</div>
  </div>
  <div class="grid">
    <div>${selectField('shareSeparateEntrance', 'Есть отдельный вход?', deal.shareSeparateEntrance, [
      ['', 'Не выбрано'],
      ['yes', 'да, есть отдельный вход'],
      ['no', 'нет отдельного входа'],
      ['unknown', 'пока неизвестно'],
      ['not_applicable', 'не применимо']
    ])}</div>
    <div>${selectField('shareSeparateYard', 'Есть отдельный двор / участок?', deal.shareSeparateYard, [
      ['', 'Не выбрано'],
      ['yes', 'да'],
      ['no', 'нет'],
      ['unknown', 'пока неизвестно'],
      ['not_applicable', 'не применимо']
    ])}</div>
  </div>
  <div class="grid">
    <div>${selectField('shareUseOrder', 'Порядок пользования определён?', deal.shareUseOrder, [
      ['', 'Не выбрано'],
      ['agreement', 'есть соглашение'],
      ['court', 'определён судом'],
      ['fact', 'только фактически'],
      ['no', 'не определён'],
      ['unknown', 'пока неизвестно']
    ])}</div>
    <div>${selectField('shareConflict', 'Есть конфликт с сособственниками?', deal.shareConflict, [
      ['', 'Не выбрано'],
      ['yes', 'да'],
      ['no', 'нет'],
      ['unknown', 'пока неизвестно']
    ])}</div>
  </div>
  ${textareaField('shareRealUseComment', 'Коротко о фактическом пользовании', deal.shareRealUseComment, 'Например: отдельный вход, свой двор, общая кухня, кто живёт, есть ли конфликт.')}`;
}

function objectStepHtml(deal) {
  return `<div id="rebuiltObjectStep">
    <h2>Что за объект?</h2>
    <p class="muted">Сначала выберите физический тип недвижимости. После этого появится выбор: продаётся целый объект или доля / часть объекта.</p>
    <div class="option-grid">${OBJECT_TYPES.map((item) => objectTypeCard(item, deal)).join('')}</div>
    ${legalFormBlock(deal)}
  </div>`;
}

function replaceObjectStep(card) {
  if (card.querySelector('#rebuiltObjectStep')) return;

  const title = card.querySelector('.section-title');
  const pageStatus = card.querySelector('#pageStatus');
  if (!title || !pageStatus) return;

  let node = title.nextSibling;
  while (node && node !== pageStatus) {
    const next = node.nextSibling;
    node.remove();
    node = next;
  }

  pageStatus.insertAdjacentHTML('beforebegin', objectStepHtml(readDraft()));
}

function cleanTopHelpers() {
  document.getElementById('spnScenarioGuide')?.remove();
  document.getElementById('spnScenarioPresets')?.remove();
  document.getElementById('spnShareProgressive')?.remove();
  document.getElementById('spnShareObjectFix')?.remove();
}

function apply() {
  resumeObjectStepIfNeeded();

  if (normalizeLegacyShare()) {
    setTimeout(() => location.reload(), 80);
    return;
  }

  cleanTopHelpers();
  const card = findObjectCard();
  if (!card) return;
  replaceObjectStep(card);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    apply();
  }, 80);
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  apply();
  if (attempts >= 30) clearInterval(timer);
}, 150);

document.addEventListener('click', (event) => {
  const typeButton = event.target?.closest?.('[data-object-type]');
  if (typeButton) {
    event.preventDefault();
    event.stopPropagation();
    setObjectType(typeButton.dataset.objectType);
    return;
  }

  const formButton = event.target?.closest?.('[data-legal-form]');
  if (formButton) {
    event.preventDefault();
    event.stopPropagation();
    setLegalForm(formButton.dataset.legalForm);
    return;
  }

  schedule();
}, true);

document.addEventListener('input', (event) => {
  const field = event.target?.closest?.('#rebuiltObjectStep [data-field]');
  if (field) {
    updateDraftField(field.dataset.field, field.value);
    return;
  }
  schedule();
}, true);

document.addEventListener('change', (event) => {
  const field = event.target?.closest?.('#rebuiltObjectStep [data-field]');
  if (!field) return;
  updateDraftField(field.dataset.field, field.value);
}, true);

window.addEventListener('storage', schedule);
