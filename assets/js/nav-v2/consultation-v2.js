import { setupTop, getCachedUser, getMyProfile, renderAuthBox, esc } from './supabase-v2.js';
import {
  REPRESENTATIONS, STAGES, OBJECT_TYPES, PAYMENTS, FLAGS,
  validateConsultation, routeConsultation, completeness, buildHandoff, buildWizardDraft, responseOptions
} from './consultation-intake-model-v2.js?v=20260716-02';

const app = document.getElementById('app');
const DRAFT_KEY = 'nav_deal_draft_v2';
const ALLOWED_ROLES = new Set(['owner', 'admin', 'manager', 'spn', 'lawyer']);
let mode = 'guided';

const opts = (items) => items.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
const choices = (group, items) => `<div class="consult-option-grid" data-group="${group}">${items.map(([value, label]) => `<button class="option" type="button" data-choice="${esc(value)}"><b>${esc(label)}</b></button>`).join('')}</div>`;

function page() {
  return `<main class="nav-v2-shell consultation-shell">
    <section class="hero consultation-hero"><span class="role-home-eyebrow">PREVIEW · без сохранения</span><h1>Быстрая консультация юриста</h1><p>Один вопрос, минимальные факты и готовая передача. Сделка, документы, риски и задачи до подтверждения маршрута не создаются.</p><div class="actions" style="justify-content:flex-start"><button class="btn primary" data-mode="guided" type="button">С подсказками</button><button class="btn light" data-mode="expert" type="button">Быстро</button><a class="btn light" href="./spn-v2.html">Полный мастер</a></div></section>
    <section class="consult-layout"><div class="consult-form-column">
      <section class="card"><div class="section-title"><h2>1. Вопрос</h2><span class="pill blue">обязательно</span></div><div class="field"><label for="question">Конкретный вопрос юристу</label><textarea id="question" placeholder="Можно ли согласовывать задаток при таких условиях и что обязательно зафиксировать?"></textarea></div><div class="field"><label for="desiredResult">Какой результат нужен</label><input id="desiredResult" placeholder="Ответ о допустимости, условия, список уточнений"></div><p class="muted guided-copy">Не пересказывайте всю историю. Один вопрос — один проверяемый результат.</p></section>
      <section class="card"><div class="section-title"><h2>2. Минимальный контекст</h2><span class="pill">без ФИО и телефонов</span></div><div class="grid"><div class="field"><label for="representation">Кого сопровождаем</label><select id="representation"><option value="">Выберите</option>${opts(REPRESENTATIONS)}</select></div><div class="field"><label for="stage">Стадия</label><select id="stage"><option value="">Выберите</option>${opts(STAGES)}</select></div></div><div class="grid"><div class="field"><label for="objectType">Тип объекта</label><select id="objectType"><option value="">Выберите</option>${opts(OBJECT_TYPES)}</select></div><div class="field"><label for="safeObjectReference">Безопасный ориентир</label><input id="safeObjectReference" placeholder="район, улица или CRM-ID — без номера квартиры"></div></div><div class="field"><label for="knownFacts">Известные факты</label><textarea id="knownFacts" placeholder="2–4 факта без идентификации клиента"></textarea></div></section>
      <section class="card"><div class="section-title"><h2>3. Деньги и обстоятельства</h2><span class="pill yellow">маршрут</span></div><h3>Источники средств</h3>${choices('payments', PAYMENTS)}<h3>Что известно</h3>${choices('flags', FLAGS)}<div class="grid"><div class="field"><label for="plannedDate">Плановая дата</label><input id="plannedDate" type="date"></div><div class="field"><label for="folderStatus">Папка документов</label><select id="folderStatus"><option value="">Не указано</option><option>Папка уже создана</option><option>Документы собираются</option><option>Папки пока нет</option></select></div></div><p class="muted guided-copy">Маткапитал и сертификаты — контур СПН и юриста. Ипотечный брокер подключается только при ипотеке.</p></section>
      <section class="card"><div class="section-title"><h2>4. Сформировать передачу</h2><span class="pill green">одно действие</span></div><div class="field"><label for="conversionTarget">Если понадобится полный мастер</label><select id="conversionTarget"><option value="check_docs">Проверка документов</option><option value="deposit">Подготовка к задатку</option><option value="deal">Подготовка сделки</option></select></div><div class="actions" style="justify-content:flex-start"><button class="btn primary" id="build" type="button">Сформировать</button><button class="btn light" id="clear" type="button">Очистить</button></div><p class="small">Будущие ответы юриста: ${responseOptions().map(([, label]) => esc(label)).join(' · ')}</p></section>
    </div><aside><section class="card consultation-sticky"><div class="section-title"><div><h2>Результат</h2><p class="muted">Не юридическое заключение</p></div><span class="pill" id="score">0%</span></div><div id="validation" class="status warn"><b>Заполните обязательные поля.</b></div><div id="route" hidden></div><pre id="handoff" class="consult-handoff" hidden></pre><div id="resultActions" class="actions" hidden><button class="btn primary" id="copy" type="button">Скопировать</button><button class="btn light" id="transfer" type="button">В полный мастер</button></div><div id="status" class="small" role="status" aria-live="polite"></div></section></aside></section>
  </main>`;
}

