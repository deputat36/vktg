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
document.addEventListener('change', (event) => {
  if (event.target?.matches?.('[data-role], [data-manager], [data-phone]')) schedule();
});
document.addEventListener('input', (event) => {
  if (event.target?.matches?.('[data-phone]')) schedule();
});
apply();