/* Engineering catalogs. The native host validates write authority and live metadata. */
window.SCADA_FUNCTIONALITY=(()=>{
'use strict';
const node=(tag,cls='',text='')=>{const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;};
function create(root,{api,t,I18n,getState,display,editable,requestWrite,requestCommand,navigate,openNumber,pageKey='functionality',catalogURL='/functionality.json',titleText='Функционал'}){
 const page=root.querySelector(`[data-page-content="${pageKey}"]`);if(!page)return null;
 const head=node('div','sc-functionality-head'),title=node('h3','',t(titleText)),back=node('button','sc-action',t('← Опции'));
 back.type='button';back.addEventListener('click',()=>navigate('options'));head.append(title,back);
 const hint=node('p','sc-node-detail',t('Нажмите название, чтобы прочитать описание. Инженер может изменять параметры независимо от состояния станка.'));
 const grid=node('div','sc-functionality-grid');grid.tabIndex=0;grid.setAttribute('aria-label',t(titleText));page.append(head,hint,grid);
 const overlay=node('div','sc-overlay sc-functionality-overlay');overlay.hidden=true;
 const dialog=node('section','sc-functionality-dialog');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby',`sc-${pageKey}-dialog-title`);
 const dialogHead=node('div','sc-functionality-head'),dialogTitle=node('h3'),close=node('button','sc-action',t('Закрыть'));dialogTitle.id=`sc-${pageKey}-dialog-title`;close.type='button';dialogHead.append(dialogTitle,close);
 const body=node('div','sc-functionality-description'),footer=node('div','sc-dialog-actions'),apply=node('button','sc-action sc-functionality-apply',t('Подтвердить изменение'));apply.type='button';apply.hidden=true;footer.append(apply);dialog.append(dialogHead,body,footer);overlay.append(dialog);root.querySelector('.sc-app').append(overlay);
 let parameters=[],rows=new Map(),currentPage='home',selection=null,restoreFocus=null,disposed=false,sections=[],section=null,wantedSection=null,heartbeat=null;
 const engineer=()=>getState()?.auth?.role==='engineer';
 const parameterName=p=>I18n.language==='tr'?p.original:t(p.label);
 const read=p=>p.sources?display(p.sources[String(display(p.selector))]):display(p.key);
 const canEdit=p=>Boolean(p&&engineer()&&!p.readOnly&&!p.command&&editable(p.key));
 const canCommand=p=>engineer()&&Boolean(getState()?.connected&&getState()?.commands?.[p.command]?.available&&!getState().busy&&!getState().quitting);
 const stateText=v=>v===null?t('Нет данных'):t(v===1?'ВКЛ':'ВЫКЛ');
 const format=(p,v)=>v===null?'—':p.format==='hex12'?(getState().fields[p.key]?.raw?.startsWith('00')?'—':Math.round(v).toString(16).toUpperCase().padStart(12,'0')):`${v.toLocaleString(I18n.locale,{maximumFractionDigits:3})}${p.unit?' '+t(p.unit):''}`;
 const kv=(label,value)=>{const row=node('div','sc-functionality-kv');row.append(node('span','',t(label)),node('strong','',value));body.append(row);};
 function hide(){const visible=!overlay.hidden;overlay.hidden=true;selection=null;if(visible&&restoreFocus?.isConnected)restoreFocus.focus();}
 function show(p,confirm=false){
  if(!engineer())return;const field=getState().fields[p.key];if(confirm&&!(p.command?canCommand(p):canEdit(p)))return;
  restoreFocus=document.activeElement;selection=confirm?{key:p.key,value:p.command?null:1-field.value,raw:field?.raw,epoch:getState().epoch,command:p.command}:null;
  dialogTitle.textContent=parameterName(p);body.replaceChildren();body.append(node('p','',t(p.description)));kv('Оригинальное имя HMI',p.original);kv('Переменная ПЛК',p.symbol);
  if(p.type==='BOOL')kv('Сейчас',stateText(read(p)));else{kv('Сейчас',format(p,read(p)));if(p.readOnly)kv('Показания ПЛК',t('Только чтение'));else if(p.format==='hex12')kv('Формат','12 · 0–9, A–F');else kv('Диапазон',field?`${field.min}…${field.max} ${t(p.unit||'')}`:'—');}
  if(p.choices)for(const [value,label] of Object.entries(p.choices))kv(value,t(label));
  if(p.legacy)body.append(node('p','sc-functionality-warning',t('Вариант старого HMI. Физическое действие не подтверждено по доступному Boot.')),node('p','sc-node-detail',t('Параметр доступен только для просмотра.')));
  if(confirm){kv(p.command?'Будет выполнено':'Будет установлено',p.command?parameterName(p):stateText(selection.value));if(p.safety||p.destructive)body.append(node('p','sc-functionality-warning',t(p.destructive?'Команда изменяет группу настроек ПЛК. Подтвердите выбранное действие.':'Меняется конфигурация контроля или останова. Проверьте соответствие установленному оборудованию.')));}
  apply.hidden=!confirm;apply.disabled=false;overlay.hidden=false;close.focus();
 }
 function beat(){if(api&&!disposed&&pageKey==='engineering'&&currentPage===pageKey&&section&&engineer()&&!document.hidden)api('/api/engineering-view',{section:section.id}).catch(()=>{});}
 function stopBeat(){clearInterval(heartbeat);heartbeat=null;}
 function startBeat(){stopBeat();beat();heartbeat=setInterval(beat,1000);}
 const hexOverlay=node('div','sc-overlay sc-engineering-hex-overlay');hexOverlay.hidden=true;
 const hexDialog=node('section','sc-functionality-dialog sc-engineering-hex');hexDialog.setAttribute('role','dialog');hexDialog.setAttribute('aria-modal','true');
 const hexTitle=node('h3'),hexInput=node('input','sc-engineering-hex-input');hexInput.readOnly=true;hexInput.autocomplete='off';hexInput.setAttribute('aria-label',t('Заводской код машины'));hexInput.maxLength=12;
 const hexKeys=node('div','sc-engineering-hex-keys'),hexError=node('p','sc-entry-error'),hexActions=node('div','sc-dialog-actions'),hexCancel=node('button','sc-action',t('Отмена')),hexApply=node('button','sc-action',t('Применить'));let hex=null;
 function hexKey(key){if(!hex)return;if(key==='⌫')hex.draft=hex.draft.slice(0,-1);else if(key==='Очистить')hex.draft='';else if(hex.draft.length<12)hex.draft+=key;hexInput.value=hex.draft;hexApply.disabled=!/^[0-9A-F]{12}$/.test(hex.draft);}
 for(const key of [...'0123456789ABCDEF','⌫','Очистить']){const b=node('button','sc-action',key);b.type='button';b.addEventListener('click',()=>hexKey(key));hexKeys.append(b);}
 hexCancel.type=hexApply.type='button';hexCancel.addEventListener('click',()=>{hex=null;hexOverlay.hidden=true;});
 hexApply.addEventListener('click',()=>{if(!hex||hexApply.disabled||!canEdit(hex.p))return;const f=getState().fields[hex.p.key];if(f.raw!==hex.raw||getState().epoch!==hex.epoch){hexError.textContent=t('Значение изменилось. Откройте ввод заново');return;}const h=hex;hex=null;hexOverlay.hidden=true;requestWrite(h.p.key,parseInt(h.draft,16),{raw:h.raw,epoch:h.epoch});});
 hexOverlay.addEventListener('keydown',e=>{if(!hex)return;if(e.key==='Escape'){hexCancel.click();e.preventDefault();}else if(e.key==='Backspace'){hexKey('⌫');e.preventDefault();}else if(/^[0-9a-f]$/i.test(e.key)){hexKey(e.key.toUpperCase());e.preventDefault();}else if(e.key==='Enter'&&!hexApply.disabled){hexApply.click();e.preventDefault();}});
 hexActions.append(hexCancel,hexApply);hexDialog.append(hexTitle,hexInput,hexKeys,hexError,hexActions);hexOverlay.append(hexDialog);root.querySelector('.sc-app').append(hexOverlay);
 function openValue(p){if(!canEdit(p))return;if(p.format!=='hex12'){openNumber(p.key);return;}const f=getState().fields[p.key];hex={p,raw:f.raw,epoch:getState().epoch,draft:''};hexTitle.textContent=parameterName(p);hexInput.value='';hexError.textContent='';hexApply.disabled=true;hexOverlay.hidden=false;hexInput.focus();}
 function render(){
  if(!engineer()){hide();hex=null;hexOverlay.hidden=true;stopBeat();if(currentPage===pageKey)navigate('menu');return;}if(currentPage!==pageKey&&overlay.hidden)return;
  for(const p of parameters){const binding=rows.get(p.key);if(!binding)continue;const {row,control}=binding,v=read(p);row.dataset.unknown=String(v===null);row.dataset.enabled=String(v===1);row.dataset.safetyBypass=String(p.symbol.endsWith('bEmniyetKapilarPasif')&&v===1);
   control.disabled=p.command?!canCommand(p):!canEdit(p);control.dataset.pending=String(getState().busy&&getState().operation?.key===p.key);if(p.command)control.textContent=t('Выполнить');else if(p.type==='BOOL'){control.setAttribute('aria-checked',String(v===1));control.textContent=stateText(v);}else control.textContent=format(p,v);
  }
  if(selection){const p=parameters.find(p=>p.key===selection.key),f=getState().fields[selection.key];apply.disabled=getState().epoch!==selection.epoch||(selection.command?!canCommand(p):!canEdit(p)||f?.raw!==selection.raw);}
 }
 close.addEventListener('click',hide);overlay.addEventListener('click',e=>{if(e.target===overlay)hide();});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();hide();}if(e.key==='Tab'){const buttons=[...dialog.querySelectorAll('button:not(:disabled):not([hidden])')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 apply.addEventListener('click',()=>{const operation=selection;if(!operation||apply.disabled||!engineer())return;hide();if(operation.command)requestCommand?.(operation.command);else requestWrite(operation.key,operation.value,{raw:operation.raw,epoch:operation.epoch});});
 function build(){
  hide();hex=null;hexOverlay.hidden=true;rows=new Map();grid.replaceChildren();
  function numeric(p,container,actual=false){
   const cell=node('div','sc-performance-cell'),caption=node(actual?'button':'span','sc-performance-caption',t(actual?'Факт':'Задание'));
   if(actual){cell.dataset[pageKey+'Key']=p.key;cell.dataset.readOnly='true';caption.type='button';caption.dataset[pageKey+'Help']=p.key;caption.dataset.engineeringHelp=p.key;caption.setAttribute('aria-label',t('Описание: {0}',[parameterName(p)]));caption.addEventListener('click',()=>show(p));}
   const control=node('button','sc-action sc-functionality-number '+(actual?'sc-performance-actual':'sc-performance-set'),'—');control.type='button';control.dataset[pageKey+'Control']=p.key;control.dataset.engineeringControl=p.key;control.setAttribute('aria-label',parameterName(p));control.disabled=true;
   if(actual)control.dataset.performanceReading=p.key;else control.addEventListener('click',()=>openValue(p));cell.append(caption,control);container.append(cell);rows.set(p.key,{row:cell,control});
  }
  const ordered=parameters.filter(p=>!p.pairedWith);if(section)ordered.sort((a,b)=>{const rank=p=>p.group==='Команды'?2:p.group==='Показания'?1:0;return rank(a)-rank(b)||(a.group||'Общие настройки').localeCompare(b.group||'Общие настройки',I18n.locale,{numeric:true});});let group=null;
  for(const p of ordered){
   if(section&&(p.group||'Общие настройки')!==group){group=p.group||'Общие настройки';grid.append(node('h4','sc-engineering-group',t(group)));}
   const row=node('div','sc-functionality-row');row.dataset[pageKey+'Key']=p.key;if(p.readOnly)row.dataset.readOnly='true';
   const name=node('button','sc-functionality-label'),label=node('strong','',parameterName(p)),original=node('small','',p.original);name.type='button';name.dataset[pageKey+'Help']=p.key;name.dataset.engineeringHelp=p.key;name.append(label,original);name.setAttribute('aria-label',t('Описание: {0}',[parameterName(p)]));name.addEventListener('click',()=>show(p));row.append(name);
   if(p.command){const control=node('button','sc-action',t('Выполнить'));control.type='button';control.dataset.engineeringControl=p.key;control.dataset.engineeringAction=p.command;control.addEventListener('click',()=>show(p,true));row.append(control);rows.set(p.key,{row,control});}
   else if(pageKey!=='functionality'&&p.type!=='BOOL'){const values=node('div','sc-performance-values');numeric(p,values,Boolean(p.readOnly));for(const actual of parameters.filter(v=>v.pairedWith===p.key)){numeric(actual,values,true);row.dataset.performancePair=actual.key;}row.append(values);}
   else{const control=node('button',p.type==='BOOL'?'sc-mode-switch sc-functionality-switch':'sc-action sc-functionality-number','—');control.type='button';control.dataset[pageKey+'Control']=p.key;control.dataset.engineeringControl=p.key;control.disabled=true;control.setAttribute('aria-label',parameterName(p));if(p.type==='BOOL'){control.setAttribute('role','switch');control.setAttribute('aria-checked','false');control.addEventListener('click',()=>show(p,true));}else control.addEventListener('click',()=>openValue(p));row.append(control);rows.set(p.key,{row,control});}
   grid.append(row);
  }grid.scrollTop=0;render();
 }
 function openSection(id){wantedSection=id;const next=sections.find(s=>s.id===id||s.original===id);if(!next)return;section=next;parameters=section.parameters;title.textContent=I18n.language==='tr'?section.original:I18n.language==='en'?section.en:t(section.title);build();if(currentPage===pageKey)startBeat();}
 fetch(catalogURL,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('catalog');return r.json();}).then(catalog=>{
  if(disposed)return;if(catalog.sections){sections=catalog.sections;for(const s of sections){const button=[...root.querySelectorAll('[data-engineering-section]')].find(b=>b.dataset.engineeringSection===s.original);if(button){button.replaceChildren(document.createTextNode(I18n.language==='tr'?s.original:I18n.language==='en'?s.en:t(s.title)));button.title=s.original;}}if(wantedSection)openSection(wantedSection);}else{parameters=catalog.parameters;build();}
 }).catch(()=>{if(!disposed)grid.append(node('p','sc-node-detail',t('Не удалось загрузить описание параметров.')));});
 return{render,openSection,setPage(next){const prev=currentPage;currentPage=next;if(next!==pageKey){hide();hex=null;hexOverlay.hidden=true;stopBeat();if(prev===pageKey&&pageKey==='engineering'&&engineer())api?.('/api/engineering-view',{section:''}).catch(()=>{});}else{if(pageKey==='engineering')startBeat();render();}},dispose(){disposed=true;stopBeat();hide();overlay.remove();hexOverlay.remove();}};
}
return{create};
})();
