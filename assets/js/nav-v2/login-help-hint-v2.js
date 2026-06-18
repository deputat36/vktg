function shouldShowLoginHelp(text) {
  const value = String(text || '').toLowerCase();
  return value.includes('неверный email или пароль')
    || value.includes('invalid login credentials')
    || value.includes('invalid_credentials');
}

function addLoginHelp() {
  const status = document.getElementById('authStatus');
  if (!status || !shouldShowLoginHelp(status.textContent)) return false;
  if (document.getElementById('loginHelpHint')) return true;

  const hint = document.createElement('div');
  hint.id = 'loginHelpHint';
  hint.className = 'status warn';
  hint.innerHTML = 'Если сотрудник уже создавал пароль по ссылке доступа, но вход не проходит, нажмите «Восстановить пароль», откройте письмо и задайте новый пароль. Старую ссылку доступа повторно использовать не нужно.';
  status.insertAdjacentElement('afterend', hint);

  const forgot = document.getElementById('navForgot');
  if (forgot) forgot.classList.add('primary');
  return true;
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  const done = addLoginHelp();
  if (done || attempts >= 40) clearInterval(timer);
}, 250);

addLoginHelp();
