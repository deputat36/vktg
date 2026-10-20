import { emptyState, normalizeState, normalizeFact, activeQuestions, assess, buildSummary, buildPlan, validateCatalog } from './model.js?v=20261020-02';

const main = document.getElementById('main');
let catalog;
let state = emptyState();
let stage = 'home';
let contextNotice = '';
let answerSource = 'unchecked';
let editingQuestion = '';
let returnFocusId = '';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const titles = {yes:'Да',no:'Нет',unknown:'Не знаю',not_applicable:'Не относится'};
const sourceOptions = [{id:'unchecked',title:'Указывать отдельно'},{id:'client',title:'Со слов клиента'},{id:'document',title:'Сверено с документом'}];
const option = (item,value) => `<option value="${esc(item.id)}" ${item.id === value ? 'selected' : ''}>${esc(item.title)}</option>`;
const list = (items,empty='Дополнительных вопросов пока нет.') => items.length ? `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : `<p class="help">${esc(empty)}</p>`;
const button = (action,title,kind='primary') => `<button type="button" class="button ${kind}" data-action="${action}">${esc(title)}</button>`;

function sources() {
  return `<details class="pilot" id="source-details"><summary>Источники и статус рекомендаций</summary><p>${esc(catalog.content_status)}</p><p>Состав документов и юридическое решение определяет профильный специалист по конкретной ситуации.</p><div class="source-list">${catalog.sources.map((source) => `<article><strong>${source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a>` : esc(source.title)}</strong><p>${esc(source.note)}</p><p>Проверка источника: ${esc(source.checked_at)}.</p></article>`).join('')}</div><p>Каталог ${esc(catalog.version)} · ${esc(catalog.reviewed_at)}.</p></details>`;
}

function nav() {
  return `<nav class="step-nav" aria-label="Шаги подготовки">${[['situation','1. Ситуация'],['details','2. Детали'],['result','3. План']].map(([id,title]) => `<button type="button" data-nav="${id}" ${stage === id ? 'aria-current="step"' : ''}>${title}</button>`).join('')}</nav>`;
}

function heading(title,description='') {
  return `${nav()}<div class="heading-row"><div><span class="eyebrow">${esc(catalog.modes.find((mode) => mode.id === state.mode)?.title)}</span><h1 id="page-title" tabindex="-1">${esc(title)}</h1>${description ? `<p class="lead">${esc(description)}</p>` : ''}</div><button type="button" class="text-button" data-action="reset">Начать заново</button></div>`;
}

function home() {
  const descriptions=['Условия, документы и вопросы юристу до подписания и передачи денег.','Расчёты, регистрация, освобождение и передача объекта.','Понятный порядок действий для особой ситуации.'];
  return `<section class="hero"><span class="eyebrow">Помощник СПН · Борисоглебск</span><h1 id="page-title" tabindex="-1">Подготовиться.<br><span>Ничего не упустить.</span></h1><p class="lead">Выберите задачу и отметьте то, что знаете. Получите короткий план: что уточнить, какие документы нужны и что спросить у юриста.</p></section><section class="mode-grid" aria-label="Что вы готовите">${catalog.modes.map((mode,index) => `<button type="button" class="mode-card" data-mode="${esc(mode.id)}"><span class="number" aria-hidden="true">0${index+1}</span><strong>${esc(mode.title)}</strong><span class="description">${descriptions[index]}</span><span class="arrow" aria-hidden="true">↗</span></button>`).join('')}</section><div class="quiet-row"><div><strong>Начните с известного</strong><p>План доступен сразу. Неизвестное станет вопросом для уточнения.</p></div><div><strong>Без повторного ввода CRM</strong><p>Здесь только обстоятельства. Имена, адреса и документы вводить не нужно.</p></div><div><strong>Решение — у специалиста</strong><p>Навигатор помогает подготовиться к ответу юриста и банка.</p></div></div>${sources()}`;
}

function check(item,kind,selected) {
  return `<label class="check" for="${kind}-${item.id}"><input id="${kind}-${item.id}" type="checkbox" data-${kind}="${item.id}" ${selected.includes(item.id) ? 'checked' : ''}><span>${esc(item.title)}</span></label>`;
}

