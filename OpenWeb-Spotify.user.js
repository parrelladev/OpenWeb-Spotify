// ==UserScript==
// @name         OpenWeb Spotify
// @namespace    urn:openweb-spotify
// @version      0.1.0
// @description  Controles verificáveis, painel responsivo e Inspector local para Spotify Web.
// @match        https://open.spotify.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(()=>{
'use strict';
// module: settings
const defaults = Object.freeze({core:true,player:true,shuffle:true,privacy:true,adblock:true,responsive:true,inspector:true,diagnostics:false,ui:true,originalOrder:false,hidePromotions:false,shortcuts:false,keys:{play:'Alt+Shift+P',next:'Alt+Shift+N',previous:'Alt+Shift+B'}});
function validate(raw={}) { const s={...defaults,keys:{...defaults.keys}}; for(const k of Object.keys(defaults)) if(typeof defaults[k]==='boolean' && typeof raw[k]==='boolean')s[k]=raw[k]; for(const k of Object.keys(s.keys))if(typeof raw.keys?.[k]==='string' && /^(Alt\+Shift\+)[A-Z]$/.test(raw.keys[k]))s.keys[k]=raw.keys[k];return s; }
function settings(storage) {let value;try{value=validate(JSON.parse(storage.getItem('openweb-spotify:v1')||'{}'));}catch{value=validate();}return {get value(){return value;},set(patch){value=validate({...value,...patch});try{storage.setItem('openweb-spotify:v1',JSON.stringify(value));return true;}catch{return false;}}};}

// module: player
// Evidence: docs/dom-evidence.json. Only the global player is a command target.
const selectors={play:'[data-testid="control-button-playpause"]',next:'[data-testid="control-button-skip-forward"]',previous:'[data-testid="control-button-skip-back"]',repeat:'[data-testid="control-button-repeat"]',scope:'[data-testid="player-controls"]',widget:'[data-testid="now-playing-widget-v2"]',volume:'[data-testid="volume-bar"] input[type="range"]'};
const visible = el => !!el && !el.closest('[hidden],[inert],[aria-hidden="true"]') && el.getClientRects().length>0;
const disabled = el => !el || el.disabled || el.getAttribute('aria-disabled')==='true';
function shuffleState(el){
 if(!el)return 'missing';const label=(el.getAttribute('aria-label')||'').toLowerCase();
 // Action labels are stronger evidence than decorative classes. Never infer off from a generic label.
 if(/^(desativar|disable|turn off)\b/.test(label))return /smart|inteligente/.test(label)?'smart':'on';
 if(/^(ativar|enable|turn on)\b/.test(label) && /aleat|shuffle/.test(label) && !/smart|inteligente/.test(label))return 'off';
 for(const a of ['aria-checked','aria-pressed']){const v=el.getAttribute(a);if(v==='true')return /smart|inteligente/.test(label)?'smart':'on';if(v==='false')return 'off';}
 return 'unknown';
}
function player(doc){
 const find=key=>[...doc.querySelectorAll(selectors[key])].find(visible)||null;
 const shuffle=()=>{const root=find('scope');return root?[...root.querySelectorAll('button[aria-label]')].find(el=>visible(el)&&/shuffle|aleat/i.test(el.getAttribute('aria-label')))||null:null;};
 const control=key=>key==='shuffle'?shuffle():find(key);
 const snapshot=()=>{const b=shuffle(),v=find('volume'),r=find('repeat'),p=find('play');const w=find('widget');const text=sel=>w?.querySelector(sel)?.textContent?.trim()||null;
 return {shuffle:shuffleState(b),shuffleAvailable:!!b&&!disabled(b),playing:p?(/^(pause|pausar)$/i.test(p.getAttribute('aria-label')||'')?true:/^(play|reproduzir|tocar)$/i.test(p.getAttribute('aria-label')||'')?false:null):null,repeat:r?{checked:r.getAttribute('aria-checked'),label:r.getAttribute('aria-label')}:null,volume:v?Number(v.value):null,title:w?.querySelector('a')?.textContent?.trim()||null,artist:text('[data-testid="now-playing-widget-v2-byline"]'),album:doc.defaultView.navigator.mediaSession?.metadata?.title && doc.defaultView.navigator.mediaSession?.metadata?.title===w?.querySelector('a')?.textContent?.trim()?doc.defaultView.navigator.mediaSession.metadata.album||null:null};};
 return {control,snapshot,click(key){const el=control(key);if(!el||disabled(el))return false;el.click();return true;},setVolume(value){const el=find('volume');if(disabled(el)||!Number.isFinite(value))return false;const n=Math.min(Number(el.max||1),Math.max(Number(el.min||0),value));const setter=Object.getOwnPropertyDescriptor(doc.defaultView.HTMLInputElement.prototype,'value').set;setter.call(el,String(n));el.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));el.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));return true;}};
}

