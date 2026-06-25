const LINK_ID = 'dealCardSafeLinkV2';

function dealId() {
  return new URLSearchParams(location.search).get('id') || '';
}

function safeUrl() {
  return `./deal-card-safe-v2.html?id=${encodeURIComponent(dealId())}&cache=${Date.now()}`;
}

function addSafeLink() {
  if (document.getElementById(LINK_ID)) return;
  const app = document.getElementById('app');
  if (!app) return;
  const text = String(app.textContent || '').toLowerCase();
  const isRecovery = text.includes('карточка временно не загрузилась')
    || text.includes('аварийная сводка')
    || text.includes('supabase не ответил')
    || text.includes('не удалось подключиться к supabase');
  if (!isRecovery) return;
  const actions = app.querySelector('.actions');
  if (!actions) return;
  const link = document.createElement('a');
  link.id = LINK_ID;
  link.className = 'btn primary';
  link.href = safeUrl();
  link.textContent = 'Безопасный вход';
  actions.prepend(link);
}

new MutationObserver(addSafeLink).observe(document.getElementById('app') || document.body, { childList: true, subtree: true, characterData: true });
addSafeLink();
