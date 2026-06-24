let scheduled = false;

function apply() {
  document.querySelectorAll('[data-save-user]').forEach((button) => {
    if (button.textContent !== 'Сохранить данные') button.textContent = 'Сохранить данные';
    button.title = 'Сохранить ФИО, телефон, роль, менеджера и активность аккаунта';
  });

  document.querySelectorAll('[data-name]').forEach((input) => {
    const label = input.closest('.field')?.querySelector('label');
    if (label && label.textContent !== 'ФИО') label.textContent = 'ФИО';
  });
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
apply();
