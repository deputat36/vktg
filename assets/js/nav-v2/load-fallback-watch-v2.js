import { renderAuthBox } from './supabase-v2.js';

let shown = false;

function shouldShowForm(text) {
  const value = String(text || '').toLowerCase();
  return value.includes('ошибка supabase 400')
    || value.includes('ошибка supabase 401')
    || value.includes('сначала войдите')
    || value.includes('jwt expired')
    || value.includes('unauthorized');
}

function showForm() {
  if (shown) return;
  const root = document.getElementById('app');
  if (!root) return;
  shown = true;
  root.innerHTML = '<main class="nav-v2-shell"><div id="fallbackAuthHost"></div></main>';
  renderAuthBox(document.getElementById('fallbackAuthHost'), async () => location.reload());
  const status = document.getElementById('authStatus');
  if (status) {
    status.className = 'status warn';
    status.textContent = 'Нужно войти снова. Если вы были в мастере СПН, черновик сохранён в этом браузере.';
  }
}

function check() {
  if (shown) return;
  const root = document.getElementById('app');
  if (!root) return;
  if (shouldShowForm(root.textContent)) showForm();
}

setTimeout(check, 400);
setTimeout(check, 1500);

const observer = new MutationObserver(check);
observer.observe(document.body, { childList: true, subtree: true, characterData: true });
