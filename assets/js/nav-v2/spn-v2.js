import { setupTop, getCachedUser, renderAuthBox, rpc, esc, riskPill } from './supabase-v2.js';

const DRAFT_KEY = 'nav_deal_draft_v2';

const state = {
  step: 0,
  deal: JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}')
};

let isSaving = false;

const steps = [
  { key:'start', title:'Что готовим', hint:'Задаток, сделку или консультацию' },
  { key:'representation', title:'Кого представляем', hint:'Продавец, покупатель, обе стороны' },
  { key:'object', title:'Объект', hint:'Тип объекта, адрес, цена, задаток' },
  { key:'parties', title:'Участники', hint:'Собственники, покупатели, дети' },
  { key:'basis', title:'Документы', hint:'Основание права и сомнения' },
  { key:'money', title:'Деньги', hint:'Оплата, ипотека, сертификаты' },
  { key:'settlements', title:'Расчеты', hint:'Как и когда передаются деньги' },
  { key:'expenses', title:'Расходы', hint:'Кто что оплачивает' },
  { key:'finish', title:'Итог', hint:'Готовность, риски, передача юристу' }
];

function saveDraft(){ localStorage.setItem(DRAFT_KEY, JSON.stringify(state.deal)); }
function set(key,val){ state.deal[key]=val; saveDraft(); render(); }
function toggleArr(key,val){ const arr = Array.isArray(state.deal[key]) ? state.deal[key] : []; const next = arr.includes(val) ? arr.filter(x=>x!==val) : [...arr,val]; state.deal[key]=next; saveDraft(); render(); }
function has(key,val){ return Array.isArray(state.deal[key]) && state.deal[key].includes(val); }
function cls(key,val){ return state.deal[key]===val || has(key,val) ? 'active' : ''; }
function option(label, desc, onclick, active=''){ return `<div class="option ${active}" data-click="${onclick}"><b>${label}</b><span>${desc||''}</span></div>`; }
function field(key,label,type='text',placeholder=''){ return `<div class="field"><label>${label}</label><input data-field="${key}" type="${type}" value="${esc(state.deal[key]||'')}" placeholder="${esc(placeholder)}"></div>`; }
function textarea(key,label,placeholder=''){ return `<div class="field"><label>${label}</label><textarea data-field="${key}" placeholder="${esc(placeholder)}">${esc(state.deal[key]||'')}</textarea></div>`; }
function arr(key){ return Array.isArray(state.deal[key]) ? state.deal[key] : []; }
function filled(value){ return String(value ?? '').trim().length > 0; }
function moneyFilled(value){ return Number(String(value || '').replace(',', '.')) > 0; }

function checkItem(title, done, help, level = 'yellow', group = 'lawyer') {
  return { title, done: Boolean(done), help, level, group };
}

function localAnalysis(){
  const flags = state.deal.flags || [], payments = state.deal.payments || [], basis = state.deal.basis || [];
  const children = flags.some(x=>['minorSeller','minorBuyer','minorRegistered'].includes(x)) || payments.some(x=>['matcap','nominalChild','svoChildAccount'].includes(x));
  const mortgage = payments.some(x=>['mortgage','militaryMortgage'].includes(x));
  let risk = 'green'; const notes=[];
  if (children) { risk='red'; notes.push('Дети/детские деньги: передать юристу до задатка.'); }
  if (flags.includes('powerOfAttorney')) { if(risk!=='red') risk='yellow'; notes.push('Доверенность: проверить полномочия до задатка.'); }
  if (flags.includes('shares')) { if(risk!=='red') risk='yellow'; notes.push('Доли: возможна нотариальная форма и дополнительные расходы.'); }
  if (mortgage) { if(risk!=='red') risk='yellow'; notes.push('Ипотека: подключить брокера и проверить требования банка.'); }
  if (basis.some(x=>['inheritLaw','inheritWill','privat','court'].includes(x))) { if(risk!=='red') risk='yellow'; notes.push('Основание права требует юридической проверки.'); }
  if (arr('settlements').includes('afterRegistration')) { if(risk!=='red') risk='yellow'; notes.push('Расчет после регистрации: нужен понятный механизм защиты продавца.'); }
  if (state.deal.expensesAgreed !== true) { if(risk!=='red') risk='yellow'; notes.push('Расходы не согласованы: риск конфликта перед сделкой.'); }
  if (state.deal.settlementsAgreed !== true) { if(risk!=='red') risk='yellow'; notes.push('Порядок расчетов не согласован.'); }
  return { risk, notes, children, mortgage };
}

