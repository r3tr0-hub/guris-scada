'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const [url,token,control,output]=process.argv.slice(2);
async function main(){
 const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true,args:['--disable-gpu']});
 const errors=[],posts=[],results=[];
 try {
  const context=await browser.newContext({viewport:{width:1024,height:600},timezoneId:'Europe/Moscow'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{if(r.method()==='POST')posts.push(new URL(r.url()).pathname);});
  const api=(route,body)=>page.evaluate(async({route,body})=>{const r=await fetch(route,{method:body?'POST':'GET',headers:{'X-SCADA-Token':window.SCADA_BOOT.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()};},{route,body});
  const set=async values=>assert((await fetch(control,{method:'POST',body:JSON.stringify(values)})).ok);
  const theme=async value=>{const s=(await api('/api/state')).data;assert.equal((await api('/api/options',{...Object.fromEntries(['snow','animations','wallpaper','exitButton'].map(k=>[k,Number(s.options[k])])),theme:value})).status,200);await page.waitForFunction(t=>document.documentElement.dataset.theme===t,value);};
  const go=async key=>{const alarmClose=page.locator('[data-alarms-overlay] [data-close-overlay]');if(await alarmClose.isVisible())await alarmClose.click();await page.locator('.sc-nav-button[data-page="menu"]').click();if(key!=='menu'){if(['home','belt','actuators','photomark','alarms'].includes(key))await page.locator(`.sc-nav-button[data-page="${key}"]`).click();else if(key==='about')await page.locator('.sc-title-brand').click();else if(key==='clock')await page.locator('.sc-timebox').click();else if(key==='scada')await page.locator('[data-page="scada"][data-engineer-only]').click();else await page.locator(`[data-page-content="menu"] [data-open-node="${key}"]`).click();}await page.waitForTimeout(120);};
  const snapshot=async key=>{await page.screenshot({path:path.join(output,key+'.png')});};
  const metrics=()=>page.evaluate(()=>Array.from(document.querySelectorAll('.sc-main,.sc-sidebar,.sc-topbar,.sc-home .sc-field,.sc-counters')).filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return{cls:e.className,x:b.x,y:b.y,w:b.width,h:b.height,bg:s.backgroundColor,fg:s.color};}));
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  const darkBaseline=await metrics();await snapshot('theme-dark-home');
  assert.equal((await api('/api/options',{snow:1,animations:1,wallpaper:1,exitButton:1,theme:'classic'})).status,403);
  assert.equal((await api('/api/auth/setup',{password:'262016'})).status,200);
  await page.waitForFunction(()=>!document.querySelector('[data-page="scada"][data-engineer-only]').hidden);
  await go('scada');
  await page.locator('[data-theme-choice="classic"]').click();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='classic'&&!document.querySelector('[data-theme-choice="classic"]').disabled);
  assert.equal((await api('/api/state')).data.options.theme,'classic');
  assert.equal(await page.locator('[data-theme-choice="classic"]').getAttribute('aria-pressed'),'true');
  await snapshot('theme-classic-options');
  await go('home');await snapshot('theme-classic-home');
  await page.locator('[data-edit="width"]').click();
  assert(await page.locator('[data-number-overlay]').isVisible());await snapshot('theme-classic-keypad');
  assert.equal(await page.locator('.sc-numpad .sc-key').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  await page.locator('[data-cancel-number]').click();
  // Every destination must fit the same 1024x600 shell. Scrollable options
  // retain their own scrolling instead of pushing the operator controls out.
  for(const key of ['home','belt','menu','edge','temperature','glue','longitudinal','eject','liner','takeoff','tension','air','feedangles','knife','unwinder','ballerina','actuators','photomark','alarms','clock','about','options','scada']){
   await go(key);
   const layout=await page.evaluate(()=>{const app=document.querySelector('.sc-app'),main=document.querySelector('.sc-main'),top=document.querySelector('.sc-topbar');return{w:app.scrollWidth,h:app.scrollHeight,mainH:main.scrollHeight,top:top.getBoundingClientRect().toJSON(),bodyOverflow:document.body.scrollWidth>innerWidth};});
   assert.equal(layout.w,1024,key);assert.equal(layout.h,600,key);assert(!layout.bodyOverflow,key);assert(layout.top.y>=0&&layout.top.bottom<=600,key);
   results.push({page:key,layout});
   if(['menu','temperature','clock','options','about','longitudinal'].includes(key))await snapshot('theme-classic-'+key);
  }
  // Paused drawings must repaint on a theme change without an animation tick.
  await go('scada');await page.locator('[data-option="animations"]').click();
  await page.waitForFunction(()=>document.querySelector('.sc-app').dataset.motion==='off'&&!document.querySelector('[data-option="animations"]').disabled);
  await go('menu');const canvas=page.locator('[data-page-content="menu"] canvas').first();
  const classicPixels=await canvas.evaluate(c=>c.toDataURL());
  await theme('dark');const darkPixels=await canvas.evaluate(c=>c.toDataURL());assert.notEqual(darkPixels,classicPixels);
  await theme('classic');assert.equal(await canvas.evaluate(c=>c.toDataURL()),classicPixels);
  await page.waitForTimeout(200);assert.equal(await canvas.evaluate(c=>c.toDataURL()),classicPixels);
  await go('home');await theme('dark');assert.deepEqual(await metrics(),darkBaseline);
  await theme('classic');
  // Offline and ADS non-RUN states keep their own status colours.
  await set({__connection:false});await page.waitForFunction(()=>document.querySelector('[data-indicator="ads"]').dataset.tone==='danger');
  const offline=await page.locator('[data-indicator="ads"] .sc-indicator-text').evaluate(e=>({text:e.textContent,color:getComputedStyle(e).color}));
  assert.equal(offline.text,'Нет связи');assert.equal(offline.color,'rgb(165, 16, 38)');await snapshot('theme-classic-offline');
  await set({__connection:true,__ads_state:4});await page.waitForFunction(()=>document.querySelector('[data-indicator="ads"]').dataset.tone==='warning');
  assert.equal(await page.locator('[data-indicator="ads"] .sc-indicator-text').evaluate(e=>getComputedStyle(e).color),'rgb(116, 64, 0)');
  await set({__ads_state:5});await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
  await page.locator('[data-edit-operator]').click();await page.locator('[data-auth-role="engineer"]').click();
  assert(await page.locator('[data-pin-overlay]').isHidden());await snapshot('theme-classic-login');
  await page.locator('[data-auth-password]').click();assert(await page.locator('[data-pin-overlay]').isVisible());await snapshot('theme-classic-pin');
  await page.locator('[data-pin-cancel]').click();await page.locator('[data-close-overlay="[data-operator-overlay]"]').click();
  // Language reload uses the saved theme in initial HTML, before app.js polls.
  await page.locator('[data-open-language]').click();await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.locator('[data-choose-language="en"]').click()]);
  await page.waitForFunction(()=>document.documentElement.lang==='en'&&document.documentElement.dataset.theme==='classic');
  assert.match(await page.content(),/data-theme="classic"/);await go('scada');assert.equal(await page.locator('[data-theme-choice="classic"] > span').nth(1).textContent(),'Classic');
  await page.reload();await page.waitForFunction(()=>document.querySelector('[data-page-title]').textContent==='Home');assert.equal(await page.locator('html').getAttribute('data-theme'),'classic');
  // Logout retains appearance but hides the engineer-only configuration.
  await api('/api/auth/operator',{});await page.waitForFunction(()=>document.querySelector('[data-page="scada"][data-engineer-only]').hidden);
  assert.equal(await page.locator('html').getAttribute('data-theme'),'classic');
  // Pixel density remains responsive after live theme changes, also at 4K.
  for(const size of [{width:1920,height:1080},{width:3840,height:2160}]){
   await page.setViewportSize(size);await go('menu');
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-page-content="menu"] canvas')).every(c=>{const b=c.getBoundingClientRect();return c.width===Math.ceil(b.width*devicePixelRatio)&&c.height===Math.ceil(b.height*devicePixelRatio);}));
   results.push({size,canvas:await canvas.evaluate(c=>({width:c.width,height:c.height}))});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(posts.filter(p=>/\/api\/(?:write|counter-reset|command|unwinder|cleaning)/.test(p)),[]);
  assert.equal((await api('/api/state')).data.history.length,0);
  fs.writeFileSync(path.join(output,'theme-results.json'),JSON.stringify({results,darkBaseline,offline,posts},null,2));
  await context.close();console.log('PASS: native theme choice, engineer permissions, unchanged dark round trip, 23 classic destinations, both keypads, PIN focus, offline/ADS colours, paused Canvas palette refresh, language/reload/logout persistence, 4K backing stores; no PLC writes.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
