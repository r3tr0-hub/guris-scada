'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const [url,token,control,out]=process.argv.slice(2);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:600},hasTouch:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  const api=(route,body)=>page.evaluate(async({route,body})=>{const r=await fetch(route,{method:body===undefined?'GET':'POST',headers:{'X-SCADA-Token':window.SCADA_BOOT.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};},{route,body});
  const set=async data=>assert((await fetch(control,{method:'POST',body:JSON.stringify(data)})).ok);
  const shot=async n=>page.screenshot({path:path.join(out,n+'.png')});
  const node=async k=>{await page.locator('.sc-nav-button[data-page="menu"]').click();await page.locator(`[data-open-node="${k}"]`).click();};
  const mode=async m=>{if(await page.locator('[data-conveyor-panel]').getAttribute('data-mode')===m)return;await page.locator(`[data-conveyor-mode="${m}"]`).click();await page.waitForFunction(m=>document.querySelector('[data-conveyor-panel]').dataset.mode===m,m);};
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
  await page.locator('.sc-nav-button[data-page="belt"]').click();
  const original=(await api('/api/state')).data.fields;
  for(const m of ['continuous','off','timed','off','continuous','timed']){
   await mode(m);assert.equal(await page.locator('[data-conveyor-mode][aria-pressed="true"]').getAttribute('data-conveyor-mode'),m);
   assert.equal(await page.locator('[data-conveyor-fields="timed"]').isVisible(),m==='timed');assert.equal(await page.locator('[data-conveyor-fields="continuous"]').isVisible(),m==='continuous');await shot('mode-'+m);
  }
  const after=(await api('/api/state')).data.fields;
  for(const k of ['beltTime1','beltTime2','beltTime3','conveyorTime1','conveyorTime2'])assert.equal(after[k].raw,original[k].raw,'hidden setpoint changed '+k);
  await set({beltTimed:1,conveyorContinuous:1});await page.waitForFunction(()=>document.querySelector('[data-conveyor-panel]').dataset.mode==='conflict');
  assert.equal(await page.locator('[data-conveyor-mode][aria-pressed="true"]').count(),0);await shot('mode-conflict');await mode('off');
  for(const [value,left,width,hidden] of [[-.4,'25%','25%',false],[.2,'50%','12.5%',false],[0,'50%','0%',true]]){
   await set({offsetDisplay:value});await page.waitForFunction(({left,width})=>{const e=document.querySelector('[data-offset-fill]');return e.style.left===left&&e.style.width===width;},{left,width});
   assert.equal(await page.locator('[data-offset-fill]').isHidden(),hidden);await shot('scale-'+value);
  }
  await set({jawWeldingAngleWindow:3.125,moonstepAccCoefficient:1.25,moonstepDecCoefficient:1.75});
  await node('knife');for(const key of ['jawWeldingAngleWindow','moonstepAccCoefficient','moonstepDecCoefficient']){
   await page.waitForFunction(k=>!document.querySelector(`[data-edit="${k}"]`).disabled,key);await page.locator(`[data-knife-help="${key}"]`).click();assert(await page.locator('.sc-knife-help-overlay').isVisible());await shot('help-'+key);await page.locator('.sc-knife-help-overlay button').click();
  }
  const readonly=page.locator('.sc-operator-knife-unconfirmed');assert((await readonly.innerText()).includes('не подтверждена'));
  const engineerOnly=(await api('/api/engineering-view',{section:'jaw'})).status;assert.equal(engineerOnly,403);
  assert.equal((await api('/api/auth/setup',{password:'281031'})).status,200);await page.waitForFunction(()=>document.querySelector('[data-operator-name]').textContent==='Инженер');
  const themes=(await api('/api/themes')).data.themes;assert.equal(themes.find(t=>t.id==='forest').nameRu,'Pack Innovation');
  for(const name of ['dark','classic','forest']){
   const opts=(await api('/api/state')).data.options;await api('/api/options',{...opts,snow:Number(opts.snow),animations:Number(opts.animations),wallpaper:Number(opts.wallpaper),exitButton:Number(opts.exitButton),theme:name});await page.waitForFunction(n=>document.documentElement.dataset.theme===n,name);await page.waitForTimeout(180);
   for(const size of [{width:1024,height:600},{width:1920,height:1080}]){
    await page.setViewportSize(size);await page.locator('.sc-nav-button[data-page="belt"]').click();await mode('timed');await shot(name+'-'+size.width+'-belt');
    await node('knife');await shot(name+'-'+size.width+'-knife');await node('edge');assert.equal(await page.locator('[data-edge-input]').count(),0);
    const list=page.locator('.sc-edge-list');await list.evaluate(e=>e.scrollTop=e.scrollHeight);await shot(name+'-'+size.width+'-edge-bottom');
    assert(await page.locator('.sc-edge-row').evaluateAll(es=>es.every(e=>{const p=e.getBoundingClientRect();return [...e.children].every(c=>{const r=c.getBoundingClientRect();return r.top>=p.top-.5&&r.bottom<=p.bottom+.5;});})));
    await page.locator('.sc-nav-button[data-page="menu"]').click();assert.equal(await page.locator('[data-open-node="unwinder"]').getAttribute('data-menu-cell'),'5:4');await shot(name+'-'+size.width+'-menu');
   }
  }
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.theme==='forest');
  await set({__connection:false});await page.waitForTimeout(1800);await page.locator('.sc-nav-button[data-page="belt"]').click();await page.waitForFunction(()=>document.querySelector('[data-conveyor-panel]').dataset.mode==='unknown');
  assert.equal(await page.locator('[data-conveyor-mode][aria-pressed="true"]').count(),0);assert(await page.locator('[data-offset-fill]').isHidden());await shot('forest-offline-belt');
  for(const key of ['edge','knife']){await node(key);await page.evaluate(()=>{const sizes=[...document.querySelectorAll('[data-page-content]:not([hidden]) *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);for(const [e,n] of sizes)e.style.fontSize=n*1.2+'px';});await shot('forest-font120-'+key);}
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,themes:['dark','classic','forest'],errors,viewports:['1024x600','1920x1080'],conveyorTransitions:6},null,2));console.log('PASS release28: modes, preservation, conflict, scale, scopes/help, palettes, menu and offline');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
