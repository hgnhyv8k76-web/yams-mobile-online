let inspectedPlayer = '';
let replacingPlayer = '';

function showPlayerSheet(id){
  inspectedPlayer=id;
  renderPlayerSheet();
  if(!$("opponentDialog").open) $("opponentDialog").showModal();
}
function renderPlayerSheet(){
  const p=state?.players.find(p=>p.id===inspectedPlayer);
  if(!p){if($("opponentDialog").open)$("opponentDialog").close();return}
  $("opponentTitle").textContent=`${p.avatar || '🎲'} ${p.name}${p.botLevel && p.avatar!=='🤖' ? ' · robot' : ''}`;
  const box=$("opponentScores");box.innerHTML='';
  for(const category of categories){
    const row=document.createElement('div');row.className='opponentRow';
    const name=document.createElement('span'),score=document.createElement('strong');
    name.textContent=category;score.textContent=Object.hasOwn(p.scores,category)?p.scores[category]:'—';
    row.append(name,score);box.appendChild(row);
  }
  const upper=categories.slice(0,6).reduce((sum,c)=>sum+(p.scores[c]||0),0);
  const summary=document.createElement('p');summary.className='opponentTotal';
  summary.textContent=`Prime : ${upper>=63?35:0} pts · Total : ${totalScore(p.scores)} pts`;
  box.appendChild(summary);
}
function offerReplacement(id){
  const p=state?.players.find(p=>p.id===id);if(!p)return;
  replacingPlayer=id;
  $("replaceDescription").textContent=`${p.name} est déconnecté. Le robot continuera avec ses dés et sa feuille actuels.`;
  $("replaceDialog").showModal();
}
$("replaceConfirm").addEventListener('click',()=>{
  if(replacingPlayer)send({type:'replace',playerId:replacingPlayer,botLevel:$("replacementLevel").value});
});
$("replaceDialog").addEventListener('close',()=>{replacingPlayer=''});

function renderExtras(){
  if($("opponentDialog").open)renderPlayerSheet();
  const highlights=$("resultHighlights");highlights.innerHTML='';
  const podium=$("resultPodium");podium.innerHTML='';
  if(state.finished){
    const result=finishedResult();
    const ranking=[...result.players].sort((a,b)=>b.score-a.score);
    let rank=0;
    ranking.forEach((p,i)=>{
      if(i===0 || p.score!==ranking[i-1].score)rank=i+1;
      if(rank>3)return;
      const step=document.createElement('div');step.className=`podiumStep podium-${rank}`;
      const medal=document.createElement('span'),name=document.createElement('strong'),score=document.createElement('span');
      medal.className='podiumMedal';medal.textContent=['','🥇','🥈','🥉'][rank];
      name.textContent=p.name;score.textContent=`${p.score} pts`;
      step.append(medal,name,score);podium.appendChild(step);
    });
    const plays=result.players.filter(p=>p.bestPlay).sort((a,b)=>b.bestPlay.score-a.bestPlay.score);
    if(plays.length){
      const top=plays[0].bestPlay.score;
      const title=document.createElement('div');title.className='label';title.textContent='MEILLEUR COUP VALIDÉ';highlights.appendChild(title);
      for(const player of plays.filter(p=>p.bestPlay.score===top)){
        const p=document.createElement('p');const play=player.bestPlay;
        p.textContent=`${player.name} · ${play.category} · ${play.score} pts · ${play.rolls} lancer${play.rolls>1?'s':''}`;
        const dice=document.createElement('div');dice.className='bestDice';dice.textContent=play.dice.map(d=>diceChars[d]).join(' ');
        highlights.append(p,dice);
      }
    }
    if(result.players.some(p=>p.assisted)){
      const note=document.createElement('p');note.className='hint';note.textContent='Les feuilles jouées par un robot sont conservées ici et exclues du classement global.';highlights.appendChild(note);
    }
  }
  renderEvolution();
  renderChallenge();
}
function renderEvolution(){
  const box=$("scoreEvolution");box.innerHTML='';
  const history=(state.matchHistory||[]).filter(item=>Array.isArray(item.players));
  if(!history.length)return;
  const title=document.createElement('h3');title.textContent='Les scores au fil des manches';box.appendChild(title);
  const people=new Map();for(const round of history)for(const p of round.players)people.set(p.playerId,p.name);
  const table=document.createElement('table');table.className='evolutionTable';
  const caption=document.createElement('caption');caption.textContent='Score de chaque joueur à chaque manche';table.appendChild(caption);
  const head=document.createElement('thead'),header=document.createElement('tr');
  for(const text of ['Joueur',...history.map(r=>`M${r.round}`)]){const th=document.createElement('th');th.scope='col';th.textContent=text;header.appendChild(th)}
  head.appendChild(header);table.appendChild(head);
  const body=document.createElement('tbody');
  for(const [id,name] of people){
    const row=document.createElement('tr'),label=document.createElement('th');label.scope='row';label.textContent=name;row.appendChild(label);
    for(const round of history){const score=round.players.find(p=>p.playerId===id)?.score;const cell=document.createElement('td');cell.textContent=score??'—';if(score!==undefined)cell.style.setProperty('--score',`${Math.min(100,score/375*100)}%`);row.appendChild(cell)}
    body.appendChild(row);
  }
  table.appendChild(body);box.appendChild(table);
}

