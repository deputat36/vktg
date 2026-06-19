const DRAFT_KEY = 'nav_deal_draft_v2';
let scheduled = false;
let observerStarted = false;

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function field(key, label, type = 'text', placeholder = '') {
  const deal = readDraft();
  return `<div class="field"><label>${esc(label)}</label><input data-field="${esc(key)}" type="${esc(type)}" value="${esc(deal[key] || '')}" placeholder="${esc(placeholder)}"></div>`;
}

function textarea(key, label, placeholder = '') {
  const deal = readDraft();
  return `<div class="field"><label>${esc(label)}</label><textarea data-field="${esc(key)}" placeholder="${esc(placeholder)}">${esc(deal[key] || '')}</textarea></div>`;
}

function objectTitle(type) {
  return {
    flat_mkd: 'Квартира в МКД',
    flat_ground: 'Квартира на земле',
    room: 'Комната',
    house_land: 'Дом с участком',
    land: 'Земельный участок',
    new_building: 'Новостройка / ДДУ / уступка',
    commercial: 'Коммерция',
    share: 'Доля / часть объекта'
  }[type] || 'Объект';
}

function commonMoneyFields() {
  return `<div class="grid">
    <div>${field('priceTotal', 'Цена объекта', 'number')}</div>
    <div>${field('depositAmount', 'Планируемый задаток/аванс', 'number')}</div>
  </div>`;
}

function flatMkdFields() {
  return `<div class="grid">
    <div>${field('address', 'Адрес / ориентир', 'text', 'город, улица, дом, квартира')}</div>
    <div>${field('cadastralNumber', 'Кадастровый номер квартиры', 'text', 'если есть')}</div>
  </div>
  ${commonMoneyFields()}
  <div class="grid">
    <div>${field('floor', 'Этаж')}</div>
    <div>${field('roomsCount', 'Количество комнат')}</div>
  </div>
  ${textarea('registeredPeople', 'Кто зарегистрирован?', 'Есть ли дети, временная регистрация, когда выписка?')}
  ${textarea('redevelopment', 'Перепланировка / особенности', 'Есть ли перепланировка, перенос мокрых зон?')}`;
}

function flatGroundFields() {
  return `<div class="status" style="margin-bottom:12px"><b>Почему отдельный сценарий:</b><br>у квартиры на земле часто есть вопросы по земле, входу, коммуникациям и статусу дома.</div>
  <div class="grid">
    <div>${field('address', 'Адрес / ориентир', 'text', 'город, улица, дом, квартира')}</div>
    <div>${field('cadastralNumber', 'Кадастровый номер квартиры', 'text', 'если есть')}</div>
  </div>
  ${commonMoneyFields()}
  <div class="grid">
    <div>${field('landCadastralNumber', 'Кадастровый номер земли')}</div>
    <div>${field('landStatus', 'Статус земли / участка')}</div>
  </div>
  ${textarea('flatGroundComment', 'Особенности квартиры на земле', 'Отдельный вход, коммуникации, доля земли, порядок пользования.')}`;
}

function roomFields() {
  return `<div class="grid">
    <div>${field('address', 'Адрес / ориентир', 'text', 'город, улица, дом, квартира/общежитие')}</div>
    <div>${field('cadastralNumber', 'Кадастровый номер комнаты', 'text', 'если комната стоит на кадастре')}</div>
  </div>
  ${commonMoneyFields()}
  <div class="grid">
    <div>${field('roomArea', 'Площадь комнаты')}</div>
    <div>${field('roomType', 'Комната где?', 'text', 'квартира, общежитие, коммуналка')}</div>
  </div>
  ${textarea('commonAreas', 'Места общего пользования и соседи', 'Кухня/санузел, конфликт, порядок пользования, зарегистрированные?')}`;
}

function houseLandFields() {
  return `<div class="status" style="margin-bottom:12px"><b>Важно:</b><br>для дома с участком не нужен общий кадастровый номер. Проверяем отдельно дом и землю.</div>
  <div class="grid">
    <div>${field('address', 'Адрес / ориентир', 'text', 'город, улица, дом')}</div>
    <div>${field('houseArea', 'Площадь дома')}</div>
  </div>
  ${commonMoneyFields()}
  <div class="grid">
    <div>${field('houseCadastralNumber', 'Кадастровый номер дома')}</div>
    <div>${field('landCadastralNumber', 'Кадастровый номер земли')}</div>
  </div>
  <div class="grid">
    <div>${field('landCategory', 'Категория земли')}</div>
    <div>${field('landUse', 'ВРИ')}</div>
  </div>
  ${textarea('boundariesComment', 'Межевание, границы, коммуникации', 'Подъезд, газ/свет/вода, совпадают ли собственники дома и земли?')}`;
}

