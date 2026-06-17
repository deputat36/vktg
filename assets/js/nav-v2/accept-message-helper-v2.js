function hasKnownRepeatError(text) {
  const value = String(text || '').toLowerCase();
  return value.includes('different from the old') && value.includes('new');
}

function improveAcceptStatus() {
  const status = document.getElementById('status');
  if (!status) return;
  if (!hasKnownRepeatError(status.textContent)) return;
  status.className = 'status ok';
  status.textContent = 'Такой код входа уже был установлен для этого пользователя. Можно перейти дальше и открыть Навигатор.';
  if (document.getElementById('repeatSecretActions')) return;
  const box = document.createElement('div');
  box.id = 'repeatSecretActions';
  box.className = 'actions';
  box.style.justifyContent = 'flex-start';
  box.innerHTML = '<a class="btn primary" href="./dashboard-v2.html">Открыть рабочий стол</a><a class="btn light" href="./nav-v2.html">Перейти ко входу</a>';
  status.insertAdjacentElement('afterend', box);
}

new MutationObserver(improveAcceptStatus).observe(document.body, { childList: true, subtree: true, characterData: true });
improveAcceptStatus();
