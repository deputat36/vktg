import { getDeal } from '../ui/form.js';

function get(id){return document.getElementById(id)}
function loadStylesheet(){
  if(document.querySelector('link[href="./assets/css/field-optimizer.css"]')) return;
  const link=document.createElement('link'); link.rel='stylesheet'; link.href='./assets/css/field-optimizer.css'; document.head.appendChild(link);
}
function labelOf(id){const el=get(id); return el ? el.closest('label') : null}
function sectionByTitle(text){return [...document.querySelectorAll('aside.panel.left section')].find(s=>s.textContent.includes(text))}
function addHint(id, html, badge=''){const label=labelOf(id); if(!label || label.dataset.optimized) return; label.dataset.optimized='1'; const old=label.childNodes[0]?.textContent?.trim()||''; const control=label.querySelector('input,select,textarea'); const title=document.createElement('div'); title.className='field-label-row'; title.innerHTML=`<span>${old}</span>${badge?`<span class="field-badge ${badge.cls||''}">${badge.text}</span>`:''}`; if(label.childNodes[0]?.nodeType===3) label.childNodes[0].textContent=''; label.insertBefore(title, control); const hint=document.createElement('span'); hint.className='field-hint'; hint.innerHTML=html; label.appendChild(hint)}
function addSectionNote(section, id, html, cls=''){if(!section || document.getElementById(id)) return; const div=document.createElement('div'); div.id=id; div.className='section-context-note '+cls; div.innerHTML=html; section.insertBefore(div, section.children[1]||null)}
function setHidden(id, hidden){const label=labelOf(id); if(label) label.classList.toggle('field-hidden-by-context', hidden)}
function mark(id, type){const label=labelOf(id); if(!label) return; label.classList.remove('field-critical','field-stop'); if(type==='critical') label.classList.add('field-critical'); if(type==='stop') label.classList.add('field-stop')}
function checked(name){return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(x=>x.value)}
function hasText(id){return !!String(get(id)?.value||'').trim()}
function objectIsLand(d){return /дом|зем|снт|дача/i.test(d.objectType||'')}
function objectIsShare(d){return /доля/i.test(d.rightForm||'')}
function isMortgage(d){return (d.payments||[]).includes('mortgage') || /сбер|банк|ипот/i.test(d.bankType||'')}
function isCertificate(d){return (d.certificates||[]).length>0}
function hasOtherAgency(d){return d.sellerRepresentation==='external_agency'||d.buyerRepresentation==='external_agency'||d.representationModel==='external_agency'}

