const $ = (id) => document.getElementById(id);

const categories = [
  "As","Deux","Trois","Quatre","Cinq","Six",
  "Brelan","Carré","Full","Petite suite","Grande suite","Yams","Chance"
];

const diceChars = ["","⚀","⚁","⚂","⚃","⚄","⚅"];

let ws = null;
let state = null;
let onHomeScreen = true;
let chatHidden = false;
const PROFILE_DEFAULT = {avatar:"🎲", color:"blue"};
let lastRecordedFinish = localStorage.getItem("yamsLastRecordedFinish") || "";
let myId = localStorage.getItem("yamsPlayerId") || "";
let roomCode = localStorage.getItem("yamsRoomCode") || "";
let myName = localStorage.getItem("yamsName") || "";
let rollingVisual = false;
let rollAnimationToken = 0;
let soundEnabled = localStorage.getItem("yamsSound") !== "off";
let reconnectAttempts = 0;
let reconnectTimer = null;
let lastCelebratedChatId = "";
const MOBILE_DICE_MODE = window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;

$("nameInput").value = myName;

function connect(callback){
  const proto = location.protocol === "https:" ? "wss" : "ws";
  setConnectionStatus("connecting");
  ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onopen = () => {
    reconnectAttempts = 0;
    setConnectionStatus("online");
    callback && callback();
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if(msg.type === "error"){
      toast(msg.message);
      return;
    }
    if(msg.type === "state"){
      if(onHomeScreen) return;
      const previousState = state;
      state = msg.room;
      const me = state.players.find(p => p.id === myId);
      if(!me && !myId && state.players.length){
        // On create/join, server state arrives before a separate ID message,
        // so infer newest matching player by name.
        const name = $("nameInput").value.trim() || "Joueur";
        const matches = state.players.filter(p => p.name === name);
        if(matches.length){
          myId = matches[matches.length-1].id;
          localStorage.setItem("yamsPlayerId", myId);
        }
      }
      roomCode = state.code;
      localStorage.setItem("yamsRoomCode", roomCode);
      render();
      maybeAnimateRoll(previousState, state);
      maybeCelebrateYams();
    }
  };
  ws.onclose = () => {
    setConnectionStatus("offline");
    if(onHomeScreen) return;
    reconnectAttempts++;
    const wait = Math.min(8000, 1200 * reconnectAttempts);
    toast(`Connexion perdue. Reconnexion dans ${Math.ceil(wait/1000)} s…`);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(tryReconnect, wait);
  };
  ws.onerror = () => setConnectionStatus("offline");
}

