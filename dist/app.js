'use strict';
const $ = id => document.getElementById(id);
const KEY = 'runcompanion.browser.v1';
const formatTime = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return s >= 3600 ? `${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` : `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; };
const paceText = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
let prefs = { distance: 3, minutes: 11, seconds: 0, voice: true }, history = [], run = null, wake = null;
let cue = 'Start comfortable. There’s no need to win the first mile.';
let gps = null, gpsWatch = null, paceDeviation = null, lastPaceCue = 0, gpsGeneration = 0;
let latestFinished = history[0] || null;
let imported = [];
function walking(){return (run?.plan||prefs).mode==='walk';}
function validPlan(p) { return p && Number.isFinite(p.distance) && p.distance >= .5 && p.distance <= 30 && Number.isInteger(p.minutes) && p.minutes >= 4 && p.minutes <= 25 && Number.isInteger(p.seconds) && p.seconds >= 0 && p.seconds <= 59 && typeof p.voice === 'boolean'; }
function validRun(r) { return r && typeof r.id === 'string' && validPlan(r.plan) && Number.isFinite(r.elapsed) && r.elapsed >= 0 && Array.isArray(r.splits) && r.splits.every(s=>Number.isFinite(s)&&s>=60000) && Number.isFinite(r.lastCheck); }
try {
  const data = JSON.parse(localStorage.getItem(KEY) || 'null');
  if(data) {
    if(Array.isArray(data.imported))imported=data.imported.filter(r=>r&&typeof r.name==='string'&&Number.isFinite(r.meters)&&r.meters>0&&Number.isFinite(r.seconds)&&r.seconds>0).slice(0,100);
    if(validPlan(data.prefs)) prefs = data.prefs;
    if(Array.isArray(data.history)) history = data.history.filter(r=>validRun(r)&&Number.isFinite(r.finishedAt)).slice(0,100);
    if(validRun(data.run)) { run = data.run; run.active = false; run.since = null; cue = 'Your unfinished run is paused. Resume when you’re ready.'; }
  }
} catch { $('storageWarning').textContent = 'Saved data could not be read. You can still run, but history may be unavailable.'; }
function elapsed() { return run ? run.elapsed + (run.active ? Math.max(0,Date.now()-run.since) : 0) : 0; }
function persist() {
  try { const snapshot = run ? {...run,elapsed:elapsed(),since:run.active?Date.now():null} : null; localStorage.setItem(KEY,JSON.stringify({prefs,history,imported,run:snapshot})); }
  catch { $('storageWarning').textContent = 'This browser cannot save your data. Keep the page open; history may be lost.'; }
}
function say(text, speak = true) {
  cue = text; $('cue').textContent = `“${text}”`;
  if(run){if(!Array.isArray(run.cues))run.cues=[];run.cues.push({seconds:Math.floor(elapsed()/1000),text,voiceRequested:speak&&run.plan.voice});run.cues=run.cues.slice(-150);}
  if(!speak || !(run ? run.plan.voice : prefs.voice)) return;
  if(!('speechSynthesis' in window)) { $('storageWarning').textContent = 'Voice is unavailable in this browser. Coaching cues will appear on screen.'; return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text); utterance.rate = .92;
  utterance.onerror = e => { if(!['canceled','interrupted'].includes(e.error)) $('storageWarning').textContent = 'Voice did not play. Check your volume and tap Hear this cue to try again.'; };
  window.speechSynthesis.speak(utterance);
}
function readPlan() { return {distance:Number($('distance').value),minutes:Number($('minutes').value),seconds:Number($('seconds').value),voice:$('voice').checked,gps:$('gpsMode').checked,mode:$('activityMode').value}; }
function configure(p) {
  if(run) throw new Error('Finish the current run before changing its plan.');
  if(!validPlan(p)) throw new Error('Choose 0.5–30 miles, 4–25 pace minutes, and 0–59 pace seconds.');
  prefs = p; $('distance').value=p.distance; $('minutes').value=p.minutes; $('seconds').value=p.seconds; $('voice').checked=p.voice; $('gpsMode').checked=!!p.gps;
  $('estimate').textContent=formatTime(p.distance*(p.minutes*60+p.seconds)*1000); persist();
  $('activityMode').value=p.mode==='walk'?'walk':'run';$('modeHint').textContent=p.mode==='walk'?'Walk comfortably. Pace corrections are off; distance and check-ins stay on.':'Pace guidance follows your chosen target.';
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
    const distance=run.plan.gps?(run.meters||0)/RunGPSKit.MILE:run.splits.length;
    $('miles').textContent=`${run.plan.gps?distance.toFixed(2):distance} / ${run.plan.distance}`; $('target').textContent=paceText(run.plan.minutes*60+run.plan.seconds);
    $('distanceLabel').textContent=run.plan.gps?'GPS miles':'Miles marked';$('gpsPanel').hidden=!run.plan.gps;
    $('lap').hidden=!!run.plan.gps;$('lapHint').textContent=run.plan.gps?'Mile splits are marked automatically.':'Tap at each full mile on your watch or route.';
    if(run.plan.gps){$('recentPace').textContent=gps?.pace?paceText(Math.round(gps.pace)):'—';$('gpsAccuracy').textContent=gps?.accuracy?`±${Math.round(gps.accuracy)} m`:'—';$('gpsStatus').textContent=run.active?(gps?.status||'Waiting for GPS'):'GPS paused';$('gpsGap').hidden=!run.gpsGaps;}
    $('pause').textContent=run.active?'Pause':'Resume'; $('lap').disabled=!run.active; $('liveVoice').checked=run.plan.voice;
    const progress=Math.min(100,distance/run.plan.distance*100); $('progress').style.width=`${progress}%`; $('progress').parentElement.setAttribute('aria-valuenow',String(Math.round(progress)));
    $('splits').replaceChildren();
    run.splits.forEach((split,i)=>{const row=document.createElement('div'); row.className='split-row'; const label=document.createElement('span');label.textContent=`Mile ${i+1}`; const value=document.createElement('strong');value.textContent=`${formatTime(split)} / mile`;row.append(label,value);$('splits').append(row);});
  }
}
async function start() {
  const p=readPlan();configure(p);
  let initial=null;
  if(p.gps){
    if(!navigator.geolocation)throw new Error('GPS is unavailable here. Turn off Use phone GPS to use manual mode.');
    const button=$('planForm').querySelector('button[type=submit]');button.disabled=true;button.textContent='Finding GPS…';$('formError').textContent='Allow location, and wait outside for a precise GPS fix.';
    try{initial=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:20000}));if(initial.coords.accuracy>25)throw new Error('GPS signal is weak. Move outdoors and try again, or turn off Use phone GPS.');}
    catch(e){throw new Error(e.code===1?'Location permission was denied. Enable it in Safari settings or use manual mode.':e.message||'GPS could not connect. Try again outdoors or use manual mode.');}
    finally{button.disabled=false;button.textContent='Start my run';}
  }
  run={id:crypto.randomUUID(),plan:{...p},elapsed:0,since:Date.now(),active:true,splits:[],lastCheck:0,startedAt:Date.now(),meters:0,gpsGaps:false};
  paceDeviation=null;lastPaceCue=0;
  if(p.gps){gps=new RunGPSKit.RunGPS();gps.add(initial,0);startGPS();}
  $('summary').hidden=true; say(p.mode==='walk'?'Time for a walk. Keep a comfortable effort. I will check in with time and distance.':`Let's go. Target pace is ${p.minutes} minutes ${p.seconds} seconds per mile. Start comfortable.`);persist();render();void requestWake();
}
function pauseResume() {
  if(!run) return;
  if(run.active) {run.elapsed=elapsed();run.active=false;run.since=null;stopGPS();releaseWake();if(window.speechSynthesis)window.speechSynthesis.cancel();say('Paused. Take your time.',false);}
  else {run.since=Date.now();run.active=true;if(run.plan.gps){gps=new RunGPSKit.RunGPS(run.meters||0);startGPS();}say('Resuming. Settle back into your rhythm.');void requestWake();}
  persist();render();
}
function markMile() {
  if(!run?.active||run.plan.gps) return;
  const split=elapsed()-run.splits.reduce((a,b)=>a+b,0);
  if(split<60000) {say('Too soon for another full mile. Tap only after completing a mile.');return;}
  run.splits.push(split);const delta=split/1000-(run.plan.minutes*60+run.plan.seconds);
  const advice=walking()?'Keep walking comfortably. There’s no need to chase a pace.':delta < -20 ? 'You’re ahead of your chosen pace. Ease back toward your target.' : delta > 20 ? 'You’re behind your chosen pace. Stay comfortable; don’t rush to catch up.' : 'You’re close to your chosen pace. Hold this rhythm.';
  const s=Math.floor(split/1000);
  say(`Mile ${run.splits.length}. ${Math.floor(s/60)} minutes ${s%60} seconds. ${advice}${run.splits.length>=run.plan.distance?' Planned distance reached. Finish when you’re ready.':''}`);
  persist();render();
}
function finish() {
  if(!run)return;
  const saved={...run,elapsed:elapsed(),active:false,since:null,finishedAt:Date.now()};latestFinished=saved;history.unshift(saved);history=history.slice(0,100);stopGPS();run=null;gps=null;releaseWake();
  $('copyStatus').textContent='';$('reportText').hidden=true;
  $('finishDialog').close();say('Run saved. Nice work showing up.');persist();render();
  $('summary').hidden=false;$('summaryText').textContent=`${formatTime(saved.elapsed)} on your feet · ${saved.plan.gps?((saved.meters||0)/RunGPSKit.MILE).toFixed(2)+' GPS miles':saved.splits.length+' full miles marked'}${saved.splits.length ? ` · ${formatTime(saved.splits.reduce((a,b)=>a+b,0)/saved.splits.length)} average completed-mile pace` : ''}. ${saved.plan.gps?(saved.gpsGaps?'GPS gaps left some distance unmeasured.':'GPS distance is an estimate.'):'Partial miles aren’t measured.'}`;
}
function showHistory(show) {
  $('runView').hidden=show;$('historyView').hidden=!show;$('runTab').classList.toggle('selected',!show);$('historyTab').classList.toggle('selected',show);
  $('runTab').setAttribute('aria-selected',String(!show));$('historyTab').setAttribute('aria-selected',String(show));
  if(!show)return;
  renderImported();
  $('historyList').replaceChildren();
  if(!history.length){const empty=document.createElement('div');empty.className='panel empty';const title=document.createElement('h2');title.textContent='Your first run starts here.';const text=document.createElement('p');text.textContent='Finish a run and it will appear in your journal.';empty.append(title,text);$('historyList').append(empty);}
  history.forEach(r=>{const card=document.createElement('article');card.className='panel history-card';const title=document.createElement('h2');title.textContent=new Date(r.finishedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});card.append(title);const metrics=document.createElement('div');metrics.className='history-metrics';const avg=r.splits.length?formatTime(r.splits.reduce((a,b)=>a+b,0)/r.splits.length):'—';
    [['Elapsed',formatTime(r.elapsed)],[r.plan.gps?'GPS miles':'Miles marked',r.plan.gps?((r.meters||0)/RunGPSKit.MILE).toFixed(2):String(r.splits.length)],['Split avg / mile',avg]].forEach(([label,value])=>{const item=document.createElement('div'),l=document.createElement('span'),v=document.createElement('strong');l.textContent=label;v.textContent=value;item.append(l,v);metrics.append(item);});card.append(metrics);const copy=document.createElement('button');copy.className='secondary';copy.textContent='Copy test summary';copy.onclick=()=>copyReport(r,card);card.append(copy);if(r.gpsGaps){const note=document.createElement('p');note.className='error';note.textContent='GPS gaps: some distance was not measured.';card.append(note);}$('historyList').append(card);});
}
function renderImported(){
  $('importedList').replaceChildren();
  imported.forEach(r=>{const card=document.createElement('article');card.className='history-card';const title=document.createElement('h3');title.textContent=r.name;const stats=document.createElement('p');stats.textContent=`${(r.meters/RunGPSKit.MILE).toFixed(2)} miles · ${formatTime(r.seconds*1000)} elapsed · ${formatTime(r.seconds/r.meters*RunGPSKit.MILE*1000)} / mile${r.averageHeartRate?` · ${r.averageHeartRate} bpm sample average`:''}`;const note=document.createElement('p');note.className='hint';note.textContent=`${r.source} · ${r.date?new Date(r.date).toLocaleDateString():'Date unavailable'} · Elapsed pace can include stops.`;card.append(title,stats,note);$('importedList').append(card);});
}
$('importButton').onclick=async ()=>{
  const files=Array.from($('importFiles').files||[]);if(!files.length){$('importStatus').textContent='Tap Choose Files first and select a GPX or TCX file from Files or iCloud Drive.';return;}if(files.length>10){$('importStatus').textContent='Choose up to 10 files at a time.';return;}
  $('importButton').disabled=true;$('importStatus').textContent='Reading selected files…';
  let added=0;const messages=[];
  for(const file of files){try{
    if(file.size>5*1024*1024)throw new Error('Maximum file size is 5 MB.');
    const record=parseActivityFile(await file.text(),file.name);
    if(imported.some(r=>r.name===record.name&&r.date===record.date&&Math.abs(r.meters-record.meters)<1&&Math.abs(r.seconds-record.seconds)<1)){messages.push(`${file.name}: already imported.`);continue;}
    imported.unshift(record);imported=imported.slice(0,100);added++;
  }catch(error){messages.push(`${file.name}: ${error.message}`);}}
  persist();renderImported();$('importStatus').textContent=`${added} activities imported. ${messages.join(' ')}`;$('importFiles').value='';$('importButton').disabled=false;
};
$('importFiles').addEventListener('change',()=>{const n=$('importFiles').files?.length||0;$('importStatus').textContent=n?`${n} files selected. Tap Import selected files.`:'No file selected.';});
function stopGPS(){gpsGeneration++;if(gpsWatch!==null&&navigator.geolocation)navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null;paceDeviation=null;}
function startGPS(){
  stopGPS();if(!run?.active||!run.plan.gps||document.visibilityState!=='visible')return;
  if(!navigator.geolocation){say('GPS is unavailable. Pause or finish this run and choose manual mode.',false);return;}
  if(!gps)gps=new RunGPSKit.RunGPS(run.meters||0);
  const generation=gpsGeneration;
  try{gpsWatch=navigator.geolocation.watchPosition(position=>{
    if(generation!==gpsGeneration||!run?.active||document.visibilityState!=='visible')return;
    const time=elapsed(),before=run.meters||0,result=gps.add(position,time);
    run.meters=gps.meters;run.gpsGaps=run.gpsGaps||gps.gaps;
    let spoke=false;
    result.crossings.forEach(crossing=>{const previous=run.splits.reduce((a,b)=>a+b,0),split=crossing-previous;if(split<60000)return;run.splits.push(split);const seconds=Math.floor(split/1000);say(`Mile ${run.splits.length}. ${Math.floor(seconds/60)} minutes ${seconds%60} seconds. Keep your effort comfortable.`);lastPaceCue=time;spoke=true;});
    if(before/RunGPSKit.MILE<run.plan.distance&&run.meters/RunGPSKit.MILE>=run.plan.distance){say('Your planned distance is reached. Finish when you’re ready.');lastPaceCue=time;spoke=true;}
    if(!walking()&&!spoke&&gps.pace){
      const delta=gps.pace-(run.plan.minutes*60+run.plan.seconds),direction=delta < -25?'fast':delta>25?'slow':null;
      if(!direction)paceDeviation=null;
      else if(paceDeviation?.direction!==direction)paceDeviation={direction,since:time};
      else if(time-paceDeviation.since>=20000&&time-lastPaceCue>=90000){say(direction==='fast'?'You’ve stayed faster than your target. Ease back a little and find your rhythm.':'You’ve stayed behind your target. Keep your effort comfortable; don’t rush to catch up.');lastPaceCue=time;paceDeviation=null;}
    }else if(!gps.pace)paceDeviation=null;
    if(result.crossings.length||spoke)persist();render();
  },error=>{
    if(generation!==gpsGeneration||!run)return;
    run.gpsGaps=true;paceDeviation=null;gps.reject(error.code===1?'Location access denied — pause and check Safari settings':'GPS unavailable — distance and pace on hold');render();
  },{enableHighAccuracy:true,maximumAge:0,timeout:15000});}
  catch{gps.reject('GPS could not start — pause and retry');run.gpsGaps=true;render();}
}
$('planForm').addEventListener('submit',async e=>{e.preventDefault();try{await start();$('formError').textContent='';}catch(err){$('formError').textContent=err.message;}});
['distance','minutes','seconds','voice','gpsMode'].forEach(id=>$(id).addEventListener('change',()=>{const p=readPlan();if(validPlan(p)){configure(p);$('formError').textContent='';}}));
$('testVoice').onclick=()=>{prefs.voice=$('voice').checked;if(!prefs.voice){$('formError').textContent='Enable spoken coaching to test the voice.';return;}say('Start comfortable. Run your own pace.');};
$('repeat').onclick=()=>say(cue);$('pause').onclick=pauseResume;$('lap').onclick=markMile;
$('checkIn').onclick=()=>{
  if(!run)return;
  const s=Math.floor(elapsed()/1000),m=run.plan.gps?(run.meters||0)/RunGPSKit.MILE:run.splits.length;
  let text=`${Math.floor(s/60)} minutes ${s%60} seconds in. ${m.toFixed(2)} ${run.plan.gps?'miles measured':'full miles marked'}.`;
  if(run.plan.gps&&run.active&&gps?.pace){const p=Math.round(gps.pace);text+=` Recent pace is ${Math.floor(p/60)} minutes ${p%60} seconds per mile.`;}
  else if(run.plan.gps)text+=' Recent pace is not available yet.';
  text+=run.active?(walking()?' Keep your walk comfortable.':' Stay comfortable and hold your rhythm.'):' Your session is paused.';
  say(text);persist();
};
function testReport(r){
  return ['Run Companion v0.3 test summary',new Date(r.finishedAt).toLocaleString(),`Activity: ${r.plan.mode==='walk'?'Walk':'Run'}`,`Tracking: ${r.plan.gps?'Phone GPS':'Manual mile markers'}`,`Elapsed: ${formatTime(r.elapsed)}`,`Distance: ${r.plan.gps?((r.meters||0)/RunGPSKit.MILE).toFixed(2):r.splits.length} miles`,`Target: ${paceText(r.plan.minutes*60+r.plan.seconds)} / mile${r.plan.mode==='walk'?' (pace corrections off)':''}`,`GPS gaps: ${r.gpsGaps?'Yes — distance may be incomplete':'None flagged'}`,`Splits: ${r.splits.length?r.splits.map((s,i)=>`mile ${i+1}: ${formatTime(s)}`).join('; '):'No complete miles'}`,'Coaching cues (voice requested does not confirm playback):',...(r.cues||[]).map(c=>`${formatTime(c.seconds*1000)}: ${c.text}${c.voiceRequested?' [voice requested]':''}`),'Garmin distance: [add after test]','Voice heard / feedback: [add after test]'].join('\n');
}
async function copyReport(r,host=null){
  if(!r)return;
  const text=testReport(r);
  const field=host?document.createElement('textarea'):$('reportText'),status=host?document.createElement('p'):$('copyStatus');
  field.value=text;field.readOnly=true;field.rows=8;field.setAttribute('aria-label','Test summary');field.hidden=false;if(host){host.append(status,field);}
  try{if(!navigator.clipboard?.writeText)throw new Error('unavailable');await navigator.clipboard.writeText(text);status.textContent='Copied. Paste this into our chat after your walk.';}
  catch{status.textContent='Select the summary below and copy it manually.';field.focus();field.select();}
}
$('copySummary').onclick=()=>copyReport(latestFinished);
$('activityMode').addEventListener('change',()=>{
  if($('activityMode').value==='walk'){$('minutes').value=20;$('seconds').value=0;}else{$('minutes').value=11;$('seconds').value=0;}
  configure(readPlan());
});
$('finish').onclick=()=>{$('finishDialog').showModal();};$('cancelFinish').onclick=()=>{$('finishDialog').close();};$('saveFinish').onclick=finish;
$('newRun').onclick=()=>{$('summary').hidden=true;window.scrollTo({top:0,behavior:'smooth'});};
$('liveVoice').onchange=()=>{if(run){run.plan.voice=$('liveVoice').checked;if(!run.plan.voice&&window.speechSynthesis)window.speechSynthesis.cancel();persist();}};
$('runTab').onclick=()=>showHistory(false);$('historyTab').onclick=()=>showHistory(true);
document.addEventListener('visibilitychange',()=>{persist();if(run?.plan.gps){gps?.reset();paceDeviation=null;if(document.visibilityState!=='visible'){run.gpsGaps=true;stopGPS();}else if(run.active)startGPS();}if(document.visibilityState==='visible'){render();void requestWake();}});
window.addEventListener('pagehide',persist);
setInterval(()=>{if(!run?.active)return;const now=elapsed();if(run.plan.gps){gps?.stale();if(gps?.gaps)run.gpsGaps=true;if(!gps?.pace)paceDeviation=null;render();}else $('elapsed').textContent=formatTime(now);if(now-run.lastCheck>=300000&&document.visibilityState==='visible'&&now-lastPaceCue>=30000){run.lastCheck=now;say(`${Math.floor(now/60000)} minutes in. Keep your effort comfortable.${run.plan.gps?'':' Mark your next full mile when you reach it.'}`);persist();}},1000);
setInterval(()=>{if(run)persist();},10000);
configureInitial();
function configureInitial(){ $('activityMode').value=prefs.mode==='walk'?'walk':'run';$('modeHint').textContent=prefs.mode==='walk'?'Walk comfortably. Pace corrections are off; distance and check-ins stay on.':'Pace guidance follows your chosen target.'; $('distance').value=prefs.distance;$('minutes').value=prefs.minutes;$('seconds').value=prefs.seconds;$('voice').checked=prefs.voice;$('gpsMode').checked=!!prefs.gps;$('estimate').textContent=formatTime(prefs.distance*(prefs.minutes*60+prefs.seconds)*1000);render(); }
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tools=[
    {name:'get_run_status',description:'Read the current run plan, timer, mile splits and coaching cue.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({running:!!run,active:!!run?.active,elapsedSeconds:elapsed()/1000,milesMarked:run?.splits.length||0,plan:run?.plan||prefs,cue,savedRuns:history.length})},
    {name:'configure_run_plan',description:'Set distance and target pace before a run. Does not start a run.',inputSchema:{type:'object',properties:{distance:{type:'number',minimum:.5,maximum:30},minutes:{type:'integer',minimum:4,maximum:25},seconds:{type:'integer',minimum:0,maximum:59},voice:{type:'boolean'}},required:['distance','minutes','seconds','voice'],additionalProperties:false},annotations:{readOnlyHint:false},execute:p=>{configure(p);return {plan:{...prefs},estimatedSeconds:p.distance*(p.minutes*60+p.seconds)};}}
  ];
  tools.forEach(tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
