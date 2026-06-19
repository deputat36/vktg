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

function section(title, note, content) {
  return `<div class="card" style="box-shadow:none;margin-top:12px">
    <h3>${esc(title)}</h3>
    ${note ? `<p class="muted" style="margin:4px 0 10px">${esc(note)}</p>` : ''}
    ${content}
  </div>`;
}

function docSection(content) {
  return `<details class="status" style="margin-top:12px">
    <summary><b>Для юриста / документов</b></summary>
    <p class="muted" style="margin:8px 0 10px">Эти поля не должны тормозить первичное заполнение заявки. Заполняйте, если данные уже под рукой или нужно передать юристу.</p>
    ${content}
  </details>`;
}

function minimumFields(addressPlaceholder = 'город, улица, дом') {
  return section('1. Минимум для заявки', 'Эти данные нужны, чтобы заявка была понятной и по ней можно было двигаться дальше.', `<div class="grid">
    <div>${field('address', 'Адрес / ориентир', 'text', addressPlaceholder)}</div>
    <div>${field('priceTotal', 'Цена объекта', 'number')}</div>
  </div>
  <div class="grid">
    <div>${field('depositAmount', 'Планируемый задаток/аванс', 'number')}</div>
  </div>`);
}

function finalComment() {
  return section('3. Комментарий по объекту', 'Коротко напишите то, что важно не потерять при передаче менеджеру, юристу или брокеру.', textarea('objectComment', 'Комментарий по объекту', 'Что важно знать юристу/руководителю?'));
}

function flatMkdFields() {
  return `${minimumFields('город, улица, дом, квартира')}
  ${section('2. Что влияет на подготовку', 'Эти вопросы помогают понять риски и дальнейшие действия.', `<div class="grid">
    <div>${field('floor', 'Этаж')}</div>
    <div>${field('roomsCount', 'Количество комнат')}</div>
  </div>
  ${textarea('registeredPeople', 'Кто зарегистрирован?', 'Есть ли дети, временная регистрация, когда выписка?')}
  ${textarea('redevelopment', 'Перепланировка / особенности', 'Есть ли перепланировка, перенос мокрых зон?')}`)}
  ${docSection(`<div class="grid"><div>${field('cadastralNumber', 'Кадастровый номер квартиры', 'text', 'если есть')}</div></div>`)}
  ${finalComment()}`;
}

function flatGroundFields() {
  return `${minimumFields('город, улица, дом, квартира')}
  ${section('2. Что влияет на подготовку', 'Для квартиры на земле важны статус земли, вход, коммуникации и фактическое пользование.', `<div class="grid">
    <div>${field('landStatus', 'Статус земли / участка')}</div>
  </div>
  ${textarea('flatGroundComment', 'Особенности квартиры на земле', 'Отдельный вход, коммуникации, доля земли, порядок пользования.')}`)}
  ${docSection(`<div class="grid">
    <div>${field('cadastralNumber', 'Кадастровый номер квартиры', 'text', 'если есть')}</div>
    <div>${field('landCadastralNumber', 'Кадастровый номер земли')}</div>
  </div>`)}
  ${finalComment()}`;
}

function roomFields() {
  return `${minimumFields('город, улица, дом, квартира/общежитие')}
  ${section('2. Что влияет на подготовку', 'Для комнаты важно понять статус объекта и ситуацию с общими помещениями.', `<div class="grid">
    <div>${field('roomArea', 'Площадь комнаты')}</div>
    <div>${field('roomType', 'Комната где?', 'text', 'квартира, общежитие, коммуналка')}</div>
  </div>
  ${textarea('commonAreas', 'Места общего пользования и соседи', 'Кухня/санузел, конфликт, порядок пользования, зарегистрированные?')}`)}
  ${docSection(`<div class="grid"><div>${field('cadastralNumber', 'Кадастровый номер комнаты', 'text', 'если комната стоит на кадастре')}</div></div>`)}
  ${finalComment()}`;
}

