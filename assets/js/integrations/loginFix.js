import { isSupabaseConfigured, signInWithPassword, signOut, getCurrentUser } from './supabase.js';

function get(id) {
  return document.getElementById(id);
}

function setMainStatus(text) {
  const cloud = get('cloudStatus');
  const main = get('status');
  if (cloud) cloud.textContent = text;
  else if (main) main.textContent = text;
}

function ensureAuthBox() {
  const panel = get('cloudPanel');
  if (!panel) return null;

  let box = get('authStateBox');
  if (box) return box;

  box = document.createElement('div');
  box.id = 'authStateBox';
  box.className = 'box blue';
  box.style.marginTop = '12px';
  box.innerHTML = `
    <h3 style="margin-top:0">Состояние входа</h3>
    <div id="authStateText">Проверяю подключение...</div>
    <div id="authUserText" class="small" style="margin-top:6px"></div>
    <div id="authHelpText" class="small" style="margin-top:8px"></div>
    <div class="actions" style="justify-content:flex-start;margin-top:10px">
      <button id="btnCheckAuth" class="light" type="button">Проверить вход</button>
      <button id="btnClearAuth" class="light" type="button">Сбросить сессию</button>
    </div>
  `;

  panel.appendChild(box);

  get('btnCheckAuth').addEventListener('click', async (event) => {
    event.preventDefault();
    await refreshAuthState(true);
  });

  get('btnClearAuth').addEventListener('click', async (event) => {
    event.preventDefault();
    localStorage.removeItem('navigator_supabase_session_v1');
    await refreshAuthState(true);
    showAuthState('warn', 'Сессия сброшена. Введите email и пароль заново.', '', 'Это полезно, если браузер хранил старый или поврежденный токен входа.');
  });

  return box;
}

function showAuthState(type, title, userText = '', helpText = '') {
  const box = ensureAuthBox();
  const text = get('authStateText');
  const user = get('authUserText');
  const help = get('authHelpText');
  if (!box || !text) return;

  box.className = 'box ' + (type === 'ok' ? 'greenBox' : type === 'error' ? 'redBox' : type === 'warn' ? 'orangeBox' : 'blue');
  text.innerHTML = title;
  if (user) user.innerHTML = userText || '';
  if (help) help.innerHTML = helpText || '';
  setMainStatus(title.replace(/<[^>]*>/g, ''));
}

function explainError(error) {
  const raw = String(error?.message || error || 'Неизвестная ошибка');
  const lower = raw.toLowerCase();

  if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
    return 'Неверный email или пароль. Проверьте раскладку, пробелы и что пользователь создан в Supabase Authentication.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Email пользователя не подтвержден. В Supabase при создании пользователя включите Auto Confirm User или подтвердите почту вручную.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Браузер не смог подключиться к Supabase. Проверьте интернет, VPN/блокировки, кэш страницы и доступ к домену Supabase.';
  }
  if (lower.includes('jwt') || lower.includes('token')) {
    return 'Проблема с токеном входа. Нажмите «Сбросить сессию» и войдите заново.';
  }
  if (lower.includes('row-level security') || lower.includes('permission')) {
    return 'Вход прошел, но нет доступа к данным из-за RLS/роли. Проверьте строку сотрудника в nav_profiles и его роль.';
  }
  return raw;
}

function setButtonsForUser(user) {
  const signIn = get('btnCloudSignIn');
  const signOutBtn = get('btnCloudSignOut');
  const email = get('cloudEmail');
  const password = get('cloudPassword');

  if (signIn) signIn.style.display = user ? 'none' : '';
  if (signOutBtn) signOutBtn.style.display = user ? '' : 'none';
  if (email) email.disabled = Boolean(user);
  if (password) password.disabled = Boolean(user);
}