function readiness(){
  const a = localAnalysis();
  const items = [
    checkItem('Понятно, что готовим: задаток, сделку или консультацию', filled(state.deal.preparationMode), 'Выберите цель подготовки на первом шаге.', 'yellow', 'base'),
    checkItem('Понятно, кого представляет компания', filled(state.deal.representation), 'Укажите: продавец, покупатель, обе стороны или партнерская сделка.', 'yellow', 'base'),
    checkItem('Выбран тип объекта', filled(state.deal.objectType), 'Без типа объекта юрист не поймет, какие документы и риски проверять.', 'yellow', 'base'),
    checkItem('Указан адрес объекта', filled(state.deal.address), 'Адрес нужен для идентификации заявки и дальнейшей проверки.', 'yellow', 'base'),
    checkItem('Указана цена объекта', moneyFilled(state.deal.priceTotal), 'Цена нужна для задатка, расчетов, расходов и комиссии.', 'yellow', 'base'),
    checkItem('Указана сумма задатка или аванса', state.deal.preparationMode !== 'deposit' || moneyFilled(state.deal.depositAmount), 'Если готовим задаток — сумма должна быть понятна до встречи.', 'yellow', 'deposit'),
    checkItem('Участники и особые лица отмечены', arr('flags').length > 0 || filled(state.deal.sellerPhone) || filled(state.deal.buyerPhone), 'Отметьте собственников, детей, супруга, доверенность, доли или хотя бы телефоны сторон.', 'yellow', 'lawyer'),
    checkItem('Основание права отмечено', arr('basis').length > 0, 'Укажите, откуда право собственности: ДКП, наследство, дарение, приватизация и т.д.', 'yellow', 'lawyer'),
    checkItem('Источник денег покупателя отмечен', arr('payments').length > 0, 'Нужно понимать: собственные средства, ипотека, маткапитал, сертификат и т.д.', 'yellow', 'lawyer'),
    checkItem('Способ расчетов выбран', arr('settlements').length > 0, 'Отметьте: на сделке, до сделки, СБР, аккредитив, ячейка, после регистрации и т.д.', 'yellow', 'deposit'),
    checkItem('Порядок расчетов согласован', state.deal.settlementsAgreed === true, 'До задатка должно быть понятно, когда и как передаются деньги.', 'red', 'deposit'),
    checkItem('Расходы между сторонами согласованы', state.deal.expensesAgreed === true, 'До задатка нужно убрать спор: кто оплачивает нотариуса, банк, справки, госпошлину, оценку.', 'red', 'deposit'),
    checkItem('Комментарий СПН для юриста есть', filled(state.deal.spnFinalComment), 'Кратко напишите, что уже понятно и что просите проверить.', 'yellow', 'lawyer'),
    checkItem('Следующий шаг с клиентом указан', filled(state.deal.clientNextStep), 'Укажите, что нужно сделать дальше: документы, задаток, проверка, встреча.', 'yellow', 'base')
  ];

  const depositItems = items.filter(x => ['base','deposit'].includes(x.group));
  const lawyerItems = items.filter(x => ['base','lawyer','deposit'].includes(x.group));
  const percent = (list) => Math.round((list.filter(x => x.done).length / Math.max(list.length, 1)) * 100);
  const blockers = [];
  if (a.children) blockers.push('Дети, опека или детские деньги — до задатка обязательно показать юристу.');
  if (arr('basis').includes('court')) blockers.push('Решение суда в основании — нужна юридическая проверка до движения дальше.');
  if (arr('settlements').includes('afterRegistration') && state.deal.settlementsAgreed !== true) blockers.push('Расчет после регистрации без согласованного механизма — нельзя спокойно выходить на задаток.');
  if (state.deal.settlementsAgreed === false) blockers.push('Порядок расчетов прямо отмечен как не согласованный.');
  if (state.deal.expensesAgreed === false) blockers.push('Расходы прямо отмечены как не согласованные.');

  const missing = items.filter(x => !x.done);
  return {
    items,
    missing,
    blockers,
    risk: a.risk,
    notes: a.notes,
    children: a.children,
    mortgage: a.mortgage,
    depositPercent: percent(depositItems),
    lawyerPercent: percent(lawyerItems),
    readyForDeposit: percent(depositItems) >= 80 && blockers.length === 0,
    readyForLawyer: percent(lawyerItems) >= 70 && filled(state.deal.address)
  };
}

