import { buildDealCardCrmHandoffModel } from './deal-card-crm-handoff-model-v1.js?v=20260723-02';

const BLOCK_ID = 'dealCardCrmHandoffV1';

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function buildHtml(model) {
  return `<section id="${BLOCK_ID}" class="card" aria-labelledby="dealCardCrmHandoffTitle">
    <div class="section-title">
      <div>
        <h2 id="dealCardCrmHandoffTitle">В CRM</h2>
        <p class="muted">Краткая процессная запись из уже загруженной карточки. Навигатор не создаёт вторую CRM и ничего не сохраняет автоматически.</p>
      </div>
      <span class="pill blue">только копирование</span>
    </div>
    <div class="list">
      ${model.fields.map((field) => `<div class="list-item"><b>${esc(field.label)}</b><span>${esc(field.value)}</span></div>`).join('')}
    </div>
    <div class="field">
      <label for="dealCardCrmHandoffText">Готовая запись</label>
      <textarea id="dealCardCrmHandoffText" rows="8" readonly>${esc(model.copy_text)}</textarea>
    </div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn primary" type="button" data-crm-handoff-copy>Скопировать запись</button>
    </div>
    <div class="status" role="status" aria-live="polite" data-crm-handoff-status>Проверьте текст перед внесением в CRM. Клиентские идентификаторы в сводку не добавляются.</div>
  </section>`;
}

async function copyText(textarea, status) {
  const value = textarea.value;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.setSelectionRange(0, 0);
      if (!copied) throw new Error('copy command rejected');
    }
    status.className = 'status ok';
    status.textContent = 'Запись скопирована. Перед сохранением проверьте срок, ответственного и актуальность договорённостей.';
  } catch (_) {
    textarea.focus();
    textarea.select();
    status.className = 'status warn';
    status.textContent = 'Автоматическое копирование недоступно. Текст выделен — скопируйте его вручную.';
  }
}

function bindCopy(section) {
  const button = section.querySelector('[data-crm-handoff-copy]');
  const textarea = section.querySelector('#dealCardCrmHandoffText');
  const status = section.querySelector('[data-crm-handoff-status]');
  if (!button || !textarea || !status) return;
  button.addEventListener('click', () => void copyText(textarea, status));
}

export function applyDealCardCrmHandoff(data, profile) {
  document.getElementById(BLOCK_ID)?.remove();
  const main = document.querySelector('#app .nav-v2-shell');
  const tabsSection = main?.querySelector('.tabs')?.closest('section.card');
  if (!main || !tabsSection || !data?.deal) return null;

  const model = buildDealCardCrmHandoffModel(data, profile);
  const host = document.createElement('div');
  host.innerHTML = buildHtml(model);
  const section = host.firstElementChild;
  tabsSection.insertAdjacentElement('beforebegin', section);
  bindCopy(section);
  return model;
}
