'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),{chromium}=require('playwright');
const [url,token,control,out]=process.argv.slice(2);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true,args:['--disable-gpu']});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:600},hasTouch:true,acceptDownloads:true}),page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(write|command|unwinder|cleaning-add)$/.test(r.url()))writes.push(r.url());});
  const api=(route,body)=>page.evaluate(async({route,body})=>{const r=await fetch(route,{method:body===undefined?'GET':'POST',headers:{'X-SCADA-Token':window.SCADA_BOOT.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,data:await r.json()};},{route,body});
  const open=async()=>{await page.locator('.sc-nav-button[data-page="menu"]').click();await page.locator('.sc-node-tile[data-page="scada"]').click();await page.locator('[data-diagnostic-export="12"]').scrollIntoViewIfNeeded();};
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
  assert.equal((await api('/api/auth/setup',{password:'221025'})).status,200);await page.waitForFunction(()=>document.querySelector('[data-operator-name]').textContent==='Инженер');await open();
  await page.waitForFunction(()=>document.querySelector('[data-diagnostic-status]').textContent.includes('Диагностика записывается'));
  const exports=[];
  for(const hours of [12,24]){
   const button=page.locator(`[data-diagnostic-export="${hours}"]`),box=await button.boundingBox();assert(box.x>=0&&box.x+box.width<=1025&&box.y>=0&&box.y+box.height<=601);
   const downloaded=page.waitForEvent('download',{timeout:30000});await button.click();const download=await downloaded;assert.equal(await download.failure(),null);const saved=path.join(out,download.suggestedFilename());await download.saveAs(saved);
   const result=JSON.parse(cp.execFileSync('python3',[path.resolve(__dirname,'../tools/analyze_diagnostics.py'),saved],{encoding:'utf8',maxBuffer:2*1024*1024}));assert.equal(result.zipCrcValid,true);assert.equal(result.requestedHours,hours);assert.equal(result.appVersion,'0.1.25');assert(result.observationCounts.samples>0);exports.push({hours,size:fs.statSync(saved).size});
   await page.waitForFunction(()=>!document.querySelector('[data-diagnostic-export="12"]').disabled);
   if(hours===12){const opts=(await api('/api/state')).data.options;await api('/api/options',{...opts,snow:Number(opts.snow),animations:Number(opts.animations),wallpaper:Number(opts.wallpaper),exitButton:Number(opts.exitButton),theme:'classic'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='classic');}
   await page.screenshot({path:path.join(out,'diagnostics-'+hours+'h.png')});
  }
  for(const lang of ['en','tr','ru']){
   assert.equal((await api('/api/language',{language:lang})).status,200);await page.reload();await page.waitForFunction(lang=>document.documentElement.lang===lang,lang);await open();assert(await page.locator('[data-diagnostic-export="24"]').isVisible());assert.equal(await page.locator('.sc-diagnostic-exports').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  }
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'diagnostics-browser-results.json'),JSON.stringify({passed:true,exports,viewport:'1024x600',themes:['dark','classic'],languages:['ru','en','tr'],unexpectedWrites:writes,errors},null,2));console.log('PASS: recorder health, native 12/24-hour ZIP downloads, CRC/analysis, touchscreen layout, both themes and three languages; no PLC writes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