// module: shuffle
class Shuffle {
 constructor(player,notify,{wait=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now()}={}){this.player=player;this.notify=notify;this.wait=wait;this.now=now;this.busy=false;this.epoch=0;this.attempted=false;this.last=-Infinity;}
 reset(){this.epoch++;this.attempted=false;}
 async enforce(enabled){
 if(!enabled||this.busy)return;const s=this.player.snapshot();
 if(s.shuffle==='off'){this.notify('Shuffle desativado no player. A ordem da fila ainda depende do Spotify.');return;}
 if(s.shuffle==='missing'||!s.shuffleAvailable){this.notify('Shuffle indisponível: o player ou a conta não permite alterar agora.');return;}
 if(s.shuffle==='unknown'){this.notify('Estado de shuffle desconhecido. Abra o player e use o Inspector.');return;}
 if(this.attempted||this.now()-this.last<15000)return;
 this.attempted=true;this.last=this.now();this.busy=true;const epoch=this.epoch;
 try{for(let i=0;i<3;i++){
 if(epoch!==this.epoch||!this.enabled())return;
 const before=this.player.snapshot();if(before.shuffle==='off'){this.notify('Shuffle desativado e verificado no player.');return;}
 if(!['on','smart'].includes(before.shuffle)||!before.shuffleAvailable||!this.player.click('shuffle'))break;
 await this.wait(900);if(epoch!==this.epoch||!this.enabled())return;
 const after=this.player.snapshot();if(after.shuffle==='off'){this.notify('Shuffle desativado e verificado no player.');return;}
 // Continue a Smart Shuffle cycle only if a different, explicit active state appeared.
 if(after.shuffle===before.shuffle||!['on','smart'].includes(after.shuffle))break;
 }this.notify('Não foi possível confirmar a desativação. Use o controle nativo; pode haver restrição da conta ou do player.');
 }finally{this.busy=false;}}
 enabled(){return true;}
}

// module: privacy
// Strict allowlist: no DOM text, URLs, account IDs, error messages or stack traces in exports.
function sanitizeReport(data){return {schema:1,version:'0.1.0',viewport:{width:Number(data.viewport?.width)||0,height:Number(data.viewport?.height)||0,panelWidth:Number(data.viewport?.panelWidth)||0},route:['album','playlist','track','artist','home','other'].includes(data.route)?data.route:'other',state:{shuffle:['on','off','smart','unknown','missing'].includes(data.state?.shuffle)?data.state.shuffle:'unknown',shuffleAvailable:data.state?.shuffleAvailable===true,playing:typeof data.state?.playing==='boolean'?data.state.playing:null},controls:(data.controls||[]).slice(0,12).map(c=>({name:['play','next','previous','shuffle','repeat','volume'].includes(c.name)?c.name:'unknown',found:!!c.found,disabled:!!c.disabled,selector:typeof c.selector==='string'&&/^\[data-testid="[a-z-]+"\]( input\[type="range"\])?$/.test(c.selector)?c.selector:null,attributes:{checked:['true','false','mixed'].includes(c.attributes?.checked)?c.attributes.checked:null,pressed:['true','false','mixed'].includes(c.attributes?.pressed)?c.attributes.pressed:null}})),promotions:Math.max(0,Number(data.promotions)||0),errors:(data.errors||[]).slice(-30).map(e=>({module:['core','player','shuffle','ui','adblock','inspector','settings','responsive'].includes(e.module)?e.module:'core',code:['operation-failed','storage-unavailable'].includes(e.code)?e.code:'operation-failed'}))};}

