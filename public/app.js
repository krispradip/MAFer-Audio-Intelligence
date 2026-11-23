// Actual audio and model responses only. No seeded interactions or fake success statuses.
import {conversationIdFromFilename,metadataFromJson} from './metadata.js';
import {localFoldersSupported,selectFolder,getFolder,listAudioFiles,testLocalFolder,saveToLocalFolder} from './local-folders.js';
import {normalizeView,viewFromHash,hashForView,VIEW_TITLES} from './view-routing.js';
const $ = id => document.getElementById(id);
const safe = x => String(x??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=ms=>{const s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60);return (h?String(h).padStart(2,'0')+':':'')+String(m%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');};
const MAX=24*1024*1024;
let file=null,localUrl=null,transcription=null,analysis=null,roles={},durationMs=null,completeCount=0,busy=false;
const status=(key,value,detail)=>{const dot=$(key+'Dot');if(dot)dot.className='statusdot '+value;const target=$(key+'State');if(target)target.textContent=detail;};
function notice(message,kind='success'){$('message').hidden=false;$('message').className='message '+(kind==='success'?'':kind);$('message').textContent=message;}
function clearNotice(){$('message').hidden=true;$('message').textContent='';}
function steps(active){document.querySelectorAll('[data-step]').forEach(el=>{const idx=Number(el.dataset.step);el.classList.toggle('active',idx===active);el.classList.toggle('done',idx<active);});}

function syncNavigation(){
  const transcriptReady=!!transcription&&Array.isArray(transcription.segments)&&transcription.segments.length>0;
  const handoffReady=transcriptReady&&!!analysis?.intelligence&&!$('resultsPanel').hidden&&roleReady();
  $('transcriptEmpty').hidden=transcriptReady;
  $('qaEmpty').hidden=handoffReady;
  // Routes are always navigable. A view with no completed data shows its
  // own empty state instead of a hidden/disabled link.
}
function showView(requested,{updateHistory=true,scroll=true}={}){
  const view=normalizeView(requested);
  document.body.dataset.view=view;
  $('configPanel').hidden=false;
  syncNavigation();
  $('pageTitle').textContent=VIEW_TITLES[view];
  document.title=VIEW_TITLES[view]+' · MAFer Audio Intelligence';
  document.querySelectorAll('.side-link[data-view]').forEach(button=>{
    const active=button.dataset.view===view;
    button.classList.toggle('active',active);
    if(active)button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  if(updateHistory&&window.location.hash!==hashForView(view))
    window.history.pushState(null,'',hashForView(view));
  if(scroll)window.scrollTo(0,0);
}
// Restore native back/forward and direct page links without re-running transcription.
window.addEventListener('popstate',()=>showView(viewFromHash(window.location.hash),{updateHistory:false}));
window.addEventListener('hashchange',()=>showView(viewFromHash(window.location.hash),{updateHistory:false}));
document.querySelectorAll('.side-link[data-view]').forEach(button=>
  button.addEventListener('click',()=>showView(button.dataset.view)));
document.querySelectorAll('[data-view-link]').forEach(button=>
  button.addEventListener('click',()=>showView(button.dataset.viewLink)));
// Runtime status and processing safeguards are Settings content, not another
// two full-screen cards stacked below the mobile audio uploader.
const rail=document.querySelector('.rail');
const railCards=Array.from(rail.querySelectorAll(':scope > .rail-card'));
const configSupport=document.createElement('div');
configSupport.className='config-support';
for(const card of railCards.slice(1))configSupport.appendChild(card);
$('configPanel').querySelector('.panel-body').appendChild(configSupport);
showView(viewFromHash(window.location.hash),{updateHistory:false,scroll:false});

const metadataIds=['conversationId','agentName','bu','brand','market','language'];
function setOrigin(id,description,imported=false){
  const node=$(id+'Source');
  if(node){node.textContent=description;node.classList.toggle('verified',imported);}
}
function clearMetadata(){
  $('conversationId').value='';$('agentName').value='';$('brand').value='';
  $('bu').value='VOX';$('market').value='UAE';$('language').value='auto';
  $('metadataFile').value='';$('metadataState').textContent='No Genesys metadata imported';$('importMetadataBtn').disabled=true;
  setOrigin('conversationId','Not identified');
  setOrigin('agentName','Not identified');
  setOrigin('brand','Not identified');
  setOrigin('bu','Preset: VOX · confirm');
  setOrigin('market','Preset: UAE · confirm');
  setOrigin('language','Auto-detect on transcription');
}
function meta(){return {conversationId:$('conversationId').value.trim(),agentName:$('agentName').value.trim(),bu:$('bu').value,brand:$('brand').value.trim(),market:$('market').value,language:$('language').value==='auto'?'Auto-detect / bilingual':$('language').value==='ar'?'Arabic':'English'};}
function metadataChanged(){
  if(!analysis)return;
  analysis=null;$('resultsPanel').hidden=true;syncNavigation();
  status('llm','','Metadata changed; run analysis again');
  status('qa','','Re-analyze before QA export');
}
metadataIds.forEach(id=>$(id).addEventListener('change',()=>{
  const value=$(id).value.trim();
  setOrigin(id,id==='language'&&value==='auto'?'Auto-detect on transcription':'Edited manually');
  metadataChanged();
}));
$('importMetadataBtn').addEventListener('click',()=>$('metadataFile').click());
$('metadataFile').addEventListener('change',async event=>{
  const imported=event.target.files?.[0];
  if(!imported)return;
  if(imported.size>256*1024 || !/\.json$/i.test(imported.name))return notice('Select a Genesys metadata JSON smaller than 256 KB.','error');
  let values;
  try{values=metadataFromJson(JSON.parse(await imported.text()));}
  catch(error){return notice('Metadata import failed: '+error.message,'error');}
  const filenameId=file?conversationIdFromFilename(file.name):'';
  if(filenameId&&values.conversationId&&filenameId.toLowerCase()!==values.conversationId.toLowerCase())
    return notice('Metadata JSON conversation ID does not match the UUID in this recording filename. Nothing was changed.','error');
  let count=0;
  for(const id of metadataIds){
    if(values[id]){
      $(id).value=values[id];
      setOrigin(id,'From imported JSON · verify',true);
      count++;
    }
  }
  if(!count)return notice('The JSON contains no recognized conversation or contact-centre metadata fields.','error');
  $('metadataState').textContent=count+' field'+(count===1?'':'s')+' populated from '+imported.name;
  metadataChanged();
  notice(count+' metadata field'+(count===1?'':'s')+' populated. Confirm the imported values before analysis.');
});
function reset(full=true){
  if(localUrl) URL.revokeObjectURL(localUrl);localUrl=null;file=null;transcription=null;analysis=null;roles={};durationMs=null;
  $('audioFile').value='';
  for(const id of ['player','transcriptPlayer','qaPlayer']){const p=$(id);p.hidden=true;p.removeAttribute('src');p.load();}
  $('dropTitle').textContent='Choose an audio recording';$('dropDesc').textContent='MP3, WAV, M4A, MP4, FLAC, OGG or WebM · maximum 24 MB';
  $('transcribeBtn').disabled=true;$('transcriptionPanel').hidden=true;$('resultsPanel').hidden=true;$('analyzeBtn').disabled=true;$('speakerMap').replaceChildren();
  // Every new recording must clear IDs, agent identities and brand from the prior file.
  // Keeping stale metadata would cause incorrect QA handoff, even in a demo.
  clearMetadata();
  ['stt','roles','llm','qa'].forEach((k)=>status(k,'',k==='stt'||k==='llm'?'Not started':k==='roles'?'Waiting for audio':'No export available'));
  steps(1);clearNotice();syncNavigation();
}
function pick(next){
  if(busy)return;
  const ext=(next?.name||'').split('.').pop().toLowerCase();
  if(!next||!['mp3','wav','m4a','aac','flac','ogg','webm','mp4','mpeg','mpga'].includes(ext))return notice('Select a supported audio file.','error');
  if(next.size<1||next.size>MAX)return notice('Recording must be nonempty and no larger than 24 MB.','error');
  reset(false);file=next;localUrl=URL.createObjectURL(next);
  for(const id of ['player','transcriptPlayer','qaPlayer']){const p=$(id);p.src=localUrl;p.hidden=false;}
  const detectedId=conversationIdFromFilename(next.name);
  if(detectedId){
    $('conversationId').value=detectedId;
    setOrigin('conversationId','UUID found in filename · verify',true);
  }
  $('dropTitle').textContent=next.name;$('dropDesc').textContent=(next.size/1024/1024).toFixed(2)+' MB · Ready for real transcription';
  $('transcribeBtn').disabled=false;$('importMetadataBtn').disabled=false;
  notice(detectedId?'Recording selected. Conversation ID populated from filename; verify it matches Genesys. No data has been sent yet.':'Recording selected. No Conversation ID was found in filename; import Genesys metadata JSON to fill available fields.');
}
$('browseBtn').addEventListener('click',e=>{e.stopPropagation();$('audioFile').click();});
$('dropzone').addEventListener('click',e=>{if(e.target.closest('button'))return;$('audioFile').click();});
$('dropzone').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('audioFile').click();}});
$('audioFile').addEventListener('change',e=>pick(e.target.files?.[0]));
$('dropzone').addEventListener('dragover',e=>{e.preventDefault();$('dropzone').classList.add('dragover');});
$('dropzone').addEventListener('dragleave',()=> $('dropzone').classList.remove('dragover'));
$('dropzone').addEventListener('drop',e=>{e.preventDefault();$('dropzone').classList.remove('dragover');pick(e.dataTransfer?.files?.[0]);});
$('player').addEventListener('loadedmetadata',()=>{if(Number.isFinite($('player').duration))durationMs=Math.round($('player').duration*1000);});
$('clearBtn').addEventListener('click',()=>{if(busy)return;reset();});
async function api(endpoint, options={}){
  let response;
  try{response=await fetch('/api/'+endpoint,{method:'POST',headers:{...options.headers},body:options.body,cache:'no-store',credentials:'same-origin'});}
  catch(e){throw new Error('Connection failed. Check the deployed backend and network. '+e.message);}
  $('lastRequest').textContent=endpoint+' · HTTP '+response.status;
  let data;try{data=await response.json();}catch{throw new Error('Server returned a non-JSON response. Check the Worker deployment.');}
  if(!response.ok||!data.ok){
    const details=data?.error||{};
    const code=typeof details.code==='string'?details.code:'HTTP_'+response.status;
    const stage=typeof details.stage==='string'?details.stage:'unknown-stage';
    const message=typeof details.message==='string'?details.message:'Request failed with HTTP '+response.status;
    const error=new Error('['+code+' at '+stage+'] '+message);
    error.httpStatus=response.status;error.errorCode=code;error.errorStage=stage;
    throw error;
  }
  return data;
}
async function health(){
  try{const r=await fetch('/api/health',{cache:'no-store'});const d=await r.json();
    if(!r.ok||!d.ok)throw new Error('Not ready');
    $('engineStatus').textContent=!d.engineConfigured?'AI provider key not configured':!d.rateLimitConfigured?'Processing guard not configured':'Processing API configured';
    $('sttModel').textContent=d.transcriptionModel||'Unknown';$('llmModel').textContent=d.analysisModel||'Unknown';
    $('protectionStatus').textContent=d.engineConfigured&&d.rateLimitConfigured?'Ready for live testing (not yet verified)':!d.engineConfigured?'Missing GEMINI_API_KEY secret':'Rate limiter must be deployed';
    $('engineStatus').style.color=d.engineConfigured&&d.rateLimitConfigured?'#16886e':'#ba5964';
  }catch{ $('engineStatus').textContent='Backend unavailable';$('engineStatus').style.color='#ba5964';$('sttModel').textContent='Unavailable';$('llmModel').textContent='Unavailable';$('protectionStatus').textContent='Backend unavailable';}
}
$('refreshHealth').addEventListener('click',health);
$('transcribeBtn').addEventListener('click',async()=>{
  if(!file||busy)return;
  const body=new FormData();body.append('audio',file,file.name);const lang=$('language').value;if(lang!=='auto')body.append('language',lang);
  busy=true;$('transcribeBtn').disabled=true;$('transcriptionPanel').hidden=true;$('resultsPanel').hidden=true;transcription=null;analysis=null;roles={};syncNavigation();status('qa','','No export available');
  status('stt','busy','Uploading and processing audio…');status('roles','','Waiting for speaker output');status('llm','','Waiting for transcription');steps(2);notice('Sending recording to the speech-to-text model. This is a real processing request.','busy');
  try{
    const res=await api('transcribe',{body});
    if(!Array.isArray(res.segments)||!res.segments.length||!Array.isArray(res.speakerIds)||!res.speakerIds.length)throw new Error('The speech provider did not return a usable speaker-labeled transcript.');
    // Never accept fabricated or out-of-order timestamps. Overlapping speech is allowed.
    let last=-1;for(const segment of res.segments){
      if(!Number.isInteger(segment.startMs)||!Number.isInteger(segment.endMs)||segment.startMs<0||segment.startMs<last||segment.endMs<=segment.startMs||!segment.speakerId||!segment.text?.trim())throw new Error('Invalid timestamped segment returned.');
      if(durationMs!==null&&segment.endMs>durationMs+2500)throw new Error('Transcript exceeds the detected recording duration. Review alignment.');
      last=segment.startMs;
    }
    transcription=res;roles=Object.fromEntries(res.speakerIds.map(s=>[s,'']));
    $('transcriptionPanel').hidden=false;renderSpeakers();renderTranscript();syncNavigation();
    $('segmentCount').textContent=res.segments.length+' segments';
    status('stt','done',res.segments.length+' timestamped segments produced');status('roles','busy','Assign speaker roles to continue');
    notice('Actual audio transcription completed. Confirm agent and customer speakers before analysis.');
    showView('transcript');
  }catch(e){
    const marker=e.httpStatus?'HTTP '+e.httpStatus+' · '+(e.errorCode||'PROCESSING_FAILED')+' · '+(e.errorStage||'unknown'):'Transcription request failed';
    status('stt','bad',marker);steps(1);
    notice('Transcription failed: '+e.message+' — '+(e.httpStatus?'HTTP '+e.httpStatus:'connection error')+'. The audio was not transcribed.','error');
  }
  finally{busy=false;$('transcribeBtn').disabled=!file;}
});
function roleReady(){const r=Object.values(roles);return r.length>0&&r.every(x=>['Agent','Customer','Other'].includes(x))&&r.includes('Agent')&&r.includes('Customer');}
function renderSpeakers(){
  $('speakerMap').innerHTML=transcription.speakerIds.map((s,i)=>`<div class="speaker-card"><b>Speaker ${safe(s)}</b><select data-speaker="${safe(s)}"><option value="">Select role…</option>${['Agent','Customer','Other'].map(r=>`<option value="${r}" ${roles[s]===r?'selected':''}>${r}</option>`).join('')}</select></div>`).join('');
  $('analyzeBtn').disabled=!roleReady()||busy;
  $('speakerHint').textContent=roleReady()?'Speaker roles confirmed':'Agent and Customer must both be identified';
}
$('speakerMap').addEventListener('change',e=>{
  if(!e.target.matches('[data-speaker]')||busy)return;
  roles[e.target.dataset.speaker]=e.target.value;
  analysis=null;$('resultsPanel').hidden=true;syncNavigation();status('qa','','No export available');status('llm','','Awaiting analysis');
  status('roles',roleReady()?'done':'busy',roleReady()?'All speaker roles confirmed':'Assign agent and customer');
  renderSpeakers();renderTranscript();clearNotice();
});
function renderTranscript(){
  if(!transcription)return;
  $('transcript').innerHTML=transcription.segments.map((s,i)=>`<div class="line" data-role="${safe(roles[s.speakerId])}"><header><span>${safe(roles[s.speakerId]||'Speaker '+s.speakerId)}</span><button type="button" class="evidence" data-seek-transcript="${i}" aria-label="Play this speaker segment">▶ ${clock(s.startMs)} – ${clock(s.endMs)}</button></header><p dir="auto">${safe(s.text)}</p></div>`).join('');
}
$('analyzeBtn').addEventListener('click',async()=>{
  if(busy||!transcription||!roleReady())return;
  busy=true;$('analyzeBtn').disabled=true;steps(3);status('llm','busy','Running AI against verified transcript…');notice('Calling the analysis LLM. Evidence is grounded in the timestamped transcript.','busy');
  try{
    analysis=await api('analyze',{headers:{'content-type':'application/json'},body:JSON.stringify({segments:transcription.segments,speakerMapping:roles,metadata:meta()})});
    if(!analysis.intelligence)throw new Error('The model response has no intelligence section.');
    renderResults();$('resultsPanel').hidden=false;syncNavigation();status('llm','done','Live LLM response received');status('qa','done','QA-ready JSON available for download');
    completeCount++;$('completedCount').textContent=String(completeCount);notice('Analysis completed using the real LLM. Download the QA handoff JSON.');
    await autoSaveConfiguredOutput();
    showView('handoff');
  }catch(e){
    steps(2);status('llm','bad',e.httpStatus?'HTTP '+e.httpStatus+' · '+(e.errorCode||'PROCESSING_FAILED'):'Analysis failed');
    notice('AI analysis failed: '+e.message,'error');
  }
  finally{busy=false;$('analyzeBtn').disabled=!roleReady();}
});
function evidence(indices){
  if(!Array.isArray(indices)||!indices.length)return '<small class="helper">No verified evidence</small>';
  return indices.map(i=>{const s=transcription?.segments?.[i];return s?`<button type="button" class="evidence" title="Play evidence from ${clock(s.startMs)}" data-evidence="${i}">↳ ${clock(s.startMs)}</button>`:'';}).join(' ');
}
function facts(list){return Array.isArray(list)&&list.length?list.map(f=>`<div class="item"><p>${safe(f.description)} ${evidence(f.evidenceSegmentIndices)}</p></div>`).join(''):'<p class="helper">None explicitly supported by the transcript.</p>';}
function renderResults(){
  const v=analysis.intelligence;
  $('sentiment').textContent=v.closingSentiment?.value||'Unclear';$('resolutionStatus').textContent=v.resolution?.status||'Unclear';$('issueCount').textContent=String(v.issues?.length||0);
  const em=(v.emotionalIndicators||[]).map(f=>({description:f.kind+' ('+(roles[f.speakerId]||f.speakerId)+')',evidenceSegmentIndices:f.evidenceSegmentIndices}));
  const sig=(v.conversationSignals||[]).map(f=>({description:f.kind+': '+f.description,evidenceSegmentIndices:f.evidenceSegmentIndices}));
  const sections=[['Issues raised',v.issues],['Actions stated',v.actions],['Promises & commitments',v.commitments],['Next steps',v.nextSteps],['Emotional indicators based on words',em],['Explicit conversation signals',sig]];
  $('results').innerHTML=`<h3>CRM summary</h3><p>${safe(v.summary||'Unclear')}</p><h3>Reason for contact</h3><p>${safe(v.reasonForContact||'Unclear')}</p><h3>Resolution</h3><p>${safe(v.resolution?.description||'No confirmed resolution.')} ${evidence(v.resolution?.evidenceSegmentIndices)}</p><h3>Customer closing sentiment evidence</h3><p>${evidence(v.closingSentiment?.evidenceSegmentIndices)}</p>`+sections.map(([title,items])=>`<h3>${safe(title)}</h3>${facts(items)}`).join('');
}
$('transcript').addEventListener('click',e=>{
  const button=e.target.closest('[data-seek-transcript]');
  if(!button||!file)return;
  const seg=transcription?.segments?.[Number(button.dataset.seekTranscript)];
  if(!seg)return;
  const player=$('transcriptPlayer');
  player.currentTime=seg.startMs/1000;
  player.play().catch(()=>{});
  player.scrollIntoView({behavior:'smooth',block:'nearest'});
});
$('results').addEventListener('click',e=>{const target=e.target.closest('[data-evidence]');if(!target||!file)return;const seg=transcription?.segments?.[Number(target.dataset.evidence)];if(seg){const p=$('qaPlayer');p.currentTime=seg.startMs/1000;p.play().catch(()=>{});p.scrollIntoView({behavior:'smooth',block:'nearest'});}});
function exportPackage(){
  if(!analysis||!transcription||!roleReady())throw new Error('Finish real transcription and AI analysis first.');
  return {handoffSchemaVersion:'1.0',producer:'MAFer Audio Intelligence',destination:'QA.MAFer.AI',qaScoringPerformed:false,readyForQA:true,
    recording:{originalFileName:file.name,fileSizeBytes:file.size,durationMs,uploadedAt:new Date().toISOString()},
    metadata:analysis.metadata,speakerMapping:{...roles},
    transcript:{transcriptSchemaVersion:'1.0',segments:transcription.segments.map(s=>({...s,speaker:roles[s.speakerId]})),language:transcription.language,source:'Real audio transcription',model:transcription.provider?.transcriptionModel},
    intelligence:{...analysis.intelligence,outputSchemaVersion:analysis.outputSchemaVersion,analysisSource:analysis.analysisSource,model:analysis.summaryModel,generatedAt:analysis.generatedAt},
    integration:{transport:'Manual JSON export',s3Published:false,crmUpdated:false,qaIngested:false}};
}
function download(content,type,suffix){
  const id=meta().conversationId||('manual-'+Date.now());const base=id.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,100)||'manual';
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='MAFerAudio_'+base+'_'+suffix;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
$('downloadJson').addEventListener('click',()=>{try{download(JSON.stringify(exportPackage(),null,2),'application/json','QA_handoff.json');notice('QA JSON exported. The QA service has not been called.');}catch(e){notice(e.message,'error');}});
$('downloadText').addEventListener('click',()=>{try{const pkg=exportPackage(),lines=pkg.transcript.segments.map(s=>`[${clock(s.startMs)} – ${clock(s.endMs)}] ${s.speaker}: ${s.text}`);download(['MAFer Audio Intelligence · Verified timestamped transcript','Conversation ID: '+(pkg.metadata.conversationId||'Not supplied'),'Agent: '+(pkg.metadata.agentName||'Not supplied'),'','' ,...lines].join('\n'),'text/plain;charset=utf-8','transcript.txt');notice('Transcript downloaded.');}catch(e){notice(e.message,'error');}});

// Local HDD configuration and evidence export. No secrets or customer audio are kept in localStorage.
const SETTINGS_KEY='mafer-poc-storage-settings-v1';
let localEntries=[];
function configMessage(message,error=false){
  const node=$('configurationStatus');node.textContent=message;node.style.color=error?'#ba5964':'';
}
function configValues(){return {input:$('configInputType').value,output:$('configOutputType').value};}
async function refreshFolderLabels(){
  for(const key of ['input','output']){
    const h=await getFolder(key);
    $(key+'FolderStatus').textContent=h?'Selected: '+h.name+' (permission verified when accessed)':'No '+key+' folder selected.';
  }
}
function loadPOCConfiguration(){
  try{
    const c=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');
    if(['manual','local'].includes(c.input))$('configInputType').value=c.input;
    if(['download','local'].includes(c.output))$('configOutputType').value=c.output;
  }catch{}
  if(!localFoldersSupported()){
    for(const id of ['selectInputFolder','scanInputFolder','loadLocalFile','selectOutputFolder','testOutputFolder'])$(id).disabled=true;
    configMessage('Local folder access needs Edge/Chrome on HTTPS or localhost; manual uploads remain available.');
  }
  refreshFolderLabels().catch(()=>{});
}
$('saveConfiguration').addEventListener('click',()=>{
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(configValues()));
  configMessage('Input/output settings saved in this browser. Provider credentials remain securely managed by the backend.');
});
$('selectInputFolder').addEventListener('click',async()=>{
  try{await selectFolder('input');await refreshFolderLabels();configMessage('Input folder selected. Click Scan for audio.');}
  catch(e){configMessage('Input selection failed: '+e.message,true);}
});
$('scanInputFolder').addEventListener('click',async()=>{
  try{
    const r=await listAudioFiles();localEntries=r.files;
    const sel=$('localAudioFile');sel.replaceChildren(new Option('Choose a recording ('+localEntries.length+' found)',''));
    localEntries.forEach((x,i)=>sel.add(new Option(x.relative,String(i))));
    $('inputFolderStatus').textContent='Read access verified: '+r.folderName+' · '+localEntries.length+' recording(s)'+(r.limited?' (first 250 only)':'');
    configMessage('Select a recording then click Load recording.');
  }catch(e){configMessage('Input scan failed: '+e.message,true);}
});
$('loadLocalFile').addEventListener('click',async()=>{
  try{
    if(busy)throw Error('Another recording is being processed.');
    const value=$('localAudioFile').value,index=Number(value);
    if(value===''||!localEntries[index])throw Error('Choose a recording from the list.');
    const selected=await localEntries[index].handle.getFile();
    if(selected.size>MAX)throw Error('The current upload limit is 24 MB; select a smaller recording.');
    pick(selected);
    showView('analyzer');
  }catch(e){configMessage('Load recording failed: '+e.message,true);}
});
$('selectOutputFolder').addEventListener('click',async()=>{
  try{await selectFolder('output');await refreshFolderLabels();configMessage('Output folder selected. Test access to verify write permissions.');}
  catch(e){configMessage('Output selection failed: '+e.message,true);}
});
$('testOutputFolder').addEventListener('click',async()=>{
  try{const r=await testLocalFolder('output');$('outputFolderStatus').textContent=r.status+': '+r.name;configMessage('Output folder read/write check passed.');}
  catch(e){configMessage('Output test failed: '+e.message,true);}
});
$('testConfiguration').addEventListener('click',async()=>{
  try{
    const response=await fetch('/api/health',{cache:'no-store'});
    const data=await response.json();
    if(!response.ok||!data.ok)throw Error('Backend returned HTTP '+response.status);
    $('configSpeechModel').value=data.transcriptionModel||'Not reported';
    $('configAnalysisModel').value=data.analysisModel||'Not reported';
    if(['gemini','openai','amazon'].includes(data.transcriptionProvider))$('configSpeechProvider').value=data.transcriptionProvider;
    if(['gemini','openai'].includes(data.analysisProvider))$('configAnalysisProvider').value=data.analysisProvider;
    configMessage('Backend checked: '+(data.engineConfigured?'provider keys configured':'provider keys missing')+
      '; '+(data.rateLimitConfigured?'rate limiter configured':'rate limiter missing')+
      '. Provider connectivity requires a real processing request.');
  }catch(e){configMessage('Backend health check failed: '+e.message,true);}
});
async function autoSaveConfiguredOutput(){
  if($('configOutputType').value!=='local')return;
  try{
    const result=await saveToLocalFolder(exportPackage());
    notice('Analysis complete. Intelligence package saved to '+result.path);
    status('qa','done','Local output written');
  }catch(e){
    notice('Analysis complete but local output save failed: '+e.message+'. JSON download is still available.','error');
    status('qa','bad','Local output save failed');
  }
}
loadPOCConfiguration();

health();