import { emptyState, normalizeState, normalizeFact, activeQuestions, assess, buildSummary, validateCatalog } from './model.js?v=20261019-01';

const main = document.getElementById('main');
let catalog;
let state = emptyState();
let stage = 'home';
let contextNotice = '';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const titles = {yes:'Да',no:'Нет',unknown:'Не знаю',not_applicable:'Не относится'};
const option = (item,value) => `<option value="${esc(item.id)}" ${item.id === value ? 'selected' : ''}>${esc(item.title)}</option>`;
const list = (items,empty='Дополнительных вопросов в этой группе пока нет.') => items.length ? `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : `<p class="help">${esc(empty)}</p>`;
const button = (action,title,kind='primary') => `<button type="button" class="button ${kind}" data-action="${action}">${esc(title)}</button>`;

function sources() {
  return `<details class="pilot" id="source-details"><summary>Об источниках и статусе рекомендаций</summary><p>${esc(catalog.content_status)}</p><p>Это ориентиры подготовки. Состав документов и юридическое решение определяет профильный специалист по конкретной ситуации.</p><div class="source-list">${catalog.sources.map((source) => `<article><strong>${source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a>` : esc(source.title)}</strong><p>${esc(source.note)}</p><p>Проверка источника: ${esc(source.checked_at)}.</p></article>`).join('')}</div><p>Каталог ${esc(catalog.version)} · ${esc(catalog.reviewed_at)}.</p></details>`;
}

function nav() {
  const steps=[['situation','1. Ситуация'],['details','2. Важные детали'],['result','3. Ваш план']];
  return `<nav class="step-nav" aria-label="Шаги подготовки">${steps.map(([id,title]) => `<button type="button" data-nav="${id}" ${stage === id ? 'aria-current="step"' : ''}>${title}</button>`).join('')}</nav>`;
}

function heading(title,description='') {
  return `${nav()}<div class="heading-row"><div><span class="eyebrow">${esc(catalog.modes.find((mode) => mode.id === state.mode)?.title)}</span><h1 id="page-title" tabindex="-1">${esc(title)}</h1>${description ? `<p class="lead">${esc(description)}</p>` : ''}</div><button type="button" class="text-button" data-action="reset">Начать заново</button></div>`;
}

function home() {
  const descriptions=['Уточнить условия, документы и вопросы юристу до подписания и передачи денег.','Сверить вводные, расчёты, регистрацию и передачу объекта.','Разобраться с необычной ситуацией и понять, кого подключить.'];
  return `<section class="hero"><span class="eyebrow">Помощник подготовки</span><h1 id="page-title" tabindex="-1">К следующему шагу —<br><span>без забытых деталей.</span></h1><p class="lead">Выберите задачу. Навигатор подскажет, что уточнить у сторон, какие документы запросить и что спросить у специалиста.</p></section><section class="mode-grid" aria-label="Что вы готовите">${catalog.modes.map((mode,index) => `<button type="button" class="mode-card" data-mode="${esc(mode.id)}"><span class="number" aria-hidden="true">0${index+1}</span><strong>${esc(mode.title)}</strong><span class="description">${descriptions[index]}</span><span class="arrow" aria-hidden="true">↗</span></button>`).join('')}</section><div class="quiet-row"><div><strong>Можно начать с того, что знаете</strong><p>Пропустите неизвестное и вернитесь к любому ответу. Полную анкету заполнять не нужно.</p></div><div><strong>Без данных клиентов</strong><p>Имена, адреса, суммы и документы остаются в CRM. Здесь выбираются только обстоятельства.</p></div><div><strong>Решение — у специалиста</strong><p>Навигатор помогает подготовить вопрос. Юридическую оценку даёт юрист, кредитную — банк.</p></div></div>${sources()}`;
}