function send(obj){
  if(ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function createRoom(){
  onHomeScreen = false;
  const name = cleanName();
  resetIdentity();
  connect(() => send({
    type:"create",
    name,
    avatar:$("avatarInput").value,
    color:$("colorInput").value,
    maxPlayers:Number($("maxPlayers").value)
  }));
}

function joinRoom(){
  onHomeScreen = false;
  const name = cleanName();
  const code = $("codeInput").value.trim().toUpperCase();
  if(code.length < 4){ toast("Entre le code de la partie."); return; }
  resetIdentity();
  connect(() => send({type:"join", code, name, avatar:$("avatarInput").value, color:$("colorInput").value}));
}

function tryReconnect(){
  if(!roomCode || !myId) return;
  onHomeScreen = false;
  connect(() => send({type:"reconnect", code:roomCode, playerId:myId}));
}

function cleanName(){
  const name = $("nameInput").value.trim() || "Joueur";
  localStorage.setItem("yamsName", name);
  localStorage.setItem("yamsAvatar", $("avatarInput").value || PROFILE_DEFAULT.avatar);
  localStorage.setItem("yamsColor", $("colorInput").value || PROFILE_DEFAULT.color);
  return name;
}

function resetIdentity(){
  myId = "";
  roomCode = "";
  localStorage.removeItem("yamsPlayerId");
  localStorage.removeItem("yamsRoomCode");
}

function render(){
  if(!state || onHomeScreen) return;
  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");
  $("roomCode").textContent = state.code;

  const me = state.players.find(p => p.id === myId);
  const current = state.players[state.currentPlayer];
  const isMyTurn = !!current && current.id === myId;
  const isHost = state.hostId === myId;
  const meReady = !!me?.ready;

  $("readyBtn").classList.toggle("hidden", state.started || state.finished);
  $("readyBtn").textContent = meReady ? "✓ Prêt" : "Je suis prêt";
  $("startBtn").classList.toggle("hidden", !(isHost && !state.started && state.players.length >= 2));
  $("startBtn").disabled = state.started;
  $("turnName").textContent = state.finished ? `🏆 ${state.winner}` : (current ? current.name : "En attente…");
  $("rollCount").textContent = `${state.rolls} / 3`;
  $("roomRound").textContent = `Manche ${state.round || 1}`;
  $("roomSlots").textContent = `${state.players.length} / ${state.maxPlayers} joueurs`;
  $("rollBtn").disabled = !state.started || !isMyTurn || state.rolls >= 3 || state.finished;

  renderPlayers();
  renderDice(isMyTurn);
  renderChat();
  renderResult();
  renderMatchHistory();
  renderScore(me, isMyTurn);
}

function renderPlayers(){
  const box = $("players");
  box.innerHTML = "";
  state.players.forEach((p,i) => {
    const total = totalScore(p.scores);
    const div = document.createElement("div");
    div.className = "player color-" + (p.color || "blue") + (p.id===myId ? " me":"") + (i===state.currentPlayer && state.started ? " current":"");
    div.innerHTML = `
      <div>
        <div class="playerName"><span class="playerAvatar">${escapeHtml(p.avatar || "🎲")}</span><span class="online ${p.online?"":"offline"}"></span>${escapeHtml(p.name)} ${p.id===state.hostId?"👑":""}</div>
        <div class="playerMeta">${Object.keys(p.scores).length}/13 cases • <span class="${p.ready ? "readyBadge" : "notReadyBadge"}">${p.ready ? "prêt" : "pas prêt"}</span></div>
      </div>
      <strong>${total} pts</strong>`;
    box.appendChild(div);
  });
}

function pipPattern(value){
  const patterns = {
    1:[5], 2:[1,9], 3:[1,5,9], 4:[1,3,7,9], 5:[1,3,5,7,9], 6:[1,3,4,6,7,9]
  };
  return patterns[value] || [];
}

function setDieFace(el,value){
  const active = new Set(pipPattern(value));
  el.dataset.value = String(value);
  el.querySelectorAll(".pip").forEach((pip,i)=>pip.classList.toggle("on", active.has(i+1)));
}

function buildDie(value,index,isMyTurn){
  const d = document.createElement("div");
  d.className = "die" + (state.held[index] ? " held":"") + (!isMyTurn ? " disabled":"");
  d.dataset.index = String(index);
  d.setAttribute("role","button");
  d.setAttribute("aria-label",`Dé ${index+1}, valeur ${value}${state.held[index] ? ", gardé" : ""}`);
  for(let p=0;p<9;p++){
    const pip=document.createElement("span");
    pip.className="pip";
    d.appendChild(pip);
  }
  setDieFace(d,value);
  d.onclick = () => {
    if(rollingVisual || !isMyTurn || state.rolls===0 || state.finished) return;
    send({type:"hold", index, held:!state.held[index]});
  };
  return d;
}

function renderDice(isMyTurn){
  const box = $("dice");
  box.innerHTML = "";
  state.dice.forEach((v,i) => box.appendChild(buildDie(v,i,isMyTurn)));
}

function maybeAnimateRoll(previous,next){
  if(!previous || !next || previous.code !== next.code) return;
  if(next.rolls <= previous.rolls) return;
  animateDiceRoll([...next.dice],[...next.held]);
}

function animateDiceRoll(finalDice,held){
  const diceEls=[...document.querySelectorAll("#dice .die")];
  if(!diceEls.length) return;

  const token=++rollAnimationToken;
  rollingVisual=true;
  $("rollBtn").disabled=true;

  const flash=$("rollFlash");
  if(flash && !MOBILE_DICE_MODE){
    flash.classList.remove("hidden");
    void flash.offsetWidth;
    requestAnimationFrame(()=>flash.classList.remove("hidden"));
  }

  playDiceSound();
  if(navigator.vibrate) navigator.vibrate(MOBILE_DICE_MODE ? 12 : [18,22,16]);

  diceEls.forEach((el,i)=>{
    if(held[i]) return;
    el.classList.add("rolling");
    el.style.setProperty("--delay", MOBILE_DICE_MODE ? "0ms" : `${i*22}ms`);
  });

  // Téléphone : pas de redessin des points pendant le lancer.
  // Le navigateur anime uniquement les transforms CSS -> beaucoup plus fluide.
  if(MOBILE_DICE_MODE){
    setTimeout(()=>{
      if(token!==rollAnimationToken) return;
      diceEls.forEach((el,i)=>{
        if(!held[i]) setDieFace(el,finalDice[i]);
        el.classList.remove("rolling");
        el.style.removeProperty("--delay");
      });
      if(flash) flash.classList.add("hidden");
      rollingVisual=false;
      const current=state?.players?.[state.currentPlayer];
      const isMyTurn=current?.id===myId;
      $("rollBtn").disabled=!state?.started || !isMyTurn || state.rolls>=3 || state.finished;
    },480);
    return;
  }

  let ticks=0;
  const timer=setInterval(()=>{
    if(token!==rollAnimationToken){clearInterval(timer);return;}
    diceEls.forEach((el,i)=>{
      if(!held[i]) setDieFace(el,1+Math.floor(Math.random()*6));
    });
    ticks++;
    if(ticks>=5){
      clearInterval(timer);
      setTimeout(()=>{
        if(token!==rollAnimationToken) return;
        diceEls.forEach((el,i)=>{
          setDieFace(el,finalDice[i]);
          el.classList.remove("rolling");
          el.style.removeProperty("--delay");
        });
        if(flash) flash.classList.add("hidden");
        rollingVisual=false;
        const current=state?.players?.[state.currentPlayer];
        const isMyTurn=current?.id===myId;
        $("rollBtn").disabled=!state?.started || !isMyTurn || state.rolls>=3 || state.finished;
      },90);
    }
  },74);
}

function renderMatchHistory(){
  const card=$("historyCard"), box=$("matchHistory");
  const history=Array.isArray(state?.matchHistory)?state.matchHistory:[];
  if(!history.length){card.classList.add("hidden");box.innerHTML="";return;}
  card.classList.remove("hidden"); box.innerHTML="";
  [...history].reverse().forEach(item=>{
    const row=document.createElement("div");row.className="historyRow";
    const left=document.createElement("div"), title=document.createElement("strong"), details=document.createElement("div");
    title.textContent=`Manche ${item.round} • ${item.winner}`; details.className="historyDetails";
    details.textContent=Object.entries(item.scores||{}).map(([n,s])=>`${n}: ${s}`).join(" • ");
    left.append(title,details); const trophy=document.createElement("span");trophy.textContent="🏆"; row.append(left,trophy);box.appendChild(row);
  });
}

function renderResult(){
  const card = $("resultCard");
  if(!state || !state.finished){
    card.classList.add("hidden");
    return;
  }

  card.classList.remove("hidden");
  $("resultTitle").textContent = `🏆 ${state.winner} gagne la manche ${state.round || 1}`;

  const ranking = [...state.players]
    .map(p => ({name:p.name, score:totalScore(p.scores)}))
    .sort((a,b)=>b.score-a.score);

  const box = $("resultRanking");
  box.innerHTML = "";
  ranking.forEach((r,i)=>{
    const row = document.createElement("div");
    row.className = "rankRow";
    const medal = i===0 ? "🥇" : i===1 ? "🥈" : i===2 ? "🥉" : `${i+1}.`;
    row.innerHTML = `<span>${medal} ${escapeHtml(r.name)}</span><strong>${r.score} pts</strong>`;
    box.appendChild(row);
  });

  const isHost = state.hostId === myId;
  $("rematchBtn").classList.toggle("hidden", !isHost);
  recordMyStats();
}

function renderChat(){
  const box = $("chatMessages");
  if(!box) return;

  const messages = Array.isArray(state?.chat) ? state.chat : [];
  box.innerHTML = "";
  if(chatHidden){
    const hidden = document.createElement("div");
    hidden.className = "chatEmpty";
    hidden.textContent = "Chat masqué sur cet appareil.";
    box.appendChild(hidden);
    return;
  }

  if(messages.length === 0){
    const empty = document.createElement("div");
    empty.className = "chatEmpty";
    empty.textContent = "Aucun message pour l’instant.";
    box.appendChild(empty);
    return;
  }

  messages.forEach(m => {
    const bubble = document.createElement("div");
    const isSystem = m.playerId === "system";
    bubble.className = "chatBubble" + (m.playerId === myId ? " me" : "") + (isSystem ? " system" : "");

    const meta = document.createElement("div");
    meta.className = "chatMeta";
    let timeText = "";
    try{
      timeText = new Date(m.sentAt).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    }catch(_){}
    meta.textContent = m.name + (m.playerId === myId ? " • toi" : "") + (timeText ? ` • ${timeText}` : "");

    const body = document.createElement("div");
    body.className = "chatText";
    body.textContent = m.text;

    bubble.appendChild(meta);
    bubble.appendChild(body);
    box.appendChild(bubble);
  });

  box.scrollTop = box.scrollHeight;
}

function sendChat(){
  const input = $("chatInput");
  if(!input || !state || onHomeScreen) return;

  const text = input.value.trim();
  if(!text) return;

  if(text.length > 300){
    toast("Message trop long.");
    return;
  }

  send({type:"chat", text});
  input.value = "";
  input.focus();
}

function renderScore(me,isMyTurn){
  const box = $("scoreTable");
  box.innerHTML = "";
  const scores = me?.scores || {};

  categories.forEach(cat => {
    const used = Object.prototype.hasOwnProperty.call(scores,cat);
    const potential = state.rolls > 0 ? scoreCategory(state.dice,cat) : null;

    const row = document.createElement("div");
    row.className = "scoreRow" + (used ? " used":"") + (!used && isMyTurn && state.rolls>0 ? " available":"");

    row.innerHTML = `
      <div>${cat}</div>
      <div class="scoreValue">${used ? scores[cat] : "—"}</div>
      <div class="scorePotential">${used ? "✓" : (potential===null ? "—" : potential)}</div>`;

    if(!used && isMyTurn && state.rolls>0 && !state.finished){
      row.onclick = () => {
        if(confirm(`Valider ${cat} pour ${potential} point(s) ?`)){
          send({type:"score", category:cat});
        }
      };
    }
    box.appendChild(row);
  });

  const upperCats = ["As","Deux","Trois","Quatre","Cinq","Six"];
  const upperSubtotal = upperCats.reduce((sum,cat)=>sum+(scores[cat]||0),0);
  const bonus = upperSubtotal >= 63 ? 35 : 0;
  const total = totalScore(scores);

  $("upperSubtotal").textContent = `${upperSubtotal} / 63`;
  $("upperBonus").textContent = bonus ? "+35" : "+0";
  $("upperBonus").closest(".bonusRow")?.classList.toggle("active", bonus === 35);
  $("grandTotal").textContent = `${total} pts`;
}

function scoreCategory(dice,cat){
  const counts = {};
  let sum = 0;
  dice.forEach(d => { counts[d]=(counts[d]||0)+1; sum+=d; });

  const upper = {As:1,Deux:2,Trois:3,Quatre:4,Cinq:5,Six:6};
  if(upper[cat]) return upper[cat]*(counts[upper[cat]]||0);

  const vals = Object.values(counts);
  if(cat==="Brelan") return vals.some(n=>n>=3) ? sum : 0;
  if(cat==="Carré") return vals.some(n=>n>=4) ? sum : 0;
  if(cat==="Full") return vals.includes(3) && vals.includes(2) ? 25 : 0;
  if(cat==="Petite suite"){
    return hasAnyRun(counts,[[1,2,3,4],[2,3,4,5],[3,4,5,6]]) ? 30 : 0;
  }
  if(cat==="Grande suite") return hasAnyRun(counts,[[1,2,3,4,5],[2,3,4,5,6]]) ? 40 : 0;
  if(cat==="Yams") return vals.includes(5) ? 50 : 0;
  if(cat==="Chance") return sum;
  return 0;
}

function hasAnyRun(counts,runs){
  return runs.some(run => run.every(v => counts[v]));
}

function totalScore(scores){
  const upperCats = ["As","Deux","Trois","Quatre","Cinq","Six"];
  let total = Object.values(scores).reduce((a,b)=>a+b,0);
  const upper = upperCats.reduce((a,c)=>a+(scores[c]||0),0);
  if(upper >= 63) total += 35;
  return total;
}

function loadProfileV9(){
  $("avatarInput").value = localStorage.getItem("yamsAvatar") || PROFILE_DEFAULT.avatar;
  $("colorInput").value = localStorage.getItem("yamsColor") || PROFILE_DEFAULT.color;
  renderMyStats();
}

function getMyStats(){
  try{return JSON.parse(localStorage.getItem("yamsPersonalStats") || "{}") || {}}catch(_){return {}}
}

function renderMyStats(){
  const s=getMyStats();
  $("statGames").textContent=s.games||0;
  $("statWins").textContent=s.wins||0;
  $("statBest").textContent=s.best||0;
  $("statAvg").textContent=s.games ? Math.round((s.totalScore||0)/s.games) : 0;
}

function recordMyStats(){
  if(!state?.finished || !myId) return;
  const key=`${state.code}:${state.round || 1}`;
  if(lastRecordedFinish===key) return;
  const me=state.players.find(p=>p.id===myId);
  if(!me) return;
  const score=totalScore(me.scores||{});
  const s=getMyStats();
  s.games=(s.games||0)+1;
  s.wins=(s.wins||0)+(state.winner===me.name?1:0);
  s.best=Math.max(s.best||0,score);
  s.totalScore=(s.totalScore||0)+score;
  localStorage.setItem("yamsPersonalStats",JSON.stringify(s));
  localStorage.setItem("yamsLastRecordedFinish",key);
  lastRecordedFinish=key;
  renderMyStats();
}

function openAbout(){ $("aboutModal").classList.remove("hidden"); }
function closeAbout(){ $("aboutModal").classList.add("hidden"); }

async function shareGame(){
  if(!state) return;
  const url = location.origin;
  const text = `Rejoins-moi sur Yam's Sandra d'amour ❤️\n${url}\nCode : ${state.code}\nCréé par Loïc Bordier`;

  try{
    if(navigator.share){
      await navigator.share({title:"Yam's Sandra d'amour", text, url});
      return;
    }
  }catch(_){}

  try{
    await navigator.clipboard.writeText(text);
    toast("Invitation copiée.");
  }catch(_){
    toast(`Lien : ${url} • Code : ${state.code}`);
  }
}

function setConnectionStatus(mode){
  const el=$("connectionStatus");
  if(!el) return;
  el.classList.remove("online","connecting");
  if(mode==="online"){
    el.classList.add("online"); el.textContent="● En ligne";
  }else if(mode==="connecting"){
    el.classList.add("connecting"); el.textContent="● Connexion…";
  }else{
    el.textContent="● Hors ligne";
  }
}

function updateSoundButton(){
  const btn=$("soundBtn");
  if(btn) btn.textContent=soundEnabled ? "🔊 Son" : "🔇 Muet";
}

function playDiceSound(){
  if(!soundEnabled) return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return;
    const ctx=new AC();
    const now=ctx.currentTime;
    for(let i=0;i<(MOBILE_DICE_MODE?3:6);i++){
      const osc=ctx.createOscillator(), gain=ctx.createGain();
      osc.type="triangle";
      osc.frequency.setValueAtTime(125+Math.random()*150,now+i*.045);
      gain.gain.setValueAtTime(.0001,now+i*.045);
      gain.gain.exponentialRampToValueAtTime(.055,now+i*.045+.006);
      gain.gain.exponentialRampToValueAtTime(.0001,now+i*.045+.035);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now+i*.045); osc.stop(now+i*.045+.045);
    }
    setTimeout(()=>ctx.close().catch(()=>{}),700);
  }catch(_){}
}

