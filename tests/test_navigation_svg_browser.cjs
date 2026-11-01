const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright');
const [url,token,control,out]=process.argv.slice(2);
(async()=>{const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true});try{
const page=await browser.newPage({viewport:{width:1024,height:600},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
let writes=0;page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(write|command|conveyor-mode)/.test(r.url()))writes++});
const set=async data=>assert((await fetch(control,{method:'POST',body:JSON.stringify(data)})).ok);
const nav=k=>page.locator(`.sc-navigation > [data-page="${k}"]`), svg=k=>nav(k).locator('.sc-nav-art:not([hidden])');
await page.goto(url);await page.waitForFunction(()=>document.querySelector('.sc-nav-art')?.animationsPaused());
const keys=['home','belt','menu','actuators','photomark','production','alarms'];
assert.equal(await page.locator('.sc-navigation > button').count(),7);
assert(await page.evaluate(()=>{const ids=[...document.querySelectorAll('.sc-navigation [id]')].map(e=>e.id);return ids.length===new Set(ids).size&&[...document.querySelectorAll('.sc-navigation [fill]')].every(e=>!e.getAttribute('fill').startsWith('url(#')||document.getElementById(e.getAttribute('fill').slice(5,-1)))}));
for(const key of keys){for(const touch of [false,true]){const b=await nav(key).boundingBox();await nav(key)[touch?'tap':'click']();await page.waitForFunction(k=>document.querySelector('#guris-scada-demo').dataset.activePage===k,key);assert.equal(await svg(key).evaluate(e=>e.animationsPaused()),false);await page.waitForTimeout(180);assert((await svg(key).evaluate(e=>e.getCurrentTime()))>0);assert.deepEqual(await nav(key).boundingBox(),b);}}
await nav('home').click();await page.waitForTimeout(2300);await nav('home').click();await page.waitForTimeout(1000);assert.equal(await svg('home').evaluate(e=>e.animationsPaused()),false);await page.waitForTimeout(2200);assert.equal(await svg('home').evaluate(e=>e.animationsPaused()),true);assert((await svg('home').evaluate(e=>e.getCurrentTime()))<.05);
const alarm=async(rows,expected)=>{await set({__alarms:rows});await page.waitForFunction(expected=>document.querySelector('.sc-nav-button[data-page="alarms"]').dataset.alarmState===expected,expected)};
await alarm([{slot:0,id:1,state:10,condition:true},{slot:1,id:2,state:10,condition:false}],'unack');
await nav('alarms').click();await page.waitForTimeout(3200);assert.equal(await svg('alarms').getAttribute('data-nav-variant'),'unack');assert.equal(await svg('alarms').evaluate(e=>e.animationsPaused()),false);assert((await svg('alarms').evaluate(e=>e.getCurrentTime()))>3);
assert.equal(writes,0,'navigation must not acknowledge alarms');
assert.equal(await svg('alarms').evaluate(e=>getComputedStyle(e).animationName),'none');
await page.locator('[data-command="alarmAck"]').click();
await page.waitForFunction(async()=>{const r=await fetch('/api/state',{headers:{'X-SCADA-Token':window.SCADA_BOOT.token}});const s=await r.json();return s.alarms.records.some(r=>r.slot===1&&r.state===20)});
assert.equal(await nav('alarms').getAttribute('data-alarm-state'),'unack','acknowledging cleared cause must not extinguish active unacknowledged record');
await alarm([{slot:0,id:1,state:20,condition:true},{slot:1,id:2,state:10,condition:false}],'unack');
await set({__connection:false});await page.waitForFunction(()=>document.querySelector('.sc-nav-button[data-page="alarms"]').dataset.alarmQuality==='unknown');assert.equal(await nav('alarms').getAttribute('data-alarm-state'),'unack');assert(await page.locator('[data-nav-alarm-badge]').isVisible());
await set({__connection:true});await page.waitForFunction(()=>document.querySelector('.sc-nav-button[data-page="alarms"]').dataset.alarmQuality==='good');
await alarm([{slot:0,id:1,state:20,condition:true}],'active');assert.equal(await svg('alarms').evaluate(e=>e.animationsPaused()),true);assert.equal(await svg('alarms').getAttribute('data-nav-variant'),'normal');await alarm([],'clear');
await alarm([{slot:2,id:3,state:10,condition:false}],'unack');
await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);assert.equal(await svg('alarms').evaluate(e=>e.animationsPaused()),true);assert((await svg('alarms').evaluate(e=>e.getCurrentTime()))<.05);assert(await page.locator('[data-nav-alarm-badge]').isVisible());await nav('belt').tap();assert.equal(await svg('belt').evaluate(e=>e.animationsPaused()),true);await page.emulateMedia({reducedMotion:'no-preference'});
const api=(route,body)=>page.evaluate(async({route,body})=>{const r=await fetch(route,{method:body?'POST':'GET',headers:{'X-SCADA-Token':window.SCADA_BOOT.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return r.json()},{route,body});
await api('/api/auth/setup',{password:'331102'});
for(const theme of ['dark','classic','forest']){const o=(await api('/api/state')).options;await api('/api/options',{...o,snow:Number(o.snow),animations:Number(o.animations),wallpaper:Number(o.wallpaper),exitButton:Number(o.exitButton),theme});await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);
for(const viewport of [{width:1024,height:600},{width:1920,height:1080}]){await page.setViewportSize(viewport);await page.waitForTimeout(180);assert(await page.evaluate(()=>{const nav=document.querySelector('.sc-navigation');return nav.scrollHeight<=nav.clientHeight+1&&[...nav.querySelectorAll('button')].every(b=>{const svg=b.querySelector('svg:not([hidden])').getBoundingClientRect(),label=b.querySelector('span').getBoundingClientRect(),r=b.getBoundingClientRect();return svg.bottom<=label.top+1&&svg.top>=r.top&&label.bottom<=r.bottom&&getComputedStyle(b).transform==='none'})}));await page.screenshot({path:path.join(out,`navigation-${theme}-${viewport.width}.png`)});}}
assert.equal(writes,1,'only explicit alarm acknowledgement may send a command');assert.deepEqual(errors,[]);console.log('PASS: 7 mouse/touch routes, SMIL restart/reset, fixed geometry, unique IDs/gradients, alarm state priority/loss/recovery/reduced-motion, 3 themes at 2 resolutions, only explicit ACK command');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
