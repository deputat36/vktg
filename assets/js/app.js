import { $, downloadJson, copyText } from './core/utils.js';
import { loadData, makeLabels } from './core/data.js';
import { analyzeDeal } from './core/engine.js';
import { saveDealLocal, restoreDealLocal } from './core/storage.js';
import { renderInputs, getDeal, applyDealPatch, bindTabs } from './ui/form.js';
import { createRenderer } from './ui/render.js';

const state = {
  data: null,
  labels: {},
  renderer: null
};

function analyzeAndRender() {
  const deal = getDeal();
  const result = analyzeDeal(deal, state.data);
  state.renderer.renderAll(result);
  saveDealLocal(deal);
  return result;
}

function buildLawyerText(result) {
  const d = result.deal;
  return `КАРТОЧКА СДЕЛКИ ДЛЯ ЮРИСТА\n\nЮрист: ${d.lawyer}\nМенеджер: ${d.manager}\nСПН продавца: ${d.sellerSpn} / ${d.sellerPhone || '—'}\nСПН покупателя: ${d.buyerSpn} / ${d.buyerPhone || '—'}\n\nОбъект: ${d.objectType} / ${d.rightForm}\nАдрес: ${d.address || '—'}\nКН объекта: ${d.cadObject || '—'}\nКН земли: ${d.cadLand || '—'}\n\nЦена факт: ${d.priceFact || '—'}\nЦена в договоре: ${d.priceContract || '—'}\n\nБанк: ${d.bankType}\nПапка: ${d.folderLink || '—'}\n\nСтоп-факторы:\n${result.stop.map((x) => '- ' + x).join('\n') || '—'}\n\nПредупреждения:\n${result.warn.map((x) => '- ' + x).join('\n') || '—'}\n\nВопросы СПН:\n${d.questions || '—'}`;
}

function bindEvents() {
  document.querySelectorAll('input,select,textarea').forEach((element) => {
    element.addEventListener('input', analyzeAndRender);
    element.addEventListener('change', analyzeAndRender);
  });

  bindTabs();

  $('scenarios').onclick = (event) => {
    const button = event.target.closest('[data-scenario]');
    if (!button) return;
    const scenario = state.data.scenarios.find((item) => item.id === button.dataset.scenario);
    if (!scenario) return;
    if (scenario.id === 'manual') {
      $('status').textContent = 'Ручное заполнение: все поля доступны.';
      return;
    }
    applyDealPatch(scenario.patch || {});
    $('status').textContent = 'Загружена заготовка: ' + scenario.title;
    analyzeAndRender();
  };

  $('btnGenerate').onclick = analyzeAndRender;

  $('btnSelfCheck').onclick = () => {
    const scenario = state.data.scenarios.find((item) => item.id === 'share_house_land') || state.data.scenarios[1];
    applyDealPatch(scenario.patch || {});
    analyzeAndRender();
    $('status').textContent = 'Самопроверка выполнена.';
  };

  $('btnCopyLawyer').onclick = () => copyText(buildLawyerText(analyzeAndRender()));

  $('btnExport').onclick = () => downloadJson('deal_export_v7.json', getDeal());

  $('btnRestore').onclick = () => {
    const saved = restoreDealLocal();
    if (!saved) {
      alert('Сохранение не найдено');
      return;
    }
    applyDealPatch(saved);
    analyzeAndRender();
    $('status').textContent = 'Локальное сохранение восстановлено.';
  };
}

async function boot() {
  state.data = await loadData();
  state.labels = makeLabels(state.data);
  state.renderer = createRenderer(state.labels, state.data.client_messages, state.data.local_borisoglebsk);

  renderInputs(state.data);
  bindEvents();
  analyzeAndRender();
  $('status').textContent = 'Готов к работе. Модульная версия v7.1.';
}

boot().catch((error) => {
  console.error(error);
  $('status').textContent = 'Ошибка: ' + error.message;
});
