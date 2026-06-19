const SHARE_CARD_ID = 'spnShareProgressive';
const DRAFT_KEY = 'nav_deal_draft_v2';

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function flagsOf(deal) {
  return Array.isArray(deal.flags) ? deal.flags : [];
}

function hasObject(deal) {
  return Boolean(deal.objectType || deal.objectCategory);
}

function isShareMarked(deal) {
  return flagsOf(deal).includes('shares') || deal.objectType === 'share' || deal.legalForm === 'share';
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

function hintFor(deal) {
  if (!isShareMarked(deal)) {
    return 'Если продаётся целый объект — ничего дополнительно заполнять не нужно. Если продаётся доля или фактическая часть объекта, отметьте это одной кнопкой.';
  }
  if (deal.shareSeparateEntrance === 'yes') {
    return 'Есть отдельный вход: проверьте двор, коммуникации, порядок пользования и возможность выдела. Это похоже на “половину дома”, но юридически всё равно может быть доля.';
  }
  if (deal.shareSeparateEntrance === 'no') {
    return 'Нет отдельного входа: повышенный риск для покупателя. Важно объяснить, что покупается именно доля, а не отдельный самостоятельный объект.';
  }
  return 'Доля отмечена. Теперь достаточно уточнить только ключевые вещи: доля в чём, размер, отдельный вход и порядок пользования.';
}

function renderShareFields(deal) {
  if (!isShareMarked(deal)) return '';
  return `<div class="grid" style="margin-top:12px">
    <div>${selectField('shareBaseObject', 'Доля в чём?', deal.shareBaseObject || deal.objectType, [
      ['', 'Не выбрано'],
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

function injectShareCard() {
  const appShell = document.querySelector('#app .nav-v2-shell');
  if (!appShell) return;

  const deal = readDraft();
  if (!hasObject(deal) && !isShareMarked(deal)) {
    const old = document.getElementById(SHARE_CARD_ID);
    if (old) old.remove();
    return;
  }

  let card = document.getElementById(SHARE_CARD_ID);
  if (!card) {
    card = document.createElement('section');
    card.id = SHARE_CARD_ID;
    card.className = 'card';
  }

  const marked = isShareMarked(deal);
  card.innerHTML = `<details ${marked ? 'open' : ''}>
    <summary><span class="pill blue">Уточнение</span> <b>Доля / часть объекта</b></summary>
    <p class="muted" style="margin:10px 0 12px">${hintFor(deal)}</p>
    <div class="actions" style="justify-content:flex-start;margin-bottom:10px">
      <button class="btn ${marked ? 'primary' : 'light'}" type="button" data-action="sellerFlag:shares">${marked ? 'Признак “доля” отмечен' : 'Продаётся доля / часть объекта'}</button>
    </div>
    ${renderShareFields(deal)}
  </details>`;

  const stepper = appShell.querySelector('.stepper');
  const guide = document.getElementById('spnScenarioPresets') || document.getElementById('spnScenarioGuide');
  if (guide && guide.nextSibling) appShell.insertBefore(card, guide.nextSibling);
  else if (stepper) appShell.insertBefore(card, stepper);
  else appShell.appendChild(card);
}

let scheduled = false;
function scheduleShareCard() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    injectShareCard();
  }, 100);
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  injectShareCard();
  if (document.querySelector('#app .nav-v2-shell') || attempts >= 30) clearInterval(timer);
}, 150);

document.addEventListener('click', scheduleShareCard, true);
document.addEventListener('input', scheduleShareCard, true);
window.addEventListener('storage', scheduleShareCard);