function readinessMetric(label, value, cls) {
  return `<div class="metric ${cls}"><span>${label}</span><b>${value}%</b></div>`;
}

function readinessPanel() {
  const r = readiness();
  const topMissing = r.missing.slice(0, 5);
  return `<div class="card" style="box-shadow:none;margin-top:12px">
    <h3>Готовность заявки</h3>
    <div class="kpi-row">
      ${readinessMetric('К юристу', r.lawyerPercent, r.lawyerPercent >= 70 ? 'green' : 'yellow')}
      ${readinessMetric('К задатку', r.depositPercent, r.readyForDeposit ? 'green' : 'yellow')}
    </div>
    <div class="status ${r.blockers.length ? 'error' : r.readyForLawyer ? 'ok' : 'warn'}">
      ${r.blockers.length ? 'Есть стоп-вопросы до задатка.' : r.readyForLawyer ? 'Заявка выглядит достаточно собранной для передачи на проверку.' : 'Есть пробелы. Заполните ключевые пункты до передачи юристу.'}
    </div>
    <div class="list">
      ${topMissing.length ? topMissing.map(x => `<div class="list-item"><b>Не хватает:</b> ${esc(x.title)}<p class="muted">${esc(x.help)}</p></div>`).join('') : '<div class="list-item"><b>Ключевые поля заполнены</b><p class="muted">Проверьте комментарий СПН и откройте карточку после сохранения.</p></div>'}
    </div>
  </div>`;
}

function readinessFullReport() {
  const r = readiness();
  const done = r.items.filter(x => x.done);
  const missing = r.items.filter(x => !x.done);
  return `<div class="card" style="box-shadow:none;margin-top:12px">
    <h3>Проверка перед сохранением</h3>
    <div class="kpi-row">
      ${readinessMetric('К юристу', r.lawyerPercent, r.lawyerPercent >= 70 ? 'green' : 'yellow')}
      ${readinessMetric('К задатку', r.depositPercent, r.readyForDeposit ? 'green' : 'yellow')}
      <div class="metric ${r.blockers.length ? 'red' : 'green'}"><span>Стоп-вопросы</span><b>${r.blockers.length}</b></div>
    </div>
    ${r.blockers.length ? `<div class="status error">Перед задатком обязательно разберите: ${esc(r.blockers.join(' / '))}</div>` : '<div class="status ok">Явных стоп-вопросов до задатка по заполненной информации нет.</div>'}
    <div class="side-by-side">
      <div><h4>Уже есть</h4><div class="list">${done.map(x => `<div class="list-item">${esc(x.title)}</div>`).join('') || '<div class="empty">Пока ничего не заполнено.</div>'}</div></div>
      <div><h4>Дозаполнить</h4><div class="list">${missing.map(x => `<div class="list-item"><b>${esc(x.title)}</b><p class="muted">${esc(x.help)}</p></div>`).join('') || '<div class="empty">Ключевых пробелов нет.</div>'}</div></div>
    </div>
  </div>`;
}

