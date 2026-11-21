import {fetchConnection,resolveConnection} from './discovery-client.mjs?v=20261113-recovery';
const status=document.getElementById('status'), retry=document.getElementById('retry'), local=document.getElementById('local');
let settings;
async function connect(){
  retry.disabled=true; local.hidden=true; status.textContent='Подключение к серверу…';
  try{
    settings ||= await (await fetch('./site-config.json',{cache:'no-store'})).json();
    const payload=await fetchConnection(settings);
    if(payload.lan_urls[0]){ local.href=payload.lan_urls[0];local.hidden=false; }
    // Home Screen apps on Apple need HTTPS even when home Wi-Fi is available.
    // Keep the explicit LAN link for diagnostics without redirecting iOS to HTTP.
    const apple=/iPhone|iPad|iPod/.test(navigator.userAgent)||
      (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const result=await resolveConnection(apple?{...payload,lan_urls:[]}:payload,text=>status.textContent=text);
    const old=sessionStorage.getItem('billy-last-server');
    status.textContent=old&&old!==result.url?'Адрес сервера изменился. Подключаемся…':'Сервер доступен. Открываем обучение…';
    sessionStorage.setItem('billy-last-server',result.url);
    location.replace(result.url+'/');
  }catch(e){status.textContent=e.message||'Не удалось подключиться. Попробуйте ещё раз.';retry.disabled=false;}
}
retry.addEventListener('click',connect);connect();