function situation() {
  const features=catalog.features.filter((feature) => !feature.when?.objects || feature.when.objects.includes(state.object));
  const common=['own','mortgage','family_mortgage','matcap','unknown'];
  const extra=catalog.funding.filter((item) => !common.includes(item.id));
  const objectHelp={house_land:'Дом и земля проверяются отдельно. Сверьте права и сведения по обоим объектам.',land:'Понадобятся сведения о правах, границах и доступе к участку.',ddu:'Это приобретение права по договору, а не продажа готовой квартиры.',assignment:'Для уступки важны исходный ДДУ, оплата и право продавца.',new_build:'Выбран готовый объект. Если оформляется ДДУ или уступка, измените тип выше.'};
  const context=`<div class="stack"><section class="panel"><label class="field-label" for="object">Что за объект?</label><select id="object" data-context="object">${catalog.objects.map((item) => option(item,state.object)).join('')}</select>${objectHelp[state.object] ? `<p class="help">${esc(objectHelp[state.object])}</p>` : ''}</section><section class="panel"><fieldset><legend>Как планируют оплачивать?</legend><p class="help">Отметьте все источники: например, свои средства и маткапитал.</p><div class="check-grid funding-grid">${catalog.funding.filter((item) => common.includes(item.id)).map((item) => check(item,'funding',state.funding)).join('')}</div><details class="inline-details" id="more-funding" ${extra.some((item) => state.funding.includes(item.id)) ? 'open' : ''}><summary>Сертификат, средства ребёнка, другая схема</summary><div class="check-grid">${extra.map((item) => check(item,'funding',state.funding)).join('')}</div></details></fieldset></section></div>`;
  const topics=`<section class="panel feature-panel"><fieldset><legend>${state.mode === 'question' ? 'С чем связан вопрос?' : 'Что важно учесть?'}</legend><p class="help">Отметьте известные или возможные особенности. Здесь вы выбираете тему; подтвердить её можно на следующем шаге.</p><div class="check-grid feature-grid">${features.map((item) => check(item,'feature',state.features)).join('')}</div></fieldset></section>`;
  const layout=state.mode === 'question' ? `<div class="stack">${topics}<details class="panel inline-details" id="question-context"><summary>Объект и оплата — если важны для вопроса</summary><p class="help">Можно пропустить. Укажите их, если вопрос связан с участком, долей, ДДУ или способом оплаты.</p>${context}</details></div>` : `<div class="context-layout">${context}${topics}</div>`;
  return `${heading('Какая у вас ситуация?',state.mode === 'question' ? 'Начните с темы вопроса. Объект и оплату укажите, если они влияют на ответ.' : 'Выберите объект, оплату и известные особенности. Остальное можно уточнить позже.')}${layout}<section class="panel timing-panel"><div><label class="field-label" for="urgency">Когда нужен следующий шаг?</label><select id="urgency" data-context="urgency">${catalog.urgencies.map((item) => option(item,state.urgency)).join('')}</select></div><details class="inline-details" id="coordination-details"><summary>Если стороны ведут разные СПН</summary><label class="field-label" for="coordination">Кто координирует стороны?</label><select id="coordination" data-context="coordination">${catalog.coordination.map((item) => option(item,state.coordination)).join('')}</select></details></section>${contextNotice ? `<p role="status" class="status">${esc(contextNotice)}</p>` : ''}<div class="buttons action-bar">${button('details','Уточнить детали →')}${button('result','План сейчас','secondary')}</div>`;
}

function questionView(question) {
  const fact=normalizeFact(state.facts[question.id]);
  return `<fieldset class="question" data-question="${question.id}"><legend>${esc(question.title)}</legend><div class="answers">${Object.entries(titles).map(([value,title]) => `<label class="answer" for="fact-${question.id}-${value}"><input type="radio" id="fact-${question.id}-${value}" name="fact-${question.id}" data-fact="${question.id}" value="${value}" ${fact.value === value ? 'checked' : ''}>${title}</label>`).join('')}</div>${['yes','no'].includes(fact.value) ? `<div class="source-field"><label for="source-${question.id}">Источник ответа</label><select id="source-${question.id}" data-source="${question.id}">${[{id:'unchecked',title:'Источник пока не указан'},...sourceOptions.slice(1)].map((item) => option(item,fact.source)).join('')}</select></div>` : ''}<details class="why" id="why-${question.id}"><summary>Что именно проверить</summary><p>${esc(question.why)}</p><p>${esc(fact.value === question.attention ? (question.attention_next || question.clarify) : question.clarify)}</p>${fact.value === 'not_applicable' ? '<p>«Не относится» не подтверждает применимость. При сомнении уточните у специалиста.</p>' : ''}</details></fieldset>`;
}

