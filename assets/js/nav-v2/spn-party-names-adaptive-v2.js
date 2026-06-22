const DRAFT_KEY = 'nav_deal_draft_v2';
let scheduled = false;
let observerStarted = false;

function readDraft(){try{return JSON.parse(localStorage.getItem(DRAFT_KEY)||'{}')}catch(_){return {}}}
function esc(v){return String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function field(key,label,placeholder=''){const d=readDraft();return `<div class="field"><label>${esc(label)}</label><input data-field="${esc(key)}" type="text" value="${esc(d[key]||'')}" placeholder="${esc(placeholder)}"></div>`}
function titlePreview(){const d=readDraft();return `${d.sellerName||'Продавец не указан'} / ${d.buyerName||'Покупатель не указан'} — ${d.address||'адрес не указан'}`}
function titleBlock(){return `<div class="status" data-party-title-preview="1"><b>Предпросмотр заголовка:</b><br>${esc(titlePreview())}</div>`}
function sellerBlock(){return `<div class="card" data-party-names-block="seller" style="box-shadow:none;margin-top:12px"><h3>ФИО продавца для заголовка сделки</h3><p class="muted" style="margin:4px 0 10px">Это поле будет основным в карточке сделки, задатке, кабинете юриста и поиске.</p><div class="grid"><div>${field('sellerName','ФИО продавца','Иванов Иван Иванович')}</div><div>${field('sellerPhone','Телефон продавца','')}</div></div>${titleBlock()}</div>`}
function buyerNote(){return `<div class="card" data-party-names-block="buyer" style="box-shadow:none;margin-top:12px"><h3>ФИО покупателя для заголовка сделки</h3><p class="muted" style="margin:4px 0 10px">Проверьте, что поле «Имя покупателя» заполнено как ФИО. Оно попадёт в основной заголовок сделки.</p>${titleBlock()}</div>`}
function findActiveCard(){return document.querySelector('#app section.card:last-of-type')||document.querySelector('#app .card')}
function activeHeading(){const card=findActiveCard();return card?.querySelector('h2')?.textContent?.trim()||''}
function insertSeller(card){if(!card||card.querySelector('[data-party-names-block="seller"]'))return;const target=card.querySelector('#adaptiveSellerStep p.muted')||card.querySelector('h2');if(target)target.insertAdjacentHTML('afterend',sellerBlock())}
function insertBuyer(card){if(!card||card.querySelector('[data-party-names-block="buyer"]'))return;const target=card.querySelector('#adaptiveBuyerStep .grid')||card.querySelector('h2');if(target)target.insertAdjacentHTML('afterend',buyerNote())}
function updatePreviews(){document.querySelectorAll('[data-party-title-preview]').forEach(el=>{el.innerHTML=`<b>Предпросмотр заголовка:</b><br>${esc(titlePreview())}`});const h=document.querySelector('#app h2');}
function improveFinishText(){const field=document.getElementById('adaptiveHandoffText')||document.getElementById('handoffText');if(!field)return;const d=readDraft();const current=String(field.value||'');if(current.includes('Заголовок сделки:'))return;field.value=['Заголовок сделки: '+titlePreview(),`Продавец: ${d.sellerName||'не указан'}`,`Покупатель: ${d.buyerName||'не указан'}`,`Телефон продавца: ${d.sellerPhone||'не указан'}`,`Телефон покупателя: ${d.buyerPhone||'не указан'}`,'',current].join('\n')}
function apply(){const card=findActiveCard();const heading=activeHeading();if(heading.startsWith('Продавец'))insertSeller(card);if(heading.startsWith('Покупатель'))insertBuyer(card);if(heading.startsWith('Итог'))improveFinishText();updatePreviews()}
function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;apply()},80)}
function startObserver(){if(observerStarted)return;const host=document.getElementById('app');if(!host)return;observerStarted=true;new MutationObserver(schedule).observe(host,{childList:true,subtree:true})}
let attempts=0;const timer=setInterval(()=>{attempts++;startObserver();apply();if(observerStarted&&attempts>=10)clearInterval(timer);if(attempts>=60)clearInterval(timer)},150);
document.addEventListener('input',schedule,true);
document.addEventListener('click',schedule,true);
window.addEventListener('storage',schedule);
