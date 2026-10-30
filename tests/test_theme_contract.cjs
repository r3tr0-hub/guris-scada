'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),css=require('css-tree');
const ui=path.resolve(__dirname,'../ui');
const sheet=fs.readFileSync(path.join(ui,'themes.css'),'utf8');
assert(!sheet.includes('data-palette='),'palette must not select a different component layout');
css.walk(css.parse(sheet),node=>{
 if(node.type!=='Declaration')return;
 assert(!/^(width|height|min-width|min-height|max-width|max-height|padding|margin|gap|display|position|inset|top|left|right|bottom|grid.*|flex.*|font.*|line-height|overflow.*)$/.test(node.property),`theme changes geometry: ${node.property}`);
 assert(!node.important,'theme must not escalate cascade with !important');
});
function luminance(hex){
 hex=hex.slice(1);if(hex.length===3)hex=[...hex].map(c=>c+c).join('');
 const c=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return c[0]*.2126+c[1]*.7152+c[2]*.0722;
}
for(const name of ['dark','classic','forest']){
 const p=JSON.parse(fs.readFileSync(path.join(ui,'themes',name+'.json'),'utf8'));
 for(const [ink,surface] of [['text','panel'],['muted','panel'],['field-ink','field'],['field-muted','field'],['primary-text','primary-bg'],['header-text','header'],['component-text','component-panel']]){
  const a=luminance(p['--sc-'+ink]),b=luminance(p['--sc-'+surface]),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  assert(ratio>=4.5,`${name}: ${ink}/${surface} contrast ${ratio.toFixed(2)} < 4.5`);
 }
}
console.log('PASS: palette-only CSS, no priority escalation, all supplied themes text/surface contrast >=4.5:1');
