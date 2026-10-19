import { validateCatalog } from './model.js?v=20261019-01';

const main=document.getElementById('main');
let catalog;
let selected='base';
let questionId='owners';
const esc=(value) => String(value ?? '').replace(/[&<>"']/g,(char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const field=(key,title,value,type='text') => `<label>${esc(title)}${type === 'textarea' ? `<textarea id="edit-${key}" data-rule="${key}">${esc(value)}</textarea>` : `<input id="edit-${key}" data-rule="${key}" type="${type}" value="${esc(value)}">`}</label>`;
const qField=(key,title,value) => `<label>${esc(title)}<textarea id="question-${key}" data-question-field="${key}">${esc(value)}</textarea></label>`;

function render(){
  const rule=catalog.rules.find((item) => item.id === selected) || catalog.rules[0];selected=rule.id;
  const question=catalog.questions.find((item) => item.id === questionId) || catalog.questions[0];questionId=question.id;
  main.innerHTML=`<span class="eyebrow">Для методиста</span><h1>Редактор проекта правил</h1><p class="lead">Подготовьте исправления через форму и передайте файл на проверку. Экспорт не меняет опубликованный сайт.</p><div class="notice pilot"><strong>Утверждение и публикация — отдельный процесс</strong><p>Юридические вопросы проверяет юрист, банковские — профильный специалист. Только уполномоченный сотрудник с правами репозитория публикует прошедший проверку каталог через PR.</p></div><div class="editor-grid pilot"><aside class="panel stack"><label class="field-label" for="rule-select">Правило</label><select id="rule-select">${catalog.rules.map((item) => `<option value="${item.id}" ${item.id === selected ? 'selected' : ''}>${esc(item.title)}</option>`).join('')}</select><p class="help">Условия срабатывания, адресат и ссылки на документы изменяются отдельным проверяемым обновлением каталога. Здесь редактируется содержание существующего правила.</p><label class="field-label" for="catalog-version">Новая версия</label><input id="catalog-version" value="${esc(catalog.version)}" aria-describedby="version-hint"><p class="help" id="version-hint">Формат: 0.1.1. Согласование само по себе не возникает при смене версии.</p><label class="field-label" for="catalog-date">Дата проверки</label><input type="date" id="catalog-date" value="${esc(catalog.reviewed_at)}"><label class="editor-file">Открыть проект JSON с компьютера<input id="catalog-file" type="file" accept=".json,application/json"></label></aside><section class="panel editor-form"><span class="badge">Проект для согласования</span>${field('title','Название',rule.title)}${field('question','Конкретный вопрос специалисту',rule.question,'textarea')}${field('next','Следующий шаг',rule.next,'textarea')}${field('signal','Объяснение обстоятельства',rule.signal,'textarea')}${field('approver_role','Кто должен согласовать',rule.approver_role)}<p class="help">Источники: ${esc(rule.sources.map((id) => catalog.sources.find((item) => item.id === id)?.title).join('; '))}. Дата проверки: ${esc(rule.checked_at)}. Статус: ${esc(rule.approval)}.</p><details class="inline-details"><summary>Изменить формулировку вопроса СПН</summary><label class="field-label" for="question-select">Вопрос СПН</label><select id="question-select">${catalog.questions.map((item) => `<option value="${item.id}" ${item.id === questionId ? 'selected' : ''}>${esc(item.short)}</option>`).join('')}</select><div class="editor-form">${qField('title','Вопрос',question.title)}${qField('why','Зачем спрашиваем',question.why)}${qField('clarify','Что уточнить',question.clarify)}</div></details></section></div><div class="buttons"><button type="button" class="button primary" id="export-catalog">Проверить и скачать проект</button><a class="button secondary" href="./preparation.html">Открыть помощник</a></div><p role="status" id="editor-status" class="status" aria-live="polite"></p>`;
}
function updateDraft(){
  const rule=catalog.rules.find((item) => item.id === selected);
  for(const input of main.querySelectorAll('[data-rule]')){
    if(rule[input.dataset.rule] !== input.value){rule[input.dataset.rule]=input.value;rule.approval='draft';rule.approved_by='';}
  }
  const question=catalog.questions.find((item) => item.id === questionId);
  let questionChanged=false;
  for(const input of main.querySelectorAll('[data-question-field]')){
    if(question[input.dataset.questionField] !== input.value){question[input.dataset.questionField]=input.value;questionChanged=true;}
  }
  if(questionChanged)for(const related of catalog.rules.filter((item) => item.fact === questionId)){related.approval='draft';related.approved_by='';}
  const version=document.getElementById('catalog-version')?.value;
  const date=document.getElementById('catalog-date')?.value;
  if(version)catalog.version=version;
  if(date)catalog.reviewed_at=date;
}

main.addEventListener('change',async(event) => {
  const target=event.target;
  if(target.id === 'rule-select' || target.id === 'question-select'){
    updateDraft();if(target.id === 'rule-select')selected=target.value;else questionId=target.value;render();document.getElementById(target.id)?.focus();
  }
  if(target.id === 'catalog-file'){
    const file=target.files[0];if(!file)return;
    const status=document.getElementById('editor-status');
    try{
      if(file.size>300000)throw new Error('Файл должен быть меньше 300 КБ.');
      const candidate=JSON.parse(await file.text());const errors=validateCatalog(candidate);
      if(errors.length)throw new Error(errors.join('\n'));
      catalog=candidate;render();document.getElementById('editor-status').textContent='Открыт локальный проект. Он не опубликован.';
    }catch{status.textContent='Не удалось открыть проект: проверьте JSON, размер и структуру каталога. Текущие изменения сохранены в открытой странице.';}
  }
});
main.addEventListener('click',(event) => {
  if(event.target.id !== 'export-catalog')return;
  updateDraft();
  for(const rule of catalog.rules){rule.version=catalog.version;if(rule.approval === 'draft')rule.checked_at=catalog.reviewed_at;}
  const errors=validateCatalog(catalog);const status=document.getElementById('editor-status');
  if(errors.length){status.textContent=errors.join('\n');status.classList.add('validation-error');return;}
  const blob=new Blob([JSON.stringify(catalog,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`preparation-catalog-draft-${catalog.version}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  status.classList.remove('validation-error');status.textContent='Проект скачан. Передайте его уполномоченному сотруднику для проверки и PR; сайт не изменён.';
});

async function boot(){
  try{const response=await fetch('./config/preparation-catalog.json',{cache:'no-store',credentials:'omit'});if(!response.ok)throw new Error();const candidate=await response.json();if(validateCatalog(candidate).length)throw new Error();catalog=candidate;render();}
  catch{main.innerHTML='<h1>Каталог недоступен</h1><p>Перезагрузите страницу или обратитесь к владельцу материалов.</p>';}
}
boot();