function setupStaticHints(){
  addHint('stage','Выберите реальный этап. Для задатка система покажет, что нельзя пропустить до передачи денег.',{text:'влияет на риск',cls:'orange'});
  addHint('sellerSpn','Кто отвечает за продавца и документы продавца. Если мы не ведем продавца — укажите формат сделки выше.',{text:'кому задачи',cls:'blue'});
  addHint('buyerSpn','Кто отвечает за покупателя, деньги, банк и сертификаты. При ипотеке это ключевой контакт для брокера.',{text:'кому задачи',cls:'blue'});
  addHint('sellerPhone','Нужен минимум один контакт стороны продавца или ответственного агента, чтобы быстро закрывать документы.',{text:'минимум',cls:'green'});
  addHint('buyerPhone','Нужен минимум один контакт покупателя/СПН покупателя, особенно при ипотеке и сертификатах.',{text:'минимум',cls:'green'});
  addHint('sellerCount','Важно для юриста: каждый собственник должен участвовать лично/по доверенности, либо нужно объяснение.',{text:'юрист',cls:'orange'});
  addHint('buyerCount','Важно для договора, банка, долей покупки, маткапитала и будущего состава собственников.',{text:'банк/договор',cls:'orange'});
  addHint('sellerSideComment','Запишите всё, что может повлиять на сделку: супруг, наследство, доверенность, несовершеннолетние, доли, банкротство, проживающие.',{text:'риски',cls:'red'});
  addHint('buyerSideComment','Запишите ипотеку, сертификаты, маткапитал, несколько покупателей, супругов, источник денег и особые сроки.',{text:'риски',cls:'orange'});
  addHint('objectType','От типа объекта зависят банк, маткапитал, нотариус, земля, регистрация и список документов.',{text:'ключевое',cls:'red'});
  addHint('rightForm','Если продается доля — обычная схема может не подойти: возможен нотариус, ППП и ограничения по ипотеке.',{text:'стоп',cls:'red'});
  addHint('cadObject','Для квартиры/дома нужен кадастровый номер объекта. Для дома + земля отдельно нужен кадастровый номер участка.',{text:'ЕГРН',cls:'orange'});
  addHint('cadLand','Обязательно для дома, участка, СНТ. По нему проверяем границы в НСПД, ВРИ и категорию земли.',{text:'земля',cls:'red'});
  addHint('priceFact','Реальная цена договоренности. Нужна для контроля комиссии, задатка, банка и рисков.',{text:'деньги',cls:'orange'});
  addHint('priceContract','Если отличается от фактической — обязательно пояснить. Завышение/занижение может быть риском для банка, юриста и сторон.',{text:'риск',cls:'red'});
  addHint('releaseInfo','Когда освобождают объект, кто проживает, когда передаются ключи. Это нужно фиксировать до задатка.',{text:'задаток',cls:'orange'});
  addHint('registrationFeeAmount','Ориентир: 4000 ₽ за регистрацию права. В МФЦ лучше иметь деньги на карте; при необходимости дадут квитанцию.',{text:'расход',cls:'green'});
  addHint('landRegistrationFeeAmount','Ориентир по участку: 700 ₽. Показывать только если есть земля/дом/СНТ.',{text:'земля',cls:'green'});
  addHint('evaluationCost','Ориентир: квартира 3–5 тыс. ₽, дом 6–9 тыс. ₽. Нужна при ипотеке.',{text:'банк',cls:'orange'});
  addHint('sbrCost','СБР в Сбере сейчас ориентир 3400 ₽. Уточнить, кто платит и нужен ли именно этот способ расчета.',{text:'Сбер',cls:'orange'});
  addHint('bankInsuranceCost','Услуги банка и страховки нужно объяснить клиенту: что обязательно, от чего можно отказаться, что влияет на ставку.',{text:'банк',cls:'orange'});
  addHint('bankType','Если Сбер/Домклик — документы загружаются в Домклик, менеджеры банка могут предлагать платные услуги.',{text:'маршрут',cls:'blue'});
  addHint('bankInfo','Запишите: одобрение у Татьяны Стерликовой или самостоятельно, статус Домклика, оценка, СБР, услуги банка, дату сделки.',{text:'брокер',cls:'orange'});
  addHint('stEgrn','Для банка и нотариуса нужна не просто PDF-выписка, а полный комплект файлов с ЭЦП: PDF + XML + SIG/архив.',{text:'обязательно',cls:'red'});
  addHint('stRegistered','Справка о зарегистрированных нужна практически всегда. Ее можно получить через Госуслуги/МФЦ/уполномоченный орган.',{text:'обязательно',cls:'red'});
  addHint('folderLink','Документы лучше хранить в отдельной папке Яндекс Диска: каждый документ отдельным файлом, в названии фамилия + что за документ.',{text:'юрист',cls:'blue'});
  addHint('questions','Пишите юристу конкретно: что продаем, кто собственники, что смущает, какие документы не хватает, какой дедлайн.',{text:'ускоряет',cls:'green'});
}

function quickButtons(){
  const docSec=sectionByTitle('Документы');
  if(docSec && !document.getElementById('docQuickButtons')){
    const row=document.createElement('div'); row.id='docQuickButtons'; row.className='field-quick-row';
    row.innerHTML='<button type="button" data-doc-preset="requested">Запрошено</button><button type="button" data-doc-preset="ready">Получено</button><button type="button" data-doc-preset="checked">Проверено</button>';
    docSec.appendChild(row);
    row.querySelectorAll('[data-doc-preset]').forEach(btn=>btn.onclick=()=>{
      const v=btn.dataset.docPreset==='requested'?'запрошено':btn.dataset.docPreset==='ready'?'получено':'проверено';
      ['stEgrn','stRegistered'].forEach(id=>{if(get(id)) get(id).value=v});
      refreshContext();
    });
  }
}

