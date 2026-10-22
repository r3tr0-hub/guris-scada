'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const [url,token,control,output]=process.argv.slice(2),ROOT=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'reference/menu_mockup_manifest.json')));
async function main(){
 const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true,args:['--disable-gpu']}),errors=[];
 try{
 const context=await browser.newContext({viewport:{width:1024,height:600},reducedMotion:'reduce',timezoneId:'Europe/Moscow'}),page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(url);await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
 const api=(route,body)=>page.evaluate(async({route,body})=>{const r=await fetch(route,{method:body?'POST':'GET',headers:{'X-SCADA-Token':window.SCADA_BOOT.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()};},{route,body});
 const set=async values=>{assert((await fetch(control,{method:'POST',body:JSON.stringify(values)})).ok);};
 const current=async title=>page.waitForFunction(title=>document.querySelector('[data-page-title]').textContent===title,title);
 const layout=async()=>{const boxes=await page.locator('.sc-topbar,.sc-sidebar,.sc-main,.sc-sidebar-foot').evaluateAll(es=>es.map(e=>({name:e.className,y:e.getBoundingClientRect().y,bottom:e.getBoundingClientRect().bottom})));assert(boxes.every(b=>b.y>=0&&b.bottom<=600),JSON.stringify(boxes));};
 const menu=()=>page.locator('.sc-nav-button[data-page="menu"]').click();
 const assertOffline=async text=>{await page.waitForFunction(text=>['plc','ads'].every(k=>document.querySelector(`[data-indicator="${k}"] [data-indicator-text]`).textContent===text),text);const tones=await page.locator('[data-indicator="plc"],[data-indicator="ads"]').evaluateAll(nodes=>nodes.map(e=>({tone:e.dataset.tone,text:getComputedStyle(e.querySelector('[data-indicator-text]')).color,dot:getComputedStyle(e.querySelector('.sc-light')).backgroundColor})));assert(tones.every(x=>x.tone==='danger'&&x.text==='rgb(255, 164, 168)'&&x.dot===x.text));};
 await page.locator('.sc-nav-button[data-page="belt"]').click();await page.locator('.sc-title-brand').click();await current('О программе SCADA');await page.locator('.sc-nav-button[data-page="home"]').click();await current('Главная');
 await set({__connection:false});await assertOffline('Нет связи');await page.screenshot({path:output+'/offline-ru.png'});
 await set({__connection:true,__ads_state:4});await page.waitForFunction(()=>document.querySelector('[data-indicator="ads"]').dataset.tone==='warning');assert.equal(await page.locator('[data-indicator="ads"] .sc-light').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(245, 205, 125)');
 await set({__ads_state:5,machineState:4,automatic:1,speedSet:200,welding:100,weldingEnabled:1});await page.waitForFunction(()=>document.querySelector('[data-welding-icon]').dataset.playing==='true');
 for(const [weld,tone] of [[90,'neutral'],[110,'neutral'],[89,'lower'],[111,'higher'],[100,'neutral']]){await set({welding:weld});await page.waitForFunction(({weld,tone})=>document.querySelector('[data-value="welding"]').textContent===String(weld)&&document.querySelector('[data-welding-icon]').dataset.tone===tone,{weld,tone});}
 assert.equal(await page.locator('[data-welding-icon]').evaluate(n=>n.style.getPropertyValue('--sc-weld-angle')),'0deg');
 const motion=await page.locator('.sc-weld-stitch').evaluate(async n=>{const samples=[];for(let i=0;i<10;i++){samples.push(getComputedStyle(n).strokeDashoffset);await new Promise(r=>setTimeout(r,65));}return new Set(samples).size;});assert(motion>3);
 await page.screenshot({path:output+'/seam-neutral.png'});await set({welding:70});await page.waitForFunction(()=>document.querySelector('[data-welding-icon]').dataset.tone==='lower');await page.screenshot({path:output+'/seam-low.png'});
 await set({welding:130});await page.waitForFunction(()=>document.querySelector('[data-welding-icon]').dataset.tone==='higher');await page.screenshot({path:output+'/seam-high.png'});
 await set({weldingEnabled:0});await page.waitForFunction(()=>document.querySelector('[data-welding-icon]').dataset.playing==='false');assert.equal(await page.locator('[data-welding-icon]').evaluate(n=>n.getAnimations({subtree:true}).length),0);assert.equal(await page.locator('[data-value="welding"]').textContent(),'130');await set({weldingEnabled:1,welding:100});
 await menu();await current('Меню');
 const order=await page.locator('.sc-node-grid [data-open-node]').evaluateAll(es=>es.map(e=>e.dataset.openNode));assert.deepEqual(order,['edge','temperature','glue','longitudinal','eject','liner','takeoff','tension','air','feedangles','unwinder','options']);
 for(const [key,expected] of Object.entries(manifest.tiles)){
  if(["knife","ballerina","jog"].includes(key))continue;
  const tile=page.locator(`[data-page-content="menu"] [data-open-node="${key}"]`),actual=await tile.evaluate(tile=>({svg:Array.from(tile.querySelectorAll('svg')).map(svg=>Array.from(svg.querySelectorAll('*')).map(e=>({tag:e.localName,attrs:Array.from(e.attributes).filter(a=>!['class','aria-hidden','data-lucide'].includes(a.name)).map(a=>[a.name,a.value]).sort()}))),canvas:Array.from(tile.querySelectorAll('canvas')).map(e=>({kind:e.dataset.mechanism||'takeoff',width:e.dataset.rollerWidth,height:e.dataset.rollerHeight}))}));assert.deepEqual(actual,expected,key);
  if(key!=='options'){const box=await tile.boundingBox();assert(box.width>=117*1.15);assert(box.height>=75&&box.height<=95);}
 }
 await page.waitForFunction(()=>document.querySelector('#guris-scada-demo').dataset.rollerPlaying==='true');const canvas=page.locator('[data-page-content="menu"] canvas').first();const first=await canvas.evaluate(n=>n.toDataURL());await page.waitForTimeout(450);assert.notEqual(await canvas.evaluate(n=>n.toDataURL()),first);
 await page.screenshot({path:output+'/menu-operator.png'});
 const titles={edge:'Краевой контроль',temperature:'Температура',glue:'Клей',longitudinal:'Продольный шов',eject:'Выкидные валы',liner:'Лайнер',takeoff:'Приёмный вал',tension:'Натяжение',air:'Воздушные трубки',feedangles:'Углы подачи',unwinder:'Размотчик'};
 for(const [key,title] of Object.entries(titles)){
  await menu();await page.locator(`[data-page-content="menu"] [data-open-node="${key}"]`).click();await current(title);
  const content=key==='ballerina'?'settings':key;assert(await page.locator(`[data-page-content="${content}"]`).isVisible());
  assert.equal(await page.locator(`[data-page-content="${content}"] [data-unbound]:enabled`).count(),0);
  if(key==='temperature'){await page.waitForFunction(()=>document.querySelector('[data-node-reading="heat1Actual"]').textContent==='439');assert.equal(await page.locator('[data-value="heat1Set"]').textContent(),'440');await page.screenshot({path:output+'/temperature.png'});}
  if(key==='options'){assert.equal(await page.locator('[data-page-content="settings"] [data-open-history]').count(),0);assert((await page.locator('[data-page-content="settings"]').innerText()).includes('Содержимое настроек добавим позже.'));}
 }
 await menu();assert(await page.locator('[data-page="scada"][data-engineer-only]').isHidden());assert.equal((await api('/api/auth/setup',{password:'262015'})).status,200);await page.waitForFunction(()=>!document.querySelector('[data-page="scada"][data-engineer-only]').hidden);
 const engineerBox=await page.locator('[data-page="scada"][data-engineer-only]').boundingBox(),optionsBox=await page.locator('[data-open-node="options"]').boundingBox();assert.equal(engineerBox.width,optionsBox.width);assert.equal(engineerBox.height,optionsBox.height);assert(engineerBox.y+engineerBox.height<=optionsBox.y);assert.equal(await page.locator('[data-page="scada"][data-engineer-only] .sc-node-tile-head').innerHTML(),await page.locator('[data-open-node="options"] .sc-node-tile-head').innerHTML());
 await page.screenshot({path:output+'/menu-engineer.png'});
 const flagBox=await page.locator('[data-open-language]').boundingBox(),profileBox=await page.locator('.sc-user-card').boundingBox();assert(flagBox.x+flagBox.width<=profileBox.x);
 await page.locator('[data-open-language]').click();await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.locator('[data-choose-language="en"]').click()]);await page.waitForFunction(()=>document.documentElement.lang==='en'&&document.querySelector('[data-page-title]').textContent==='Menu');
 assert.equal((await api('/api/state')).data.language,'en');assert.equal((await api('/api/state')).data.auth.role,'engineer');assert((await page.locator('[data-language-flag]').getAttribute('src')).endsWith('/gb.svg'));
 await page.screenshot({path:output+'/menu-en.png'});
 await layout();await page.locator('.sc-nav-button[data-page="home"]').click();await current('Home');await layout();assert.equal(await page.locator('[data-edit="welding"] .sc-field-label').textContent(),'Seam speed');await page.screenshot({path:output+'/home-en.png'});
 await page.locator('[data-edit="width"]').click();await page.locator('[data-key="2"]').click();await page.locator('[data-key=","]').click();await page.locator('[data-key="5"]').click();assert.equal(await page.locator('#guris-scada-entry').inputValue(),'2.5');assert.equal(await page.locator('[data-key=","]').textContent(),'.');await page.locator('[data-cancel-number]').click();
 assert.equal(await page.evaluate(()=>window.SCADA_I18N.text('Допустимый диапазон: 1…2000')),'Allowed range: 1…2000');assert.equal(await page.evaluate(()=>window.SCADA_I18N.text(' мм')),' mm');
 const englishTitles={edge:'Edge control',temperature:'Temperature',glue:'Glue',longitudinal:'Longitudinal seam',eject:'Ejection rollers',liner:'Liner',takeoff:'Take-off roller',tension:'Tension',air:'Air tubes',feedangles:'Feed angles',unwinder:'Unwinder',options:'Options'};
 for(const [key,title] of Object.entries(englishTitles)){
  await menu();await page.locator(`[data-page-content="menu"] [data-open-node="${key}"]`).click();await current(title);
  await layout();
  const russian=await page.evaluate(()=>{const root=document.querySelector('.sc-main'),walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),found=[];let n;while(n=walker.nextNode()){const p=n.parentElement;if(!p||p.closest('script,style,[data-i18n-skip]')||!p.getClientRects().length)continue;if(/[А-Яа-яЁё]/.test(n.nodeValue))found.push(n.nodeValue.trim());}return found;});assert.deepEqual(russian,[],key);
 }
 await page.locator('.sc-title-brand').click();await set({__connection:false});await assertOffline('No connection');await page.screenshot({path:output+'/offline-en.png'});await set({__connection:true,machineState:5,automatic:0});await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
 await page.locator('[data-open-language]').click();await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.locator('[data-choose-language="ru"]').click()]);await page.waitForFunction(()=>document.documentElement.lang==='ru'&&document.querySelector('[data-page-title]').textContent==='О программе SCADA');
 assert.deepEqual(errors,[]);assert.equal((await api('/api/state')).data.history.length,0);
 await context.close();console.log('PASS: native backend + Chromium without GPU/reduced motion; approved mockup icons in a fixed five-row grid, removed obsolete menu entries, canvases, live temperatures, engineer tile above Options, logo About, offline red / non-RUN amber, RU/EN reload and persistence, English units/decimal/messages, weld ±10 boundaries and running/off animation; no PLC writes.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