function landFields() {
  return `<div class="grid">
    <div>${field('address', 'Адрес / ориентир', 'text', 'район, улица, СНТ, ориентир')}</div>
    <div>${field('landCadastralNumber', 'Кадастровый номер участка')}</div>
  </div>
  ${commonMoneyFields()}
  <div class="grid">
    <div>${field('landArea', 'Площадь участка')}</div>
    <div>${field('landCategory', 'Категория земли')}</div>
  </div>
  <div class="grid">
    <div>${field('landUse', 'ВРИ')}</div>
  </div>
  ${textarea('landComment', 'Ограничения и коммуникации', 'Межевание, подъезд, охранные зоны, ЛЭП, газ, вода, строения.')}`;
}

function newBuildingFields() {
  return `<div class="grid">
    <div>${field('address', 'ЖК / адрес / ориентир', 'text', 'название ЖК, дом, секция')}</div>
    <div>${field('developer', 'Застройщик')}</div>
  </div>
  ${commonMoneyFields()}
  <div class="grid">
    <div>${field('contractType', 'ДДУ / уступка / готовая квартира')}</div>
    <div>${field('cadastralNumber', 'Кадастровый номер', 'text', 'только если уже есть')}</div>
  </div>
  ${textarea('newBuildingComment', 'Особенности новостройки', 'Эскроу, акт, уступка, ипотека, остаток оплаты, сроки.')}`;
}

function commercialFields() {
  return `<div class="grid">
    <div>${field('address', 'Адрес / ориентир', 'text', 'город, улица, дом, помещение')}</div>
    <div>${field('cadastralNumber', 'Кадастровый номер помещения', 'text', 'если есть')}</div>
  </div>
  ${commonMoneyFields()}
  <div class="grid">
    <div>${field('commercialPurpose', 'Назначение помещения')}</div>
    <div>${field('ownerLegalStatus', 'Собственник физлицо/юрлицо?')}</div>
  </div>
  ${textarea('tenantComment', 'Арендатор, НДС, ограничения', 'Аренда, НДС, обременения, отдельный вход.')}`;
}

function fallbackFields() {
  return `<div class="grid">
    <div>${field('address', 'Адрес / ориентир', 'text', 'город, улица, дом')}</div>
    <div>${field('cadastralNumber', 'Кадастровый номер', 'text', 'если есть')}</div>
  </div>
  ${commonMoneyFields()}
  ${textarea('objectComment', 'Комментарий по объекту', 'Что важно знать юристу/руководителю?')}`;
}

function fieldsByType(type) {
  if (type === 'flat_mkd') return flatMkdFields();
  if (type === 'flat_ground') return flatGroundFields();
  if (type === 'room') return roomFields();
  if (type === 'house_land') return houseLandFields();
  if (type === 'land') return landFields();
  if (type === 'new_building') return newBuildingFields();
  if (type === 'commercial') return commercialFields();
  return fallbackFields();
}

function detailStepHtml() {
  const deal = readDraft();
  const type = deal.objectType;
  return `<div id="adaptiveObjectDetailsStep">
    <h2>Детали объекта</h2>
    <p class="muted">Вопросы адаптированы под выбранный тип: <b>${esc(objectTitle(type))}</b>. Лишние кадастровые поля не показываются.</p>
    ${fieldsByType(type)}
    ${textarea('objectComment', 'Комментарий по объекту', 'Что важно знать юристу/руководителю?')}
  </div>`;
}

function findDetailsCard() {
  const headings = [...document.querySelectorAll('#app h2')];
  const heading = headings.find((node) => node.textContent.trim().startsWith('Детали объекта'));
  return heading?.closest?.('.card') || null;
}

function replaceDetailsStep(card) {
  if (card.querySelector('#adaptiveObjectDetailsStep')) return;

  const title = card.querySelector('.section-title');
  const pageStatus = card.querySelector('#pageStatus');
  if (!title || !pageStatus) return;

  let node = title.nextSibling;
  while (node && node !== pageStatus) {
    const next = node.nextSibling;
    node.remove();
    node = next;
  }

  pageStatus.insertAdjacentHTML('beforebegin', detailStepHtml());
}

function apply() {
  const card = findDetailsCard();
  if (!card) return;
  replaceDetailsStep(card);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    apply();
  }, 80);
}

function startObserver() {
  if (observerStarted) return;
  const host = document.getElementById('app');
  if (!host) return;
  observerStarted = true;
  const observer = new MutationObserver(() => schedule());
  observer.observe(host, { childList: true, subtree: true });
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  startObserver();
  apply();
  if (observerStarted && attempts >= 10) clearInterval(timer);
  if (attempts >= 40) clearInterval(timer);
}, 150);

document.addEventListener('click', schedule, true);
document.addEventListener('input', (event) => {
  if (event.target?.closest?.('#adaptiveObjectDetailsStep [data-field]')) return;
  schedule();
}, true);
window.addEventListener('storage', schedule);
