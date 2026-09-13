// One audio graph for the whole session; unlocked by a real user gesture.
const gameAudio = (() => {
  let context, master;
  let enabled = localStorage.getItem('yamsSound') !== 'off';
  const stored = Number(localStorage.getItem('yamsVolume') ?? 55);
  let volume = Number.isFinite(stored) ? Math.max(0, Math.min(100, stored)) : 55;
  function sync() {
    if(master) master.gain.setTargetAtTime(enabled ? volume / 100 : 0, context.currentTime, .015);
  }
  function unlock() {
    if(!enabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if(!Audio) return;
      if(!context) {
        context = new Audio();
        master = context.createGain();
        master.gain.value = volume / 100;
        master.connect(context.destination);
      }
      if(context.state === 'suspended') context.resume().catch(() => {});
    } catch(_) {}
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
    if(!enabled || !volume || !context || context.state !== 'running' || document.hidden) return;
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
  document.addEventListener('pointerdown',unlock,{capture:true,passive:true});
  document.addEventListener('keydown',unlock,{capture:true});
  return {
    play, unlock,
    get volume(){return volume},
    setEnabled(value){enabled=value;sync();if(enabled)unlock()},
    setVolume(value){volume=Math.max(0,Math.min(100,Number(value)||0));localStorage.setItem('yamsVolume',String(volume));sync()}
  };
})();
