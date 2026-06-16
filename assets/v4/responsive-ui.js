const CATALOG_OPEN_KEY = 'leader_v4_catalog_open';

function catalogOpen() {
  return localStorage.getItem(CATALOG_OPEN_KEY) === '1';
}

function addCatalogToggle() {
  const section = document.getElementById('catalogSection');
  if (!section) return;
  section.classList.toggle('is-open', catalogOpen());
  const head = section.querySelector('.v4-section-head');
  if (!head || head.querySelector('[data-catalog-toggle]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'v4-section-toggle';
  button.dataset.catalogToggle = '1';
  button.textContent = catalogOpen() ? 'Свернуть номенклатуру' : 'Открыть номенклатуру';
  head.appendChild(button);
}

function prepareTables() {
  document.querySelectorAll('.v4-table-wrap').forEach((wrap) => {
    wrap.tabIndex = 0;
    wrap.setAttribute('aria-label', 'Прокручиваемая таблица');
  });
}

function refreshResponsiveUi() {
  addCatalogToggle();
  prepareTables();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-catalog-toggle]');
  if (!button) return;
  const section = document.getElementById('catalogSection');
  if (!section) return;
  const nextState = !section.classList.contains('is-open');
  section.classList.toggle('is-open', nextState);
  localStorage.setItem(CATALOG_OPEN_KEY, nextState ? '1' : '0');
  button.textContent = nextState ? 'Свернуть номенклатуру' : 'Открыть номенклатуру';
});

document.addEventListener('DOMContentLoaded', refreshResponsiveUi);
document.addEventListener('leader-v4:crm-ready', () => setTimeout(refreshResponsiveUi, 150));
document.addEventListener('leader-v4:lead-card-rendered', () => setTimeout(refreshResponsiveUi, 150));
document.addEventListener('leader-v4:route-change', () => setTimeout(refreshResponsiveUi, 150));
setInterval(refreshResponsiveUi, 2000);
