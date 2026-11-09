const decode = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export function isLocalUrl(value) {
  try {
    const u=new URL(value), n=u.hostname.split('.').map(Number);
    return ['http:','https:'].includes(u.protocol) && !u.username && !u.password && !u.search && !u.hash && u.pathname==='/' &&
      /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) && n.every(x=>Number.isInteger(x)&&x>=0&&x<=255) &&
      (n[0]===10 || n[0]===192&&n[1]===168 || n[0]===172&&n[1]>=16&&n[1]<=31);
  } catch { return false; }
}
export async function verifyConnection(envelope, spki) {
  if (!envelope || typeof envelope.payload!=='string' || envelope.payload.length>16384 || typeof envelope.signature!=='string') throw new Error('Неверный файл подключения');
  const key=await crypto.subtle.importKey('spki',decode(spki),{name:'RSA-PSS',hash:'SHA-256'},false,['verify']);
  const raw=decode(envelope.payload);
  if(!await crypto.subtle.verify({name:'RSA-PSS',saltLength:32},key,decode(envelope.signature),raw)) throw new Error('Адрес сервера не прошёл проверку');
  const p=JSON.parse(new TextDecoder().decode(raw)), now=Date.now()/1000;
  if(p.format!=='billy-discovery/1' || typeof p.server_id!=='string' || !/^[a-zA-Z0-9-]{16,64}$/.test(p.server_id) ||
    !Number.isFinite(p.issued_at) || !Number.isFinite(p.expires_at) || typeof p.online!=='boolean' || p.issued_at>now+300 || p.expires_at<now || p.expires_at<p.issued_at || p.expires_at-p.issued_at>48*3600 ||
    !Array.isArray(p.lan_urls) || p.lan_urls.length>8 || !p.lan_urls.every(isLocalUrl) ||
    (p.public_url!=='' && !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(p.public_url))) throw new Error('Настройка подключения устарела или повреждена');
  return p;
}
export async function fetchConnection(settings) {
  const u=new URL(settings.config_url); u.searchParams.set('refresh',String(Date.now()));
  if(u.protocol!=='https:' || !['raw.githubusercontent.com','gist.githubusercontent.com'].includes(u.hostname)) throw new Error('Неизвестный источник настройки');
  const r=await fetch(u,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!r.ok) throw new Error('Не удалось получить актуальный адрес');
  return verifyConnection(await r.json(),settings.public_key_spki);
}
export async function probeConnection(url,serverId,timeout=2200) {
  try {
    const r=await fetch(url+'/api/health',{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(timeout)});
    const v=await r.json(); return r.ok && v.ok===true && v.name==='Billy Billy' && v.server_id===serverId;
  } catch { return false; }
}
export async function resolveConnection(payload, status=()=>{}) {
  status('Подключение к серверу…');
  const locals=await Promise.all(payload.lan_urls.map(async u=>(await probeConnection(u,payload.server_id))?u:null));
  const local=locals.find(Boolean);
  if(local) return {url:local,local:true};
  if(payload.online && payload.public_url && await probeConnection(payload.public_url,payload.server_id,7000)) return {url:payload.public_url,local:false};
  throw new Error('Сервер временно недоступен. Проверьте интернет и попробуйте позже.');
}