function maybeCelebrateYams(){
  const messages=Array.isArray(state?.chat)?state.chat:[];
  const last=[...messages].reverse().find(m=>String(m.text||"").includes("vient de faire un Yams"));
  if(!last || last.id===lastCelebratedChatId) return;
  lastCelebratedChatId=last.id;
  showCelebration("YAMS !");
}

function showCelebration(text){
  const layer=$("confettiLayer"), overlay=$("celebration");
  if(!layer||!overlay) return;
  $("celebrationText").textContent=text;
  layer.innerHTML="";
  for(let i=0;i<48;i++){
    const c=document.createElement("i");
    c.className="confetti";
    c.style.left=`${Math.random()*100}%`;
    c.style.setProperty("--dur",`${1.7+Math.random()*1.25}s`);
    c.style.setProperty("--wait",`${Math.random()*.35}s`);
    c.style.setProperty("--drift",`${-90+Math.random()*180}px`);
    c.style.setProperty("--rot",`${Math.random()*180}deg`);
    layer.appendChild(c);
  }
  overlay.classList.remove("hidden");
  if(soundEnabled) playVictoryChime();
  setTimeout(()=>overlay.classList.add("hidden"),2700);
}

function playVictoryChime(){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return;
    const ctx=new AC(), notes=[523.25,659.25,783.99,1046.5];
    notes.forEach((freq,i)=>{
      const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+i*.09;
      o.type="sine";o.frequency.value=freq;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.09,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+.28);o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+.3);
    });
    setTimeout(()=>ctx.close().catch(()=>{}),900);
  }catch(_){}
}

