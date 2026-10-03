'use strict';
const $ = id => document.getElementById(id);
const KEY = 'runcompanion.browser.v1';
const formatTime = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return s >= 3600 ? `${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` : `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; };
const paceText = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
let prefs = { distance: 3, minutes: 11, seconds: 0, voice: true }, history = [], run = null, wake = null;
let cue = 'Start comfortable. There’s no need to win the first mile.';
function validPlan(p) { return p && Number.isFinite(p.distance) && p.distance >= .5 && p.distance <= 30 && Number.isInteger(p.minutes) && p.minutes >= 4 && p.minutes <= 25 && Number.isInteger(p.seconds) && p.seconds >= 0 && p.seconds <= 59 && typeof p.voice === 'boolean'; }
function validRun(r) { return r && typeof r.id === 'string' && validPlan(r.plan) && Number.isFinite(r.elapsed) && r.elapsed >= 0 && Array.isArray(r.splits) && r.splits.every(s=>Number.isFinite(s)&&s>=60000) && Number.isFinite(r.lastCheck); }
try {
  const data = JSON.parse(localStorage.getItem(KEY) || 'null');
  if(data) {
    if(validPlan(data.prefs)) prefs = data.prefs;
    if(Array.isArray(data.history)) history = data.history.filter(r=>validRun(r)&&Number.isFinite(r.finishedAt)).slice(0,100);
    if(validRun(data.run)) { run = data.run; run.active = false; run.since = null; cue = 'Your unfinished run is paused. Resume when you’re ready.'; }
  }
} catch { $('storageWarning').textContent = 'Saved data could not be read. You can still run, but history may be unavailable.'; }
function elapsed() { return run ? run.elapsed + (run.active ? Math.max(0,Date.now()-run.since) : 0) : 0; }
function persist() {
  try { const snapshot = run ? {...run,elapsed:elapsed(),since:run.active?Date.now():null} : null; localStorage.setItem(KEY,JSON.stringify({prefs,history,run:snapshot})); }
  catch { $('storageWarning').textContent = 'This browser cannot save your data. Keep the page open; history may be lost.'; }
}
function say(text, speak = true) {
  cue = text; $('cue').textContent = `“${text}”`;
  if(!speak || !(run ? run.plan.voice : prefs.voice)) return;
  if(!('speechSynthesis' in window)) { $('storageWarning').textContent = 'Voice is unavailable in this browser. Coaching cues will appear on screen.'; return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text); utterance.rate = .92;
  utterance.onerror = e => { if(!['canceled','interrupted'].includes(e.error)) $('storageWarning').textContent = 'Voice did not play. Check your volume and tap Hear this cue to try again.'; };
  window.speechSynthesis.speak(utterance);
}
function readPlan() { return {distance:Number($('distance').value),minutes:Number($('minutes').value),seconds:Number($('seconds').value),voice:$('voice').checked}; }
function configure(p) {
  if(run) throw new Error('Finish the current run before changing its plan.');
  if(!validPlan(p)) throw new Error('Choose 0.5–30 miles, 4–25 pace minutes, and 0–59 pace seconds.');
  prefs = p; $('distance').value=p.distance; $('minutes').value=p.minutes; $('seconds').value=p.seconds; $('voice').checked=p.voice;
  $('estimate').textContent=formatTime(p.distance*(p.minutes*60+p.seconds)*1000); persist();
}
async function requestWake() {
  if(!navigator.wakeLock || document.visibilityState!=='visible' || !run?.active) return;
  try { wake=await navigator.wakeLock.request('screen'); } catch { /* Browsers may decline; the visible screen notice still applies. */ }
}
function releaseWake() { if(wake) { void wake.release().catch(()=>{}); wake=null; } }
function render() {
  $('setup').hidden=!!run; $('live').hidden=!run;
  $('heading').textContent=run?'Stay in your rhythm.':'Find your rhythm.';
  $('subtitle').textContent=run?'One checkpoint. One calm adjustment.':'Make a plan. Start easy. Run your own pace.';
  $('cue').textContent=`“${cue}”`; $('count').textContent=history.length;
  if(run) {
    $('elapsed').textContent=formatTime(elapsed()); $('runState').textContent=run.active?'On your run':'Run paused';
    $('miles').textContent=`${run.splits.length} / ${run.plan.distance}`; $('target').textContent=paceText(run.plan.minutes*60+run.plan.seconds);
    $('pause').textContent=run.active?'Pause':'Resume'; $('lap').disabled=!run.active; $('liveVoice').checked=run.plan.voice;
    const progress=Math.min(100,run.splits.length/run.plan.distance*100); $('progress').style.width=`${progress}%`; $('progress').parentElement.setAttribute('aria-valuenow',String(Math.round(progress)));
    $('splits').replaceChildren();
    run.splits.forEach((split,i)=>{const row=document.createElement('div'); row.className='split-row'; const label=document.createElement('span');label.textContent=`Mile ${i+1}`; const value=document.createElement('strong');value.textContent=`${formatTime(split)} / mile`;row.append(label,value);$('splits').append(row);});
  }
}
function start() {
  const p=readPlan();configure(p);
  run={id:crypto.randomUUID(),plan:{...p},elapsed:0,since:Date.now(),active:true,splits:[],lastCheck:0,startedAt:Date.now()};
  $('summary').hidden=true; say(`Let's go. Target pace is ${p.minutes} minutes ${p.seconds} seconds per mile. Start comfortable.`);persist();render();void requestWake();
}
function pauseResume() {
  if(!run) return;
  if(run.active) {run.elapsed=elapsed();run.active=false;run.since=null;releaseWake();if(window.speechSynthesis)window.speechSynthesis.cancel();say('Paused. Take your time.',false);}
  else {run.since=Date.now();run.active=true;say('Resuming. Settle back into your rhythm.');void requestWake();}
  persist();render();
}
function markMile() {
  if(!run?.active) return;
  const split=elapsed()-run.splits.reduce((a,b)=>a+b,0);
  if(split<60000) {say('Too soon for another full mile. Tap only after completing a mile.');return;}
  run.splits.push(split);const delta=split/1000-(run.plan.minutes*60+run.plan.seconds);
  const advice=delta < -20 ? 'You’re ahead of your chosen pace. Ease back toward your target.' : delta > 20 ? 'You’re behind your chosen pace. Stay comfortable; don’t rush to catch up.' : 'You’re close to your chosen pace. Hold this rhythm.';
  const s=Math.floor(split/1000);
  say(`Mile ${run.splits.length}. ${Math.floor(s/60)} minutes ${s%60} seconds. ${advice}${run.splits.length>=run.plan.distance?' Planned distance reached. Finish when you’re ready.':''}`);
  persist();render();
}
function finish() {
  if(!run)return;
  const saved={...run,elapsed:elapsed(),active:false,since:null,finishedAt:Date.now()};history.unshift(saved);history=history.slice(0,100);run=null;releaseWake();
  $('finishDialog').close();say('Run saved. Nice work showing up.');persist();render();
  $('summary').hidden=false;$('summaryText').textContent=`${formatTime(saved.elapsed)} on your feet · ${saved.splits.length} full miles marked${saved.splits.length ? ` · ${formatTime(saved.splits.reduce((a,b)=>a+b,0)/saved.splits.length)} average completed-mile pace` : ''}. Partial miles aren’t measured.`;
}
function showHistory(show) {
  $('runView').hidden=show;$('historyView').hidden=!show;$('runTab').classList.toggle('selected',!show);$('historyTab').classList.toggle('selected',show);
  $('runTab').setAttribute('aria-selected',String(!show));$('historyTab').setAttribute('aria-selected',String(show));
  if(!show)return;
  $('historyList').replaceChildren();
  if(!history.length){const empty=document.createElement('div');empty.className='panel empty';const title=document.createElement('h2');title.textContent='Your first run starts here.';const text=document.createElement('p');text.textContent='Finish a run and it will appear in your journal.';empty.append(title,text);$('historyList').append(empty);}
  history.forEach(r=>{const card=document.createElement('article');card.className='panel history-card';const title=document.createElement('h2');title.textContent=new Date(r.finishedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});card.append(title);const metrics=document.createElement('div');metrics.className='history-metrics';const avg=r.splits.length?formatTime(r.splits.reduce((a,b)=>a+b,0)/r.splits.length):'—';
    [['Elapsed',formatTime(r.elapsed)],['Miles marked',String(r.splits.length)],['Split avg / mile',avg]].forEach(([label,value])=>{const item=document.createElement('div'),l=document.createElement('span'),v=document.createElement('strong');l.textContent=label;v.textContent=value;item.append(l,v);metrics.append(item);});card.append(metrics);$('historyList').append(card);});
}
$('planForm').addEventListener('submit',e=>{e.preventDefault();try{start();$('formError').textContent='';}catch(err){$('formError').textContent=err.message;}});
['distance','minutes','seconds','voice'].forEach(id=>$(id).addEventListener('change',()=>{const p=readPlan();if(validPlan(p)){configure(p);$('formError').textContent='';}}));
$('testVoice').onclick=()=>{prefs.voice=$('voice').checked;if(!prefs.voice){$('formError').textContent='Enable spoken coaching to test the voice.';return;}say('Start comfortable. Run your own pace.');};
$('repeat').onclick=()=>say(cue);$('pause').onclick=pauseResume;$('lap').onclick=markMile;
$('finish').onclick=()=>{$('finishDialog').showModal();};$('cancelFinish').onclick=()=>{$('finishDialog').close();};$('saveFinish').onclick=finish;
$('newRun').onclick=()=>{$('summary').hidden=true;window.scrollTo({top:0,behavior:'smooth'});};
$('liveVoice').onchange=()=>{if(run){run.plan.voice=$('liveVoice').checked;if(!run.plan.voice&&window.speechSynthesis)window.speechSynthesis.cancel();persist();}};
$('runTab').onclick=()=>showHistory(false);$('historyTab').onclick=()=>showHistory(true);
document.addEventListener('visibilitychange',()=>{persist();if(document.visibilityState==='visible'){render();void requestWake();}});
window.addEventListener('pagehide',persist);
setInterval(()=>{if(!run?.active)return;const now=elapsed();$('elapsed').textContent=formatTime(now);if(now-run.lastCheck>=300000&&document.visibilityState==='visible'){run.lastCheck=now;say(`${Math.floor(now/60000)} minutes in. Keep your effort comfortable. Mark your next full mile when you reach it.`);persist();}},1000);
setInterval(()=>{if(run)persist();},10000);
configureInitial();
function configureInitial(){ $('distance').value=prefs.distance;$('minutes').value=prefs.minutes;$('seconds').value=prefs.seconds;$('voice').checked=prefs.voice;$('estimate').textContent=formatTime(prefs.distance*(prefs.minutes*60+prefs.seconds)*1000);render(); }
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tools=[
    {name:'get_run_status',description:'Read the current run plan, timer, mile splits and coaching cue.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({running:!!run,active:!!run?.active,elapsedSeconds:elapsed()/1000,milesMarked:run?.splits.length||0,plan:run?.plan||prefs,cue,savedRuns:history.length})},
    {name:'configure_run_plan',description:'Set distance and target pace before a run. Does not start a run.',inputSchema:{type:'object',properties:{distance:{type:'number',minimum:.5,maximum:30},minutes:{type:'integer',minimum:4,maximum:25},seconds:{type:'integer',minimum:0,maximum:59},voice:{type:'boolean'}},required:['distance','minutes','seconds','voice'],additionalProperties:false},annotations:{readOnlyHint:false},execute:p=>{configure(p);return {plan:{...prefs},estimatedSeconds:p.distance*(p.minutes*60+p.seconds)};}}
  ];
  tools.forEach(tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
