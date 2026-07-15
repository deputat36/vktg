import { summarizePrivacySafeJourneys } from './ux-metrics-model-v2.js?v=20260715-01';

const STORAGE_KEY = 'nav_v2_privacy_safe_ux_journeys_v1';
const MAX_RECORDS = 50;
const PAGE_BY_FILE = {
  'dashboard-v2.html': 'dashboard',
  'deals-v2.html': 'deals',
  'deal-card-v2.html': 'deal-card',
  'manager-v2.html': 'manager'
};

function currentPage() {
  const file = String(location.pathname || '').split('/').pop() || '';
  return PAGE_BY_FILE[file] || '';
}

function viewportBucket() {
  return window.matchMedia('(max-width: 430px)').matches ? 'mobile' : 'desktop';
}

function elapsedBucket(milliseconds) {
  const seconds = Math.max(0, Number(milliseconds || 0)) / 1000;
  if (seconds <= 5) return '0-5s';
  if (seconds <= 15) return '6-15s';
  if (seconds <= 30) return '16-30s';
  if (seconds <= 60) return '31-60s';
  return '60s+';
}

function readRecords() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(-MAX_RECORDS) : [];
  } catch (_) {
    return [];
  }
}

function writeRecords(records) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-MAX_RECORDS)));
  } catch (_) {
    // UX measurement must never block the product flow.
  }
}

export function readPrivacySafeJourneyRecords() {
  return readRecords();
}

export function readPrivacySafeJourneySummary() {
  return summarizePrivacySafeJourneys(readRecords());
}

export function clearPrivacySafeJourneyRecords() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // No-op when storage is unavailable.
  }
}

export function installPrivacySafeUxJourneyMeasurement() {
  const page = currentPage();
  if (!page || window.__navV2PrivacySafeUxInstalled) return;
  window.__navV2PrivacySafeUxInstalled = true;
  const startedAt = performance.now();
  let clickOrdinal = 0;
  let recorded = false;

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    clickOrdinal += 1;
    if (recorded || !target.closest('.mobile-first-screen-primary-action, [data-ux-main-action="true"]')) return;
    recorded = true;
    const records = readRecords();
    records.push({
      page,
      viewport: viewportBucket(),
      clicksToMain: Math.max(1, Math.min(20, clickOrdinal)),
      elapsedBucket: elapsedBucket(performance.now() - startedAt)
    });
    writeRecords(records);
  }, { capture: true });
}
