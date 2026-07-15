import { rpc, esc } from './supabase-v2.js';
import { buildSpnReworkModel, buildSpnReworkReturnComment } from './deal-card-spn-rework-model-v2.js?v=20260715-01';

const WORKFLOW_ID = 'spnReworkWorkflowV2';
let cardData = null;
let profileData = null;
let model = null;

function dateTime(value) {
  if (!value) return 'Не зафиксировано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Не зафиксировано';
  return date.toLocaleString('ru-RU');
}

function dateOnly(value) {
  if (!value) return 'Срок не назначен';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Срок не назначен';
  return date.toLocaleDateString('ru-RU');
}

function statePill(item) {
  if (item.state === 'resolved') return '<span class="pill green">исправлено</span>';
  if (item.state === 'unresolved') return '<span class="pill red">не исправлено</span>';
  return '<span class="pill blue">нужно подтвердить</span>';
}

function routeLabel(item) {
  return ({
    parties: 'К данным сторон',
    documents: 'К документам',
    settlements: 'К расчётам',
    expenses: 'К расходам',
    risks: 'К рискам',
    next_action: 'К задачам',
    responsibility: 'К ответственным',
    other: 'К комментариям'
  })[item.category] || 'Открыть раздел';
}

function remarksHtml(items) {
  return `<div class="spn-rework-list">${items.map((item) => `<article class="spn-rework-item ${esc(item.state)}">
    <div class="spn-rework-item-main">
      <div class="spn-rework-item-title"><b>${esc(item.title)}</b>${statePill(item)}</div>
      <p>${esc(item.detail)}</p>
    </div>
    <button class="btn light" type="button" data-spn-rework-route="${esc(item.route)}" data-spn-rework-target="${esc(item.target)}">${esc(routeLabel(item))}</button>
  </article>`).join('')}</div>`;
}

function submitEvidenceHtml() {
  return `<div class="spn-rework-evidence">
    <label for="spnReworkCompletionText"><b>Что именно исправлено</b></label>
    <p class="small">Перечислите сохранённые изменения. Этот комментарий увидят юрист и менеджер.</p>
    <textarea id="spnReworkCompletionText" placeholder="Например: добавлено имя покупателя; загружена выписка; уточнён порядок расчётов."></textarea>
  </div>`;
}

function fixHtml(view) {
  const primary = view.readyToSubmit
    ? '<button class="btn primary" type="button" data-spn-rework-submit>Отправить на повторную проверку</button>'
    : `<button class="btn primary" type="button" data-spn-rework-route="${esc(view.firstRoute?.route || 'comments')}" data-spn-rework-target="${esc(view.firstRoute?.target || '')}">Исправить замечания</button>`;
  const secondarySubmit = view.canSubmit && !view.readyToSubmit
    ? '<button class="btn light" type="button" data-spn-rework-submit>Отправить после сохранения</button>'
    : '';
  const submitArea = view.canSubmit ? `${submitEvidenceHtml()}<div class="actions spn-rework-actions">${primary}${secondarySubmit}<button class="btn light" type="button" data-spn-rework-route="comments">Открыть комментарии</button></div>`
    : '<div class="status warn">Исправления и повторную отправку фиксирует СПН, менеджер, администратор или владелец.</div>';
  return `<section id="${WORKFLOW_ID}" class="card spn-rework-workflow is-fix" data-spn-rework-phase="fix" aria-labelledby="spnReworkTitle">
    <div class="spn-rework-head">
      <div>
        <span class="spn-rework-eyebrow">Доработка СПН</span>
        <h2 id="spnReworkTitle">Исправьте замечания и верните карточку на проверку</h2>
        <p>Все замечания собраны в одном месте. Сначала сохраните изменения в нужных разделах, затем опишите результат.</p>
      </div>
      <span class="pill red">${view.unresolvedCount ? `не исправлено: ${view.unresolvedCount}` : 'готово к отправке'}</span>
    </div>
    <div class="spn-rework-meta">
      <div><span>Кто вернул</span><b>${esc(view.returnedBy)}</b></div>
      <div><span>Когда</span><b>${esc(dateTime(view.returnedAt))}</b></div>
      <div><span>Причина</span><b>${esc(view.reason)}</b></div>
    </div>
    ${remarksHtml(view.remarks)}
    ${view.returnComment ? `<details class="spn-rework-details"><summary>Исходный комментарий</summary><pre>${esc(view.returnComment)}</pre></details>` : '<div class="status warn">Исходный комментарий возврата не найден. Список ниже построен по текущим пробелам карточки.</div>'}
    ${view.unresolvedCount ? `<div class="status warn">По текущим данным ещё не исправлено пунктов: ${view.unresolvedCount}. Если фактическое исправление не отражается автоматически, объясните результат в комментарии.</div>` : '<div class="status ok">Все замечания, которые можно проверить по карточке, сейчас выглядят исправленными.</div>'}
    ${submitArea}
    <div id="spnReworkStatusV2" class="status" aria-live="polite">После повторной отправки появятся получатель, время, новый статус и следующий шаг.</div>
  </section>`;
}