function situation() {
  const features=catalog.features.filter((feature) => !feature.when?.objects || feature.when.objects.includes(state.object));
  return `${heading('Какая у вас ситуация?','Отметьте известные обстоятельства. Если ответа пока нет, переходите дальше.')}<div class="context-layout"><div class="stack"><section class="panel"><label class="field-label" for="object">Что за объект?</label><select id="object" data-context="object">${catalog.objects.map((item) => option(item,state.object)).join('')}</select><p class="help">Выберите юридический тип объекта, если он известен.</p></section><section class="panel"><fieldset><legend>Как планируют оплачивать?</legend><p class="help">Можно выбрать несколько источников. Кредит и социальные средства уточняются отдельно.</p><div class="check-grid">${catalog.funding.map((item) => `<label class="check" for="funding-${item.id}"><input id="funding-${item.id}" type="checkbox" data-funding="${item.id}" ${state.funding.includes(item.id) ? 'checked' : ''}>${esc(item.title)}</label>`).join('')}</div></fieldset></section><section class="panel"><fieldset><legend>${state.mode === 'question' ? 'С чем связан вопрос?' : 'Есть известные особенности?'}</legend><p class="help">Выберите только нужное. Неотмеченные обстоятельства остаются непроверенными.</p><div class="check-grid">${features.map((item) => `<label class="check" for="feature-${item.id}"><input id="feature-${item.id}" type="checkbox" data-feature="${item.id}" ${state.features.includes(item.id) ? 'checked' : ''}>${esc(item.title)}</label>`).join('')}</div></fieldset></section></div><aside class="panel"><div class="aside-note"><h2>Ответов может пока не быть</h2><p>Неизвестное станет конкретным вопросом для подготовки, а не отметкой об отсутствии риска.</p></div><label class="field-label" for="urgency">Когда нужен следующий шаг?</label><select id="urgency" data-context="urgency">${catalog.urgencies.map((item) => option(item,state.urgency)).join('')}</select><details class="inline-details" id="coordination-details"><summary>Если стороны ведут разные СПН</summary><label class="field-label" for="coordination">Кто координирует стороны?</label><select id="coordination" data-context="coordination">${catalog.coordination.map((item) => option(item,state.coordination)).join('')}</select><p class="help">Личные данные и назначения здесь не нужны.</p></details></aside></div>${contextNotice ? `<p role="status" class="status">${esc(contextNotice)}</p>` : ''}<div class="buttons">${button('details','Уточнить важные детали')}${button('result','Показать план сейчас','secondary')}</div>`;
}

function details() {
  const questions=activeQuestions(state,catalog);
  return `${heading('Проверим важные детали','У каждого ответа можно указать источник. Любой вопрос разрешается оставить неизвестным.')}<p class="progress-copy">${questions.length} коротких вопросов по выбранной ситуации. Пропущенные ответы попадут в список уточнений.</p><div class="questions">${questions.map((question) => {
    const fact=normalizeFact(state.facts[question.id]);
    return `<fieldset class="question" data-question="${question.id}"><legend>${esc(question.title)}</legend><div class="answers">${Object.entries(titles).map(([value,title]) => `<label class="answer" for="fact-${question.id}-${value}"><input type="radio" id="fact-${question.id}-${value}" name="fact-${question.id}" data-fact="${question.id}" value="${value}" ${fact.value === value ? 'checked' : ''}>${title}</label>`).join('')}</div>${['yes','no'].includes(fact.value) ? `<div class="source-field"><label for="source-${question.id}">Откуда известно?</label><select id="source-${question.id}" data-source="${question.id}">${[{id:'unchecked',title:'Источник пока не указан'},{id:'client',title:'Со слов клиента'},{id:'document',title:'Сверено с документом'}].map((item) => option(item,fact.source)).join('')}</select></div>` : ''}<details class="why" id="why-${question.id}"><summary>Зачем это уточнять</summary><p>${esc(question.why)}</p>${fact.value === 'not_applicable' ? '<p>Отметка «не относится» не подтверждает применимость: при сомнении уточните у юриста.</p>' : ''}</details></fieldset>`;
  }).join('')}</div><div class="buttons">${button('situation','Назад к ситуации','secondary')}${button('result','Получить план подготовки')}</div>`;
}

function factGroup(title,items) {
  if (!items.length) return '';
  return `<div class="fact-group"><h3>${title}</h3>${items.map((item) => `<p>${esc(item.short || item.title)} — ${esc(titles[item.value].toLowerCase())}.</p>`).join('')}</div>`;
}