async function showLeaderboard(){
  const res = await fetch("/api/leaderboard");
  const rows = await res.json();
  const box = $("leaderboard");
  box.innerHTML = rows.length ? "" : "<p>Aucun score enregistré.</p>";
  rows.forEach((r,i)=>{
    const div=document.createElement("div");
    div.className="leaderRow";
    div.innerHTML=`<span>${i+1}. ${escapeHtml(r.name)}</span><strong>${r.score} pts</strong>`;
    box.appendChild(div);
  });
  $("leaderDialog").showModal();
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function toast(msg){
  const el=$("toast");
  el.textContent=msg;
  el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2200);
}


function updateResumeButton(){
  const canResume = !!(localStorage.getItem("yamsRoomCode") && localStorage.getItem("yamsPlayerId"));
  $("resumeBtn").classList.toggle("hidden", !canResume);
}

function disconnectSocket(){
  if(!ws) return;
  try{
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onopen = null;
    ws.close();
  }catch(_){}
  ws = null;
  setConnectionStatus("offline");
}

function backToHome(clearSession){
  // Important: switch navigation state BEFORE closing the socket.
  // Any late WebSocket packet is therefore ignored.
  onHomeScreen = true;
  disconnectSocket();
  state = null;

  if(clearSession){
    resetIdentity();
  } else {
    roomCode = localStorage.getItem("yamsRoomCode") || roomCode;
    myId = localStorage.getItem("yamsPlayerId") || myId;
  }

  $("game").classList.add("hidden");
  $("lobby").classList.remove("hidden");
  $("codeInput").value = "";
  window.addEventListener("online",()=>{setConnectionStatus("connecting");if(!onHomeScreen)tryReconnect();});
window.addEventListener("offline",()=>setConnectionStatus("offline"));
updateSoundButton();
setConnectionStatus(navigator.onLine?"offline":"offline");
updateResumeButton();
  toast(clearSession ? "Partie quittée." : "Retour à l'accueil.");
}

