/* Operator knife page. All writes use the shared editor/native validation. */
window.SCADA_KNIFE=(()=>{
 'use strict';
 const definitions={
  jawOffset:{title:'Смещение синхронизации ножа',original:'Ofset',description:'Фазовая поправка ножа относительно синхронного цикла. Привязка фактического смещения не подтверждена. Соседнее показание исходного HMI Jaw actuel angle — угол ножа, а не фактическое смещение.'},
  jawWeldingAngleWindow:{title:'Угловое окно сварки ножа',original:'Jaw welding angle window',description:'Угловой интервал синхронного участка ножа при сварке. Изменяется существующая уставка HMI; это не команда ручного движения.'},
  moonstepAccCoefficient:{title:'Коэффициент ускорения Moonstep',original:'Moonstep Acc Cofficient',description:'Коэффициент профиля ускорения ножа в режиме скорости шва. Обозначение Moonstep сохранено из оригинального HMI без предположений о его расшифровке.'},
  moonstepDecCoefficient:{title:'Коэффициент замедления Moonstep',original:'Moonstep Dec Cofficient',description:'Коэффициент профиля замедления ножа в режиме скорости шва. Обозначение Moonstep сохранено из оригинального HMI без предположений о его расшифровке.'}
 };
 function create(root,{t,I18n,getState,display}){
  const page=root.querySelector('[data-page-content="knife"]');if(!page)return null;
  const node=(tag,cls='',text='')=>{const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;};
  const overlay=node('div','sc-overlay sc-functionality-overlay sc-knife-help-overlay');overlay.hidden=true;
  const dialog=node('section','sc-functionality-dialog');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','sc-knife-help-title');
  const head=node('div','sc-functionality-head'),title=node('h3'),close=node('button','sc-action',t('Закрыть'));title.id='sc-knife-help-title';close.type='button';head.append(title,close);
  const body=node('div','sc-functionality-description');dialog.append(head,body);overlay.append(dialog);root.querySelector('.sc-app').append(overlay);
  let focus=null;
  const hide=()=>{overlay.hidden=true;focus?.focus();};close.addEventListener('click',hide);overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();hide();}});
  function show(key){
   const p=definitions[key],field=getState()?.fields?.[key];if(!p)return;focus=document.activeElement;title.textContent=t(p.title);body.replaceChildren(node('p','',t(p.description)));
   for(const [label,value] of [['Оригинальное имя HMI',p.original],['Переменная ПЛК',field?.symbol||'—'],['Тип',field?.type||'REAL'],['Диапазон',field?`${field.min}…${field.max}${field.unit?' '+t(field.unit):''}`:'—']]){
    const row=node('div','sc-functionality-kv');row.append(node('span','',t(label)),node('strong','',value));body.append(row);
   }
   overlay.hidden=false;close.focus();
  }
  page.addEventListener('click',e=>{const b=e.target.closest('[data-knife-help]');if(b)show(b.dataset.knifeHelp);});
  function render(){
   for(const e of page.querySelectorAll('[data-knife-value]')){
    const value=display(e.dataset.knifeValue);e.textContent=value===null?'—':value.toLocaleString(I18n.locale,{maximumFractionDigits:3});
   }
  }
  return {render,setPage(next){if(next!=='knife')hide();else render();},dispose(){overlay.remove();}};
 }
 return {create};
})();
