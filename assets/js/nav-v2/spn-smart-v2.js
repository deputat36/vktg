import { getCachedUser, renderAuthBox, rpc, esc, riskPill } from './supabase-v2.js';

const DRAFT_KEY = 'nav_deal_draft_v2';

const state = {
  stepIndex: 0,
  deal: readDraft()
};

let isSaving = false;
let lastPointerAction = 0;

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}
function saveDraft() { localStorage.setItem(DRAFT_KEY, JSON.stringify(state.deal)); }
function arr(key) { return Array.isArray(state.deal[key]) ? state.deal[key] : []; }
function filled(value) { return String(value ?? '').trim().length > 0; }
function moneyFilled(value) { return Number(String(value || '').replace(',', '.')) > 0; }
function is(value, expected) { return String(value || '') === String(expected); }
function has(key, value) { return arr(key).includes(value); }
function setDeal(key, value) {
  state.deal[key] = value;

  if (key === 'objectCategory') {
    if (value !== 'flat') delete state.deal.apartmentKind;
    const direct = { room: 'room', share: 'share', house_land: 'house_land', land: 'land', new_building: 'new_building', commercial: 'commercial' };
    if (direct[value]) state.deal.objectType = direct[value];
    if (value === 'flat') delete state.deal.objectType;
  }
  if (key === 'apartmentKind') state.deal.objectType = value;
  if (key === 'hasSeller' && value === 'false') state.deal.hasSeller = false;
  if (key === 'hasSeller' && value === 'true') state.deal.hasSeller = true;
  if (key === 'hasBuyer' && value === 'false') state.deal.hasBuyer = false;
  if (key === 'hasBuyer' && value === 'true') state.deal.hasBuyer = true;

  saveDraft();
  render();
}
function toggleDeal(key, value) {
  const current = arr(key);
  state.deal[key] = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
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

const labels = {
  preparationMode: {
    consult: 'консультация',
    deposit: 'задаток',
    deal: 'сделка',
    check_docs: 'проверка документов',
    rework: 'доработка заявки'
  },
  representation: {
    seller: 'только продавца',
    buyer: 'только покупателя',
    one_spn_both: 'обе стороны, один СПН',
    both: 'обе стороны, два СПН',
    partner_agency: 'партнерская сделка',
    unknown: 'пока не ясно'
  },
  stage: {
    lead_only: 'есть только клиент',
    object_chosen: 'объект выбран',
    terms_discussed: 'стороны договорились',
    urgent_deposit: 'срочно готовим задаток',
    deposit_exists: 'задаток уже был',
    main_deal: 'готовим основную сделку',
    legal_problem: 'есть проблема, нужен юрист'
  },
  objectType: {
    flat_mkd: 'квартира в МКД',
    flat_ground: 'квартира на земле',
    room: 'комната',
    share: 'доля',
    house_land: 'дом с участком',
    land: 'земельный участок',
    new_building: 'новостройка / ДДУ / уступка',
    commercial: 'коммерция'
  },
  payments: {
    cash: 'собственные средства',
    mortgage: 'ипотека',
    matcap: 'маткапитал',
    certificate: 'сертификат / субсидия',
    militaryMortgage: 'военная ипотека / НИС',
    nominalChild: 'детский номинальный счет',
    svoChildAccount: 'деньги детей / СВО',
    installment: 'рассрочка / остаток долга'
  },
  basis: {
    sale: 'ДКП',
    gift: 'дарение',
    inheritLaw: 'наследство по закону',
    inheritWill: 'наследство по завещанию',
    privat: 'приватизация',
    ddu: 'ДДУ / уступка',
    court: 'решение суда',
    other: 'иное'
  },
  settlements: {
    beforeDeal: 'перед сделкой',
    onDeal: 'на сделке',
    sbr: 'СБР',
    accreditive: 'аккредитив',
    cell: 'ячейка',
    notaryDeposit: 'депозит нотариуса',
    afterRegistration: 'после регистрации',
    pensionFund: 'СФР / сертификат после регистрации'
  },
  notaryPayer: {
    buyer: 'нотариус — покупатель',
    seller: 'нотариус — продавец',
    split: 'нотариус пополам',
    unknown: 'не нужен / не ясно'
  }
};
function titleOf(map, value) { return labels[map]?.[value] || value || 'не указано'; }
function listText(key) { return arr(key).map((item) => labels[key]?.[item] || item).join(', ') || 'не указано'; }
function yesNo(value) { return value === true ? 'да' : value === false ? 'нет' : 'не указано'; }

function derivedFlags() {
  const flags = new Set(arr('flags'));
  if (state.deal.ownerMode === 'one') flags.add('oneAdultSeller');
  if (state.deal.ownerMode === 'multiple') flags.add('manySellers');
  if (state.deal.ownerMode === 'minor') flags.add('minorSeller');
  if (state.deal.ownerMode === 'share') flags.add('shares');
  if (state.deal.objectType === 'share') flags.add('shares');
  if (state.deal.sellerHasSpouse === true) flags.add('spouse');
  if (state.deal.sellerByProxy === true) flags.add('powerOfAttorney');
  return [...flags];
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
function needsDeposit() {
  return state.deal.preparationMode === 'deposit'
    || ['urgent_deposit', 'deposit_exists'].includes(state.deal.stage)
    || (hasSeller() && hasBuyer() && ['terms_discussed', 'main_deal'].includes(state.deal.stage));
}
function needsSettlements() {
  return ['deposit', 'deal'].includes(state.deal.preparationMode)
    || ['urgent_deposit', 'deposit_exists', 'main_deal', 'terms_discussed'].includes(state.deal.stage);
}
function needsExpenses() {
  return ['deposit', 'deal'].includes(state.deal.preparationMode)
    || ['urgent_deposit', 'deposit_exists', 'main_deal', 'terms_discussed'].includes(state.deal.stage)
    || ['one_spn_both', 'both', 'partner_agency'].includes(state.deal.representation);
}
function hasBrokerTrigger() {
  return arr('payments').some((item) => ['mortgage', 'militaryMortgage', 'matcap', 'certificate'].includes(item));
}
function hasLawyerTrigger() {
  const flags = derivedFlags();
  return flags.some((item) => ['minorSeller', 'minorBuyer', 'minorRegistered', 'powerOfAttorney', 'shares', 'spouse'].includes(item))
    || arr('basis').some((item) => ['inheritLaw', 'inheritWill', 'privat', 'court'].includes(item))
    || state.deal.stage === 'legal_problem'
    || arr('settlements').includes('afterRegistration')
    || state.deal.objectType === 'share';
}

function analysis() {
  const flags = derivedFlags();
  const children = flags.some((item) => ['minorSeller', 'minorBuyer', 'minorRegistered'].includes(item))
    || arr('payments').some((item) => ['matcap', 'nominalChild', 'svoChildAccount'].includes(item));
  const blockers = [];
  const notes = [];
  if (children) blockers.push('Дети, опека или детские деньги — до задатка обязательно показать юристу.');
  if (flags.includes('powerOfAttorney')) notes.push('Доверенность нужно проверить до задатка: полномочия, срок, право получения денег.');
  if (flags.includes('shares') || state.deal.objectType === 'share') notes.push('Доли почти всегда требуют проверки нотариуса и уведомлений/отказов.');
  if (arr('basis').some((item) => ['inheritLaw', 'inheritWill', 'privat', 'court'].includes(item))) notes.push('Основание права требует юридической проверки.');
  if (arr('settlements').includes('afterRegistration') && state.deal.settlementsAgreed !== true) blockers.push('Расчет после регистрации без согласованного механизма защиты продавца.');
  if (needsDeposit() && state.deal.expensesAgreed !== true) notes.push('Перед задатком нужно согласовать расходы сторон.');
  if (needsDeposit() && state.deal.settlementsAgreed !== true) notes.push('Перед задатком нужно согласовать порядок расчетов.');
  if (hasBrokerTrigger()) notes.push('Есть ипотека, маткапитал или сертификат — подключить брокера.');
  const risk = blockers.length ? 'red' : notes.length ? 'yellow' : 'green';
  return { flags, children, blockers, notes, risk, needsLawyer: hasLawyerTrigger() || blockers.length > 0, needsBroker: hasBrokerTrigger() };
}
function check(title, done, help, group = 'base') { return { title, done: Boolean(done), help, group }; }
function readiness() {
  const checks = [
    check('Понятно, что готовим', filled(state.deal.preparationMode), 'Выберите консультацию, задаток, сделку или проверку документов.'),
    check('Понятно, кого сопровождаем', filled(state.deal.representation), 'Выберите сторону: продавец, покупатель, обе стороны или партнерская сделка.'),
    check('Понятна стадия ситуации', filled(state.deal.stage), 'Укажите, есть ли уже объект, покупатель, условия, задаток или проблема.'),
    check('Выбран тип объекта', filled(state.deal.objectType), 'Выберите конкретный тип объекта: квартира в МКД, квартира на земле, комната, доля и т.д.'),
    check('Указан адрес или ориентир', filled(state.deal.address) || state.deal.stage === 'lead_only', 'Для задатка и сделки нужен адрес или понятный ориентир.', 'object')
  ];
  if (hasSeller()) checks.push(check('Заполнен блок продавца', filled(state.deal.ownerMode) || arr('basis').length > 0, 'Укажите собственников, основание права и особые условия.', 'seller'));
  if (hasBuyer()) checks.push(check('Заполнен блок покупателя', arr('payments').length > 0 || filled(state.deal.buyerPhone), 'Укажите источник денег и контакт/состав покупателей.', 'buyer'));
  if (needsDeposit()) checks.push(check('Есть условия задатка', moneyFilled(state.deal.depositAmount) || filled(state.deal.depositDate), 'Укажите сумму, дату или место задатка.', 'deposit'));
  if (needsSettlements()) checks.push(check('Порядок расчетов согласован', state.deal.settlementsAgreed === true, 'Отметьте способ и согласованность расчетов.', 'settlements'));
  if (needsExpenses()) checks.push(check('Расходы согласованы', state.deal.expensesAgreed === true, 'Отметьте, кто платит нотариуса, банк, госпошлину, справки и комиссию.', 'expenses'));
  checks.push(check('Есть следующий шаг', filled(state.deal.clientNextStep), 'Укажите, что делать дальше: документы, задаток, звонок, юрист, брокер.', 'finish'));

  const done = checks.filter((item) => item.done).length;
  const percent = Math.round((done / Math.max(checks.length, 1)) * 100);
  return { checks, percent, missing: checks.filter((item) => !item.done) };
}

function computeRoute() {
  const route = [
    { id: 'scenario', title: 'Что готовим', hint: 'задача', render: stepScenario },
    { id: 'representation', title: 'Сторона', hint: 'кого сопровождаем', render: stepRepresentation },
    { id: 'stage', title: 'Стадия', hint: 'где сейчас сделка', render: stepStage },
    { id: 'object', title: 'Объект', hint: 'тип объекта', render: stepObjectType }
  ];
  if (filled(state.deal.objectCategory) || filled(state.deal.objectType)) route.push({ id: 'object_details', title: 'Детали объекта', hint: titleOf('objectType', state.deal.objectType), render: stepObjectDetails });
  if (hasSeller()) route.push({ id: 'seller', title: 'Продавец', hint: 'право и документы', render: stepSeller });
  if (hasBuyer()) route.push({ id: 'buyer', title: 'Покупатель', hint: 'деньги и состав', render: stepBuyer });
  if (hasBuyer() || ['deposit', 'deal'].includes(state.deal.preparationMode)) route.push({ id: 'money', title: 'Деньги', hint: 'ипотека/маткапитал', render: stepMoney });
  if (needsDeposit()) route.push({ id: 'deposit', title: 'Задаток', hint: 'условия задатка', render: stepDeposit });
  if (needsSettlements()) route.push({ id: 'settlements', title: 'Расчёты', hint: 'как передаются деньги', render: stepSettlements });
  if (needsExpenses()) route.push({ id: 'expenses', title: 'Расходы', hint: 'кто что платит', render: stepExpenses });
  route.push({ id: 'risks', title: 'Риски', hint: 'особые условия', render: stepRisks });
  route.push({ id: 'finish', title: 'Итог', hint: 'готовность и передача', render: stepFinish });
  return route;
}
function clampStep(route) {
  if (state.stepIndex < 0) state.stepIndex = 0;
  if (state.stepIndex > route.length - 1) state.stepIndex = route.length - 1;
}

function stepScenario() {
  return `<h2>Что сейчас нужно подготовить?</h2>
    <p class="muted">Первый ответ определяет весь маршрут. Для консультации вопросов будет меньше, для задатка и сделки — больше проверок.</p>
    <div class="option-grid">
      ${option('Консультация / первичная ситуация', 'Когда ещё нет полной сделки, но нужно быстро понять, что спросить у клиента.', 'set:preparationMode:consult', is(state.deal.preparationMode, 'consult'))}
      ${option('Подготовка к задатку', 'Нужны цена, стороны, сумма задатка, стоп-факторы, расходы и расчёты.', 'set:preparationMode:deposit', is(state.deal.preparationMode, 'deposit'))}
      ${option('Подготовка сделки', 'Нужен более полный маршрут: документы, расчёты, расходы, юрист/брокер.', 'set:preparationMode:deal', is(state.deal.preparationMode, 'deal'))}
      ${option('Проверка объекта / документов', 'Когда нужно понять, можно ли двигаться дальше.', 'set:preparationMode:check_docs', is(state.deal.preparationMode, 'check_docs'))}
      ${option('Доработка ранее созданной заявки', 'Когда уже есть замечания или нужно дозаполнить пробелы.', 'set:preparationMode:rework', is(state.deal.preparationMode, 'rework'))}
    </div>
    ${hint('Подсказка', 'Не выбирайте “подготовка сделки”, если сейчас только первичный разговор. Чем точнее выбран сценарий, тем меньше лишних вопросов увидит СПН.')}`;
}
function stepRepresentation() {
  return `<h2>Кого сопровождаем?</h2>
    <p class="muted">От этого зависит, какие блоки появятся дальше: продавец, покупатель, обе стороны или партнер.</p>
    <div class="option-grid">
      ${option('Только продавца', 'Будем глубже спрашивать объект, право, документы продавца.', 'set:representation:seller', is(state.deal.representation, 'seller'))}
      ${option('Только покупателя', 'Будем глубже спрашивать деньги, ипотеку, сертификаты, требования покупателя.', 'set:representation:buyer', is(state.deal.representation, 'buyer'))}
      ${option('Покупателя и продавца — один СПН', 'Нужны оба блока: продавец, покупатель, условия, расходы и расчёты.', 'set:representation:one_spn_both', is(state.deal.representation, 'one_spn_both'))}
      ${option('Покупателя и продавца — два СПН', 'Нужно понимать, кто ведет какую сторону и кто передает информацию.', 'set:representation:both', is(state.deal.representation, 'both'))}
      ${option('Партнёрская сделка', 'Появятся вопросы: кто партнер, кто отвечает за документы и задаток.', 'set:representation:partner_agency', is(state.deal.representation, 'partner_agency'))}
      ${option('Пока не ясно', 'Система оставит минимальный маршрут и попросит уточнить позже.', 'set:representation:unknown', is(state.deal.representation, 'unknown'))}
    </div>
    ${state.deal.representation === 'partner_agency' ? textarea('partnerAgencyComment', 'Кто партнёр и кто за что отвечает?', 'Название агентства/специалиста, чья сторона, кто готовит документы и задаток.') : ''}`;
}
function stepStage() {
  return `<h2>На какой стадии ситуация?</h2>
    <p class="muted">Этот ответ убирает лишние вопросы. Если нет второй стороны — не будем спрашивать детально задаток и расчёты.</p>
    <div class="option-grid">
      ${option('Есть только клиент', 'Объект или вторая сторона ещё не определены.', 'set:stage:lead_only', is(state.deal.stage, 'lead_only'))}
      ${option('Объект выбран, условия не согласованы', 'Нужно собрать основу и понять следующий шаг.', 'set:stage:object_chosen', is(state.deal.stage, 'object_chosen'))}
      ${option('Продавец и покупатель уже договорились', 'Появятся задаток, расходы и расчёты.', 'set:stage:terms_discussed', is(state.deal.stage, 'terms_discussed'))}
      ${option('Нужно срочно готовить задаток', 'Система включит проверки до задатка.', 'set:stage:urgent_deposit', is(state.deal.stage, 'urgent_deposit'))}
      ${option('Задаток уже был', 'Нужно понять, что подписано и что нужно исправить.', 'set:stage:deposit_exists', is(state.deal.stage, 'deposit_exists'))}
      ${option('Готовим основную сделку', 'Нужны документы, расчёты, расходы и специалисты.', 'set:stage:main_deal', is(state.deal.stage, 'main_deal'))}
      ${option('Есть проблема, нужен юрист', 'Сразу выделим риски и вопросы юристу.', 'set:stage:legal_problem', is(state.deal.stage, 'legal_problem'))}
    </div>
    <div class="option-grid">
      ${option('Продавец уже есть', 'Показывать блок продавца.', 'set:hasSeller:true', state.deal.hasSeller === true)}
      ${option('Продавца пока нет', 'Скрыть блок продавца.', 'set:hasSeller:false', state.deal.hasSeller === false)}
      ${option('Покупатель уже есть', 'Показывать блок покупателя.', 'set:hasBuyer:true', state.deal.hasBuyer === true)}
      ${option('Покупателя пока нет', 'Скрыть блок покупателя.', 'set:hasBuyer:false', state.deal.hasBuyer === false)}
    </div>
    ${textarea('stageComment', 'Кратко опишите ситуацию', 'Что уже согласовано, что непонятно, кто торопит, какая ближайшая дата?')}`;
}
function stepObjectType() {
  return `<h2>Что за объект?</h2>
    <p class="muted">Комната и доля разделены. Квартира сначала выбирается общей категорией, а затем уточняется: МКД или квартира на земле.</p>
    <div class="option-grid">
      ${option('Квартира', 'Дальше выберем: квартира в МКД или квартира на земле.', 'set:objectCategory:flat', is(state.deal.objectCategory, 'flat'))}
      ${option('Комната', 'Отдельный объект: комната в квартире/общежитии.', 'set:objectCategory:room', is(state.deal.objectCategory, 'room'))}
      ${option('Доля', 'Отдельный сценарий: доля, уведомления, нотариус, сособственники.', 'set:objectCategory:share', is(state.deal.objectCategory, 'share'))}
      ${option('Дом с участком', 'Будут вопросы по дому и земле.', 'set:objectCategory:house_land', is(state.deal.objectCategory, 'house_land'))}
      ${option('Земельный участок', 'Будут вопросы по категории, ВРИ, межеванию.', 'set:objectCategory:land', is(state.deal.objectCategory, 'land'))}
      ${option('Новостройка / ДДУ / уступка', 'Застройщик, ДДУ, уступка, эскроу, акт.', 'set:objectCategory:new_building', is(state.deal.objectCategory, 'new_building'))}
      ${option('Коммерция', 'Юрлица, арендатор, назначение, НДС.', 'set:objectCategory:commercial', is(state.deal.objectCategory, 'commercial'))}
    </div>
    ${state.deal.objectCategory === 'flat' ? `<div class="card" style="box-shadow:none;margin-top:12px"><h3>Какая квартира?</h3><div class="option-grid">${option('Квартира в МКД', 'Обычная квартира в многоквартирном доме.', 'set:apartmentKind:flat_mkd', is(state.deal.apartmentKind, 'flat_mkd'))}${option('Квартира на земле', 'Квартира в доме/части дома, где могут быть вопросы земли и статуса.', 'set:apartmentKind:flat_ground', is(state.deal.apartmentKind, 'flat_ground'))}</div></div>` : ''}`;
}
function stepObjectDetails() {
  const type = state.deal.objectType;
  let specific = '';
  if (type === 'flat_mkd') specific = `<div class="grid"><div>${field('floor', 'Этаж', 'text')}</div><div>${field('roomsCount', 'Количество комнат', 'text')}</div></div>${textarea('registeredPeople', 'Кто зарегистрирован?', 'Есть ли дети, временно зарегистрированные, когда выписка?')}${textarea('redevelopment', 'Перепланировка / особенности', 'Есть ли перепланировка, объединения, перенос мокрых зон?')}`;
  if (type === 'flat_ground') specific = `${hint('Почему это отдельный сценарий', 'Квартира на земле может иметь особенности по земле, входу, статусу дома, коммуникациям и документам. Лучше уточнить это до задатка.')}<div class="grid"><div>${field('landCadastralNumber', 'Кадастровый номер земли', 'text')}</div><div>${field('landStatus', 'Статус земли / участка', 'text')}</div></div>${textarea('flatGroundComment', 'Особенности квартиры на земле', 'Отдельный вход, коммуникации, доля земли, порядок пользования, документы на землю.')}`;
  if (type === 'room') specific = `<div class="grid"><div>${field('roomArea', 'Площадь комнаты', 'text')}</div><div>${field('roomType', 'Комната где?', 'text', 'квартира, общежитие, коммуналка')}</div></div>${textarea('commonAreas', 'Места общего пользования и соседи', 'Кто пользуется кухней/санузлом, есть ли конфликт, порядок пользования?')}`;
  if (type === 'share') specific = `<div class="grid"><div>${field('shareSize', 'Размер доли', 'text', 'например 1/2, 1/3')}</div><div>${field('coOwnersCount', 'Сколько сособственников?', 'text')}</div></div>${textarea('shareNotices', 'Уведомления/отказы сособственников', 'Направлялись ли уведомления, есть ли отказы, кто готовит нотариуса?')}`;
  if (type === 'house_land') specific = `<div class="grid"><div>${field('houseCadastralNumber', 'Кадастровый номер дома', 'text')}</div><div>${field('landCadastralNumber', 'Кадастровый номер земли', 'text')}</div></div><div class="grid"><div>${field('landCategory', 'Категория земли', 'text')}</div><div>${field('landUse', 'ВРИ', 'text')}</div></div>${textarea('boundariesComment', 'Межевание, границы, коммуникации', 'Есть ли межевание, подъезд, газ/свет/вода, совпадают ли собственники дома и земли?')}`;
  if (type === 'land') specific = `<div class="grid"><div>${field('landCadastralNumber', 'Кадастровый номер участка', 'text')}</div><div>${field('landArea', 'Площадь участка', 'text')}</div></div><div class="grid"><div>${field('landCategory', 'Категория земли', 'text')}</div><div>${field('landUse', 'ВРИ', 'text')}</div></div>${textarea('landComment', 'Ограничения и коммуникации', 'Межевание, подъезд, охранные зоны, ЛЭП, газ, вода, строения.')}`;
  if (type === 'new_building') specific = `<div class="grid"><div>${field('developer', 'Застройщик', 'text')}</div><div>${field('contractType', 'ДДУ / уступка / готовая квартира', 'text')}</div></div>${textarea('newBuildingComment', 'Особенности новостройки', 'Эскроу, акт, уступка, ипотека, остаток оплаты, сроки.')}`;
  if (type === 'commercial') specific = `<div class="grid"><div>${field('commercialPurpose', 'Назначение помещения', 'text')}</div><div>${field('ownerLegalStatus', 'Собственник физлицо/юрлицо?', 'text')}</div></div>${textarea('tenantComment', 'Арендатор, НДС, ограничения', 'Есть ли арендатор, договор аренды, НДС, обременения, отдельный вход?')}`;
  return `<h2>Детали объекта</h2><div class="grid"><div>${field('address', 'Адрес / ориентир', 'text', 'город, улица, дом')}</div><div>${field('cadastralNumber', 'Кадастровый номер', 'text', 'если есть')}</div></div><div class="grid"><div>${field('priceTotal', 'Цена объекта', 'number')}</div><div>${field('depositAmount', 'Планируемый задаток/аванс', 'number')}</div></div>${specific}${textarea('objectComment', 'Комментарий по объекту', 'Что важно знать юристу/руководителю по объекту?')}`;
}
function stepSeller() {
  return `<h2>Продавец и право</h2><p class="muted">Показывается потому, что в текущем маршруте продавец уже есть или мы сопровождаем продавца.</p><div class="option-grid">
    ${option('Один взрослый собственник', 'Самый простой сценарий.', 'set:ownerMode:one', is(state.deal.ownerMode, 'one'))}
    ${option('Несколько собственников', 'Нужно понять всех участников и согласие.', 'set:ownerMode:multiple', is(state.deal.ownerMode, 'multiple'))}
    ${option('Есть ребёнок-собственник', 'Стоп-фактор до юриста.', 'set:ownerMode:minor', is(state.deal.ownerMode, 'minor'))}
    ${option('Продаётся доля', 'Нотариус, уведомления, сособственники.', 'set:ownerMode:share', is(state.deal.ownerMode, 'share'))}
  </div><div class="option-grid">
    ${option('Есть супруг/супруга', 'Проверить согласие или брачный режим.', 'set:sellerHasSpouse:true', state.deal.sellerHasSpouse === true)}
    ${option('Супруга/супруги нет или не требуется', 'Отметить, если понятно.', 'set:sellerHasSpouse:false', state.deal.sellerHasSpouse === false)}
    ${option('Продажа по доверенности', 'Нужна проверка полномочий.', 'set:sellerByProxy:true', state.deal.sellerByProxy === true)}
    ${option('Продавец будет лично', 'Доверенность не нужна.', 'set:sellerByProxy:false', state.deal.sellerByProxy === false)}
  </div><h3>Основание права</h3><div class="option-grid">
    ${option('ДКП', '', 'toggle:basis:sale', has('basis', 'sale'))}${option('Дарение', '', 'toggle:basis:gift', has('basis', 'gift'))}${option('Наследство по закону', '', 'toggle:basis:inheritLaw', has('basis', 'inheritLaw'))}${option('Наследство по завещанию', '', 'toggle:basis:inheritWill', has('basis', 'inheritWill'))}${option('Приватизация', '', 'toggle:basis:privat', has('basis', 'privat'))}${option('ДДУ / уступка', '', 'toggle:basis:ddu', has('basis', 'ddu'))}${option('Решение суда', 'Юрист до задатка.', 'toggle:basis:court', has('basis', 'court'))}${option('Иное', 'Опишите в комментарии.', 'toggle:basis:other', has('basis', 'other'))}
  </div>${textarea('sellerComment', 'Комментарий по продавцу', 'Кто собственник, кто будет на задатке/сделке, какие документы есть, чего не хватает?')}`;
}
function stepBuyer() {
  return `<h2>Покупатель</h2><p class="muted">Показывается потому, что покупатель уже есть или мы сопровождаем покупателя.</p><div class="option-grid">
    ${option('Покупает один взрослый', 'Простой сценарий.', 'set:buyerMode:one', is(state.deal.buyerMode, 'one'))}
    ${option('Покупателей несколько', 'Нужно понять доли и кто платит.', 'set:buyerMode:multiple', is(state.deal.buyerMode, 'multiple'))}
    ${option('Есть ребёнок-покупатель', 'Маткапитал/доли/опека.', 'toggle:flags:minorBuyer', has('flags', 'minorBuyer'))}
    ${option('Покупатель продаёт свой объект', 'Может быть цепочка.', 'set:buyerChain:true', state.deal.buyerChain === true)}
  </div><div class="grid"><div>${field('buyerPhone', 'Телефон покупателя', 'text')}</div><div>${field('buyerName', 'Имя покупателя', 'text')}</div></div>${textarea('buyerComment', 'Комментарий по покупателю', 'Кто принимает решение, готов ли к задатку, есть ли цепочка, кто платит?')}`;
}
function stepMoney() {
  return `<h2>Деньги покупателя</h2><p class="muted">Если выбрана ипотека, маткапитал или сертификат, в итогах появится рекомендация подключить брокера.</p><div class="option-grid">
    ${option('Собственные средства', 'Деньги готовы или будут готовы к дате сделки.', 'toggle:payments:cash', has('payments', 'cash'))}
    ${option('Ипотека', 'Нужен банк, одобрение, оценка, страховка.', 'toggle:payments:mortgage', has('payments', 'mortgage'))}
    ${option('Маткапитал', 'Доли детям и сроки СФР.', 'toggle:payments:matcap', has('payments', 'matcap'))}
    ${option('Сертификат / субсидия', 'Нужно проверить срок и условия.', 'toggle:payments:certificate', has('payments', 'certificate'))}
    ${option('Военная ипотека / НИС', 'Отдельные требования банка и сроков.', 'toggle:payments:militaryMortgage', has('payments', 'militaryMortgage'))}
    ${option('Детский номинальный счёт', 'Юрист до движения денег.', 'toggle:payments:nominalChild', has('payments', 'nominalChild'))}
    ${option('Деньги детей / СВО', 'Юрист до задатка.', 'toggle:payments:svoChildAccount', has('payments', 'svoChildAccount'))}
    ${option('Рассрочка / остаток долга', 'Нужно безопасно закрепить условия.', 'toggle:payments:installment', has('payments', 'installment'))}
  </div>${hasBrokerTrigger() ? `<div class="status warn">Появился брокерский сценарий: банк, одобрение, оценка, страховка, СФР или сертификат.</div><div class="grid"><div>${field('bankName', 'Банк / программа', 'text')}</div><div>${field('mortgageApproved', 'Одобрение есть?', 'text', 'да/нет/в процессе')}</div></div>` : ''}${textarea('moneyComment', 'Комментарий по деньгам', 'Где деньги, когда готовы, какие условия банка/сертификата/маткапитала?')}`;
}
function stepDeposit() {
  return `<h2>Условия задатка</h2><p class="muted">Этот блок появился, потому что выбран задаток или стадия сделки уже близка к задатку.</p><div class="grid"><div>${field('depositAmount', 'Сумма задатка/аванса', 'number')}</div><div>${field('depositDate', 'Когда планируется задаток?', 'text')}</div></div><div class="grid"><div>${field('depositPlace', 'Где подписываем?', 'text')}</div><div>${field('depositReceiver', 'Кто получает деньги?', 'text')}</div></div>${textarea('depositConditions', 'Что фиксируем в задатке?', 'Цена, сроки сделки, освобождение, мебель, расходы, ответственность, возврат/невозврат.')}${state.deal.stage === 'deposit_exists' ? textarea('existingDepositComment', 'Что уже подписали по задатку?', 'Дата, сумма, кто подписал, есть ли спорные условия.') : ''}`;
}
function stepSettlements() {
  return `<h2>Порядок расчётов</h2><p class="muted">Главный вопрос: когда продавец получит деньги и как защищаем стороны.</p><div class="option-grid">
    ${option('Перед сделкой', '', 'toggle:settlements:beforeDeal', has('settlements', 'beforeDeal'))}${option('На сделке', '', 'toggle:settlements:onDeal', has('settlements', 'onDeal'))}${option('СБР', '', 'toggle:settlements:sbr', has('settlements', 'sbr'))}${option('Аккредитив', '', 'toggle:settlements:accreditive', has('settlements', 'accreditive'))}${option('Ячейка', '', 'toggle:settlements:cell', has('settlements', 'cell'))}${option('Депозит нотариуса', '', 'toggle:settlements:notaryDeposit', has('settlements', 'notaryDeposit'))}${option('После регистрации', 'Нужна защита продавца.', 'toggle:settlements:afterRegistration', has('settlements', 'afterRegistration'))}${option('СФР / сертификат после регистрации', 'Продавец ждёт часть денег.', 'toggle:settlements:pensionFund', has('settlements', 'pensionFund'))}
  </div><div class="option-grid">${option('Расчёты согласованы', 'Можно фиксировать условия.', 'set:settlementsAgreed:true', state.deal.settlementsAgreed === true)}${option('Расчёты НЕ согласованы', 'Нужно уточнить до задатка.', 'set:settlementsAgreed:false', state.deal.settlementsAgreed === false)}</div>${textarea('settlementsComment', 'Комментарий по расчётам', 'Когда передаются деньги, кто пишет расписку, как защищаем продавца/покупателя?')}`;
}
function stepExpenses() {
  return `<h2>Расходы</h2><p class="muted">Блок появляется, когда есть задаток/сделка или обе стороны. Нужно убрать конфликт до подписания.</p><div class="option-grid">${option('Расходы согласованы', 'Стороны понимают, кто и что платит.', 'set:expensesAgreed:true', state.deal.expensesAgreed === true)}${option('Расходы НЕ согласованы', 'Нужно согласовать до задатка.', 'set:expensesAgreed:false', state.deal.expensesAgreed === false)}</div><div class="grid"><div>${field('buyerCompanyFee', 'Комиссия покупателя', 'number')}</div><div>${field('sellerCompanyFee', 'Комиссия продавца', 'number')}</div></div><h3>Нотариус</h3><div class="option-grid">${option('Платит покупатель', '', 'set:notaryPayer:buyer', is(state.deal.notaryPayer, 'buyer'))}${option('Платит продавец', '', 'set:notaryPayer:seller', is(state.deal.notaryPayer, 'seller'))}${option('Пополам', '', 'set:notaryPayer:split', is(state.deal.notaryPayer, 'split'))}${option('Не нужен / не ясно', '', 'set:notaryPayer:unknown', is(state.deal.notaryPayer, 'unknown'))}</div>${textarea('expensesComment', 'Комментарий по расходам', 'Нотариус, госпошлина, банк, СБР/аккредитив, оценка, справки, доверенности, согласия.')}`;
}
function stepRisks() {
  return `<h2>Особые риски</h2><p class="muted">Не нужно заполнять юридическую анкету. Просто отметьте триггеры — система сама подскажет, кого подключить.</p><div class="option-grid">
    ${option('Дети / опека / детские деньги', 'Юрист до задатка.', 'toggle:flags:minorRegistered', has('flags', 'minorRegistered'))}
    ${option('Доли', 'Нотариус, уведомления, сособственники.', 'toggle:flags:shares', has('flags', 'shares'))}
    ${option('Доверенность', 'Проверить полномочия.', 'toggle:flags:powerOfAttorney', has('flags', 'powerOfAttorney'))}
    ${option('Супруг/супруга', 'Согласие или брачный режим.', 'toggle:flags:spouse', has('flags', 'spouse'))}
    ${option('Наследство', 'Проверить наследников и сроки.', 'toggle:basis:inheritLaw', has('basis', 'inheritLaw'))}
    ${option('Приватизация', 'Проверить отказников.', 'toggle:basis:privat', has('basis', 'privat'))}
    ${option('Решение суда', 'Юрист до задатка.', 'toggle:basis:court', has('basis', 'court'))}
    ${option('Расчёт после регистрации', 'Нужна защита продавца.', 'toggle:settlements:afterRegistration', has('settlements', 'afterRegistration'))}
  </div>${textarea('riskComment', 'Что именно настораживает?', 'Напишите человеческим языком: кто против, каких документов нет, что уже обещали, что срочно.')}`;
}
function handoffText() {
  const r = readiness();
  const a = analysis();
  const lines = [
    'Передача заявки от СПН',
    '',
    `Что готовим: ${titleOf('preparationMode', state.deal.preparationMode)}`,
    `Кого сопровождаем: ${titleOf('representation', state.deal.representation)}`,
    `Стадия: ${titleOf('stage', state.deal.stage)}`,
    `Объект: ${titleOf('objectType', state.deal.objectType)}`,
    `Адрес: ${state.deal.address || 'не указан'}`,
    `Цена: ${state.deal.priceTotal || 'не указана'}`,
    `Задаток: ${state.deal.depositAmount || 'не указан'}`,
    '',
    `Продавец: ${hasSeller() ? 'есть/нужен блок продавца' : 'не требуется сейчас'}`,
    `Покупатель: ${hasBuyer() ? 'есть/нужен блок покупателя' : 'не требуется сейчас'}`,
    `Деньги: ${listText('payments')}`,
    `Основание права: ${listText('basis')}`,
    `Расчёты: ${listText('settlements')}`,
    `Расходы согласованы: ${yesNo(state.deal.expensesAgreed)}`,
    `Расчёты согласованы: ${yesNo(state.deal.settlementsAgreed)}`,
    '',
    `Готовность карточки: ${r.percent}%`,
    `Риск: ${a.risk}`,
    `Нужен юрист: ${a.needsLawyer ? 'да' : 'нет/по ситуации'}`,
    `Нужен брокер: ${a.needsBroker ? 'да' : 'нет/по ситуации'}`,
    '',
    `Следующий шаг: ${state.deal.clientNextStep || 'не указан'}`,
    `Комментарий СПН: ${state.deal.spnFinalComment || state.deal.riskComment || state.deal.stageComment || 'не указан'}`
  ];
  if (a.blockers.length) lines.push('', 'Стоп-вопросы:', ...a.blockers.map((item) => '- ' + item));
  if (a.notes.length) lines.push('', 'Подсказки:', ...a.notes.map((item) => '- ' + item));
  if (r.missing.length) lines.push('', 'Что дозаполнить:', ...r.missing.map((item) => '- ' + item.title));
  return lines.join('\n');
}
function stepFinish() {
  const r = readiness();
  const a = analysis();
  const status = a.blockers.length ? 'Стоп: нужен юрист до задатка' : r.percent >= 75 ? 'Можно двигаться дальше' : 'Можно сохранить черновик, но есть пробелы';
  return `<h2>Итог</h2><div class="summary-grid"><div class="metric ${a.risk === 'red' ? 'red' : a.risk === 'yellow' ? 'yellow' : 'green'}"><span>Статус</span><b>${esc(status)}</b></div><div class="metric ${r.percent >= 75 ? 'green' : 'yellow'}"><span>Готовность</span><b>${r.percent}%</b></div></div><div class="grid"><div class="card" style="box-shadow:none"><h3>Кого подключить</h3><div class="list"><div class="list-item"><b>Юрист</b>${a.needsLawyer ? 'подключить' : 'по ситуации'}</div><div class="list-item"><b>Брокер</b>${a.needsBroker ? 'подключить' : 'по ситуации'}</div></div></div><div class="card" style="box-shadow:none"><h3>Чего не хватает</h3><div class="list">${r.missing.map((item) => `<div class="list-item"><b>${esc(item.title)}</b><span class="small">${esc(item.help)}</span></div>`).join('') || '<div class="list-item">Ключевых пробелов нет.</div>'}</div></div></div>${textarea('spnFinalComment', 'Комментарий СПН', 'Что уже понятно, что просите проверить, что важно не забыть?')}${field('clientNextStep', 'Следующий шаг с клиентом', 'text', 'например: собрать документы, назначить задаток, подключить юриста')}<div class="card" style="box-shadow:none;margin-top:12px"><h3>Текст передачи</h3><textarea id="handoffText" readonly style="min-height:260px">${esc(handoffText())}</textarea><div class="actions" style="justify-content:flex-start"><button class="btn light" type="button" data-action="copy">Скопировать текст</button></div></div>`;
}

function progressPanel(route) {
  const r = readiness();
  const a = analysis();
  return `<div class="card" style="box-shadow:none;margin-top:12px"><h3>Маршрут</h3><div class="progress"><i style="width:${Math.round(((state.stepIndex + 1) / route.length) * 100)}%"></i></div><div class="status ${a.risk === 'red' ? 'error' : a.risk === 'yellow' ? 'warn' : 'ok'}">Готовность: ${r.percent}%. ${a.blockers[0] ? esc(a.blockers[0]) : a.notes[0] ? esc(a.notes[0]) : 'Явных стоп-факторов пока нет.'}</div></div>`;
}
function render() {
  const route = computeRoute();
  clampStep(route);
  const step = route[state.stepIndex];
  const app = document.getElementById('app');
  app.innerHTML = `<main class="nav-v2-shell"><section class="hero"><h1>Новая сделка</h1><p>Умный мастер: первые ответы меняют дальнейшие вопросы. Лишние блоки скрываются, нужные появляются автоматически.</p></section><section class="stepper"><aside class="steps card"><h3>Шаги</h3><div class="step-list">${route.map((item, index) => `<button class="step-pill ${index === state.stepIndex ? 'active' : ''}" type="button" data-action="step:${index}"><b>${index + 1}. ${esc(item.title)}</b><span>${esc(item.hint)}</span></button>`).join('')}</div>${progressPanel(route)}</aside><section class="card"><div class="section-title"><div><span class="pill blue">Шаг ${state.stepIndex + 1} из ${route.length}</span></div><button class="btn light" type="button" data-action="clear">Очистить черновик</button></div>${step.render()}<div id="pageStatus"></div><div class="actions"><button class="btn light" type="button" data-action="prev" ${state.stepIndex === 0 ? 'disabled' : ''}>Назад</button><div><button class="btn light" type="button" data-action="draft">Сохранить черновик</button>${state.stepIndex < route.length - 1 ? '<button class="btn primary" type="button" data-action="next">Далее</button>' : `<button class="btn green" type="button" data-action="save" ${isSaving ? 'disabled' : ''}>${isSaving ? 'Сохраняю...' : 'Сохранить и открыть карточку'}</button>`}</div></div></section></section></main>`;
}
function setStatus(text, type = 'info') {
  const el = document.getElementById('pageStatus');
  if (!el) return;
  el.className = 'status ' + type;
  el.textContent = text;
}
function syncHandoff() {
  const field = document.getElementById('handoffText');
  if (field) field.value = handoffText();
}
function handleAction(action) {
  if (!action || isSaving) return;
  const route = computeRoute();
  const [type, key, raw] = action.split(':');
  if (type === 'set') {
    let value = raw;
    if (raw === 'true') value = true;
    if (raw === 'false') value = false;
    setDeal(key, value);
    return;
  }
  if (type === 'toggle') { toggleDeal(key, raw); return; }
  if (type === 'step') { state.stepIndex = Number(key); render(); return; }
  if (type === 'prev') { state.stepIndex = Math.max(0, state.stepIndex - 1); render(); return; }
  if (type === 'next') { state.stepIndex = Math.min(route.length - 1, state.stepIndex + 1); render(); return; }
  if (type === 'draft') { saveDraft(); setStatus('Черновик сохранён в браузере.', 'ok'); return; }
  if (type === 'clear') {
    if (confirm('Очистить черновик новой сделки?')) {
      localStorage.removeItem(DRAFT_KEY);
      state.deal = {};
      state.stepIndex = 0;
      render();
    }
    return;
  }
  if (type === 'copy') { copyHandoff(); return; }
  if (type === 'save') { saveDeal(); }
}
function copyHandoff() {
  const text = handoffText();
  const field = document.getElementById('handoffText');
  if (field) field.value = text;
  navigator.clipboard?.writeText(text).then(
    () => setStatus('Текст передачи скопирован.', 'ok'),
    () => { if (field) { field.focus(); field.select(); } setStatus('Не удалось скопировать автоматически. Текст выделен, скопируйте вручную.', 'warn'); }
  );
}
function normalizeText(value) { return String(value || '').trim().toLowerCase(); }
async function findRecentlyCreatedDeal() {
  const address = normalizeText(state.deal.address);
  if (!address) return null;
  try {
    const data = await rpc('nav_v2_get_deals_list', { p_limit: 30 }, 12000);
    return (data.items || []).find((deal) => normalizeText(deal.address) === address) || null;
  } catch (_) { return null; }
}
function savePayload() {
  const a = analysis();
  const r = readiness();
  return {
    deal: {
      ...state.deal,
      flags: a.flags,
      readiness_local: {
        card: r.percent,
        missing: r.missing.map((item) => item.title),
        blockers: a.blockers,
        notes: a.notes,
        smart_route: computeRoute().map((item) => item.id)
      },
      spn_final: {
        comment: state.deal.spnFinalComment || state.deal.riskComment || '',
        next_step: state.deal.clientNextStep || '',
        handoff_text: handoffText()
      }
    }
  };
}
async function saveDeal() {
  if (isSaving) return;
  const r = readiness();
  if (r.percent < 45 && !confirm('Заявка заполнена слабо. Всё равно сохранить черновик в CRM?')) return;
  isSaving = true;
  render();
  try {
    setStatus('Сохраняю сделку в CRM...', 'info');
    const saved = await rpc('nav_v2_save_wizard_result', { p_result: savePayload() }, 15000);
    localStorage.removeItem(DRAFT_KEY);
    setStatus('Сделка сохранена. Открываю карточку...', 'ok');
    setTimeout(() => { location.href = `./deal-card-v2.html?id=${saved.id}`; }, 500);
  } catch (error) {
    setStatus('Ответ от сохранения не получен быстро. Проверяю, не успела ли сделка создаться...', 'info');
    const found = await findRecentlyCreatedDeal();
    if (found?.id) {
      localStorage.removeItem(DRAFT_KEY);
      setStatus('Сделка найдена в базе. Открываю карточку...', 'ok');
      setTimeout(() => { location.href = `./deal-card-v2.html?id=${found.id}`; }, 500);
      return;
    }
    isSaving = false;
    render();
    setStatus('Сделка не появилась в базе. Ошибка: ' + (error.message || error), 'error');
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
  if (Date.now() - lastPointerAction < 450) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  handleAction(target.dataset.action);
});

function init() {
  if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload());
  render();
}
init();
