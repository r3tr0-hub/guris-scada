/* Frontend behavior without a browser or real PLC. npm install jsdom css-tree */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),csstree=require('css-tree');
const ROOT=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(ROOT,'ui/index.html'),'utf8'),css=fs.readFileSync(path.join(ROOT,'ui/style.css'),'utf8');
const dom=new JSDOM(html,{url:'http://127.0.0.1:43199/?k=test',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,$=s=>w.document.querySelector(s),$$=s=>Array.from(w.document.querySelectorAll(s));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const rows=[...fs.readFileSync(path.join(ROOT,'src/fields.h'),'utf8').matchAll(/\{"([^"]+)","[^"]+","([^"]+)","([^"]*)",T_(\w+),(\d+),([01]),([^,]+),([^,]+),([^,]+),([^,]+),([01])\}/g)].slice(0,256);
const values={width:249,batch:100,welding:125,weldingEnabled:1,speedSet:190,productionQty:1000000,current:21,groups:3,total:321,machineState:5,beltTimed:1,beltTime1:350,beltTime2:1200,beltTime3:900,conveyorContinuous:0,conveyorTime1:50,conveyorTime2:75,beltStep:3,waitingQty:5,offset:-.575,beltIdleSpeed:20,offsetDisplay:-.575,offsetStep:.025,speedLimit:265,waitingLimit:30,automatic:0};
for(let i=1;i<=5;i++){values[`heat${i}Set`]=100;values[`heat${i}Actual`]=99;}
for(const [key,entry] of Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT,'tests/fixtures/captured_menu_20261015.json'),'utf8'))))if(!(key in values))values[key]=entry.value;
function raw(key,value){const f=latest.fields[key],b=Buffer.alloc(Number(f.bytes));if(f.type==='BOOL')b.writeUInt8(value);else if(f.type==='INT')b.writeInt16LE(value);else if(f.type==='DINT')b.writeInt32LE(value);else if(f.type==='LREAL')b.writeDoubleLE(value);else b.writeFloatLE(key==='offset'?-value:value);return b.toString('hex');}
let latest={connected:false,epoch:1,adsState:5,busy:false,ip:'192.168.1.250',netId:'5.105.198.193.1.1',port:801,fields:{},history:[],operation:{id:''}},counter=0,posts=[],uiReadyPosts=0,uiErrors=[];
rows.forEach(r=>latest.fields[r[1]]={quality:false,value:values[r[1]],raw:'',label:r[2],unit:r[3],type:r[4],bytes:r[5],writable:r[6]==='1',min:Number(r[7]),max:Number(r[8]),integer:r[11]==='1'});
for(const k of Object.keys(latest.fields))latest.fields[k].raw=raw(k,values[k]??0);
for(const k of ['groups','total'])latest.fields[k].resettable=true;
w.SCADA_BOOT={token:'test'};w.crypto.randomUUID=()=>`test-uuid-${++counter}`;
const pollDelays=[],realTimeout=w.setTimeout.bind(w);w.setTimeout=(cb,ms,...args)=>{if(cb.name==='poll'){pollDelays.push(ms);return realTimeout(cb,12,...args);}return realTimeout(cb,ms,...args);};
w.fetch=async (url,opt)=>{
  if(url==='/api/ui-error'){uiErrors.push(JSON.parse(opt.body));return {ok:true,json:async()=>({message:'logged'})};}
  if(url==='/api/ui-ready'){uiReadyPosts++;return {ok:true,json:async()=>({message:'ready'})};}
  if(url==='/api/state'||url==='/api/report')return {ok:true,json:async()=>JSON.parse(JSON.stringify(latest))};
  const body=JSON.parse(opt.body);posts.push({url,body});
  if(url==='/api/write'||url==='/api/counter-reset'){
    if(url==='/api/counter-reset')body.value=0;
    latest.operation={id:body.id,key:body.key,status:'verifying',before:latest.fields[body.key].value,requested:Number(body.value),epoch:body.epoch,actual:null,message:'',utc:''};
    latest.busy=true;latest.fields[body.key].value=Number(body.value);latest.fields[body.key].raw=raw(body.key,Number(body.value));
    return {ok:true,json:async()=>({message:'accepted'})};
  }
  return {ok:true,json:async()=>({message:'ok'})};
};
w.eval(w.document.querySelector('script[nonce]').textContent.replace('@@SCADA_TOKEN@@','test').replace('@@SCADA_KIOSK@@','false'));
w.eval(fs.readFileSync(path.join(ROOT,'ui/app.js'),'utf8'));
async function refresh(){await delay(45);}
function click(s){$(s).click();}
function type(s){for(const k of s)click(`[data-key="${k}"]`);}
function finish(status='confirmed'){
  latest.busy=false;latest.operation.status=status;latest.operation.actual=latest.fields[latest.operation.key].value;latest.operation.message=status==='confirmed'?'ПЛК подтвердил значение':'Запись не подтверждена';latest.history.push({...latest.operation});
}
async function run(){
 await refresh();
 assert.equal(uiReadyPosts,1);assert.equal($('#scada-startup-notice').hidden,true);
 await refresh();assert($('[data-edit="width"]').disabled);assert.equal($('[data-value="width"]').textContent,'—');
 latest.connected=true;Object.values(latest.fields).forEach(f=>f.quality=true);await refresh();
 assert.equal($('[data-page-title]').textContent,'Главная');assert.equal($('[data-value="width"]').textContent,'249');assert(!$('[data-edit="width"]').disabled);
 assert.equal($('[data-indicator="alarms"] [data-indicator-text]').textContent,'Нет данных');
 click('[data-page="belt"]');assert($('[data-home-only]').hidden);assert(!$('[data-page-content="belt"]').hidden);assert.equal($('[data-page-title]').textContent,'Лента');assert($('[data-edit="conveyorTime1"]').disabled);
 assert.equal($('[data-edit="conveyorTime1"] .sc-unit').textContent,'');assert.equal($('[data-edit="beltTime1"] .sc-unit').textContent,'мс');
 click('[data-page="home"]');assert(!$('[data-home-only]').hidden);
 click('[data-edit="speedSet"]');type('195');assert.equal($('#guris-scada-entry').value,'195');assert.equal($('[data-value="speedSet"]').textContent,'190');
 click('[data-apply-number]');await refresh();assert.equal(posts.length,1);assert.equal(posts[0].body.value,'195');assert.equal($('[data-value="speedSet"]').textContent,'190');assert($('[data-apply-number]').disabled);assert($('[data-edit="width"]').disabled);
 assert(!$('[data-number-overlay]').hidden);assert.equal($('[data-apply-number-text]').textContent,'Записываем…');assert(pollDelays.includes(50));
 finish();await refresh();assert.equal($('[data-value="speedSet"]').textContent,'195');assert.equal($('[data-entry-error]').textContent,'ПЛК подтвердил значение');assert($('[data-number-overlay]').hidden);assert.equal($('[data-toast]').textContent,'ПЛК подтвердил значение');assert(pollDelays.includes(100));
 click('[data-toggle-welding]');await refresh();assert.equal($('[data-welding-toggle-text]').textContent,'ВКЛ');finish();await refresh();assert.equal($('[data-welding-toggle-text]').textContent,'ВЫКЛ');assert($('[data-edit="welding"]').disabled);
 click('[data-edit="speedSet"]');type('266');click('[data-apply-number]');await refresh();assert.equal(posts.length,2);assert.match($('[data-entry-error]').textContent,/265/);click('[data-cancel-number]');
 click('[data-edit="speedSet"]');type('196');latest.fields.speedSet.value=191;latest.fields.speedSet.raw=raw('speedSet',191);await refresh();assert($('[data-apply-number]').disabled);click('[data-apply-number]');assert.equal(posts.length,2);click('[data-cancel-number]');
 click('[data-page="belt"]');click('[data-offset="1"]');await refresh();assert.equal(posts.length,3);assert.equal(Number(posts.at(-1).body.value),-.55);assert.equal(posts.at(-1).body.key,'offset');latest.fields.offsetDisplay.value=-.55;finish();await refresh();
 latest.fields.offset.value=.8;latest.fields.offset.raw=raw('offset',.8);latest.fields.offsetDisplay.value=.8;await refresh();assert($('[data-offset="1"]').disabled);assert(!$('[data-offset="-1"]').disabled);
 latest.connected=false;await refresh();assert($('[data-edit="beltStep"]').disabled);assert.equal($('[data-value="beltStep"]').textContent,'—');
 latest.connected=true;latest.epoch++;await refresh();click('[data-edit="beltStep"]');type('4');click('[data-apply-number]');await refresh();finish('uncertain');await refresh();assert.match($('[data-entry-error]').textContent,/не подтверждена/);assert(!$('[data-number-overlay]').hidden);assert($('[data-apply-number]').disabled);assert.equal(posts.length,4);click('[data-cancel-number]');
 click('[data-open-history]');assert.equal($$('[data-history-list] .sc-log-row').length,4);click('[data-close-overlay="[data-history-overlay]"]');
 assert.equal($('[data-cleaning-add]').disabled,true);assert.equal($('[data-edit="beltIdleSpeed"]'),null);
 assert($('[data-normal-belt]').disabled);latest.fields.machineState.value=13;await refresh();click('[data-normal-belt]');await refresh();assert.equal(posts.at(-1).body.key,'beltIdleSpeed');assert.equal(Number(posts.at(-1).body.value),10);finish();await refresh();assert($('[data-normal-belt]').disabled);
 click('[data-page="home"]');latest.fields.machineState.value=4;latest.fields.automatic.value=1;await refresh();assert(!$('[data-reset-counter="groups"]').disabled);
 latest.fields.machineState.value=5;latest.fields.automatic.value=0;await refresh();
 const beforeReset=posts.length;click('[data-reset-counter="groups"]');assert(!$('[data-reset-overlay]').hidden);assert.equal(posts.length,beforeReset);click('[data-reset-cancel]');
 click('[data-reset-counter="groups"]');click('[data-reset-apply]');await refresh();assert.equal(posts.at(-1).url,'/api/counter-reset');assert.equal($('[data-value="groups"]').textContent,'3');assert($('[data-reset-apply]').disabled);finish();await refresh();assert($('[data-reset-overlay]').hidden);assert.equal($('[data-value="groups"]').textContent,'0');
 click('[data-reset-counter="total"]');latest.fields.total.value=322;latest.fields.total.raw=raw('total',322);await refresh();assert(!$('[data-reset-apply]').disabled);assert.equal($('[data-reset-before]').textContent,'322');click('[data-reset-cancel]');assert.equal(posts.length,beforeReset+1);
 assert.equal($('[data-edit="welding"] .sc-field-label').textContent,'Скорость шва');
 click('[data-edit-operator]');assert(!$('[data-operator-overlay]').hidden);assert.equal($('[data-operator-name]').textContent,'Оператор');assert($('[data-auth-engineer]').hidden);click('[data-close-overlay="[data-operator-overlay]"]');
 const ast=csstree.parse(css);assert(ast.children.size>0);assert(css.includes('width:1024px; height:600px'));assert(!css.includes('@media (max-width:'));assert.equal($$('[data-page-content]').length,31);assert.equal($$('[data-lucide]').length,0);assert(!html.includes('@@EXTRA_UI@@'));
 assert.equal($$('script[src^="https:"],link[href^="https:"],img[src^="https:"]').length,0);
 w.dispatchEvent(new w.ErrorEvent('error',{message:'Тестовая ошибка\n'+'界'.repeat(100)}));await delay(5);assert.equal(uiErrors.length,1);assert.equal($('#scada-startup-notice').hidden,false);assert(Buffer.byteLength(uiErrors[0].message,'utf8')<160);assert(!uiErrors[0].message.includes('\n'));
 console.log('PASS: offline data, menu and node layout, gates, numpad, pending readback, conflict, ranges, offset, uncertainty, history and CSS.');
}
run().then(()=>{dom.window.close();}).catch(e=>{dom.window.close();console.error(e);process.exitCode=1;});
