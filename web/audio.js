// One audio graph for the whole session; unlocked by a real user gesture.
const gameAudio = (() => {
  let context, master;
  let resumeTask=null, pendingSound=null;
  let ambientEnabled=localStorage.getItem('yamsAmbient')==='on';
  let ambientVolume=Math.max(0,Math.min(100,Number(localStorage.getItem('yamsAmbientVolume')??25)||0));
  let ambientNodes=[],ambientGain,ambientTimer;
  let enabled = localStorage.getItem('yamsSound') !== 'off';
  const stored = Number(localStorage.getItem('yamsVolume') ?? 55);
  let volume = Number.isFinite(stored) ? Math.max(0, Math.min(100, stored)) : 55;
  function sync() {
    if(master) master.gain.setTargetAtTime(enabled ? volume / 100 : 0, context.currentTime, .015);
  }
  function unlock(event) {
    if(!enabled && !ambientEnabled) return Promise.resolve(false);
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if(!Audio) return Promise.resolve(false);
      if(!context || context.state==='closed') {
        stopAmbient();
        context = new Audio();
        master = context.createGain();
        master.gain.value = enabled ? volume / 100 : 0;
        master.connect(context.destination);
        resumeTask=null;
      }
      if(context.state==='running'){syncAmbient();return Promise.resolve(true)}
      // iOS can enter "interrupted" after backgrounding or a phone call.
      const target=context;
      const gesture=event && event.isTrusted!==false && ['pointerdown','touchend','click','keydown'].includes(event.type);
      if(!resumeTask || gesture){
        const task=Promise.resolve(target.resume()).then(()=>{
          if(target!==context)return false;
          syncAmbient();return target.state==='running';
        }).catch(()=>false);
        resumeTask=task;
        task.finally(()=>{if(resumeTask===task)resumeTask=null});
      }
      return resumeTask;
    } catch(_) {return Promise.resolve(false)}
  }
  function stopAmbient(){
    clearInterval(ambientTimer);
    for(const node of ambientNodes){try{node.stop();node.disconnect()}catch(_){}}
    ambientNodes=[];
    if(ambientGain){ambientGain.disconnect();ambientGain=null}
  }
  function syncAmbient(){
    if(!ambientEnabled || !ambientVolume || document.hidden || !context || context.state!=='running'){stopAmbient();return}
    if(ambientGain){ambientGain.gain.setTargetAtTime(ambientVolume/100*.035,context.currentTime,.15);return}
    ambientGain=context.createGain();ambientGain.gain.value=0;ambientGain.connect(context.destination);
    ambientGain.gain.setTargetAtTime(ambientVolume/100*.035,context.currentTime,.6);
    const chords=[[130.81,164.81,196],[110,130.81,164.81],[87.31,130.81,174.61],[98,146.83,196]];
    ambientNodes=chords[0].map((freq,i)=>{
      const node=context.createOscillator();node.type='sine';node.frequency.value=freq;
      node.connect(ambientGain);node.start();return node;
    });
    let chord=0;
    ambientTimer=setInterval(()=>{
      chord=(chord+1)%chords.length;
      ambientNodes.forEach((node,i)=>node.frequency.setTargetAtTime(chords[chord][i],context.currentTime,.9));
    },8000);
  }
  function tone(frequency, at, duration, level=.12, type='sine') {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at+.008);
    gain.gain.exponentialRampToValueAtTime(.0001, at+duration);
    oscillator.connect(gain); gain.connect(master);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(at); oscillator.stop(at+duration+.01);
  }
  function play(kind) {
    if(!enabled || !volume || !context || document.hidden) return;
    if(context.state!=='running'){
      const request={kind,at:Date.now()};pendingSound=request;
      unlock().then(ready=>{
        if(pendingSound!==request)return;
        pendingSound=null;
        if(ready && Date.now()-request.at<1000)play(kind);
      });
      return;
    }
    try {
      const now = context.currentTime + .01;
      if(kind === 'roll') {
        // Filtered noise and short low tones evoke dice landing on felt.
        for(let i=0; i<5; i++) {
          const at=now+i*.065, size=Math.ceil(context.sampleRate*.055);
          const buffer=context.createBuffer(1,size,context.sampleRate), data=buffer.getChannelData(0);
          for(let j=0;j<size;j++) data[j]=(Math.random()*2-1)*Math.pow(1-j/size,3);
          const source=context.createBufferSource(), filter=context.createBiquadFilter(), gain=context.createGain();
          source.buffer=buffer; filter.type='lowpass'; filter.frequency.value=1800+Math.random()*1400;
          gain.gain.value=.22*(1-i*.1);
          source.connect(filter); filter.connect(gain); gain.connect(master);
          source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};
          source.start(at);
          tone(170+Math.random()*110,at,.045,.09,'triangle');
        }
        return;
      }
      const notes = {
        hold:[660], release:[440], score:[523,659,784], turn:[659,880],
        victory:[523,659,784,1047], ready:[523,784]
      }[kind] || [];
      notes.forEach((note,i)=>tone(note,now+i*.095,kind==='victory'?.42:.16,kind==='hold'||kind==='release'?.06:.1));
    } catch(_) {}
  }
  async function testSound(){
    if(!volume)return 'zero';
    // A deliberate tap can rebuild an audio graph stuck after an OS interruption.
    stopAmbient();pendingSound=null;resumeTask=null;
    const old=context;context=null;master=null;
    if(old){try{Promise.resolve(old.close()).catch(()=>{})}catch(_){}}
    let timer;
    const ready=await Promise.race([unlock(),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),1500)})]);
    clearTimeout(timer);
    if(ready){play('ready');return 'started'}
    return 'blocked';
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pendingSound=null;stopAmbient()}else if(context)unlock()});
  document.addEventListener('pointerdown',unlock,{capture:true,passive:true});
  document.addEventListener('keydown',unlock,{capture:true});
  document.addEventListener('touchend',unlock,{capture:true,passive:true});
  document.addEventListener('click',unlock,{capture:true});
  window.addEventListener('pageshow',()=>{if(context)unlock()});
  return {
    play, unlock, test:testSound,
    get ambientEnabled(){return ambientEnabled},
    get ambientVolume(){return ambientVolume},
    setAmbient(value){ambientEnabled=!!value;localStorage.setItem('yamsAmbient',value?'on':'off');if(value)unlock();else stopAmbient()},
    setAmbientVolume(value){ambientVolume=Math.max(0,Math.min(100,Number(value)||0));localStorage.setItem('yamsAmbientVolume',String(ambientVolume));syncAmbient()},
    get volume(){return volume},
    setEnabled(value){enabled=value;sync();if(enabled)unlock()},
    setVolume(value){volume=Math.max(0,Math.min(100,Number(value)||0));localStorage.setItem('yamsVolume',String(volume));sync()}
  };
})();