// module: diagnostics
function diagnostics(enabled){const entries=[];return {record(module,code='operation-failed'){if(enabled())entries.push({module,code});if(entries.length>30)entries.shift();},get entries(){return entries.slice();}};}

// module: adblock
const promotionSelector='[data-testid="upgrade-button"]';
function adblock(doc){let hidden=new Map();return {count:()=>doc.querySelectorAll(promotionSelector).length,apply(enabled){if(!enabled){for(const [e,value] of hidden){if(value===null)e.removeAttribute('style');else e.setAttribute('style',value);}hidden.clear();return;}for(const e of doc.querySelectorAll(promotionSelector)){if(!hidden.has(e)){hidden.set(e,e.getAttribute('style'));e.style.setProperty('display','none','important');}}for(const e of hidden.keys())if(!e.isConnected)hidden.delete(e);}};}
// Hosts syntax parser for offline validation/conversion, not a browser network interceptor.
function parseHosts(text){const hosts=new Set(),rejected=[];for(const line of text.split(/\r?\n/)){const s=line.split('#')[0].trim();if(!s)continue;const [ip,...names]=s.split(/\s+/);if(!['0.0.0.0','127.0.0.1','::','::1'].includes(ip)||!names.length){rejected.push(s);continue;}for(const name of names){const h=name.toLowerCase();if(h.length<=253&&h.includes('.')&&h.split('.').every(x=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x))&&!/^\d+(\.\d+){3}$/.test(h)&&h!=='localhost')hosts.add(h);else rejected.push(name);}}return {hosts:[...hosts].sort(),rejected};}

