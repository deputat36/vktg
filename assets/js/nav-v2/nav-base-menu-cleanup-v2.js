function canKeepTechnicalLinks() {
  return ['owner', 'admin'].includes(String(document.body?.dataset?.navRole || '').toLowerCase());
}

function cleanupBaseMenu() {
  if (canKeepTechnicalLinks()) return;
  document
    .querySelectorAll('.nav-v2-menu a[href*="nav-system-check-v2.html"], .nav-v2-menu a[href*="diagnostics-v2.html"]')
    .forEach((link) => link.remove());
}

cleanupBaseMenu();

const observer = new MutationObserver(cleanupBaseMenu);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['data-nav-role']
});

setTimeout(() => observer.disconnect(), 10000);
