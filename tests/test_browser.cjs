'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const [url,token,control,output]=process.argv.slice(2);
async function main(){
 const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true,args:['--disable-gpu']});const errors=[];
 try{
 const context=await browser.newContext({viewport:{width:1024,height:600},reducedMotion:'reduce',timezoneId:'Europe/Moscow'});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{
  const NativeDate=Date;window.__clockTest=NativeDate.parse('2026-10-14T19:00:00+03:00');
  window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[window.__clockTest]));}static now(){return window.__clockTest;}};
  const animate=Element.prototype.animate;window.__counterMoves=[];Element.prototype.animate=function(...args){if(this.dataset.value)window.__counterMoves.push(this.dataset.value);return animate.apply(this,args);};
 });
 await page.goto(url);await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
 const api=(route,body)=>page.evaluate(async({route,body})=>{const r=await fetch(route,{method:body?'POST':'GET',headers:{'X-SCADA-Token':window.SCADA_BOOT.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()};},{route,body});
 const set=async values=>{const r=await fetch(control,{method:'POST',body:JSON.stringify(values)});assert(r.ok);};
 const waitLoad=async(limiter,text)=>page.waitForFunction(({limiter,text})=>{const i=document.querySelector('[data-speed-icon]');return i.dataset.limiter===limiter&&document.querySelector('[data-speed-load]').textContent===text;},{limiter,text});
 const icons=await page.locator('.sc-fields .sc-field-heading > svg').evaluateAll(nodes=>nodes.map(n=>{const a=n.getBoundingClientRect(),b=n.closest('.sc-field').getBoundingClientRect();return{w:a.width,h:a.height,inside:a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom};}));assert.equal(icons.length,4);assert(icons.every(i=>i.w===62&&i.h===62&&i.inside));
 await set({width:100,speedSet:250,machineState:4,automatic:1});await waitLoad('knife','100%');
 await page.waitForFunction(()=>document.querySelector('[data-speed-icon]').dataset.playing==='true');
 const transforms=await page.locator('.sc-speed-needle-motion').evaluate(async n=>{const values=[];for(let i=0;i<8;i++){values.push(getComputedStyle(n).transform);await new Promise(r=>setTimeout(r,90));}return new Set(values).size;});assert(transforms>2);
 await set({width:500,speedSet:120});await waitLoad('film','100%');
 await set({width:500,speedSet:60});await waitLoad('film','50%');
 await set({width:240,speedSet:250});await waitLoad('both','100%');
 await set({speedSet:0});await waitLoad('both','0%');assert.equal(await page.locator('[data-speed-icon]').getAttribute('data-playing'),'false');
 await set({width:500,speedSet:120,machineState:5,automatic:0});await waitLoad('film','100%');assert.equal(await page.locator('[data-speed-icon]').getAttribute('data-playing'),'false');
 await set({current:22,groups:4,total:322});await page.waitForFunction(()=>['current','groups','total'].every(k=>window.__counterMoves.includes(k)));
 await page.screenshot({path:output+'/home.png'});
 assert(await page.locator('[data-header-snow]').isHidden());await page.locator('.sc-timebox[data-page="clock"]').first().click();
 assert.equal(await page.locator('[data-page-title]').textContent(),'Часы');assert.equal(await page.locator('[data-calendar-month]').textContent(),'октябрь');assert.equal(await page.locator('.sc-calendar-day[aria-current="date"]').textContent(),'14');assert.equal(await page.locator('.sc-calendar-day:not([data-empty])').count(),31);
 await page.screenshot({path:output+'/clock.png'});
 for(const [date,snow,month,days] of [['2026-12-14T19:00:00+03:00',true,'декабрь',31],['2027-01-14T19:00:00+03:00',true,'январь',31],['2027-02-14T19:00:00+03:00',false,'февраль',28]]){
  await page.evaluate(date=>window.__clockTest=Date.parse(date),date);await page.waitForFunction(month=>document.querySelector('[data-calendar-month]').textContent===month,month);assert.equal(await page.locator('[data-header-snow]').isVisible(),snow);assert.equal(await page.locator('.sc-calendar-day:not([data-empty])').count(),days);
 }
 await page.evaluate(()=>window.__clockTest=Date.parse('2026-12-14T19:00:00+03:00'));await page.waitForFunction(()=>!document.querySelector('[data-header-snow]').hidden);
 await page.locator('[data-page="menu"]').first().click();assert(await page.locator('[data-page="scada"][data-engineer-only]').isHidden());
 assert.equal((await api('/api/options',{snow:0,animations:0,wallpaper:0})).status,403);
 await page.locator('[data-edit-operator]').first().click();await page.locator('[data-auth-role="engineer"]').click();assert(await page.locator('[data-pin-overlay]').isHidden());await page.locator('[data-auth-password]').click();
 await page.locator('[data-pin-entry]').fill('262015');await page.locator('[data-pin-apply]').click();await page.locator('[data-pin-entry]').fill('262015');
 await page.screenshot({path:output+'/login.png'});await page.locator('[data-pin-apply]').click();await page.waitForFunction(()=>document.querySelector('[data-operator-overlay]').hidden);
 await page.waitForFunction(()=>!document.querySelector('[data-page="scada"][data-engineer-only]').hidden);assert.equal((await api('/api/state')).data.auth.role,'engineer');assert(!(await page.evaluate(()=>document.cookie)).includes('scada_session'));
 await page.locator('[data-page="scada"]').click();assert.equal(await page.locator('[data-page-title]').textContent(),'Опции SCADA');
 await page.locator('[data-option="snow"]').click();await page.waitForFunction(()=>document.querySelector('[data-option="snow"]').getAttribute('aria-checked')==='false');assert(await page.locator('[data-header-snow]').isHidden());
 await page.locator('[data-option="snow"]').click();await page.waitForFunction(()=>!document.querySelector('[data-header-snow]').hidden);
 await page.locator('[data-option="wallpaper"]').click();await page.waitForFunction(()=>document.querySelector('[data-clock-wallpaper]').hidden);
 await page.locator('[data-option="wallpaper"]').click();await page.waitForFunction(()=>!document.querySelector('[data-clock-wallpaper]').hidden);
 await page.locator('[data-option="animations"]').click();await page.waitForFunction(()=>document.querySelector('.sc-app').dataset.motion==='off');assert(await page.locator('[data-header-snow]').isHidden());
 await page.locator('[data-option="animations"]').click();await page.waitForFunction(()=>document.querySelector('.sc-app').dataset.motion==='on');
 await page.screenshot({path:output+'/options.png'});
 await set({machineState:13,automatic:0});await page.waitForFunction(()=>document.querySelector('[data-state-title]').textContent.includes('МАШИНА НЕ ГОТОВА'));await page.locator('[data-page="belt"]').click();await page.locator('[data-cleaning-add]').click();await page.waitForFunction(()=>document.querySelector('[data-value="beltIdleSpeed"]').textContent==='45');
 await page.locator('[data-cleaning-add]').click();await page.locator('[data-cleaning-add]').click();await page.waitForFunction(()=>/1[7-8]\d с/.test(document.querySelector('[data-cleaning-status]').textContent));
 const state=(await api('/api/state')).data;assert(state.cleaning.remainingMs>175000&&state.cleaning.remainingMs<=180000);assert(state.cleaning.active);
 await page.screenshot({path:output+'/belt.png'});
 // Closing this whole browser context leaves the backend timer active.
 await context.close();const second=await browser.newContext({viewport:{width:1024,height:600},reducedMotion:'reduce'});const next=await second.newPage();next.on('pageerror',e=>errors.push(String(e)));await next.goto(url);await next.locator('[data-page="belt"]').click();await next.waitForFunction(()=>document.querySelector('[data-cleaning-status]').textContent.includes('Ускорение'));
 await next.locator('[data-normal-belt]').click();await next.waitForFunction(()=>document.querySelector('[data-value="beltIdleSpeed"]').textContent==='10');
 assert(await next.locator('[data-page="scada"][data-engineer-only]').isHidden());
 assert.deepEqual(errors,[]);await second.close();console.log('PASS: native backend + Chromium without GPU/reduced motion: speed limits, moving gauge, three counters, profiles/permissions, options, months/calendar, snow, +60/+120/+180, browser close and verified 10.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
