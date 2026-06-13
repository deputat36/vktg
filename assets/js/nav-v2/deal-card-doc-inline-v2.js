import { rpc } from './supabase-v2.js';

function title(status) {
  return ({ needed: 'Нужен', received: 'Получен', checked: 'Проверен' })[status] || status;
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
      pill.textContent = title(button.dataset.docStatus);
    }
  } finally {
    buttons.forEach((item) => { item.disabled = false; });
  }
}, true);
