'use strict';
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const [url,token,control,output]=process.argv.slice(2);
async function main(){
 const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true,args:['--disable-gpu']});
 try{
 const context=await browser.newContext({viewport:{width:1024,height:600},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(url);await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
 const api=()=>page.evaluate(async()=>await(await fetch('/api/state',{headers:{'X-SCADA-Token':window.SCADA_BOOT.token}})).json());
 const set=async values=>assert((await fetch(control,{method:'POST',body:JSON.stringify(values)})).ok);
 const open=async key=>{await page.locator('.sc-nav-button[data-page="menu"]').click();await page.locator(`[data-open-node="${key}"]`).click();};
 const confirmed=async key=>{for(let i=0;i<100;i++){const s=await api();if(s.operation.key===key&&s.operation.status==='confirmed'){await page.waitForTimeout(120);return s;}await page.waitForTimeout(40);}assert.fail('No confirmation: '+key);};
 const number=async(key,value)=>{const button=page.locator(`[data-edit="${key}"]:visible`).first();assert(await button.isEnabled(),key);await button.click();const entry=page.locator('#guris-scada-entry');assert(await entry.isVisible());await page.locator('[data-key="clear"]').click();for(const digit of String(Math.abs(value)))await page.locator(`[data-key="${digit==='.'?',':digit}"]`).click();if(value<0)await page.locator('[data-key="sign"]').click();await page.locator('[data-apply-number]').click();await confirmed(key);await page.waitForFunction(()=>document.querySelector('[data-number-overlay]').hidden);};
 const toggle=async key=>{const before=(await api()).fields[key].value;await page.locator(`[data-node-toggle="${key}"]:visible`).click();await confirmed(key);assert.equal((await api()).fields[key].value,1-before);};
 const layout=async section=>{
  const bad=await page.locator(`[data-page-content="${section}"] button,[data-page-content="${section}"] [data-node-reading]`).evaluateAll(es=>es.filter(n=>!n.closest('[hidden]')).map(n=>({key:n.dataset.edit||n.dataset.nodeToggle||n.dataset.nodeReading||n.className,r:n.getBoundingClientRect()})).filter(x=>x.r.width>0&&(x.r.x<100||x.r.right>1024||x.r.y<60||x.r.bottom>595)).map(x=>({key:x.key,x:x.r.x,y:x.r.y,bottom:x.r.bottom,right:x.r.right})));
  assert.deepEqual(bad,[],section);
 };
 await set({width:159,gluePhotoMode:0,ejectSpeedEnabled:1});
 await open('temperature');await page.waitForTimeout(600);await toggle('heat1Enabled');await number('heat1Set',481.5);await number('heat6Set',32);await layout('temperature');await page.screenshot({path:output+'/temperature-bound.png'});
 await open('glue');await page.waitForFunction(()=>!document.querySelector('[data-glue-panel="ordinary"]').hidden);
 assert.equal(await page.locator('[data-glue-panel="ordinary"] [data-edit]').count(),1);await layout('glue');await page.screenshot({path:output+'/glue-ordinary.png'});
 await page.locator('[data-glue-mode="photo"]').click();await confirmed('gluePhotoMode');await page.waitForFunction(()=>!document.querySelector('[data-glue-panel="photo"]').hidden);
 await number('glueStartOffset',-12);await number('glueWorkingDistance',4);await number('glueWithoutDistance',21);await number('glueReference',20000);await number('glueMissLimit',3);
 await page.locator('[data-edit="glueWorkingDistance"]:visible').click();await page.keyboard.type('160');await page.locator('[data-apply-number]').click();assert((await page.locator('[data-entry-error]').textContent()).includes('159'));await page.locator('[data-cancel-number]').click();
 assert(await page.locator('[data-glue-reset]').isEnabled());assert(await page.locator('[data-glue-test]').isEnabled());await layout('glue');await page.screenshot({path:output+'/glue-photo.png'});
 await set({gluePhotoMode:0});await page.waitForFunction(()=>!document.querySelector('[data-glue-panel="ordinary"]').hidden);assert.equal(await page.locator('[data-glue-mode="ordinary"]').getAttribute('aria-pressed'),'true');
 await open('liner');for(let i=1;i<=3;i++){await number(`liner${i}Stretch`,10+i);await number(`liner${i}StopDiameter`,100+i);await toggle(`liner${i}AutoStop`);}await layout('liner');await page.screenshot({path:output+'/liner-bound.png'});
 await open('takeoff');assert.equal(await page.locator('[data-edit="takeoffMoonstepValue"]').count(),0);assert(await page.locator('[data-node-reading="takeoffMoonstepValue"]').isVisible());await toggle('takeoffMoonstep');await number('takeoffOffset',56);await layout('takeoff');await page.screenshot({path:output+'/takeoff-bound.png'});
 await open('tension');await number('tensionSet',24);await page.locator('[data-nudge="tensionSet"][data-step="1"]').click();await confirmed('tensionSet');assert(await page.locator('[data-nudge="tensionSet"][data-step="1"]').isDisabled());assert.equal((await api()).fields.tensionSet.value,25);await layout('tension');
 await open('eject');await number('ejectSpeed',230);await number('ejectOffset',25);await page.locator('[data-nudge="ejectOffset"][data-step="5"]').click();await confirmed('ejectOffset');assert.equal((await api()).fields.ejectOffset.value,30);await layout('eject');
 await page.locator('.sc-nav-button[data-page="menu"]').click();await page.locator('[data-open-actuators]').count().then(async count=>{if(count)await page.locator('[data-open-actuators]').click();else await page.locator('[data-page="actuators"]').click();});
 await number('support1Time',120);await toggle('support1Enabled');await layout('actuators');await page.screenshot({path:output+'/actuators-bound.png'});
 await page.locator('[data-page="photomark"]').click();await number('photoOffsetTenths',16);assert.equal((await api()).fields.photoOffsetTenths.value,16);await number('photoMissLimit',10);await layout('photomark');await page.screenshot({path:output+'/photo-bound.png'});
 await open('air');await number('airStartAngle',45);await number('airStopAngle',180);await layout('air');
 await set({heat1Identity:99});await open('temperature');await page.waitForFunction(()=>document.querySelector('[data-edit="heat1Set"]').disabled);assert.equal(await page.locator('[data-value="heat1Set"]').textContent(),'—');assert(await page.locator('[data-node-toggle="heat1Enabled"]').isDisabled());await set({heat1Identity:1});await page.waitForFunction(()=>!document.querySelector('[data-edit="heat1Set"]').disabled);
 await page.locator('[data-open-language]').click();await Promise.all([page.waitForNavigation(),page.locator('[data-choose-language="en"]').click()]);await page.waitForFunction(()=>document.documentElement.lang==='en');
 for(const key of ['glue','liner','takeoff','temperature']){await open(key);await page.waitForTimeout(150);await layout(key);const ru=await page.locator(`[data-page-content="${key}"]`).innerText();assert(!/[А-Яа-яЁё]/.test(ru),key+': '+ru);}
 await open('glue');await number('glueReference',21000);assert.deepEqual(errors,[]);
 await context.close();console.log('PASS: 1024x600 real native backend + Chromium without GPU: new numeric/toggle/nudge writes and readback; both glue modes follow PLC, all three distances; six heater channels; three liner stretches; read-only take-off speed; tension bounds; actuators/photo/air; slot mismatch blocks UI; RU/EN and touch geometry.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