function details() {
  const questions=activeQuestions(state,catalog);
  const mainQuestions=questions.filter((question) => state.mode === 'question' || question.group !== 'topic');
  const topics=questions.filter((question) => state.mode !== 'question' && question.group === 'topic');
  const answered=mainQuestions.filter((question) => state.facts[question.id]?.value !== 'unknown').length;
  return `${heading('Проверим важные детали','Неизвестное можно пропустить и уточнить по плану.')}<div class="details-layout"><div class="stack"><section class="source-toolbar"><label for="answer-source">Источник для новых ответов</label><select id="answer-source">${sourceOptions.map((item) => option(item,answerSource)).join('')}</select><details class="source-help" id="source-help"><summary>Как работает общий источник</summary><p class="help">Выберите один раз для следующих новых ответов. Уже введённые ответы не меняются; у каждого можно исправить источник.</p></details></section><p class="progress-copy" role="status">Отвечено: ${answered} из ${mainQuestions.length}. Можно перейти к плану в любой момент.</p><div class="questions">${mainQuestions.map(questionView).join('')}${!questions.length ? `<section class="panel"><h2>Выберите тему вопроса</h2><p>Вернитесь к ситуации и отметьте, с чем нужна помощь.</p></section>` : ''}</div>${topics.length ? `<section class="topic-section"><h2>Выбранные особенности</h2><p class="help">Они уже учтены в плане как темы для проверки. Подтверждайте только то, что знаете.</p>${topics.map((question) => `<details class="topic-confirmation" id="topic-${question.id}"><summary><span>${esc(question.short)}</span><span class="topic-state">${esc(titles[state.facts[question.id]?.value || 'unknown'])}</span></summary>${questionView(question)}</details>`).join('')}</section>` : ''}</div><aside class="panel details-aside"><span class="eyebrow">Короткий маршрут</span><h2>Не нужно отвечать на всё</h2><p>Если сведения ещё не собраны, переходите к плану. Он покажет конкретные вопросы, документы и следующий шаг.</p><p class="help">Выбранные особенности не считаются подтверждёнными. Слова клиента и сверка с документом будут указаны отдельно.</p>${button('show-plan','Показать план','secondary')}</aside></div><div class="buttons action-bar">${button('result','Получить план →')}${button('situation','К ситуации','secondary')}</div>`;
}

function editAnswer(item,place) {
  const title=item.value === 'unknown' ? 'Ответить' : 'Изменить';
  return `<button type="button" class="text-button answer-edit" id="edit-${place}-${item.id}" data-edit-question="${item.id}" aria-label="${title}: ${esc(item.short || item.title)}">${title}</button>`;
}

function clarificationList(items,empty) {
  return items.length ? `<ul class="editable-list">${items.map((item) => `<li><span>${esc(item.clarify)}</span>${editAnswer(item,'clarify')}</li>`).join('')}</ul>` : `<p class="help">${esc(empty)}</p>`;
}

function factGroup(title,items) {
  if (!items.length) return '';
  return `<div class="fact-group"><h3>${title}</h3>${items.map((item) => `<div class="fact-row"><p>${esc(item.short || item.title)} — ${esc(titles[item.value].toLowerCase())}.</p>${editAnswer(item,'known')}</div>`).join('')}</div>`;
}

function answerEditor(result) {
  const question=result.questions.find((item) => item.id === editingQuestion);
  if (!question) {editingQuestion='';return '';}
  return `<dialog id="answer-editor" class="answer-editor" aria-labelledby="answer-editor-title"><span class="eyebrow">Ответ из плана</span><h2 id="answer-editor-title" tabindex="-1">Уточните ответ</h2><p class="help">План обновляется сразу. Источник относится только к этому ответу.</p>${questionView(question)}<div class="dialog-actions">${button('close-answer','Готово')}</div></dialog>`;
}

