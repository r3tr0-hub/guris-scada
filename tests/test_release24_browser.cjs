'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{chromium}=require('playwright');
const [url,token,control,out]=process.argv.slice(2),catalog=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../ui/engineering.json'))).sections;
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true,args:['--disable-gpu']});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:600},hasTouch:true}),page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(write|command)$/.test(r.url()))writes.push(JSON.parse(r.postData()));});
  const api=(route,body)=>page.evaluate(async({route,body})=>{const r=await fetch(route,{method:body===undefined?'GET':'POST',headers:{'X-SCADA-Token':window.SCADA_BOOT.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};},{route,body});
  const set=async values=>assert((await fetch(control,{method:'POST',body:JSON.stringify(values)})).ok);
  const nav=name=>page.locator(`.sc-nav-button[data-page="${name}"]`).click();
  const open=async s=>{await nav('menu');await page.locator('[data-open-node="options"]').click();await page.locator(`[data-engineering-section="${s.original}"]`).click();await page.waitForFunction(id=>document.querySelector('#guris-scada-demo').dataset.activePage==='engineering'&&document.querySelector('[data-page-content="engineering"] h3').textContent===id,s.title);};
  const sectionPage=page.locator('[data-page-content="engineering"]'),grid=sectionPage.locator('.sc-functionality-grid');
  const waitReady=key=>page.waitForFunction(key=>{const e=document.querySelector(`[data-page-content="engineering"] [data-engineering-control="${key}"]`);return e&&!e.disabled;},key,{timeout:20000});
  const checkLayout=async()=>{assert.equal(await grid.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);const r=await grid.boundingBox();assert(r.x>=0&&r.y>=0&&r.x+r.width<=1024.5&&r.y+r.height<=600.5);};
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);assert.equal((await api('/api/engineering-view',{section:'mainRoller'})).status,403);
  assert.equal((await api('/api/auth/setup',{password:'221024'})).status,200);await page.waitForFunction(()=>document.querySelector('[data-operator-name]').textContent==='Инженер');
  for(const s of catalog){
   await open(s);const first=s.parameters.find(p=>!p.readOnly&&!p.cleaning);if(first)await waitReady(first.key);
   await checkLayout();assert.equal(await sectionPage.locator('.sc-functionality-row').count(),s.parameters.filter(p=>!p.pairedWith).length,s.id);
   for(const p of s.parameters.filter(p=>p.pairedWith)){
    const same=await sectionPage.locator(`[data-engineering-control="${p.key}"]`).evaluate((e,key)=>e.closest('.sc-functionality-row')===document.querySelector(`[data-page-content="engineering"] [data-engineering-control="${key}"]`).closest('.sc-functionality-row'),p.pairedWith);assert(same,s.id+': '+p.key);
    await page.waitForFunction(key=>{const e=document.querySelector(`[data-page-content="engineering"] [data-engineering-control="${key}"]`);return e&&e.textContent!=='—'&&getComputedStyle(e).backgroundColor==='rgb(241, 220, 100)';},p.key,{timeout:20000});
   }
   const help=s.parameters.find(p=>!p.pairedWith);await sectionPage.locator(`[data-engineering-help="${help.key}"]`).click();const dialog=page.locator('.sc-functionality-overlay:visible');assert((await dialog.innerText()).includes(help.description));assert((await dialog.innerText()).includes(help.symbol));await page.keyboard.press('Escape');
   await grid.evaluate(e=>e.scrollTop=e.scrollHeight);await checkLayout();
  }
  assert.equal(writes.length,0,'Opening every section and description must not write');
  const s=catalog.find(s=>s.id==='mainRoller'),numeric=s.parameters.find(p=>p.symbol.endsWith('rMerdaneCap1'));
  await open(s);await waitReady(numeric.key);await set({machineState:4,automatic:1});await page.waitForTimeout(700);assert(await sectionPage.locator(`[data-engineering-control="${numeric.key}"]`).isEnabled());
  await sectionPage.locator(`[data-engineering-control="${numeric.key}"]`).click();await page.locator('[data-key="clear"]').click();for(const k of ['9','8',',','5'])await page.locator(`[data-key="${k}"]`).click();await page.locator('[data-apply-number]').click();await page.waitForFunction(()=>document.querySelector('[data-number-overlay]').hidden);await page.waitForFunction(key=>document.querySelector(`[data-page-content="engineering"] [data-engineering-control="${key}"]`).textContent.includes('98,5'),numeric.key);
  await page.screenshot({path:path.join(out,'engineering-main-dark.png')});
  const heat=catalog.find(s=>s.id==='heatTuning');await open(heat);const time=heat.parameters.find(p=>p.type==='TIME');await waitReady(time.key);await sectionPage.locator(`[data-engineering-control="${time.key}"]`).click();assert(await page.locator('[data-key=","]').isHidden());await page.locator('[data-cancel-number]').click();
  await page.screenshot({path:path.join(out,'engineering-heat-dark.png')});
  const factory=catalog.find(s=>s.id==='factory'),code=factory.parameters.find(p=>p.format==='hex12'&&!p.readOnly);await open(factory);await waitReady(code.key);await sectionPage.locator(`[data-engineering-control="${code.key}"]`).click();const hex=page.locator('.sc-engineering-hex-overlay:visible');await hex.waitFor();await page.keyboard.type('A0123456789F');assert.equal(await hex.locator('input').inputValue(),'A0123456789F');await hex.getByRole('button',{name:'Применить',exact:true}).click();await hex.waitFor({state:'hidden'});await page.waitForFunction(key=>document.querySelector(`[data-page-content="engineering"] [data-engineering-control="${key}"]`).textContent==='A0123456789F',code.key);
  assert.deepEqual(writes.map(w=>w.key),[numeric.key,code.key]);
  await open(catalog.find(s=>s.id==='dancer1'));const dancer=catalog.find(s=>s.id==='dancer1').parameters.find(p=>p.type==='BOOL');await waitReady(dancer.key);await sectionPage.locator(`[data-engineering-control="${dancer.key}"]`).click();assert.equal(writes.length,2);await page.locator('.sc-functionality-overlay:visible .sc-functionality-apply').click();await page.waitForFunction(key=>document.querySelector(`[data-page-content="engineering"] [data-engineering-control="${key}"]`).getAttribute('aria-checked')==='true',dancer.key);
  await open(s);await waitReady(numeric.key);
  for(const theme of ['classic','dark']){
   const opts=(await api('/api/state')).data.options;assert.equal((await api('/api/options',{...opts,snow:Number(opts.snow),animations:1,wallpaper:Number(opts.wallpaper),exitButton:Number(opts.exitButton),theme})).status,200);await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);await checkLayout();
   await page.screenshot({path:path.join(out,'engineering-'+theme+'.png')});
  }
  for(const lang of ['en','tr','ru']){
   await api('/api/language',{language:lang});await page.reload();await page.waitForFunction(lang=>document.documentElement.lang===lang,lang);await nav('menu');await page.locator('[data-open-node="options"]').click();assert.equal(await page.locator('[data-engineering-section="ANA MERDANE"]').innerText(),lang==='en'?s.en:lang==='tr'?s.original:s.title);await page.locator('[data-engineering-section="ANA MERDANE"]').click();await waitReady(numeric.key);
   assert.equal(await sectionPage.locator(`[data-engineering-help="${numeric.key}"] strong`).innerText(),lang==='en'?numeric.en:lang==='tr'?numeric.original:numeric.label);
  }
  await nav('home');await page.waitForTimeout(500);assert.equal(Object.keys((await api('/api/state')).data.fields).length,256);
  await api('/api/auth/operator',{});await nav('menu');await page.waitForFunction(()=>document.querySelector('[data-open-node="options"]').hidden);assert(await page.locator('[data-open-node="options"]').isHidden());assert.equal((await api('/api/engineering-view',{section:'factory'})).status,403);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'release24-browser-results.json'),JSON.stringify({passed:true,sections:catalog.length,pairedReadings:catalog.reduce((n,s)=>n+s.parameters.filter(p=>p.pairedWith).length,0),writes:writes.map(w=>w.key),errors},null,2));console.log('PASS: all 30 sections, layouts, paired live values, descriptions, live editing, TIME keypad, HEX12 entry, confirmation, page subscription and roles');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
