import { installPrivacySafeUxJourneyMeasurement } from './ux-metrics-session-v2.js?v=20260715-01';

function currentRole() {
  return String(document.body?.dataset?.navRole || '').toLowerCase();
}

function canKeepTechnicalLinks() {
  return ['owner', 'admin'].includes(currentRole());
}

function canSeeUxMetrics() {
  return ['owner', 'admin', 'manager'].includes(currentRole());
}

function ensureUxMetricsLink() {
  const menu = document.querySelector('.nav-v2-menu');
  if (!menu || !canSeeUxMetrics() || menu.querySelector('[data-nav-ux-metrics]')) return;
  const link = document.createElement('a');
  link.href = './ux-metrics-v2.html';
  link.textContent = 'UX-метрики';
  link.dataset.navUxMetrics = 'true';
  if (location.pathname.includes('ux-metrics-v2')) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }
  const managerLink = menu.querySelector('a[href*="manager-v2.html"]');
  if (managerLink) managerLink.insertAdjacentElement('afterend', link);
  else menu.insertBefore(link, menu.querySelector('#navLogout'));
}

function cleanupBaseMenu() {
  if (!canKeepTechnicalLinks()) {
    document
      .querySelectorAll('.nav-v2-menu a[href*="nav-system-check-v2.html"], .nav-v2-menu a[href*="diagnostics-v2.html"]')
      .forEach((link) => link.remove());
  }
  ensureUxMetricsLink();
}

installPrivacySafeUxJourneyMeasurement();
cleanupBaseMenu();

const observer = new MutationObserver(cleanupBaseMenu);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['data-nav-role']
});

setTimeout(() => observer.disconnect(), 10000);
