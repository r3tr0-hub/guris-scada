'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const [url,token,control,out]=process.argv.slice(2);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true,args:['--disable-gpu']});
 const errors=[],writes=[];
 try{
  const context=await browser.newContext({viewport:{width:1024,height:600},hasTouch:true}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(write|command|unwinder|cleaning-add)$/.test(r.url()))writes.push(r.url());});
  const api=(route,body)=>page.evaluate(async({route,body})=>{const r=await fetch(route,{method:body===undefined?'GET':'POST',headers:{'X-SCADA-Token':window.SCADA_BOOT.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,data:await r.json()};},{route,body});
  const set=async values=>assert((await fetch(control,{method:'POST',body:JSON.stringify(values)})).ok);
  const go=async key=>{
   await page.evaluate(key=>{const e=(key==='jobs'?document.querySelector('[data-production-home]'):null)||document.querySelector(`[data-page="${key}"]`)||document.querySelector(`button[data-open-node="${key}"]`);if(e)e.click();},key);
   await page.waitForTimeout(90);
   assert(await page.locator(`[data-page-content="${key}"]`).isVisible(),key);
  };
  const shot=async name=>{await page.screenshot({path:path.join(out,name+'.png')});};
  const theme=async name=>{
   const options=(await api('/api/state')).data.options;
   assert.equal((await api('/api/options',{...options,snow:Number(options.snow),animations:Number(options.animations),wallpaper:Number(options.wallpaper),exitButton:Number(options.exitButton),theme:name})).status,200);
   await page.waitForFunction(name=>document.documentElement.dataset.theme===name,name);await page.waitForTimeout(180);
  };
  const geometry=()=>page.evaluate(()=>[...document.querySelectorAll('.sc-topbar,.sc-sidebar,[data-page-content]:not([hidden]) button,.sc-edge-row')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return [e.dataset.edit||e.dataset.openNode||e.className,...['x','y','width','height'].map(k=>Math.round(r[k]*10)/10)];}));
  const edgeBounds=()=>page.locator('.sc-edge-row').evaluateAll(rows=>rows.map(row=>{
   const p=row.getBoundingClientRect(),children=[...row.querySelectorAll('.sc-edge-reading,.sc-edge-jog-buttons,.sc-node-toggle-row,.sc-edge-position,.sc-edge-physical-mode')];
   return children.every(e=>{const r=e.getBoundingClientRect();return r.top>=p.top-.5&&r.bottom<=p.bottom+.5&&r.left>=p.left-.5&&r.right<=p.right+.5;});
  }));
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
  // Populate optional equipment only through the existing loopback peer.
  await set({equipmentTemperature:1,equipmentGlue:1,equipmentSeamHidden:0,equipmentLiner:1,equipmentTakeoff:1,equipmentEjectServo:1});
  assert.equal((await api('/api/auth/setup',{password:'271026'})).status,200);
  await page.waitForFunction(()=>document.querySelector('[data-operator-name]').textContent==='Инженер');
  const pages=['home','belt','menu','actuators','photomark','production','jobs','alarms','io','edge','temperature','glue','longitudinal','eject','liner','takeoff','tension','air','feedangles','knife','unwinder','scada','options','functionality','performance','clock','about','manuals'];
  // Every reachable page, same data, live palette switch, unchanged geometry.
  for(const key of pages){
   await go(key);if(key==='scada')await page.waitForTimeout(1300);await theme('dark');const dark=await geometry();await shot('data-dark-'+key);
   await theme('classic');assert.deepEqual(await geometry(),dark,'theme changed geometry on '+key);await shot('data-classic-'+key);
   if(key==='edge')assert((await edgeBounds()).every(Boolean),'edge children escape cards');
  }
  // All 30 generated engineering sections.
  await go('options');const sections=await page.locator('[data-engineering-section]').evaluateAll(es=>es.map(e=>e.dataset.engineeringSection));
  for(const name of ['dark','classic'])for(const section of sections){await theme(name);await go('options');await page.locator('[data-engineering-section]').filter({hasText:''}).evaluateAll((es,key)=>es.find(e=>e.dataset.engineeringSection===key).click(),section);await page.waitForTimeout(100);await shot(name+'-engineering-'+sections.indexOf(section));}
  // Numeric keyboard and operator/auth, connection, language, help dialogs.
  for(const name of ['dark','classic']){
   await theme(name);await go('home');await page.locator('[data-edit="width"]').click();await shot(name+'-number');await page.locator('[data-cancel-number]').click();
   await go('scada');await page.locator('[data-open-connect]').click();await shot(name+'-connection');await page.locator('[data-connect-overlay] [data-close-overlay]').click();
   await page.locator('[data-open-language]').click();await shot(name+'-language');await page.locator('[data-language-overlay] [data-close-overlay]').click();
   await go('photomark');await page.locator('[data-photo-help]').click();await shot(name+'-photo-help');await page.locator('[data-photo-help-cancel]').click();
  }
  // Additional dialog shells use inert DOM fixtures; never press confirmation.
  for(const name of ['dark','classic']){
   await theme(name);await go('home');
   const overlays=await page.locator('.sc-overlay').evaluateAll(es=>es.map((e,i)=>({i,kind:[...e.attributes].find(a=>a.name.endsWith('-overlay'))?.name||e.className})));
   for(const o of overlays){
    await page.locator('.sc-overlay').nth(o.i).evaluate(e=>e.hidden=false);
    await shot(name+'-dialog-shell-'+o.i);
    await page.locator('.sc-overlay').nth(o.i).evaluate(e=>e.hidden=true);
   }
   await page.locator('[data-toast]').evaluate(e=>{e.hidden=false;e.dataset.tone='danger';e.textContent='Проверка сообщения об ошибке / Error';});await shot(name+'-error-toast');await page.locator('[data-toast]').evaluate(e=>e.hidden=true);
  }
  await set({__connection:false});await page.waitForTimeout(2000);
  await page.setViewportSize({width:1920,height:1080});
  for(const name of ['dark','classic']){
   await theme(name);
   for(const key of pages){await go(key);await shot('offline-'+name+'-'+key);}
   await go('belt');assert(await page.locator('[data-offset-marker]').isHidden(),'unknown offset has no marker');
   await go('menu');assert.equal(await page.locator('.sc-node-grid [data-open-node="knife"]').count(),1);
   assert.equal(await page.locator('[data-open-node="knife"]').getAttribute('data-menu-cell'),'2:3');
   const painted=await page.locator('.sc-node-grid canvas').evaluateAll(es=>es.map(e=>[e.dataset.mechanism,e.getContext('2d').getImageData(0,0,e.width,e.height).data.some((v,i)=>i%4===3&&v>0)]));assert(painted.every(x=>x[1]),JSON.stringify(painted));
  }
  // Persisted theme survives reload. Both roles and selected larger typeface at both viewports.
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.theme==='classic');
  for(const size of [{width:1024,height:600},{width:1920,height:1080}]){
   await page.setViewportSize(size);
   for(const name of ['dark','classic']){
    assert.equal((await api('/api/auth/login',{password:'271026'})).status,200);await page.waitForTimeout(200);await theme(name);
    for(const role of ['engineer','operator']){
     if(role==='operator')assert.equal((await api('/api/auth/operator',{})).status,200);
     await page.waitForTimeout(200);
     await page.evaluate(()=>document.querySelector('#guris-scada-demo').dataset.font='verdana');
     for(const key of ['home','belt','edge','menu','io']){await go(key);if(key==='edge')assert((await edgeBounds()).every(Boolean),'large font edge containment');await shot(`${size.width}-${role}-${name}-verdana-${key}`);}
    }
   }
   if(size.width===1024){assert.equal((await api('/api/auth/login',{password:'271026'})).status,200);await page.waitForTimeout(200);}
  }
  // QA-only +20% glyph stress, no production setting or machine operation.
  await page.setViewportSize({width:1024,height:600});
  assert.equal((await api('/api/auth/login',{password:'271026'})).status,200);await page.waitForTimeout(200);
  for(const name of ['dark','classic']){
   await theme(name);
   await page.evaluate(()=>{
    window.__fontStress=[...document.querySelectorAll('.sc-app *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>[e,e.style.fontSize,parseFloat(getComputedStyle(e).fontSize)]);
    for(const [e,,px] of window.__fontStress)e.style.fontSize=px*1.2+'px';
   });
   for(const key of ['home','belt','edge','menu','io','scada','options','actuators','photomark']){await go(key);if(key==='edge')assert((await edgeBounds()).every(Boolean),'20% font stress containment');assert(await page.locator('.sc-user-card').evaluate(e=>{const p=e.getBoundingClientRect();return [...e.querySelectorAll('.sc-time,.sc-date,.sc-user-name')].every(c=>c.getBoundingClientRect().right<=p.right+.5)}),'header text containment at 120%');await shot('font120-'+name+'-'+key);}
   await page.evaluate(()=>{for(const [e,size] of window.__fontStress)e.style.fontSize=size;});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,pages,engineeringSections:sections.length,errors,writes,screenshots:fs.readdirSync(out).filter(f=>f.endsWith('.png')).length},null,2));
  console.log('PASS: visual theme matrix, page geometry, edge containment, offline icons/offset, no machine writes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
