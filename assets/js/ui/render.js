import { $, esc, list } from '../core/utils.js';

export function createRenderer(labels, clientMessages, localData) {
  const label = (id) => labels[id] || id;
  const chips = (items, cls = 'blue') => (items || []).map((item) => `<span class="pill ${cls}">${esc(label(item))}</span>`).join('') || '<span class="pill green">Не выбрано</span>';
  const boxClass = (cls) => cls === 'red' ? 'redBox' : cls === 'orange' ? 'orangeBox' : 'greenBox';

  function financePartiesTable(d) {
    return `
      <table>
        <tr><th>Продавцы</th><td>${esc(d.sellerCount || '—')}<br>${esc(d.sellerMainName || '')}<br>${esc(d.sellerSideComment || '')}</td></tr>
        <tr><th>Покупатели</th><td>${esc(d.buyerCount || '—')}<br>${esc(d.buyerMainName || '')}<br>${esc(d.buyerSideComment || '')}</td></tr>
        <tr><th>Комиссия продавца</th><td>${esc(d.sellerRealtorCommission || '—')}<br>${esc(d.sellerCommissionComment || '')}</td></tr>
        <tr><th>Комиссия покупателя</th><td>${esc(d.buyerRealtorCommission || '—')}<br>${esc(d.buyerCommissionComment || '')}</td></tr>
        <tr><th>Общая комиссия / распределение</th><td>${esc(d.totalOfficeCommission || '—')}<br>${esc(d.commissionDistribution || '')}</td></tr>
        <tr><th>Госпошлина</th><td>Плательщик: ${esc(d.registrationFeePayer || '—')}<br>Право: ${esc(d.registrationFeeAmount || '—')}<br>Земля: ${esc(d.landRegistrationFeeAmount || '—')}</td></tr>
        <tr><th>Банк / сделочные расходы</th><td>Оценка: ${esc(d.evaluationCost || '—')}<br>СБР: ${esc(d.sbrCost || '—')}<br>Нотариус: ${esc(d.notaryCost || '—')}<br>Страховка/банк: ${esc(d.bankInsuranceCost || '—')}<br>Прочее: ${esc(d.otherCosts || '—')}</td></tr>
        <tr><th>Комментарий по расходам</th><td>${esc(d.costsComment || '—')}</td></tr>
      </table>
    `;
  }

  function representationText(value) {
    if (value === 'our_spn') return 'Наша сторона / наш СПН';
    if (value === 'external_agency') return 'Другое агентство';
    if (value === 'client_self') return 'Сторона без нашего сопровождения';
    if (value === 'unknown') return 'Нужно уточнить';
    return value || '—';
  }

  function cooperationTitle(d) {
    if (d.cooperationSummary) return d.cooperationSummary;
    if (d.representationModel === 'both_sides_one_spn') return 'Один СПН ведет обе стороны';
    if (d.representationModel === 'both_sides_two_spn') return 'Два СПН: продавец и покупатель';
    if (d.representationModel === 'seller_only') return 'Компания представляет продавца';
    if (d.representationModel === 'buyer_only') return 'Компания представляет покупателя';
    if (d.representationModel === 'external_agency') return 'Сделка с другим агентством';
    return 'Формат представительства не уточнен';
  }

  function yesNoProblem(value) {
    return value ? esc(value) : '<span class="pill orange">не указано</span>';
  }

  function priceMismatch(d) {
    const fact = String(d.priceFact || '').replace(/\D/g, '');
    const contract = String(d.priceContract || '').replace(/\D/g, '');
    return fact && contract && fact !== contract;
  }

  function legalQuestions(result) {
    const d = result.deal;
    const q = [];

    if (result.stop.length) q.push('Подтвердить, можно ли продолжать подготовку на текущих условиях или сделку нужно ставить на паузу.');
    if ((d.rightForm || '').toLowerCase().includes('доля')) q.push('Проверить нотариальную форму, преимущественное право покупки других участников долевой собственности и возможность ипотеки.');
    if (/дом|зем|снт|дача/i.test(d.objectType || '')) q.push('Проверить связку объекта и земли: кадастровые номера, границы участка, ВРИ, категорию земли и соответствие документов.');
    if (/частном секторе/i.test(d.objectType || '')) q.push('Проверить правовой статус квартиры в частном секторе для ипотеки, маткапитала и регистрации перехода права.');
    if ((d.flags || []).includes('minor') || /несовершеннолет/i.test(d.sellerSideComment || '')) q.push('Проверить необходимость согласия/разрешения органов опеки и условия защиты прав несовершеннолетнего.');
    if ((d.flags || []).includes('proxy') || /довер/i.test(d.sellerSideComment || '')) q.push('Проверить доверенность: полномочия на продажу, получение денег, подписание договора, срок и актуальность.');
    if ((d.flags || []).includes('registered') || /зарегистр/i.test(d.sellerSideComment || '')) q.push('Проверить зарегистрированных лиц, сроки снятия с регистрации и риски отказников/сохраняющих право пользования.');
    if (priceMismatch(d) || (d.flags || []).includes('price_mismatch')) q.push('Оценить риски отличия фактической цены от цены в договоре и дать безопасную формулировку для задатка/договора.');
    if ((d.certificates || []).length) q.push('Проверить условия использования сертификатов: требования к объекту, получателю денег, срокам перечисления и формулировкам в договоре.');
    if ((d.payments || []).includes('mortgage')) q.push('Проверить, нет ли юридических ограничений для ипотечной сделки по выбранному объекту и форме права.');
    if (!d.folderLink) q.push('Попросить СПН дать ссылку на папку с документами: без папки юридическая проверка будет неполной.');
    if (d.questions) q.push('Ответить на конкретные вопросы СПН из карточки ниже.');

    return q.length ? q : ['Критичных юридических вопросов не выявлено. Проверить документы основания, ЕГРН, зарегистрированных и корректность условий задатка/договора.'];
  }

  function compactDocsStatus(d) {
    return `
      <table>
        <tr><th>ЕГРН с ЭЦП</th><td>${esc(d.stEgrn || 'не указано')}<br><span class="small">Для банка/нотариуса нужен полный комплект: PDF + XML + SIG/архив с ЭЦП.</span></td></tr>
        <tr><th>Справка о зарегистрированных</th><td>${esc(d.stRegistered || 'не указано')}<br><span class="small">Нужна для понимания, кто зарегистрирован и кто должен сняться с учета.</span></td></tr>
        <tr><th>Папка с документами</th><td>${d.folderLink ? esc(d.folderLink) : '<span class="pill red">ссылка не указана</span>'}<br><span class="small">Желательно: Яндекс Диск, каждый документ отдельным файлом, в названии фамилия + тип документа.</span></td></tr>
      </table>
    `;
  }

  function spnDecision(result) {
    if (result.stop.length) return {
      title: 'Задаток пока не брать',
      cls: 'redBox',
      text: 'Есть условия, которые могут сорвать сделку или сделать задаток небезопасным. Сначала передайте карточку юристу/менеджеру и устраните стоп-факторы.'
    };
    if (result.warn.length || result.missing.length) return {
      title: 'Готовить можно, но сначала закрыть замечания',
      cls: 'orangeBox',
      text: 'Сделка не выглядит полностью заблокированной, но есть данные или документы, без которых рискованно брать задаток.'
    };
    return {
      title: 'Можно готовить задаток',
      cls: 'greenBox',
      text: 'Критичных препятствий не выявлено. Всё равно проверьте документы и зафиксируйте условия до передачи денег.'
    };
  }

  function spnWarnings(result) {
    const d = result.deal;
    const items = [];
    if (result.stop.length) items.push('Не обещайте клиентам дату задатка/сделки, пока юрист или менеджер не подтвердит возможность продолжения.');
    if ((d.rightForm || '').toLowerCase().includes('доля')) items.push('Не обещайте обычную ипотечную сделку по доле без проверки юриста и банка.');
    if (/дом|зем|снт|дача/i.test(d.objectType || '')) items.push('Не обещайте сделку по дому/земле без проверки кадастровых номеров, границ участка и ВРИ.');
    if (/частном секторе/i.test(d.objectType || '')) items.push('Не обещайте, что объект точно пройдет ипотеку или маткапитал, пока банк/юрист не подтвердит статус объекта.');
    if ((d.payments || []).includes('mortgage') || /сбер|банк|ипот/i.test(d.bankType || '')) items.push('Не обещайте одобрение объекта банком и точную дату сделки, пока банк не проверит документы и оценку.');
    if ((d.certificates || []).length) items.push('Не обещайте сроки перечисления сертификата без проверки остатка, требований программы и документов.');
    if (priceMismatch(d)) items.push('Не обсуждайте с клиентом отличие цены “на словах”. Причина и безопасная схема должны быть понятны юристу до задатка.');
    if (!d.stRegistered || d.stRegistered === 'не запрошено') items.push('Не обещайте свободную передачу объекта, пока не проверена справка о зарегистрированных.');
    if (!items.length) items.push('Не обещайте клиентам то, что зависит от банка, юриста, МФЦ, Росреестра или другой стороны. Фиксируйте только проверенные условия.');
    return items;
  }

  function spnDocsPriority(result) {
    const d = result.deal;
    const items = [];
    if (!d.folderLink) items.push('Создать папку на Яндекс Диске и складывать документы отдельными файлами: фамилия + название документа.');
    if (!d.stEgrn || d.stEgrn === 'не запрошено') items.push('Запросить ЕГРН с ЭЦП: PDF + XML + SIG/архив. Один PDF для банка/нотариуса недостаточен.');
    if (!d.stRegistered || d.stRegistered === 'не запрошено') items.push('Запросить справку о зарегистрированных через Госуслуги/МФЦ/уполномоченный орган.');
    if (result.docsSeller?.length) items.push('От продавца: ' + result.docsSeller.slice(0, 5).join('; ') + '.');
    if (result.docsBuyer?.length) items.push('От покупателя: ' + result.docsBuyer.slice(0, 5).join('; ') + '.');
    if (result.bank?.length) items.push('Для банка: ' + result.bank.slice(0, 5).join('; ') + '.');
    return items;
  }

  function spnCommunication(result) {
    const d = result.deal;
    const items = [];
    if (d.sellerRepresentation === 'our_spn') items.push('Продавцу — отправить список документов из вкладки «Клиенту» и объяснить, что ЕГРН нужна с ЭЦП.');
    if (d.buyerRepresentation === 'our_spn') items.push('Покупателю — отправить список документов и отдельно предупредить про банк/оценку/сертификаты, если они есть.');
    if (d.sellerRepresentation === 'external_agency' || d.buyerRepresentation === 'external_agency') items.push('Другому агентству — коротко запросить документы их стороны и согласовать, кто отвечает за исправления.');
    if (result.stop.length) items.push('Клиенту пока не отправлять обещания по дате. Формулировка: “Сначала проверим документы и согласуем безопасный порядок”.');
    if (!items.length) items.push('Используйте вкладку «Клиенту»: там только сообщения, которые можно отправлять клиентам без юридической технички.');
    return items;
  }

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
          <tr><th>Формат</th><td colspan="3">${esc(cooperationTitle(d))}</td></tr>
          <tr><th>Продавец</th><td>${esc(d.sellerSpn)}<br>${esc(d.sellerPhone || 'телефон не указан')}</td><th>Покупатель</th><td>${esc(d.buyerSpn)}<br>${esc(d.buyerPhone || 'телефон не указан')}</td></tr>
          <tr><th>Объект</th><td colspan="3">${esc(d.objectType)}<br>${esc(d.rightForm)}<br>${esc(d.address || 'адрес не указан')}<br>КН объекта: ${esc(d.cadObject || '—')}<br>КН земли: ${esc(d.cadLand || '—')}</td></tr>
        </table>
      </div>
      <div class="box blue"><h3>Стороны и деньги</h3>${financePartiesTable(d)}</div>
    `;
  }

  function renderNow(result) {
    const d = result.deal;
    const decision = spnDecision(result);
    $('now').innerHTML = `
      <h2>Рабочий результат для СПН</h2>
      <div class="box ${decision.cls}">
        <h3>${esc(decision.title)}</h3>
        <p>${esc(decision.text)}</p>
        <table>
          <tr><th>Формат сделки</th><td>${esc(cooperationTitle(d))}</td></tr>
          <tr><th>Готовность к задатку</th><td><b>${result.ready}%</b></td></tr>
          <tr><th>Кого подключить</th><td>${chips(result.to, result.cls)}</td></tr>
        </table>
      </div>

      <div class="metrics">
        <div class="metric ${decision.cls}"><b>${result.ready}%</b><span>готовность</span></div>
        <div class="metric"><b>${result.stop.length}</b><span>стоп-факторы</span></div>
        <div class="metric"><b>${result.warn.length}</b><span>предупреждения</span></div>
        <div class="metric"><b>${result.missing.length}</b><span>не хватает</span></div>
      </div>

      <div class="box blue">
        <h3>1. Что сделать сейчас</h3>
        ${list(result.actions)}
      </div>

      <div class="box orangeBox">
        <h3>2. Что собрать в первую очередь</h3>
        ${list(spnDocsPriority(result))}
      </div>

      <div class="box redBox">
        <h3>3. Что нельзя обещать клиенту</h3>
        ${list(spnWarnings(result))}
      </div>

      <div class="box greenBox">
        <h3>4. Что можно отправить / сказать клиенту</h3>
        ${list(spnCommunication(result))}
        <p class="small">Готовые тексты находятся во вкладке «Клиенту». Юридическую карточку клиенту не отправлять.</p>
      </div>

      <div class="box blue">
        <h3>5. Что уйдет юристу без засорения интерфейса СПН</h3>
        <p>Во вкладке «Юристу» автоматически собрана отдельная карточка: формат представительства, ответственные, объект, стороны, расчет, документы, стоп-факторы и вопросы. СПН не нужно вручную переписывать это в сообщение.</p>
      </div>
    `;
  }

  function renderLawyer(result) {
    const d = result.deal;
    const questions = legalQuestions(result);
    const riskBox = result.stop.length ? 'redBox' : result.warn.length || result.missing.length ? 'orangeBox' : 'greenBox';

    $('lawyerTab').innerHTML = `
      <h2>Карточка юристу</h2>

      <div class="box ${riskBox}">
        <h3>1. Что нужно решить юристу</h3>
        ${list(questions)}
      </div>

      <div class="box ${boxClass(result.cls)}">
        <h3>2. Предварительное решение системы</h3>
        <table>
          <tr><th>Можно ли брать задаток?</th><td><b>${esc(result.decision)}</b></td></tr>
          <tr><th>Стоп-факторы</th><td>${result.stop.length ? list(result.stop) : 'Стоп-факторы не выявлены'}</td></tr>
          <tr><th>Предупреждения</th><td>${result.warn.length ? list(result.warn) : 'Критичных предупреждений нет'}</td></tr>
          <tr><th>Не хватает</th><td>${result.missing.length ? list(result.missing) : 'Ключевые недостающие данные не выявлены'}</td></tr>
        </table>
      </div>

      <div class="box blue">
        <h3>3. Формат представительства и ответственные</h3>
        <table>
          <tr><th>Формат сделки</th><td colspan="3"><b>${esc(cooperationTitle(d))}</b></td></tr>
          <tr><th>Продавца представляет</th><td>${esc(representationText(d.sellerRepresentation))}<br>${d.sellerPartnerName ? 'Контакт/агент: ' + esc(d.sellerPartnerName) : ''}</td><th>Покупателя представляет</th><td>${esc(representationText(d.buyerRepresentation))}<br>${d.buyerPartnerName ? 'Контакт/агент: ' + esc(d.buyerPartnerName) : ''}</td></tr>
          <tr><th>СПН продавца</th><td>${esc(d.sellerSpn || '—')}<br>${esc(d.sellerPhone || 'телефон не указан')}</td><th>СПН покупателя</th><td>${esc(d.buyerSpn || '—')}<br>${esc(d.buyerPhone || 'телефон не указан')}</td></tr>
          <tr><th>Менеджер</th><td>${esc(d.manager || '—')}</td><th>Юрист</th><td>${esc(d.lawyer || '—')}</td></tr>
          <tr><th>Кому вернуть замечания</th><td colspan="3">${esc(d.preparationOwner || d.sellerSpn || d.buyerSpn || 'ответственный не указан')}<br><span class="small">Если ответственный не указан — вернуть замечания СПН, который передал карточку.</span></td></tr>
          <tr><th>Комментарий по взаимодействию</th><td colspan="3">${esc(d.teamComment || '—')}</td></tr>
        </table>
      </div>

      <div class="box blue">
        <h3>4. Объект и правовой режим</h3>
        <table>
          <tr><th>Тип объекта</th><td>${esc(d.objectType || '—')}</td><th>Форма права</th><td>${esc(d.rightForm || '—')}</td></tr>
          <tr><th>Адрес</th><td colspan="3">${esc(d.address || '—')}</td></tr>
          <tr><th>КН объекта</th><td>${yesNoProblem(d.cadObject)}</td><th>КН земли</th><td>${yesNoProblem(d.cadLand)}</td></tr>
          <tr><th>Что остается</th><td>${esc(d.included || '—')}</td><th>Что забирают</th><td>${esc(d.excluded || '—')}</td></tr>
          <tr><th>Освобождение / ключи</th><td colspan="3">${esc(d.releaseInfo || '—')}</td></tr>
        </table>
      </div>

      <div class="box blue">
        <h3>5. Стороны сделки</h3>
        <table>
          <tr><th>Продавцы</th><td>${esc(d.sellerCount || '—')}<br>${esc(d.sellerMainName || '')}</td><th>Покупатели</th><td>${esc(d.buyerCount || '—')}<br>${esc(d.buyerMainName || '')}</td></tr>
          <tr><th>Комментарий продавца</th><td colspan="3">${esc(d.sellerSideComment || '—')}</td></tr>
          <tr><th>Комментарий покупателя</th><td colspan="3">${esc(d.buyerSideComment || '—')}</td></tr>
        </table>
      </div>

      <div class="box ${priceMismatch(d) ? 'redBox' : 'blue'}">
        <h3>6. Цена, расчет и расходы, которые влияют на юридическую часть</h3>
        <table>
          <tr><th>Фактическая цена</th><td>${esc(d.priceFact || '—')}</td><th>Цена в договоре</th><td>${esc(d.priceContract || '—')}</td></tr>
          <tr><th>Комментарий по цене</th><td colspan="3">${esc(d.priceComment || '—')}</td></tr>
          <tr><th>Форма расчета</th><td colspan="3">${chips(d.payments, 'blue')} ${chips(d.certificates, 'orange')}<br>${esc(d.bankType || '—')}</td></tr>
          <tr><th>Комментарий банка / расчетов</th><td colspan="3">${esc(d.bankInfo || '—')}</td></tr>
          <tr><th>Нотариус</th><td>${esc(d.notaryCost || '—')}</td><th>Госпошлина / расходы</th><td>Право: ${esc(d.registrationFeeAmount || '—')}<br>Земля: ${esc(d.landRegistrationFeeAmount || '—')}<br>${esc(d.costsComment || '')}</td></tr>
        </table>
      </div>

      <div class="box blue">
        <h3>7. Документы и папка</h3>
        ${compactDocsStatus(d)}
      </div>

      <div class="box orangeBox">
        <h3>8. Вопросы СПН юристу</h3>
        <p>${esc(d.questions || 'Вопросы не указаны. Если есть сомнения — СПН должен сформулировать конкретный вопрос до задатка.')}</p>
      </div>
    `;
  }

  function renderBroker(result) {
    const d = result.deal;
    $('broker').innerHTML = `
      <h2>Карточка брокеру</h2>
      <div class="box ${result.stop.length ? 'redBox' : result.mortgage || result.sber ? 'orangeBox' : 'greenBox'}"><h3>${result.mortgage || result.sber ? 'Ипотечный сценарий требует проверки банка' : 'Ипотека не выбрана'}</h3></div>
      <table>
        <tr><th>Формат сделки</th><td>${esc(cooperationTitle(d))}</td></tr>
        <tr><th>Покупатель</th><td>${esc(d.buyerSpn)}<br>${esc(d.buyerPhone || '—')}<br>Покупателей: ${esc(d.buyerCount || '—')}<br>${esc(d.buyerMainName || '')}</td></tr>
        <tr><th>Объект</th><td>${esc(d.objectType)} / ${esc(d.rightForm)}<br>${esc(d.address || '—')}</td></tr>
        <tr><th>Банк</th><td>${esc(d.bankType)}</td></tr>
        <tr><th>Расходы банка</th><td>Оценка: ${esc(d.evaluationCost || '—')}<br>СБР: ${esc(d.sbrCost || '—')}<br>Страховка/банк: ${esc(d.bankInsuranceCost || '—')}</td></tr>
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
