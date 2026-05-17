import { $, downloadJson, copyText } from './core/utils.js';
import { loadData, makeLabels } from './core/data.js';
import { analyzeDeal } from './core/engine.js';
import { saveDealLocal, restoreDealLocal } from './core/storage.js';
import { renderInputs, getDeal, applyDealPatch, bindTabs } from './ui/form.js';
import { createRenderer } from './ui/render.js';
import {
  isSupabaseConfigured,
  getCurrentUser,
  signInWithPassword,
  signOut,
  saveDealToSupabase,
  listMyDeals
} from './integrations/supabase.js';

const state = {
  data: null,
  labels: {},
  renderer: null,
  cloudUser: null
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

function buildCloudPanel() {
  const header = document.querySelector('.topbar');
  const actions = document.querySelector('.actions');
  const panel = document.createElement('section');
  panel.id = 'cloudPanel';
  panel.className = 'panel';
  panel.style.marginBottom = '14px';
  panel.innerHTML = `
    <div class="row">
      <div>
        <h2>Supabase</h2>
        <div id="cloudStatus" class="status">Supabase не настроен. Локальный режим активен.</div>
      </div>
      <div>
        <label>Email<input id="cloudEmail" type="email" autocomplete="username"></label>
        <label>Пароль<input id="cloudPassword" type="password" autocomplete="current-password"></label>
        <div class="actions" style="justify-content:flex-start;margin-top:8px">
          <button id="btnCloudSignIn" class="green">Войти</button>
          <button id="btnCloudSignOut" class="light" style="display:none">Выйти</button>
        </div>
      </div>
    </div>
  `;
  header.insertAdjacentElement('afterend', panel);

  const saveButton = document.createElement('button');
  saveButton.id = 'btnSaveCloud';
  saveButton.className = 'green';
  saveButton.textContent = 'Сохранить в Supabase';
  actions.appendChild(saveButton);

  const listButton = document.createElement('button');
  listButton.id = 'btnListCloud';
  listButton.className = 'light';
  listButton.textContent = 'Мои сделки';
  actions.appendChild(listButton);

  const cloudTabButton = document.createElement('button');
  cloudTabButton.className = 'tab';
  cloudTabButton.dataset.tab = 'cloudDeals';
  cloudTabButton.textContent = 'Supabase';
  document.querySelector('.tabs').appendChild(cloudTabButton);

  const cloudPage = document.createElement('div');
  cloudPage.id = 'cloudDeals';
  cloudPage.className = 'tabpage';
  cloudPage.innerHTML = '<h2>Supabase</h2><div class="box blue">После входа здесь появятся последние сохраненные сделки.</div><div id="cloudDealsList"></div>';
  document.querySelector('.result').appendChild(cloudPage);
}

async function refreshCloudState() {
  if (!isSupabaseConfigured()) return;
  state.cloudUser = await getCurrentUser();
  const status = $('cloudStatus');
  const signedIn = Boolean(state.cloudUser);
  status.textContent = signedIn ? `Вход выполнен: ${state.cloudUser.email}` : 'Supabase настроен. Войдите, чтобы сохранять сделки в базу.';
  $('btnCloudSignIn').style.display = signedIn ? 'none' : '';
  $('btnCloudSignOut').style.display = signedIn ? '' : 'none';
}

function renderCloudDeals(items) {
  const target = $('cloudDealsList');
  if (!target) return;
  if (!items.length) {
    target.innerHTML = '<div class="box grayBox">Сохраненных сделок пока нет.</div>';
    return;
  }
  target.innerHTML = `
    <div class="box blue">
      <h3>Последние сделки</h3>
      <table>
        <tr><th>Дата</th><th>Название</th><th>Статус</th><th>Готовность</th></tr>
        ${items.map((item) => `
          <tr>
            <td>${new Date(item.created_at).toLocaleString('ru-RU')}</td>
            <td>${item.title || '—'}</td>
            <td>${item.status || '—'}</td>
            <td>${item.readiness_deposit || 0}%</td>
          </tr>
        `).join('')}
      </table>
    </div>
  `;
}

function bindCloudEvents() {
  if (!isSupabaseConfigured()) return;
  buildCloudPanel();

  $('btnCloudSignIn').onclick = async () => {
    try {
      await signInWithPassword($('cloudEmail').value.trim(), $('cloudPassword').value);
      await refreshCloudState();
      alert('Вход выполнен');
    } catch (error) {
      alert('Ошибка входа: ' + error.message);
    }
  };

  $('btnCloudSignOut').onclick = async () => {
    try {
      await signOut();
      await refreshCloudState();
      alert('Вы вышли из Supabase');
    } catch (error) {
      alert('Ошибка выхода: ' + error.message);
    }
  };

  $('btnSaveCloud').onclick = async () => {
    try {
      const saved = await saveDealToSupabase(analyzeAndRender());
      alert('Сделка сохранена: ' + saved.title);
    } catch (error) {
      alert('Ошибка сохранения: ' + error.message);
    }
  };

  $('btnListCloud').onclick = async () => {
    try {
      renderCloudDeals(await listMyDeals());
      document.querySelector('[data-tab="cloudDeals"]').click();
    } catch (error) {
      alert('Ошибка загрузки сделок: ' + error.message);
    }
  };
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
  bindCloudEvents();
  bindTabs();
  analyzeAndRender();
  await refreshCloudState();
  $('status').textContent = isSupabaseConfigured()
    ? 'Готов к работе. Модульная версия v7.2, Supabase подключаемый.'
    : 'Готов к работе. Модульная версия v7.2, локальный режим.';
}

boot().catch((error) => {
  console.error(error);
  $('status').textContent = 'Ошибка: ' + error.message;
});
