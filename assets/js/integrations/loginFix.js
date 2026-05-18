import { isSupabaseConfigured, signInWithPassword, signOut, getCurrentUser } from './supabase.js';

function get(id) {
  return document.getElementById(id);
}

function setStatus(text) {
  const cloud = get('cloudStatus');
  const main = get('status');
  if (cloud) cloud.textContent = text;
  else if (main) main.textContent = text;
}

async function refreshButtons() {
  if (!isSupabaseConfigured()) return;
  const user = await getCurrentUser();
  const signIn = get('btnCloudSignIn');
  const signOutBtn = get('btnCloudSignOut');
  if (signIn) signIn.style.display = user ? 'none' : '';
  if (signOutBtn) signOutBtn.style.display = user ? '' : 'none';
  setStatus(user ? 'Вход выполнен: ' + user.email : 'Supabase настроен. Введите email и пароль.');
}

async function handleSignIn(event) {
  const button = event.target.closest('#btnCloudSignIn');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();

  try {
    button.disabled = true;
    button.textContent = 'Входим...';
    setStatus('Пробую выполнить вход...');

    const email = (get('cloudEmail')?.value || '').trim();
    const password = get('cloudPassword')?.value || '';

    if (!email) throw new Error('Введите email');
    if (!password) throw new Error('Введите пароль');

    const user = await signInWithPassword(email, password);
    setStatus('Вход выполнен: ' + (user?.email || email));
    await refreshButtons();
    alert('Вход выполнен');
  } catch (error) {
    setStatus('Ошибка входа: ' + error.message);
    alert('Ошибка входа: ' + error.message);
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
    await signOut();
    await refreshButtons();
    alert('Вы вышли из Supabase');
  } catch (error) {
    setStatus('Ошибка выхода: ' + error.message);
    alert('Ошибка выхода: ' + error.message);
  }
}

document.addEventListener('click', handleSignIn, true);
document.addEventListener('click', handleSignOut, true);

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (get('btnCloudSignIn') || attempts > 50) {
    clearInterval(timer);
    refreshButtons();
  }
}, 200);