function resumeGame(){
  roomCode = localStorage.getItem("yamsRoomCode") || "";
  myId = localStorage.getItem("yamsPlayerId") || "";

  if(!roomCode || !myId){
    toast("Aucune partie à reprendre.");
    updateResumeButton();
    return;
  }

  onHomeScreen = false;
  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");
  connect(() => send({type:"reconnect", code:roomCode, playerId:myId}));
}

function leaveGame(){
  const ok = confirm("Quitter cette partie définitivement et revenir à l'accueil ?");
  if(!ok) return;
  backToHome(true);
}


$("createBtn").onclick = createRoom;
$("joinBtn").onclick = joinRoom;
$("homeBtn").onclick = () => backToHome(false);
$("leaveBtn").onclick = leaveGame;
$("resumeBtn").onclick = resumeGame;
$("startBtn").onclick = () => send({type:"start"});
$("rollBtn").onclick = () => { if(!rollingVisual) send({type:"roll"}); };
$("soundBtn").onclick = () => { soundEnabled=!soundEnabled; localStorage.setItem("yamsSound",soundEnabled?"on":"off"); updateSoundButton(); toast(soundEnabled?"Son activé":"Son coupé"); };
$("rulesBtn").onclick = () => $("rulesModal").classList.remove("hidden");
$("rulesClose").onclick = () => $("rulesModal").classList.add("hidden");
$("rulesOk").onclick = () => $("rulesModal").classList.add("hidden");
$("rulesModal").onclick = (e) => { if(e.target === $("rulesModal")) $("rulesModal").classList.add("hidden"); };

