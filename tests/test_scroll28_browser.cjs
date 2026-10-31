'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const [url,token,control,out]=process.argv.slice(2);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER||(process.platform==='win32'?'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe':undefined),headless:true});
 const errors=[],writes=[],results=[];
 try{
  const context=await browser.newContext({viewport:{width:1920,height:1080},hasTouch:true}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(write|command|conveyor-mode)$/.test(r.url()))writes.push(r.url());});
  await page.addInitScript(()=>{const Native=Date;window.Date=class extends Native{constructor(...args){super(...(args.length?args:[1793400000000]));}static now(){return 1793400000000;}};});
  const api=(route,body)=>page.evaluate(async({route,body})=>{const r=await fetch(route,{method:body===undefined?'GET':'POST',headers:{'X-SCADA-Token':window.SCADA_BOOT.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,data:await r.json()};},{route,body});
  const openEngineering=async()=>{await page.locator('.sc-nav-button[data-page="menu"]').click();await page.locator('[data-open-node="options"]').click();await page.locator('[data-engineering-section="CENE"]').click();};
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#scada-startup-notice').hidden);if(!process.env.SCADA_SCROLL_OFFLINE)await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
  assert.equal((await api(process.env.SCADA_SCROLL_OFFLINE?'/api/auth/login':'/api/auth/setup',{password:process.env.SCADA_SCROLL_PASSWORD||'283110'})).status,200);await page.waitForFunction(()=>document.querySelector('[data-operator-name]').textContent==='Инженер');
  await openEngineering();await page.waitForTimeout(5000);
  const client=await context.newCDPSession(page);
  const ancestors=await page.locator('[data-page-content="engineering"] .sc-functionality-grid').evaluate(e=>{const a=[];for(let n=e;n;n=n.parentElement){const c=getComputedStyle(n);a.push({tag:n.tagName,class:n.className,transform:c.transform,filter:c.filter,backdropFilter:c.backdropFilter,overflowY:c.overflowY,position:c.position,animation:c.animation,transition:c.transition,overscroll:c.overscrollBehaviorY});}return a;});
  const rootClient=await browser.newBrowserCDPSession();let gpu={};try{gpu=(await rootClient.send('SystemInfo.getInfo')).gpu;}catch{}
  const variants={baseline:'/* unmodified baseline */',noInteractiveEffect:'.sc-editable{transition:none}.sc-editable:active:not(:disabled){filter:none;transform:none}',noMotion:'.sc-app *{animation:none;transition:none}',noScale:'#guris-scada-demo{transform:translate(-50%,-50%)!important}',noOverscroll:'[data-page-content="engineering"] .sc-functionality-grid{overscroll-behavior:none}',isolateList:'[data-page-content="engineering"] .sc-functionality-grid{isolation:isolate;contain:paint}'};
  for(const [variant,css] of Object.entries(variants)){
   const style=await page.addStyleTag({content:css});await page.waitForTimeout(200);
   const list=page.locator('[data-page-content="engineering"] .sc-functionality-grid');
   await list.evaluate(e=>e.scrollTop=e.scrollHeight);await page.waitForTimeout(500);
   const rect=await list.boundingBox(),x=Math.floor(rect.x+rect.width*.1),y=Math.floor(rect.y+rect.height*.6);
   const geometry=()=>list.evaluate(e=>{const box=e.getBoundingClientRect(),scale=box.width/e.offsetWidth;return{scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,box:[box.x,box.y,box.width,box.height],rows:[...e.children].map(n=>{const r=n.getBoundingClientRect();return [r.x,r.width,r.height,r.y+e.scrollTop*scale];})};});
   const before=await geometry();await list.screenshot({path:path.join(out,variant+'-before.png')});
   await client.send('Input.synthesizeScrollGesture',{x,y,yDistance:-400,speed:1600,gestureSourceType:'touch',repeatCount:5,repeatDelayMs:30,preventFling:false});
   const after=await geometry();await list.screenshot({path:path.join(out,variant+'-after.png')});
   await page.waitForTimeout(1200);const settled=await geometry();await list.screenshot({path:path.join(out,variant+'-settled.png')});
   await client.send('Input.synthesizeScrollGesture',{x,y,yDistance:240,speed:900,gestureSourceType:'touch',preventFling:true});await page.waitForTimeout(100);
   let reversed=await geometry(),reverseInput='synthesized touch';
   if(reversed.scrollTop===before.scrollTop){
    reverseInput='raw touch';
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:y-100}]});
    for(let step=1;step<=12;step++){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-100+step*15}]});await page.waitForTimeout(20);}
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);reversed=await geometry();
   }
   if(reversed.scrollTop===before.scrollTop){reverseInput='wheel fallback';await page.mouse.move(x,y);await page.mouse.wheel(0,-240);await page.waitForTimeout(200);reversed=await geometry();}
   assert(reversed.scrollTop<before.scrollTop,`${variant}: reverse scroll must move`);
   await list.evaluate(e=>e.scrollTop=e.scrollHeight);await page.waitForTimeout(300);const returned=await geometry();await list.screenshot({path:path.join(out,variant+'-returned.png')});
   function delta(a,b){return Math.max(...a.rows.flatMap((r,i)=>r.map((n,j)=>Math.abs(n-b.rows[i][j]))));}
   const d=Math.max(delta(before,after),delta(before,settled),delta(before,returned));assert(d<.25,`${variant}: actual row geometry drift ${d}`);
   results.push({variant,maxGeometryDriftPx:d,scrollTop:before.scrollTop,reversedTo:reversed.scrollTop,reverseInput,settled,after});await style.evaluate(e=>e.remove());
  }
  await page.locator('.sc-nav-button[data-page="menu"]').click();await page.locator('[data-open-node="temperature"]').click();await page.waitForTimeout(1000);
  const heat=page.locator('[data-page-content="temperature"] .sc-heat-list');await heat.evaluate(e=>e.scrollTop=e.scrollHeight);const heatBox=await heat.boundingBox();
  await client.send('Input.synthesizeScrollGesture',{x:Math.floor(heatBox.x+heatBox.width*.7),y:Math.floor(heatBox.y+heatBox.height*.6),yDistance:-500,speed:1400,gestureSourceType:'touch',repeatCount:5,repeatDelayMs:30,preventFling:false});
  await heat.screenshot({path:path.join(out,'temperature-after.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  fs.writeFileSync(path.join(out,'scroll-investigation.json'),JSON.stringify({browser:browser.version(),platform:process.platform,ancestors,gpu,results,errors,writes,temperatureScrolls:await heat.evaluate(e=>e.scrollHeight>e.clientHeight)},null,2));
  console.log('PASS: repeated touch gestures at bottom, settle/reverse/return, no geometry drift in six effect variants, no PLC writes');
 }finally{await browser.close();}
})().catch(e=>{console.error(String(e.stack||e).replace(/([?&]k=)[a-f0-9]+/g,'$1[redacted]'));process.exitCode=1;});
