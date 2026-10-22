'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const [url,token,control,output]=process.argv.slice(2);
async function main(){
 const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true,args:['--disable-gpu']});
 const errors=[],writes=[],results=[];
 try {
  const context=await browser.newContext({viewport:{width:1024,height:600},reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(write|command|counter-reset|cleaning|unwinder)/.test(r.url()))writes.push(r.url());});
  const api=(route,body)=>page.evaluate(async({route,body})=>{const r=await fetch(route,{method:body?'POST':'GET',headers:{'X-SCADA-Token':window.SCADA_BOOT.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()};},{route,body});
  const set=async values=>assert((await fetch(control,{method:'POST',body:JSON.stringify(values)})).ok);
  const options=async(theme,animations=1)=>{assert.equal((await api('/api/options',{snow:1,animations,wallpaper:1,exitButton:1,theme})).status,200);await page.waitForFunction(({theme,animations})=>document.documentElement.dataset.theme===theme&&document.querySelector('.sc-app').dataset.motion===(animations?'on':'off'),{theme,animations});};
  const nav=key=>page.locator(`.sc-nav-button[data-page="${key}"]`).click();
  const node=async key=>{await nav('menu');await page.locator(`[data-page-content="menu"] [data-open-node="${key}"]`).click();};
  const shot=name=>page.screenshot({path:path.join(output,'ui15-'+name+'.png')});
  const fit=async selector=>{const boxes=await page.locator(selector).evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return{class:e.className,x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height};}));assert(boxes.every(b=>b.x>=0&&b.y>=0&&b.right<=1024.1&&b.bottom<=600.1),JSON.stringify(boxes));return boxes;};
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
  await nav('belt');assert(await page.locator('[data-cleaning-add]').isDisabled());assert(await page.locator('[data-normal-belt]').isDisabled());
  await set({machineState:13,automatic:0});await page.waitForFunction(()=>!document.querySelector('[data-cleaning-add]').disabled);
  for(const n of [1,2,3,4,5,6,7,8,9,10,11,12,0,14]){await set({machineState:n});await page.waitForFunction(()=>document.querySelector('[data-cleaning-add]').disabled&&document.querySelector('[data-normal-belt]').disabled);await page.waitForTimeout(140);}
  await set({machineState:13,automatic:0});await page.waitForFunction(()=>!document.querySelector('[data-cleaning-add]').disabled);
  await set({automatic:1});await page.waitForFunction(()=>document.querySelector('[data-cleaning-add]').disabled);await set({automatic:0});
  assert.equal((await api('/api/auth/setup',{password:'261015'})).status,200);await page.waitForFunction(()=>!document.querySelector('[data-page="scada"][data-engineer-only]').hidden);
  for(const theme of ['dark','classic']){
   await options(theme);await nav('belt');
   assert.equal(await page.locator('[data-timing-panel="beltTimed"] .sc-timing-title').evaluate(e=>e.firstChild.nodeValue),'Работа конвейера по времени');
   const belt=await fit('.sc-belt-pair > button,.sc-cleaning-panel,.sc-offset-panel');assert(belt.slice(0,2).every(b=>b.h===66));await shot(theme+'-belt');
   await nav('menu');const tiles=await fit('[data-page-content="menu"] .sc-node-tile');assert.equal(tiles.length,16);assert(tiles.every(b=>Math.abs(b.w-134.55)<.02&&b.h===92));await shot(theme+'-menu');
   await page.locator('[data-open-node="temperature"]').click();
   const separators=await page.locator('.sc-heat-list > .sc-heat-row').evaluateAll(es=>es.slice(1).map(e=>{const s=getComputedStyle(e,'::before');return{content:s.content,height:s.height,bg:s.backgroundColor};}));
   assert.equal(separators.length,5);assert(separators.every(s=>s.content==='""'&&s.height==='1px'&&s.bg!=='rgba(0, 0, 0, 0)'));await fit('.sc-heat-row');await shot(theme+'-temperature');
   await nav('actuators');assert.equal(await page.locator('[data-edit="videojet1Time"] [data-actuator-icon="thermal-transfer"] circle').count(),2);assert.equal(await page.locator('[data-edit="handle1Time"] [data-actuator-icon="die-cut-handle"] rect').getAttribute('rx'),'5');await shot(theme+'-actuators');
   await set({seamEnabled:0});await node('longitudinal');await page.waitForFunction(()=>document.querySelector('[data-seam-heat]').hidden);assert.equal(await page.locator('[data-page-content="longitudinal"] [data-node-reading^="dancer"]').count(),0);assert(!/Баллерина/.test(await page.locator('[data-page-content="longitudinal"]').innerText()));await fit('.sc-seam-module');await shot(theme+'-seam-off');
   await set({seamEnabled:1});await page.waitForFunction(()=>!document.querySelector('[data-seam-heat]').hidden);assert(await page.locator('[data-seam-heat] [data-edit="heat5Set"]').isVisible());await fit('[data-seam-heat],.sc-seam-module');await shot(theme+'-seam-on');
   results.push({theme,belt,tiles,separators});
  }
  // Each icon responds to a real click, finishes within 2.2 s, and has no
  // infinite animation. Button navigation is never delayed by the response.
  for(const key of ['home','belt','menu','actuators','photomark','alarms']){
   const button=page.locator(`.sc-nav-button[data-page="${key}"]`);await button.locator('svg').click();
   assert.equal(await button.getAttribute('data-nav-animating'),'true');
   const sample=()=>button.locator('svg [class]').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return[s.transform,s.opacity,s.fillOpacity];}));
   const a=await sample();await page.waitForTimeout(280);assert.notDeepEqual(await sample(),a,key);
   const duration=await button.evaluate(b=>b.getAnimations({subtree:true}).map(a=>a.effect.getComputedTiming().endTime));assert(duration.length&&duration.every(t=>Number.isFinite(t)&&t<=2200),key);
   await page.waitForFunction(k=>!document.querySelector(`.sc-nav-button[data-page="${k}"]`).hasAttribute('data-nav-animating'),key);
   assert.equal(await button.evaluate(b=>b.getAnimations({subtree:true}).length),0,key);

  }
  await nav('home');await page.waitForTimeout(70);await nav('belt');assert.equal(await page.locator('[data-nav-animating="true"]').count(),1);assert.equal(await page.locator('.sc-nav-button[data-page="home"]').evaluate(b=>b.getAnimations({subtree:true}).length),0);
  await options('classic',0);await nav('home');assert.equal(await page.locator('[data-nav-animating]').count(),0);
  await page.locator('[data-open-language]').click();await Promise.all([page.waitForNavigation(),page.locator('[data-choose-language="en"]').click()]);await page.waitForFunction(()=>document.documentElement.lang==='en');await nav('belt');assert.equal(await page.locator('[data-timing-panel="beltTimed"] .sc-timing-title').evaluate(e=>e.firstChild.nodeValue),'Timed conveyor operation');
  await set({seamEnabled:1});await node('longitudinal');await page.waitForFunction(()=>!document.querySelector('[data-seam-heat]').hidden);assert(!/[А-Яа-яЁё]/.test(await page.locator('[data-page-content="longitudinal"]').innerText()));
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);fs.writeFileSync(path.join(output,'ui15-results.json'),JSON.stringify(results,null,2));await context.close();
  console.log('PASS: idle controls only state 13/auto off; both themes: 66px belt blocks, +15% 15 menu tiles, five separators, transfer-printer/handle vectors, conditional seam heat and removed dancers; all six finite navigation animations, rapid click cancellation, motion-off and English; no PLC writes.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
