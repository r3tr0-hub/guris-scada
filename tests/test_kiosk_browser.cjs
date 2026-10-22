'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const [url,token,control,output]=process.argv.slice(2);
async function main(){
 const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true,args:['--disable-gpu','--disable-features=Translate']}),errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1024,height:600},reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  // Linux serves diagnostic mode; native C tests separately verify true/false expansion.
  // Substitute only the launch capability to exercise the Windows kiosk UI branch.
  await page.route('**/?k=*',async route=>{const response=await route.fetch();const original=await response.text();assert(original.includes('kiosk:false'));await route.fulfill({response,body:original.replace('kiosk:false','kiosk:true')});});
  await page.addInitScript(()=>{window.__fullscreenCalls=0;Element.prototype.requestFullscreen=function(){window.__fullscreenCalls++;return Promise.resolve();};});
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
  assert.equal(await page.evaluate(()=>window.SCADA_BOOT.kiosk),true);
  assert.equal(await page.locator('html').getAttribute('translate'),'no');assert.equal(await page.locator('meta[name="google"]').getAttribute('content'),'notranslate');
  assert(await page.locator('[data-fullscreen]').isHidden());await page.locator('[data-fullscreen]').evaluate(n=>n.click());assert.equal(await page.evaluate(()=>window.__fullscreenCalls),0);
  assert((await page.locator('input[type="password"]').evaluateAll(es=>es.map(e=>e.autocomplete))).every(value=>value==='off'));
  await page.locator('[data-edit-operator]').click();await page.locator('[data-auth-role="engineer"]').click();assert(await page.locator('[data-pin-overlay]').isHidden());await page.locator('[data-auth-password]').click();
  await page.keyboard.type('012345');await page.locator('[data-pin-apply]').click();await page.keyboard.type('012345');await page.locator('[data-pin-apply]').click();await page.waitForFunction(()=>document.querySelector('[data-operator-overlay]').hidden);
  await page.locator('[data-open-language]').click();await Promise.all([page.waitForNavigation(),page.locator('[data-choose-language="en"]').click()]);await page.waitForFunction(()=>document.documentElement.lang==='en');assert.equal(await page.locator('html').getAttribute('translate'),'no');assert(await page.locator('[data-fullscreen]').isHidden());
  await page.locator('.sc-nav-button[data-page="menu"]').click();await page.locator('[data-page="scada"]').click();const pendingDownload=page.waitForEvent('download');await page.locator('[data-page-content="scada"] [data-download-report]').click();const download=await pendingDownload;assert.equal(await download.failure(),null);const reportText=fs.readFileSync(await download.path(),'utf8'),report=JSON.parse(reportText);
  assert.equal(report.version,'0.1.20');assert.equal(report.auth.role,'engineer');assert.equal(Object.keys(report.fields).length,174);assert(!reportText.includes('012345'));assert.equal(report.history.length,0);
  await page.screenshot({path:output+'/kiosk-ui.png'});await context.close();
  const second=await browser.newContext({viewport:{width:1024,height:600}}),ordinary=await second.newPage();ordinary.on('pageerror',e=>errors.push(String(e)));await ordinary.addInitScript(()=>{window.__fullscreenCalls=0;Element.prototype.requestFullscreen=function(){window.__fullscreenCalls++;return Promise.resolve();};});
  await ordinary.goto(url);await ordinary.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
  assert.equal(await ordinary.evaluate(()=>window.SCADA_BOOT.kiosk),false);assert(await ordinary.locator('[data-fullscreen]').isVisible());await ordinary.locator('[data-fullscreen]').click();assert.equal(await ordinary.evaluate(()=>window.__fullscreenCalls),1);
  assert.equal(await ordinary.locator('[data-operator-name]').textContent(),'Operator');assert.equal(await ordinary.locator('html').getAttribute('lang'),'en');
  await ordinary.locator('[data-edit-operator]').click();await ordinary.locator('[data-auth-role="engineer"]').click();assert(await ordinary.locator('[data-pin-overlay]').isHidden());await ordinary.locator('[data-auth-password]').click();assert.equal(await ordinary.locator('[data-pin-entry]').inputValue(),'');await ordinary.keyboard.type('012345');await ordinary.locator('[data-pin-apply]').click();await ordinary.waitForFunction(()=>document.querySelector('[data-operator-overlay]').hidden);
  assert.equal(await ordinary.locator('[data-operator-name]').textContent(),'Engineer');assert.deepEqual(errors,[]);await second.close();
  console.log('PASS: native backend + Chromium: kiosk capability hides/guards DOM fullscreen; translation markers and autocomplete off; numeric sign-in; own RU/EN language still works; authenticated JSON download works; closed browser drops cookie while backend credentials/language persist; ordinary diagnostic fullscreen retained; no PLC writes. Edge Windows kiosk chrome/prompts require real-machine validation.');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