async function refreshAuthState(showSuccessAlert = false) {
  ensureAuthBox();

  if (!isSupabaseConfigured()) {
    setButtonsForUser(null);
    showAuthState('warn', 'Supabase не настроен', '', 'Проверьте файл config/supabase.js: должны быть заполнены SUPABASE_URL и SUPABASE_PUBLISHABLE_KEY.');
    return null;
  }

  showAuthState('info', 'Проверяю состояние входа...', '', 'Если проверка зависла, обновите страницу с очисткой кэша.');

  try {
    const user = await getCurrentUser();
    setButtonsForUser(user);

    if (user) {
      showAuthState(
        'ok',
        'Вы вошли в систему',
        'Пользователь: <b>' + (user.email || user.id || 'без email') + '</b>',
        'Можно сохранять сделки в Supabase, открывать «Мои сделки», работать с решениями и задачами.'
      );
      if (showSuccessAlert) alert('Вход активен: ' + (user.email || user.id));
      return user;
    }

    showAuthState(
      'warn',
      'Вы не вошли в систему',
      '',
      'Введите email и пароль, затем нажмите «Войти». Если пользователя еще нет, его нужно создать в Supabase → Authentication → Users.'
    );
    return null;
  } catch (error) {
    setButtonsForUser(null);
    showAuthState('error', 'Не удалось проверить вход', '', explainError(error));
    return null;
  }
}

async function handleSignIn(event) {
  const button = event.target.closest('#btnCloudSignIn');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();

  const email = (get('cloudEmail')?.value || '').trim();
  const password = get('cloudPassword')?.value || '';

  try {
    ensureAuthBox();

    if (!isSupabaseConfigured()) {
      throw new Error('Supabase не настроен: проверьте config/supabase.js');
    }
    if (!email) throw new Error('Введите email');
    if (!password) throw new Error('Введите пароль');

    button.disabled = true;
    button.textContent = 'Входим...';
    showAuthState('info', 'Пробую выполнить вход...', 'Email: <b>' + email + '</b>', 'Отправляю email и пароль в Supabase Auth.');

    const user = await signInWithPassword(email, password);

    showAuthState(
      'ok',
      'Вход выполнен успешно',
      'Пользователь: <b>' + (user?.email || email) + '</b>',
      'Теперь можно сохранять сделки, открывать сохраненные сделки, добавлять решения и задачи.'
    );
    await refreshAuthState(false);
  } catch (error) {
    showAuthState(
      'error',
      'Вход не выполнен',
      email ? 'Email: <b>' + email + '</b>' : '',
      explainError(error)
    );
  } finally {
    button.disabled = false;
    button.textContent = 'Войти';
  }
}

async function handleSignOut(event) {
  const button = event.target.closest('#btnCloudSignOut');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();

  try {
    showAuthState('info', 'Выхожу из системы...', '', 'Очищаю текущую Supabase-сессию.');
    await signOut();
    setButtonsForUser(null);
    showAuthState('warn', 'Вы вышли из системы', '', 'Для сохранения и просмотра сделок войдите снова.');
  } catch (error) {
    showAuthState('error', 'Ошибка выхода', '', explainError(error));
  }
}

function markModuleLoaded() {
  const main = get('status');
  if (main && main.textContent.includes('Загрузка')) {
    main.textContent = 'Модуль входа загружен. Жду панель Supabase...';
  }
}

// Capture-обработчики срабатывают даже если основной модуль назначил свои onclick.
document.addEventListener('click', handleSignIn, true);
document.addEventListener('pointerup', handleSignIn, true);
document.addEventListener('click', handleSignOut, true);

markModuleLoaded();

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  const panelReady = Boolean(get('cloudPanel') && get('btnCloudSignIn'));
  if (panelReady) {
    clearInterval(timer);
    ensureAuthBox();
    refreshAuthState(false);
  }
  if (attempts > 75) {
    clearInterval(timer);
    showAuthState(
      'error',
      'Панель Supabase не появилась',
      '',
      'Вероятно, основной app.js не создал Supabase-панель. Обновите страницу с очисткой кэша. Если не поможет — нужно смотреть ошибку в консоли браузера.'
    );
  }
}, 200);
