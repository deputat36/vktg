import { $, esc, list } from '../core/utils.js';

export function createRenderer(labels, clientMessages, localData) {
  const label = (id) => labels[id] || id;
  const chips = (items, cls = 'blue') => (items || []).map((item) => `<span class="pill ${cls}">${esc(label(item))}</span>`).join('') || '<span class="pill green">Не выбрано</span>';
  const boxClass = (cls) => cls === 'red' ? 'redBox' : cls === 'orange' ? 'orangeBox' : 'greenBox';

  function renderAll(result) {
    renderSummary(result);
    renderNow(result);
    renderLawyer(result);
    renderBroker(result);
    renderDocs(result);
    renderClient(result);
    renderLocal();
  }

  function renderSummary(result) {
    const d = result.deal;
    $('summary').innerHTML = `
      <div class="box ${boxClass(result.cls)}">
        <h2>Главное решение</h2>
        <table>
          <tr><th>Можно ли брать задаток?</th><td><b>${esc(result.decision)}</b></td></tr>
          <tr><th>Что мешает</th><td>${result.stop.length ? list(result.stop) : list(result.warn.length ? result.warn : ['Критичных препятствий не выявлено'])}</td></tr>
          <tr><th>Кому передать</th><td>${chips(result.to, result.cls)}</td></tr>
        </table>
      </div>
      <div class="metrics">
        <div class="metric ${boxClass(result.cls)}"><b>${result.score}</b><span>индекс сложности</span></div>
        <div class="metric"><b>${result.ready}%</b><span>готовность к задатку</span></div>
        <div class="metric"><b>${esc(d.manager || '—')}</b><span>менеджер</span></div>
        <div class="metric"><b>${esc(d.lawyer || '—')}</b><span>юрист</span></div>
      </div>
      <div class="box blue"><h3>Краткая картина</h3>
        <table>
          <tr><th>Продавец</th><td>${esc(d.sellerSpn)}<br>${esc(d.sellerPhone || 'телефон не указан')}</td><th>Покупатель</th><td>${esc(d.buyerSpn)}<br>${esc(d.buyerPhone || 'телефон не указан')}</td></tr>
          <tr><th>Объект</th><td colspan="3">${esc(d.objectType)}<br>${esc(d.rightForm)}<br>${esc(d.address || 'адрес не указан')}<br>КН объекта: ${esc(d.cadObject || '—')}<br>КН земли: ${esc(d.cadLand || '—')}</td></tr>
        </table>
      </div>
    `;
  }

  function renderNow(result) {
    $('now').innerHTML = `<h2>Что сделать сейчас</h2><div class="box blue">${list(result.actions)}</div>`;
  }

  function renderLawyer(result) {
    const d = result.deal;
    $('lawyerTab').innerHTML = `
      <h2>Карточка юристу</h2>
      <table>
        <tr><th>Юрист</th><td>${esc(d.lawyer)}</td><th>Менеджер</th><td>${esc(d.manager)}</td></tr>
        <tr><th>СПН продавца</th><td>${esc(d.sellerSpn)}<br>${esc(d.sellerPhone || '—')}</td><th>СПН покупателя</th><td>${esc(d.buyerSpn)}<br>${esc(d.buyerPhone || '—')}</td></tr>
        <tr><th>Объект</th><td colspan="3">${esc(d.objectType)} / ${esc(d.rightForm)}<br>${esc(d.address || '—')}<br>КН объекта: ${esc(d.cadObject || '—')}<br>КН земли: ${esc(d.cadLand || '—')}</td></tr>
        <tr><th>Цена</th><td>Факт: ${esc(d.priceFact || '—')}</td><th>В договоре</th><td>${esc(d.priceContract || '—')}</td></tr>
        <tr><th>Расчет</th><td colspan="3">${chips(d.payments, 'blue')} ${chips(d.certificates, 'orange')}<br>${esc(d.bankType)}</td></tr>
        <tr><th>Папка</th><td colspan="3">${esc(d.folderLink || '—')}</td></tr>
        <tr><th>Вопросы</th><td colspan="3">${esc(d.questions || '—')}</td></tr>
      </table>
      <div class="box redBox"><h3>Стоп-факторы</h3>${list(result.stop)}</div>
      <div class="box orangeBox"><h3>Не хватает</h3>${list(result.missing.concat(result.warn))}</div>
    `;
  }

  function renderBroker(result) {
    const d = result.deal;
    $('broker').innerHTML = `
      <h2>Карточка брокеру</h2>
      <div class="box ${result.stop.length ? 'redBox' : result.mortgage || result.sber ? 'orangeBox' : 'greenBox'}"><h3>${result.mortgage || result.sber ? 'Ипотечный сценарий требует проверки банка' : 'Ипотека не выбрана'}</h3></div>
      <table>
        <tr><th>Покупатель</th><td>${esc(d.buyerSpn)}<br>${esc(d.buyerPhone || '—')}</td></tr>
        <tr><th>Объект</th><td>${esc(d.objectType)} / ${esc(d.rightForm)}<br>${esc(d.address || '—')}</td></tr>
        <tr><th>Банк</th><td>${esc(d.bankType)}</td></tr>
        <tr><th>Папка</th><td>${esc(d.folderLink || '—')}</td></tr>
      </table>
    `;
  }

  function renderDocs(result) {
    $('docs').innerHTML = `
      <h2>Документы</h2>
      <div class="box"><h3>Продавец</h3>${list(result.docsSeller)}</div>
      <div class="box"><h3>Покупатель</h3>${list(result.docsBuyer)}</div>
      <div class="box blue"><h3>Банк</h3>${list(result.bank)}</div>
      <div class="box grayBox"><h3>Дополнительно</h3>${list(result.extra)}</div>
    `;
  }

  function renderClient(result) {
    const d = result.deal;
    const address = d.address || '[адрес объекта]';
    const seller = 'Здравствуйте! Для подготовки сделки по объекту ' + address + ' нужно заранее собрать документы.\n\nНужно от продавца:\n- ' + result.docsSeller.join('\n- ') + '\n\nЕГРН для банка/нотариуса нужна полным комплектом: PDF + XML + SIG/архив с ЭЦП.';
    const buyer = 'Здравствуйте! Для подготовки покупки по объекту ' + address + ' нужно собрать документы покупателя.\n\nНужно от покупателя:\n- ' + result.docsBuyer.join('\n- ');
    const messages = [['Продавцу: документы', seller], ['Покупателю: документы', buyer], ['МФЦ', clientMessages.mfc], ['Сбер / Домклик', clientMessages.sber]];
    $('client').innerHTML = '<h2>Что отправить клиенту</h2>' + messages.map((message, i) => `
      <div class="msg">
        <h3>${esc(message[0])}</h3>
        <textarea id="msg_${i}">${esc(message[1])}</textarea>
        <button class="light" data-copy-target="msg_${i}">Скопировать</button>
      </div>
    `).join('');

    document.querySelectorAll('[data-copy-target]').forEach((button) => {
      button.onclick = () => navigator.clipboard.writeText($(button.dataset.copyTarget).value).then(() => alert('Скопировано'));
    });
  }

  function renderLocal() {
    $('local').innerHTML = `<h2>Борисоглебск</h2><div class="box blue">${list(localData.market_notes)}</div><div class="box orangeBox"><h3>НСПД</h3>${list(localData.nspd_steps)}</div>`;
  }

  return { renderAll };
}