function applyAppearance(){
  const theme=localStorage.getItem('yamsTheme')||'green',dice=localStorage.getItem('yamsDiceColor')||'ivory';
  document.documentElement.dataset.theme=['green','night','wood'].includes(theme)?theme:'green';
  document.documentElement.dataset.dice=['ivory','sky','rose'].includes(dice)?dice:'ivory';
  $("tableTheme").value=document.documentElement.dataset.theme;
  $("diceColor").value=document.documentElement.dataset.dice;
}
$("tableTheme").addEventListener('change',e=>{localStorage.setItem('yamsTheme',e.target.value);applyAppearance()});
$("diceColor").addEventListener('change',e=>{localStorage.setItem('yamsDiceColor',e.target.value);applyAppearance()});
$("preferencesBtn").onclick=()=>$("preferencesDialog").showModal();
function updateAmbientControls(){
  $("ambientBtn").textContent=gameAudio.ambientEnabled?'♫ Fond sonore activé':'Activer le fond sonore';
  $("ambientBtn").setAttribute('aria-pressed',String(gameAudio.ambientEnabled));
  $("ambientVolume").value=gameAudio.ambientVolume;
  $("ambientVolume").disabled=!gameAudio.ambientEnabled;
  $("ambientVolumeValue").textContent=`${gameAudio.ambientVolume} %`;
}
$("ambientBtn").onclick=()=>{gameAudio.setAmbient(!gameAudio.ambientEnabled);updateAmbientControls()};
$("ambientVolume").addEventListener('input',e=>{gameAudio.setAmbientVolume(e.target.value);updateAmbientControls()});
applyAppearance();updateAmbientControls();


function renderChallenge(){
  const challenge=state.challenge,card=$("challengeCard");
  card.classList.toggle('hidden',!challenge);
  if(!challenge){$("rematchBtn").textContent='🔁 Revanche avec les mêmes joueurs';return;}
  $("challengeLabel").textContent=`DÉFI EN ${state.challengeRounds} MANCHES`;
  const names=challenge.standings.filter(p=>challenge.winnerIds.includes(p.playerId)).map(p=>p.name).join(' & ');
  $("challengeTitle").textContent=challenge.completed ? (challenge.winnerIds.length>1 ? `Égalité finale : ${names}` : `🏆 ${names} remporte le défi`) : `Classement cumulé · ${challenge.completedRounds} / ${state.challengeRounds}`;
  $("challengeHint").textContent=challenge.completed ? 'Défi terminé. Le total des points détermine le classement final.' : 'Seules les manches terminées entrent dans ce total. Les participants restent les mêmes jusqu’à la fin du défi.';
  const box=$("challengeStandings");box.innerHTML='';let rank=0;
  challenge.standings.forEach((p,i)=>{
    if(i===0 || p.score!==challenge.standings[i-1].score)rank=i+1;
    const row=document.createElement('div');row.className='rankRow';
    const name=document.createElement('span'),score=document.createElement('strong');
    name.textContent=`${rank}. ${p.name} · ${p.wins} manche${p.wins>1?'s':''} gagnée${p.wins>1?'s':''}`;
    score.textContent=`${p.score} pts`;row.append(name,score);box.appendChild(row);
  });
  $("newChallengeBtn").classList.toggle('hidden',!challenge.completed);
  $("rematchBtn").classList.toggle('hidden',state.hostId!==myId || challenge.completed);
  $("rematchBtn").textContent=`Préparer la manche ${state.round+1} / ${state.challengeRounds}`;
}
$("newChallengeBtn").onclick=()=>backToHome(false);

