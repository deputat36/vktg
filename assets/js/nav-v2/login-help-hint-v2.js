function shouldShowLoginHelp(text) {
  const value = String(text || '').toLowerCase();
  return value.includes('неверный email или пароль')
    || value.includes('invalid login credentials')
    || value.includes('invalid_credentials');
}

function addLoginHelp() {
  const status = document.getElementById('authStatus');
  if (!status || !shouldShowLoginHelp(status.textContent)) return;
  if (document.getElementById('loginHelpHint')) return;

  const hint = document.createElement('div');
  hint.id = 'loginHelpHint';
  hint.className = 'status warn';
  hint.innerHTML = 'Если сотрудник уже создавал пароль по ссылке доступа, но вход не проходит, нажмите «Восстановить пароль», откройте письмо и задайте новый пароль. Старую ссылку доступа повторно использовать не нужно.';
  status.insertAdjacentElement('afterend', hint);

  const forgot = document.getElementById('navForgot');
  if (forgot) forgot.classList.add('primary');
}

new MutationObserver(addLoginHelp).observe(document.body, { childList: true, subtree: true, characterData: true });
addLoginHelp();
