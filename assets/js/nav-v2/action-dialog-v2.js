const DRAFTS = new WeakMap();
let activeRequest = null;
let sequence = 0;

function clean(value) {
  return String(value || '').trim();
}

function canRemember(trigger) {
  return trigger instanceof HTMLElement;
}

function rememberedDraft(trigger) {
  return canRemember(trigger) ? String(DRAFTS.get(trigger) || '') : '';
}

function rememberDraft(trigger, value) {
  if (canRemember(trigger)) DRAFTS.set(trigger, String(value || ''));
}

function focusTrigger(trigger) {
  if (!(trigger instanceof HTMLElement) || !trigger.isConnected) return;
  queueMicrotask(() => trigger.focus({ preventScroll: true }));
}

function fallbackText(config) {
  const parts = [config.title, config.description, ...(config.details || [])].map(clean).filter(Boolean);
  return parts.join('\n\n');
}

function fallbackRequest(config, trigger) {
  const current = rememberedDraft(trigger);
  if (!window.confirm(fallbackText(config))) {
    focusTrigger(trigger);
    return Promise.resolve({ confirmed: false, value: current, mode: 'native-fallback' });
  }
  if (!config.input) {
    focusTrigger(trigger);
    return Promise.resolve({ confirmed: true, value: '', mode: 'native-fallback' });
  }
  const value = window.prompt(`${config.input.label}\n\n${config.input.description || ''}`, current);
  if (value === null) {
    focusTrigger(trigger);
    return Promise.resolve({ confirmed: false, value: current, mode: 'native-fallback' });
  }
  rememberDraft(trigger, value);
  focusTrigger(trigger);
  return Promise.resolve({ confirmed: true, value, mode: 'native-fallback' });
}

function setDialogStyle(dialog) {
  dialog.style.width = 'min(620px, calc(100vw - 28px))';
  dialog.style.maxHeight = 'min(760px, calc(100vh - 28px))';
  dialog.style.padding = '0';
  dialog.style.border = '0';
  dialog.style.borderRadius = '18px';
  dialog.style.boxShadow = '0 24px 80px rgba(15, 23, 42, .28)';
  dialog.style.overflow = 'auto';
}

function setFormStyle(form) {
  form.style.padding = '20px';
  form.style.display = 'grid';
  form.style.gap = '14px';
}

function appendTextElement(parent, tag, text, id = '') {
  const element = document.createElement(tag);
  if (id) element.id = id;
  element.textContent = text;
  parent.append(element);
  return element;
}

function appendDetails(form, details) {
  const values = (details || []).map(clean).filter(Boolean);
  if (!values.length) return null;
  const list = document.createElement('ul');
  list.style.margin = '0';
  list.style.paddingLeft = '22px';
  list.style.color = '#334155';
  values.forEach((value) => appendTextElement(list, 'li', value));
  form.append(list);
  return list;
}

function appendInput(form, config, ids, trigger) {
  if (!config.input) return { field: null, error: null };
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const label = appendTextElement(wrapper, 'label', config.input.label, ids.label);
  const field = config.input.multiline === false ? document.createElement('input') : document.createElement('textarea');
  field.id = ids.field;
  field.value = rememberedDraft(trigger);
  field.setAttribute('aria-labelledby', label.id);
  field.style.minHeight = config.input.multiline === false ? '' : '110px';
  wrapper.append(field);
  const help = appendTextElement(wrapper, 'p', config.input.description || '', ids.help);
  help.className = 'small muted';
  help.style.margin = '6px 0 0';
  field.setAttribute('aria-describedby', help.id);
  const error = appendTextElement(wrapper, 'div', '', ids.error);
  error.className = 'status error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  wrapper.append(error);
  form.append(wrapper);
  field.addEventListener('input', () => {
    rememberDraft(trigger, field.value);
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-errormessage');
    error.hidden = true;
    error.textContent = '';
  });
  return { field, error };
}

function validateInput(config, field, error) {
  if (!config.input || !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return true;
  const value = clean(field.value);
  const minLength = Math.max(0, Number(config.input.minLength || 0));
  if (!config.input.required && (!value || value.length >= minLength)) return true;
  if (config.input.required && value.length >= Math.max(1, minLength)) return true;
  const message = config.input.errorText || (minLength > 1
    ? `Введите не менее ${minLength} символов.`
    : 'Заполните поле перед подтверждением.');
  error.hidden = false;
  error.textContent = message;
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('aria-errormessage', error.id);
  field.focus();
  return false;
}

function appendActions(form, config, dialog, field, error, trigger) {
  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.style.justifyContent = 'flex-end';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn light';
  cancel.textContent = config.cancelLabel || 'Отмена';
  cancel.dataset.actionDialogCancel = 'true';
  cancel.addEventListener('click', () => dialog.close('cancel'));

  const confirm = document.createElement('button');
  confirm.type = 'submit';
  confirm.className = `btn ${config.tone === 'positive' ? 'green' : config.tone === 'danger' ? 'red' : 'primary'}`;
  confirm.textContent = config.confirmLabel || 'Подтвердить';
  confirm.dataset.actionDialogConfirm = 'true';

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!validateInput(config, field, error)) return;
    if (field) rememberDraft(trigger, field.value);
    dialog.close('confirm');
  });

  actions.append(cancel, confirm);
  form.append(actions);
  return { cancel, confirm };
}

export function actionDialogSupported() {
  return typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function';
}

export function requestActionDialog(config, trigger = null) {
  if (!config || !clean(config.title)) return Promise.resolve({ confirmed: false, value: '', mode: 'invalid-config' });
  if (!actionDialogSupported()) return fallbackRequest(config, trigger);
  if (activeRequest) {
    activeRequest.dialog.focus();
    return activeRequest.promise;
  }

  const id = `navActionDialog${++sequence}`;
  const ids = {
    title: `${id}Title`,
    description: `${id}Description`,
    label: `${id}InputLabel`,
    field: `${id}Input`,
    help: `${id}InputHelp`,
    error: `${id}InputError`
  };
  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.dataset.navActionDialog = config.id || 'action';
  dialog.setAttribute('aria-labelledby', ids.title);
  dialog.setAttribute('aria-describedby', ids.description);
  dialog.setAttribute('aria-modal', 'true');
  setDialogStyle(dialog);

  const form = document.createElement('form');
  form.noValidate = true;
  setFormStyle(form);
  appendTextElement(form, 'h2', config.title, ids.title).style.margin = '0';
  appendTextElement(form, 'p', config.description || '', ids.description).style.margin = '0';
  appendDetails(form, config.details);
  const { field, error } = appendInput(form, config, ids, trigger);
  const { cancel } = appendActions(form, config, dialog, field, error, trigger);
  dialog.append(form);
  document.body.append(dialog);

  let resolveRequest;
  const promise = new Promise((resolve) => { resolveRequest = resolve; });
  activeRequest = { dialog, promise };

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dialog.close('cancel');
  });
  dialog.addEventListener('close', () => {
    const value = field ? field.value : '';
    if (field) rememberDraft(trigger, value);
    const result = { confirmed: dialog.returnValue === 'confirm', value, mode: 'dialog' };
    dialog.remove();
    activeRequest = null;
    focusTrigger(trigger);
    resolveRequest(result);
  }, { once: true });

  dialog.showModal();
  queueMicrotask(() => (field || cancel).focus());
  return promise;
}

export function clearActionDialogDraft(trigger) {
  if (canRemember(trigger)) DRAFTS.delete(trigger);
}
