// Actual audio and model responses only. No seeded interactions or fake success statuses.
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
  const handoffReady=transcriptReady&&!!analysis&&roleReady();
  $('navTranscript').disabled=!transcriptReady;
  $('navQA').disabled=!handoffReady;
  const current=document.querySelector('.side-link.active');
  if(current?.disabled){current.classList.remove('active');$('navUpload').classList.add('active');}
}
document.querySelectorAll('[data-nav-target]').forEach(button=>button.addEventListener('click',()=>{
  if(button.disabled)return;
  const target=$(button.dataset.navTarget);if(!target||target.hidden)return;
  document.querySelectorAll('[data-nav-target]').forEach(x=>x.classList.toggle('active',x===button));
  target.scrollIntoView({behavior:'smooth',block:'start'});
}));
function meta(){return {conversationId:$('conversationId').value.trim(),agentName:$('agentName').value.trim(),bu:$('bu').value,brand:$('brand').value.trim()||$('bu').value,market:$('market').value,language:$('language').value==='auto'?'Auto-detected':$('language').value==='ar'?'Arabic':'English'};}
function reset(full=true){
  if(localUrl) URL.revokeObjectURL(localUrl);localUrl=null;file=null;transcription=null;analysis=null;roles={};durationMs=null;
  $('audioFile').value='';$('player').hidden=true;$('player').removeAttribute('src');$('player').load();
  $('dropTitle').textContent='Choose an audio recording';$('dropDesc').textContent='MP3, WAV, M4A, MP4, FLAC, OGG or WebM · maximum 24 MB';
  $('transcribeBtn').disabled=true;$('transcriptionPanel').hidden=true;$('resultsPanel').hidden=true;$('analyzeBtn').disabled=true;$('speakerMap').replaceChildren();
  if(full){['conversationId','agentName','brand'].forEach(k=>$(k).value='');$('bu').value='VOX';$('market').value='UAE';$('language').value='auto';}
  ['stt','roles','llm','qa'].forEach((k)=>status(k,'',k==='stt'||k==='llm'?'Not started':k==='roles'?'Waiting for audio':'No export available'));
  steps(1);clearNotice();syncNavigation();
}
function pick(next){
  if(busy)return;
  const ext=(next?.name||'').split('.').pop().toLowerCase();
  if(!next||!['mp3','wav','m4a','aac','flac','ogg','webm','mp4','mpeg','mpga'].includes(ext))return notice('Select a supported audio file.','error');
  if(next.size<1||next.size>MAX)return notice('Recording must be nonempty and no larger than 24 MB.','error');
  reset(false);file=next;localUrl=URL.createObjectURL(next);$('player').src=localUrl;$('player').hidden=false;
  $('dropTitle').textContent=next.name;$('dropDesc').textContent=(next.size/1024/1024).toFixed(2)+' MB · Ready for real transcription';
  $('transcribeBtn').disabled=false;
  notice('Recording selected. No data has been sent yet.');
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
  if(!response.ok||!data.ok)throw new Error(data.error?.message||'Request failed with HTTP '+response.status);
  return data;
}
async function health(){
  try{const r=await fetch('/api/health',{cache:'no-store'});const d=await r.json();
    if(!r.ok||!d.ok)throw new Error('Not ready');
    $('engineStatus').textContent=!d.engineConfigured?'OpenAI key not configured':!d.rateLimitConfigured?'Processing guard not configured':'Processing API configured';
    $('sttModel').textContent=d.transcriptionModel||'Unknown';$('llmModel').textContent=d.analysisModel||'Unknown';
    $('protectionStatus').textContent=d.engineConfigured&&d.rateLimitConfigured?'Ready for live testing (not yet verified)':!d.engineConfigured?'Missing OPENAI_API_KEY secret':'Rate limiter must be deployed';
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
    $('transcriptionPanel').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){status('stt','bad','Transcription failed');steps(1);notice('Transcription failed: '+e.message,'error');}
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
  $('transcript').innerHTML=transcription.segments.map((s,i)=>`<div class="line" data-role="${safe(roles[s.speakerId])}"><header><span>${safe(roles[s.speakerId]||'Speaker '+s.speakerId)}</span><span>${clock(s.startMs)} – ${clock(s.endMs)}</span></header><p dir="auto">${safe(s.text)}</p></div>`).join('');
}
$('analyzeBtn').addEventListener('click',async()=>{
  if(busy||!transcription||!roleReady())return;
  busy=true;$('analyzeBtn').disabled=true;steps(3);status('llm','busy','Running AI against verified transcript…');notice('Calling the analysis LLM. Evidence is grounded in the timestamped transcript.','busy');
  try{
    analysis=await api('analyze',{headers:{'content-type':'application/json'},body:JSON.stringify({segments:transcription.segments,speakerMapping:roles,metadata:meta()})});
    if(!analysis.intelligence)throw new Error('The model response has no intelligence section.');
    renderResults();$('resultsPanel').hidden=false;syncNavigation();status('llm','done','Live LLM response received');status('qa','done','QA-ready JSON available for download');
    completeCount++;$('completedCount').textContent=String(completeCount);notice('Analysis completed using the real LLM. Download the QA handoff JSON.');
    $('resultsPanel').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){steps(2);status('llm','bad','Analysis failed');notice('AI analysis failed: '+e.message,'error');}
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
$('results').addEventListener('click',e=>{const target=e.target.closest('[data-evidence]');if(!target||!file)return;const seg=transcription?.segments?.[Number(target.dataset.evidence)];if(seg){$('player').currentTime=seg.startMs/1000;$('player').play().catch(()=>{});$('player').scrollIntoView({behavior:'smooth',block:'center'});}});
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
health();