function stepStart(){ return `<h2>Что сейчас нужно подготовить?</h2><p class="muted">От этого зависит глубина вопросов. Для задатка важны условия и запреты, для сделки — полный пакет документов и порядок регистрации.</p><div class="option-grid">
${option('Задаток', 'Проверить, можно ли брать задаток и какие условия обязательно согласовать.', "set:preparationMode:deposit", cls('preparationMode','deposit'))}
${option('Сделка', 'Подготовить полный маршрут сделки, документы, расходы, расчеты и роли.', "set:preparationMode:deal", cls('preparationMode','deal'))}
${option('Консультация', 'Быстро разобрать ситуацию клиента и понять, какие есть риски.', "set:preparationMode:consult", cls('preparationMode','consult'))}
${option('Пока не знаю', 'Начать с универсального сценария и уточнить по ходу.', "set:preparationMode:unknown", cls('preparationMode','unknown'))}
</div>`; }
function stepRepresentation(){ return `<h2>Кого мы представляем в сделке?</h2><p class="muted">Это влияет на права доступа, задачи СПН и распределение ответственности.</p><div class="option-grid">
${option('Только продавца', 'Наш клиент — продавец. Документы продавца в нашей зоне контроля.', "set:representation:seller", cls('representation','seller'))}
${option('Только покупателя', 'Наш клиент — покупатель. Особое внимание безопасности и проверке объекта.', "set:representation:buyer", cls('representation','buyer'))}
${option('Обе стороны, один СПН', 'Один специалист ведет продавца и покупателя.', "set:representation:one_spn_both", cls('representation','one_spn_both'))}
${option('Обе стороны, два СПН', 'Один СПН со стороны продавца, второй — покупателя.', "set:representation:both", cls('representation','both'))}
${option('Партнерская сделка', 'Вторая сторона от другого агентства.', "set:representation:partner_agency", cls('representation','partner_agency'))}
${option('Одна сторона без представителя', 'Вторая сторона отказывается от сопровождения.', "set:representation:external_party", cls('representation','external_party'))}
</div>${textarea('representationComment','Комментарий по взаимодействию сторон','Например: продавец наш, покупатель от другого АН; второй СПН будет назначен позже.')}`; }
function stepObject(){ return `<h2>Что продается?</h2><p class="muted">Сначала выбираем очевидный тип объекта, чтобы система не задавала лишних вопросов.</p><div class="option-grid">
${option('Квартира', 'Вторичная недвижимость, обычная квартира.', "set:objectType:flat", cls('objectType','flat'))}
${option('Дом + земля', 'Жилой дом, участок, коммуникации, границы.', "set:objectType:house_land", cls('objectType','house_land'))}
${option('Земельный участок', 'Участок без дома или основной объект — земля.', "set:objectType:land", cls('objectType','land'))}
${option('Комната / доля', 'Комната, доля в праве, коммунальная квартира.', "set:objectType:share_room", cls('objectType','share_room'))}
${option('Новостройка / ДДУ', 'Переуступка, ДДУ, новостройка.', "set:objectType:new_building", cls('objectType','new_building'))}
${option('Коммерция', 'Нежилое помещение, офис, торговая площадь.', "set:objectType:commercial", cls('objectType','commercial'))}
</div><div class="grid"><div>${field('address','Адрес объекта','text','Например: Борисоглебск, ул. ...')}</div><div>${field('cadastralNumber','Кадастровый номер, если есть','text','Можно заполнить позже')}</div></div><div class="grid"><div>${field('priceTotal','Цена объекта','number','')}</div><div>${field('depositAmount','Планируемый задаток','number','')}</div></div>`; }
function stepParties(){ return `<h2>Кто участвует в сделке?</h2><p class="muted">Здесь отмечаем только то, что реально влияет на риски и документы. Если ничего не выбрано — юристу будет непонятно, простой это сценарий или СПН просто не уточнил.</p><div class="option-grid">
${option('Один взрослый собственник', 'Самый простой сценарий.', "toggle:flags:oneAdultSeller", cls('flags','oneAdultSeller'))}
${option('Несколько собственников', 'Нужно проверить всех продавцов и согласие каждого.', "toggle:flags:manySellers", cls('flags','manySellers'))}
${option('Есть ребенок-собственник', 'Без опеки нельзя двигаться дальше.', "toggle:flags:minorSeller", cls('flags','minorSeller'))}
${option('Ребенок-покупатель', 'Нужны документы ребенка и родителей.', "toggle:flags:minorBuyer", cls('flags','minorBuyer'))}
${option('Зарегистрированы дети', 'Нужна проверка выписки и интересов детей.', "toggle:flags:minorRegistered", cls('flags','minorRegistered'))}
${option('Есть супруг/супруга', 'Может потребоваться согласие или брачный договор.', "toggle:flags:spouse", cls('flags','spouse'))}
${option('Доверенность', 'Нужна расширенная проверка полномочий.', "toggle:flags:powerOfAttorney", cls('flags','powerOfAttorney'))}
${option('Доли', 'Возможна нотариальная форма и уведомления.', "toggle:flags:shares", cls('flags','shares'))}
</div><div class="grid"><div>${field('sellerPhone','Телефон продавца','text','')}</div><div>${field('buyerPhone','Телефон покупателя','text','')}</div></div>`; }
function stepBasis(){ return `<h2>Документы основания</h2><p class="muted">Отметьте документы, на основании которых возникло право собственности. Не уверены — напишите в комментарии, что именно видел СПН.</p><div class="option-grid">
${option('ДКП', 'Договор купли-продажи.', "toggle:basis:sale", cls('basis','sale'))}
${option('Дарение', 'Договор дарения.', "toggle:basis:gift", cls('basis','gift'))}
${option('Наследство по закону', 'Проверить круг наследников и сроки.', "toggle:basis:inheritLaw", cls('basis','inheritLaw'))}
${option('Наследство по завещанию', 'Проверить завещание, наследников, сроки.', "toggle:basis:inheritWill", cls('basis','inheritWill'))}
${option('Приватизация', 'Проверить отказников и зарегистрированных.', "toggle:basis:privat", cls('basis','privat'))}
${option('ДДУ / уступка', 'Новостройка, уступка права требования.', "toggle:basis:ddu", cls('basis','ddu'))}
${option('Решение суда', 'Обязательно юристу.', "toggle:basis:court", cls('basis','court'))}
${option('Мена / рента / иное', 'Нужна дополнительная проверка.', "toggle:basis:other", cls('basis','other'))}
</div>${textarea('basisComment','Комментарий по документам','Что уже видели, чего нет, есть ли сомнения.')}`; }
function stepMoney(){ return `<h2>За какие средства покупают?</h2><p class="muted">Можно выбрать несколько вариантов. Система сама подключит брокера/юриста, если нужно.</p><div class="option-grid">
${option('Собственные средства', 'Деньги покупателя без банка.', "toggle:payments:cash", cls('payments','cash'))}
${option('Ипотека', 'Банк, оценка, страховка, требования банка.', "toggle:payments:mortgage", cls('payments','mortgage'))}
${option('Материнский капитал', 'СФР, дети, порядок перечисления.', "toggle:payments:matcap", cls('payments','matcap'))}
${option('Сертификат / субсидия', 'Госпрограмма, сроки, условия оплаты.', "toggle:payments:certificate", cls('payments','certificate'))}
${option('Военная ипотека / НИС', 'Особый порядок банка и документов.', "toggle:payments:militaryMortgage", cls('payments','militaryMortgage'))}
${option('Детский номинальный счет', 'Обязательно проверить порядок использования.', "toggle:payments:nominalChild", cls('payments','nominalChild'))}
${option('Деньги детей / СВО', 'Нужна осторожная проверка основания и разрешений.', "toggle:payments:svoChildAccount", cls('payments','svoChildAccount'))}
${option('Рассрочка / остаток долга', 'Нужно согласовать безопасный механизм.', "toggle:payments:installment", cls('payments','installment'))}
</div>${field('priceContract','Цена в договоре, если отличается','number','')}`; }
function stepSettlements(){ return `<h2>Порядок расчетов</h2><p class="muted">На практике чаще всего деньги передаются перед сделкой или на сделке, а если расчет после регистрации — сделка обычно с обременением. Поэтому важно согласовать порядок заранее.</p><div class="option-grid">
${option('Перед сделкой', 'Договор подписан, расписка, расчет до подачи.', "toggle:settlements:beforeDeal", cls('settlements','beforeDeal'))}
${option('На сделке', 'Расчет и расписка в день сделки.', "toggle:settlements:onDeal", cls('settlements','onDeal'))}
${option('СБР', 'Сервис безопасных расчетов.', "toggle:settlements:sbr", cls('settlements','sbr'))}
${option('Аккредитив', 'Банковский аккредитив.', "toggle:settlements:accreditive", cls('settlements','accreditive'))}
${option('Ячейка', 'Банковская ячейка.', "toggle:settlements:cell", cls('settlements','cell'))}
${option('Депозит нотариуса', 'Для нотариальных сделок и особых условий.', "toggle:settlements:notaryDeposit", cls('settlements','notaryDeposit'))}
${option('После регистрации', 'Только с пониманием обременения и рисков.', "toggle:settlements:afterRegistration", cls('settlements','afterRegistration'))}
${option('СФР / сертификат после регистрации', 'Часть оплаты приходит позже.', "toggle:settlements:pensionFund", cls('settlements','pensionFund'))}
</div><div class="option-grid">${option('Порядок расчетов согласован', 'Можно фиксировать в задатке/условиях сделки.', "set:settlementsAgreed:true", state.deal.settlementsAgreed===true?'active':'')}${option('Порядок расчетов НЕ согласован', 'Система поставит задачу до задатка.', "set:settlementsAgreed:false", state.deal.settlementsAgreed===false?'active':'')}</div>${textarea('settlementsComment','Комментарий по расчетам','Когда передаются деньги, кто пишет расписку, какой банк/сервис, есть ли обременение.')}`; }
function stepExpenses(){ return `<h2>Расходы покупателя и продавца</h2><p class="muted">Этот блок нужен, чтобы заранее убрать конфликт: кто платит нотариуса, госпошлину, банк, справки, комиссию и документы.</p><div class="option-grid">${option('Расходы согласованы', 'Стороны понимают, кто и что оплачивает.', "set:expensesAgreed:true", state.deal.expensesAgreed===true?'active':'')}${option('Расходы НЕ согласованы', 'Нужно согласовать до задатка.', "set:expensesAgreed:false", state.deal.expensesAgreed===false?'active':'')}</div><div class="grid"><div>${field('buyerCompanyFee','Комиссия покупателя','number','')}</div><div>${field('sellerCompanyFee','Комиссия продавца','number','')}</div></div><div class="option-grid">
${option('Нотариус — покупатель', '', "set:notaryPayer:buyer", cls('notaryPayer','buyer'))}
${option('Нотариус — продавец', '', "set:notaryPayer:seller", cls('notaryPayer','seller'))}
${option('Нотариус пополам', '', "set:notaryPayer:split", cls('notaryPayer','split'))}
${option('Нотариус не нужен/не ясно', '', "set:notaryPayer:unknown", cls('notaryPayer','unknown'))}
</div>${textarea('expensesComment','Комментарий по расходам','Кто платит СБР/аккредитив/ячейку, госпошлину, справки, оценку, страховку, доверенности, согласия.')}`; }
function stepFinish(){ const a=localAnalysis(); return `<h2>Итог перед сохранением</h2><div class="summary-grid"><div class="metric ${a.risk==='red'?'red':a.risk==='yellow'?'yellow':'green'}"><span>Риск</span><b>${a.risk==='red'?'Стоп':a.risk==='yellow'?'Внимание':'Обычная'}</b>${riskPill(a.risk)}</div><div class="metric"><span>Кому передать</span><b>${a.children?'Юристу':a.mortgage?'Брокеру':'СПН'}</b></div></div>${readinessFullReport()}<div class="card" style="box-shadow:none;margin-top:12px"><h3>Что важно сейчас</h3><div class="list">${(a.notes.length?a.notes:['Проверить базовые документы, расходы и порядок расчетов.']).map(n=>`<div class="list-item">${esc(n)}</div>`).join('')}</div></div><div class="grid"><div>${textarea('spnFinalComment','Комментарий СПН для юриста','Кратко: что уже понятно, что вызывает сомнения, что просите проверить')}</div><div>${field('clientNextStep','Следующий шаг с клиентом','text','Например: собрать документы, назначить задаток')}</div></div><div class="status warn">После сохранения откроется карточка сделки. Перед передачей юристу проверьте блоки: риски, документы, задачи, расходы и комментарий СПН.</div>`; }

