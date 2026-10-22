'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const [url, token, control, output] = process.argv.slice(2);

function canvasMetrics() {
  return Array.from(document.querySelectorAll('[data-mechanism-canvas],[data-roller-canvas]'))
    .filter(c => !c.closest('[hidden]') && c.getBoundingClientRect().width > 0)
    .map(c => {
      const r = c.getBoundingClientRect();
      const density = devicePixelRatio * (window.visualViewport?.scale || 1);
      return {kind:c.dataset.mechanism || 'takeoff', width:c.width, height:c.height,
        cssWidth:r.width, cssHeight:r.height,
        expectedWidth:Math.ceil(r.width*density), expectedHeight:Math.ceil(r.height*density),
        normalizedWidth:r.width/Math.min(innerWidth/1024,innerHeight/600),
        normalizedHeight:r.height/Math.min(innerWidth/1024,innerHeight/600),
        painted:c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)};
    });
}
async function settled(page) {
  await page.waitForFunction(() => {
    const scale=Math.min(innerWidth/1024,innerHeight/600);
    const root=document.getElementById('guris-scada-demo').getBoundingClientRect();
    if(Math.abs(root.width-1024*scale)>.05 || Math.abs(root.height-600*scale)>.05) return false;
    return Array.from(document.querySelectorAll('[data-mechanism-canvas],[data-roller-canvas]'))
    .filter(c=>!c.closest('[hidden]')&&c.getBoundingClientRect().width>0)
    .every(c=>{
      const r=c.getBoundingClientRect(),d=devicePixelRatio*(window.visualViewport?.scale||1);
      return c.width===Math.ceil(r.width*d)&&c.height===Math.ceil(r.height*d);
    });
  });
}
async function main() {
  const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true,args:['--disable-gpu']});
  const results=[],errors=[];
  try {
    let baseline;
    const matrix=[
      {width:1024,height:600,dpr:1},
      {width:1920,height:1080,dpr:1},
      {width:2560,height:1440,dpr:1.25},
      {width:3840,height:2160,dpr:1},
      {width:1920,height:1080,dpr:2},
      {width:3840,height:2160,dpr:2},
    ];
    for(const size of matrix) {
      const context=await browser.newContext({viewport:{width:size.width,height:size.height},deviceScaleFactor:size.dpr});
      const page=await context.newPage();
      page.on('pageerror',e=>errors.push(String(e)));
      await page.goto(url);
      await page.waitForFunction(()=>!document.querySelector('[data-edit="width"]').disabled);
      await page.locator('.sc-nav-button[data-page="menu"]').click();
      await page.waitForFunction(()=>document.getElementById('guris-scada-demo').dataset.rollerPlaying==='true');
      await settled(page);
      const metrics=await page.evaluate(canvasMetrics);
      assert.equal(metrics.length,11);
      assert(metrics.every(m=>m.painted && m.width===m.expectedWidth && m.height===m.expectedHeight),JSON.stringify({size,metrics}));
      if(!baseline) baseline=metrics;
      for(let i=0;i<metrics.length;i++) {
        assert(Math.abs(metrics[i].normalizedWidth-baseline[i].normalizedWidth)<.03);
        assert(Math.abs(metrics[i].normalizedHeight-baseline[i].normalizedHeight)<.03);
      }
      const hashes=()=>page.locator('.sc-node-tile canvas').evaluateAll(cs=>cs.map(c=>c.toDataURL()));
      const a=await hashes();await page.waitForTimeout(450);const b=await hashes();
      const moving=a.filter((x,i)=>x!==b[i]).length;
      assert.equal(moving,11,JSON.stringify({size,moving}));
      if(size.width===3840 && size.dpr===1) {
        await page.locator('.sc-node-grid').screenshot({path:path.join(output,'menu-4k.png')});
      }
      // Large process diagrams use the same raster sizing, without intrinsic
      // aspect-ratio feedback after repeated fractional resizing.
      await page.locator('[data-open-node="takeoff"]').click();await settled(page);
      const diagram=await page.evaluate(canvasMetrics);
      assert(diagram.length>0 && diagram.every(m=>m.painted));
      await page.locator('.sc-nav-button[data-page="menu"]').click();await settled(page);
      assert(await page.locator('[data-page-content="takeoff"] canvas').evaluate(c=>c.width===Number(c.dataset.rollerWidth)&&c.height===Number(c.dataset.rollerHeight)));
      results.push({size,metrics,moving,diagram});
      if(size.dpr===1.25) {
        for(const viewport of [{width:1365,height:768},{width:3200,height:1800},{width:1024,height:600},{width:2560,height:1440}]) {
          await page.setViewportSize(viewport);await settled(page);
          const scaled=await page.evaluate(canvasMetrics);
          assert(scaled.every(m=>m.painted));
          assert(Math.abs(scaled[0].normalizedWidth-baseline[0].normalizedWidth)<.03,JSON.stringify({viewport,scaled:scaled[0],baseline:baseline[0]}));
        }
        // Emulate moving the running window to another display without reload.
        const session=await context.newCDPSession(page);
        await session.send('Emulation.setDeviceMetricsOverride',{width:2560,height:1440,deviceScaleFactor:3,mobile:false});
        await page.waitForFunction(()=>devicePixelRatio===3);await settled(page);
        const moved=await page.evaluate(canvasMetrics);assert(moved.every(m=>m.painted));
        results.push({monitorMove:moved});
      }
      await context.close();
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'display-results.json'),JSON.stringify(results,null,2));
    console.log('PASS: all 11 animated menu canvases at 1024/Full HD/1440p/4K, DPR 1/1.25/2/3, viewport resize, live monitor density change, stable layout, painted process diagrams and hidden-buffer release.');
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
