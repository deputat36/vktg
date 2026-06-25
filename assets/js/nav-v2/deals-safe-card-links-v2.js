const SAFE_LINK_ATTR = 'data-safe-card-link-v2';
let queued = false;

function dealIdFromHref(href) {
  try {
    const url = new URL(href, location.href);
    return url.searchParams.get('id') || '';
  } catch (_) {
    return '';
  }
}

function safeHref(id) {
  return `./deal-card-safe-v2.html?id=${encodeURIComponent(id)}&from=deals&cache=${Date.now()}`;
}

function ensureSafeLink(card, id) {
  if (!card || !id || card.querySelector(`[${SAFE_LINK_ATTR}]`)) return;
  const actions = card.querySelector('.actions');
  if (!actions) return;
  const link = document.createElement('a');
  link.className = 'btn light';
  link.href = safeHref(id);
  link.textContent = 'Безопасный вход';
  link.setAttribute(SAFE_LINK_ATTR, 'true');
  actions.appendChild(link);
}

function apply() {
  document.querySelectorAll('article.deal-card a[href*="deal-card-v2.html"]').forEach((link) => {
    const id = dealIdFromHref(link.href);
    const card = link.closest('article.deal-card');
    ensureSafeLink(card, id);
  });
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    apply();
  });
}

new MutationObserver(schedule).observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
apply();
