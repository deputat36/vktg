const MARK = 'navV2DealCardTimeoutRecovery';
const RETRY_PARAM = 'timeout_retry';
let handled = false;

function isTimeoutErrorText(text) {
  const value = String(text || '').toLowerCase();
  return value.includes('supabase не ответил') || value.includes('не удалось подключиться к supabase');
}

function currentDealId() {
  return new URLSearchParams(location.search).get('id') || '';
}

function retryUrl() {
  const url = new URL(location.href);
  url.searchParams.set(RETRY_PARAM, '1');
  url.searchParams.set('cache', String(Date.now()));
  return url.href;
}

function hasRetried() {
  return new URLSearchParams(location.search).get(RETRY_PARAM) === '1';
}

function renderRecovery(errorText) {
  if (handled || document.getElementById(MARK)) return;
  handled = true;
  const app = document.getElementById('app');
  if (!app) return;
  const dealId = currentDealId();
  const article = document.createElement('main');
  article.className = 'nav-v2-shell';
  article.id = MARK;
  article.innerHTML = `<section class="hero"><h1>Карточка временно не загрузилась</h1><p>Доступ к сделке есть, но браузер не дождался ответа Supabase.</p></section>
    <section class="card">
      <div class="status warn">${errorText || 'Supabase не ответил вовремя.'}</div>
      <div class="list">
        <div class="list-item"><b>ID сделки</b>${dealId || 'не указан'}</div>
        <div class="list-item"><b>Что сделать</b>Нажмите «Повторить загрузку». Если ошибка повторяется, откройте карточку через чистый вход.</div>
      </div>
      <div class="actions" style="justify-content:flex-start">
        <a class="btn primary" href="${retryUrl()}">Повторить загрузку</a>
        <a class="btn light" href="./nav-v2.html?clean=1">Чистый вход</a>
        <a class="btn light" href="./deals-v2.html">К списку сделок</a>
      </div>
    </section>`;
  app.innerHTML = '';
  app.appendChild(article);
}

function inspect() {
  const app = document.getElementById('app');
  if (!app || handled) return;
  const text = app.textContent || '';
  if (!isTimeoutErrorText(text)) return;
  if (!hasRetried()) {
    handled = true;
    setTimeout(() => { location.href = retryUrl(); }, 600);
    return;
  }
  renderRecovery(text.trim());
}

new MutationObserver(inspect).observe(document.getElementById('app') || document.body, { childList: true, subtree: true, characterData: true });
inspect();