function resultView() {
  const result=assess(state,catalog);state=result.state;
  const {facts}=result;
  const contextGaps=[];
  if(state.object === 'unknown') contextGaps.push('Определить тип объекта по документам.');
  if(state.funding.includes('unknown')) contextGaps.push('Уточнить источники оплаты и зависимость от другой продажи.');
  const urgency=state.urgency === 'urgent' ? '<div class="notice"><strong>Встреча уже назначена</strong><p>Согласуйте реальный срок ответа эксперта. Срочность не заменяет проверку и не подтверждает возможность подписания.</p></div>' : '';
  const known=factGroup('Сверено с документом — без юридического вывода',facts.document)+factGroup('Со слов клиента',facts.client)+factGroup('Источник пока не указан',facts.unchecked);
  return `${heading('Ваш план подготовки','Уточните пробелы, получите профильный ответ и зафиксируйте дальнейшие действия в CRM.')}<section class="next-step"><span class="eyebrow">Что сделать сейчас</span><h2>${esc(result.next)}</h2></section><div class="result-layout"><div class="stack">${urgency}<section class="result-card"><h2>Что уже известно</h2><p class="help">${esc(catalog.objects.find((item) => item.id === state.object)?.title)} · ${esc(state.funding.map((id) => catalog.funding.find((item) => item.id === id)?.title).join(', '))}</p>${known || '<p>Подтверждённые обстоятельства пока не отмечены.</p>'}${facts.not_applicable.length ? `<p class="help">«Не относится» (применимость не проверена): ${esc(facts.not_applicable.map((item) => item.short).join('; '))}.</p>` : ''}</section><section class="result-card"><h2>Что ещё уточнить</h2>${list([...contextGaps,...result.clarify.map((item) => item.clarify)],'В показанных вопросах явных пробелов не осталось. Профильная проверка документов и обстоятельств всё равно нужна.')}<details class="inline-details" id="unreviewed"><summary>Какие особенности отдельно не проверялись</summary>${list(result.unreviewed.map((item) => item.title),'Все особенности из текущего списка были выбраны. Это не подтверждает полноту правовой проверки.')}<p class="help">Отсутствие отметки не означает отсутствие обстоятельства. При сомнении вернитесь к ситуации или передайте неизвестное юристу.</p></details></section>${result.signals.length ? `<section class="result-card attention"><h2>На что обратить внимание</h2>${list(result.signals)}<p class="help">Это вопросы для оценки, а не установленные нарушения.</p></section>` : ''}<section class="result-card"><details id="documents"><summary><strong>Какие документы могут понадобиться</strong></summary><p class="help">Ориентир по ситуации. Нужный состав и достаточность определяет специалист. Если документ уже есть в CRM, повторно запрашивать его не нужно.</p>${result.documents.map((document) => `<article class="document"><h3>${esc(document.title)}</h3><p><strong>Зачем:</strong> ${esc(document.why)}</p><p><strong>У кого:</strong> ${esc(document.from)}</p><p><strong>Когда:</strong> ${esc(document.stage)}</p><p><strong>Проверка:</strong> ${esc(document.review)}</p><label class="plain-check" for="available-${document.id}"><input type="checkbox" id="available-${document.id}" data-available="${document.id}" ${state.available.includes(document.id) ? 'checked' : ''}>Доступен в CRM — добавить в сводку (необязательно)</label></article>`).join('')}</details></section>${state.coordination === 'two_spn' ? '<section class="result-card"><h2>Согласовать с другим СПН</h2><p>Сверьте единый набор вводных и вопрос эксперту. Каждый СПН запрашивает сведения у своей стороны. Договоритесь, кто вернёт ответ сторонам и зафиксирует следующий шаг в CRM.</p></section>' : ''}</div><aside class="result-side"><section class="result-card"><span class="badge">Решение принимает юрист</span><h2>Что передать юристу</h2>${list(result.lawyer)}<div class="result-actions">${button('copy-lawyer','Скопировать запрос юристу')}</div><p class="help">Код карточки и точный срок добавьте в разрешённом канале. Документы остаются в рабочем контуре.</p></section>${result.broker.length ? `<section class="result-card"><span class="badge">Есть банковский вопрос</span><h2>Что уточнить у брокера / банка</h2>${list(result.broker)}<div class="result-actions">${button('copy-broker','Скопировать вопрос брокеру','secondary')}</div></section>` : ''}${result.program.length ? `<section class="result-card"><h2>У оператора программы</h2>${list(result.program)}<p class="help">Сам маткапитал или сертификат не означает, что нужен ипотечный брокер.</p></section>` : ''}<section class="result-card"><h2>После ответа специалиста</h2><p>Зафиксируйте ответ, ответственное действие и срок в CRM. Вернитесь к сторонам с подтверждённым порядком. Новые условия передайте на повторную проверку.</p></section><p role="status" id="copy-status" class="status" aria-live="polite"></p><div id="manual-copy"></div></aside></div><div class="buttons">${button('details','Исправить ответы','secondary')}${button('situation','Изменить ситуацию','tertiary')}</div>${sources()}`;
}

