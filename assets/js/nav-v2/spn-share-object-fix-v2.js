const DRAFT_KEY = 'nav_deal_draft_v2';
let didNormalize = false;
let scheduled = false;

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function saveDraft(deal) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(deal));
}

function normalizeOldShareDraft() {
  if (didNormalize) return false;
  const deal = readDraft();
  const wasShareObject = deal.objectType === 'share' || deal.objectCategory === 'share';
  if (!wasShareObject) return false;

  const flags = Array.isArray(deal.flags) ? deal.flags : [];
  const next = {
    ...deal,
    legalForm: 'share',
    flags: [...new Set([...flags, 'shares'])]
  };

  delete next.objectType;
  delete next.objectCategory;
  delete next.apartmentKind;

  didNormalize = true;
  saveDraft(next);
  return true;
}

function removeLegacyShareButton() {
  document.querySelectorAll('[data-action="set:objectCategory:share"]').forEach((button) => {
    const container = button.closest('.option') || button;
    container.remove();
  });
}

function addShareHintNearObjectStep() {
  const optionGrid = document.querySelector('[data-action="set:objectCategory:flat"]')?.closest('.option-grid');
  if (!optionGrid || document.getElementById('shareObjectFixHint')) return;

  const hint = document.createElement('div');
  hint.id = 'shareObjectFixHint';
  hint.className = 'status';
  hint.style.marginTop = '12px';
  hint.innerHTML = '<b>Если продаётся доля или часть объекта:</b><br>сначала выберите физический тип недвижимости — квартира, дом, земля, коммерция, комната. Затем в блоке “Доля / часть объекта” отметьте, что продаётся доля, и уточните вход, двор и порядок пользования.';

  optionGrid.insertAdjacentElement('afterend', hint);
}

function applyObjectFix() {
  const normalized = normalizeOldShareDraft();
  removeLegacyShareButton();
  addShareHintNearObjectStep();

  if (normalized) {
    setTimeout(() => location.reload(), 80);
  }
}

function scheduleFix() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    applyObjectFix();
  }, 80);
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  applyObjectFix();
  if (attempts >= 30) clearInterval(timer);
}, 150);

document.addEventListener('click', scheduleFix, true);
document.addEventListener('input', scheduleFix, true);
window.addEventListener('storage', scheduleFix);
