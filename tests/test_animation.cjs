/* Browser regression test. Developer tools only: npm install playwright; npx playwright install chromium. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
let polls=0,failPoll=false,unexpected=[],uiErrors=[];
const scalar=value=>({quality:true,value,writable:false,min:0,max:300,integer:true});
const state={connected:true,epoch:1,adsState:5,busy:false,ip:'127.0.0.1',fields:{machineState:scalar(4),speedSet:scalar(100),automatic:scalar(1)},operation:{id:''},history:[]};
const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/favicon.svg':'favicon.svg','/assets/brand.png':'assets/brand.png'};
for(const rel of ['production.js','production.css','manuals.js','manuals.css','vendor/marked-17.0.5.umd.js','io.js','io_catalog.json','alarms.json','themes.css','mockup.css','i18n.js','mechanisms.js','locales/catalog.json','locales/ru.json','locales/en.json','assets/flags/ru.svg','assets/flags/gb.svg'])files['/'+rel]=rel;
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1').pathname;
 const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 if(url==='/api/production'){json(200,{jobs:[],currentJobId:'',serverConnected:false,storageError:false});return;}
 if(url==='/api/state'&&req.method==='GET'){
  polls++;json(failPoll?503:200,failPoll?{message:'Simulated backend failure'}:state);return;
 }
 if(url==='/api/ui-ready'&&req.method==='POST'){json(200,{message:'ready'});return;}
 if(url==='/api/ui-error'){uiErrors.push(url);json(200,{message:'logged'});return;}
 if(req.method!=='GET'||!files[url]){unexpected.push(`${req.method} ${url}`);json(405,{message:'Unexpected request'});return;}
 const file=files[url];let bytes=fs.readFileSync(path.join(ROOT,'ui',file));
 if(file==='index.html')bytes=Buffer.from(bytes.toString().replaceAll('@@SCADA_TOKEN@@','animation-test').replaceAll('@@SCADA_NONCE@@','animation-test').replaceAll('@@SCADA_KIOSK@@','false'));
 res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store'});res.end(bytes);
});
async function playing(page,value){await page.waitForFunction(v=>document.querySelector('.sc-cadence')?.dataset.playing===String(v),value);}
async function moving(page){
 await page.waitForFunction(()=>document.querySelector('.sc-cadence').getAnimations()[0]?.startTime!=null);
 return page.evaluate(async()=>{
  const node=document.querySelector('.sc-cadence'),svg=node.querySelector('.sc-cadence-sweep svg');
  const pulse=node.getAnimations()[0],sweep=svg.getAnimations()[0],start=pulse.startTime,samples=[];
  let sameAnimations=true;
  for(let i=0;i<28;i++){
   samples.push({transform:getComputedStyle(node).transform,dash:getComputedStyle(svg).strokeDashoffset});
   sameAnimations&&=node.getAnimations()[0]===pulse&&svg.getAnimations()[0]===sweep&&pulse.startTime===start;
   await new Promise(resolve=>setTimeout(resolve,55));
  }
  return {sameAnimations,transforms:new Set(samples.map(s=>s.transform)).size,dashes:new Set(samples.map(s=>s.dash)).size,elapsed:pulse.currentTime,duration:pulse.effect.getTiming().duration};
 });
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.SCADA_BROWSER,headless:true,args:['--disable-gpu']});
 try{
  for(const motion of ['no-preference','reduce']){
   state.connected=true;state.fields.machineState.value=4;state.fields.machineState.quality=true;state.fields.speedSet.value=100;state.fields.speedSet.quality=true;failPoll=false;
   const context=await browser.newContext({reducedMotion:motion,viewport:{width:1024,height:600}}),page=await context.newPage();
   page.on('pageerror',error=>uiErrors.push(String(error)));
   await page.goto(`http://127.0.0.1:${server.address().port}/`);await playing(page,true);
   assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),motion==='reduce');
   const before=polls,result=await moving(page);
   assert(result.transforms>3&&result.dashes>3,`${motion}: pulse and trace must visibly change`);
   assert(result.sameAnimations,`${motion}: PLC polling must preserve animation instances and phase`);
   assert(polls-before>=3,`${motion}: animation must run across several PLC polls`);
   assert(result.elapsed>1000);assert.equal(result.duration,600);
   state.fields.machineState.value=5;await playing(page,false);
   assert.equal(await page.locator('.sc-cadence').evaluate(node=>node.getAnimations({subtree:true}).length),0);
   state.fields.machineState.value=4;state.fields.speedSet.value=0;await page.waitForTimeout(500);await playing(page,false);
   state.fields.speedSet.value=100;await playing(page,true);
   state.fields.machineState.quality=false;await playing(page,false);
   state.fields.machineState.quality=true;await playing(page,true);
   state.fields.speedSet.quality=false;await playing(page,false);
   state.fields.speedSet.quality=true;await playing(page,true);
   state.connected=false;await playing(page,false);
   state.connected=true;await playing(page,true);
   failPoll=true;await playing(page,false);
   failPoll=false;state.fields.speedSet.value=40;await playing(page,true);
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('.sc-cadence')).animationDuration==='1.5s');
   await context.close();
   console.log(`PASS: ${motion}, GPU disabled; moving pulse and trace, uninterrupted polling, stop, zero speed, bad quality, disconnect, backend failure and recovery.`);
  }
  assert.deepEqual(uiErrors,[]);assert.deepEqual(unexpected,[]);
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