function render(moveFocus=false) {
  const activeId=document.activeElement?.id;
  const openDetails=[...main.querySelectorAll('details[open][id]')].map((element) => element.id);
  main.innerHTML=stage === 'home' ? home() : stage === 'situation' ? situation() : stage === 'details' ? details() : resultView();
  for(const id of openDetails){const element=document.getElementById(id);if(element?.tagName === 'DETAILS')element.open=true;}
  if(moveFocus){document.getElementById('page-title')?.focus();window.scrollTo({top:0,behavior:'instant'});}
  else if(activeId)document.getElementById(activeId)?.focus({preventScroll:true});
}

function go(next){stage=next;state=normalizeState(state,catalog);render(true);}
async function copy(audience) {
  const result=assess(state,catalog);
  const text=buildSummary(result,catalog,audience);
  const status=document.getElementById('copy-status');
  try {
    if(!navigator.clipboard?.writeText)throw new Error('clipboard_unavailable');
    await navigator.clipboard.writeText(text);
    if(status?.isConnected)status.textContent='Скопировано. Проверьте запрос перед отправкой.';
  } catch {
    const host=document.getElementById('manual-copy');
    if(!host)return;
    host.innerHTML='<div class="manual-copy"><label for="summary-text">Выделите текст и скопируйте вручную</label><textarea id="summary-text" readonly spellcheck="false"></textarea></div>';
    const area=document.getElementById('summary-text');area.value=text;area.focus();area.select();
    status.textContent='Браузер не разрешил автоматическое копирование. Текст доступен ниже.';
  }
}

main.addEventListener('click',(event) => {
  const target=event.target.closest('button');if(!target)return;
  if(target.dataset.mode){state=emptyState();state.mode=target.dataset.mode;contextNotice='';go('situation');return;}
  if(target.dataset.nav){go(target.dataset.nav);return;}
  const action=target.dataset.action;
  if(action === 'retry'){boot();return;}
  if(action === 'reset'){state=emptyState();contextNotice='';stage='home';render(true);return;}
  if(['situation','details','result'].includes(action)){go(action);return;}
  if(action === 'copy-lawyer')copy('lawyer');
  if(action === 'copy-broker')copy('broker');
});

main.addEventListener('change',(event) => {
  const target=event.target;
  if(target.dataset.context){
    const key=target.dataset.context;state[key]=target.value;
    if(key === 'object'){state.facts={};state.available=[];contextNotice='Объект изменён. Подтверждения деталей нужно уточнить заново.';}
  }
  if(target.dataset.funding){
    const id=target.dataset.funding;
    state.funding=id === 'unknown' && target.checked ? ['unknown'] : target.checked ? [...state.funding.filter((item) => item !== 'unknown'),id] : state.funding.filter((item) => item !== id);
    state.facts={};state.available=[];contextNotice='Оплата изменена. Подтверждения деталей нужно уточнить заново.';
  }
  if(target.dataset.feature){const id=target.dataset.feature;state.features=target.checked ? [...state.features,id] : state.features.filter((item) => item !== id);}
  if(target.dataset.fact){state.facts[target.dataset.fact]={value:target.value,source:'unchecked'};}
  if(target.dataset.source){const id=target.dataset.source;state.facts[id]={...state.facts[id],source:target.value};}
  if(target.dataset.available){const id=target.dataset.available;state.available=target.checked ? [...state.available,id] : state.available.filter((item) => item !== id);}
  state=normalizeState(state,catalog);render();
});

async function boot() {
  try {
    const response=await fetch('./config/preparation-catalog.json',{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)throw new Error('catalog_unavailable');
    const candidate=await response.json();
    if(validateCatalog(candidate).length)throw new Error('invalid_catalog');
    catalog=candidate;render();
  } catch {
    main.innerHTML=`<section class="panel"><h1>Не удалось открыть сценарии</h1><p>Попробуйте загрузить их ещё раз. До восстановления используйте утверждённые инструкции офиса и уточните вопрос у профильного специалиста.</p><div class="buttons">${button('retry','Попробовать ещё раз')}</div></section>`;
  }
}
window.addEventListener('pagehide',() => {state=emptyState();stage='home';if(catalog)render();});
boot();
