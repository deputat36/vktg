import { seedDemoDeals } from '../integrations/demoSeed.js';

function get(id) { return document.getElementById(id); }

function ensureDemoButton() {
  if (get('btnSeedDemoDeals')) return true;
  const actions = document.querySelector('.crm-hero-actions') || document.querySelector('.topbar .actions');
  if (!actions) return false;

  const button = document.createElement('button');
  button.id = 'btnSeedDemoDeals';
  button.type = 'button';
  button.textContent = 'Создать демо-данные';
  button.title = 'Создать 12 демо-сделок с задачами, решениями и лентой. Старые демо-сделки будут заменены.';
  actions.appendChild(button);

  button.onclick = async () => {
    const ok = confirm('Создать демо-набор сделок? Старые сделки с пометкой [ДЕМО] будут удалены и созданы заново. Реальные сделки не трогаются.');
    if (!ok) return;
    button.disabled = true;
    button.textContent = 'Создаю демо...';
    try {
      const result = await seedDemoDeals();
      alert('Готово. Создано демо-сделок: ' + result.created + '. Страница будет обновлена.');
      location.reload();
    } catch (error) {
      alert('Не удалось создать демо-данные: ' + error.message);
      button.disabled = false;
      button.textContent = 'Создать демо-данные';
    }
  };
  return true;
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (ensureDemoButton() || attempts > 80) clearInterval(timer);
}, 300);
