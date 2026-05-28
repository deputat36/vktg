(function(){
  if(window.__LeaderLeadsStable)return;
  window.__LeaderLeadsStable=true;
  var session=null, leads=[];
  function $(id){return document.getElementById(id)}
  function esc(s){return String(s==null?'':s).replace(/[&<>\"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]})}
  function dt(v){try{return v?new Date(v).toLocaleString('ru-RU'):'—'}catch(e){return v||'—'}}
  function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
  function timeout(p,ms,msg){return Promise.race([p,new Promise(function(_,rej){setTimeout(function(){rej(new Error(msg||'Превышено время ожидания'))},ms)})])}
  function setAuth(text,ok){var e=$('authState');if(e){e.textContent=text;e.className='auth-state '+(ok?'good':'warn')}}
  function hideLogin(){var f=$('authForm'),out=$('logoutBtn');if(f)f.classList.add('hidden');if(out)out.classList.remove('hidden');var b=$('loginBtn');if(b){b.disabled=false;b.textContent='Войти'}}
  function showLogin(){var f=$('authForm'),out=$('logoutBtn');if(f)f.classList.remove('hidden');if(out)out.classList.add('hidden');var b=$('loginBtn');if(b){b.disabled=false;b.textContent='Войти'}}
  function clearSession(){var p=['leader_session_v1','leader_','ofewxuqfjhamgerwzull-auth-token'];try{Object.keys(localStorage).forEach(function(k){if(p.some(function(x){return k.indexOf(x)>=0}))localStorage.removeItem(k)})}catch(e){}try{Object.keys(sessionStorage).forEach(function(k){if(p.some(function(x){return k.indexOf(x)>=0}))sessionStorage.removeItem(k)})}catch(e){}}
  function activateLeadsTab(){document.querySelectorAll('.tab').forEach(function(b){b.classList.toggle('active',b.dataset.page==='leads')});document.querySelectorAll('.page').forEach(function(p){p.classList.toggle('active',p.id==='leads')})}
  function statusBadge(s){return '<span class="badge">'+esc(s||'Новая')+'</span>'}
  function filtered(){var status=($('leadStatusFilter')&&$('leadStatusFilter').value)||'active';var src=($('leadSourceFilter')&&$('leadSourceFilter').value)||'Все';var q=(($('leadSearch')&&$('leadSearch').value)||'').toLowerCase();return leads.filter(function(l){var st=l.status||'Новая';if(status==='active'&&(st==='Спам'||st==='Создан заказ'||st==='Отказ'))return false;if(status!=='active'&&status!=='Все'&&st!==status)return false;if(src!=='Все'&&(l.source||'Не указан')!==src)return false;if(q){var hay=[l.name,l.phone,l.service,l.message,l.source,l.city].join(' ').toLowerCase();if(hay.indexOf(q)<0)return false}return true})}
  function fillSource(){var sel=$('leadSourceFilter');if(!sel)return;var old=sel.value||'Все';var set={'Все':1};leads.forEach(function(l){set[l.source||'Не указан']=1});sel.innerHTML=Object.keys(set).map(function(x){return '<option>'+esc(x)+'</option>'}).join('');sel.value=set[old]?old:'Все'}
  function renderStats(){var n=leads.filter(function(l){return (l.status||'Новая')==='Новая'}).length;var w=leads.filter(function(l){return (l.status||'')==='В работе'}).length;var wait=leads.filter(function(l){return ['Ждём ответ','КП отправлено','Уточнение деталей'].indexOf(l.status)>=0}).length;var conv=leads.filter(function(l){return (l.status||'')==='Создан заказ'}).length;if($('statNewLeads'))$('statNewLeads').textContent=n;if($('statWorkLeads'))$('statWorkLeads').textContent=w;if($('statWaitingLeads'))$('statWaitingLeads').textContent=wait;if($('statConvertedLeads'))$('statConvertedLeads').textContent=conv}
  function renderLeads(){var box=$('leadList');if(!box)return;var list=filtered();if(!list.length){box.innerHTML='<div class="empty">Заявки загружены, но по выбранным фильтрам ничего нет. Попробуйте выбрать «Все».</div>';renderStats();return}box.innerHTML=list.map(function(l){var phone=String(l.phone||'').replace(/[^\d+]/g,'');return '<article class="lead-card" data-id="'+esc(l.id)+'"><div><div class="lead-title">'+esc(l.name||'Без имени')+' '+statusBadge(l.status)+'</div><div class="meta">'+dt(l.created_at)+' • '+esc(l.source||'Источник не указан')+' • '+esc(l.service||'Услуга не указана')+'</div><div class="meta">Телефон: '+esc(l.phone||'—')+'</div>'+(l.message?'<div class="lead-message"><strong>Комментарий:</strong><br>'+esc(l.message)+'</div>':'')+'<div class="lead-client-actions">'+(phone?'<a href="tel:'+esc(phone)+'">Позвонить</a>':'')+'<a href="lead-view.html?id='+encodeURIComponent(l.id)+'" target="_blank" rel="noopener">Открыть v3</a></div></div><div class="lead-actions"><button data-stable-calc="'+esc(l.id)+'" class="primary">В расчёт</button></div></article>'}).join('');renderStats()}
  async function fetchLeads(){
    if(!window.db)throw new Error('Supabase не готов');
    setAuth('Вход выполнен. Загружаю заявки...',true);
    var r=await timeout(window.db.from('leader_leads').select('id,created_at,name,phone,source,service,message,status,lead_quality,estimated_amount,next_contact_at,page_url,budget,city,converted_order_id,converted_client_id').order('created_at',{ascending:false}).limit(50),12000,'Заявки не загрузились за 12 секунд');
    if(r.error)throw new Error(r.error.message);
    leads=r.data||[];
    try{window.state=window.state||{};window.state.leads=leads;window.state.leadsLoaded=true;window.state.crmReady=true}catch(e){}
    fillSource();renderLeads();renderStats();setAuth('CRM готова: '+((session&&session.user&&session.user.email)||'пользователь')+' • заявок: '+leads.length,true);
    activateLeadsTab();
    return leads;
  }
  async function check(){
    try{var r=await timeout(window.db.auth.getSession(),7000,'Проверка входа не ответила за 7 секунд');session=r.data&&r.data.session;if(session&&session.user){hideLogin();await fetchLeads();return true}showLogin();setAuth('Вход не выполнен. Введите email и пароль.',false);return false}catch(e){showLogin();setAuth('Вход не выполнен. Можно войти заново.',false);return false}
  }
  async function login(ev){
    if(ev){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation()}
    var email=($('loginEmail')&&$('loginEmail').value||'').trim(), pass=$('loginPassword')&&$('loginPassword').value||'';
    if(!email||!pass){alert('Введите email и пароль');return}
    var b=$('loginBtn');if(b){b.disabled=true;b.textContent='Вхожу...'}
    setAuth('Выполняю вход...',false);
    try{clearSession();await sleep(100);var r=await timeout(window.db.auth.signInWithPassword({email:email,password:pass}),25000,'Сервер входа не ответил за 25 секунд');if(r.error)throw new Error(r.error.message);session=r.data&&r.data.session;if(!session||!session.user)throw new Error('Сессия не получена');hideLogin();await fetchLeads()}
    catch(e){showLogin();setAuth('Ошибка входа: '+(e.message||e),false);alert(e.message||e)}
    finally{if(b){b.disabled=false;b.textContent='Войти'}}
  }
  async function logout(ev){if(ev){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation()}try{await timeout(window.db.auth.signOut(),7000,'Выход не ответил')}catch(e){}clearSession();session=null;leads=[];showLogin();setAuth('Сессия очищена. Войдите заново.',false);renderLeads();renderStats()}
  function bind(){var lb=$('loginBtn');if(lb){lb.addEventListener('click',login,true)}var lo=$('logoutBtn');if(lo){lo.addEventListener('click',logout,true)}document.addEventListener('click',function(ev){var t=ev.target;if(t&&t.id==='reloadLeadsBtn'){ev.preventDefault();fetchLeads().catch(function(e){alert(e.message||e)})}if(t&&t.id==='dashReloadBtn'){ev.preventDefault();fetchLeads().catch(function(e){alert(e.message||e)})}if(t&&t.dataset&&t.dataset.page){setTimeout(function(){if(t.dataset.page==='leads'&&session)fetchLeads().catch(function(){})},50)}},true);['leadStatusFilter','leadSourceFilter','leadSearch'].forEach(function(id){var x=$(id);if(x)x.addEventListener('input',renderLeads)});window.LeaderStableLeads={check:check,login:login,logout:logout,fetchLeads:fetchLeads,render:renderLeads};setTimeout(check,250)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