function submittedHtml(view) {
  const primaryRoute = view.isReviewer ? 'docs' : 'comments';
  const primaryLabel = view.isReviewer ? 'Начать повторную проверку' : 'Открыть подтверждение';
  return `<section id="${WORKFLOW_ID}" class="card spn-rework-workflow is-submitted" data-spn-rework-phase="submitted" aria-labelledby="spnReworkTitle">
    <div class="spn-rework-head">
      <div>
        <span class="spn-rework-eyebrow">Повторная отправка</span>
        <h2 id="spnReworkTitle">Карточка отправлена и принята в работу</h2>
        <p>Это повторная проверка после исправлений, а не первичная передача сделки.</p>
      </div>
      <span class="pill green">статус: ${esc(view.newStatus)}</span>
    </div>
    <div class="spn-rework-confirmation">
      <div><span>Кому передано</span><b>${esc(view.recipient)}</b></div>
      <div><span>Дата и время</span><b>${esc(dateTime(view.submittedAt))}</b></div>
      <div><span>Кто отвечает дальше</span><b>${esc(view.nextOwner)}</b></div>
      <div><span>Контрольный срок</span><b>${esc(dateOnly(view.nextDueDate))}</b></div>
    </div>
    <div class="spn-rework-result"><span>Что было исправлено</span><p>${esc(view.completionComment)}</p></div>
    <div class="spn-rework-result"><span>Что произойдёт дальше</span><p>${esc(view.nextAction)}</p></div>
    <div class="actions spn-rework-actions">
      <button class="btn primary" type="button" data-spn-rework-route="${primaryRoute}">${primaryLabel}</button>
      <button class="btn light" type="button" data-spn-rework-route="risks">Связанные риски</button>
      <button class="btn light" type="button" data-spn-rework-route="comments">Комментарии</button>
    </div>
  </section>`;
}

function optionHtml(option) {
  return `<label class="spn-rework-option">
    <input type="checkbox" value="${esc(option.id)}" data-spn-rework-option ${option.suggested ? 'checked' : ''}>
    <span><b>${esc(option.label)}</b><small>${esc(option.detail)}</small></span>
    ${option.suggested ? '<span class="pill yellow">предложено</span>' : ''}
  </label>`;
}

function returnHtml(view) {
  return `<section id="${WORKFLOW_ID}" class="card spn-rework-workflow is-return" data-spn-rework-phase="return" aria-label="Возврат СПН на доработку">
    <details data-spn-rework-return-form>
      <summary><b>Вернуть СПН на доработку</b><span>Собрать конкретные замечания и указать, где их исправить</span></summary>
      <div class="spn-rework-return-body">
        <p class="muted">Выберите только фактические замечания. RPC сохранит один командный комментарий и переведёт карточку в статус «Нужно дозаполнить».</p>
        <div class="spn-rework-options">${view.options.map(optionHtml).join('')}</div>
        <div class="field"><label for="spnReworkReturnReason">Главная причина или другое замечание</label><textarea id="spnReworkReturnReason" placeholder="Коротко объясните, почему карточку нельзя принять сейчас."></textarea></div>
        <div id="spnReworkStatusV2" class="status" aria-live="polite">СПН увидит автора возврата, причину, список разделов и состояние каждого пункта.</div>
        <div class="actions spn-rework-actions"><button class="btn red" type="button" data-spn-rework-return>Вернуть с замечаниями</button></div>
      </div>
    </details>
  </section>`;
}

function workflowHtml(view) {
  if (view.phase === 'fix') return fixHtml(view);
  if (view.phase === 'submitted') return submittedHtml(view);
  if (view.phase === 'return') return returnHtml(view);
  return '';
}

