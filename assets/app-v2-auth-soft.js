(function(){
  function $(id){return document.getElementById(id)}
  function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
  function timeout(p,ms,msg){return Promise.race([p,new Promise(function(_,rej){setTimeout(function(){rej(new Error(msg||'Превышено время ожидания'))},ms)})])}
  function setAuth(text,ok){try{var e=$('authState');if(e){e.textContent=text;e.className='auth-state '+(ok?'good':'warn')}}catch(x){}}
  function toast(text){try{if(typeof window.toast==='function')window.toast(text)}catch(x){}}
  function setAuthBusy(on,text){var b=$('loginBtn');if(b){b.disabled=!!on;b.textContent=on?(text||'Вхожу...'):'Войти'}}
  function hideLogin(){var f=$('authForm'),out=$('logoutBtn');if(f)f.classList.add('hidden');if(out)out.classList.remove('hidden')}
  function showLogin(){var f=$('authForm'),out=$('logoutBtn');if(f)f.classList.remove('hidden');if(out)out.classList.add('hidden')}
  function clearSession(){var p=['leader_session_v1','leader_','ofewxuqfjhamgerwzull-auth-token'];try{Object.keys(localStorage).forEach(function(k){if(p.some(function(x){return k.indexOf(x)>=0}))localStorage.removeItem(k)})}catch(e){}try{Object.keys(sessionStorage).forEach(function(k){if(p.some(function(x){return k.indexOf(x)>=0}))sessionStorage.removeItem(k)})}catch(e){}}
  function st(){try{return window.eval('state')}catch(e){return window.state||null}}
  async function directLoadLeads(){
    if(window.LeaderSpeedCore&&window.LeaderSpeedCore.loadCrmData){await window.LeaderSpeedCore.loadCrmData();return}
    var r=await timeout(window.db.from('leader_leads').select('id,created_at,name,phone,source,service,message,status,lead_quality,estimated_amount,next_contact_at,page_url,budget,city,converted_order_id,converted_client_id').order('created_at',{ascending:false}).limit(30),12000,'Заявки не загрузились за 12 секунд');
    if(r.error)throw new Error(r.error.message);
    var s=st();if(s){s.leads=r.data||[];s.leadsLoaded=true;s.crmReady=true}
    try{if(typeof window.fillSourceFilter==='function')window.fillSourceFilter()}catch(x){}
    try{if(typeof window.renderLeads==='function')window.renderLeads()}catch(x){}
    try{if(typeof window.renderDashboard==='function')window.renderDashboard()}catch(x){}
  }
  async function backgroundProfile(user){
    var s=st();
    try{var r=await timeout(window.db.from('leader_user_profiles').select('email,role,is_active,full_name').eq('user_id',user.id).maybeSingle(),4500,'Профиль не ответил быстро');if(!r.error&&r.data){if(s)s.profile=r.data;setAuth('CRM готова: '+(user.email||r.data.email||'пользователь')+(r.data.role?' • роль: '+r.data.role:''),true);return}}catch(e){}
    setAuth('CRM готова: '+(user.email||'пользователь')+' • профиль догрузится позже',true);
  }
  async function openBySession(session){
    if(!session||!session.user)throw new Error('Сессия не получена');
    var s=st();if(s){s.user=session.user;s.crmReady=true}
    hideLogin();
    setAuth('Вход выполнен. Загружаю заявки...',true);
    backgroundProfile(session.user);
    await directLoadLeads();
    setAuth('CRM готова: '+(session.user.email||'пользователь'),true);
  }
  async function softLogin(ev){
    if(ev){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation()}
    var email=($('loginEmail')&&$('loginEmail').value||'').trim();var password=$('loginPassword')&&$('loginPassword').value||'';
    if(!email||!password){alert('Введите email и пароль');return}
    setAuthBusy(true,'Вхожу...');setAuth('Выполняю вход...',false);
    try{clearSession();await sleep(100);var r=await timeout(window.db.auth.signInWithPassword({email:email,password:password}),25000,'Сервер входа не ответил за 25 секунд');if(r.error)throw new Error(r.error.message);await openBySession(r.data&&r.data.session);toast('Вход выполнен, заявки загружены')}
    catch(e){setAuth('Ошибка входа: '+(e.message||e),false);alert(e.message||e);showLogin()}
    finally{setAuthBusy(false)}
  }
  async function softCheck(){
    try{var r=await timeout(window.db.auth.getSession(),8000,'Проверка входа не ответила за 8 секунд');var session=r.data&&r.data.session;if(session&&session.user){await openBySession(session);return true}showLogin();setAuth('Вход не выполнен. Введите email и пароль.',false);return false}
    catch(e){showLogin();setAuth('Вход не выполнен. Можно войти заново.',false);return false}
  }
  async function softLogout(ev){
    if(ev){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation()}
    try{await timeout(window.db.auth.signOut(),8000,'Выход не ответил')}catch(e){}
    clearSession();var s=st();if(s){s.user=null;s.profile=null;s.crmReady=false;s.leads=[]}
    showLogin();setAuth('Сессия очищена. Введите email и пароль заново.',false);
    try{if(typeof window.renderLeads==='function')window.renderLeads()}catch(x){}
    try{if(typeof window.renderDashboard==='function')window.renderDashboard()}catch(x){}
  }
  function bind(){
    var login=$('loginBtn');if(login){login.onclick=null;login.addEventListener('click',softLogin,true)}
    var logout=$('logoutBtn');if(logout){logout.onclick=null;logout.addEventListener('click',softLogout,true)}
    var reset=$('resetAuthBtn');if(reset){reset.onclick=null;reset.addEventListener('click',softLogout,true)}
    window.login=softLogin;window.checkAuth=softCheck;window.loadCrmData=function(){return directLoadLeads()};
    setTimeout(softCheck,350);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
