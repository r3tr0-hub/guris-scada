'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const [url,token,control,out]=process.argv.slice(2);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true,args:['--disable-gpu']});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:600},hasTouch:true}),page=await context.newPage(),errors=[],scopeRequests=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{if(r.url().endsWith('/api/operator-view')&&r.method()==='POST')scopeRequests.push(JSON.parse(r.postData()).scope);});
  const api=(route,body)=>page.evaluate(async({route,body})=>{const r=await fetch(route,{method:body===undefined?'GET':'POST',headers:{'X-SCADA-Token':window.SCADA_BOOT.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};},{route,body});
  const set=async values=>assert((await fetch(control,{method:'POST',body:JSON.stringify(values)})).ok);
  const node=async key=>{await page.locator('.sc-nav-button[data-page="menu"]').click();await page.locator(`[data-open-node="${key}"]`).click();};
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
  assert.equal(await page.locator('[data-alarm-scroll]').count(),0);
  await node('knife');await page.waitForFunction(()=>!document.querySelector('[data-edit="jawOffset"]').disabled);
  assert.equal(await page.locator('[data-page-content="knife"] [data-edit]').count(),1);
  await page.locator('[data-edit="jawOffset"]').click();await page.locator('[data-key="clear"]').click();await page.locator('[data-key="1"]').click();await page.locator('[data-apply-number]').click();await page.waitForFunction(()=>document.querySelector('[data-number-overlay]').hidden);
  assert.equal(await page.locator('[data-toast]').isVisible(),false,'confirmed write has no positive toast');
  await node('unwinder');await page.waitForFunction(()=>!document.querySelector('[data-edit="eng0074"]').disabled);
  assert(scopeRequests.includes('unwinder'));assert.equal((await api('/api/engineering-view',{section:'factory'})).status,403);
  assert.equal(await page.locator('[data-unwinder-toggle]').evaluate(e=>parseFloat(getComputedStyle(e).height)),66);
  await node('temperature');await page.waitForTimeout(1100);assert(scopeRequests.includes('temperature'));
  const card=page.locator('.sc-heat-row').first();assert((await card.evaluate(e=>parseFloat(getComputedStyle(e).height)))>=85.7);
  const heatPage=page.locator('[data-page-content="temperature"] .sc-heat-list');
  assert(await heatPage.evaluate(e=>e.scrollHeight>e.clientHeight),'temperature page keeps a scrollable body below fixed navigation');
  await heatPage.evaluate(e=>e.scrollTop=150);assert((await heatPage.evaluate(e=>e.scrollTop))>0);
  assert.equal(await page.locator('[data-heat-output]').count(),6);
  await set({__connection:false});await page.waitForTimeout(1500);
  assert.equal(await page.locator('[data-heat-output]').first().getAttribute('data-unknown'),'true');assert.equal(await page.locator('[data-heat-output] output').first().innerText(),'—');
  await set({__connection:true});await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
  assert.equal((await api('/api/auth/setup',{password:'261026'})).status,200);await page.waitForFunction(()=>document.querySelector('[data-operator-name]').textContent==='Инженер');
  const packages=(await api('/api/themes')).data.themes;assert(packages.some(p=>p.id==='forest'));assert.equal(packages.find(p=>p.id==='forest').scheme,'dark');
  for(const theme of ['dark','classic','forest']){
   const options=(await api('/api/state')).data.options;assert.equal((await api('/api/options',{...options,snow:Number(options.snow),animations:Number(options.animations),wallpaper:Number(options.wallpaper),exitButton:Number(options.exitButton),theme,font:'tahoma'})).status,200);
   await page.locator('.sc-nav-button[data-page="menu"]').click();await page.locator('[data-page="scada"].sc-node-tile').click();
   await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
   assert.equal((await api('/api/state')).data.options.font,'tahoma');
   await page.screenshot({path:path.join(out,'release26-'+theme+'.png')});
  }
  let downloads=0;page.on('download',()=>downloads++);
  await page.locator('[data-download-report]').click();await page.waitForFunction(()=>document.querySelector('[data-report-saved-path]').textContent.includes('reports/'));
  const snapshotPath=await page.locator('[data-report-saved-path]').innerText();assert(fs.existsSync(snapshotPath));assert.equal(JSON.parse(fs.readFileSync(snapshotPath,'utf8')).version,fs.readFileSync(path.resolve(__dirname,'../VERSION'),'utf8').trim());
  await page.locator('.sc-nav-button[data-page="production"]').click();await page.locator('[data-prod-export]').click();await page.waitForFunction(()=>[...document.querySelectorAll('[data-prod-saved-file]')].some(e=>!e.hidden&&e.textContent.includes('reports/')));
  const productionPath=(await page.locator('[data-prod-saved-file]:visible').innerText()).replace(/^.*?: /,'');assert(fs.existsSync(productionPath));assert.equal(JSON.parse(fs.readFileSync(productionPath,'utf8')).schemaVersion,1);assert.equal(downloads,0);
  // Definitive rejected input is reported inline by the editor; no positive popup.
  await node('knife');await page.locator('[data-edit="jawOffset"]').click();await page.locator('[data-key="clear"]').click();for(const k of ['9','9'])await page.locator(`[data-key="${k}"]`).click();await page.locator('[data-apply-number]').click();
  assert((await page.locator('[data-entry-error]').innerText()).length>0);await page.locator('[data-cancel-number]').click();
  const css=await page.locator('[data-toast]').evaluate(e=>getComputedStyle(e).transitionDuration);assert(css.includes('0.2s'));
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'release26-browser-results.json'),JSON.stringify({passed:true,errors,operatorScopes:scopeRequests,themes:['dark','classic','forest'],cards:'85.8px (+30% from 66px)',unwinderButton:'>=66px',noPositiveToast:true,noAlarmArrows:true},null,2));
  console.log('PASS: operator knife/unwinder scope, thermal unknowns/heights, three file themes/font, no success toast, input errors and alarms touch list');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