function houseLandFields() {
  return `${minimumFields('город, улица, дом')}
  ${section('2. Что влияет на подготовку', 'Для дома с участком важно понять сам объект, землю, границы и коммуникации. Кадастровые номера — ниже, для юриста.', `<div class="grid">
    <div>${field('houseArea', 'Площадь дома')}</div>
    <div>${field('landArea', 'Площадь участка')}</div>
  </div>
  <div class="grid">
    <div>${field('landCategory', 'Категория земли')}</div>
    <div>${field('landUse', 'ВРИ')}</div>
  </div>
  ${textarea('boundariesComment', 'Межевание, границы, коммуникации', 'Подъезд, газ/свет/вода, совпадают ли собственники дома и земли?')}`)}
  ${docSection(`<div class="grid">
    <div>${field('houseCadastralNumber', 'Кадастровый номер дома')}</div>
    <div>${field('landCadastralNumber', 'Кадастровый номер земли')}</div>
  </div>`)}
  ${finalComment()}`;
}

function landFields() {
  return `${minimumFields('район, улица, СНТ, ориентир')}
  ${section('2. Что влияет на подготовку', 'Для участка важны площадь, категория, ВРИ, подъезд, ограничения и коммуникации.', `<div class="grid">
    <div>${field('landArea', 'Площадь участка')}</div>
    <div>${field('landCategory', 'Категория земли')}</div>
  </div>
  <div class="grid">
    <div>${field('landUse', 'ВРИ')}</div>
  </div>
  ${textarea('landComment', 'Ограничения и коммуникации', 'Межевание, подъезд, охранные зоны, ЛЭП, газ, вода, строения.')}`)}
  ${docSection(`<div class="grid"><div>${field('landCadastralNumber', 'Кадастровый номер участка')}</div></div>`)}
  ${finalComment()}`;
}

function newBuildingFields() {
  return `${minimumFields('название ЖК, дом, секция')}
  ${section('2. Что влияет на подготовку', 'Для новостройки важны застройщик, тип договора, стадия и остаток оплаты.', `<div class="grid">
    <div>${field('developer', 'Застройщик')}</div>
    <div>${field('contractType', 'ДДУ / уступка / готовая квартира')}</div>
  </div>
  ${textarea('newBuildingComment', 'Особенности новостройки', 'Эскроу, акт, уступка, ипотека, остаток оплаты, сроки.')}`)}
  ${docSection(`<div class="grid"><div>${field('cadastralNumber', 'Кадастровый номер', 'text', 'только если уже есть')}</div></div>`)}
  ${finalComment()}`;
}

function commercialFields() {
  return `${minimumFields('город, улица, дом, помещение')}
  ${section('2. Что влияет на подготовку', 'Для коммерции важны назначение, статус собственника, арендаторы, НДС и ограничения.', `<div class="grid">
    <div>${field('commercialPurpose', 'Назначение помещения')}</div>
    <div>${field('ownerLegalStatus', 'Собственник физлицо/юрлицо?')}</div>
  </div>
  ${textarea('tenantComment', 'Арендатор, НДС, ограничения', 'Аренда, НДС, обременения, отдельный вход.')}`)}
  ${docSection(`<div class="grid"><div>${field('cadastralNumber', 'Кадастровый номер помещения', 'text', 'если есть')}</div></div>`)}
  ${finalComment()}`;
}

function fallbackFields() {
  return `${minimumFields('город, улица, дом')}
  ${docSection(`<div class="grid"><div>${field('cadastralNumber', 'Кадастровый номер', 'text', 'если есть')}</div></div>`)}
  ${finalComment()}`;
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
    <p class="muted">Вопросы сгруппированы по важности для выбранного типа: <b>${esc(objectTitle(type))}</b>. Сначала — то, что помогает двигать заявку. Кадастровые номера и реквизиты — в конце, для юриста.</p>
    ${fieldsByType(type)}
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
