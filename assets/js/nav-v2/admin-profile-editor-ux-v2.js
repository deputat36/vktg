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

function markMissingManager() {
  document.querySelectorAll('[data-manager]').forEach((select) => {
    const row = select.closest('.list-item');
    const role = row?.querySelector('[data-role]')?.value;
    const hasManager = Boolean(select.value);
    const existing = row?.querySelector('[data-missing-manager-hint]');
    if (role === 'spn' && !hasManager) {
      if (!existing) {
        select.closest('.field')?.insertAdjacentHTML('beforeend', '<p class="muted" data-missing-manager-hint="true"><span class="pill yellow">нужно назначить менеджера</span></p>');
      }
    } else {
      existing?.remove();
    }
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
  if (event.target?.matches?.('[data-role], [data-manager]')) schedule();
});
apply();
