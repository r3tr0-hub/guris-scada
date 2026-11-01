const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright');
const [url,token,control,out]=process.argv.slice(2);
(async()=>{const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true});try{
const page=await browser.newPage({viewport:{width:1024,height:600}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
let writes=0;page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(write|command|conveyor-mode)/.test(r.url()))writes++});
await page.goto(url);await page.locator('.sc-nav-button[data-page="menu"]').click();
assert.equal(await page.locator('.sc-node-menu .sc-menu-svg').count(),12);
const api=(route,body)=>page.evaluate(async({route,body})=>{const r=await fetch(route,{method:body?'POST':'GET',headers:{'X-SCADA-Token':window.SCADA_BOOT.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error(route+':'+r.status);return r.json()},{route,body});
await api('/api/auth/setup',{password:'291101'});
const options=async changes=>{const o=(await api('/api/state')).options;await api('/api/options',{...o,snow:Number(o.snow),animations:Number(o.animations),wallpaper:Number(o.wallpaper),exitButton:Number(o.exitButton),...changes});};
const check=()=>page.evaluate(()=>[...document.querySelectorAll('.sc-menu-svg')].map(svg=>{const b=svg.getBoundingClientRect(),tile=svg.closest('button').getBoundingClientRect();return {key:svg.dataset.menuSvg,rect:[b.x,b.y,b.width,b.height],tile:[tile.x,tile.y,tile.width,tile.height],inside:b.left>=tile.left&&b.right<=tile.right&&b.top>=tile.top&&b.bottom<=tile.bottom,ratio:b.width/b.height,transform:getComputedStyle(svg).transform}}));
for(const theme of ['dark','classic','forest']){await options({theme});await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);
for(const viewport of [{width:1024,height:600},{width:1920,height:1080}]){await page.setViewportSize(viewport);await page.waitForTimeout(200);for(const item of await check()){assert(item.inside,JSON.stringify(item));assert.equal(item.transform,'none');}
await page.screenshot({path:path.join(out,`menu-${theme}-${viewport.width}.png`)});}}
const animated=page.locator('[data-menu-svg="knife"] .kn-blade');assert.equal(await animated.evaluate(e=>getComputedStyle(e).animationPlayState),'running');
const frames=new Set();for(let i=0;i<22;i++){frames.add(await animated.evaluate(e=>getComputedStyle(e).transform));await page.waitForTimeout(150)}assert(frames.size>1,'blade must move during its full cycle');
// Reproduce the disconnected machine: unknown equipment used to pause every SVG.
await fetch(control,{method:'POST',body:JSON.stringify({__connection:false})});
await page.waitForFunction(async()=>{const r=await fetch('/api/state',{headers:{'X-SCADA-Token':window.SCADA_BOOT.token}});return !(await r.json()).connected;});
const movement=await page.locator('.sc-menu-svg').evaluateAll(async svgs=>{
 const samples=()=>svgs.map(svg=>[...svg.querySelectorAll('*')].filter(e=>getComputedStyle(e).animationName!=='none').map(e=>[getComputedStyle(e).transform,getComputedStyle(e).opacity,getComputedStyle(e).strokeDashoffset].join('/')).join(';'));
 const frames=svgs.map(()=>new Set());for(let i=0;i<35;i++){svgs.forEach(svg=>svg.closest('button').dataset.equipment='unknown');samples().forEach((s,j)=>frames[j].add(s));await new Promise(r=>setTimeout(r,150))}return frames.map((s,i)=>({key:svgs[i].dataset.menuSvg,frames:s.size}));
});for(const item of movement)assert(item.frames>1,JSON.stringify(item));
await options({animations:0});await page.waitForFunction(()=>document.querySelector('.sc-app').dataset.motion==='off');await page.waitForTimeout(80);assert.equal(await animated.evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
const paused=await animated.evaluate(e=>getComputedStyle(e).transform);await page.waitForTimeout(200);assert.equal(await animated.evaluate(e=>getComputedStyle(e).transform),paused);
await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await animated.evaluate(e=>getComputedStyle(e).animationName),'none');
assert.equal(writes,0);assert.deepEqual(errors,[]);console.log('PASS: 12 menu SVGs, bounds at 2 resolutions, animation/pause/reduced-motion, no PLC writes or JS errors');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
