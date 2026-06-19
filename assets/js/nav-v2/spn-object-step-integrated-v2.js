const DRAFT_KEY = 'nav_deal_draft_v2';
let scheduled = false;

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function writeDraft(deal) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(deal));
}

function flagsOf(deal) {
  return Array.isArray(deal.flags) ? deal.flags : [];
}

function shareMarked(deal) {
  return flagsOf(deal).includes('shares') || deal.legalForm === 'share' || deal.objectType === 'share' || deal.objectCategory === 'share';
}

function option(value, label, current) {
  return `<option value="${value}" ${String(current || '') === value ? 'selected' : ''}>${label}</option>`;
}

function selectField(name, label, current, options) {
  return `<div class="field"><label>${label}</label><select data-field="${name}">${options.map((item) => option(item[0], item[1], current)).join('')}</select></div>`;
}

function inputField(name, label, current, placeholder = '') {
  return `<div class="field"><label>${label}</label><input data-field="${name}" type="text" value="${current || ''}" placeholder="${placeholder}"></div>`;
}

function textareaField(name, label, current, placeholder = '') {
  return `<div class="field"><label>${label}</label><textarea data-field="${name}" placeholder="${placeholder}">${current || ''}</textarea></div>`;
}

function normalizeLegacyShare() {
  const deal = readDraft();
  if (deal.objectType !== 'share' && deal.objectCategory !== 'share') return false;

  const flags = flagsOf(deal);
  const next = {
    ...deal,
    legalForm: 'share',
    flags: [...new Set([...flags, 'shares'])]
  };
  delete next.objectType;
  delete next.objectCategory;
  delete next.apartmentKind;
  writeDraft(next);
  return true;
}

function findObjectCard() {
  const headings = [...document.querySelectorAll('#app h2')];
  const heading = headings.find((node) => node.textContent.trim().startsWith('Что за объект'));
  return heading?.closest?.('.card') || null;
}

function removeLegacyShareChoice(card) {
  card.querySelectorAll('[data-action="set:objectCategory:share"]').forEach((button) => button.remove());
}

function buildInlineShareBlock(deal) {
  const marked = shareMarked(deal);
  const baseObject = deal.shareBaseObject || (deal.objectType !== 'share' ? deal.objectType : '');
  const extra = marked ? `<div class="grid" style="margin-top:12px">
    <div>${selectField('shareBaseObject', 'Доля в чём?', baseObject, [
      ['', 'Выберите, если не совпадает с типом объекта'],
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
  ${textareaField('shareRealUseComment', 'Коротко о фактическом пользовании', deal.shareRealUseComment, 'Например: отдельный вход, свой двор, общая кухня, кто живёт, есть ли конфликт.')}` : '';

  const hint = marked
    ? 'Заполните только то, что уже известно. Если это половина дома — особенно важны вход, двор, коммуникации и порядок пользования. Если доля в квартире — важно объяснить риски покупателю.'
    : 'Если продаётся целый объект, ничего отмечать не нужно. Если продаётся доля, половина дома или часть объекта — нажмите кнопку ниже.';

  return `<div id="inlineShareObjectBlock" class="status" style="margin-top:12px">
    <b>Доля / часть объекта</b>
    <p class="muted" style="margin:6px 0 10px">${hint}</p>
    <div class="actions" style="justify-content:flex-start;margin-bottom:8px">
      <button class="btn ${marked ? 'primary' : 'light'}" type="button" data-action="sellerFlag:shares">${marked ? 'Признак “доля / часть объекта” отмечен' : 'Продаётся доля / часть объекта'}</button>
    </div>
    ${extra}
  </div>`;
}

function injectInlineShareBlock(card) {
  const deal = readDraft();
  const old = card.querySelector('#inlineShareObjectBlock');
  if (old) old.remove();

  const flatDetails = card.querySelector('.card[style*="box-shadow:none"]');
  const anchor = flatDetails || card.querySelector('.option-grid');
  if (!anchor) return;

  anchor.insertAdjacentHTML('afterend', buildInlineShareBlock(deal));
}

function cleanTopHelpers() {
  document.getElementById('spnScenarioGuide')?.remove();
  document.getElementById('spnScenarioPresets')?.remove();
  document.getElementById('spnShareProgressive')?.remove();
}

function apply() {
  if (normalizeLegacyShare()) {
    setTimeout(() => location.reload(), 80);
    return;
  }

  cleanTopHelpers();
  const card = findObjectCard();
  if (!card) return;
  removeLegacyShareChoice(card);
  injectInlineShareBlock(card);
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

document.addEventListener('click', schedule, true);
document.addEventListener('input', schedule, true);
window.addEventListener('storage', schedule);
