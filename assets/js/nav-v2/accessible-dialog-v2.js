import { rpc } from './supabase-v2.js';
import {
  accessibleDialogPolicy,
  accessibleDialogValidation
} from './accessible-dialog-model-v2.js?v=20260715-01';

const CONTROL_SELECTOR = [
  '[data-quick-status="need_lawyer"]',
  '[data-doc-id][data-doc-status="problem"]',
  '[data-risk-resolution]'
].join(', ');

let installed = false;
let active = false;
let sequence = 0;

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function dealId() {
  return new URLSearchParams(location.search).get('id') || '';
}

function isDemoDeal() {
  return document.querySelector('.hero .pill.blue')?.textContent?.trim() === 'ДЕМО';
}

function setPageStatus(message, tone = '') {
  const status = document.getElementById('pageStatus');
  if (!status) return;
  status.className = `status ${tone}`.trim();
  status.textContent = message;
}

function itemSubject(control) {
  const item = control.closest('.list-item, .lawyer-document-focus');
  return clean(item?.querySelector('h3, :scope > b, .doc-status b')?.textContent);
}

function lawyerHandoffIssues() {
  const section = [...document.querySelectorAll('section.card')]
    .find((item) => clean(item.querySelector('h2')?.textContent) === 'Перед передачей юристу');
  if (!(section instanceof HTMLElement)) return [];
  const ready = [...section.querySelectorAll('.pill')]
    .some((pill) => clean(pill.textContent) === 'можно передавать');
  if (ready) return [];
  return [...section.querySelectorAll('.list > .list-item')]
    .map((item) => clean(item.textContent))
    .filter(Boolean);
}

function requestForControl(control) {
  if (control.matches('[data-quick-status="need_lawyer"]')) {
    const items = lawyerHandoffIssues();
    if (!items.length) return null;
    return { key: 'lawyer_handoff_blockers', context: { items, demo: isDemoDeal() } };
  }
  if (control.matches('[data-doc-id][data-doc-status="problem"]')) {
    return {
      key: 'document_problem_reason',
      context: { subject: itemSubject(control), demo: isDemoDeal() }
    };
  }
  if (control.matches('[data-risk-resolution]')) {
    return {
      key: 'risk_resolution_comment',
      context: {
        actionLabel: clean(control.textContent),
        subject: itemSubject(control),
        demo: isDemoDeal()
      }
    };
  }
  return null;
}

