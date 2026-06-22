import { getCachedUser, renderAuthBox, rpc, esc, riskPill } from './supabase-v2.js';

const DRAFT_KEY = 'nav_deal_draft_v2';
const state = { step: 0, deal: JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') };
let isSaving = false;

const steps = [
  { key:'start', title:'Что готовим', hint:'Задаток, сделку или консультацию' },
  { key:'representation', title:'Стороны', hint:'ФИО продавца, покупателя и кого представляем' },
  { key:'object', title:'Объект', hint:'Тип объекта, адрес, цена, задаток' },
  { key:'parties', title:'Участники', hint:'Собственники, дети, супруги, доли' },
  { key:'basis', title:'Документы', hint:'Основание права и сомнения' },
  { key:'money', title:'Деньги', hint:'Оплата, ипотека, сертификаты' },
  { key:'settlements', title:'Расчеты', hint:'Как и когда передаются деньги' },
  { key:'expenses', title:'Расходы', hint:'Кто что оплачивает' },
  { key:'finish', title:'Итог', hint:'Готовность, риски, передача юристу' }
];

const labelMaps = {
  preparationMode: { deposit:'задаток', deal:'сделка', consult:'консультация', unknown:'пока не ясно' },
  representation: { seller:'представляем продавца', buyer:'представляем покупателя', one_spn_both:'обе стороны, один СПН', both:'обе стороны, два СПН', partner_agency:'партнерская сделка', external_party:'одна сторона без представителя' },
  objectType: { flat:'квартира', house_land:'дом + земля', land:'земельный участок', share_room:'комната / доля', new_building:'новостройка / ДДУ', commercial:'коммерция' },
  flags: { oneAdultSeller:'один взрослый собственник', manySellers:'несколько собственников', minorSeller:'ребенок-собственник', minorBuyer:'ребенок-покупатель', minorRegistered:'зарегистрированы дети', spouse:'есть супруг/супруга', powerOfAttorney:'доверенность', shares:'доли' },
  basis: { sale:'ДКП', gift:'дарение', inheritLaw:'наследство по закону', inheritWill:'наследство по завещанию', privat:'приватизация', ddu:'ДДУ / уступка', court:'решение суда', other:'мена / рента / иное' },
  payments: { cash:'собственные средства', mortgage:'ипотека', matcap:'материнский капитал', certificate:'сертификат / субсидия', militaryMortgage:'военная ипотека / НИС', nominalChild:'детский номинальный счет', svoChildAccount:'деньги детей / СВО', installment:'рассрочка / остаток долга' },
  settlements: { beforeDeal:'перед сделкой', onDeal:'на сделке', sbr:'СБР', accreditive:'аккредитив', cell:'ячейка', notaryDeposit:'депозит нотариуса', afterRegistration:'после регистрации', pensionFund:'СФР / сертификат после регистрации' },
  notaryPayer: { buyer:'нотариус — покупатель', seller:'нотариус — продавец', split:'нотариус пополам', unknown:'нотариус не нужен/не ясно' }
};

function saveDraft(){ localStorage.setItem(DRAFT_KEY, JSON.stringify(state.deal)); }
function set(key,val){ state.deal[key]=val; saveDraft(); render(); }
function toggleArr(key,val){ const list = Array.isArray(state.deal[key]) ? state.deal[key] : []; state.deal[key] = list.includes(val) ? list.filter(x=>x!==val) : [...list,val]; saveDraft(); render(); }
function arr(key){ return Array.isArray(state.deal[key]) ? state.deal[key] : []; }
function has(key,val){ return arr(key).includes(val); }
function cls(key,val){ return state.deal[key]===val || has(key,val) ? 'active' : ''; }
function option(label, desc, action, active=''){ return `<div class="option ${active}" data-click="${action}"><b>${label}</b><span>${desc||''}</span></div>`; }
function field(key,label,type='text',placeholder=''){ return `<div class="field"><label>${label}</label><input data-field="${key}" type="${type}" value="${esc(state.deal[key]||'')}" placeholder="${esc(placeholder)}"></div>`; }
function textarea(key,label,placeholder=''){ return `<div class="field"><label>${label}</label><textarea data-field="${key}" placeholder="${esc(placeholder)}">${esc(state.deal[key]||'')}</textarea></div>`; }
function filled(value){ return String(value ?? '').trim().length > 0; }
function moneyFilled(value){ return Number(String(value || '').replace(',', '.')) > 0; }
function titleOf(map,value){ return labelMaps[map]?.[value] || value || '—'; }
function listText(key){ const values = arr(key).map(x => labelMaps[key]?.[x] || x); return values.length ? values.join(', ') : 'не указано'; }
function yesNo(value){ return value === true ? 'да' : value === false ? 'нет' : 'не указано'; }
function checkItem(title, done, help, level='yellow', group='lawyer'){ return { title, done:Boolean(done), help, level, group }; }
function partyTitle(){ return `${state.deal.sellerName || 'Продавец не указан'} / ${state.deal.buyerName || 'Покупатель не указан'} — ${state.deal.address || 'адрес не указан'}`; }

function localAnalysis(){
  const flags=arr('flags'), payments=arr('payments'), basis=arr('basis');
  const children = flags.some(x=>['minorSeller','minorBuyer','minorRegistered'].includes(x)) || payments.some(x=>['matcap','nominalChild','svoChildAccount'].includes(x));
  const mortgage = payments.some(x=>['mortgage','militaryMortgage'].includes(x));
  let risk='green'; const notes=[];
  if(children){ risk='red'; notes.push('Дети/детские деньги: передать юристу до задатка.'); }
  if(flags.includes('powerOfAttorney')){ if(risk!=='red') risk='yellow'; notes.push('Доверенность: проверить полномочия до задатка.'); }
  if(flags.includes('shares')){ if(risk!=='red') risk='yellow'; notes.push('Доли: возможна нотариальная форма и дополнительные расходы.'); }
  if(mortgage){ if(risk!=='red') risk='yellow'; notes.push('Ипотека: подключить брокера и проверить требования банка.'); }
  if(basis.some(x=>['inheritLaw','inheritWill','privat','court'].includes(x))){ if(risk!=='red') risk='yellow'; notes.push('Основание права требует юридической проверки.'); }
  if(arr('settlements').includes('afterRegistration')){ if(risk!=='red') risk='yellow'; notes.push('Расчет после регистрации: нужен понятный механизм защиты продавца.'); }
  if(state.deal.expensesAgreed!==true){ if(risk!=='red') risk='yellow'; notes.push('Расходы не согласованы: риск конфликта перед сделкой.'); }
  if(state.deal.settlementsAgreed!==true){ if(risk!=='red') risk='yellow'; notes.push('Порядок расчетов не согласован.'); }
  return { risk, notes, children, mortgage };
}

function readiness(){
  const a=localAnalysis();
  const items=[
    checkItem('Понятно, что готовим: задаток, сделку или консультацию', filled(state.deal.preparationMode), 'Выберите цель подготовки.', 'yellow', 'base'),
    checkItem('Понятно, кого представляет компания', filled(state.deal.representation), 'Укажите сторону представления.', 'yellow', 'base'),
    checkItem('Указано ФИО продавца', filled(state.deal.sellerName), 'ФИО продавца должно быть отдельным полем, а не только в комментарии.', 'yellow', 'base'),
    checkItem('Указано ФИО покупателя', filled(state.deal.buyerName), 'ФИО покупателя должно быть отдельным полем для заголовка и поиска.', 'yellow', 'base'),
    checkItem('Выбран тип объекта', filled(state.deal.objectType), 'Без типа объекта юрист не поймет, какие документы проверять.', 'yellow', 'base'),
    checkItem('Указан адрес объекта', filled(state.deal.address), 'Адрес нужен для заголовка, поиска и проверки.', 'yellow', 'base'),
    checkItem('Указана цена объекта', moneyFilled(state.deal.priceTotal), 'Цена нужна для задатка, расчетов, расходов и комиссии.', 'yellow', 'base'),
    checkItem('Указана сумма задатка или аванса', state.deal.preparationMode !== 'deposit' || moneyFilled(state.deal.depositAmount), 'Если готовим задаток — сумма должна быть понятна.', 'yellow', 'deposit'),
    checkItem('Участники и особые лица отмечены', arr('flags').length > 0 || filled(state.deal.sellerPhone) || filled(state.deal.buyerPhone), 'Отметьте собственников, детей, супруга, доверенность, доли или телефоны сторон.', 'yellow', 'lawyer'),
    checkItem('Основание права отмечено', arr('basis').length > 0, 'Укажите ДКП, наследство, дарение, приватизацию и т.д.', 'yellow', 'lawyer'),
    checkItem('Источник денег покупателя отмечен', arr('payments').length > 0, 'Нужно понимать: собственные средства, ипотека, маткапитал, сертификат и т.д.', 'yellow', 'lawyer'),
    checkItem('Способ расчетов выбран', arr('settlements').length > 0, 'Отметьте: на сделке, СБР, аккредитив, ячейка, после регистрации и т.д.', 'yellow', 'deposit'),
    checkItem('Порядок расчетов согласован', state.deal.settlementsAgreed === true, 'До задатка должно быть понятно, когда и как передаются деньги.', 'red', 'deposit'),
    checkItem('Расходы между сторонами согласованы', state.deal.expensesAgreed === true, 'До задатка нужно убрать спор по расходам.', 'red', 'deposit'),
    checkItem('Комментарий СПН для юриста есть', filled(state.deal.spnFinalComment), 'Кратко напишите, что уже понятно и что просите проверить.', 'yellow', 'lawyer'),
    checkItem('Следующий шаг с клиентом указан', filled(state.deal.clientNextStep), 'Укажите: документы, задаток, проверка, встреча.', 'yellow', 'base')
  ];
  const depositItems=items.filter(x=>['base','deposit'].includes(x.group));
  const lawyerItems=items.filter(x=>['base','lawyer','deposit'].includes(x.group));
  const percent=list=>Math.round((list.filter(x=>x.done).length/Math.max(list.length,1))*100);
  const blockers=[];
  if(a.children) blockers.push('Дети, опека или детские деньги — до задатка обязательно показать юристу.');
  if(arr('basis').includes('court')) blockers.push('Решение суда в основании — нужна юридическая проверка до движения дальше.');
  if(arr('settlements').includes('afterRegistration') && state.deal.settlementsAgreed!==true) blockers.push('Расчет после регистрации без согласованного механизма — нельзя спокойно выходить на задаток.');
  if(state.deal.settlementsAgreed===false) blockers.push('Порядок расчетов прямо отмечен как не согласованный.');
  if(state.deal.expensesAgreed===false) blockers.push('Расходы прямо отмечены как не согласованные.');
  const missing=items.filter(x=>!x.done);
  return { items, missing, blockers, risk:a.risk, notes:a.notes, children:a.children, mortgage:a.mortgage, depositPercent:percent(depositItems), lawyerPercent:percent(lawyerItems), readyForDeposit:percent(depositItems)>=80&&blockers.length===0, readyForLawyer:percent(lawyerItems)>=70&&filled(state.deal.address) };
}

function readinessMetric(label,value,cls){ return `<div class="metric ${cls}"><span>${label}</span><b>${value}%</b></div>`; }
function readinessPanel(){ const r=readiness(), top=r.missing.slice(0,5); return `<div class="card" style="box-shadow:none;margin-top:12px"><h3>Готовность заявки</h3><div class="kpi-row">${readinessMetric('К юристу',r.lawyerPercent,r.lawyerPercent>=70?'green':'yellow')}${readinessMetric('К задатку',r.depositPercent,r.readyForDeposit?'green':'yellow')}</div><div class="status"><b>Заголовок:</b><br>${esc(partyTitle())}</div>${r.blockers.length?`<div class="status error"><b>Стоп-вопросы:</b><br>${r.blockers.map(esc).join('<br>')}</div>`:''}${top.length?`<div class="status warn"><b>Что дозаполнить:</b><br>${top.map(x=>'• '+esc(x.title)).join('<br>')}</div>`:`<div class="status ok">Базовые поля заполнены хорошо.</div>`}</div>`; }
function readinessFullReport(){ const r=readiness(); return `<div class="card" style="box-shadow:none;margin-top:12px"><h3>Проверка перед передачей</h3><div class="list">${r.items.map(x=>`<div class="list-item"><b>${x.done?'✓':'!'} ${esc(x.title)}</b><span class="small">${esc(x.done?'готово':x.help)}</span></div>`).join('')}</div></div>`; }
function handoffText(){ const r=readiness(); const lines=['Передача заявки от СПН юристу','',`Заголовок: ${partyTitle()}`,`Продавец: ${state.deal.sellerName || 'не указан'}`,`Покупатель: ${state.deal.buyerName || 'не указан'}`,`Телефон продавца: ${state.deal.sellerPhone || 'не указан'}`,`Телефон покупателя: ${state.deal.buyerPhone || 'не указан'}`,'',`Готовность к юристу: ${r.lawyerPercent}%`,`Готовность к задатку: ${r.depositPercent}%`,`Риск: ${r.risk}`,'',`Объект: ${titleOf('objectType', state.deal.objectType)}`,`Адрес: ${state.deal.address || 'не указан'}`,`Цена: ${state.deal.priceTotal || 'не указана'}`,`Задаток/аванс: ${state.deal.depositAmount || 'не указан'}`,'',`Кого представляем: ${titleOf('representation', state.deal.representation)}`,`Особые лица/условия: ${listText('flags')}`,`Основание права: ${listText('basis')}`,`Источник денег: ${listText('payments')}`,`Расчеты: ${listText('settlements')}`,'',`Порядок расчетов согласован: ${yesNo(state.deal.settlementsAgreed)}`,`Расходы согласованы: ${yesNo(state.deal.expensesAgreed)}`,`Нотариус: ${titleOf('notaryPayer', state.deal.notaryPayer)}`,'',`Комментарий СПН: ${state.deal.spnFinalComment || 'не указан'}`,`Следующий шаг с клиентом: ${state.deal.clientNextStep || 'не указан'}`]; if(r.blockers.length) lines.push('', 'Стоп-вопросы:', ...r.blockers.map(x=>'- '+x)); if(r.missing.length) lines.push('', 'Что нужно дозаполнить:', ...r.missing.map(x=>'- '+x.title)); return lines.join('\n'); }
function handoffBox(){ return `<div class="card" style="box-shadow:none;margin-top:12px"><h3>Текст для передачи юристу</h3><textarea id="handoffText" readonly style="min-height:260px">${esc(handoffText())}</textarea><div class="actions" style="justify-content:flex-start"><button class="btn light" id="copyHandoff" type="button">Скопировать текст</button></div></div>`; }

function stepStart(){ return `<h2>Что сейчас готовим?</h2><p class="muted">Выберите реальную задачу. От этого зависит, насколько жестко система будет требовать данные до сохранения.</p><div class="option-grid">${option('Задаток','Нужно проверить стоп-факторы до встречи.', 'set:preparationMode:deposit', cls('preparationMode','deposit'))}${option('Сделку','Готовим полную сделку и документы.', 'set:preparationMode:deal', cls('preparationMode','deal'))}${option('Консультацию','Клиент пока уточняет условия.', 'set:preparationMode:consult', cls('preparationMode','consult'))}${option('Пока не ясно','Создать черновик и дозаполнить позже.', 'set:preparationMode:unknown', cls('preparationMode','unknown'))}</div>${textarea('situation','Кратко опишите ситуацию','Что хочет клиент, что уже известно, где есть сомнения?')}`; }
function stepRepresentation(){ return `<h2>Стороны сделки</h2><p class="muted">Эти данные станут главным заголовком сделки, задатка и карточки юриста.</p><div class="grid"><div>${field('sellerName','ФИО продавца','text','Например: Иванов Иван Иванович')}</div><div>${field('buyerName','ФИО покупателя','text','Например: Петров Петр Петрович')}</div></div><div class="grid"><div>${field('sellerPhone','Телефон продавца','text','')}</div><div>${field('buyerPhone','Телефон покупателя','text','')}</div></div><div class="status"><b>Предпросмотр заголовка:</b><br>${esc(partyTitle())}</div><h3>Кого представляет компания?</h3><div class="option-grid">${option('Продавца','Мы защищаем сторону продавца.', 'set:representation:seller', cls('representation','seller'))}${option('Покупателя','Мы защищаем сторону покупателя.', 'set:representation:buyer', cls('representation','buyer'))}${option('Обе стороны, один СПН','Нужна прозрачность договоренностей.', 'set:representation:one_spn_both', cls('representation','one_spn_both'))}${option('Обе стороны, два СПН','Укажите коллегу/стороны в комментарии.', 'set:representation:both', cls('representation','both'))}${option('Партнерская сделка','Есть внешний представитель.', 'set:representation:partner_agency', cls('representation','partner_agency'))}${option('Одна сторона без представителя','Важно согласовать коммуникацию.', 'set:representation:external_party', cls('representation','external_party'))}</div>${textarea('representationComment','Комментарий по сторонам','Кто с кем общается, кто принимает решения, есть ли внешний представитель?')}`; }
function stepObject(){ return `<h2>Объект</h2><div class="option-grid">${option('Квартира','', 'set:objectType:flat', cls('objectType','flat'))}${option('Дом + земля','', 'set:objectType:house_land', cls('objectType','house_land'))}${option('Земельный участок','', 'set:objectType:land', cls('objectType','land'))}${option('Комната / доля','', 'set:objectType:share_room', cls('objectType','share_room'))}${option('Новостройка / ДДУ','', 'set:objectType:new_building', cls('objectType','new_building'))}${option('Коммерция','', 'set:objectType:commercial', cls('objectType','commercial'))}</div><div class="grid"><div>${field('address','Адрес объекта','text','город, улица, дом, квартира')}</div><div>${field('priceTotal','Цена объекта','number','')}</div></div><div class="grid"><div>${field('depositAmount','Сумма задатка/аванса','number','')}</div><div>${field('cadastralNumber','Кадастровый номер','text','если есть')}</div></div><div class="status"><b>Предпросмотр заголовка:</b><br>${esc(partyTitle())}</div>${textarea('objectComment','Комментарий по объекту','Особенности объекта, перепланировка, доли, земля, состояние документов.')}`; }
function stepParties(){ return `<h2>Участники и особые лица</h2><p class="muted">Отметьте всё, что может влиять на документы и согласования.</p><div class="option-grid">${option('Один взрослый собственник','', 'toggle:flags:oneAdultSeller', cls('flags','oneAdultSeller'))}${option('Несколько собственников','', 'toggle:flags:manySellers', cls('flags','manySellers'))}${option('Ребенок-собственник','Стоп-фактор до юриста.', 'toggle:flags:minorSeller', cls('flags','minorSeller'))}${option('Ребенок-покупатель','Может быть маткапитал/доля.', 'toggle:flags:minorBuyer', cls('flags','minorBuyer'))}${option('Зарегистрированы дети','Проверить выписку и сроки.', 'toggle:flags:minorRegistered', cls('flags','minorRegistered'))}${option('Есть супруг/супруга','Нужно согласие или брачный режим.', 'toggle:flags:spouse', cls('flags','spouse'))}${option('Доверенность','Проверить полномочия.', 'toggle:flags:powerOfAttorney', cls('flags','powerOfAttorney'))}${option('Доли','Возможен нотариус.', 'toggle:flags:shares', cls('flags','shares'))}</div>${textarea('partiesComment','Комментарий по участникам','Кто собственник, кто платит, кто принимает решение, есть ли дополнительные участники?')}`; }
function stepBasis(){ return `<h2>Основание права и документы</h2><div class="option-grid">${option('ДКП','', 'toggle:basis:sale', cls('basis','sale'))}${option('Дарение','', 'toggle:basis:gift', cls('basis','gift'))}${option('Наследство по закону','', 'toggle:basis:inheritLaw', cls('basis','inheritLaw'))}${option('Наследство по завещанию','', 'toggle:basis:inheritWill', cls('basis','inheritWill'))}${option('Приватизация','', 'toggle:basis:privat', cls('basis','privat'))}${option('ДДУ / уступка','', 'toggle:basis:ddu', cls('basis','ddu'))}${option('Решение суда','Передать юристу до задатка.', 'toggle:basis:court', cls('basis','court'))}${option('Иное','Опишите в комментарии.', 'toggle:basis:other', cls('basis','other'))}</div>${textarea('basisComment','Комментарий по документам','Что на руках, чего нет, что вызывает вопросы.')}`; }
function stepMoney(){ return `<h2>Деньги покупателя</h2><div class="option-grid">${option('Собственные средства','', 'toggle:payments:cash', cls('payments','cash'))}${option('Ипотека','Подключить брокера.', 'toggle:payments:mortgage', cls('payments','mortgage'))}${option('Маткапитал','Дети/доли/СФР.', 'toggle:payments:matcap', cls('payments','matcap'))}${option('Сертификат / субсидия','Проверить условия.', 'toggle:payments:certificate', cls('payments','certificate'))}${option('Военная ипотека / НИС','Проверить банк и сроки.', 'toggle:payments:militaryMortgage', cls('payments','militaryMortgage'))}${option('Детский номинальный счет','Проверить порядок использования.', 'toggle:payments:nominalChild', cls('payments','nominalChild'))}${option('Деньги детей / СВО','Нужна осторожная проверка.', 'toggle:payments:svoChildAccount', cls('payments','svoChildAccount'))}${option('Рассрочка / остаток долга','Нужен безопасный механизм.', 'toggle:payments:installment', cls('payments','installment'))}</div>${field('priceContract','Цена в договоре, если отличается','number','')}`; }
function stepSettlements(){ return `<h2>Порядок расчетов</h2><p class="muted">Важно согласовать порядок заранее: когда деньги, какая защита, кто пишет расписку.</p><div class="option-grid">${option('Перед сделкой','Договор подписан, расписка, расчет до подачи.', 'toggle:settlements:beforeDeal', cls('settlements','beforeDeal'))}${option('На сделке','Расчет и расписка в день сделки.', 'toggle:settlements:onDeal', cls('settlements','onDeal'))}${option('СБР','Сервис безопасных расчетов.', 'toggle:settlements:sbr', cls('settlements','sbr'))}${option('Аккредитив','Банковский аккредитив.', 'toggle:settlements:accreditive', cls('settlements','accreditive'))}${option('Ячейка','Банковская ячейка.', 'toggle:settlements:cell', cls('settlements','cell'))}${option('Депозит нотариуса','Для нотариальных сделок.', 'toggle:settlements:notaryDeposit', cls('settlements','notaryDeposit'))}${option('После регистрации','Только с пониманием обременения.', 'toggle:settlements:afterRegistration', cls('settlements','afterRegistration'))}${option('СФР / сертификат после регистрации','Часть оплаты приходит позже.', 'toggle:settlements:pensionFund', cls('settlements','pensionFund'))}</div><div class="option-grid">${option('Порядок расчетов согласован','Можно фиксировать в задатке/условиях сделки.', 'set:settlementsAgreed:true', state.deal.settlementsAgreed===true?'active':'')}${option('Порядок расчетов НЕ согласован','Система поставит задачу до задатка.', 'set:settlementsAgreed:false', state.deal.settlementsAgreed===false?'active':'')}</div>${textarea('settlementsComment','Комментарий по расчетам','Когда передаются деньги, кто пишет расписку, какой банк/сервис, есть ли обременение.')}`; }
function stepExpenses(){ return `<h2>Расходы покупателя и продавца</h2><p class="muted">Этот блок нужен, чтобы заранее убрать конфликт по расходам.</p><div class="option-grid">${option('Расходы согласованы','Стороны понимают, кто и что оплачивает.', 'set:expensesAgreed:true', state.deal.expensesAgreed===true?'active':'')}${option('Расходы НЕ согласованы','Нужно согласовать до задатка.', 'set:expensesAgreed:false', state.deal.expensesAgreed===false?'active':'')}</div><div class="grid"><div>${field('buyerCompanyFee','Комиссия покупателя','number','')}</div><div>${field('sellerCompanyFee','Комиссия продавца','number','')}</div></div><div class="option-grid">${option('Нотариус — покупатель','', 'set:notaryPayer:buyer', cls('notaryPayer','buyer'))}${option('Нотариус — продавец','', 'set:notaryPayer:seller', cls('notaryPayer','seller'))}${option('Нотариус пополам','', 'set:notaryPayer:split', cls('notaryPayer','split'))}${option('Нотариус не нужен/не ясно','', 'set:notaryPayer:unknown', cls('notaryPayer','unknown'))}</div>${textarea('expensesComment','Комментарий по расходам','Кто платит СБР/аккредитив/ячейку, госпошлину, справки, оценку, страховку, доверенности, согласия.')}`; }
function stepFinish(){ const a=localAnalysis(); return `<h2>Итог перед сохранением</h2><div class="status"><b>Главный заголовок сделки:</b><br>${esc(partyTitle())}</div><div class="summary-grid"><div class="metric ${a.risk==='red'?'red':a.risk==='yellow'?'yellow':'green'}"><span>Риск</span><b>${a.risk==='red'?'Стоп':a.risk==='yellow'?'Внимание':'Обычная'}</b>${riskPill(a.risk)}</div><div class="metric"><span>Кому передать</span><b>${a.children?'Юристу':a.mortgage?'Брокеру':'СПН'}</b></div></div>${readinessFullReport()}<div class="card" style="box-shadow:none;margin-top:12px"><h3>Что важно сейчас</h3><div class="list">${(a.notes.length?a.notes:['Проверить базовые документы, расходы и порядок расчетов.']).map(n=>`<div class="list-item">${esc(n)}</div>`).join('')}</div></div><div class="grid"><div>${textarea('spnFinalComment','Комментарий СПН для юриста','Кратко: что уже понятно, что вызывает сомнения, что просите проверить')}</div><div>${field('clientNextStep','Следующий шаг с клиентом','text','Например: собрать документы, назначить задаток')}</div></div>${handoffBox()}<div class="status warn">После сохранения откроется карточка сделки. Перед передачей юристу проверьте блоки: риски, документы, задачи, расходы и комментарий СПН.</div>`; }

const renderers=[stepStart,stepRepresentation,stepObject,stepParties,stepBasis,stepMoney,stepSettlements,stepExpenses,stepFinish];

function render(){
  const app=document.getElementById('app');
  const progress=Math.round(((state.step+1)/steps.length)*100);
  app.innerHTML=`<main class="nav-v2-shell"><section class="hero"><h1>Новая сделка</h1><p>Мастер помогает СПН собрать карточку к задатку и передаче юристу. Главный заголовок теперь строится из ФИО продавца, ФИО покупателя и адреса объекта.</p></section><section class="stepper"><aside class="steps card"><h3>Шаги</h3><div class="progress"><i style="width:${progress}%"></i></div><div class="step-list">${steps.map((s,i)=>`<button class="step-pill ${i===state.step?'active':''}" data-step="${i}" ${isSaving?'disabled':''}><b>${i+1}. ${s.title}</b><span>${s.hint}</span></button>`).join('')}</div>${readinessPanel()}</aside><section class="card"><div class="section-title"><div><span class="pill blue">Шаг ${state.step+1} из ${steps.length}</span></div><button class="btn light" id="clearDraft" type="button" ${isSaving?'disabled':''}>Очистить черновик</button></div>${renderers[state.step]()}<div id="pageStatus"></div><div class="actions"><button class="btn light" id="prevBtn" ${state.step===0||isSaving?'disabled':''}>Назад</button><div><button class="btn light" id="saveDraftBtn" ${isSaving?'disabled':''}>Сохранить черновик</button>${state.step<steps.length-1?`<button class="btn primary" id="nextBtn" ${isSaving?'disabled':''}>Далее</button>`:`<button class="btn green" id="saveDealBtn" ${isSaving?'disabled':''}>${isSaving?'Сохраняю...':'Сохранить и открыть карточку'}</button>`}</div></div></section></section></main>`;
  bind();
}

function bind(){
  document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{ if(isSaving)return; state.step=Number(b.dataset.step); render(); });
  document.querySelectorAll('[data-click]').forEach(el=>el.onclick=()=>{ if(isSaving)return; handleClick(el.dataset.click); });
  document.querySelectorAll('[data-field]').forEach(el=>el.oninput=()=>{ if(isSaving)return; state.deal[el.dataset.field]=el.value; saveDraft(); const handoff=document.getElementById('handoffText'); if(handoff) handoff.value=handoffText(); });
  document.getElementById('prevBtn').onclick=()=>{ if(!isSaving&&state.step>0){state.step--;render();} };
  const next=document.getElementById('nextBtn'); if(next) next.onclick=()=>{ if(!isSaving&&state.step<steps.length-1){state.step++;render();} };
  document.getElementById('saveDraftBtn').onclick=()=>setStatus('Черновик сохранен в браузере.','ok');
  document.getElementById('clearDraft').onclick=()=>{ if(!isSaving&&confirm('Очистить черновик?')){ localStorage.removeItem(DRAFT_KEY); state.deal={}; state.step=0; render(); } };
  const copy=document.getElementById('copyHandoff'); if(copy) copy.onclick=copyHandoffText;
  const save=document.getElementById('saveDealBtn'); if(save) save.onclick=saveDeal;
}

