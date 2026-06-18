function isPlainLeftClick(event) {
  return !event.defaultPrevented
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && (event.button === undefined || event.button === 0);
}

function findPlainLink(target) {
  const link = target?.closest?.('a[href]');
  if (!link) return null;
  if (link.target && link.target !== '_self') return null;
  if (link.hasAttribute('download')) return null;
  const href = link.getAttribute('href') || '';
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return null;
  return link;
}

function openFast(link, event) {
  if (!link) return;
  const url = new URL(link.getAttribute('href'), window.location.href);
  if (url.origin !== window.location.origin) return;
  event.preventDefault();
  event.stopPropagation();
  window.location.assign(url.href);
}

document.addEventListener('pointerup', (event) => {
  if (!isPlainLeftClick(event)) return;
  const link = findPlainLink(event.target);
  if (!link) return;
  openFast(link, event);
}, true);

document.addEventListener('click', (event) => {
  if (!isPlainLeftClick(event)) return;
  const link = findPlainLink(event.target);
  if (!link) return;
  openFast(link, event);
}, true);
