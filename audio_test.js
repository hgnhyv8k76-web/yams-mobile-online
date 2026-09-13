const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(`${__dirname}/web/audio.js`,'utf8');
function setup() {
 const storage=new Map(), events={};
 let contexts=0, starts=0, resumes=0;
 const engines=[];
 const parameter=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(value){this.value=value}});
 const node=()=>({gain:parameter(),frequency:parameter(),connect(){},disconnect(){},start(){starts++},stop(){}});
 class Audio {
  constructor(){contexts++;this.state='running';this.currentTime=0;this.sampleRate=44100;this.destination={};engines.push(this)}
  resume(){resumes++;return Promise.resolve().then(()=>{this.state='running'})}
  close(){this.state='closed';return Promise.resolve()}
  createGain(){return node()}
  createOscillator(){return node()}
  createBiquadFilter(){return node()}
  createBufferSource(){return node()}
  createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)}}
 }
 const context=vm.createContext({setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{},window:{AudioContext:Audio,addEventListener(){}},document:{hidden:false,addEventListener:(name,fn)=>events[name]=fn},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}});
 vm.runInContext(source+'\nthis.audio=gameAudio;',context);
 return {context,storage,events,audio:context.audio,contexts:()=>contexts,starts:()=>starts,engines,resumes:()=>resumes};
}
test('audio unlocks once and suppresses muted, zero-volume and hidden-page sounds',()=>{
 const h=setup();
 h.audio.play('roll'); assert.equal(h.starts(),0);
 h.events.pointerdown();h.events.keydown();assert.equal(h.contexts(),1);
 h.audio.play('roll');assert.equal(h.starts(),10);
 h.audio.setEnabled(false);h.audio.play('victory');assert.equal(h.starts(),10);
 h.audio.setEnabled(true);h.audio.setVolume(0);h.audio.play('turn');assert.equal(h.starts(),10);
 h.audio.setVolume(60);h.context.document.hidden=true;h.audio.play('score');assert.equal(h.starts(),10);
 h.context.document.hidden=false;h.audio.play('victory');assert.equal(h.starts(),14);
 assert.equal(h.storage.get('yamsVolume'),'60');assert.equal(h.contexts(),1);
});
test('audio gracefully handles browsers without Web Audio',()=>{
 const context=vm.createContext({window:{addEventListener(){}},document:{addEventListener(){}},localStorage:{getItem:()=>null}});
 vm.runInContext(source+'\ngameAudio.unlock();gameAudio.play("roll");',context);
});

test('ambient sound has independent volume and follows page visibility',()=>{
 const h=setup();
 h.audio.setEnabled(false);
 h.audio.setAmbient(true);
 assert.equal(h.contexts(),1);
 assert.equal(h.starts(),3);
 h.audio.play('score');assert.equal(h.starts(),3);
 h.audio.setAmbientVolume(40);
 assert.equal(h.audio.volume,55);
 assert.equal(h.audio.ambientVolume,40);
 h.context.document.hidden=true;h.events.visibilitychange();
 h.context.document.hidden=false;h.events.visibilitychange();
 assert.equal(h.starts(),6);
 h.audio.setAmbient(false);
 h.audio.setEnabled(true);h.audio.play('hold');
 assert.equal(h.starts(),7);
 assert.equal(h.storage.get('yamsAmbient'),'off');
});

for(const interruptedState of ['suspended','interrupted'])test(`sound resumes from ${interruptedState} before playing`,async()=>{
 const h=setup();await h.audio.unlock();h.engines[0].state=interruptedState;
 h.audio.play('score');assert.equal(h.starts(),0);
 await h.audio.unlock();await Promise.resolve();
 assert.equal(h.starts(),3);assert.equal(h.resumes(),1);
 assert.equal(typeof h.events.touchend,'function');assert.equal(typeof h.events.click,'function');
});
test('muting while resuming drops the queued sound',async()=>{
 const h=setup();await h.audio.unlock();h.engines[0].state='interrupted';
 h.audio.play('victory');h.audio.setEnabled(false);
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(h.starts(),0);
});
test('explicit sound test rebuilds a closed audio graph',async()=>{
 const h=setup();await h.audio.unlock();h.engines[0].state='closed';
 assert.equal(await h.audio.test(),'started');assert.equal(h.contexts(),2);assert.equal(h.starts(),2);
 h.audio.setVolume(0);assert.equal(await h.audio.test(),'zero');
});

test('touchend retries a resume that stayed pending on pointerdown',async()=>{
 const h=setup();await h.audio.unlock();
 const engine=h.engines[0];engine.state='suspended';let attempts=0;
 engine.resume=()=>{attempts++;return attempts===1?new Promise(()=>{}):Promise.resolve().then(()=>{engine.state='running'})};
 h.events.pointerdown({type:'pointerdown',isTrusted:true});
 await h.events.touchend({type:'touchend',isTrusted:true});
 h.audio.play('ready');
 assert.equal(attempts,2);assert.equal(h.starts(),2);
});