function selected(group) { return [...document.querySelectorAll(`[data-group="${group}"] .active`)].map((item) => item.dataset.choice); }
function value(id) { return document.getElementById(id)?.value || ''; }
function form() { return { mode, question:value('question'), desiredResult:value('desiredResult'), representation:value('representation'), stage:value('stage'), objectType:value('objectType'), safeObjectReference:value('safeObjectReference'), knownFacts:value('knownFacts'), payments:selected('payments'), flags:selected('flags'), plannedDate:value('plannedDate'), documentFolderStatus:value('folderStatus'), conversionTarget:value('conversionTarget') }; }

function setMode(next) { mode = next === 'expert' ? 'expert' : 'guided'; document.body.dataset.consultationMode = mode; document.querySelectorAll('[data-mode]').forEach((button) => { const active = button.dataset.mode === mode; button.classList.toggle('primary', active); button.classList.toggle('light', !active); }); }
function updateScore() { const percent = completeness(form()); const badge = document.getElementById('score'); if (badge) { badge.textContent = `${percent}%`; badge.className = `pill ${percent >= 85 ? 'green' : percent >= 60 ? 'yellow' : ''}`; } }

function toggle(button) {
  const group = button.closest('[data-group]');
  const special = ['unknown', 'noneKnown'].includes(button.dataset.choice);
  const wasActive = button.classList.contains('active');
  if (special) group.querySelectorAll('.active').forEach((item) => item.classList.remove('active'));
  else group.querySelectorAll('[data-choice="unknown"], [data-choice="noneKnown"]').forEach((item) => item.classList.remove('active'));
  if (!wasActive) button.classList.add('active'); else button.classList.remove('active');
  updateScore();
}

function validationMarkup(result) {
  const errors = result.errors.length ? `<b>Нужно исправить</b><ul>${result.errors.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '';
  const warnings = result.warnings.length ? `<b>Можно уточнить</b><ul>${result.warnings.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '';
  return `<div class="status ${result.valid ? (result.warnings.length ? 'warn' : 'ok') : 'error'}">${errors || '<b>Минимум собран.</b>'}${warnings}</div>`;
}

function build() {
  const input = form();
  const validation = validateConsultation(input);
  document.getElementById('validation').outerHTML = `<div id="validation">${validationMarkup(validation)}</div>`;
  updateScore();
  const output = buildHandoff(input);
  const routeBox = document.getElementById('route'); const handoff = document.getElementById('handoff'); const actions = document.getElementById('resultActions');
  if (!output.valid) { routeBox.hidden = handoff.hidden = actions.hidden = true; return; }
  const route = routeConsultation(input);
  routeBox.innerHTML = `<div class="status ${route.stopBeforeDeposit ? 'error' : route.urgent ? 'warn' : 'ok'}"><b>${route.stopBeforeDeposit ? 'До задатка нужен ответ юриста' : 'Основной маршрут — юрист'}</b><p>${esc(route.nextAction)}</p>${route.brokerAction ? `<p><b>Ипотечный брокер:</b> ${esc(route.brokerAction)}</p>` : ''}<p class="small">Автоматический backlog не создаётся.</p></div>`;
  routeBox.hidden = false; handoff.textContent = output.text; handoff.hidden = false; actions.hidden = false;
  document.getElementById('status').textContent = 'Сформировано локально. В Supabase ничего не сохранено.';
}

async function copy() { const text = document.getElementById('handoff')?.textContent || ''; if (!text) return; try { await navigator.clipboard.writeText(text); document.getElementById('status').textContent = 'Скопировано для отправки в eChat.'; } catch (_) { document.getElementById('status').textContent = 'Не удалось скопировать автоматически. Выделите текст вручную.'; } }
function transfer() { const result = buildWizardDraft(form()); if (!result.valid) return build(); localStorage.setItem(DRAFT_KEY, JSON.stringify(result.draft)); location.href = './spn-v2.html'; }
function clearAll() { document.querySelectorAll('.consultation-shell input, .consultation-shell textarea').forEach((item) => { item.value = ''; }); document.querySelectorAll('.consultation-shell select').forEach((item) => { item.selectedIndex = 0; }); document.querySelectorAll('[data-choice].active').forEach((item) => item.classList.remove('active')); document.getElementById('route').hidden = document.getElementById('handoff').hidden = document.getElementById('resultActions').hidden = true; document.getElementById('validation').innerHTML = '<div class="status warn"><b>Заполните обязательные поля.</b></div>'; document.getElementById('status').textContent = ''; updateScore(); }

function bind() { document.querySelectorAll('[data-mode]').forEach((button) => button.onclick = () => setMode(button.dataset.mode)); document.querySelectorAll('[data-choice]').forEach((button) => button.onclick = () => toggle(button)); document.querySelectorAll('input, textarea, select').forEach((item) => item.addEventListener('input', updateScore)); document.getElementById('build').onclick = build; document.getElementById('copy').onclick = copy; document.getElementById('transfer').onclick = transfer; document.getElementById('clear').onclick = clearAll; setMode('guided'); updateScore(); }

async function init() {
  setupTop('consultation');
  if (!getCachedUser()) return renderAuthBox(app, async () => location.reload());
  let profile;
  try { profile = await getMyProfile({ timeout: 10000 }); } catch (error) { app.innerHTML = `<main class="nav-v2-shell"><section class="card"><div class="status error">${esc(error.message || String(error))}</div></section></main>`; return; }
  if (!ALLOWED_ROLES.has(profile?.role)) { app.innerHTML = `<main class="nav-v2-shell"><section class="card"><div class="status error"><b>Экран недоступен для роли ${esc(profile?.role || 'не определена')}.</b></div><a class="btn light" href="./dashboard-v2.html">Рабочий стол</a></section></main>`; return; }
  app.innerHTML = page(); bind();
}

init();