function documentsView(result) {
  return `<section class="result-card"><details id="documents"><summary><strong>Какие документы могут понадобиться <span class="count">${result.documents.length}</span></strong></summary><p class="help">Ориентир по ситуации, а не обязательный пакет. Достаточность проверит специалист. Уже доступные документы повторно запрашивать не нужно.</p>${result.documents.map((document) => `<article class="document"><h3>${esc(document.title)}</h3><p>${esc(document.why)}</p><p><strong>У кого:</strong> ${esc(document.from)}</p><details class="why" id="document-${document.id}"><summary>Когда и кто проверяет</summary><p>${esc(document.stage)}</p><p>${esc(document.review)}</p></details><label class="plain-check" for="available-${document.id}"><input type="checkbox" id="available-${document.id}" data-available="${document.id}" ${state.available.includes(document.id) ? 'checked' : ''}>Есть в CRM — указать в запросе</label></article>`).join('')}</details></section>`;
}

function resultView() {
  const result=assess(state,catalog);state=result.state;
  const {facts}=result;
  const nextParts=result.next.match(/^(.+?[.!?;])(?:\s+(.+))?$/s);
  const nextTitle=nextParts?.[1] || result.next;
  const nextDetail=nextParts?.[2] || '';
  const contextGaps=[];
  if(!result.focused && state.object === 'unknown') contextGaps.push('Определить тип объекта по документам.');
  if(!result.focused && state.funding.includes('unknown')) contextGaps.push('Уточнить источники оплаты и зависимость от другой продажи.');
  const unknown=result.clarify.filter((item) => item.reason !== 'attention');
  const attention=result.clarify.filter((item) => item.reason === 'attention');
  const known=factGroup('Сверено с документом — без юридического вывода',facts.document)+factGroup('Со слов клиента',facts.client)+factGroup('Источник пока не указан',facts.unchecked)+factGroup('«Не относится» — применимость не проверена',facts.not_applicable);
  return `${heading('Ваш план подготовки','Начните с ближайшего действия. Подробности и готовый запрос — ниже.')}${result.scopeNote ? `<p class="scope-note" id="question-scope">${esc(result.scopeNote)}</p>` : ''}<section class="next-step"><span class="eyebrow">Что сделать сейчас</span><h2>${esc(nextTitle)}</h2>${nextDetail ? `<p>${esc(nextDetail)}</p>` : ''}</section>${state.urgency === 'urgent' ? '<div class="notice urgent-notice"><strong>Встреча уже назначена</strong><p>Согласуйте реальный срок ответа специалиста. Срочность не заменяет проверку и не подтверждает возможность подписания.</p></div>' : ''}<div class="result-layout"><div class="stack"><section class="result-card" id="clarifications"><h2>Что ещё уточнить</h2>${contextGaps.length ? list(contextGaps) : ''}${clarificationList(unknown,result.questions.length ? 'В показанных вопросах неизвестного не осталось. Подтверждённые особенности и документы требуют профильной проверки.' : 'Тема пока не выбрана. Вернитесь к ситуации и выберите, с чем нужна помощь.')}${!result.focused ? `<details class="inline-details" id="unreviewed"><summary>Неотмеченные особенности — не проверены</summary>${list(result.unreviewed.map((item) => item.title),'Все темы из списка выбраны. Это не подтверждает полноту правовой проверки.')}<p class="help">Отсутствие отметки не означает отсутствие обстоятельства. При сомнении измените ситуацию.</p></details>` : ''}</section>${attention.length || result.signals.length ? `<section class="result-card attention"><h2>На что обратить внимание</h2>${clarificationList(attention, 'Выбранные темы требуют проверки:')}<details class="inline-details" id="signals"><summary>Почему это важно</summary>${list(result.signals)}<p class="help">Это вопросы для оценки, а не установленные нарушения.</p></details></section>` : ''}${result.documents.length ? documentsView(result) : ''}<section class="result-card"><details id="known-facts"><summary><strong>Что уже известно</strong></summary><p class="help">${esc(catalog.objects.find((item) => item.id === state.object)?.title)} · ${esc(state.funding.map((id) => catalog.funding.find((item) => item.id === id)?.title).join(', '))}</p>${known || '<p>Подтверждённые обстоятельства пока не отмечены.</p>'}</details></section>${state.coordination === 'two_spn' ? '<section class="result-card"><h2>Согласовать с другим СПН</h2><p>Сверьте единый набор вводных и вопрос эксперту. Каждый СПН собирает сведения у своей стороны. Договоритесь, кто вернёт ответ сторонам и зафиксирует следующий шаг в CRM.</p></section>' : ''}</div><aside class="result-side">${result.lawyer.length ? `<section class="result-card" id="lawyer-request"><span class="badge">Юридический вопрос</span><h2>Что передать юристу</h2>${list(result.lawyer)}<details class="inline-details" id="request-preview"><summary>Посмотреть готовый запрос</summary><pre class="summary-preview">${esc(buildSummary(result,catalog))}</pre></details><div class="result-actions">${button('copy-lawyer','Скопировать запрос юристу')}</div><p class="help">Код карточки и точный срок добавьте в разрешённом канале. Перед отправкой проверьте текст.</p></section>` : ''}${result.broker.length ? `<section class="result-card" id="broker-request"><h2>Что уточнить у брокера / банка</h2>${list(result.broker)}<details class="inline-details" id="broker-preview"><summary>Посмотреть готовый вопрос</summary><pre class="summary-preview">${esc(buildSummary(result,catalog,'broker'))}</pre></details><div class="result-actions">${button('copy-broker','Скопировать вопрос брокеру','secondary')}</div></section>` : ''}${result.program.length ? `<section class="result-card"><h2>У оператора программы</h2>${list(result.program)}<p class="help">Маткапитал или сертификат без кредита не направляет к брокеру автоматически.</p></section>` : ''}<section class="result-card"><h2>После ответа специалиста</h2><p>Зафиксируйте ответ, действие и срок в CRM. Вернитесь к сторонам с подтверждённым порядком. Изменились условия — передайте их на повторную проверку.</p></section><p role="status" id="copy-status" class="status" aria-live="polite"></p><div id="manual-copy"></div></aside></div><div class="buttons action-bar">${button('copy-plan','Скопировать план')}${button('details','Исправить ответы','secondary')}${button('situation','Изменить ситуацию','tertiary')}</div>${sources()}${answerEditor(result)}`;
}

