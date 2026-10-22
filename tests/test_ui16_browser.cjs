'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const [url,token,control,out]=process.argv.slice(2);
async function main(){
 const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true,args:['--disable-gpu']});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:600}}),page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(write|command|counter-reset)/.test(r.url()))writes.push(r.url());});
  const api=(route,body)=>page.evaluate(async({route,body})=>{const r=await fetch(route,{method:body?'POST':'GET',headers:{'X-SCADA-Token':window.SCADA_BOOT.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()};},{route,body});
  const set=async data=>assert((await fetch(control,{method:'POST',body:JSON.stringify(data)})).ok);
  const nav=key=>page.locator(`.sc-nav-button[data-page="${key}"]`).click();
  const node=async key=>{await nav('menu');await page.locator(`[data-page-content="menu"] [data-open-node="${key}"]`).click();};
  const shot=name=>page.screenshot({path:path.join(out,'ui16-'+name+'.png')});
  const containment=selector=>page.locator(selector).evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),p=e.closest('.sc-position-box,.sc-toggle-setting,.sc-eject-setting-row,.sc-diagnostics-page').getBoundingClientRect();return{key:e.dataset.edit||e.dataset.nodeReading||e.className,inside:r.x>=p.x-1&&r.y>=p.y-1&&r.right<=p.right+1&&r.bottom<=p.bottom+1,r:{x:r.x,y:r.y,w:r.width,h:r.height},p:{x:p.x,y:p.y,w:p.width,h:p.height}};}));
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('[data-reset-counter="current"]').disabled);
  assert.equal(await page.locator('.sc-sidebar-foot strong,.sc-sidebar [data-open-history],.sc-tools [data-page]').count(),0);
  assert(!/TEST|0\.1\.1[56]/i.test(await page.locator('.sc-sidebar').innerText()));
  assert.equal(await page.locator('[data-page-content="manuals"]').count(),1);
  const lower=await page.locator('.sc-nav-button[data-page="alarms"]').boundingBox(),above=await page.locator('.sc-nav-button[data-page="photomark"]').boundingBox();assert(lower.y>above.y+above.height+20);
  await set({machineState:4,automatic:1});await page.waitForTimeout(650);
  for(const key of ['current','groups','total'])assert(await page.locator(`[data-reset-counter="${key}"]`).isEnabled());
  await page.locator('[data-reset-counter="current"]').click();await set({current:99});await page.waitForFunction(()=>document.querySelector('[data-reset-before]').textContent==='99');assert(await page.locator('[data-reset-apply]').isEnabled());await page.locator('[data-reset-apply]').click();await page.waitForFunction(()=>document.querySelector('[data-reset-overlay]').hidden);
  await node('jog');assert.equal(await page.locator('[data-page-content="jog"] [data-edit],[data-page-content="jog"] [data-command]').count(),0);await shot('jog');
  assert.equal((await api('/api/auth/setup',{password:'261016'})).status,200);
  const layouts=[];
  for(const theme of ['dark','classic']){
   assert.equal((await api('/api/options',{snow:1,animations:1,wallpaper:1,exitButton:1,theme})).status,200);await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
   await node('takeoff');let bounds=await containment('[data-page-content="takeoff"] .sc-position-box .sc-node-number,[data-page-content="takeoff"] .sc-position-box .sc-node-detail,[data-page-content="takeoff"] .sc-axis-button,[data-page-content="takeoff"] .sc-derived-value');assert(bounds.every(b=>b.inside),JSON.stringify(bounds));
   assert.equal(await page.locator('[data-page-content="takeoff"] .sc-derived-value .sc-node-unit').count(),0);await shot(theme+'-takeoff');
   await node('eject');bounds=await containment('.sc-eject-setting-row [data-edit],.sc-eject-setting-row .sc-axis-button');assert(bounds.every(b=>b.inside),JSON.stringify(bounds));
   const a=await page.locator('[data-edit="ejectSpeed"]').boundingBox(),b=await page.locator('[data-edit="ejectOffset"]').boundingBox();assert(Math.abs(a.x-b.x)<1);assert(Math.abs(a.width-b.width)<1);await shot(theme+'-eject');layouts.push({theme,bounds});
  }
  await set({__alarms:Array.from({length:35},(_,slot)=>({slot,id:slot+1,condition:slot!==0})),machineState:2});
  await nav('alarms');await page.waitForFunction(()=>document.querySelectorAll('[data-alarm-list] article').length===35);
  assert.equal(await page.locator('[data-alarms-overlay]').count(),0);assert.equal(await page.locator('.sc-nav-button[data-page="alarms"]').getAttribute('data-alarm-active'),'true');
  assert((await page.locator('.sc-nav-button[data-page="alarms"] > svg').evaluate(e=>getComputedStyle(e).animationName)).includes('sc-alarm-warning'));
  assert(await page.locator('[data-command="alarmAck"]').isVisible());assert(await page.locator('[data-command="alarmClear"]').isVisible());
  await page.locator('[data-alarm-scroll="1"]').click();await page.waitForFunction(()=>document.querySelector('[data-alarm-list]').scrollTop>0);await shot('alarms');
  await page.locator('[data-command="alarmAck"]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-alarm-list] article[data-active="false"]').length===1&&!document.querySelector('[data-command="alarmClear"]').disabled);await page.locator('[data-command="alarmClear"]').click();await page.locator('[data-confirm-alarm-clear]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-alarm-list] article').length===34);
  const writesBeforeIO=writes.length;await page.locator('[data-page-content="alarms"] [data-page="io"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-io-tabs] button').length===9);await page.waitForFunction(()=>document.querySelectorAll('.sc-io-card[data-level="high"],.sc-io-card[data-level="low"]').length>20);
  assert.equal(await page.locator('.sc-io-page [data-command],.sc-io-page [data-edit]').count(),0);await shot('inputs');
  const catalog=await (await fetch(url.split('/?')[0]+'/io_catalog.json')).json();assert.equal(catalog.tags.length,883);assert.equal(catalog.pages.length,8);
  for(const p of catalog.pages){await page.locator(`[data-io-tab="${p.id}"]`).click();assert.equal(await page.locator('.sc-io-card').count(),p.rows.length);await page.waitForTimeout(200);}
  // The HMI photocell indicators extract bits 0/4 from one status word.
  await page.locator('[data-io-tab="VISU_INPUT"]').click();
  await set({__io:{19:17,87:0,103:0}});
  await page.waitForFunction(()=>[...document.querySelectorAll('.sc-io-card[data-io-id="19"]')].every(c=>c.dataset.level==='high'));
  await set({__io:{19:16,87:1,103:0}});
  await page.waitForFunction(()=>{const cards=[...document.querySelectorAll('.sc-io-card[data-io-id="19"]')];return cards.length===2&&cards[0].dataset.level==='low'&&cards[1].dataset.level==='high';});
  await page.waitForFunction(()=>document.querySelector('.sc-io-card[data-io-id="87"]').dataset.level==='high');
  await page.locator('[data-io-tab="all"]').click();assert.equal(await page.locator('.sc-io-card').count(),48);await page.locator('[data-io-next]').click();assert((await page.locator('[data-io-page-info]').innerText()).startsWith('Страница 2'));
  await page.locator('[data-io-search]').fill('.DO_Korna');await page.waitForFunction(()=>document.querySelectorAll('.sc-io-card').length===1);await page.waitForFunction(()=>document.querySelector('.sc-io-card').dataset.level!=='unknown');const horn=await page.locator('.sc-io-card').getAttribute('data-io-id');
  await set({__io:{[horn]:1}});await page.waitForFunction(()=>document.querySelector('.sc-io-card').dataset.level==='high');await set({__io:{[horn]:0}});await page.waitForFunction(()=>document.querySelector('.sc-io-card').dataset.level==='low');await shot('horn-readonly');
  await set({__connection:false});await page.waitForFunction(()=>document.querySelector('.sc-io-card').dataset.level==='unknown');assert.equal(await page.locator('.sc-io-card output').innerText(),'—');await shot('io-offline');
  await set({__connection:true});await page.waitForFunction(()=>document.querySelector('.sc-io-card').dataset.level==='low');
  await nav('home');const paused=await api('/api/io');assert.equal(paused.data.active,false);
  assert.equal(writes.length,writesBeforeIO);assert.deepEqual(errors,[]);
  await page.locator('[data-open-language]').click();await Promise.all([page.waitForNavigation(),page.locator('[data-choose-language="en"]').click()]);await page.waitForFunction(()=>document.documentElement.lang==='en');await nav('alarms');await page.locator('[data-page-content="alarms"] [data-page="io"]').click();await page.waitForFunction(()=>document.querySelectorAll('.sc-io-card').length>0);assert(!/[А-Яа-яЁё]/.test(await page.locator('.sc-io-page').innerText()));
  fs.writeFileSync(path.join(out,'ui16-results.json'),JSON.stringify({layouts,writes,errors,tags:catalog.tags.length,pages:catalog.pages.length},null,2));await context.close();
  console.log('PASS: resets during automatic operation with a changing count; empty Jog; clean sidebar and lower alarms; roller containment/aligned inputs in both themes; full alarms, flashing, scrolling, acknowledge/clear; original I/O pages, all-signal search/pagination/live bits/offline/pause, no I/O writes, English.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
