/* Source-keyed gettext-style dictionaries. Add a JSON file and catalog entry for another language. */
window.SCADA_I18N=(()=>{
 'use strict';
 let language='ru',locale='ru-RU',decimal=',',languages=[],messages={},patterns=[];
 const token=window.SCADA_BOOT?.token;
 async function json(url,api=false){const response=await fetch(url,{cache:'no-store',credentials:'same-origin',headers:api?{'X-SCADA-Token':token}:{}});if(!response.ok)throw Error('Language data unavailable');return response.json();}
 function text(source){
  if(source===undefined||source===null)return source??'';source=String(source);
  if(Object.prototype.hasOwnProperty.call(messages,source))return messages[source];const normalized=source.replace(/\s+/g,' ').trim();if(Object.prototype.hasOwnProperty.call(messages,normalized))return source.match(/^\s*/)[0]+messages[normalized]+source.match(/\s*$/)[0];
  if(source.length>1600||!/[А-Яа-яЁё]/.test(source))return source;
  for(const entry of patterns){const match=entry.regex.exec(source);if(match)return fill(entry.translation,match.slice(1));}
  return source;
 }
 function fill(source,parameters){return String(source).replace(/\{(\d+)\}/g,(_,index)=>text(parameters[Number(index)]??''));}
 function t(source,parameters=[]){return fill(Object.prototype.hasOwnProperty.call(messages,source)?messages[source]:source,parameters);}
 function compile(){patterns=[];for(const [source,translation] of Object.entries(messages)){if(!/\{\d+\}/.test(source))continue;let expression='',offset=0;const slots=[];for(const match of source.matchAll(/\{(\d+)\}/g)){expression+=source.slice(offset,match.index).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([\\s\\S]*?)';slots.push(Number(match[1]));offset=match.index+match[0].length;}expression+=source.slice(offset).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(slots.some((slot,index)=>slot!==index))continue;patterns.push({regex:new RegExp('^'+expression+'$'),translation,weight:source.length-slots.length*3});}patterns.sort((a,b)=>b.weight-a.weight);}
 function bind(root){
  document.documentElement.lang=language;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){if(node.parentElement?.closest('script,style,[data-i18n-skip]'))continue;const raw=node.nodeValue,trim=raw.trim();if(!trim)continue;const translated=text(trim);if(translated!==trim)node.nodeValue=raw.replace(trim,translated);}
  for(const node of root.querySelectorAll('*'))if(!node.closest('[data-i18n-skip]'))for(const name of ['title','aria-label','aria-description','data-tooltip','placeholder','alt'])if(node.hasAttribute(name))node.setAttribute(name,text(node.getAttribute(name)));
  for(const node of root.querySelectorAll('[data-key=","]'))node.textContent=decimal;
  const current=languages.find(x=>x.code===language),flag=root.querySelector('[data-language-flag]');if(flag&&current){flag.src=current.flag;flag.alt=current.name;}
 }
 const ready=(async()=>{
  try{
   const [catalog,state]=await Promise.all([json('/locales/catalog.json'),json('/api/state',true)]);
   languages=catalog.languages.filter(x=>typeof x.code==='string'&&/^[a-zA-Z0-9_-]{2,18}$/.test(x.code)&&typeof x.flag==='string'&&/^\/assets\/flags\/[a-zA-Z0-9_-]+\.svg$/.test(x.flag));
   const selected=languages.find(x=>x.code===state.language)||languages.find(x=>x.code===catalog.default)||languages[0];
   if(selected){const dictionary=await json('/locales/'+selected.code+'.json');language=selected.code;locale=selected.locale;messages=dictionary.messages||{};decimal=new Intl.NumberFormat(locale).formatToParts(1.1).find(x=>x.type==='decimal')?.value||'.';compile();}
  }catch(error){console.warn('SCADA language fallback: Russian source text',error.message);}
 })();
 return {ready,t,text,bind,get language(){return language;},get locale(){return locale;},get decimal(){return decimal;},get languages(){return languages;},async change(code){if(!languages.some(x=>x.code===code))throw Error(text('Язык не найден'));await json('/locales/'+code+'.json');location.reload();}};
})();
