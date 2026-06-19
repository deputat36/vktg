import { getCachedUser, renderAuthBox, rpc, esc, riskPill } from './supabase-v2.js';

const DRAFT_KEY = 'nav_deal_draft_v2';
const state = { stepIndex: 0, deal: readDraft() };
let isSaving = false;
let lastPointerAction = 0;

function readDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; } }
function saveDraft() { localStorage.setItem(DRAFT_KEY, JSON.stringify(state.deal)); }
function arr(key) { return Array.isArray(state.deal[key]) ? state.deal[key] : []; }
function filled(value) { return String(value ?? '').trim().length > 0; }
function moneyFilled(value) { return Number(String(value || '').replace(',', '.')) > 0; }
function is(value, expected) { return String(value || '') === String(expected); }
function has(key, value) { return arr(key).includes(value); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

const labels = {
  preparationMode: { consult:'консультация', deposit:'задаток', deal:'сделка', check_docs:'проверка документов', rework:'доработка заявки' },
  representation: { seller:'только продавца', buyer:'только покупателя', one_spn_both:'обе стороны, один СПН', both:'обе стороны, два СПН', partner_agency:'партнерская сделка', unknown:'пока не ясно' },
  stage: { lead_only:'есть только клиент', object_chosen:'объект выбран', terms_discussed:'стороны договорились', urgent_deposit:'срочно готовим задаток', deposit_exists:'задаток уже был', main_deal:'готовим основную сделку', legal_problem:'есть проблема, нужен юрист' },
  objectType: { flat_mkd:'квартира в МКД', flat_ground:'квартира на земле', room:'комната', share:'доля', house_land:'дом с участком', land:'земельный участок', new_building:'новостройка / ДДУ / уступка', commercial:'коммерция' },
  flags: {
    oneAdultSeller:'один взрослый продавец', manySellers:'несколько продавцов', minorSeller:'ребёнок-собственник', minorBuyer:'ребёнок-покупатель', minorRegistered:'зарегистрированы дети',
    spouse:'супруг/супруга', powerOfAttorney:'доверенность', shares:'доли', sellerWillNotAttend:'продавец не будет лично', encumbrance:'арест/обременение',
    sellerBankruptcyRisk:'риск банкротства продавца', redevelopment:'перепланировка', unpaidUtilities:'долги/коммунальные вопросы', alternativeDeal:'альтернативная сделка/цепочка', urgentTerms:'сжатые сроки'
  },
  payments: { cash:'собственные средства', mortgage:'ипотека', matcap:'маткапитал', certificate:'сертификат / субсидия', militaryMortgage:'военная ипотека / НИС', nominalChild:'детский номинальный счёт', svoChildAccount:'деньги детей / СВО', installment:'рассрочка / остаток долга' },
  basis: { sale:'ДКП', gift:'дарение', inheritLaw:'наследство по закону', inheritWill:'наследство по завещанию', privat:'приватизация', ddu:'ДДУ / уступка', court:'решение суда', other:'иное' },
  settlements: { beforeDeal:'перед сделкой', onDeal:'на сделке', sbr:'СБР', accreditive:'аккредитив', cell:'ячейка', notaryDeposit:'депозит нотариуса', afterRegistration:'после регистрации', pensionFund:'СФР / сертификат после регистрации' },
  notaryPayer: { buyer:'нотариус — покупатель', seller:'нотариус — продавец', split:'нотариус пополам', unknown:'не нужен / не ясно' }
};

function titleOf(map, value) { return labels[map]?.[value] || value || 'не указано'; }
function listText(key) { return arr(key).map((item) => labels[key]?.[item] || item).join(', ') || 'не указано'; }
function yesNo(value) { return value === true ? 'да' : value === false ? 'нет' : 'не указано'; }

function setDeal(key, value) {
  state.deal[key] = value;
  if (key === 'objectCategory') {
    if (value !== 'flat') delete state.deal.apartmentKind;
    const direct = { room:'room', share:'share', house_land:'house_land', land:'land', new_building:'new_building', commercial:'commercial' };
    if (direct[value]) state.deal.objectType = direct[value];
    if (value === 'flat') delete state.deal.objectType;
  }
  if (key === 'apartmentKind') state.deal.objectType = value;
  if (key === 'hasSeller') state.deal.hasSeller = value === true || value === 'true';
  if (key === 'hasBuyer') state.deal.hasBuyer = value === true || value === 'true';
  saveDraft();
  render();
}
function toggleDeal(key, value) {
  const current = arr(key);
  state.deal[key] = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  saveDraft();
  render();
}
function toggleSellerFlag(value) {
  const current = new Set(arr('flags'));
  if (current.has(value)) current.delete(value);
  else current.add(value);

  if (value === 'oneAdultSeller' && current.has('oneAdultSeller')) {
    current.delete('manySellers');
    current.delete('minorSeller');
  }
  if ((value === 'manySellers' || value === 'minorSeller') && current.has(value)) current.delete('oneAdultSeller');
  if (state.deal.objectType === 'share') current.add('shares');

  state.deal.flags = [...current];
  saveDraft();
  render();
}

function option(title, text, action, active = false, note = '') {
  return `<button type="button" class="option ${active ? 'active' : ''}" data-action="${esc(action)}"><b>${esc(title)}</b><span>${esc(text || '')}</span>${note ? `<em class="small">${esc(note)}</em>` : ''}</button>`;
}
function field(key, label, type = 'text', placeholder = '') {
  return `<div class="field"><label>${esc(label)}</label><input data-field="${esc(key)}" type="${esc(type)}" value="${esc(state.deal[key] || '')}" placeholder="${esc(placeholder)}"></div>`;
}
function textarea(key, label, placeholder = '') {
  return `<div class="field"><label>${esc(label)}</label><textarea data-field="${esc(key)}" placeholder="${esc(placeholder)}">${esc(state.deal[key] || '')}</textarea></div>`;
}
function hint(title, body) {
  return `<details class="status"><summary><b>${esc(title)}</b></summary><div style="margin-top:8px;line-height:1.5">${body}</div></details>`;
}
function chips(items) {
  return `<div class="actions" style="justify-content:flex-start;margin-top:8px">${items.filter(Boolean).map((item) => `<span class="pill blue">${esc(item)}</span>`).join('')}</div>`;
}

function effectiveFlags() {
  return unique([...arr('flags'), state.deal.objectType === 'share' ? 'shares' : '']);
}
function hasSeller() {
  if (state.deal.hasSeller === true) return true;
  if (state.deal.hasSeller === false) return false;
  return ['seller', 'one_spn_both', 'both', 'partner_agency'].includes(state.deal.representation)
    || ['object_chosen', 'terms_discussed', 'urgent_deposit', 'deposit_exists', 'main_deal', 'legal_problem'].includes(state.deal.stage);
}
function hasBuyer() {
  if (state.deal.hasBuyer === true) return true;
  if (state.deal.hasBuyer === false) return false;
  return ['buyer', 'one_spn_both', 'both', 'partner_agency'].includes(state.deal.representation)
    || ['terms_discussed', 'urgent_deposit', 'deposit_exists', 'main_deal'].includes(state.deal.stage);
}
function needsMoney() { return hasBuyer() || ['deposit', 'deal'].includes(state.deal.preparationMode); }
function needsDeposit() {
  return state.deal.preparationMode === 'deposit'
    || ['urgent_deposit', 'deposit_exists'].includes(state.deal.stage)
    || (hasSeller() && hasBuyer() && ['terms_discussed', 'main_deal'].includes(state.deal.stage));
}
function needsTerms() {
  return ['deposit', 'deal'].includes(state.deal.preparationMode)
    || ['urgent_deposit', 'deposit_exists', 'main_deal', 'terms_discussed'].includes(state.deal.stage)
    || ['one_spn_both', 'both', 'partner_agency'].includes(state.deal.representation);
}
function hasBrokerTrigger() { return arr('payments').some((item) => ['mortgage', 'militaryMortgage', 'matcap', 'certificate'].includes(item)); }
function hasLawyerTrigger() {
  const flags = effectiveFlags();
  return flags.some((item) => ['minorSeller','minorBuyer','minorRegistered','powerOfAttorney','shares','spouse','sellerBankruptcyRisk','encumbrance','sellerWillNotAttend'].includes(item))
    || arr('basis').some((item) => ['inheritLaw','inheritWill','privat','court'].includes(item))
    || state.deal.stage === 'legal_problem'
    || arr('settlements').includes('afterRegistration')
    || ['share','room','flat_ground'].includes(state.deal.objectType);
}
function analysis() {
  const flags = effectiveFlags();
  const children = flags.some((item) => ['minorSeller','minorBuyer','minorRegistered'].includes(item)) || arr('payments').some((item) => ['matcap','nominalChild','svoChildAccount'].includes(item));
  const blockers = [];
  const notes = [];
  if (children) blockers.push('Дети, опека или детские деньги — до задатка обязательно показать юристу.');
  if (flags.includes('powerOfAttorney')) notes.push('Доверенность: проверить срок, полномочия, право продажи и право получения денег.');
  if (flags.includes('shares') || state.deal.objectType === 'share') notes.push('Доли: проверить нотариуса, уведомления сособственников и отказы.');
  if (state.deal.objectType === 'room') notes.push('Комната: проверить статус объекта, соседей, места общего пользования и зарегистрированных лиц.');
  if (state.deal.objectType === 'flat_ground') notes.push('Квартира на земле: проверить землю, вход, коммуникации, статус дома и документы на участок.');
  if (arr('basis').some((item) => ['inheritLaw','inheritWill','privat','court'].includes(item))) notes.push('Основание права требует юридической проверки.');
  if (arr('settlements').includes('afterRegistration') && state.deal.settlementsAgreed !== true) blockers.push('Расчёт после регистрации без согласованной защиты продавца.');
  if (needsDeposit() && state.deal.expensesAgreed !== true) notes.push('Перед задатком нужно согласовать расходы сторон.');
  if (needsDeposit() && state.deal.settlementsAgreed !== true) notes.push('Перед задатком нужно согласовать порядок расчётов.');
  if (hasBrokerTrigger()) notes.push('Есть ипотека, маткапитал или сертификат — подключить брокера.');
  if (flags.includes('alternativeDeal')) notes.push('Есть цепочка/альтернатива — нужно согласовать зависимые сроки.');
  if (flags.includes('urgentTerms')) notes.push('Сжатые сроки — сразу определить, кто собирает документы и кто принимает решение.');
  const risk = blockers.length ? 'red' : notes.length ? 'yellow' : 'green';
  return { flags, children, blockers, notes, risk, needsLawyer: hasLawyerTrigger() || blockers.length > 0, needsBroker: hasBrokerTrigger() };
}

function check(title, done, help) { return { title, done: Boolean(done), help }; }
function readiness() {
  const checks = [
    check('Понятно, что готовим', filled(state.deal.preparationMode), 'Выберите консультацию, задаток, сделку или проверку документов.'),
    check('Понятно, кого сопровождаем', filled(state.deal.representation), 'Выберите сторону сопровождения.'),
    check('Понятна стадия', filled(state.deal.stage), 'Укажите текущую стадию ситуации.'),
    check('Выбран тип объекта', filled(state.deal.objectType), 'Выберите конкретный тип объекта.'),
    check('Указан адрес или ориентир', filled(state.deal.address) || state.deal.stage === 'lead_only', 'Для сделки или задатка нужен адрес.')
  ];
  if (hasSeller()) checks.push(check('Заполнен продавец', effectiveFlags().length > 0 || arr('basis').length > 0 || filled(state.deal.sellerComment), 'Отметьте признаки продавца, основание права или комментарий.'));
  if (hasBuyer()) checks.push(check('Заполнен покупатель', arr('payments').length > 0 || filled(state.deal.buyerPhone) || filled(state.deal.buyerComment), 'Укажите деньги, контакт или комментарий по покупателю.'));
  if (needsMoney()) checks.push(check('Понятен источник денег', arr('payments').length > 0 || filled(state.deal.moneyComment), 'Отметьте источник денег или комментарий.'));
  if (needsDeposit()) checks.push(check('Согласованы расчёты', state.deal.settlementsAgreed === true, 'До задатка нужно понимать порядок расчётов.'));
  if (needsDeposit()) checks.push(check('Согласованы расходы', state.deal.expensesAgreed === true, 'До задатка нужно понимать, кто что оплачивает.'));
  if (analysis().needsLawyer) checks.push(check('Понятен юридический риск', filled(state.deal.riskComment) || filled(state.deal.sellerComment) || filled(state.deal.objectComment), 'Добавьте комментарий по риску для юриста.'));
  checks.push(check('Есть следующий шаг', filled(state.deal.clientNextStep), 'Напишите ближайший шаг с клиентом.'));
  const done = checks.filter((item) => item.done).length;
  const percent = Math.round((done / Math.max(checks.length, 1)) * 100);
  return { checks, percent, missing: checks.filter((item) => !item.done) };
}

function computeRoute() {
  const route = [
    { id:'scenario', title:'Что готовим', hint:'задача', render: stepScenario },
    { id:'representation', title:'Сторона', hint:'кого сопровождаем', render: stepRepresentation },
    { id:'stage', title:'Стадия', hint:'где сейчас сделка', render: stepStage },
    { id:'object', title:'Объект', hint:'тип объекта', render: stepObjectType }
  ];
  if (filled(state.deal.objectType)) route.push({ id:'object_details', title:'Детали объекта', hint:titleOf('objectType', state.deal.objectType), render: stepObjectDetails });
  if (hasSeller()) route.push({ id:'seller', title:'Продавец', hint:'право и документы', render: stepSeller });
  if (hasBuyer()) route.push({ id:'buyer', title:'Покупатель', hint:'состав и контакт', render: stepBuyer });
  if (needsMoney()) route.push({ id:'money', title:'Деньги', hint:'источник денег', render: stepMoney });
  if (needsDeposit()) route.push({ id:'deposit', title:'Задаток', hint:'условия', render: stepDeposit });
  if (needsTerms()) route.push({ id:'terms', title:'Расчёты и расходы', hint:'условия сделки', render: stepTerms });
  route.push({ id:'risks', title:'Доп. риски', hint:'без дублей', render: stepRisks });
  route.push({ id:'finish', title:'Итог', hint:'готовность', render: stepFinish });
  return route;
}
function clampStep(route) { if (state.stepIndex < 0) state.stepIndex = 0; if (state.stepIndex > route.length - 1) state.stepIndex = route.length - 1; }

function routeReason(route) {
  const reasons = [];
  if (hasSeller()) reasons.push('есть блок продавца');
  if (hasBuyer()) reasons.push('есть блок покупателя');
  if (needsMoney()) reasons.push('нужен источник денег');
  if (needsDeposit()) reasons.push('есть задаток/близкая стадия');
  if (needsTerms()) reasons.push('нужны расчёты и расходы');
  if (analysis().needsLawyer) reasons.push('есть юридический риск');
  if (analysis().needsBroker) reasons.push('нужен брокер');
  return reasons.length ? reasons : ['пока минимальный маршрут'];
}

function stepScenario() {
  return `<h2>Что сейчас нужно подготовить?</h2><p class="muted">Ответ определяет маршрут. Для консультации вопросов меньше, для задатка и сделки — больше проверок.</p><div class="option-grid">${option('Консультация / первичная ситуация', 'Короткий маршрут без лишней юридической анкеты.', 'set:preparationMode:consult', is(state.deal.preparationMode,'consult'))}${option('Подготовка к задатку', 'Цена, стороны, сумма, стоп-факторы, расходы и расчёты.', 'set:preparationMode:deposit', is(state.deal.preparationMode,'deposit'))}${option('Подготовка сделки', 'Документы, расчёты, расходы, юрист/брокер.', 'set:preparationMode:deal', is(state.deal.preparationMode,'deal'))}${option('Проверка объекта / документов', 'Понять, можно ли двигаться дальше.', 'set:preparationMode:check_docs', is(state.deal.preparationMode,'check_docs'))}${option('Доработка заявки', 'Дозаполнить пробелы или замечания.', 'set:preparationMode:rework', is(state.deal.preparationMode,'rework'))}</div>${hint('Подсказка', 'Выбирайте ближайшую реальную задачу. Если сейчас только разговор с клиентом, не нужно выбирать полную сделку.')}`;
}
function stepRepresentation() {
  return `<h2>Кого сопровождаем?</h2><p class="muted">От этого зависит, какие блоки появятся дальше.</p><div class="option-grid">${option('Только продавца', 'Глубже спрашиваем объект, право и документы продавца.', 'set:representation:seller', is(state.deal.representation,'seller'))}${option('Только покупателя', 'Глубже спрашиваем деньги, ипотеку и требования покупателя.', 'set:representation:buyer', is(state.deal.representation,'buyer'))}${option('Покупателя и продавца — один СПН', 'Появятся оба блока: продавец и покупатель.', 'set:representation:one_spn_both', is(state.deal.representation,'one_spn_both'))}${option('Покупателя и продавца — два СПН', 'Нужно понять, кто ведёт какую сторону.', 'set:representation:both', is(state.deal.representation,'both'))}${option('Партнёрская сделка', 'Появятся вопросы по зоне ответственности партнёра.', 'set:representation:partner_agency', is(state.deal.representation,'partner_agency'))}${option('Пока не ясно', 'Минимальный маршрут, уточним позже.', 'set:representation:unknown', is(state.deal.representation,'unknown'))}</div>${state.deal.representation === 'partner_agency' ? textarea('partnerAgencyComment', 'Кто партнёр и кто за что отвечает?', 'Чья сторона, кто готовит документы, кто берёт задаток.') : ''}`;
}
function stepStage() {
  return `<h2>На какой стадии ситуация?</h2><p class="muted">Стадия убирает лишние вопросы.</p><div class="option-grid">${option('Есть только клиент', 'Объект или вторая сторона ещё не определены.', 'set:stage:lead_only', is(state.deal.stage,'lead_only'))}${option('Объект выбран, условия не согласованы', 'Собираем основу и следующий шаг.', 'set:stage:object_chosen', is(state.deal.stage,'object_chosen'))}${option('Стороны уже договорились', 'Появятся задаток, расчёты и расходы.', 'set:stage:terms_discussed', is(state.deal.stage,'terms_discussed'))}${option('Срочно готовим задаток', 'Включаем проверки до задатка.', 'set:stage:urgent_deposit', is(state.deal.stage,'urgent_deposit'))}${option('Задаток уже был', 'Проверим, что подписано и что исправить.', 'set:stage:deposit_exists', is(state.deal.stage,'deposit_exists'))}${option('Готовим основную сделку', 'Документы, расчёты, расходы, специалисты.', 'set:stage:main_deal', is(state.deal.stage,'main_deal'))}${option('Есть проблема, нужен юрист', 'Сразу выделяем риски.', 'set:stage:legal_problem', is(state.deal.stage,'legal_problem'))}</div><div class="option-grid">${option('Продавец уже есть', 'Показывать блок продавца.', 'set:hasSeller:true', state.deal.hasSeller === true)}${option('Продавца пока нет', 'Скрыть блок продавца.', 'set:hasSeller:false', state.deal.hasSeller === false)}${option('Покупатель уже есть', 'Показывать блок покупателя.', 'set:hasBuyer:true', state.deal.hasBuyer === true)}${option('Покупателя пока нет', 'Скрыть блок покупателя.', 'set:hasBuyer:false', state.deal.hasBuyer === false)}</div>${textarea('stageComment', 'Кратко опишите ситуацию', 'Что уже согласовано, что непонятно, кто торопит, ближайшая дата?')}`;
}
function stepObjectType() {
  return `<h2>Что за объект?</h2><p class="muted">Комната и доля разделены. Для квартиры нужно уточнить: МКД или квартира на земле.</p><div class="option-grid">${option('Квартира', 'Дальше выберем МКД или квартиру на земле.', 'set:objectCategory:flat', is(state.deal.objectCategory,'flat'))}${option('Комната', 'Комната, коммуналка, общежитие — отдельный сценарий.', 'set:objectCategory:room', is(state.deal.objectCategory,'room'))}${option('Доля', 'Сособственники, уведомления, нотариус.', 'set:objectCategory:share', is(state.deal.objectCategory,'share'))}${option('Дом с участком', 'Дом и земля проверяются вместе.', 'set:objectCategory:house_land', is(state.deal.objectCategory,'house_land'))}${option('Земельный участок', 'Категория, ВРИ, межевание, ограничения.', 'set:objectCategory:land', is(state.deal.objectCategory,'land'))}${option('Новостройка / ДДУ / уступка', 'Застройщик, ДДУ, уступка, эскроу.', 'set:objectCategory:new_building', is(state.deal.objectCategory,'new_building'))}${option('Коммерция', 'Юрлица, назначение, арендатор, НДС.', 'set:objectCategory:commercial', is(state.deal.objectCategory,'commercial'))}</div>${state.deal.objectCategory === 'flat' ? `<div class="card" style="box-shadow:none;margin-top:12px"><h3>Какая квартира?</h3><div class="option-grid">${option('Квартира в МКД', 'Обычная квартира в многоквартирном доме.', 'set:apartmentKind:flat_mkd', is(state.deal.apartmentKind,'flat_mkd'))}${option('Квартира на земле', 'Проверим землю, статус, вход и коммуникации.', 'set:apartmentKind:flat_ground', is(state.deal.apartmentKind,'flat_ground'))}</div></div>` : ''}`;
}
function stepObjectDetails() {
  const type = state.deal.objectType;
  let specific = '';
  if (type === 'flat_mkd') specific = `<div class="grid"><div>${field('floor','Этаж')}</div><div>${field('roomsCount','Количество комнат')}</div></div>${textarea('registeredPeople','Кто зарегистрирован?', 'Есть ли дети, временная регистрация, когда выписка?')}${textarea('redevelopment','Перепланировка / особенности', 'Есть ли перепланировка, перенос мокрых зон?')}`;
  if (type === 'flat_ground') specific = `${hint('Почему это отдельный сценарий', 'Квартира на земле часто имеет вопросы по земле, входу, коммуникациям и статусу дома. Это лучше уточнить до задатка.')}<div class="grid"><div>${field('landCadastralNumber','Кадастровый номер земли')}</div><div>${field('landStatus','Статус земли / участка')}</div></div>${textarea('flatGroundComment','Особенности квартиры на земле', 'Отдельный вход, коммуникации, доля земли, порядок пользования.')}`;
  if (type === 'room') specific = `<div class="grid"><div>${field('roomArea','Площадь комнаты')}</div><div>${field('roomType','Комната где?', 'text', 'квартира, общежитие, коммуналка')}</div></div>${textarea('commonAreas','Места общего пользования и соседи', 'Кухня/санузел, конфликт, порядок пользования, зарегистрированные?')}`;
  if (type === 'share') specific = `<div class="grid"><div>${field('shareSize','Размер доли', 'text', 'например 1/2, 1/3')}</div><div>${field('coOwnersCount','Сколько сособственников?')}</div></div>${textarea('shareNotices','Уведомления/отказы', 'Направлялись ли уведомления, есть ли отказы, кто готовит нотариуса?')}`;
  if (type === 'house_land') specific = `<div class="grid"><div>${field('houseCadastralNumber','Кадастровый номер дома')}</div><div>${field('landCadastralNumber','Кадастровый номер земли')}</div></div><div class="grid"><div>${field('landCategory','Категория земли')}</div><div>${field('landUse','ВРИ')}</div></div>${textarea('boundariesComment','Межевание, границы, коммуникации', 'Подъезд, газ/свет/вода, совпадают ли собственники дома и земли?')}`;
  if (type === 'land') specific = `<div class="grid"><div>${field('landCadastralNumber','Кадастровый номер участка')}</div><div>${field('landArea','Площадь участка')}</div></div><div class="grid"><div>${field('landCategory','Категория земли')}</div><div>${field('landUse','ВРИ')}</div></div>${textarea('landComment','Ограничения и коммуникации', 'Межевание, подъезд, охранные зоны, ЛЭП, газ, вода, строения.')}`;
  if (type === 'new_building') specific = `<div class="grid"><div>${field('developer','Застройщик')}</div><div>${field('contractType','ДДУ / уступка / готовая квартира')}</div></div>${textarea('newBuildingComment','Особенности новостройки', 'Эскроу, акт, уступка, ипотека, остаток оплаты, сроки.')}`;
  if (type === 'commercial') specific = `<div class="grid"><div>${field('commercialPurpose','Назначение помещения')}</div><div>${field('ownerLegalStatus','Собственник физлицо/юрлицо?')}</div></div>${textarea('tenantComment','Арендатор, НДС, ограничения', 'Аренда, НДС, обременения, отдельный вход.')}`;
  return `<h2>Детали объекта</h2><div class="grid"><div>${field('address','Адрес / ориентир', 'text', 'город, улица, дом')}</div><div>${field('cadastralNumber','Кадастровый номер', 'text', 'если есть')}</div></div><div class="grid"><div>${field('priceTotal','Цена объекта', 'number')}</div><div>${field('depositAmount','Планируемый задаток/аванс', 'number')}</div></div>${specific}${textarea('objectComment','Комментарий по объекту', 'Что важно знать юристу/руководителю?')}`;
}
function stepSeller() {
  const flags = effectiveFlags();
  return `<h2>Продавец и право</h2><p class="muted">Здесь можно выбрать несколько пунктов. Например: несколько продавцов + доли + супруг + доверенность + наследство.</p><h3>Состав и особенности продавца</h3><div class="option-grid">${option('Один взрослый продавец', 'Если продавец один. Можно сочетать с долей, супругом, доверенностью.', 'sellerFlag:oneAdultSeller', flags.includes('oneAdultSeller'))}${option('Несколько продавцов', 'Можно сочетать с ребёнком, супругом, доверенностью, долями.', 'sellerFlag:manySellers', flags.includes('manySellers'))}${option('Есть ребёнок-собственник', 'Стоп-фактор до юриста.', 'sellerFlag:minorSeller', flags.includes('minorSeller'))}${option('Продаются доли / доля', 'Нотариус, уведомления, сособственники.', 'sellerFlag:shares', flags.includes('shares'))}${option('Есть супруг/супруга', 'Согласие или брачный режим.', 'sellerFlag:spouse', flags.includes('spouse'))}${option('Продажа по доверенности', 'Проверить полномочия и право получения денег.', 'sellerFlag:powerOfAttorney', flags.includes('powerOfAttorney'))}${option('Продавец не будет лично', 'Нужно понять представителя и документы.', 'sellerFlag:sellerWillNotAttend', flags.includes('sellerWillNotAttend'))}${option('Есть арест/обременение', 'Юрист до задатка.', 'sellerFlag:encumbrance', flags.includes('encumbrance'))}</div>${hint('Как выбирать', 'Выбирайте все факты, которые одновременно есть в ситуации. Исключение только одно: “один взрослый продавец” снимается, если выбираете “несколько продавцов” или “ребёнок-собственник”.')}<h3>Основание права</h3><div class="option-grid">${option('ДКП', '', 'toggle:basis:sale', has('basis','sale'))}${option('Дарение', '', 'toggle:basis:gift', has('basis','gift'))}${option('Наследство по закону', '', 'toggle:basis:inheritLaw', has('basis','inheritLaw'))}${option('Наследство по завещанию', '', 'toggle:basis:inheritWill', has('basis','inheritWill'))}${option('Приватизация', '', 'toggle:basis:privat', has('basis','privat'))}${option('ДДУ / уступка', '', 'toggle:basis:ddu', has('basis','ddu'))}${option('Решение суда', 'Юрист до задатка.', 'toggle:basis:court', has('basis','court'))}${option('Иное', 'Опишите в комментарии.', 'toggle:basis:other', has('basis','other'))}</div>${flags.includes('powerOfAttorney') ? `<div class="grid"><div>${field('proxyDate','Дата доверенности')}</div><div>${field('proxyPowers','Какие полномочия?', 'text', 'продажа, подписание, получение денег')}</div></div>` : ''}${flags.includes('shares') ? textarea('shareSellerComment','Доли / сособственники', 'Размер долей, уведомления, отказы, кто готовит нотариуса?') : ''}${flags.includes('minorSeller') ? textarea('childSellerComment','Ребёнок-собственник / опека', 'Есть ли встречная покупка, какое разрешение опеки, куда выделяется доля?') : ''}${textarea('sellerComment','Комментарий по продавцу', 'Кто собственник, кто будет на задатке/сделке, какие документы есть, чего не хватает?')}`;
}
function stepBuyer() {
  return `<h2>Покупатель</h2><p class="muted">Появляется, когда покупатель уже есть или мы сопровождаем покупателя.</p><div class="option-grid">${option('Покупает один взрослый', 'Простой сценарий.', 'set:buyerMode:one', is(state.deal.buyerMode,'one'))}${option('Покупателей несколько', 'Нужно понять доли и кто платит.', 'set:buyerMode:multiple', is(state.deal.buyerMode,'multiple'))}${option('Есть ребёнок-покупатель', 'Маткапитал/доли/опека.', 'toggle:flags:minorBuyer', has('flags','minorBuyer'))}${option('Покупатель продаёт свой объект', 'Возможна цепочка.', 'set:buyerChain:true', state.deal.buyerChain === true)}</div><div class="grid"><div>${field('buyerName','Имя покупателя')}</div><div>${field('buyerPhone','Телефон покупателя')}</div></div>${textarea('buyerComment','Комментарий по покупателю', 'Кто принимает решение, готов ли к задатку, есть ли цепочка?')}`;
}
function stepMoney() {
  return `<h2>Деньги покупателя</h2><p class="muted">Ипотека, маткапитал и сертификаты включают брокерский сценарий.</p><div class="option-grid">${option('Собственные средства', 'Деньги готовы или будут готовы.', 'toggle:payments:cash', has('payments','cash'))}${option('Ипотека', 'Банк, одобрение, оценка, страховка.', 'toggle:payments:mortgage', has('payments','mortgage'))}${option('Маткапитал', 'Доли детям и сроки СФР.', 'toggle:payments:matcap', has('payments','matcap'))}${option('Сертификат / субсидия', 'Срок и условия использования.', 'toggle:payments:certificate', has('payments','certificate'))}${option('Военная ипотека / НИС', 'Особые требования.', 'toggle:payments:militaryMortgage', has('payments','militaryMortgage'))}${option('Детский номинальный счёт', 'Юрист до движения денег.', 'toggle:payments:nominalChild', has('payments','nominalChild'))}${option('Деньги детей / СВО', 'Юрист до задатка.', 'toggle:payments:svoChildAccount', has('payments','svoChildAccount'))}${option('Рассрочка / остаток долга', 'Нужно безопасно закрепить условия.', 'toggle:payments:installment', has('payments','installment'))}</div>${hasBrokerTrigger() ? `<div class="status warn">Брокерский сценарий: банк, одобрение, оценка, страховка, СФР или сертификат.</div><div class="grid"><div>${field('bankName','Банк / программа')}</div><div>${field('mortgageApproved','Одобрение есть?', 'text', 'да/нет/в процессе')}</div></div>` : ''}${textarea('moneyComment','Комментарий по деньгам', 'Где деньги, когда готовы, условия банка/сертификата/маткапитала?')}`;
}
function stepDeposit() {
  return `<h2>Условия задатка</h2><p class="muted">Появляется только если сценарий близок к задатку.</p><div class="grid"><div>${field('depositAmount','Сумма задатка/аванса', 'number')}</div><div>${field('depositDate','Когда планируется задаток?')}</div></div><div class="grid"><div>${field('depositPlace','Где подписываем?')}</div><div>${field('depositReceiver','Кто получает деньги?')}</div></div>${textarea('depositConditions','Что фиксируем в задатке?', 'Цена, сроки сделки, освобождение, мебель, расходы, ответственность.')}${state.deal.stage === 'deposit_exists' ? textarea('existingDepositComment','Что уже подписали по задатку?', 'Дата, сумма, кто подписал, спорные условия.') : ''}`;
}
function stepTerms() {
  return `<h2>Расчёты и расходы</h2><p class="muted">Объединённый блок, чтобы не дублировать похожие вопросы перед задатком или сделкой.</p><h3>Когда и как продавец получает деньги?</h3><div class="option-grid">${option('Перед сделкой', '', 'toggle:settlements:beforeDeal', has('settlements','beforeDeal'))}${option('На сделке', '', 'toggle:settlements:onDeal', has('settlements','onDeal'))}${option('СБР', '', 'toggle:settlements:sbr', has('settlements','sbr'))}${option('Аккредитив', '', 'toggle:settlements:accreditive', has('settlements','accreditive'))}${option('Ячейка', '', 'toggle:settlements:cell', has('settlements','cell'))}${option('Депозит нотариуса', '', 'toggle:settlements:notaryDeposit', has('settlements','notaryDeposit'))}${option('После регистрации', 'Нужна защита продавца.', 'toggle:settlements:afterRegistration', has('settlements','afterRegistration'))}${option('СФР / сертификат после регистрации', 'Продавец ждёт часть денег.', 'toggle:settlements:pensionFund', has('settlements','pensionFund'))}</div><div class="option-grid">${option('Расчёты согласованы', 'Можно фиксировать условия.', 'set:settlementsAgreed:true', state.deal.settlementsAgreed === true)}${option('Расчёты НЕ согласованы', 'Уточнить до задатка.', 'set:settlementsAgreed:false', state.deal.settlementsAgreed === false)}</div><h3>Расходы</h3><div class="option-grid">${option('Расходы согласованы', 'Стороны понимают, кто что платит.', 'set:expensesAgreed:true', state.deal.expensesAgreed === true)}${option('Расходы НЕ согласованы', 'Нужно согласовать до задатка.', 'set:expensesAgreed:false', state.deal.expensesAgreed === false)}${option('Нотариус — покупатель', '', 'set:notaryPayer:buyer', is(state.deal.notaryPayer,'buyer'))}${option('Нотариус — продавец', '', 'set:notaryPayer:seller', is(state.deal.notaryPayer,'seller'))}${option('Нотариус пополам', '', 'set:notaryPayer:split', is(state.deal.notaryPayer,'split'))}${option('Нотариус не нужен/не ясно', '', 'set:notaryPayer:unknown', is(state.deal.notaryPayer,'unknown'))}</div><div class="grid"><div>${field('buyerCompanyFee','Комиссия покупателя', 'number')}</div><div>${field('sellerCompanyFee','Комиссия продавца', 'number')}</div></div>${textarea('settlementsComment','Комментарий по расчётам', 'Когда деньги, кто пишет расписку, как защищаем стороны?')}${textarea('expensesComment','Комментарий по расходам', 'Нотариус, госпошлина, банк, СБР, оценка, справки, доверенности.')}`;
}
function stepRisks() {
  const flags = effectiveFlags();
  return `<h2>Дополнительные риски</h2><p class="muted">Этот блок не повторяет “Продавца”. Здесь отмечайте то, что не попало в предыдущие блоки или всплыло в разговоре.</p>${chips(flags.map((item) => labels.flags[item] || item))}<div class="option-grid">${option('Зарегистрированы дети', 'Проверить выписку и сроки выписки.', 'toggle:flags:minorRegistered', flags.includes('minorRegistered'))}${option('Долги/коммунальные вопросы', 'Уточнить справки и оплату.', 'sellerFlag:unpaidUtilities', flags.includes('unpaidUtilities'))}${option('Перепланировка', 'Проверить документы и согласование.', 'sellerFlag:redevelopment', flags.includes('redevelopment'))}${option('Альтернативная сделка / цепочка', 'Зависимые сроки и условия.', 'sellerFlag:alternativeDeal', flags.includes('alternativeDeal'))}${option('Сжатые сроки', 'Нужно сразу определить ответственных.', 'sellerFlag:urgentTerms', flags.includes('urgentTerms'))}${option('Риск банкротства продавца', 'Нужна проверка.', 'sellerFlag:sellerBankruptcyRisk', flags.includes('sellerBankruptcyRisk'))}</div>${textarea('riskComment','Что именно настораживает?', 'Кто против, каких документов нет, что уже обещали, что срочно?')}`;
}
function handoffText() {
  const r = readiness();
  const a = analysis();
  const lines = ['Передача заявки от СПН', '', `Что готовим: ${titleOf('preparationMode', state.deal.preparationMode)}`, `Кого сопровождаем: ${titleOf('representation', state.deal.representation)}`, `Стадия: ${titleOf('stage', state.deal.stage)}`, `Объект: ${titleOf('objectType', state.deal.objectType)}`, `Адрес: ${state.deal.address || 'не указан'}`, `Цена: ${state.deal.priceTotal || 'не указана'}`, `Задаток/аванс: ${state.deal.depositAmount || 'не указан'}`, '', `Продавец: ${hasSeller() ? 'есть/нужно уточнить' : 'не требуется на этом этапе'}`, `Покупатель: ${hasBuyer() ? 'есть/нужно уточнить' : 'не требуется на этом этапе'}`, `Деньги: ${listText('payments')}`, `Основание права: ${listText('basis')}`, `Расчёты: ${listText('settlements')}`, `Расходы согласованы: ${yesNo(state.deal.expensesAgreed)}`, `Расчёты согласованы: ${yesNo(state.deal.settlementsAgreed)}`, '', `Готовность карточки: ${r.percent}%`, `Риск: ${a.risk}`, a.blockers.length ? `Стоп-факторы: ${a.blockers.join('; ')}` : '', a.notes.length ? `Замечания: ${a.notes.join('; ')}` : '', '', `Следующий шаг с клиентом: ${state.deal.clientNextStep || 'не указан'}`, '', `Комментарий СПН: ${state.deal.spnFinalComment || state.deal.riskComment || state.deal.stageComment || 'нет'}`];
  return lines.filter((line) => line !== '').join('\n');
}
function stepFinish() {
  const r = readiness();
  const a = analysis();
  return `<h2>Итог и передача</h2><p class="muted">Проверьте готовность. Можно сохранить черновик и открыть карточку сделки.</p><div class="grid"><div class="card" style="box-shadow:none"><h3>Готовность</h3><div class="progress"><i style="width:${r.percent}%"></i></div><p><b>${r.percent}%</b></p>${r.missing.length ? `<ul>${r.missing.map((item) => `<li>${esc(item.title)} — ${esc(item.help)}</li>`).join('')}</ul>` : '<div class="status ok">Основные поля заполнены.</div>'}</div><div class="card" style="box-shadow:none"><h3>Маршрут</h3>${chips(routeReason(computeRoute()))}<div class="status ${a.risk === 'red' ? 'error' : a.risk === 'yellow' ? 'warn' : 'ok'}">${a.blockers[0] || a.notes[0] || 'Явных стоп-факторов нет.'}</div></div></div><div class="grid"><div>${textarea('clientNextStep','Ближайший шаг с клиентом', 'Позвонить, запросить документы, назначить задаток, подключить юриста...')}</div><div>${textarea('spnFinalComment','Финальный комментарий СПН', 'Что важно передать менеджеру/юристу/брокеру?')}</div></div><div class="field"><label>Текст передачи</label><textarea id="handoffText" readonly>${esc(handoffText())}</textarea></div><div class="actions" style="justify-content:flex-start"><button class="btn light" type="button" data-action="copy">Скопировать текст передачи</button></div>`;
}
function progressPanel(route) {
  const a = analysis();
  const r = readiness();
  const reasons = routeReason(route);
  return `<div class="card" style="box-shadow:none;margin-top:12px"><h3>Почему такой маршрут</h3>${chips(reasons)}<div class="progress"><i style="width:${Math.round(((state.stepIndex + 1) / route.length) * 100)}%"></i></div><div class="status ${a.risk === 'red' ? 'error' : a.risk === 'yellow' ? 'warn' : 'ok'}">Готовность: ${r.percent}%. ${a.blockers[0] ? esc(a.blockers[0]) : a.notes[0] ? esc(a.notes[0]) : 'Явных стоп-факторов пока нет.'}</div></div>`;
}
function render() {
  const route = computeRoute();
  clampStep(route);
  const step = route[state.stepIndex];
  const app = document.getElementById('app');
  app.innerHTML = `<main class="nav-v2-shell"><section class="hero"><h1>Новая сделка</h1><p>Умный мастер: первые ответы меняют дальнейшие вопросы. Лишние блоки скрываются, нужные появляются автоматически.</p></section><section class="stepper"><aside class="steps card"><h3>Шаги</h3><div class="step-list">${route.map((item, index) => `<button class="step-pill ${index === state.stepIndex ? 'active' : ''}" type="button" data-action="step:${index}"><b>${index + 1}. ${esc(item.title)}</b><span>${esc(item.hint)}</span></button>`).join('')}</div>${progressPanel(route)}</aside><section class="card"><div class="section-title"><div><span class="pill blue">Шаг ${state.stepIndex + 1} из ${route.length}</span></div><button class="btn light" type="button" data-action="clear">Очистить черновик</button></div>${step.render()}<div id="pageStatus"></div><div class="actions"><button class="btn light" type="button" data-action="prev" ${state.stepIndex === 0 ? 'disabled' : ''}>Назад</button><div><button class="btn light" type="button" data-action="draft">Сохранить черновик</button>${state.stepIndex < route.length - 1 ? '<button class="btn primary" type="button" data-action="next">Далее</button>' : `<button class="btn green" type="button" data-action="save" ${isSaving ? 'disabled' : ''}>${isSaving ? 'Сохраняю...' : 'Сохранить и открыть карточку'}</button>`}</div></div></section></section></main>`;
}
function setStatus(text, type = 'info') { const el = document.getElementById('pageStatus'); if (el) { el.className = 'status ' + type; el.textContent = text; } }
function syncHandoff() { const field = document.getElementById('handoffText'); if (field) field.value = handoffText(); }
function handleAction(action) {
  if (!action || isSaving) return;
  const route = computeRoute();
  const [type, key, raw] = action.split(':');
  if (type === 'set') { let value = raw; if (raw === 'true') value = true; if (raw === 'false') value = false; setDeal(key, value); return; }
  if (type === 'toggle') { toggleDeal(key, raw); return; }
  if (type === 'sellerFlag') { toggleSellerFlag(key); return; }
  if (type === 'step') { state.stepIndex = Number(key); render(); return; }
  if (type === 'prev') { state.stepIndex = Math.max(0, state.stepIndex - 1); render(); return; }
  if (type === 'next') { state.stepIndex = Math.min(route.length - 1, state.stepIndex + 1); render(); return; }
  if (type === 'draft') { saveDraft(); setStatus('Черновик сохранён в браузере.', 'ok'); return; }
  if (type === 'clear') { if (confirm('Очистить черновик новой сделки?')) { localStorage.removeItem(DRAFT_KEY); state.deal = {}; state.stepIndex = 0; render(); } return; }
  if (type === 'copy') { copyHandoff(); return; }
  if (type === 'save') saveDeal();
}
function copyHandoff() {
  const text = handoffText();
  const field = document.getElementById('handoffText');
  if (field) field.value = text;
  navigator.clipboard?.writeText(text).then(() => setStatus('Текст передачи скопирован.', 'ok'), () => { if (field) { field.focus(); field.select(); } setStatus('Не удалось скопировать автоматически. Текст выделен, скопируйте вручную.', 'warn'); });
}
function normalizeText(value) { return String(value || '').trim().toLowerCase(); }
async function findRecentlyCreatedDeal(maxAttempts = 4) {
  const address = normalizeText(state.deal.address);
  const objectType = normalizeText(state.deal.objectType);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const data = await rpc('nav_v2_get_deals_list', { p_limit: 50 }, 30000);
      const items = data.items || [];
      const byAddress = address ? items.find((deal) => normalizeText(deal.address) === address) : null;
      if (byAddress) return byAddress;
      const byType = objectType ? items.find((deal) => normalizeText(deal.object_type) === objectType) : null;
      if (byType && attempt >= 2) return byType;
    } catch (_) {}
    await sleep(1500 * attempt);
  }
  return null;
}
function savePayload() {
  const a = analysis();
  const r = readiness();
  return { deal: { ...state.deal, flags: a.flags, readiness_local: { card: r.percent, missing: r.missing.map((item) => item.title), blockers: a.blockers, notes: a.notes, smart_route: computeRoute().map((item) => item.id) }, spn_final: { comment: state.deal.spnFinalComment || state.deal.riskComment || '', next_step: state.deal.clientNextStep || '', handoff_text: handoffText() } } };
}
async function saveDeal() {
  if (isSaving) return;
  const r = readiness();
  if (r.percent < 45 && !confirm('Заявка заполнена слабо. Всё равно сохранить черновик в CRM?')) return;
  isSaving = true;
  render();
  try {
    setStatus('Сохраняю сделку в CRM... Иногда Supabase отвечает медленно, дождитесь результата и не нажимайте повторно.', 'info');
    const saved = await rpc('nav_v2_save_wizard_result', { p_result: savePayload() }, 45000);
    localStorage.removeItem(DRAFT_KEY);
    setStatus('Сделка сохранена. Открываю карточку...', 'ok');
    setTimeout(() => { location.href = `./deal-card-v2.html?id=${saved.id}`; }, 500);
  } catch (error) {
    setStatus('Ответ от сохранения не получен быстро. Проверяю базу, это может занять до минуты...', 'info');
    const found = await findRecentlyCreatedDeal(4);
    if (found?.id) {
      localStorage.removeItem(DRAFT_KEY);
      setStatus('Сделка найдена в базе. Открываю карточку...', 'ok');
      setTimeout(() => { location.href = `./deal-card-v2.html?id=${found.id}`; }, 500);
      return;
    }
    isSaving = false;
    render();
    setStatus('Не удалось подтвердить сохранение. Не нажимайте повторно сразу: сначала откройте список сделок и проверьте, появилась ли заявка. Техническая ошибка: ' + (error.message || error), 'error');
  }
}

document.addEventListener('input', (event) => {
  const field = event.target?.closest?.('[data-field]');
  if (!field || isSaving) return;
  state.deal[field.dataset.field] = field.value;
  saveDraft();
  syncHandoff();
});
document.addEventListener('pointerup', (event) => {
  if (event.defaultPrevented) return;
  if (event.button !== undefined && event.button !== 0) return;
  const target = event.target?.closest?.('[data-action]');
  if (!target || target.disabled) return;
  lastPointerAction = Date.now();
  event.preventDefault();
  event.stopPropagation();
  handleAction(target.dataset.action);
}, true);
document.addEventListener('click', (event) => {
  const target = event.target?.closest?.('[data-action]');
  if (!target || target.disabled) return;
  if (Date.now() - lastPointerAction < 450) { event.preventDefault(); return; }
  event.preventDefault();
  handleAction(target.dataset.action);
});
function init() { if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload()); render(); }
init();
