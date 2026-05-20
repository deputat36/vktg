import { seedDemoDeals } from './demoSeed.js';

function get(id) { return document.getElementById(id); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }

function ensureButton() {
  if (get('btnSeedDemoDeals')) return;
  const heroActions = document.querySelector('.crm-hero-actions');
  const topActions = document.querySelector('.topbar .actions');
  const target = heroActions || topActions;
  if (!target) return;

  const button = document.createElement('button');
  button.id = 'btnSeedDemoDeals';
  button.type = 'button';
  button.className = heroActions ? '' : 'light';
  button.textContent = 'Заполнить демо-сделками';
  target.appendChild(button);

  button.onclick = async () => {
    const ok = confirm('Создать демо-сделки? Старые сделки с пометкой [ДЕМО] будут удалены и созданы заново. Реальные сделки не трогаются.');
    if (!ok) return;
    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'Создаю демо...';
    try {
      const result = await seedDemoDeals();
      alert('Готово. Создано демо-сделок: ' + result.created + '. Страница сейчас обновится.');
      location.reload();
    } catch (error) {
      alert('Не удалось создать демо-сделки: ' + esc(error.message));
      button.disabled = false;
      button.textContent = oldText;
    }
  };
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  ensureButton();
  if (get('btnSeedDemoDeals') || attempts > 80) clearInterval(timer);
}, 250);