function mount(view) {
  const main = document.querySelector('main.nav-v2-shell');
  if (!main) return;
  const existing = document.getElementById(WORKFLOW_ID);
  const html = workflowHtml(view);
  if (!html) {
    existing?.remove();
    return;
  }
  if (existing) existing.outerHTML = html;
  else if (view.phase === 'return') {
    const tabs = main.querySelector('.tabs')?.closest('section.card');
    if (tabs) tabs.insertAdjacentHTML('beforebegin', html);
    else main.insertAdjacentHTML('beforeend', html);
  } else {
    const anchor = main.querySelector('.hero') || main.firstElementChild;
    anchor?.insertAdjacentHTML('afterend', html);
  }
  bindActions();
}

function openRoute(route, targetId = '') {
  const target = targetId ? document.getElementById(targetId) : null;
  if (target) {
    target.querySelector('details')?.setAttribute('open', '');
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const tab = document.querySelector(`[data-tab="${route}"]`);
  if (tab) tab.click();
  else location.hash = route;
  setTimeout(() => {
    const delayed = targetId ? document.getElementById(targetId) : null;
    (delayed || document.querySelector('.tabs'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 180);
}

function statusElement() {
  return document.getElementById('spnReworkStatusV2');
}

function setStatus(message, tone = '') {
  const status = statusElement();
  if (!status) return;
  status.className = `status ${tone}`.trim();
  status.textContent = message;
}

async function submitRework(button) {
  if (!model?.canSubmit || model.phase !== 'fix') return;
  const completion = document.getElementById('spnReworkCompletionText')?.value?.trim() || '';
  if (completion.length < 10) {
    setStatus('Перечислите, что именно исправлено и сохранено в карточке.', 'error');
    document.getElementById('spnReworkCompletionText')?.focus();
    return;
  }
  if (model.unresolvedCount > 0 && !confirm(`По текущим данным ещё не исправлено пунктов: ${model.unresolvedCount}. Всё равно отправить с пояснением?`)) return;
  if (model.isDemo && !confirm('Это демо-сделка. Отправить её на повторную проверку?')) return;
  button.disabled = true;
  setStatus('Отправляю карточку на повторную проверку...', 'warn');
  try {
    await rpc('nav_v2_submit_spn_rework', { p_deal_id: model.dealId, p_body: completion }, 15000);
    setStatus('Карточка отправлена. Загружаю серверное подтверждение...', 'ok');
    setTimeout(() => location.reload(), 650);
  } catch (error) {
    button.disabled = false;
    setStatus(error?.message || String(error), 'error');
  }
}

async function returnToSpn(button) {
  if (model?.phase !== 'return') return;
  const selected = [...document.querySelectorAll('[data-spn-rework-option]:checked')].map((input) => input.value);
  const reason = document.getElementById('spnReworkReturnReason')?.value?.trim() || '';
  if (!selected.length && reason.length < 10) {
    setStatus('Выберите замечание или опишите конкретную причину возврата.', 'error');
    return;
  }
  if (model.isDemo && !confirm('Это демо-сделка. Вернуть её СПН на доработку?')) return;
  if (!confirm('Вернуть карточку СПН с этим списком замечаний?')) return;
  const body = buildSpnReworkReturnComment(model, selected, reason);
  button.disabled = true;
  setStatus('Фиксирую возврат и передаю замечания СПН...', 'warn');
  try {
    await rpc('nav_v2_return_spn_rework', { p_deal_id: model.dealId, p_body: body }, 15000);
    setStatus('Карточка возвращена СПН. Загружаю единый маршрут исправления...', 'ok');
    setTimeout(() => location.reload(), 650);
  } catch (error) {
    button.disabled = false;
    setStatus(error?.message || String(error), 'error');
  }
}

function bindActions() {
  document.querySelectorAll('[data-spn-rework-route]').forEach((button) => {
    if (button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => openRoute(button.dataset.spnReworkRoute || 'comments', button.dataset.spnReworkTarget || ''));
  });
  document.querySelectorAll('[data-spn-rework-submit]').forEach((button) => {
    if (button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => void submitRework(button));
  });
  const returnButton = document.querySelector('[data-spn-rework-return]');
  if (returnButton && returnButton.dataset.bound !== '1') {
    returnButton.dataset.bound = '1';
    returnButton.addEventListener('click', () => void returnToSpn(returnButton));
  }
}

export function applyDealCardSpnRework(data, profile) {
  try {
    cardData = data;
    profileData = profile || data?.profile || null;
    model = buildSpnReworkModel(cardData, profileData);
    mount(model);
  } catch (_) {
    // Rework workflow is an enhancement and must not break the base deal card.
  }
}
