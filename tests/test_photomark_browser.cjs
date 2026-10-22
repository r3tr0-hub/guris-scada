'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const [url,token,control,out]=process.argv.slice(2);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true,args:['--disable-gpu']});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:600},deviceScaleFactor:1}),page=await context.newPage(),errors=[],commands=[],external=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{if(r.url().includes('/api/command')&&r.method()==='POST')commands.push(JSON.parse(r.postData()));if(!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());});
  const api=(route,body)=>page.evaluate(async({route,body})=>{const r=await fetch(route,{method:body?'POST':'GET',credentials:'same-origin',headers:{'X-SCADA-Token':window.SCADA_BOOT.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};},{route,body});
  const set=async values=>assert((await fetch(control,{method:'POST',body:JSON.stringify(values)})).ok);
  const wait=async fn=>{for(let n=0;n<140;n++){const s=(await api('/api/state')).data;if(fn(s))return s;await page.waitForTimeout(50);}assert.fail('State not reached');};
  const normal=()=>page.locator('[data-photo-normal]');
  const teach=()=>page.locator('[data-photo-teach]');
  const next=()=>page.locator('[data-photo-help-next]');
  const shot=name=>page.screenshot({path:path.join(out,'photomark-'+name+'.png')});
  const layout=async()=>{
   const bad=await page.locator('[data-page-content="photomark"] button,[data-photo-help-canvas],[data-photo-help-live]').evaluateAll(es=>es.filter(e=>!e.closest('[hidden]')).map(e=>({tag:e.tagName,key:e.dataset.command||e.dataset.edit||e.className,r:e.getBoundingClientRect()})).filter(x=>x.r.width&&(x.r.x<-.5||x.r.y<60*innerHeight/600-.5||x.r.right>innerWidth+.5||x.r.bottom>innerHeight+.5)));
   assert.deepEqual(bad,[]);
  };
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
  await set({photoReset:0,photoOffsetTenths:15,photoLength:200.4,workingLength:200});
  await page.locator('.sc-nav-button[data-page="photomark"]').click();
  await wait(s=>s.fields.photoOffsetTenths.value===15&&s.fields.photoOffsetTenths.max===200);
  assert.equal(await page.locator('[data-edit="photoLength"]').count(),0);
  await page.waitForFunction(()=>document.querySelector('[data-photo-length]').textContent==='200,4');
  assert.equal(await teach().getAttribute('aria-pressed'),'false');
  await teach().click();await wait(s=>s.fields.photoReset.value===1&&!s.busy);
  await page.waitForFunction(()=>document.querySelector('[data-photo-teach]').getAttribute('aria-pressed')==='true');
  await page.waitForTimeout(900);assert.equal((await api('/api/state')).data.fields.photoReset.value,1);
  assert(await page.locator('[data-edit="photoOffsetTenths"]').isDisabled());
  await set({photoOffsetTenths:43.5});await page.waitForFunction(()=>document.querySelector('[data-photo-offset-value]').textContent==='43,5');
  await layout();await shot('teaching');
  await teach().click();await wait(s=>s.fields.photoReset.value===0&&!s.busy);
  await page.waitForFunction(()=>!document.querySelector('[data-edit="photoOffsetTenths"]').disabled);
  assert.equal((await api('/api/state')).data.fields.photoOffsetTenths.value,43.5);
  await set({automatic:1,machineState:4});await wait(s=>s.fields.automatic.value===1);
  await page.waitForFunction(()=>document.querySelector('[data-photo-teach]').disabled);
  await page.locator('[data-nudge="photoOffsetTenths"][data-step="0.5"]').click();await wait(s=>s.fields.photoOffsetTenths.value===44&&!s.busy);
  await set({automatic:0,machineState:5});await wait(s=>s.fields.automatic.value===0);
  await page.waitForFunction(()=>!document.querySelector('[data-photo-teach]').disabled);
  const beforeGuide=commands.length;
  await page.locator('[data-photo-help]').click();assert(await page.locator('[data-photo-wizard]').isVisible());assert(await normal().isHidden());
  await page.waitForTimeout(100);const frame=await page.locator('[data-photo-help-canvas]').evaluate(c=>c.toDataURL());
  await page.waitForTimeout(220);assert.notEqual(await page.locator('[data-photo-help-canvas]').evaluate(c=>c.toDataURL()),frame);
  assert.equal(commands.length,beforeGuide,'Opening the guide must not write to the PLC');
  await layout();await shot('guide-mark');
  await next().click();await page.waitForFunction(()=>document.querySelector('[data-photo-step="1"]').getAttribute('aria-current')==='step');
  assert.equal(commands.at(-1).action,'set');assert.equal(commands.at(-1).value,1);
  await page.waitForTimeout(200);await layout();await shot('guide-set');
  await next().click();await page.waitForFunction(()=>document.querySelector('[data-photo-step="2"]').getAttribute('aria-current')==='step');
  await set({photoOffsetTenths:27.5});await page.waitForFunction(()=>document.querySelector('[data-photo-help-live] [data-value="photoOffsetTenths"]').textContent==='27,5');
  await layout();await shot('guide-background');await next().click();await page.waitForFunction(()=>document.querySelector('[data-photo-wizard]').hidden);
  await wait(s=>s.fields.photoReset.value===0&&!s.busy);assert.equal(commands.at(-1).value,0);

  // Closing an informational guide never unlatches or reapplies a PLC mode.
  await teach().click();await wait(s=>s.fields.photoReset.value===1&&!s.busy);
  await page.locator('[data-photo-help]').click();const count=commands.length;
  await page.locator('[data-photo-help-cancel]').click();assert.equal(commands.length,count);
  assert.equal((await api('/api/state')).data.fields.photoReset.value,1);

  // Automatic start clears the PLC bit; a late Finish must never invert it.
  await page.locator('[data-photo-help]').click();await next().click();
  await set({automatic:1,machineState:4,photoReset:0});
  await page.waitForFunction(()=>document.querySelector('[data-photo-help-next-text]').textContent==='Закрыть помощь');
  const afterPlc=commands.length;await next().click();assert.equal(commands.length,afterPlc);
  assert(await normal().isVisible());

  // Offline guide pauses command buttons and animations, and never replays on reconnect.
  await set({automatic:0,machineState:5});await wait(s=>s.fields.automatic.value===0);
  await page.locator('[data-photo-help]').click();await set({__connection:false});
  await page.waitForFunction(()=>!document.querySelector('[data-photo-help-paused]').hidden);
  assert(await next().isDisabled());await shot('guide-offline');
  const offlineCommands=commands.length;await set({__connection:true});await wait(s=>s.connected&&s.fields.photoReset.quality);
  await page.waitForTimeout(250);assert.equal(commands.length,offlineCommands);
  await page.locator('[data-photo-help-cancel]').click();

  assert.equal((await api('/api/auth/setup',{password:'246810'})).status,200);
  await api('/api/options',{snow:1,animations:1,wallpaper:1,exitButton:1,theme:'classic'});
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='classic');
  await page.locator('[data-photo-help]').click();
  for(const viewport of [{width:1024,height:600},{width:1920,height:1080},{width:3840,height:2160}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(200);await layout();
   const pixels=await page.locator('[data-photo-help-canvas]').evaluate(c=>({width:c.width,visible:c.getBoundingClientRect().width,dpr:devicePixelRatio}));
   assert(pixels.width>=Math.min(4096,Math.round(pixels.visible*pixels.dpr))-1,JSON.stringify(pixels));
  }
  await shot('guide-classic-4k');await page.setViewportSize({width:1024,height:600});
  await api('/api/options',{snow:1,animations:0,wallpaper:1,exitButton:1,theme:'classic'});
  await page.waitForTimeout(250);const still=await page.locator('[data-photo-help-canvas]').evaluate(c=>c.toDataURL());
  await page.waitForTimeout(200);assert.equal(await page.locator('[data-photo-help-canvas]').evaluate(c=>c.toDataURL()),still);
  await page.locator('[data-photo-help-cancel]').click();
  await page.locator('[data-open-language]').click();await Promise.all([page.waitForNavigation(),page.locator('[data-choose-language="en"]').click()]);
  await page.waitForFunction(()=>document.documentElement.lang==='en');
  await page.locator('.sc-nav-button[data-page="photomark"]').click();
  assert.equal(await teach().getAttribute('aria-pressed'),'false');
  await page.locator('[data-photo-help]').click();
  assert.equal(await page.locator('[data-photo-help-title]').innerText(),'Mark under the sensor');
  assert.equal(await page.locator('[data-photo-help-next-text]').innerText(),'Enable teaching');
  await shot('guide-english');await layout();
  assert(commands.every(c=>c.key!=='photoReset'||c.action==='set'),'Teaching uses explicit target states');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  fs.writeFileSync(path.join(out,'photomark-browser-results.json'),JSON.stringify({passed:true,errors,commands,external,themes:['dark','classic'],sizes:['1024x600','1920x1080','3840x2160'],languages:['ru','en'],source:'native backend and local ADS peer'},null,2));
  console.log('PASS: photomark latch/readback, live offset, read-only average, manual correction during auto, animated three-step guide, explicit enable/finish, close without writes, PLC auto-clear race, offline no replay, classic/4K/English and motion preference.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