function focusable(root) {
  return [...root.querySelectorAll('button, textarea, input, select, a[href], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => element instanceof HTMLElement && !element.disabled && !element.hidden);
}

function trapFocus(event, root) {
  if (event.key !== 'Tab') return;
  const items = focusable(root);
  if (!items.length) {
    event.preventDefault();
    root.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function closeDialog(dialog, trigger) {
  if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close();
  dialog.remove();
  active = false;
  if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
}

function createDialog(policy) {
  sequence += 1;
  const titleId = `navAccessibleDialogTitle${sequence}`;
  const descriptionId = `navAccessibleDialogDescription${sequence}`;
  const errorId = `navAccessibleDialogError${sequence}`;
  const inputId = `navAccessibleDialogInput${sequence}`;

  const dialog = document.createElement('dialog');
  dialog.className = 'nav-accessible-dialog';
  dialog.dataset.navAccessibleDialog = policy.key;
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.setAttribute('aria-describedby', descriptionId);
  dialog.setAttribute('aria-modal', 'true');
  dialog.tabIndex = -1;

  const panel = document.createElement('div');
  panel.className = 'nav-accessible-dialog-panel';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'nav-accessible-dialog-eyebrow';
  eyebrow.textContent = 'Проверка действия';

  const title = document.createElement('h2');
  title.id = titleId;
  title.textContent = policy.title;

  const description = document.createElement('p');
  description.id = descriptionId;
  description.textContent = policy.description;

  panel.append(eyebrow, title, description);

  if (policy.demoText) {
    const demo = document.createElement('div');
    demo.className = 'status warn';
    demo.textContent = policy.demoText;
    panel.append(demo);
  }

  if (policy.items.length) {
    const list = document.createElement('ul');
    list.className = 'nav-accessible-dialog-list';
    policy.items.forEach((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      list.append(item);
    });
    panel.append(list);
  }

  let input = null;
  if (policy.kind === 'input') {
    const field = document.createElement('div');
    field.className = 'field nav-accessible-dialog-field';
    const label = document.createElement('label');
    label.htmlFor = inputId;
    label.textContent = policy.inputLabel;
    input = document.createElement('textarea');
    input.id = inputId;
    input.rows = 4;
    input.setAttribute('aria-required', policy.inputRequired ? 'true' : 'false');
    input.setAttribute('aria-describedby', `${descriptionId} ${errorId}`);
    field.append(label, input);
    panel.append(field);
  }

  const error = document.createElement('div');
  error.id = errorId;
  error.className = 'status nav-accessible-dialog-error';
  panel.append(error);

  const actions = document.createElement('div');
  actions.className = 'actions nav-accessible-dialog-actions';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn light';
  cancel.textContent = policy.cancelLabel;

  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'btn primary';
  confirm.textContent = policy.confirmLabel;

  actions.append(cancel, confirm);
  panel.append(actions);
  dialog.append(panel);

  return { dialog, input, error, cancel, confirm };
}

async function performMutation(control, policy, value) {
  if (policy.key === 'lawyer_handoff_blockers') {
    setPageStatus('Передаю сделку юристу...');
    await rpc('nav_v2_update_deal_status', {
      p_deal_id: dealId(),
      p_status: 'need_lawyer'
    });
    setPageStatus('Сделка передана юристу. Обновляю карточку...', 'ok');
    return { reloadDelay: 100 };
  }

  if (policy.key === 'document_problem_reason') {
    setPageStatus('Фиксирую проблему документа...');
    await rpc('nav_v2_update_document_workflow', {
      p_document_id: control.dataset.docId,
      p_status: 'problem',
      p_assigned_to: null,
      p_responsible_role: null,
      p_due_date: null,
      p_note: clean(value)
    });
    setPageStatus('Проблема документа сохранена. Обновляю карточку...', 'ok');
    return { reloadDelay: 100 };
  }

  if (policy.key === 'risk_resolution_comment') {
    const resolved = control.dataset.riskResolution === 'resolved';
    setPageStatus(resolved ? 'Фиксирую устранение риска...' : 'Возвращаю риск в работу...');
    const result = await rpc('nav_v2_update_risk_resolution', {
      p_risk_id: control.dataset.riskId,
      p_is_resolved: resolved,
      p_note: clean(value) || null
    });
    window.dispatchEvent(new CustomEvent('nav-v2:risk-resolution-updated', {
      detail: {
        riskId: control.dataset.riskId,
        changed: result?.changed === true,
        isResolved: resolved
      }
    }));
    setPageStatus(result?.changed === false ? 'Состояние риска уже было актуальным.' : 'Состояние риска сохранено.', 'ok');
    return { reloadDelay: 250 };
  }

  return { reloadDelay: 0 };
}

function openDialog(control, request) {
  if (active) return;
  const policy = accessibleDialogPolicy(request.key, request.context);
  if (!policy) return;
  active = true;

  const { dialog, input, error, cancel, confirm } = createDialog(policy);
  document.body.append(dialog);

  const cancelAction = () => closeDialog(dialog, control);
  cancel.addEventListener('click', cancelAction);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    cancelAction();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !(dialog instanceof HTMLDialogElement && typeof dialog.showModal === 'function')) {
      event.preventDefault();
      cancelAction();
      return;
    }
    trapFocus(event, dialog);
  });

  input?.addEventListener('input', () => {
    const state = accessibleDialogValidation({ key: policy.key, value: input.value });
    if (!state.valid) return;
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-errormessage');
    error.removeAttribute('role');
    error.className = 'status nav-accessible-dialog-error';
    error.textContent = '';
  });

  confirm.addEventListener('click', async () => {
    const value = input?.value || '';
    const state = accessibleDialogValidation({ key: policy.key, value });
    if (!state.valid) {
      error.className = 'status error';
      error.setAttribute('role', 'alert');
      error.textContent = 'Заполните обязательную причину перед сохранением.';
      input?.setAttribute('aria-invalid', 'true');
      input?.setAttribute('aria-errormessage', error.id);
      input?.focus();
      return;
    }

    dialog.setAttribute('aria-busy', 'true');
    confirm.disabled = true;
    cancel.disabled = true;
    error.removeAttribute('role');
    error.className = 'status';
    error.textContent = 'Сохраняю действие...';

    try {
      const result = await performMutation(control, policy, value);
      closeDialog(dialog, control);
      if (result.reloadDelay) setTimeout(() => location.reload(), result.reloadDelay);
    } catch (mutationError) {
      dialog.removeAttribute('aria-busy');
      confirm.disabled = false;
      cancel.disabled = false;
      error.className = 'status error';
      error.setAttribute('role', 'alert');
      error.textContent = clean(mutationError?.message || mutationError || 'Не удалось сохранить действие.');
      setPageStatus(`Ошибка действия: ${error.textContent}`, 'error');
      (input || confirm).focus();
    }
  });

  if (dialog instanceof HTMLDialogElement && typeof dialog.showModal === 'function') dialog.showModal();
  else {
    dialog.setAttribute('open', '');
    dialog.setAttribute('role', 'dialog');
    dialog.classList.add('is-fallback');
  }
  queueMicrotask(() => (input || confirm).focus());
}

function onControlledClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const control = target.closest(CONTROL_SELECTOR);
  if (!(control instanceof HTMLElement)) return;
  const request = requestForControl(control);
  if (!request) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openDialog(control, request);
}

export function installAccessibleDialogs() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('click', onControlledClick, true);
}

export function applyAccessibleDialogs() {
  installAccessibleDialogs();
}

installAccessibleDialogs();