async function copyHandoffText(){ const text=handoffText(), field=document.getElementById('handoffText'); if(field) field.value=text; try{ await navigator.clipboard.writeText(text); setStatus('Текст передачи юристу скопирован.','ok'); }catch(_){ if(field){field.focus();field.select();} setStatus('Не удалось скопировать автоматически. Текст выделен, скопируйте вручную.','warn'); } }
function handleClick(action){ const [type,key,raw]=action.split(':'); let val=raw; if(raw==='true')val=true; if(raw==='false')val=false; if(type==='set')set(key,val); if(type==='toggle')toggleArr(key,val); }
function setStatus(text,type='info'){ const el=document.getElementById('pageStatus'); if(el){ el.className='status '+type; el.textContent=text; } }
function normalizeText(value){ return String(value||'').trim().toLowerCase(); }
async function findRecentlyCreatedDeal(){ const title=normalizeText(partyTitle()), address=normalizeText(state.deal.address); try{ const data=await rpc('nav_v2_get_deals_list',{p_limit:30},12000); const items=data.items||[]; return items.find(deal=>normalizeText(deal.title)===title) || items.find(deal=>address&&normalizeText(deal.address)===address) || null; }catch(_){ return null; } }
async function saveDeal(){
  if(isSaving)return;
  const r=readiness();
  if(r.lawyerPercent<45&&!confirm('Заявка заполнена слабо. Сохранить как черновик в CRM все равно?'))return;
  isSaving=true; render();
  try{
    setStatus('Сохраняю сделку в CRM. Обычно это занимает несколько секунд...','info');
    const payload={ deal:{ ...state.deal, readiness_local:{ lawyer:r.lawyerPercent, deposit:r.depositPercent, missing:r.missing.map(x=>x.title), blockers:r.blockers }, spn_final:{ comment:state.deal.spnFinalComment||'', next_step:state.deal.clientNextStep||'', handoff_text:handoffText() } } };
    const saved=await rpc('nav_v2_save_wizard_result',{p_result:payload},15000);
    localStorage.removeItem(DRAFT_KEY);
    setStatus('Сделка сохранена. Открываю карточку...','ok');
    setTimeout(()=>location.href=`./deal-card-v2.html?id=${saved.id}`,700);
  }catch(error){
    setStatus('Ответ от сохранения не получен быстро. Проверяю, не успела ли сделка создаться...','info');
    const found=await findRecentlyCreatedDeal();
    if(found?.id){ localStorage.removeItem(DRAFT_KEY); setStatus('Сделка найдена в базе. Открываю карточку...','ok'); setTimeout(()=>location.href=`./deal-card-v2.html?id=${found.id}`,700); return; }
    setStatus('Сделка не появилась в базе. Ошибка: '+error.message+' Черновик сохранен в браузере, можно попробовать еще раз.','error');
    isSaving=false; const save=document.getElementById('saveDealBtn'); if(save){ save.disabled=false; save.textContent='Сохранить и открыть карточку'; }
  }
}

async function init(){ if(!getCachedUser()) return renderAuthBox(document.getElementById('app'), async()=>location.reload()); render(); }
init();