function render(moveFocus=false) {
  const activeId=document.activeElement?.id;
  const scrollY=window.scrollY;
  const dialogScroll=document.getElementById('answer-editor')?.scrollTop || 0;
  const openDetails=[...main.querySelectorAll('details[open][id]')].map((element) => element.id);
  main.innerHTML=stage === 'home' ? home() : stage === 'situation' ? situation() : stage === 'details' ? details() : resultView();
  for(const id of openDetails){const element=document.getElementById(id);if(element?.tagName === 'DETAILS')element.open=true;}
  const dialog=document.getElementById('answer-editor');
  if(dialog){
    dialog.showModal();
    const previous=activeId && document.getElementById(activeId);
    (previous && dialog.contains(previous) ? previous : document.getElementById('answer-editor-title')).focus({preventScroll:true});
    dialog.scrollTop=dialogScroll;window.scrollTo({top:scrollY,behavior:'instant'});
  }else if(moveFocus){document.getElementById('page-title')?.focus();window.scrollTo({top:0,behavior:'instant'});}
  else {if(activeId)document.getElementById(activeId)?.focus({preventScroll:true});window.scrollTo({top:scrollY,behavior:'instant'});}
}

function closeAnswer(){
  const questionId=editingQuestion;editingQuestion='';render();
  const target=document.getElementById(returnFocusId) || main.querySelector(`[data-edit-question="${questionId}"]`) || document.getElementById('page-title');
  for(let parent=target?.parentElement;parent;parent=parent.parentElement)if(parent.tagName === 'DETAILS')parent.open=true;
  target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest'});returnFocusId='';
}
function go(next){editingQuestion='';returnFocusId='';stage=next;state=normalizeState(state,catalog);render(true);}
async function copy(audience) {
  const result=assess(state,catalog);
  const text=audience === 'plan' ? buildPlan(result,catalog) : buildSummary(result,catalog,audience);
  const status=document.getElementById('copy-status');
  try {
    if(!navigator.clipboard?.writeText)throw new Error('clipboard_unavailable');
    await navigator.clipboard.writeText(text);
    if(status?.isConnected)status.textContent='Скопировано. Проверьте текст перед отправкой.';
  } catch {
    const host=document.getElementById('manual-copy');
    if(!host)return;
    host.innerHTML='<div class="manual-copy"><label for="summary-text">Выделите текст и скопируйте вручную</label><textarea id="summary-text" readonly spellcheck="false"></textarea></div>';
    const area=document.getElementById('summary-text');area.value=text;area.focus();area.select();
    if(status)status.textContent='Браузер не разрешил копирование. Текст доступен для ручного копирования.';
  }
}

