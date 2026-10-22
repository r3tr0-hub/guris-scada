'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{chromium}=require('playwright');
const [url,token,control,out]=process.argv.slice(2);
const catalog=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../ui/performance.json'))).parameters;
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true,args:['--disable-gpu']});
 try {
  const context=await browser.newContext({viewport:{width:1024,height:600},hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],external=[],writes=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{if(!r.url().startsWith(new URL(url).origin))external.push(r.url());if(r.method()==='POST'&&/\/api\/(write|command)/.test(r.url()))writes.push(JSON.parse(r.postData()));});
  const api=(route,body)=>page.evaluate(async({route,body})=>{const r=await fetch(route,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:{'X-SCADA-Token':window.SCADA_BOOT.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};},{route,body});
  const set=async values=>assert((await fetch(control,{method:'POST',body:JSON.stringify(values)})).ok);
  const nav=name=>page.locator(`.sc-nav-button[data-page="${name}"]`).click();
  const open=async name=>{await nav('menu');await page.locator('[data-open-node="options"]').click();await page.locator(`[data-${name}-entry]`).click();await page.locator(`[data-page-content="${name}"] .sc-functionality-grid`).waitFor();};
  const grid=name=>page.locator(`[data-page-content="${name}"] .sc-functionality-grid`);
  const shot=name=>page.screenshot({path:path.join(out,'release23-'+name+'.png')});
  const waitValue=(key,value)=>page.waitForFunction(({key,value})=>{const e=document.querySelector(`[data-performance-control="${key}"]`);return e&&!e.disabled&&Number(e.textContent.replace(/[^0-9,.-]/g,'').replace(',','.'))===value;},{key,value});
  const cdp=await context.newCDPSession(page);
  const swipe=async(name,onControl=false)=>{
   const g=grid(name);await g.evaluate(e=>e.scrollTop=0);await page.waitForTimeout(80);
   const r=await g.boundingBox(),candidate=onControl?await page.locator(`[data-page-content="${name}"] [data-engineering-control]`).nth(8).boundingBox():null;
   const x=candidate?candidate.x+candidate.width/2:r.x+r.width*.3,y=candidate?candidate.y+candidate.height/2:r.y+r.height-25;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
   for(let n=1;n<=8;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-n*28,id:1}]});await page.waitForTimeout(20);}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(450);
   assert(await g.evaluate(e=>e.scrollTop)>50,`${name}: finger swipe must scroll`);
   assert(await page.locator('[data-number-overlay]').isHidden());assert.equal(await page.locator('.sc-functionality-overlay:visible').count(),0);
  };
  const checkFrame=async(name)=>{
   const bad=await page.locator(`[data-page-content="${name}"], [data-page-content="${name}"]>.sc-functionality-head, [data-page-content="${name}"] .sc-functionality-grid`).evaluateAll(es=>es.map(e=>({cls:e.className,r:e.getBoundingClientRect()})).filter(x=>x.r.x<0||x.r.y<0||x.r.right>innerWidth+.5||x.r.bottom>innerHeight+.5).map(x=>x.cls));assert.deepEqual(bad,[]);
   const overflow=await grid(name).evaluate(e=>e.scrollWidth>e.clientWidth+1);assert.equal(overflow,false,'No horizontal overflow');
  };
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
  await nav('menu');assert(await page.locator('[data-open-node="options"]').isHidden());
  assert.equal((await api('/api/auth/setup',{password:'221026'})).status,200);await page.waitForFunction(()=>document.querySelector('[data-operator-name]').textContent==='Инженер');
  for(const [name,count] of [['functionality',62],['performance',28]]){
   await open(name);await page.waitForFunction(({name,count})=>document.querySelectorAll(`[data-${name}-key]`).length===count,{name,count});
   assert.equal(await page.locator('[data-functionality-tab]').count(),0);await checkFrame(name);
   await swipe(name);await swipe(name,true);assert.equal(writes.length,0,'Swiping on settings must not change PLC values');
   await grid(name).evaluate(e=>e.scrollTop=e.scrollHeight);await shot(name+'-bottom');await grid(name).evaluate(e=>e.scrollTop=0);await shot(name+'-top');
  }
  assert.equal(await page.locator('[data-page-title]').innerText(),'Производительность');
  assert.equal(await page.locator('[data-page-content="performance"] .sc-functionality-row').count(),25,'Readings must not become separate setting rows');
  const pairs={feedStartActual:'feedStartSet',feedStopActual:'feedStopSet',perfLowMaterialActual:'perfLowMaterialTime'};
  for(const [actual,setting] of Object.entries(pairs)){
   const settingControl=page.locator(`[data-performance-control="${setting}"]`),actualControl=page.locator(`[data-performance-control="${actual}"]`);
   const same=await settingControl.evaluate((e,actual)=>e.closest('.sc-functionality-row')===document.querySelector(`[data-performance-control="${actual}"]`).closest('.sc-functionality-row'),actual);assert(same,actual+' must share its setting row');
   const a=await actualControl.boundingBox(),b=await settingControl.boundingBox();assert(Math.abs(a.y-b.y)<1&&a.x>b.x,'Reference and actual values must be side by side');
   assert.equal(await actualControl.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(241, 220, 100)');assert.equal(await settingControl.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(244, 247, 251)');
  }
  await set({feedStartActual:107.5,feedStopActual:317.25,perfLowMaterialActual:2.4});
  await page.waitForFunction(()=>document.querySelector('[data-performance-control="feedStartActual"]').textContent.includes('107,5'));
  assert((await page.locator('[data-performance-control="feedStartSet"]').innerText()).startsWith('110'));
  await set({__read_errors:{perfLowMaterialActual:1793}});await page.waitForFunction(()=>document.querySelector('[data-performance-control="perfLowMaterialActual"]').textContent==='—');
  assert((await page.locator('[data-performance-control="perfLowMaterialTime"]').innerText()).startsWith('2'));assert(await page.locator('[data-performance-control="perfLowMaterialTime"]').isEnabled());
  await set({__read_errors:{}});await page.waitForFunction(()=>document.querySelector('[data-performance-control="perfLowMaterialActual"]').textContent.includes('2,4'));
  await grid('performance').evaluate(e=>e.scrollTop=0);await page.waitForTimeout(100);await shot('paired-top');
  await grid('performance').evaluate(e=>e.scrollTop=e.scrollHeight);await page.waitForTimeout(100);await shot('paired-low-roll');

  for(const p of catalog){
   await page.locator(`[data-performance-help="${p.key}"]`).click();const overlay=page.locator('.sc-functionality-overlay:visible');
   assert.equal(await overlay.locator('h3').innerText(),p.label);const body=await overlay.locator('.sc-functionality-description').innerText();
   assert(body.includes(p.description));assert(body.includes(p.original));assert(body.includes(p.symbol));assert(await overlay.locator('.sc-functionality-apply').isHidden());
   await page.keyboard.press('Escape');
  }
  assert.equal(writes.length,0,'Reading all descriptions must not write');
  for(const p of catalog.filter(p=>p.readOnly))assert(await page.locator(`[data-performance-control="${p.key}"]`).isDisabled());
  const number=async(key,value,integer)=>{
   await page.locator(`[data-performance-control="${key}"]`).click();assert(await page.locator('[data-number-overlay]').isVisible());
   assert.equal(await page.locator('[data-key=","]').isHidden(),integer);await page.locator('[data-key="clear"]').click();
   for(const digit of String(value))await page.locator(`[data-key="${digit==='.'?',':digit}"]`).click();
   await page.locator('[data-apply-number]').click();await page.waitForFunction(()=>document.querySelector('[data-number-overlay]').hidden);await waitValue(key,value);
  };
  await number('perfFeedAcceleration',60.5,false);await number('perfHydraulicMode',3,true);await number('perfBatchPrewarning',4,true);
  assert.deepEqual(writes.map(w=>w.key),['perfFeedAcceleration','perfHydraulicMode','perfBatchPrewarning']);
  await set({machineState:4,automatic:1});await page.waitForFunction(()=>!document.querySelector('[data-performance-control="perfFeedAcceleration"]').disabled);
  for(const p of catalog)assert.equal(await page.locator(`[data-performance-control="${p.key}"]`).isDisabled(),Boolean(p.readOnly));
  await page.locator('[data-performance-help="perfFeedAcceleration"]').click();assert(await page.locator('.sc-functionality-overlay:visible').isVisible());await page.keyboard.press('Escape');
  await set({machineState:5,automatic:0});await waitValue('perfFeedAcceleration',60.5);
  await set({__connection:false});await page.waitForFunction(()=>document.querySelector('[data-performance-control="perfFeedAcceleration"]').disabled);await set({__connection:true});await waitValue('perfFeedAcceleration',60.5);
  for(const theme of ['classic','dark']){
   const {data:s}=await api('/api/state');assert.equal((await api('/api/options',{...s.options,snow:Number(s.options.snow),animations:1,wallpaper:Number(s.options.wallpaper),exitButton:Number(s.options.exitButton),theme})).status,200);
   await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);for(const key of ['feedStartActual','feedStopActual','perfLowMaterialActual'])assert.equal(await page.locator(`[data-performance-control="${key}"]`).evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(241, 220, 100)');
   for(const size of [{width:1024,height:600},{width:1920,height:1080},{width:3840,height:2160}]){await page.setViewportSize(size);await checkFrame('performance');}
   await page.setViewportSize({width:1024,height:600});await grid('performance').evaluate(e=>e.scrollTop=0);await shot('performance-'+theme);await nav('menu');await page.locator('[data-open-node="edge"]').click();const bounds=await page.locator('[data-page-content="edge"]').boundingBox();assert(bounds.y+bounds.height<=600.5);for(const control of await page.locator('[data-page-content="edge"] button').all()){const r=await control.boundingBox();assert(r.y>=60&&r.y+r.height<=600.5);}await shot('edge-'+theme);await open('performance');
  }
  for(const code of ['en','tr']){
   assert.equal((await api('/api/language',{language:code})).status,200);await page.reload();await page.waitForFunction(code=>document.documentElement.lang===code,code);await open('performance');
   for(const p of catalog.filter(p=>!p.pairedWith)){const label=await page.locator(`[data-performance-help="${p.key}"] strong`).innerText();assert.equal(label,code==='en'?p.en:p.original);}
   await shot('performance-'+code);
  }
  await api('/api/auth/operator',{});await page.waitForFunction(()=>document.querySelector('#guris-scada-demo').dataset.activePage==='menu');assert(await page.locator('[data-open-node="options"]').isHidden());
  await api('/api/language',{language:'ru'});await page.reload();await page.waitForFunction(()=>document.documentElement.lang==='ru');await nav('menu');await page.locator('[data-open-node="edge"]').click();
  assert.equal(await page.locator('[data-edit="edgeSensitivity"]').count(),1);await page.waitForFunction(()=>!document.querySelector('[data-edit="edgeSensitivity"]').disabled);
  await page.locator('[data-edit="edgeSensitivity"]').click();assert((await page.locator('#guris-scada-entry-hint').innerText()).includes('10'));assert(!(await page.locator('[data-key=","]').isHidden()));
  await page.locator('[data-key="clear"]').click();for(const key of ['0',',','2','5'])await page.locator(`[data-key="${key}"]`).click();await page.locator('[data-apply-number]').click();await page.waitForFunction(()=>document.querySelector('[data-number-overlay]').hidden&&document.querySelector('[data-value="edgeSensitivity"]').textContent==='0,25');
  await set({__connection:false});await page.waitForFunction(()=>document.querySelector('[data-edit="edgeSensitivity"]').disabled);await set({__connection:true});await page.waitForFunction(()=>!document.querySelector('[data-edit="edgeSensitivity"]').disabled);
  assert.equal(writes.at(-1).key,'edgeSensitivity');assert.equal(Number(writes.at(-1).value),.25);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(writes.length,4);
  fs.writeFileSync(path.join(out,'release23-browser-results.json'),JSON.stringify({passed:true,parameters:25,readings:3,pairedRows:3,sharedEdgeSensitivity:1,functionality:62,touchSwipes:4,parameterDescriptions:28,simulatedWrites:writes.map(w=>w.key),layouts:['1024x600','1920x1080','3840x2160'],themes:['dark','classic'],languages:['ru','en','tr'],errors,external},null,2));
  console.log('PASS: paired reference/actual rows, shared edge sensitivity, continuous lists, real touch swipes, all PERFORMANS help, native REAL/INT/DINT writes, roles/states/offline, RU/EN/TR, both themes and HD/4K');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
