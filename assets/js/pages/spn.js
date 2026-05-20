import '../integrations/appNav.js';
import { getCurrentUser, saveDealToSupabase } from '../integrations/supabase.js';

const state = {
  user: null,
  step: Number(localStorage.getItem('spn_clean_step_v1') || '0'),
  deal: JSON.parse(localStorage.getItem('spn_clean_deal_v1') || '{}')
};

const steps = [
  { title: 'Суть сделки', hint: 'Что делаем, кого представляем и какой объект.', short: 'Суть' },
  { title: 'Стороны', hint: 'Продавцы, покупатели, дети, представители.', short: 'Стороны' },
  { title: 'Документы', hint: 'На основании чего продают и какие документы уже есть.', short: 'Документы' },
  { title: 'Деньги и расчет', hint: 'Источник денег, банк, маткапитал, порядок расчетов.', short: 'Деньги' },
  { title: 'Проверка', hint: 'Что мешает задатку/сделке и что передать дальше.', short: 'Проверка' }
];

function get(id) { return document.getElementById(id); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
function saveLocal() { localStorage.setItem('spn_clean_deal_v1', JSON.stringify(state.deal)); localStorage.setItem('spn_clean_step_v1', String(state.step)); }
function setStatus(text, type = 'info') { const el = get('spnStatus'); if (!el) return; el.textContent = text; el.className = 'status ' + type; }
function val(key) { return state.deal[key] || ''; }
function setVal(key, value) { state.deal[key] = value; saveLocal(); renderAll(); }
function arr(key) { return Array.isArray(state.deal[key]) ? state.deal[key] : []; }
function toggleArr(key, value) { const list = arr(key); state.deal[key] = list.includes(value) ? list.filter((x) => x !== value) : [...list, value]; saveLocal(); renderAll(); }
function has(key, value) { return arr(key).includes(value); }

async function refreshAuth() {
  state.user = await getCurrentUser();
  if (!state.user) {
    get('spnLogin').style.display = '';
    get('spnApp').style.display = 'none';
    setStatus('Сначала войдите на главной странице, затем вернитесь сюда.', 'warn');
    return;
  }
  get('spnLogin').style.display = 'none';
  get('spnApp').style.display = '';
  setStatus('Вы вошли. Можно заполнять и сохранять сделку.', 'ok');
  renderAll();
}

function stepComplete(index) {
  const d = state.deal;
  if (index === 0) return Boolean(d.mode && d.representation && d.objectType && d.address);
  if (index === 1) return Boolean(d.sellerCount && d.buyerCount);
  if (index === 2) return Boolean(arr('basis').length && d.stEgrn);
  if (index === 3) return Boolean(arr('payments').length && arr('settlements').length);
  if (index === 4) return importantIssues().filter((x) => x.type === 'red').length === 0;
  return false;
}
function progress() { return Math.round(steps.filter((_, i) => stepComplete(i)).length / steps.length * 100); }

function renderAll() { renderStepTabs(); renderStep(); renderSummary(); renderAdvice(); }
function renderStepTabs() {
  get('stepTitle').textContent = steps[state.step].title;
  get('stepHint').textContent = steps[state.step].hint;
  get('progressPercent').textContent = progress() + '%';
  get('progressBar').style.width = progress() + '%';
  get('stepTabs').innerHTML = steps.map((s, i) => `<button class="spn-tab ${state.step === i ? 'active' : ''} ${stepComplete(i) ? 'done' : ''}" data-step="${i}"><b>${i + 1}. ${esc(s.short)}</b><span>${esc(s.hint)}</span></button>`).join('');
  get('stepTabs').querySelectorAll('[data-step]').forEach((button) => button.onclick = () => { state.step = Number(button.dataset.step); saveLocal(); renderAll(); });
  get('btnPrev').disabled = state.step === 0;
  get('btnNext').textContent = state.step === steps.length - 1 ? 'Сохранить' : 'Далее';
}
function optionButton(key, value, label, multi = false) {
  const active = multi ? has(key, value) : val(key) === value;
  return `<button type="button" class="spn-option ${active ? 'active' : ''}" data-key="${key}" data-value="${value}" data-multi="${multi ? '1' : '0'}">${esc(label)}</button>`;
}
function input(key, label, placeholder = '') { return `<label>${esc(label)}<input data-field="${key}" value="${esc(val(key))}" placeholder="${esc(placeholder)}"></label>`; }
function textarea(key, label, placeholder = '') { return `<label>${esc(label)}<textarea data-field="${key}" placeholder="${esc(placeholder)}">${esc(val(key))}</textarea></label>`; }

function renderStep() {
  const views = [stepMain, stepParties, stepDocs, stepMoney, stepCheck];
  get('stepBody').innerHTML = views[state.step]();
  bindFields();
}
function stepMain() {
  return `<div class="spn-question-group"><div class="spn-question"><h3>Что сейчас готовим?</h3><p>Выберите одну главную цель.</p><div class="spn-options">${optionButton('mode','deposit','Задаток')}${optionButton('mode','deal','Сделка')}${optionButton('mode','consult','Проверка ситуации')}</div></div><div class="spn-question"><h3>Кого мы представляем?</h3><div class="spn-options">${optionButton('representation','both','Обе стороны')}${optionButton('representation','seller','Только продавца')}${optionButton('representation','buyer','Только покупателя')}${optionButton('representation','partner','Вторая сторона от партнера')}</div></div><div class="spn-question"><h3>Что продается?</h3><div class="spn-options">${optionButton('objectType','flat','Квартира')}${optionButton('objectType','house_land','Дом + земля')}${optionButton('objectType','land','Земля')}${optionButton('objectType','share','Доля')}${optionButton('objectType','new_building','Новостройка / ДДУ')}${optionButton('objectType','commercial','Коммерция')}</div></div><div class="spn-question"><h3>Минимум по объекту</h3><div class="spn-field-grid">${input('address','Адрес объекта','город, улица, дом, квартира')}${input('priceFact','Фактическая цена','например 3 650 000')}</div></div></div>`;
}
function stepParties() {
  return `<div class="spn-question-group"><div class="spn-question"><h3>Сколько сторон?</h3><div class="spn-field-grid">${input('sellerCount','Сколько продавцов / собственников','1, 2, 3...')}${input('buyerCount','Сколько покупателей','1, 2...')}${input('sellerPhone','Телефон продавца','можно позже')}${input('buyerPhone','Телефон покупателя','можно позже')}</div></div><div class="spn-question"><h3>Есть ли дети или особые участники?</h3><div class="spn-options">${optionButton('flags','minorSeller','Ребенок-собственник',true)}${optionButton('flags','minorBuyer','Ребенок-покупатель',true)}${optionButton('flags','minorRegistered','Ребенок зарегистрирован',true)}${optionButton('flags','attorney','Доверенность',true)}${optionButton('flags','incapable','Опека / недееспособность',true)}${optionButton('flags','marriage','Супруг / согласие',true)}</div></div><div class="spn-question">${textarea('partiesComment','Что важно знать о сторонах?','Например: продавец в другом городе, покупатель с ипотекой, собственник ребенок...')}</div></div>`;
}
function stepDocs() {
  return `<div class="spn-question-group"><div class="spn-question"><h3>Документ-основание</h3><div class="spn-options">${optionButton('basis','sale','Купля-продажа',true)}${optionButton('basis','gift','Дарение',true)}${optionButton('basis','inheritLaw','Наследство',true)}${optionButton('basis','privat','Приватизация',true)}${optionButton('basis','ddu','ДДУ',true)}${optionButton('basis','court','Решение суда',true)}${optionButton('basis','exchange','Мена',true)}</div></div><div class="spn-question"><h3>Что уже есть?</h3><div class="spn-field-grid"><label>ЕГРН<select data-field="stEgrn"><option value="">Не выбрано</option><option ${val('stEgrn')==='нет'?'selected':''} value="нет">Нет</option><option ${val('stEgrn')==='получено'?'selected':''} value="получено">Получено</option><option ${val('stEgrn')==='проверено'?'selected':''} value="проверено">Проверено</option></select></label><label>Справка о зарегистрированных<select data-field="stRegistered"><option value="">Не выбрано</option><option ${val('stRegistered')==='нет'?'selected':''} value="нет">Нет</option><option ${val('stRegistered')==='есть'?'selected':''} value="есть">Есть</option></select></label>${input('folderLink','Ссылка на папку с документами','Google/Яндекс/CRM')}</div></div><div class="spn-question">${textarea('lawyerQuestion','Вопрос юристу','Что нужно уточнить у юриста?')}</div></div>`;
}
function stepMoney() {
  return `<div class="spn-question-group"><div class="spn-question"><h3>За какие деньги покупают?</h3><div class="spn-options">${optionButton('payments','cash','Свои деньги',true)}${optionButton('payments','mortgage','Ипотека',true)}${optionButton('payments','matcap','Маткапитал',true)}${optionButton('payments','nominalChild','Детский номинальный счет',true)}${optionButton('payments','svoChildAccount','Детские деньги / СВО',true)}${optionButton('payments','certificate','Сертификат',true)}</div></div><div class="spn-question"><h3>Как планируется расчет?</h3><div class="spn-options">${optionButton('settlements','cash_after_registration','После регистрации',true)}${optionButton('settlements','sbr','СБР',true)}${optionButton('settlements','accreditive','Аккредитив',true)}${optionButton('settlements','cell','Ячейка',true)}${optionButton('settlements','pensionFund','СФР/ПФР',true)}${optionButton('settlements','notary_deposit','Депозит нотариуса',true)}</div></div><div class="spn-question"><h3>Банк и расходы</h3><div class="spn-field-grid">${input('bankType','Банк / Домклик','если есть ипотека')}${input('sellerRealtorCommission','Комиссия продавца','если известно')}${input('buyerRealtorCommission','Комиссия покупателя','если известно')}${input('registrationFeeAmount','Госпошлина / расходы','если известно')}</div></div></div>`;
}
function stepCheck() {
  const issues = importantIssues();
  return `<div class="spn-question-group"><div class="spn-question"><h3>Проверка перед движением дальше</h3><div class="advice-box">${issues.length ? issues.map((x) => `<div class="advice ${x.type}">${esc(x.text)}</div>`).join('') : '<div class="advice green">Критичных стоп-факторов по заполненным данным не видно. Можно сохранить карточку.</div>'}</div></div><div class="spn-question">${textarea('teamComment','Комментарий по сделке','Что важно не потерять?')}</div></div>`;
}
function bindFields() {
  get('stepBody').querySelectorAll('[data-key]').forEach((button) => button.onclick = () => button.dataset.multi === '1' ? toggleArr(button.dataset.key, button.dataset.value) : setVal(button.dataset.key, button.dataset.value));
  get('stepBody').querySelectorAll('[data-field]').forEach((field) => field.oninput = field.onchange = () => { state.deal[field.dataset.field] = field.value; saveLocal(); renderSummary(); renderAdvice(); renderStepTabs(); });
}

function importantIssues() {
  const d = state.deal; const issues = [];
  if (has('flags','minorSeller')) issues.push({ type:'red', text:'Есть несовершеннолетний собственник. Без опеки нельзя спокойно идти к задатку.' });
  if (has('payments','matcap')) issues.push({ type:'orange', text:'Маткапитал: нужны документы по сертификату, детям и порядок перечисления через СФР.' });
  if (has('payments','nominalChild') || has('payments','svoChildAccount')) issues.push({ type:'red', text:'Детские деньги/номинальный счет: сначала проверить законность и порядок использования средств.' });
  if (has('basis','inheritLaw')) issues.push({ type:'orange', text:'Наследство: проверить круг наследников и риск оспаривания.' });
  if (d.objectType === 'share') issues.push({ type:'orange', text:'Доля: возможно преимущественное право покупки и нотариальная форма.' });
  if (!d.address) issues.push({ type:'orange', text:'Не указан адрес объекта.' });
  if (!arr('payments').length) issues.push({ type:'orange', text:'Не выбран источник денег покупателя.' });
  return issues;
}
function renderSummary() {
  const d = state.deal;
  get('summaryBox').innerHTML = `<div class="spn-mini-metrics"><div class="spn-mini"><b>${progress()}%</b><span>заполнено</span></div><div class="spn-mini"><b>${importantIssues().length}</b><span>важных замечаний</span></div></div><div class="summary-item"><b>${esc(d.objectType || 'Объект не выбран')}</b><span>${esc(d.address || 'Адрес не указан')}</span></div><div class="summary-item"><b>${esc(d.priceFact || 'Цена не указана')}</b><span>Фактическая цена</span></div><div class="summary-item"><b>${esc(arr('payments').join(', ') || 'Источник денег не выбран')}</b><span>Деньги покупателя</span></div><div class="summary-item"><b>${esc(arr('basis').join(', ') || 'Основание не выбрано')}</b><span>Документ-основание</span></div>`;
}
function renderAdvice() {
  const issues = importantIssues(); const list = issues.length ? issues.slice(0, 6) : [{ type:'green', text:'Заполните шаги и нажмите “Сохранить в CRM”.' }];
  get('adviceBox').innerHTML = list.map((x) => `<div class="advice ${x.type}">${esc(x.text)}</div>`).join('');
}
function normalizedResult() {
  const d = state.deal; const issues = importantIssues(); const ready = Math.max(0, Math.min(100, progress() - issues.filter((x) => x.type === 'red').length * 15));
  return { deal: { ...d, priceContract: d.priceContract || d.priceFact }, decision: issues.some((x) => x.type === 'red') ? 'Стоп / нужна проверка' : issues.length ? 'Нужна доработка' : 'Можно двигаться дальше', ready, score: ready, stop: issues.filter((x) => x.type === 'red').map((x) => x.text), warn: issues.filter((x) => x.type !== 'red').map((x) => x.text), actions: issues.map((x) => x.text), missing: [], to: issues.length ? ['lawyer'] : [] };
}
async function saveDeal() {
  try { setStatus('Сохраняю сделку...', 'info'); const saved = await saveDealToSupabase(normalizedResult()); setStatus('Сделка сохранена: ' + saved.title, 'ok'); alert('Сделка сохранена в CRM.'); }
  catch (error) { setStatus('Ошибка сохранения: ' + error.message, 'error'); alert('Ошибка сохранения: ' + error.message); }
}
function bindGlobal() {
  get('btnPrev').onclick = () => { if (state.step > 0) { state.step -= 1; saveLocal(); renderAll(); } };
  get('btnNext').onclick = () => { if (state.step < steps.length - 1) { state.step += 1; saveLocal(); renderAll(); } else saveDeal(); };
  get('btnSave').onclick = saveDeal;
  get('btnSpnLogin').onclick = () => location.href = './index.html';
  get('btnSpnLogin').textContent = 'Открыть вход на главной';
  get('btnSpnLogout').onclick = () => { localStorage.removeItem('navigator_supabase_session_v1'); location.reload(); };
}

bindGlobal();
refreshAuth().catch((error) => setStatus('Ошибка: ' + error.message, 'error'));