main.addEventListener('click',(event) => {
  const target=event.target.closest('button');if(!target)return;
  if(target.dataset.editQuestion){editingQuestion=target.dataset.editQuestion;returnFocusId=target.id;render();return;}
  if(target.dataset.action === 'close-answer'){closeAnswer();return;}
  if(target.dataset.mode){state=emptyState();state.mode=target.dataset.mode;contextNotice='';answerSource='unchecked';go('situation');return;}
  if(target.dataset.nav){go(target.dataset.nav);return;}
  const action=target.dataset.action;
  if(action === 'retry'){boot();return;}
  if(action === 'reset'){editingQuestion='';returnFocusId='';state=emptyState();contextNotice='';answerSource='unchecked';stage='home';render(true);return;}
  if(action === 'show-plan'){go('result');return;}
  if(['situation','details','result'].includes(action)){go(action);return;}
  if(action?.startsWith('copy-'))copy(action.slice(5));
});

main.addEventListener('cancel',(event) => {if(event.target.id === 'answer-editor'){event.preventDefault();closeAnswer();}},true);

main.addEventListener('change',(event) => {
  const target=event.target;
  if(target.id === 'answer-source'){answerSource=target.value;render();return;}
  if(target.dataset.context){
    const key=target.dataset.context;state[key]=target.value;
    if(key === 'object'){state.facts={};state.available=[];answerSource='unchecked';contextNotice='Объект изменён. Детали нужно сверить заново.';}
  }
  if(target.dataset.funding){
    const id=target.dataset.funding;
    state.funding=id === 'unknown' && target.checked ? ['unknown'] : target.checked ? [...state.funding.filter((item) => item !== 'unknown' && !(id === 'mortgage' && item === 'family_mortgage') && !(id === 'family_mortgage' && item === 'mortgage')),id] : state.funding.filter((item) => item !== id);
    for(const key of ['loan','social','child_money','terms','transfer','changes'])delete state.facts[key];
    state.available=state.available.filter((key) => !['loan_docs','social_docs','child_money_docs','settlements'].includes(key));
    answerSource='unchecked';contextNotice='Оплата изменена. Условия расчётов нужно уточнить заново; ответы об объекте и участниках сохранены.';
  }
  if(target.dataset.feature){const id=target.dataset.feature;state.features=target.checked ? [...state.features,id] : state.features.filter((item) => item !== id);}
  if(target.dataset.fact){
    const id=target.dataset.fact;
    const previous=normalizeFact(state.facts[id]);
    state.facts[id]={value:target.value,source:['yes','no'].includes(previous.value) ? previous.source : stage === 'details' ? answerSource : 'unchecked'};
  }
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
    main.innerHTML=`<section class="panel"><h1>Не удалось открыть сценарии</h1><p>Попробуйте ещё раз. До восстановления используйте утверждённые инструкции офиса и обратитесь к профильному специалисту.</p><div class="buttons">${button('retry','Попробовать ещё раз')}</div></section>`;
  }
}
window.addEventListener('pagehide',() => {editingQuestion='';returnFocusId='';state=emptyState();stage='home';answerSource='unchecked';if(catalog)render();});
boot();
