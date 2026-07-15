const RETIRED_ROLE = 'viewer';
let scheduled = false;

function ensureEditHint() {
  const usersSection = [...document.querySelectorAll('section.card')]
    .find((section) => section.querySelector('[data-save-user]'));
  if (!usersSection || usersSection.querySelector('[data-profile-edit-hint]')) return;

  const title = usersSection.querySelector('.section-title');
  if (!title) return;

  title.insertAdjacentHTML('afterend', `<div class="status ok" data-profile-edit-hint="true">
    <b>Где редактировать аккаунты:</b> в карточке сотрудника ниже можно изменить ФИО, телефон, роль, менеджера и активность. После правки нажмите «Сохранить данные».
  </div>`);
}

function isActiveRow(row) {
  return [...(row?.querySelectorAll('.pill') || [])]
    .some((pill) => pill.textContent.trim() === 'активен');
}

function activeUserMap() {
  const map = new Map();
  document.querySelectorAll('[data-toggle-user]').forEach((button) => {
    map.set(button.dataset.toggleUser, button.dataset.active === 'false');
  });
  return map;
}

function setFieldHint(field, marker, html, shouldShow) {
  if (!field) return;
  const existing = field.querySelector(`[${marker}]`);
  if (shouldShow) {
    if (!existing) field.insertAdjacentHTML('beforeend', html);
  } else {
    existing?.remove();
  }
}

function retireViewerOptions() {
  document.querySelectorAll('#newRole, [data-role]').forEach((select) => {
    const option = [...select.options].find((item) => item.value === RETIRED_ROLE);
    if (!option) {
      setFieldHint(select.closest('.field'), 'data-retired-role-hint', '', false);
      return;
    }

    if (option.selected) {
      option.disabled = true;
      option.textContent = 'Наблюдатель — устаревшая роль, выберите другую';
      setFieldHint(
        select.closest('.field'),
        'data-retired-role-hint',
        '<p class="muted" data-retired-role-hint="true"><span class="pill yellow">роль больше не назначается</span> Выберите рабочую роль или выключите аккаунт.</p>',
        true
      );
      return;
    }

    option.remove();
    setFieldHint(select.closest('.field'), 'data-retired-role-hint', '', false);
  });
}

function blockRetiredRoleAction(event) {
  const button = event.target?.closest?.('#addUser, [data-save-user]');
  if (!button) return;

  const select = button.id === 'addUser'
    ? document.getElementById('newRole')
    : document.querySelector(`[data-role="${button.dataset.saveUser}"]`);
  if (select?.value !== RETIRED_ROLE) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  const status = document.getElementById('adminStatus');
  if (status) {
    status.className = 'status error';
    status.textContent = 'Роль «Наблюдатель» больше не назначается. Выберите рабочую роль сотрудника.';
  }
  select.focus();
}

function markMissingManager() {
  document.querySelectorAll('[data-manager]').forEach((select) => {
    const row = select.closest('.list-item');
    const role = row?.querySelector('[data-role]')?.value;
    const hasManager = Boolean(select.value);
    setFieldHint(
      select.closest('.field'),
      'data-missing-manager-hint',
      '<p class="muted" data-missing-manager-hint="true"><span class="pill yellow">нужно назначить менеджера</span></p>',
      role === 'spn' && !hasManager
    );
  });
}

function markMissingPhone() {
  document.querySelectorAll('[data-phone]').forEach((input) => {
    const row = input.closest('.list-item');
    const hasPhone = Boolean(input.value.trim());
    setFieldHint(
      input.closest('.field'),
      'data-missing-phone-hint',
      '<p class="muted" data-missing-phone-hint="true"><span class="pill yellow">заполните телефон</span></p>',
      isActiveRow(row) && !hasPhone
    );
  });
}

function markInactiveManagerOptions() {
  const activeById = activeUserMap();
  document.querySelectorAll('[data-manager]').forEach((select) => {
    let selectedInactive = false;
    [...select.options].forEach((option) => {
      if (!option.value || !activeById.has(option.value)) return;
      const isActive = activeById.get(option.value);
      if (isActive) return;
      if (option.selected) {
        selectedInactive = true;
        if (!option.textContent.includes('выключен')) option.textContent = option.textContent + ' (выключен)';
      } else {
        option.remove();
      }
    });
    setFieldHint(
      select.closest('.field'),
      'data-inactive-manager-hint',
      '<p class="muted" data-inactive-manager-hint="true"><span class="pill red">выбранный менеджер выключен</span></p>',
      selectedInactive
    );
  });
}

function apply() {
  document.querySelectorAll('[data-save-user]').forEach((button) => {
    if (button.textContent !== 'Сохранить данные') button.textContent = 'Сохранить данные';
    button.title = 'Сохранить ФИО, телефон, роль, менеджера и активность аккаунта';
  });

  document.querySelectorAll('[data-name]').forEach((input) => {
    const label = input.closest('.field')?.querySelector('label');
    if (label && label.textContent !== 'ФИО') label.textContent = 'ФИО';
  });

  ensureEditHint();
  retireViewerOptions();
  markMissingManager();
  markMissingPhone();
  markInactiveManagerOptions();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    apply();
  });
}

const app = document.getElementById('app') || document.body;
new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
document.addEventListener('click', blockRetiredRoleAction, true);
document.addEventListener('change', (event) => {
  if (event.target?.matches?.('#newRole, [data-role], [data-manager], [data-phone]')) schedule();
});
document.addEventListener('input', (event) => {
  if (event.target?.matches?.('[data-phone]')) schedule();
});
apply();
