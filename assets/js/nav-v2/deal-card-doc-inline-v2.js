import { rpc } from './supabase-v2.js';

const DOCUMENT_STATUS_TITLES = {
  needed: 'Нужен',
  received: 'Получен',
  checked: 'Проверен'
};

function title(status) {
  return DOCUMENT_STATUS_TITLES[status] || status || 'Нужен';
}

function localizeDocumentStatuses(root = document) {
  root.querySelectorAll?.('.doc-status .pill').forEach((pill) => {
    const current = String(pill.dataset.docStatusValue || pill.textContent || '').trim();
    const translated = title(current);

    if (DOCUMENT_STATUS_TITLES[current]) {
      pill.dataset.docStatusValue = current;
    }

    if (translated && pill.textContent !== translated) {
      pill.textContent = translated;
    }
  });

  root.querySelectorAll?.('[data-doc-id][data-doc-status]').forEach((button) => {
    button.type = 'button';
  });
}

window.addEventListener('click', async (event) => {
  const button = event.target.closest?.('[data-doc-id][data-doc-status]');
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  button.type = 'button';
  const row = button.closest('.list-item');
  const pill = row?.querySelector('.doc-status .pill');
  const buttons = row ? [...row.querySelectorAll('[data-doc-id][data-doc-status]')] : [button];

  buttons.forEach((item) => { item.disabled = true; });
  try {
    await rpc('nav_v2_update_document_status', {
      p_document_id: button.dataset.docId,
      p_status: button.dataset.docStatus
    }, 15000);

    if (pill) {
      pill.className = `pill ${button.dataset.docStatus === 'needed' ? 'yellow' : 'green'}`;
      pill.dataset.docStatusValue = button.dataset.docStatus;
      pill.textContent = title(button.dataset.docStatus);
    }
  } finally {
    buttons.forEach((item) => { item.disabled = false; });
  }
}, true);

const observer = new MutationObserver(() => localizeDocumentStatuses());
observer.observe(document.documentElement, { childList: true, subtree: true });
localizeDocumentStatuses();