$("aboutBtn").onclick = openAbout;
$("aboutClose").onclick = closeAbout;
$("aboutOk").onclick = closeAbout;
$("aboutModal").onclick = e => { if(e.target === $("aboutModal")) closeAbout(); };
$("avatarInput").onchange = () => localStorage.setItem("yamsAvatar", $("avatarInput").value);
$("colorInput").onchange = () => localStorage.setItem("yamsColor", $("colorInput").value);

$("readyBtn").onclick = () => { const me=state?.players.find(p=>p.id===myId); send({type:"ready",ready:!me?.ready}); };
$("shareBtn").onclick = shareGame;
$("copyBtn").onclick = async () => {
  try{
    await navigator.clipboard.writeText(state.code);
    toast("Code copié");
  }catch(_){
    toast(`Code : ${state.code}`);
  }
};
$("rematchBtn").onclick = () => send({type:"rematch"});
$("clearChatBtn").onclick = () => {
  chatHidden = !chatHidden;
  $("clearChatBtn").textContent = chatHidden ? "Afficher le chat" : "Masquer le chat";
  renderChat();
};
$("leaderBtn").onclick = showLeaderboard;
$("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  sendChat();
});

$("codeInput").addEventListener("input", e => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"");
});

if("serviceWorker" in navigator){
  navigator.serviceWorker.register("/sw.js").catch(()=>{});
}

updateResumeButton();

if(!window.__yamsV8Reactions){window.__yamsV8Reactions=true;document.querySelectorAll(".reactionBtn").forEach(btn=>btn.addEventListener("click",()=>{if(state&&!onHomeScreen)send({type:"reaction",reaction:btn.dataset.reaction});}));}

loadProfileV9();
