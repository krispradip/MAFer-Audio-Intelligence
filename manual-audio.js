(function manualAudioModule(){
"use strict";
const MAX=50*1024*1024, EXT=new Set(["mp3","wav","m4a","aac","flac","ogg","webm"]), BUS=["VOX","SHARE","AMBU","Retail"],LANG=["Auto-detect","English","Arabic"];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let file=null,preview="",stage={status:"idle",id:"",message:""};
let form={mode:"new",bu:"VOX",brand:"VOX",agent:"Manual Agent",market:"UAE",language:"Auto-detect",conversationId:"",retryId:""};
const failed=(role,data,leadBU="VOX")=>data.filter(i=>(role==="admin"||i.bu===leadBU)&&(window.MAFerTranscript.effectiveStatus(i)==="failed"||i.sum==="failed"));
function clearFile(){if(preview&&window.URL?.revokeObjectURL)window.URL.revokeObjectURL(preview);preview="";file=null;}
function reset(){clearFile();stage={status:"idle",id:"",message:""};form={mode:"new",bu:"VOX",brand:"VOX",agent:"Manual Agent",market:"UAE",language:"Auto-detect",conversationId:"",retryId:""};}
function chooseFile(next){
 if(!next)return {message:"No audio selected."};
 const ext=String(next.name||"").split(".").pop().toLowerCase(),mime=String(next.type||"").toLowerCase();
 if(!EXT.has(ext)||(mime&&!mime.startsWith("audio/")&&mime!=="application/octet-stream"))return {message:"Unsupported audio format. Choose MP3, WAV, M4A, AAC, FLAC, OGG or WebM."};
 if(!Number.isFinite(next.size)||next.size<=0)return {message:"Audio file is empty or invalid."};
 if(next.size>MAX)return {message:"Audio file exceeds the 50 MB limit."};
 clearFile();file=next;if(window.URL?.createObjectURL)preview=window.URL.createObjectURL(next);
 stage={status:"idle",id:"",message:"File selected in this browser; nothing has been sent."};
 return {render:true,message:"Audio ready for local preview and staging."};
}
function update(field,value,role,data,leadBU="VOX"){
 if(!Object.prototype.hasOwnProperty.call(form,field))return {};
 const v=String(value??"");
 if(field==="mode"){if(!["new","retry"].includes(v))return {};form.mode=v;if(v==="retry"&&!failed(role,data,leadBU).some(i=>i.id===form.retryId))form.retryId=failed(role,data,leadBU)[0]?.id||"";}
 else if(field==="bu"){if(role!=="admin"||!BUS.includes(v))return {message:"BU access restricted."};const previous=form.bu;form.bu=v;if(form.brand===previous)form.brand=v;}
 else if(field==="retryId"){if(!failed(role,data,leadBU).some(i=>i.id===v))return {message:"Failed interaction not available."};form.retryId=v;}
 else if(field==="language"){if(!LANG.includes(v))return {};form.language=v;}
 else form[field]=v.slice(0,160);
 stage={status:"idle",id:"",message:"Metadata changed; stage the run when ready."};
 return {render:["mode","bu","retryId"].includes(field)};
}
function prefillRetry(id,role,data,leadBU="VOX"){
 const i=failed(role,data,leadBU).find(x=>x.id===id);
 if(!i)return {message:"Interaction is not eligible for manual retry."};
 clearFile();
 form.mode="retry";form.retryId=i.id;form.bu=i.bu;form.brand=i.brand||i.bu;form.agent=i.agent||"Manual Agent";form.market=i.market||"UAE";
 form.language=LANG.includes(i.language)?i.language:"Auto-detect";
 stage={status:"idle",id:"",message:"Attach audio for "+i.id+"."};
 return {render:true,message:"Retry selected. Attach a recording to continue."};
}
function stageRun(role,data,leadBU="VOX"){
 if(!file)return {message:"Select an audio file first."};
 if(stage.status==="staged"||stage.status==="queued")return {message:"Already staged. Clear the form to start another run."};
 let record,existing=form.mode==="retry";
 if(existing){record=failed(role,data,leadBU).find(i=>i.id===form.retryId);if(!record)return {message:"Choose an accessible failed interaction."};}
 else{
  const bu=role==="lead"?leadBU:form.bu,id=form.conversationId.trim()||("manual-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8));
  if(!BUS.includes(bu))return {message:"Invalid business unit."};
  if(!/^[a-zA-Z0-9._:-]{5,128}$/.test(id))return {message:"Conversation ID must be 5–128 letters, numbers, dots, dashes, colons or underscores."};
  if(data.some(i=>i.id===id))return {message:"Conversation ID exists; use Retry for a failed interaction."};
  record={id,bu,brand:form.brand.trim()||bu,agent:form.agent.trim()||"Manual Agent",market:form.market.trim()||"UAE",
   language:form.language,agentCountry:"Unknown",callerCountry:"Unknown",duration:"Unknown",ticket:null,
   trans:"waiting",sum:"waiting",crm:"waiting",ack:"waiting",reason:"Awaiting transcription.",
   summary:"No transcript or summary generated.",actions:"Pending transcription.",next:"Awaiting processing service.",
   sentiment:"Not assessed",issues:[],transcriptSchemaVersion:"1.0",segments:[],error:"",
   source:"Manual audio upload"};
 }
 record.manualRun={status:"staged",fileName:file.name,fileSize:file.size,fileType:file.type||"unknown",
  attempt:(record.manualRun?.attempt||0)+1,createdAt:new Date().toISOString(),
  message:"Browser-local only. No transcription or API request."};
 if(!existing)data.unshift(record);
 stage={status:"staged",id:record.id,message:"Manual "+(existing?"retry":"interaction")+" staged locally; not transcribed."};
 return {render:true,id:record.id,message:stage.message};
}
async function submit(role,data,leadBU="VOX"){
 if(stage.status!=="staged"||!stage.id||!file)return {message:"Stage an audio file first."};
 const i=data.find(x=>x.id===stage.id);
 if(!i||(role==="lead"&&i.bu!==leadBU))return {message:"Manual run not accessible."};
 if(window.MAFER_MANUAL_AUDIO_API_ENABLED!==true)return {message:"Processing API not connected. Audio remains local; no transcription performed."};
 if(typeof window.fetch!=="function"||typeof window.FormData!=="function")return {message:"Browser upload API unavailable."};
 stage.status="submitting";
 try{
  const body=new window.FormData();
  body.append("audio",file,file.name);
  for(const [k,v] of Object.entries({conversationId:i.id,bu:i.bu,brand:i.brand,agent:i.agent,market:i.market,language:i.language,mode:form.mode,attempt:i.manualRun.attempt}))body.append(k,String(v));
  const response=await window.fetch("/api/manual-audio/jobs",{method:"POST",body,credentials:"same-origin",mode:"same-origin",redirect:"error"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const payload=await response.json();
  if(typeof payload?.jobId!=="string"||!payload.jobId.trim())throw Error("Missing jobId in response");
  i.manualRun.status="queued";i.manualRun.jobId=payload.jobId;i.manualRun.message="Backend accepted; awaiting results.";
  stage.status="queued";stage.message="Backend accepted job "+payload.jobId;
  return {render:true,id:i.id,message:"Manual audio job accepted by backend."};
 }catch(e){stage.status="staged";return {render:true,message:"Processing not submitted: "+String(e.message||"service unavailable").slice(0,120)};}
}
function render(role,data,leadBU="VOX"){
 if(role==="lead"&&form.bu!==leadBU){if(!form.brand.trim()||form.brand===form.bu)form.brand=leadBU;form.bu=leadBU;}
 const failures=failed(role,data,leadBU);
 if(form.mode==="retry"&&!failures.some(i=>i.id===form.retryId))form.retryId=failures[0]?.id||"";
 const retry=failures.find(i=>i.id===form.retryId);
 const modes=[["new","New manual interaction"],["retry","Retry failed interaction"]].map(([v,t])=>`<option value="${v}" ${form.mode===v?"selected":""}>${t}</option>`).join("");
 const bu=role==="lead"?`<div class="fw-readonly">${esc(leadBU)} · Your business unit</div>`:`<select data-manual-field="bu">${BUS.map(v=>`<option ${form.bu===v?"selected":""}>${v}</option>`).join("")}</select>`;
 const fileView=file?`<div class="manual-file-info"><b>${esc(file.name)}</b><small>${(file.size/1048576).toFixed(2)} MB · ${esc(file.type||"audio")}</small></div>${preview?`<audio class="manual-player" controls preload="metadata" src="${esc(preview)}">Audio preview unavailable.</audio>`:""}`:'<p class="hint">No file selected. Choose a synthetic recording for the demo.</p>';
 const retryInput=form.mode==="retry"?`<div class="field manual-full"><label>Failed interaction</label><select data-manual-field="retryId">${failures.map(i=>`<option value="${esc(i.id)}" ${i.id===form.retryId?"selected":""}>${esc(i.brand)} · ${esc(i.id)} · ${esc(window.MAFerTranscript.effectiveStatus(i)==="failed"?"STT failed":"Summary failed")}</option>`).join("")||'<option value="">No failed interactions</option>'}</select><small>Preserves the existing Conversation ID and completed outputs while staging.</small></div>`:`<div class="field"><label>Conversation ID (optional)</label><input data-manual-field="conversationId" maxlength="128" placeholder="Generate a manual ID" value="${esc(form.conversationId)}"/></div>`;
 const details=form.mode==="retry"&&retry?`<div class="manual-full callout">Retrying <b>${esc(retry.id)}</b> (${esc(retry.bu)}). No existing transcript or summary will be overwritten by staging.</div>`:`<div class="field"><label>Brand</label><input data-manual-field="brand" maxlength="160" value="${esc(form.brand)}"/></div><div class="field"><label>Agent</label><input data-manual-field="agent" maxlength="160" value="${esc(form.agent)}"/></div><div class="field"><label>Market</label><input data-manual-field="market" maxlength="160" value="${esc(form.market)}"/></div><div class="field"><label>Language</label><select data-manual-field="language">${LANG.map(v=>`<option ${form.language===v?"selected":""}>${v}</option>`).join("")}</select></div>`;
 const state=stage.status==="queued"?"Backend accepted":stage.status==="staged"?"Staged locally":stage.status==="submitting"?"Submitting":"Not staged";
 return `<div class="heading"><span class="eyebrow">MANUAL OPERATIONS</span><h1>Manual Audio Upload</h1><p>Upload a recording for show-and-tell or stage a controlled manual retry when automated ingestion fails.</p></div>
 <div class="manual-metrics"><div class="mini-metric"><b>Supported audio</b><p>MP3, WAV, M4A, AAC, FLAC, OGG, WebM</p></div><div class="mini-metric"><b>Maximum size</b><p>50 MB</p></div><div class="mini-metric"><b>Processing backend</b><p>${window.MAFER_MANUAL_AUDIO_API_ENABLED===true?"Enabled":"Not connected · staging only"}</p></div></div>
 <div class="layout"><div>
 <section class="card"><div class="card-head"><h2>1. Attach a recording</h2><span class="tag info">Local preview</span></div><div class="form-section"><label class="manual-drop" for="manual-file"><b>Choose audio file</b><small>Nothing is sent automatically. Use synthetic recordings only.</small><input id="manual-file" type="file" accept=".mp3,.wav,.m4a,.aac,.flac,.ogg,.webm,audio/*"/></label>${fileView}</div></section>
 <section class="card"><div class="card-head"><h2>2. Processing details</h2></div><div class="form-section"><div class="form-grid manual-grid">
 <div class="field"><label>Mode</label><select data-manual-field="mode">${modes}</select></div>
 <div class="field"><label>Business unit</label>${bu}</div>${retryInput}${details}
 </div></div></section>
 <div class="manual-actions"><button class="button" type="button" data-manual-action="clear">Clear form</button><button class="button primary" type="button" data-manual-action="stage" ${file?"":"disabled"}>Stage manual run</button><button class="button" type="button" data-manual-action="submit" ${stage.status==="staged"?"":"disabled"}>Submit to processing service</button></div>
 </div><div>
 <section class="card card-pad"><h2>Manual run status</h2><div class="pill-group" style="margin:12px 0"><span class="tag ${stage.status==="queued"?"good":stage.status==="staged"?"warn":"muted"}">${esc(state)}</span></div><p class="hint">${esc(stage.message||"Choose a file and stage a manual run.")}</p>${stage.id?`<div class="kv"><span>Conversation ID</span><span>${esc(stage.id)}</span></div><button type="button" class="button small" data-manual-action="open">Open interaction</button>`:""}</section>
 <section class="card card-pad"><h2>Processing boundary</h2><p class="hint">Staging creates or updates a local interaction record, preserving failed-run identity. When the approved backend enables the same-origin processing API, the original audio can be submitted for transcription and intelligence analysis.</p><div class="callout"><b>No simulated transcript is generated from uploaded audio.</b> Every completed transcript must contain valid STT-generated start/end timestamps for each speech segment. Until a real processing backend accepts the job, the file remains in this browser and no CRM/S3/QA update occurs.</div></section>
 <section class="card card-pad"><h2>Privacy</h2><p class="hint">Audio bytes are not saved in localStorage, GitHub or S3. Browser preview URLs are revoked when the file is replaced or the form is cleared. Never use customer recordings in the public demo.</p></section>
 </div></div>`;
}
window.MAFerManualAudio={render,chooseFile,update,prefillRetry,stageRun,submit,reset};
})();