function showInviteQR(){
  if(!state)return;
  const code=state.code;
  const link=`${location.origin}/?code=${encodeURIComponent(code)}`;
  const img=$("inviteQR");img.hidden=true;
  $("qrStatus").textContent='Préparation du QR code…';
  img.onload=()=>{img.hidden=false;$("qrStatus").textContent=`Code : ${code}`};
  img.onerror=()=>{$("qrStatus").textContent='QR code indisponible. Utilise le lien ou le code de la partie.'};
  $("qrLink").href=link;$("qrLink").textContent=link;
  const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  $("qrHint").textContent=local ? 'Cette adresse localhost ne fonctionne que sur cet ordinateur. Pour inviter un téléphone, ouvre le jeu avec l’adresse Wi-Fi du Mac ou l’adresse du site public, puis affiche à nouveau le QR code.' : 'Sur un serveur local, les téléphones doivent utiliser le même réseau Wi-Fi. Le code de partie ne donne pas accès à ta session personnelle.';
  img.src=`/api/invite-qr?code=${encodeURIComponent(code)}&origin=${encodeURIComponent(location.origin)}`;
  $("qrDialog").showModal();
}
$("qrBtn").onclick=showInviteQR;
let reactionsEnabled=localStorage.getItem('yamsAnimatedReactions')!=='off';
const reactionTimers=new Set();
function updateReactionToggle(){
  $("reactionsToggle").textContent=reactionsEnabled?'Réactions animées activées':'Réactions animées masquées';
  $("reactionsToggle").setAttribute('aria-pressed',String(reactionsEnabled));
}
$("reactionsToggle").onclick=()=>{
  reactionsEnabled=!reactionsEnabled;localStorage.setItem('yamsAnimatedReactions',reactionsEnabled?'on':'off');
  document.querySelectorAll('.floatingReaction').forEach(el=>el.remove());
  reactionTimers.forEach(clearTimeout);reactionTimers.clear();updateReactionToggle();
};
function animateReactions(previous,next){
  if(!reactionsEnabled || !previous || previous.code!==next.code || document.hidden)return;
  const seen=new Set((previous.chat||[]).map(m=>m.id));
  for(const msg of (next.chat||[]).filter(m=>m.reaction && !seen.has(m.id)).slice(-6)){
    if(!['❤️','😂','🎲','👏'].includes(msg.reaction) || Date.now()-Date.parse(msg.sentAt)>5000)continue;
    const card=[...document.querySelectorAll('#players .player')].find(el=>el.dataset.playerId===msg.playerId);
    if(!card)continue;
    const bubble=document.createElement('span');bubble.className='floatingReaction';bubble.textContent=msg.reaction;bubble.setAttribute('aria-hidden','true');
    card.appendChild(bubble);
    const timer=setTimeout(()=>{bubble.remove();reactionTimers.delete(timer)},1800);reactionTimers.add(timer);
  }
}
updateReactionToggle();
$("testSoundBtn").onclick=async()=>{
  soundEnabled=true;localStorage.setItem('yamsSound','on');gameAudio.setEnabled(true);updateSoundButton();
  $("audioStatus").textContent='Activation du son…';
  const result=await gameAudio.test();
  $("audioStatus").textContent=result==='started' ? 'Test sonore lancé. Si tu n’entends rien, vérifie le volume multimédia du téléphone, le mode silencieux et la sortie Bluetooth.' : result==='zero' ? 'Le volume des effets est à zéro. Augmente le curseur ci-dessous, puis réessaie.' : 'Le navigateur bloque encore le son. Touche à nouveau « Tester / réactiver le son ».';
};

$("soundTestVolume").addEventListener('input',e=>{gameAudio.setVolume(e.target.value);updateSoundButton()});
