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
