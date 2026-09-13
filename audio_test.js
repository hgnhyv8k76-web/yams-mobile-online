const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(`${__dirname}/web/audio.js`,'utf8');
function setup() {
 const storage=new Map(), events={};
 let contexts=0, starts=0;
 const parameter=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(value){this.value=value}});
 const node=()=>({gain:parameter(),frequency:parameter(),connect(){},disconnect(){},start(){starts++},stop(){}});
 class Audio {
  constructor(){contexts++;this.state='running';this.currentTime=0;this.sampleRate=44100;this.destination={}}
  createGain(){return node()}
  createOscillator(){return node()}
  createBiquadFilter(){return node()}
  createBufferSource(){return node()}
  createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)}}
 }
 const context=vm.createContext({window:{AudioContext:Audio},document:{hidden:false,addEventListener:(name,fn)=>events[name]=fn},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}});
 vm.runInContext(source+'\nthis.audio=gameAudio;',context);
 return {context,storage,events,audio:context.audio,contexts:()=>contexts,starts:()=>starts};
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
 const context=vm.createContext({window:{},document:{addEventListener(){}},localStorage:{getItem:()=>null}});
 vm.runInContext(source+'\ngameAudio.unlock();gameAudio.play("roll");',context);
});