const renderers = [stepStart, stepRepresentation, stepObject, stepParties, stepBasis, stepMoney, stepSettlements, stepExpenses, stepFinish];

function render(){
  const app=document.getElementById('app');
  const progress=Math.round(((state.step+1)/steps.length)*100);
  app.innerHTML = `<main class="nav-v2-shell"><section class="hero"><h1>Новая сделка</h1><p>Мастер помогает СПН не просто сохранить заявку, а подготовить ее к задатку и передаче юристу: видно, что заполнено, чего не хватает и где есть стоп-вопросы.</p></section><section class="stepper"><aside class="steps card"><h3>Шаги</h3><div class="progress"><i style="width:${progress}%"></i></div><div class="step-list">${steps.map((s,i)=>`<button class="step-pill ${i===state.step?'active':''}" data-step="${i}" ${isSaving ? 'disabled' : ''}><b>${i+1}. ${s.title}</b><span>${s.hint}</span></button>`).join('')}</div>${readinessPanel()}</aside><section class="card"><div class="section-title"><div><span class="pill blue">Шаг ${state.step+1} из ${steps.length}</span></div><button class="btn light" id="clearDraft" type="button" ${isSaving ? 'disabled' : ''}>Очистить черновик</button></div>${renderers[state.step]()}<div id="pageStatus"></div><div class="actions"><button class="btn light" id="prevBtn" ${state.step===0 || isSaving?'disabled':''}>Назад</button><div><button class="btn light" id="saveDraftBtn" ${isSaving ? 'disabled' : ''}>Сохранить черновик</button>${state.step<steps.length-1?`<button class="btn primary" id="nextBtn" ${isSaving ? 'disabled' : ''}>Далее</button>`:`<button class="btn green" id="saveDealBtn" ${isSaving ? 'disabled' : ''}>${isSaving ? 'Сохраняю...' : 'Сохранить и открыть карточку'}</button>`}</div></div></section></section></main>`;
  bind();
}
function bind(){
  document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{ if(isSaving) return; state.step=Number(b.dataset.step);render();});
  document.querySelectorAll('[data-click]').forEach(el=>el.onclick=()=>{ if(isSaving) return; handleClick(el.dataset.click); });
  document.querySelectorAll('[data-field]').forEach(el=>el.oninput=()=>{ if(isSaving) return; state.deal[el.dataset.field]=el.value;saveDraft();});
  document.getElementById('prevBtn').onclick=()=>{ if(!isSaving && state.step>0){state.step--;render();} };
  const next=document.getElementById('nextBtn'); if(next) next.onclick=()=>{ if(!isSaving && state.step<steps.length-1){state.step++;render();} };
  document.getElementById('saveDraftBtn').onclick=()=>setStatus('Черновик сохранен в браузере.', 'ok');
  document.getElementById('clearDraft').onclick=()=>{ if(!isSaving && confirm('Очистить черновик?')){localStorage.removeItem(DRAFT_KEY);state.deal={};state.step=0;render();} };
  const save=document.getElementById('saveDealBtn'); if(save) save.onclick=saveDeal;
}
function handleClick(action){
  const [type,key,raw]=action.split(':');
  let val = raw;
  if(raw==='true') val=true; if(raw==='false') val=false;
  if(type==='set') set(key,val);
  if(type==='toggle') toggleArr(key,val);
}
function setStatus(text,type='info'){ const el=document.getElementById('pageStatus'); if(el){el.className='status '+type;el.textContent=text;} }
function normalizeText(value) { return String(value || '').trim().toLowerCase(); }
async function findRecentlyCreatedDeal() {
  const address = normalizeText(state.deal.address);
  if (!address) return null;
  try {
    const data = await rpc('nav_v2_get_deals_list', { p_limit: 30 }, 12000);
    const items = data.items || [];
    return items.find((deal) => normalizeText(deal.address) === address) || null;
  } catch (_) {
    return null;
  }
}
async function saveDeal(){
  if (isSaving) return;
  const r = readiness();
  if (r.lawyerPercent < 45 && !confirm('Заявка заполнена слабо. Сохранить как черновик в CRM все равно?')) return;
  isSaving = true;
  render();
  try{
    setStatus('Сохраняю сделку в CRM. Обычно это занимает несколько секунд...', 'info');
    const payload = { deal: { ...state.deal, readiness_local: { lawyer: r.lawyerPercent, deposit: r.depositPercent, missing: r.missing.map(x=>x.title), blockers: r.blockers }, spn_final: { comment: state.deal.spnFinalComment || '', next_step: state.deal.clientNextStep || '' } } };
    const saved = await rpc('nav_v2_save_wizard_result', { p_result: payload }, 15000);
    localStorage.removeItem(DRAFT_KEY);
    setStatus('Сделка сохранена. Открываю карточку...', 'ok');
    setTimeout(()=>location.href=`./deal-card-v2.html?id=${saved.id}`, 700);
  }catch(error){
    setStatus('Ответ от сохранения не получен быстро. Проверяю, не успела ли сделка создаться...', 'info');
    const found = await findRecentlyCreatedDeal();
    if (found?.id) {
      localStorage.removeItem(DRAFT_KEY);
      setStatus('Сделка найдена в базе. Открываю карточку...', 'ok');
      setTimeout(()=>location.href=`./deal-card-v2.html?id=${found.id}`, 700);
      return;
    }
    setStatus('Сделка не появилась в базе. Ошибка: '+error.message+' Черновик сохранен в браузере, можно попробовать еще раз.', 'error');
    isSaving = false;
    const save = document.getElementById('saveDealBtn');
    if (save) { save.disabled = false; save.textContent = 'Сохранить и открыть карточку'; }
  }
}

async function init(){
  setupTop('spn');
  if(!getCachedUser()) return renderAuthBox(document.getElementById('app'), async()=>location.reload());
  render();
}
init();
