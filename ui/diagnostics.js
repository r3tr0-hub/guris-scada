/* Recording is a backend service; this module only exports its history. */
(async()=>{
 'use strict';
 const root=document.querySelector('#guris-scada-demo'),status=document.querySelector('[data-diagnostic-status]');if(!root||!status)return;
 const i18n=window.SCADA_I18N;await(i18n?.ready||Promise.resolve());const t=(s,p=[])=>i18n?.t(s,p)||s.replace(/\{(\d+)\}/g,(_,n)=>p[n]??'');
 let busy=false;
 async function request(route,body,binary=false){const response=await fetch(route,{method:body===undefined?'GET':'POST',headers:{'X-SCADA-Token':window.SCADA_BOOT.token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});if(!response.ok){let error;try{error=await response.json();}catch{}throw Error(error?.message||t('Не удалось получить диагностику'));}return binary?response.arrayBuffer():response.json();}
 const buttons=[...document.querySelectorAll('[data-diagnostic-export]')];
 async function refresh(){if(busy||root.dataset.activePage!=='scada')return;try{const r=(await request('/api/diagnostics/status')).recorder;status.textContent=r.storageError||!r.running?t('Запись диагностики недоступна: {0}',[r.message||'—']):t('Диагностика записывается · сохранено: {0} · пропущено: {1}',[r.written,r.dropped]);status.dataset.warning=String(r.storageError||!r.running||r.dropped>0);}catch(e){status.textContent=e.message;}}
 async function download(hours){if(busy)return;busy=true;buttons.forEach(b=>b.disabled=true);try{
  await request('/api/diagnostics/client',{userAgent:navigator.userAgent.slice(0,500)});
  await request('/api/diagnostics/export',{hours});let jobId='';let job;
  for(;;){job=(await request('/api/diagnostics/status')).export;if(!jobId)jobId=job.id;if(job.id!==jobId)throw Error(t('Пакет изменился. Повторите выгрузку.'));if(job.state===3)throw Error(job.message);status.textContent=t('Подготовка пакета: {0}%',[job.progress]);if(job.state===2)break;await new Promise(resolve=>setTimeout(resolve,750));}
  const chunks=[];let offset=0;
  while(offset<job.size){const chunk=await request(`/api/diagnostics/chunk?id=${encodeURIComponent(jobId)}&offset=${offset}`,undefined,true);if(!chunk.byteLength||chunk.byteLength>job.size-offset)throw Error(t('Пакет прочитан не полностью'));chunks.push(chunk);offset+=chunk.byteLength;status.textContent=t('Скачивание пакета: {0}%',[Math.round(offset/job.size*100)]);}
  const blob=new Blob(chunks,{type:'application/zip'});if(blob.size!==job.size)throw Error(t('Пакет прочитан не полностью'));const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`GurisSCADA_Diagnostics_${hours}h_${new Date().toISOString().replace(/[:.]/g,'-')}.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);status.textContent=t('Диагностический пакет сохранён. Отправьте ZIP целиком.');
 }catch(e){status.textContent=e.message;status.dataset.warning='true';}finally{busy=false;buttons.forEach(b=>b.disabled=false);}}
 buttons.forEach(b=>b.addEventListener('click',()=>download(Number(b.dataset.diagnosticExport))));
 setInterval(refresh,3000);refresh();
})().catch(()=>{});