// module: responsive
const css=`:host{all:initial;font:14px/1.5 system-ui,sans-serif;color:#eff3f5;position:fixed;z-index:2147483000;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));width:min(380px,calc(100vw - 24px));max-width:calc(100vw - 24px);color-scheme:dark}*{box-sizing:border-box;min-width:0}button,input,textarea{font:inherit}button,input[type=range]{min-height:44px}button{color:inherit;border:1px solid #4c5964;border-radius:10px;background:#26333e;padding:8px 12px;cursor:pointer}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #8adeef;outline-offset:2px}.panel{background:#101b25;border:1px solid #465564;border-radius:18px;padding:16px;box-shadow:0 10px 40px #0008;max-height:calc(100vh - 92px);max-height:calc(100dvh - 92px);overflow:auto;overflow-wrap:anywhere}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}h2{font-size:18px;margin:0;flex:1}p{margin:10px 0}label{display:flex;gap:8px;align-items:center;margin:8px 0}input[type=checkbox]{width:22px;height:22px;flex-shrink:0}input[type=text],textarea{width:100%;padding:8px;background:#182631;color:inherit;border:1px solid #526271;border-radius:8px}textarea{min-height:80px}small{color:#b0c5d1}summary{min-height:44px;cursor:pointer;padding-top:10px}[hidden]{display:none!important}#launcher{display:block;margin:0 0 8px auto;background:#183541}output{display:block} @media(max-width:420px){.panel{padding:12px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
function responsive(win,host,onResize){const measure=()=>onResize({width:win.innerWidth,height:win.innerHeight,panelWidth:Math.round(host.getBoundingClientRect().width)});const observer=win.ResizeObserver?new win.ResizeObserver(measure):null;observer?.observe(host);win.addEventListener('resize',measure);win.visualViewport?.addEventListener('resize',measure);measure();return ()=>{observer?.disconnect();win.removeEventListener('resize',measure);win.visualViewport?.removeEventListener('resize',measure);};}

// module: inspector
function routeKind(path){return path==='/'?'home':(['album','playlist','track','artist'].includes(path.replace(/^\/intl-[^/]+(?=\/|$)/,'').split('/')[1])?path.replace(/^\/intl-[^/]+(?=\/|$)/,'').split('/')[1]:'other');}
function inspect({player,viewport,path,ads,errors}){return sanitizeReport({viewport,route:routeKind(path),state:player.snapshot(),promotions:ads.count(),errors,controls:['play','next','previous','shuffle','repeat','volume'].map(name=>{const e=player.control(name);return {name,found:!!e,disabled:disabled(e),selector:name==='shuffle'?selectors.scope:selectors[name],attributes:{checked:e?.getAttribute('aria-checked'),pressed:e?.getAttribute('aria-pressed')}};})});}
function download(win,report){const blob=new win.Blob([JSON.stringify(report,null,2)],{type:'application/json'}),url=win.URL.createObjectURL(blob),a=win.document.createElement('a');a.href=url;a.download='OpenWeb-Inspector.json';a.click();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);}

// module: ui
function ui(doc,settings,onChange,onAction,onInspect){const host=doc.createElement('div');host.id='openweb-spotify';const root=host.attachShadow({mode:'open'});root.innerHTML=`<style>${css}</style><button id="launcher" aria-expanded="false" aria-controls="panel">OpenWeb Spotify</button><section id="panel" class="panel" aria-label="OpenWeb Spotify" hidden><div class="row"><h2>OpenWeb Spotify</h2><button id="close" aria-label="Fechar painel">Fechar</button></div><p id="track">Metadados indisponíveis</p><div class="grid" id="controls"></div><label>Volume <input id="volume" type="range" min="0" max="1" step="0.01" disabled></label><output id="state"></output><p id="status" role="status" aria-live="polite"></p><label><input type="checkbox" data-setting="originalOrder">Reprodução em ordem original</label><label><input type="checkbox" data-setting="hidePromotions">Ocultar promoção Premium</label><details><summary>Configurações e módulos</summary><div id="settings"></div><p><small>Atalhos: Alt+Shift+letra. Não são executados em campos de texto.</small></p><div id="keys"></div><p><small>Core/UI: desativar suspende o script até a reativação pelo botão abaixo. Settings permanece necessário para reativar.</small></p></details><details><summary>OpenWeb Inspector</summary><p>Coleta manual local. O JSON omite títulos, artistas, URLs, conta e mensagens de erros.</p><button id="inspect">Coletar relatório</button><button id="export" disabled>Exportar JSON</button><pre id="report" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details><button id="resume" hidden>Reativar Core e UI</button></section>`;
 const q=s=>root.querySelector(s);const buttons={};for(const [key,label] of Object.entries({previous:'Anterior',play:'Play/Pause',next:'Próxima',shuffle:'Alternar shuffle',repeat:'Repetir'})){const b=doc.createElement('button');b.textContent=label;b.onclick=()=>onAction(key);q('#controls').append(b);buttons[key]=b;}
 for(const key of ['core','player','shuffle','privacy','adblock','responsive','inspector','diagnostics','ui','shortcuts']){const l=doc.createElement('label'),c=doc.createElement('input');c.type='checkbox';c.dataset.setting=key;l.append(c,doc.createTextNode(key));q('#settings').append(l);}
 for(const key of ['play','next','previous']){const l=doc.createElement('label'),c=doc.createElement('input');c.type='text';c.value=settings.value.keys[key];c.setAttribute('aria-label','Atalho '+key);c.onchange=()=>{if(!/^Alt\+Shift\+[A-Z]$/.test(c.value)||Object.entries(settings.value.keys).some(([k,v])=>k!==key&&v===c.value)){c.value=settings.value.keys[key];return;}onChange({keys:{...settings.value.keys,[key]:c.value}});};l.append(doc.createTextNode(key),c);q('#keys').append(l);}
 const sync=()=>{for(const c of root.querySelectorAll('[data-setting]'))c.checked=settings.value[c.dataset.setting];q('#inspect').disabled=!settings.value.inspector;q('#resume').hidden=settings.value.core&&settings.value.ui;};
 for(const c of root.querySelectorAll('[data-setting]'))c.onchange=()=>{onChange({[c.dataset.setting]:c.checked});sync();};
 const toggle=open=>{q('#panel').hidden=!open;q('#launcher').setAttribute('aria-expanded',String(open));if(open)q('#close').focus();else q('#launcher').focus();};q('#launcher').onclick=()=>toggle(q('#panel').hidden);q('#close').onclick=()=>toggle(false);root.addEventListener('keydown',e=>{if(e.key==='Escape')toggle(false);});q('#resume').onclick=()=>{onChange({core:true,ui:true});sync();};q('#volume').onchange=e=>onAction('volume',Number(e.target.value));q('#inspect').onclick=()=>onInspect(false);q('#export').onclick=()=>onInspect(true);doc.body.append(host);sync();
 return {host,root,status(text){if(q('#status').textContent!==text)q('#status').textContent=text;},report(value){q('#report').textContent=JSON.stringify(value,null,2);q('#export').disabled=false;},invalidate(){q('#export').disabled=true;q('#report').textContent='';},render(s,p,active){sync();for(const [k,b] of Object.entries(buttons)){const e=active?p.control(k):null;b.disabled=!active||!settings.value.player||!e||e.disabled||e.getAttribute('aria-disabled')==='true';}q('#track').textContent=settings.value.privacy?'Privacidade: metadados ocultos neste painel.':([s.title,s.artist,s.album].filter(Boolean).join(' · ')||'Metadados indisponíveis');q('#state').textContent=`Shuffle: ${s.shuffle} · Reprodução: ${s.playing===true?'tocando':s.playing===false?'pausada':'desconhecida'} · Repetir: ${s.repeat?(s.repeat.label+' · marcado: '+(s.repeat.checked??'não exposto')):'indisponível'}`;const v=active?p.control('volume'):null;q('#volume').disabled=!active||!settings.value.player||!v||v.disabled;q('#volume').min=v?.min||'0';q('#volume').max=v?.max||'1';q('#volume').step=v?.step||'0.01';if(root.activeElement!==q('#volume')&&s.volume!==null)q('#volume').value=String(s.volume);},destroy(){host.remove();}};
}

// module: core
function start(win){
 const doc=win.document;if(doc.getElementById('openweb-spotify'))return null;
 let storage;try{storage=win.localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw Error();}};}
 const prefs=settings(storage),p=player(doc),ads=adblock(doc),log=diagnostics(()=>prefs.value.diagnostics);let view,timer,resizeStop=()=>{},viewport={},report=null,stopped=false,path=win.location.pathname,lastState='',lastRoute=win.location.href;
 const active=()=>prefs.value.core&&prefs.value.ui;
 const safe=(module,fn)=>{try{return fn();}catch{log.record(module);view?.status('Operação falhou; diagnóstico local disponível.');}};
 const sh=new Shuffle(p,t=>view?.status(t));sh.enabled=()=>active()&&prefs.value.player&&prefs.value.shuffle&&prefs.value.originalOrder;
 const refresh=()=>{timer=null;if(stopped)return;safe('core',()=>{
 if(lastRoute!==win.location.href){lastRoute=win.location.href;path=win.location.pathname;sh.reset();}
 ads.apply(active()&&prefs.value.adblock&&prefs.value.hidePromotions);
 const s=active()?p.snapshot():{shuffle:'unknown',playing:null,repeat:null,volume:null};lastState=JSON.stringify(s);view.render(s,p,active());
 if(sh.enabled())sh.enforce(true).catch(()=>log.record('shuffle'));
 });};
 const schedule=()=>{if(!timer&&!stopped)timer=win.setTimeout(refresh,250);};
 const change=patch=>{if(!prefs.set(patch))log.record('settings','storage-unavailable');sh.reset();if(!sh.enabled())sh.epoch++;report=null;view.invalidate();resizeStop();resizeStop=()=>{};if(active()&&prefs.value.responsive)resizeStop=responsive(win,view.host,v=>{viewport=v;});if(!active())view.status('Script suspenso. Reative Core e UI para continuar.');else if(!prefs.value.originalOrder)view.status('Preferência de ordem original desativada.');refresh();};
 view=ui(doc,prefs,change,(key,value)=>safe('player',()=>{if(!active()||!prefs.value.player)return;if(key==='shuffle'){prefs.set({originalOrder:false});sh.reset();}const before=JSON.stringify(p.snapshot());const ok=key==='volume'?p.setVolume(value):p.click(key);view.status(ok?'Comando enviado; aguardando estado do player.':'Controle indisponível ou restrito.');if(ok)win.setTimeout(()=>{if(!stopped){refresh();view.status(key==='volume'?'Volume solicitado; confirme o resultado no player nativo.':JSON.stringify(p.snapshot())!==before?'Estado observado no DOM mudou.':'O player não confirmou mudança observável; verifique o controle nativo.');}},1100);schedule();}),exporting=>safe('inspector',()=>{if(!active()||!prefs.value.inspector)return;if(exporting){if(report)download(win,report);return;}report=inspect({player:p,viewport:{width:win.innerWidth,height:win.innerHeight,...viewport},path,ads,errors:log.entries});view.report(report);}));
 if(active()&&prefs.value.responsive)resizeStop=responsive(win,view.host,v=>{viewport=v;});
 // Ignore our own shadow tree. Coalesce native UI mutations, never poll or patch Spotify internals.
 const observer=new win.MutationObserver(records=>{if(active()&&records.some(r=>r.target!==view.host&&!view.host.contains(r.target)))schedule();});observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-label','aria-checked','aria-pressed','aria-disabled','disabled','value','hidden','class'],characterData:true});
 const route=()=>schedule();const routeTimer=win.setInterval(()=>{if(lastRoute!==win.location.href)schedule();},1500);win.addEventListener('popstate',route);win.addEventListener('hashchange',route);const nav=win.navigation;nav?.addEventListener('navigatesuccess',route);
 const keydown=e=>{if(!active()||!prefs.value.player||!prefs.value.shortcuts||e.repeat||e.defaultPrevented||e.ctrlKey||e.metaKey||e.composedPath().some(x=>x?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(x?.tagName)))return;const chord=`${e.altKey?'Alt+':''}${e.shiftKey?'Shift+':''}${e.key.toUpperCase()}`;const key=Object.keys(prefs.value.keys).find(k=>prefs.value.keys[k]===chord);if(key&&p.click(key)){e.preventDefault();schedule();}};doc.addEventListener('keydown',keydown);
 // Native Media Session remains Spotify-owned; metadata can be absent and is never exported.
 refresh();return {prefs,player:p,view,refresh,get state(){return lastState;},stop(){stopped=true;sh.epoch++;observer.disconnect();resizeStop();win.clearTimeout(timer);win.clearInterval(routeTimer);ads.apply(false);doc.removeEventListener('keydown',keydown);win.removeEventListener('popstate',route);win.removeEventListener('hashchange',route);nav?.removeEventListener('navigatesuccess',route);view.destroy();}};
}

if(location.hostname==='open.spotify.com' && window.top===window.self)start(window);
})();
