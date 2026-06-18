function textValue() {
  const status = document.getElementById('status');
  return String(status?.textContent || '').toLowerCase();
}

function hasKnownRepeatError(text) {
  return text.includes('different from the old') && text.includes('new');
}

function hasExpiredOrInvalidInvite(text) {
  return text.includes('expired')
    || text.includes('invalid')
    || text.includes('not found')
    || text.includes('bad_jwt')
    || text.includes('jwt')
    || text.includes('token')
    || text.includes('ссылка приглашения не найдена')
    || text.includes('в ссылке нет access_token')
    || text.includes('ошибка приглашения');
}

function addActions(id, html) {
  if (document.getElementById(id)) return;
  const status = document.getElementById('status') || document.querySelector('.auth-card, .card');
  if (!status) return;
  const box = document.createElement('div');
  box.id = id;
  box.className = 'actions';
  box.style.justifyContent = 'flex-start';
  box.innerHTML = html;
  status.insertAdjacentElement('afterend', box);
}

function improveAcceptStatus() {
  const status = document.getElementById('status');
  const value = textValue();

  if (status && hasKnownRepeatError(value)) {
    status.className = 'status ok';
    status.textContent = 'Пароль для этого пользователя уже был установлен. Можно перейти дальше и открыть Навигатор.';
    addActions('repeatSecretActions', '<a class="btn primary" href="./dashboard-v2.html">Открыть рабочий стол</a><a class="btn light" href="./nav-v2.html">Перейти ко входу</a>');
    return;
  }

  if (status && hasExpiredOrInvalidInvite(value)) {
    status.className = 'status warn';
    status.textContent = 'Ссылка доступа не сработала. Чаще всего она уже использована, устарела или была открыта не из письма. Запросите новую ссылку доступа у администратора.';
    addActions('expiredInviteActions', '<a class="btn primary" href="./nav-v2.html">Перейти ко входу</a><a class="btn light" href="./nav-access-v2.html">Создать новую ссылку</a>');
  }
}

new MutationObserver(improveAcceptStatus).observe(document.body, { childList: true, subtree: true, characterData: true });
improveAcceptStatus();
