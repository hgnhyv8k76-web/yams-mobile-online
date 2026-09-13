const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/web/app.js`, 'utf8');
function fn(name) {
  const start = source.indexOf(`function ${name}(`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}
test('score previews: full, duplicate in straight, bonus threshold', () => {
 const ctx=vm.createContext({});
 vm.runInContext(fn('scoreCategory')+fn('hasAnyRun')+fn('totalScore'),ctx);
 assert.equal(ctx.scoreCategory([2,2,2,5,5],'Full'),25);
 assert.equal(ctx.scoreCategory([2,2,2,2,2],'Full'),0);
 assert.equal(ctx.scoreCategory([1,2,3,4,4],'Petite suite'),30);
 assert.equal(ctx.totalScore({As:3,Deux:6,Trois:9,Quatre:12,Cinq:15,Six:18}),98);
});
for(const mode of ['empty','legacy-null','failure']) test(`leaderboard handles ${mode}`, async () => {
 const box={innerHTML:'',textContent:''};
 const dialog={open:false,showModal(){this.open=true}};
 const ctx=vm.createContext({$:id=>id==='leaderboard'?box:dialog,fetch:async()=>({ok:mode!=='failure',json:async()=>mode==='legacy-null'?null:[]})});
 vm.runInContext('async '+fn('showLeaderboard'),ctx);
 await ctx.showLeaderboard();
 assert.equal(dialog.open,true);
 if(mode==='failure') assert.match(box.textContent,/indisponible/);
 else assert.match(box.innerHTML,/Aucun score/);
});

for(const tied of [false,true]) test(`personal wins use player identity, tie=${tied}`, () => {
 const saved=new Map();
 const ctx=vm.createContext({
  state:{finished:true,code:'ABCDEF',round:1,players:[
   {id:'a',name:'Alex',scores:{Chance:20}},
   {id:'b',name:'Alex',scores:{Chance:tied?20:5}}
  ]},myId:'b',lastRecordedFinish:'',getMyStats:()=>JSON.parse(saved.get('yamsPersonalStats')||'{}'),
  localStorage:{setItem:(k,v)=>saved.set(k,v)},renderMyStats:()=>{}
 });
 vm.runInContext(fn('totalScore')+fn('finishedResult')+fn('recordMyStats'),ctx);
 ctx.recordMyStats();
 ctx.recordMyStats();
 const stats=JSON.parse(saved.get('yamsPersonalStats'));
 assert.equal(stats.games,1);
 assert.equal(stats.wins,tied?1:0);
 assert.equal(stats.totalScore,tied?20:5);
});

test('finished results retain departed players and historical scores', () => {
 const result={round:1,players:[{playerId:'a',name:'Alex',score:20},{playerId:'b',name:'Alex',score:5}],winnerIds:['a']};
 const ctx=vm.createContext({state:{round:1,players:[],matchHistory:[result]}});
 vm.runInContext(fn('finishedResult'),ctx);
 assert.equal(ctx.finishedResult(),result);
});

test('result screen gives tied players the same medal', () => {
 const elements=new Map();
 const element=()=>({textContent:'',innerHTML:'',children:[],classList:{add(){},remove(){},toggle(){}},appendChild(child){this.children.push(child)}});
 const ctx=vm.createContext({
  state:{finished:true,round:1,hostId:'a'},myId:'a',
  $:id=>{if(!elements.has(id)) elements.set(id,element());return elements.get(id)},
  document:{createElement:element},escapeHtml:value=>value,recordMyStats:()=>{},
  finishedResult:()=>({players:[{playerId:'a',name:'Alex',score:20},{playerId:'b',name:'Sam',score:20},{playerId:'c',name:'Jo',score:5}],winnerIds:['a','b']})
 });
 vm.runInContext(fn('renderResult'),ctx);
 ctx.renderResult();
 assert.match(elements.get('resultTitle').textContent,/Égalité : Alex & Sam/);
 const rows=elements.get('resultRanking').children;
 assert.match(rows[0].innerHTML,/🥇/);
 assert.match(rows[1].innerHTML,/🥇/);
 assert.match(rows[2].innerHTML,/🥉/);
});
