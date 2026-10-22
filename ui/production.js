/* Local production workspace. Documents are data, never executable HTML. */
window.SCADA_PRODUCTION = (() => {
 'use strict';
 const NS='http://www.w3.org/2000/svg';
 function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
 function svgNode(tag,attrs,text){const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs||{}))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;}
 function create(root,{api,t,I18n,navigate,getState,getAlarm}){
  const page=root.querySelector('[data-page-content="production"]');
  if(!page)return null;
  page.innerHTML=`<div class="sc-prod-head"><h3>Производство</h3><span class="sc-prod-badge" data-prod-connection>Локальное хранение · сервер не подключён</span></div>
   <div class="sc-prod-tabs"><button type="button" data-prod-tab="jobs" aria-pressed="true">Задания</button><button type="button" data-prod-tab="history" aria-pressed="false">Работа и простои</button><div class="sc-prod-tools"><button class="sc-action" type="button" data-prod-import hidden>Загрузить задание</button><input type="file" accept=".json,application/json" data-prod-file hidden><button class="sc-action" type="button" data-prod-export>Выгрузить историю</button><button class="sc-action" type="button" data-prod-refresh>Обновить</button></div></div>
   <div class="sc-prod-error sc-prod-hidden" role="status" data-prod-error hidden></div>
   <div class="sc-prod-workspace sc-prod-hidden" data-prod-jobs><aside class="sc-prod-queue"><select data-prod-job-filter aria-label="Фильтр заданий"><option value="open">Очередь и выполняемые</option><option value="done">Завершённые</option><option value="all">Все задания</option></select><div class="sc-prod-job-list" data-prod-job-list tabindex="0" aria-label="Очередь заданий"></div><p class="sc-prod-caption" data-prod-queue-caption></p></aside><div class="sc-prod-detail" data-prod-detail></div></div>
   <div class="sc-prod-history sc-prod-hidden" data-prod-history hidden><div class="sc-prod-filters"><select data-prod-period aria-label="Период истории"><option value="today">Сегодня</option><option value="yesterday">Вчера</option><option value="24h">Последние 24 часа</option><option value="1h">Последний час</option><option value="15m">Последние 15 минут</option><option value="shift">Текущая смена · 08/20</option><option value="custom">Выбрать период</option></select><input class="sc-prod-hidden" data-prod-from type="datetime-local" aria-label="Начало периода" hidden><input class="sc-prod-hidden" data-prod-to type="datetime-local" aria-label="Конец периода" hidden><button class="sc-action sc-prod-hidden" type="button" data-prod-range-apply hidden>Показать</button><select data-prod-state-filter aria-label="Состояние линии"><option value="all">Все состояния</option><option value="work">Работа</option><option value="stop">Остановка</option><option value="manual">Ручной / референс</option><option value="unknown">Нет данных</option></select><select data-prod-history-job aria-label="Задание в истории"><option value="">Все задания</option></select></div><div class="sc-prod-totals" data-prod-totals></div><div class="sc-prod-shift-heading" data-prod-shift-heading hidden></div><div class="sc-prod-timeline-tools"><div><strong data-prod-window></strong><small>Увеличьте ленту и двигайте её пальцем</small></div><button class="sc-action" type="button" data-prod-zoom="-1" aria-label="Уменьшить ленту">−</button><button class="sc-action" type="button" data-prod-zoom="0">Весь период</button><button class="sc-action" type="button" data-prod-zoom="1" aria-label="Увеличить ленту">+</button><span data-prod-zoom-level></span></div><svg class="sc-prod-timeline" data-prod-timeline viewBox="0 0 960 64" role="img" tabindex="0" aria-label="Лента работы линии"></svg><div class="sc-prod-legend" data-prod-legend></div><p class="sc-prod-caption" data-prod-history-caption></p><div class="sc-prod-interval-list" data-prod-interval-list tabindex="0" aria-label="Периоды работы и остановок"></div><div class="sc-prod-pager"><span data-prod-page-info></span><button class="sc-action" type="button" data-prod-more>Ещё периоды</button></div></div>`;
  const jobsPage=root.querySelector('[data-page-content="jobs"]');
  const oldTabs=page.querySelector('.sc-prod-tabs'),importButton=page.querySelector('[data-prod-import]'),fileInput=page.querySelector('[data-prod-file]');
  jobsPage.innerHTML='<div class="sc-prod-head"><h3>Задания</h3><div class="sc-prod-tools"><button type="button" class="sc-action" data-page="home">← Главная</button></div></div><div class="sc-prod-error sc-prod-hidden" role="status" data-prod-job-error hidden></div>';
  const exportJob=node('button','sc-action',t('Выгрузить задание'));exportJob.type='button';exportJob.dataset.prodExportJob='';exportJob.hidden=true;
  jobsPage.querySelector('.sc-prod-tools').prepend(importButton,fileInput,exportJob);
  jobsPage.append(page.querySelector('[data-prod-jobs]'));
  const tools=page.querySelector('.sc-prod-tools');page.querySelector('.sc-prod-head').append(tools);oldTabs.remove();
  page.querySelector('[data-prod-history]').hidden=false;
  const $=s=>page.querySelector(s)||jobsPage.querySelector(s), $$=s=>[...page.querySelectorAll(s),...jobsPage.querySelectorAll(s)];
  let currentPage='home',tab='history',snapshot=null,selected='',section='product',detail=null,detailSerial=0,jobKey='',bodyKey='',queueKey='',historyKey='',historyOffset=0,historyTotal=0,historySerial=0;
  let timer=0,busy=false,actionBusy=false,disposed=false,historyDirty=false,modalAction=null,restoreFocus=null;
  const engineer=()=>getState()?.auth?.role==='engineer';
  let lastRole=null,view=null,baseRange=null,viewKey='',timelineData=[],historyRows=new Map(),loadingOlder=false,pan=null,panTimer=0;
  function resetHistory(resetView=true){historyRows.clear();historyOffset=0;historyKey='';historySerial++;if(resetView){view=null;viewKey='';}}

  const overlay=node('div','sc-prod-overlay sc-prod-hidden');overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','sc-prod-dialog-title');
  const dialog=node('div','sc-prod-dialog'),dialogHead=node('div','sc-prod-dialog-head'),dialogTitle=node('h4'),dialogClose=node('button','sc-action',t('Закрыть')),dialogBody=node('div','sc-prod-dialog-body'),dialogTools=node('div','sc-prod-dialog-tools');
  dialogTitle.id='sc-prod-dialog-title';dialogClose.type='button';dialogClose.dataset.prodClose='';dialogHead.append(dialogTitle,dialogClose);dialog.append(dialogHead,dialogBody,dialogTools);overlay.append(dialog);root.querySelector('.sc-app').append(overlay);
  const number=v=>v!==null&&v!==''&&Number.isFinite(Number(v))?Number(v).toLocaleString(I18n.locale):'—';
  const duration=ms=>{const n=Math.max(0,Math.floor(Number(ms||0)/1000)),h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;};
  const date=v=>new Date(v).toLocaleString(I18n.locale,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const time=v=>new Date(v).toLocaleTimeString(I18n.locale,{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const status=s=>t({queued:'В очереди',active:'Выполняется',paused:'Учёт приостановлен',done:'Завершено'}[s]||s);
  const state=k=>t({work:'Работа',stop:'Остановка',manual:'Ручной / референс',unknown:'Нет данных'}[k]||'Нет данных');
  const inputs=j=>j?.document?.spec?.inputs||{};
  const format=j=>{const s=inputs(j);return `${number(s.A)}×${number(s.B)}+${number(s.C)} · ${number(s.t)} ${t('мкм')}`;};
  function error(message=''){for(const e of $$('[data-prod-error],[data-prod-job-error]')){e.hidden=!message;e.textContent=message;}}
  function updateRole(){
   const role=engineer();$('[data-prod-import]').hidden=!role;$('[data-prod-export]').hidden=!role;$('[data-prod-export-job]').hidden=!role;
   $('[data-prod-import]').disabled=actionBusy||Boolean(snapshot?.storageError);
   if(role===lastRole)return;
   lastRole=role;page.dataset.prodRole=jobsPage.dataset.prodRole=role?'engineer':'operator';resetHistory();closeDialog();detail=null;selected='';jobKey=bodyKey=queueKey='';
   for(const selector of ['.sc-prod-filters','.sc-prod-interval-list','.sc-prod-pager'])$(selector).hidden=!role;
   $('[data-prod-shift-heading]').hidden=role;
   $('[data-prod-jobs]').hidden=false;$('[data-prod-history]').hidden=false;
   if(!role)$('[data-prod-interval-list]').replaceChildren();
   if(['production','jobs'].includes(currentPage)&&!busy)queueMicrotask(()=>refresh(true));
  }
  function empty(title,description){const e=node('div','sc-prod-empty');e.append(node('strong','',t(title)),node('span','',t(description)));return e;}
  function button(label,attribute,value,cls='sc-action'){const b=node('button',cls,t(label));b.type='button';b.dataset[attribute]=value;return b;}
  function kv(host,label,value){const row=node('div','sc-prod-kv');row.append(node('span','',t(label)),node('strong','',value===undefined||value===null||value===''?'—':String(value)));host.append(row);}
  function measured(value,unit){return value===undefined||value===null||value===''?'—':`${number(value)} ${t(unit)}`;}
  function boolean(value){return t(value===true||value===1?'Есть':'Нет');}
  function syncHome(){
   const j=snapshot?.jobs.find(j=>j.id===snapshot.currentJobId);
   root.querySelector('[data-production-current-name]').textContent=j?`${j.number} · ${format(j)}`:t('Задание не выбрано');
   root.querySelector('[data-production-current-description]').textContent=snapshot?.storageError?t('Ошибка сохранения истории'):j?`${status(j.status)} · ${number(j.produced)} / ${number(j.plan)}${j.uncertain?' · '+t('Учёт неполный'):''}`:t('Открыть производственные задания');
  }
  function drawQueue(){
   const jobs=snapshot?.jobs||[],filter=$('[data-prod-job-filter]').value;
   const key=JSON.stringify([jobs,filter,selected]);if(key===queueKey)return;queueKey=key;
   const list=$('[data-prod-job-list]'),scroll=list.scrollTop;list.replaceChildren();
   for(const j of jobs.filter(j=>filter==='all'||filter==='done'&&j.status==='done'||filter==='open'&&j.status!=='done')){
    const b=button('', 'prodJob',j.id,'sc-prod-job');b.setAttribute('aria-pressed',String(j.id===selected));const st=node('small','sc-prod-status',status(j.status));st.dataset.status=j.status;
    b.append(node('strong','',j.number),node('span','',format(j)),st,node('small','',`${number(j.produced)} / ${number(j.plan)}${j.uncertain?' · '+t('Учёт неполный'):''}`));list.append(b);
   }
   if(!list.childElementCount)list.append(jobs.length?empty(filter==='done'?'Нет завершённых заданий':'Нет заданий в очереди','Используйте фильтр, чтобы посмотреть остальные задания.'):empty('Заданий пока нет','Задания появятся после загрузки файла или подключения сервера.'));
   list.scrollTop=scroll;$('[data-prod-queue-caption]').textContent=t('Локальных заданий: {0}. Показано: {1}',[snapshot.totalJobs??jobs.length,list.querySelectorAll('[data-prod-job]').length]);
   const options=$('[data-prod-history-job]'),old=options.value;
   options.replaceChildren(new Option(t('Все задания'),''));for(const j of jobs)options.append(new Option(j.number,j.id));options.value=old;
  }
  function drawHeader(){
   const host=$('[data-prod-detail]'),j=snapshot?.jobs.find(j=>j.id===selected)||(detail?.id===selected?detail:null);
   if(!j){if(jobKey!=='empty'){host.replaceChildren(empty('Выберите задание','Здесь будут чертёж, требования к изделию, упаковка и ход выполнения.'));jobKey='empty';}return;}
   const key=JSON.stringify([j,section,actionBusy,engineer()]);if(key===jobKey)return;jobKey=key;
   if(!host.querySelector('[data-prod-body]')){
    host.replaceChildren();const head=node('div','sc-prod-detail-head'),titles=node('div');titles.append(node('h4'),node('p'));head.append(titles,button('История задания','prodJobHistory',''));host.append(head);
    const counts=node('div','sc-prod-counts');for(const label of ['План','Выпущено','Осталось']){const cell=node('div');cell.append(node('span','',t(label)),node('strong'));counts.append(cell);}host.append(counts);
    const track=node('div','sc-prod-progress');track.append(node('i'));host.append(track,node('p','sc-prod-uncertain'),node('div','sc-prod-actions'),node('div','sc-prod-card-tabs'));
    const body=node('div','sc-prod-body');body.dataset.prodBody='';body.tabIndex=0;host.append(body);bodyKey='';
   }
   host.querySelector('[data-prod-job-history]').hidden=!engineer();
   host.querySelector('h4').textContent=`${j.number} · ${format(j)}`;
   host.querySelector('.sc-prod-detail-head p').textContent=`${j.title} · ${status(j.status)} · ${t('ТЗ')} ${j.document?.spec?.id||'—'} / ${j.document?.spec?.revision||'—'}`;
   const values=[j.plan,j.produced,Math.max(0,j.plan-j.produced)];[...host.querySelectorAll('.sc-prod-counts strong')].forEach((e,i)=>e.textContent=number(values[i]));host.querySelector('.sc-prod-progress i').style.width=`${Math.min(100,j.produced/j.plan*100)}%`;
   const warning=host.querySelector('.sc-prod-uncertain');warning.hidden=!j.uncertain;warning.textContent=t('Учёт может быть неполным: был сброс, перезапуск или разрыв наблюдения. Показан подтверждённый выпуск.');
   const actions=host.querySelector('.sc-prod-actions');actions.replaceChildren();
   if(engineer()&&(j.status==='queued'||j.status==='paused'))actions.append(button(j.status==='paused'?'Продолжить учёт':'Начать задание','prodAction','start'));
   if(engineer()&&j.status==='active')actions.append(button('Приостановить учёт','prodAction','pause'));
   if(engineer()&&(j.status==='active'||j.status==='paused'))actions.append(button('Завершить задание','prodAction','finish'));
   for(const b of actions.querySelectorAll('button'))b.disabled=actionBusy||Boolean(snapshot.storageError)||b.dataset.prodAction==='start'&&snapshot.jobs.some(x=>x.status==='active');
   const tabs=host.querySelector('.sc-prod-card-tabs');tabs.replaceChildren();
   for(const [id,label] of [['product','Изделие'],['materials','Материалы'],['pack','Упаковка'],['pallet','Паллета'],['quality','Контроль'],['requirements','Требования']]){const b=button(label,'prodSection',id,'');b.setAttribute('aria-pressed',String(section===id));tabs.append(b);}
   drawBody();
  }
  function bagDrawing(s){
   const svg=svgNode('svg',{viewBox:'0 0 500 230',class:'sc-prod-drawing',role:'img','aria-label':t('Чертёж пакета')});
   const A=Number(s.A),B=Number(s.B),C=Number(s.C),scale=Math.min(300/Math.max(A,1),153/Math.max(B+C,1)),w=A*scale,body=B*scale,flap=C*scale,x=250-w/2,y=27;
   svg.append(svgNode('rect',{x,y,width:w,height:body+flap,rx:2,class:'sc-prod-film'}));
   if(C>0)svg.append(svgNode('path',{d:`M${x} ${y+flap}h${w}`,class:'sc-prod-dimension','stroke-dasharray':'4 4'}));
   const dimension=(a,b,c,d,label,tx,ty)=>{svg.append(svgNode('path',{d:`M${a} ${b}L${c} ${d}`,class:'sc-prod-dimension'}),svgNode('text',{x:tx,y:ty,'text-anchor':'middle'},label));};
   dimension(x,y+body+flap+18,x+w,y+body+flap+18,`A · ${number(A)} ${t('мм')}`,250,y+body+flap+36);
   dimension(x+w+18,y+flap,x+w+18,y+flap+body,`B · ${number(B)}`,x+w+62,y+flap+body/2);
   if(C>0)dimension(x-16,y,x-16,y+flap,`C · ${number(C)}`,x-56,y+flap/2+5);
   if(s.hasHole){const F=Number(s.F)||0,E=Number(s.E)||0,hx=s.holeX==='от правого края'?A-F:F,hy=s.holeY==='сверху'?E:B+C-E;if(hx>=0&&hx<=A&&hy>=0&&hy<=B+C)svg.append(svgNode('circle',{cx:x+hx*scale,cy:y+hy*scale,r:3,fill:'var(--sc-cyan)'}));}
   if(s.hasPrint){const pw=Number(s.I)||0,ph=Number(s.K)||0,px=s.printAlign==='по центру'?(A-pw)/2:Number(s.H)||0,py=B+C-(Number(s.G)||0)-ph;if(pw>0&&ph>0&&px>=0&&py>=0&&px+pw<=A&&py+ph<=B+C)svg.append(svgNode('rect',{x:x+px*scale,y:y+py*scale,width:pw*scale,height:ph*scale,fill:'none',stroke:'var(--sc-amber)','stroke-dasharray':'4 3'}));}
   return svg;
  }
  function palletDrawing(r){
   const svg=svgNode('svg',{viewBox:'0 0 500 230',class:'sc-prod-drawing',role:'img','aria-label':t('Схема яруса паллеты')});const groups=r?.lay?.best?.groups||[];const L=Number(r?.eff?.L),W=Number(r?.eff?.W);
   if(!groups.length||!(L>0&&W>0)){svg.append(svgNode('text',{x:250,y:110,'text-anchor':'middle'},t('Схема не приложена к заданию')));return svg;}
   const k=Math.min(390/L,170/W),ox=(500-L*k)/2,oy=18;svg.append(svgNode('rect',{x:ox,y:oy,width:L*k,height:W*k,fill:'none',stroke:'var(--sc-muted)'}));let count=0;
   for(const g of groups.slice(0,24))for(let x=0;x<Math.min(24,Number(g.nx)||0);x++)for(let y=0;y<Math.min(24,Number(g.ny)||0);y++){if(count++>400)continue;const a=ox+(Number(g.x)+x*Number(g.w))*k,b=oy+(Number(g.y)+y*Number(g.h))*k,w=Number(g.w)*k,h=Number(g.h)*k;if([a,b,w,h].every(Number.isFinite)&&w>0&&h>0)svg.append(svgNode('rect',{x:a+1,y:b+1,width:Math.max(0,w-2),height:Math.max(0,h-2),rx:2,fill:'var(--sc-panel)',stroke:'var(--sc-cyan)'}));}
   svg.append(svgNode('text',{x:250,y:216,'text-anchor':'middle'},t('Коробов в ярусе: {0}',[number(r.perLayer)])));return svg;
  }
  function drawBody(){
   const host=$('[data-prod-body]');if(!host)return;
   const key=`${selected}|${section}|${detail?.id||''}`;if(key===bodyKey)return;bodyKey=key;host.replaceChildren();
   if(!detail||detail.id!==selected){host.append(empty('Загрузка задания…',''));return;}
   const doc=detail.document||{},s=doc.spec?.inputs||{},r=doc.spec?.computed||{},sp=doc.spec?.display||{};
   if(section==='product'){
    host.append(bagDrawing(s));for(const [label,value] of [['Изделие',s.product],['Формат',format(detail)],['Цвет плёнки',s.color],['Карман',s.pocket],['Техническое отверстие',boolean(s.hasHole)],['Изображение',s.hasPrint?s.printType||t('По макету'):t('Нет')]])kv(host,label,value);
   }else if(section==='materials'){
    for(const [label,value] of [['Плёнка',s.color],['Толщина плёнки',measured(s.t,'мкм')],['Тип лайнера',s.linerType],['Ширина лайнера',measured(s.linerW,'мм')],['Клеевая полоса',measured(s.strip,'мм')],['Карман',s.pocket],['Сторона изображения',s.hasPrint?s.printSide:'—']])kv(host,label,value);
   }else if(section==='pack'){
    for(const [label,value] of [['В стопке',measured(s.stack,'шт.')],['Стопок в коробе',number(s.stacks)],['Всего в коробе',measured(r.perBox??(Number(s.stack)*Number(s.stacks)||null),'шт.')],['Упаковка стопок',s.stackPack],['Запечатать стопку',boolean(s.seal)],['Этикетка на стопке',boolean(s.stackLabel)],['Короб, внутренние размеры',[s.boxL,s.boxW,s.boxH].every(v=>v!==undefined)?`${number(s.boxL)}×${number(s.boxW)}×${number(s.boxH)} ${t('см')}`:'—'],['Этикетка на короб',s.labelName||s.labelTpl],['Место этикетки',s.labelMain],['Дополнительная этикетка',s.labelExtra]])kv(host,label,value);
   }else if(section==='pallet'){
    host.append(palletDrawing(r));for(const [label,value] of [['Поддон',`${number(s.palL)}×${number(s.palW)}×${number(s.palH)} ${t('см')}`],['Коробов на паллете',number(r.boxes)],['Ярусов',number(r.layers)],['Вес паллеты, расчётный',measured(r.palKg,'кг')],['Высота паллеты, расчётная',measured(r.palH,'см')],['Максимальный вес',measured(s.maxKg,'кг')],['Максимальная высота',measured(s.maxH,'см')],['Свес до 3 см',boolean(s.overhang)],['Стрейч-плёнка',s.wrap],['Слоёв обмотки',number(s.wrapLayers)],['Подмотка к поддону',boolean(s.wrapBottom)],['Уголки',boolean(s.corners)]])kv(host,label,value);
   }else if(section==='quality'){
    host.append(node('p','sc-prod-caption',t('Расчётные значения из утверждённой редакции ТЗ. Это не показания весов.')));
    if(Array.isArray(sp.wt)){for(const pair of sp.wt)if(Array.isArray(pair)&&pair.length===2)kv(host,pair[0],pair[1]);}
    else {kv(host,'Расчётный вес пакета',measured(r.bag?.total,'г'));kv(host,'Эталон пачки',measured(r.pack,'кг'));kv(host,'Норма',r.zone?`${number(r.zone.Q)}–${number(r.zone.R)} ${t('кг')}`:'—');kv(host,'Критичные границы',r.zone?`< ${number(r.zone.S)} / > ${number(r.zone.T)} ${t('кг')}`:'—');}
   }else{
    for(const [label,value] of [['ТЗ',doc.spec?.id],['Редакция',doc.spec?.revision],['Заказчик / проект',s.client],['Канал',s.channel],['Менеджер',s.manager],['Утверждает',s.approver],['Дата утверждения',s.approveDate],['Срок задания',doc.dueAt||'—'],['Иные требования',s.other]])kv(host,label,value);
    if(s.hasPrint)for(const [label,key] of [['От низа изображения, мм','G'],['От левого края, мм','H'],['Ширина изображения, мм','I'],['Высота изображения, мм','K']])kv(host,label,s[key]);
   }
   host.scrollTop=0;
  }
  async function openJob(id){
   if(!id||currentPage!=='jobs')return;selected=id;detail=null;bodyKey='';drawQueue();drawHeader();const serial=++detailSerial;
   try{const j=await api('/api/production/job/'+encodeURIComponent(id));if(serial!==detailSerial||currentPage!=='jobs')return;detail=j;drawBody();}catch(e){if(serial===detailSerial)error(e.message);}
  }
  function showTab(next){if(next==='jobs'){navigate('jobs');}else{navigate('production');resetHistory();}tab='history';refresh(true);}
  function range(){
   const preset=$('[data-prod-period]').value,now=new Date();let from,to;
   if(preset==='custom'){from=new Date($('[data-prod-from]').value).getTime();to=new Date($('[data-prod-to]').value).getTime();}
   else if(['24h','1h','15m'].includes(preset)){to=now.getTime();from=to-({"24h":86400000,"1h":3600000,"15m":900000}[preset]);}
   else if(preset==='shift'){const start=new Date(now);start.setHours(now.getHours()>=20?20:now.getHours()>=8?8:20,0,0,0);if(now.getHours()<8)start.setDate(start.getDate()-1);from=start.getTime();to=from+12*3600000;}
   else{const start=new Date(now);start.setHours(0,0,0,0);if(preset==='yesterday')start.setDate(start.getDate()-1);from=start.getTime();start.setDate(start.getDate()+1);to=start.getTime();}
   if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>31*86400000)throw Error(t('Выберите период от начала до конца, не более 31 дня.'));
   return {from,to};
  }
  function fitView(next){
   if(!baseRange)return null;
   const total=baseRange.to-baseRange.from,span=Math.min(total,Math.max(Math.min(60000,total),next.to-next.from));
   const from=Math.min(baseRange.to-span,Math.max(baseRange.from,next.from));return {from:Math.round(from),to:Math.round(from+span)};
  }
  function paintTimeline(){
   if(!view||!baseRange)return;
   const timeline=$('[data-prod-timeline]'),span=view.to-view.from;timeline.replaceChildren();
   timeline.dataset.viewFrom=String(view.from);timeline.dataset.viewTo=String(view.to);timeline.dataset.zoomed=String(span<baseRange.to-baseRange.from-1000);
   timeline.append(svgNode('rect',{x:0,y:8,width:960,height:30,'data-prod-state':'unknown',opacity:.18}));
   for(const [a,z,kind] of timelineData){
    const x=Math.max(0,(a-view.from)/span*960),end=Math.min(960,(z-view.from)/span*960);
    if(end>x){const k=!engineer()&&kind==='manual'?'stop':kind,rect=svgNode('rect',{x,y:8,width:Math.max(.5,end-x),height:30,'data-prod-state':k});rect.append(svgNode('title',{},`${state(k)} · ${time(a)}–${time(z)}`));timeline.append(rect);}
   }
   const now=snapshot?.now||Date.now();if(now>=view.from&&now<=view.to)timeline.append(svgNode('line',{x1:(now-view.from)/span*960,x2:(now-view.from)/span*960,y1:3,y2:40,stroke:'var(--sc-text)','stroke-width':1.5}));
   for(let i=0;i<5;i++){const at=view.from+span*i/4,opts=span>86400000?{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}:{hour:'2-digit',minute:'2-digit'};timeline.append(svgNode('text',{x:2+i*239,y:56,'text-anchor':i===0?'start':i===4?'end':'middle'},new Date(at).toLocaleString(I18n.locale,opts)));}
   const zoom=(baseRange.to-baseRange.from)/span;
   $('[data-prod-window]').textContent=`${date(view.from)} — ${date(view.to)}`;
   $('[data-prod-zoom-level]').textContent=`×${number(Math.round(zoom*10)/10)}`;
   $('[data-prod-zoom="-1"]').disabled=zoom<1.01;$('[data-prod-zoom="1"]').disabled=span<=Math.min(60000,baseRange.to-baseRange.from)+100;
   $('[data-prod-zoom="0"]').textContent=t(engineer()?'Весь период':'Вся смена');
  }
  function reloadView(){clearTimeout(panTimer);panTimer=0;drawHistory().catch(e=>error(e.message));}
  function zoomTimeline(direction){
   if(!view||!baseRange)return;
   const span=view.to-view.from,newSpan=direction===0?baseRange.to-baseRange.from:span*(direction>0?.5:2);
   let center=(view.from+view.to)/2;
   const now=snapshot?.now||Date.now();if(direction>0&&span>=baseRange.to-baseRange.from-1000&&now>=view.from&&now<=view.to)center=now;
   view=fitView({from:center-newSpan/2,to:center+newSpan/2});paintTimeline();reloadView();
  }
  async function drawHistory(force=false,older=false){
   const role=engineer();++historySerial;
   const r=role?range():null;
   const key=role?JSON.stringify([true,$('[data-prod-period]').value,$('[data-prod-from]').value,$('[data-prod-to]').value,$('[data-prod-state-filter]').value,$('[data-prod-history-job]').value]):'operator';
   if(key!==viewKey){resetHistory();viewKey=key;}
   /* resetHistory invalidates older requests, so capture this serial after reset. */
   const serial=historySerial;
   if(role){baseRange=r;view=fitView(view||r);}
   const full=role&&view&&Math.abs((view.to-view.from)-(r.to-r.from))<1000;
   if(full)view={...r};
   const offset=older?historyOffset+100:0;
   let route=role?`/api/production/history?from=${r.from}&to=${r.to}&kind=${$('[data-prod-state-filter]').value}&job=${encodeURIComponent($('[data-prod-history-job]').value)}&offset=${offset}`:'/api/production/shift';
   if(view)route+=`${route.includes('?')?'&':'?'}viewFrom=${view.from}&viewTo=${view.to}`;
   let data;
   try{data=await api(route);}catch(e){if(!role&&e.status===422){view=null;data=await api('/api/production/shift');}else throw e;}
   if(serial!==historySerial||currentPage!=='production'||tab!=='history'||role!==engineer())return;
   if(!role){
    const changed=baseRange?.from!==data.from||baseRange?.to!==data.to;baseRange={from:data.from,to:data.to};
    if(changed||!view)view={...baseRange};else view=fitView(view);
    const start=new Date(data.from),night=start.getHours()===20;
    $('[data-prod-shift-heading]').textContent=t(night?'Ночная смена · {0} — {1}':'Дневная смена · {0} — {1}',[date(data.from),date(data.to)]);
   }
   snapshot.now=data.now;timelineData=data.timeline;paintTimeline();
   const totals=$('[data-prod-totals]');totals.replaceChildren();
   const summary=role?['work','stop','manual','unknown'].map(k=>[k,data.totals[k]||0]):[['work',data.totals.work||0],['stop',(data.totals.stop||0)+(data.totals.manual||0)]];
   for(const [k,ms] of summary){const cell=node('div','sc-prod-total');cell.dataset.prodState=k;cell.append(node('span','',!role&&k==='stop'?t('Простой'):state(k)),node('strong','',duration(ms)));totals.append(cell);}
   const legend=$('[data-prod-legend]');legend.replaceChildren();for(const k of role?['work','stop','manual','unknown']:['work','stop','unknown']){const item=node('span','',!role&&k==='stop'?t('Простой'):state(k));item.dataset.prodState=k;legend.append(item);}
   if(!role){
    const elapsed=Math.max(0,Math.min(data.now,data.to)-data.from),known=(data.totals.work||0)+(data.totals.stop||0)+(data.totals.manual||0),unknown=Math.max(0,elapsed-known);
    $('[data-prod-history-caption]').textContent=t('Только текущая смена. Простой включает ручной режим. Нет данных: {0}.',[duration(unknown)]);return;
   }
   historyTotal=data.total;if(older)historyOffset=offset;
   for(const v of data.intervals)historyRows.set(v.id,v);
   const rows=[...historyRows.values()].sort((a,b)=>b.id-a.id),list=$('[data-prod-interval-list]'),rowKey=JSON.stringify(rows);
   if(rowKey!==historyKey||force){
    historyKey=rowKey;const scroll=list.scrollTop;list.replaceChildren();
    for(const v of rows){const b=button('','prodInterval',v.id,'sc-prod-interval');b.dataset.prodState=v.state;const st=node('span','',state(v.state));if(v.open)st.append(node('small','',t('Текущий период')));const times=node('span','',`${time(v.start)} — ${time(v.end)}`);times.append(node('small','',new Date(v.start).toLocaleDateString(I18n.locale)));const desc=node('span','',v.reason?t(v.reason):t(v.state==='stop'?'Причина не указана':'Открыть детализацию'));if(v.reasonSource==='automatic')desc.append(node('small','',t('Определено автоматически')));const j=snapshot.jobs.find(j=>j.id===v.jobId);if(j)desc.append(node('small','',j.number));b.append(st,times,node('strong','',duration(v.durationMs)),desc);list.append(b);}
    if(!rows.length)list.append(empty('За этот период записей нет','История появляется по мере работы SCADA.'));list.scrollTop=scroll;
   }
   $('[data-prod-history-caption]').textContent=t('Лента увеличивается кнопками + / − и прокручивается пальцем. Автоматические причины — предположение по авариям ПЛК.');
   $('[data-prod-page-info]').textContent=t('Показано периодов: {0} из {1}',[rows.length,data.total]);
   $('[data-prod-more]').hidden=rows.length>=data.total;$('[data-prod-more]').disabled=loadingOlder||rows.length>=2000;
   if(rows.length>=2000&&rows.length<data.total)$('[data-prod-page-info]').textContent=t('Показано 2000 периодов. Сократите период или используйте фильтр.');
  }
  async function loadOlder(){
   if(!engineer()||loadingOlder||historyRows.size>=historyTotal||historyRows.size>=2000)return;
   loadingOlder=true;$('[data-prod-more]').disabled=true;
   try{await drawHistory(false,true);}catch(e){error(e.message);}finally{loadingOlder=false;$('[data-prod-more]').disabled=historyRows.size>=2000;}
  }
  const timeline=$('[data-prod-timeline]');
  timeline.addEventListener('pointerdown',e=>{
   if(!view||!baseRange||e.button!==0||view.to-view.from>=baseRange.to-baseRange.from-1000)return;
   e.preventDefault();pan={id:e.pointerId,x:e.clientX,from:view.from,to:view.to,width:timeline.getBoundingClientRect().width};timeline.setPointerCapture(e.pointerId);
  });
  timeline.addEventListener('pointermove',e=>{
   if(!pan||pan.id!==e.pointerId)return;e.preventDefault();
   const delta=(e.clientX-pan.x)/Math.max(1,pan.width)*(pan.to-pan.from);view=fitView({from:pan.from-delta,to:pan.to-delta});paintTimeline();
   clearTimeout(panTimer);panTimer=setTimeout(reloadView,160);
  });
  const endPan=e=>{if(!pan||pan.id!==e.pointerId)return;pan=null;if(timeline.hasPointerCapture(e.pointerId))timeline.releasePointerCapture(e.pointerId);reloadView();};
  timeline.addEventListener('pointerup',endPan);timeline.addEventListener('pointercancel',endPan);
  timeline.addEventListener('keydown',e=>{if(!view||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const d=(view.to-view.from)*(e.key==='ArrowRight'?.25:-.25);view=fitView({from:view.from+d,to:view.to+d});paintTimeline();reloadView();});
  $('[data-prod-interval-list]').addEventListener('scroll',e=>{const list=e.currentTarget;if(list.scrollHeight>list.clientHeight+30&&list.scrollHeight-list.scrollTop-list.clientHeight<24)loadOlder();});
  function showDialog(title){restoreFocus=document.activeElement;dialogTitle.textContent=t(title);dialogBody.replaceChildren();dialogTools.replaceChildren();overlay.hidden=false;dialogClose.focus();}
  function closeDialog(){++detailSerial;overlay.hidden=true;modalAction=null;if(restoreFocus?.isConnected)restoreFocus.focus();}
  async function intervalDetail(id){
   if(!engineer())return;const serial=++detailSerial;try{const v=await api('/api/production/interval/'+id);if(serial!==detailSerial||!engineer()||currentPage!=='production')return;showDialog('Период работы линии');kv(dialogBody,'Состояние',state(v.state));kv(dialogBody,'Начало',date(v.start));kv(dialogBody,'Окончание',`${date(v.end)}${v.open?' · '+t('Текущий период'):''}`);kv(dialogBody,'Длительность',duration(v.durationMs));const job=snapshot?.jobs.find(j=>j.id===v.jobId);kv(dialogBody,'Задание',job?.number||t('Без задания'));kv(dialogBody,'Причина',v.reason?t(v.reason):t('Причина не указана'));if(v.reasonSource==='automatic'){kv(dialogBody,'Определено автоматически',t('Предположение по сигналу ПЛК · до следующего запуска'));kv(dialogBody,'Сигналы причины',(v.reasonAlarms||[]).join(', '));}kv(dialogBody,'Комментарий',v.comment||'—');if(v.author)kv(dialogBody,'Указал',`${v.author} · ${date(v.updatedAt)}`);
    const names={1:'ЗАДАНИЕ ВЫПОЛНЕНО',2:'АВАРИЙНАЯ ОСТАНОВКА',3:'НОЖ НЕ В РЕФЕРЕНСЕ',4:'АВТОМАТИЧЕСКАЯ РАБОТА',5:'МАШИНА ГОТОВА',6:'РУЧНОЕ ПЕРЕМЕЩЕНИЕ',7:'РАБОТА СИСТЕМЫ',8:'ЗАДАНИЕ ДОСТИГНУТО',9:'МАШИНА ГОТОВА',10:'КОНТРОЛЬ БЕЗОПАСНОСТИ',11:'РАЗБЛОКИРОВКА БЕЗОПАСНОСТИ',12:'ПОИСК РЕФЕРЕНСА',13:'МАШИНА НЕ ГОТОВА'};
    kv(dialogBody,'Состояние ПЛК',`${v.code} · ${t(names[v.code]||'Нет данных')}`);for(const id of v.alarms){const a=getAlarm(id);kv(dialogBody,'Сопутствующая авария',`${id} · ${a?.[({ru:'RUS',en:'ENG',tr:'TUR'}[I18n.language]||'RUS')]||a?.ENG||t('Неизвестная авария')}`);}dialogBody.append(node('p','sc-prod-caption',t('Причины и комментарии вводятся с отдельного ПК после подключения сервера.')));
   }catch(e){error(e.message);}
  }
  function confirmAction(action){if(!engineer())return;const j=snapshot?.jobs.find(j=>j.id===selected);if(!j||actionBusy)return;showDialog(action==='start'?'Начать учёт задания?':action==='pause'?'Приостановить учёт задания?':'Завершить задание?');modalAction={id:j.id,action,operationId:crypto.randomUUID()};dialogBody.append(node('p','',`${j.number} · ${format(j)}`),node('p','',`${t('План')}: ${number(j.plan)} · ${t('Выпущено')}: ${number(j.produced)}`),node('p','sc-prod-caption',t('Это действие меняет учёт задания. Линия продолжает работать в своём режиме.')));if(action==='finish'&&j.produced<j.plan)dialogBody.append(node('p','sc-prod-uncertain',t('План ещё не выполнен. Задание будет закрыто с текущим выпуском.')));dialogTools.append(button('Отмена','prodClose',''),button('Подтвердить','prodConfirm',''));}
  async function applyAction(){if(!engineer()||!modalAction||actionBusy)return;const operation=modalAction;actionBusy=true;error();for(const b of dialogTools.querySelectorAll('button'))b.disabled=true;drawHeader();try{await api('/api/production/action',operation);closeDialog();await refresh(true);}catch(e){error(e.message);dialogBody.append(node('p','sc-prod-uncertain',e.message));}finally{actionBusy=false;for(const b of dialogTools.querySelectorAll('button'))b.disabled=false;drawHeader();}}
  async function importFile(file){if(!engineer()||!file)return;actionBusy=true;updateRole();error();try{if(file.size>131072)throw Error(t('Файл задания должен быть не больше 128 КБ.'));const payload=JSON.parse(await file.text());await api('/api/production/import',payload);selected=payload.id;detail=null;bodyKey='';tab='jobs';showTab('jobs');await refresh(true);await openJob(selected);}catch(e){error(e instanceof SyntaxError?t('Не удалось прочитать JSON задания.'):e.message);}finally{actionBusy=false;$('[data-prod-file]').value='';updateRole();drawHeader();}}
  async function exportHistory(){
   if(!engineer()||actionBusy)return;actionBusy=true;error();$('[data-prod-export]').disabled=true;
   try{
    const r=range(),events=[];let after=0,data;
    do{data=await api(`/api/production/export?after=${after}&from=${r.from}&to=${r.to}`);events.push(...data.events);if(data.nextAfter<=after)break;after=data.nextAfter;}while(data.hasMore);
    const history=[];let offset=0,h;
    do{h=await api(`/api/production/history?from=${r.from}&to=${r.to}&kind=all&offset=${offset}`);history.push(...h.intervals);offset+=100;}while(offset<h.total);
    const ids=new Set(history.map(x=>x.jobId).filter(Boolean));for(const e of events)if(e.kind==='job.imported')ids.add(e.payload.id);
    const jobs=[];for(const id of ids)jobs.push(await api('/api/production/job/'+encodeURIComponent(id)));
    if(!engineer())return;
    const payload={schemaVersion:1,machineId:snapshot.machineId,exportedAt:new Date().toISOString(),period:r,events,intervals:history,jobs};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='SCADA_Production_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   }catch(e){error(e.message);}finally{actionBusy=false;$('[data-prod-export]').disabled=false;}
  }
  async function exportJobDocument(){
   if(!engineer()||!selected||actionBusy)return;actionBusy=true;
   try{const job=await api('/api/production/job/'+encodeURIComponent(selected));if(!engineer()||currentPage!=='jobs')return;const blob=new Blob([JSON.stringify(job.document,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='SCADA_Job_'+job.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){error(e.message);}finally{actionBusy=false;}
  }
  function schedule(){clearTimeout(timer);if(!disposed&&(['production','jobs','home'].includes(currentPage)))timer=setTimeout(()=>refresh(),1000);}
  async function refresh(force=false){
   if(busy||document.hidden){schedule();return;}busy=true;
   try{const role=engineer(),data=await api('/api/production');if(role!==engineer())return;snapshot=data;syncHome();updateRole();if(snapshot.storageError)error(t('Ошибка сохранения истории')+': '+snapshot.message);else if(force)error();
    if(currentPage==='jobs'){if(!selected)selected=snapshot.currentJobId||snapshot.jobs.find(j=>j.status!=='done')?.id||snapshot.jobs[0]?.id||'';drawQueue();drawHeader();if(selected&&(!detail||detail.id!==selected))await openJob(selected);}
    if(currentPage==='production')await drawHistory(force);
   }catch(e){if(['production','jobs'].includes(currentPage))error(e.message);root.querySelector('[data-production-current-description]').textContent=t('История производства недоступна');}
   finally{busy=false;schedule();}
  }
  root.addEventListener('click',e=>{
   const b=e.target.closest('button');if(!b||b.disabled)return;
   if(b.hasAttribute('data-production-home')){navigate('jobs');if(snapshot?.currentJobId)openJob(snapshot.currentJobId);}
   else if(b.hasAttribute('data-production-history')){navigate('production');showTab('history');}
   else if(b.dataset.prodTab)showTab(b.dataset.prodTab);
   else if(b.dataset.prodJob)openJob(b.dataset.prodJob);
   else if(b.dataset.prodSection){section=b.dataset.prodSection;bodyKey='';jobKey='';drawHeader();}
   else if(b.dataset.prodAction)confirmAction(b.dataset.prodAction);
   else if(b.hasAttribute('data-prod-confirm'))applyAction();
   else if(b.hasAttribute('data-prod-close'))closeDialog();
   else if(b.hasAttribute('data-prod-import'))$('[data-prod-file]').click();
   else if(b.hasAttribute('data-prod-export'))exportHistory();
   else if(b.hasAttribute('data-prod-export-job'))exportJobDocument();
   else if(b.hasAttribute('data-prod-refresh')){resetHistory(false);refresh(true);}
   else if(b.dataset.prodInterval)intervalDetail(b.dataset.prodInterval);
   else if(b.hasAttribute('data-prod-more'))loadOlder();
   else if(b.hasAttribute('data-prod-zoom'))zoomTimeline(Number(b.dataset.prodZoom));
   else if(b.hasAttribute('data-prod-range-apply')){resetHistory();drawHistory(true).catch(e=>error(e.message));}
   else if(b.hasAttribute('data-prod-job-history')&&engineer()){showTab('history');$('[data-prod-history-job]').value=selected;$('[data-prod-period]').value='custom';const j=snapshot.jobs.find(j=>j.id===selected);const start=Math.max(j.startedAt||j.createdAt,Date.now()-30*86400000);const setLocal=(target,ms)=>{const d=new Date(ms);target.value=new Date(ms-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};setLocal($('[data-prod-from]'),start);setLocal($('[data-prod-to]'),Math.max(Date.now()+60000,start+60000));toggleCustom();drawHistory(true).catch(e=>error(e.message));}
  });
  function toggleCustom(){const custom=engineer()&&$('[data-prod-period]').value==='custom';for(const selector of ['[data-prod-from]','[data-prod-to]','[data-prod-range-apply]'])$(selector).hidden=!custom;}
  const onChange=e=>{
   if(e.target.matches('[data-prod-file]'))importFile(e.target.files[0]);
   else if(e.target.matches('[data-prod-job-filter]')){queueKey='';drawQueue();}
   else if(e.target.matches('[data-prod-period],[data-prod-state-filter],[data-prod-history-job]')){toggleCustom();resetHistory();drawHistory(true).catch(e=>error(e.message));}
  };
  page.addEventListener('change',onChange);jobsPage.addEventListener('change',onChange);
  overlay.addEventListener('keydown',e=>{if(e.key==='Escape'&&!actionBusy){e.preventDefault();closeDialog();}if(e.key==='Tab'){const buttons=[...dialog.querySelectorAll('button:not(:disabled)')];if(!buttons.length)return;const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  const now=new Date(),local=new Date(now.getTime()-now.getTimezoneOffset()*60000);$('[data-prod-to]').value=local.toISOString().slice(0,16);$('[data-prod-from]').value=new Date(local.getTime()-86400000).toISOString().slice(0,16);
  I18n.bind(page);I18n.bind(jobsPage);I18n.bind(overlay);
  return {setPage(next){currentPage=next;closeDialog();if(['production','jobs','home'].includes(next))refresh();else clearTimeout(timer);},updateRole,dispose(){disposed=true;clearTimeout(timer);clearTimeout(panTimer);overlay.remove();}};
 }
 return {create};
})();
