const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('all scripts initialize together against the shipped HTML controls',()=>{
 const html=fs.readFileSync(`${__dirname}/web/index.html`,'utf8');
 const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>[id,{
  value:'',textContent:'',dataset:{},classList:{toggle(){},add(){},remove(){}},
  addEventListener(){},setAttribute(){},style:{setProperty(){}}
 }]));
 const get=id=>{assert.ok(elements.has(id),`Missing HTML control: ${id}`);return elements.get(id)};
 const context=vm.createContext({
  document:{getElementById:get,querySelectorAll:()=>[],documentElement:{dataset:{}},addEventListener(){}},
  window:{matchMedia:()=>({matches:false}),addEventListener(){}},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}},navigator:{},location:{search:''},URLSearchParams
 });
 for(const file of ['audio.js','app.js','features.js'])vm.runInContext(fs.readFileSync(`${__dirname}/web/${file}`,'utf8'),context,{filename:file});
 assert.equal(typeof get('soloBtn').onclick,'function');
 assert.equal(typeof get('preferencesBtn').onclick,'function');
 assert.equal(get('tableTheme').value,'green');
 assert.equal(get('ambientBtn').textContent,'Activer le fond sonore');
});