function refreshContext(){
  const d=getDeal();
  const objSec=sectionByTitle('Объект'); const financeSec=sectionByTitle('Финансы'); const condSec=sectionByTitle('Основания'); const docSec=sectionByTitle('Документы'); const partiesSec=sectionByTitle('Стороны сделки');
  [objSec,financeSec,condSec,docSec,partiesSec].forEach(sec=>sec&&sec.classList.remove('field-section-priority','field-section-risk','field-section-stop'));
  if(objectIsShare(d)){ objSec?.classList.add('field-section-stop'); mark('rightForm','stop'); } else mark('rightForm','');
  if(objectIsLand(d)){ objSec?.classList.add('field-section-risk'); mark('cadLand','stop'); setHidden('landRegistrationFeeAmount',false); } else { mark('cadLand',''); setHidden('landRegistrationFeeAmount',true); }
  if(isMortgage(d)){ financeSec?.classList.add('field-section-risk'); condSec?.classList.add('field-section-risk'); setHidden('evaluationCost',false); setHidden('sbrCost',!/сбер/i.test(d.bankType||'')); setHidden('bankInsuranceCost',false); mark('bankInfo','critical'); } else { setHidden('evaluationCost',true); setHidden('sbrCost',true); setHidden('bankInsuranceCost',true); mark('bankInfo',''); }
  if(isCertificate(d)){ condSec?.classList.add('field-section-stop'); mark('buyerSideComment','critical'); }
  if(hasOtherAgency(d)){ partiesSec?.classList.add('field-section-risk'); mark('teamComment','critical'); }
  if(d.priceFact && d.priceContract && String(d.priceFact).replace(/\D/g,'')!==String(d.priceContract).replace(/\D/g,'')){ mark('priceContract','stop'); mark('priceComment','stop'); } else { mark('priceContract',''); mark('priceComment',''); }
  if(!hasText('folderLink')) mark('folderLink','critical'); else mark('folderLink','');
  if(d.stEgrn!=='получено' && d.stEgrn!=='проверено') mark('stEgrn','critical'); else mark('stEgrn','');
  if(d.stRegistered!=='получено' && d.stRegistered!=='проверено') mark('stRegistered','critical'); else mark('stRegistered','');
  updateGuide(d);
}

function updateGuide(d){
  const sec=sectionByTitle('Основное'); if(!sec) return;
  let guide=document.getElementById('fieldContextGuide');
  if(!guide){ guide=document.createElement('div'); guide.id='fieldContextGuide'; guide.className='field-guide'; sec.insertAdjacentElement('afterend',guide); }
  const items=[];
  items.push('Для СПН главное: быстро понять, можно ли брать задаток, что собрать и кому передать вопрос.');
  if(objectIsShare(d)) items.push('Доля: до задатка нужна проверка юриста. Возможен нотариус, преимущественное право покупки и ограничения по ипотеке.');
  if(objectIsLand(d)) items.push('Дом/земля/СНТ: нужен кадастровый номер участка, проверка границ в НСПД, ВРИ и категории земли.');
  if(isMortgage(d)) items.push('Ипотека: заранее готовьте документы для банка, оценку, ЕГРН с ЭЦП и папку с отдельными файлами.');
  if(isCertificate(d)) items.push('Сертификаты: до задатка уточнить остаток, сроки, требования к объекту и порядок перечисления.');
  if(hasOtherAgency(d)) items.push('Другое агентство/самостоятельная сторона: зафиксируйте, кто собирает документы и кто отвечает за согласование условий.');
  if(d.priceFact && d.priceContract && String(d.priceFact).replace(/\D/g,'')!==String(d.priceContract).replace(/\D/g,'')) items.push('Цена в договоре отличается от фактической: обязательно поясните причину и передайте юристу/банку до задатка.');
  guide.innerHTML=`<h3>🧭 Подсказка по подробным полям</h3><ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul><div class="field-impact"><div class="mini"><b>Юрист</b><span>получит только структурированную карточку и вопросы</span></div><div class="mini"><b>СПН</b><span>видит, какие поля реально влияют на риск</span></div><div class="mini"><b>Брокер</b><span>видит банк, оценку, сертификаты и документы</span></div></div>`;
}

function addNotes(){
  addSectionNote(sectionByTitle('Объект'),'objectSectionNote','Заполняйте объект так, чтобы юрист сразу понял правовой режим: МКД/частный сектор/дом+земля/доля/СНТ. От этого зависит банк, нотариус и список документов.','');
  addSectionNote(sectionByTitle('Финансы'),'financeSectionNote','Финансы нужны не для отчетности, а чтобы до задатка согласовать расходы, комиссию, госпошлину, оценку, СБР и платные услуги банка.','');
  addSectionNote(sectionByTitle('Основания'),'conditionSectionNote','Основания, расчет и особенности — главный блок для выявления запретов. Отмечайте только то, что реально есть в сделке.','');
  addSectionNote(sectionByTitle('Документы'),'docsSectionNote','Не обязательно сразу иметь все документы. Главное — отметить статус и дать ссылку на папку, чтобы юрист не искал файлы по перепискам.','');
}

function start(){
  loadStylesheet(); setupStaticHints(); addNotes(); quickButtons(); refreshContext();
  document.addEventListener('input', refreshContext); document.addEventListener('change', refreshContext);
}
let attempts=0; const timer=setInterval(()=>{attempts++; if(document.querySelector('aside.panel.left')&&get('objectType')&&get('stEgrn')){clearInterval(timer); start()} if(attempts>60) clearInterval(timer)},200);
