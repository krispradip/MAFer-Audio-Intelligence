(function frameworkModule(){
"use strict";
const STORAGE_KEY="mafer-audio-framework-config-v1";
const SCOPES=["All BUs","VOX","SHARE","AMBU","Retail"];
const TYPES={
 eq:{title:"Agent EQ Framework",subtitle:"Observable emotional and interpersonal behaviours — not a psychometric EQ test.",name:"Customer Interaction EQ",instructions:"Identify observable agent behaviours only. Use exact dialogue and timestamps. Evaluate in English or Arabic without treating cultural or language differences as deficiencies. Never infer personality, intelligence, internal emotions, or intent. If evidence is insufficient, return Not Assessable.",dimensions:[
 ["empathy","Empathy & acknowledgement","Recognises the customer's stated concern or frustration.","Explicitly acknowledges the concern in a respectful way.","Generic apologies without evidence of understanding are not sufficient."],
 ["listening","Active listening","Clarifies, reflects or confirms the customer's actual request.","Accurately restates the issue or asks a relevant clarification.","Do not infer listening quality from silence in transcript-only evidence."],
 ["regulation","Composed responses","Responds constructively during challenging exchanges.","Uses measured, professional language when challenged.","Tone, stress and composure cannot be verified from transcript text alone."],
 ["deescalation","De-escalation","Responds constructively to expressed customer frustration.","Acknowledges tension and offers a practical next step.","Only assess when a genuine escalation is evidenced."],
 ["ownership","Ownership & reassurance","Explains what the agent will do and what remains pending.","States a specific follow-up or accountable next step.","Do not treat an unverified promise as completed action."],
 ["clarity","Respectful communication","Communicates clearly and appropriately in the customer's language.","Provides understandable, courteous explanations.","Do not penalise Arabic dialect, accent or code-switching."]]},
 problem:{title:"Problem-Solving Framework",subtitle:"Evidence-based reasoning and issue resolution — not a psychometric IQ test.",name:"Customer Problem-Solving",instructions:"Identify the customer's distinct issues and observable agent problem-solving actions. Distinguish proposed actions from completed or CRM-verified actions. Cite timestamps and direct quotes in the original language. Mark Not Assessable when the transcript lacks sufficient evidence. Do not calculate IQ or formal QA scores.",dimensions:[
 ["issue-id","Issue identification","Identifies each distinct customer issue rather than combining unrelated requests.","Separates and confirms multiple requests when raised.","Do not infer unseen issues."],
 ["diagnosis","Diagnostic questioning","Asks relevant questions or checks to clarify the problem.","Seeks missing facts needed to proceed.","Do not assume backend checks occurred without evidence."],
 ["reasoning","Structured reasoning","Explains a relevant sequence of steps or decision rationale.","Connects known facts to the proposed next step.","Do not infer private thought processes."],
 ["solution","Solution relevance","Offers a response that addresses the expressed customer request.","Proposed resolution is aligned with the described issue.","Final resolution requires system or customer confirmation."],
 ["next-steps","Next-step clarity","Explains ownership, dependencies and expected follow-up.","Specifies what happens next and who is responsible.","Avoid treating tentative steps as confirmed outcomes."],
 ["verification","Resolution verification","Confirms the outcome or explicitly flags pending follow-up.","Clearly distinguishes resolved from unresolved issues.","A verbal assertion alone may not verify a system action."]]}
};
const clone=x=>JSON.parse(JSON.stringify(x));
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dimensions=type=>TYPES[type].dimensions.map(([id,name,description,positive,caution])=>({id,name,description,positive,caution,enabled:true}));
function snapshot(r){return {name:r.name,instructions:r.instructions,language:r.language,evidence:clone(r.evidence),dimensions:clone(r.dimensions)};}
function initial(type){const r={scope:"All BUs",name:TYPES[type].name,language:"English + Arabic",instructions:TYPES[type].instructions,evidence:{requireQuote:true,requireTimestamp:true,notAssessable:true},dimensions:dimensions(type),publishedVersion:"1.0",status:"Published",history:[{version:"1.0",at:"Seeded enterprise baseline"}],baseVersion:null};r.publishedSnapshot=snapshot(r);r.history[0].snapshot=clone(r.publishedSnapshot);return r;}
const records={eq:{"All BUs":initial("eq")},problem:{"All BUs":initial("problem")}};
try{
 const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
 if(saved&&saved.eq&&saved.problem&&saved.eq["All BUs"]&&saved.problem["All BUs"]){
  for(const type of ["eq","problem"]){
   for(const scope of SCOPES){
    const r=saved[type][scope];
    if(r&&Array.isArray(r.dimensions)&&r.evidence&&typeof r.instructions==="string"&&Array.isArray(r.history)){
     records[type][scope]=r;
    }
   }
  }
 }
}catch(e){}
let scope="All BUs";
const active=type=>{
 const own=records[type][scope];
 if(own)return own;
 const baseline=records[type]["All BUs"];
 if(baseline.status==="Draft"&&baseline.publishedSnapshot){
  return {...clone(baseline.publishedSnapshot),scope:"All BUs",status:"Published",publishedVersion:baseline.publishedVersion,history:baseline.history,baseVersion:null};
 }
 return baseline;
};
const inherited=type=>scope!=="All BUs"&&!records[type][scope];
const versionText=r=>r.publishedVersion==="0.0"?"Not published":"v"+r.publishedVersion;
function persist(){localStorage.setItem(STORAGE_KEY,JSON.stringify(records));}
function render(type){
 const meta=TYPES[type],r=active(type),readOnly=inherited(type),editable=!readOnly;
 const options=SCOPES.map(s=>`<option value="${esc(s)}" ${s===scope?"selected":""}>${esc(s==="All BUs"?"All BUs · Enterprise baseline":s)}</option>`).join("");
 const stateLabel=readOnly?"Inherited baseline":r.status==="Draft"?"Draft changes":"Published";
 const sourceText=readOnly?"This BU currently inherits the enterprise baseline. Create an override to customise it.":scope==="All BUs"?"Changes to this baseline apply to BUs without an override.":"This BU override is a versioned copy of the enterprise baseline; later baseline updates require review.";
 const evidence=[
  ["requireQuote","Require direct dialogue quote","Only mark a behaviour Observed when supporting dialogue is available."],
  ["requireTimestamp","Require timestamp","Record the exact transcript location of supporting evidence."],
  ["notAssessable","Use Not Assessable when evidence is insufficient","Do not turn missing audio, incomplete transcripts or unsupported assumptions into negative findings."]
 ].map(([key,label,desc])=>`<label class="fw-check"><input type="checkbox" data-fw-field="evidence.${key}" ${r.evidence[key]?"checked":""} ${editable?"":"disabled"}/><span><b>${esc(label)}</b><small>${esc(desc)}</small></span></label>`).join("");
 const dims=r.dimensions.map((d,i)=>`<article class="fw-dimension">
  <div class="fw-dimension-head">
   <label class="fw-check"><input type="checkbox" data-fw-field="dimensions.${i}.enabled" ${d.enabled?"checked":""} ${editable?"":"disabled"}/><span><b>${esc(d.name||"Untitled dimension")}</b><small>${d.enabled?"Enabled":"Disabled"} · Behaviour ${i+1}</small></span></label>
   ${editable?`<button class="button small ghost" data-fw-action="remove" data-fw-index="${i}" type="button">Remove</button>`:""}
  </div>
  <div class="form-grid fw-fields">
   <div class="field"><label>Dimension name</label><input data-fw-field="dimensions.${i}.name" value="${esc(d.name)}" ${editable?"":"disabled"}/></div>
   <div class="field"><label>What it measures</label><input data-fw-field="dimensions.${i}.description" value="${esc(d.description)}" ${editable?"":"disabled"}/></div>
   <div class="field"><label>Positive behavioural evidence</label><textarea rows="2" data-fw-field="dimensions.${i}.positive" ${editable?"":"disabled"}>${esc(d.positive)}</textarea></div>
   <div class="field"><label>Guardrails / exclusions</label><textarea rows="2" data-fw-field="dimensions.${i}.caution" ${editable?"":"disabled"}>${esc(d.caution)}</textarea></div>
  </div>
 </article>`).join("");
 const history=(r.history||[]).slice(0,6).map(h=>`<div class="fw-history"><b>v${esc(h.version)}</b><span>${esc(h.at)}</span></div>`).join("")||'<p class="hint">No published version yet.</p>';
 return `<div class="heading"><span class="eyebrow">INTELLIGENCE CONFIGURATION</span><h1>${esc(meta.title)}</h1><p>${esc(meta.subtitle)}</p></div>
 <div class="fw-summary">
  <div><span class="eyebrow">FRAMEWORK STATUS</span><h2>${esc(r.name)}</h2><div class="sub">${esc(sourceText)}</div></div>
  <div class="pill-group"><span class="tag ${r.status==="Draft"&&!readOnly?"warn":"good"}">${esc(stateLabel)}</span><span class="tag info">${esc(versionText(r))}</span></div>
 </div>
 <div class="layout">
 <div>
  <section class="card">
   <div class="card-head"><div><h2>Framework settings</h2><div class="sub">Select a BU to view its applicable framework or create an override</div></div></div>
   <div class="form-section">
    <div class="form-grid">
     <div class="field"><label for="fw-scope">Business unit / scope</label><select id="fw-scope">${options}</select></div>
     <div class="field"><label>Framework name</label><input data-fw-field="name" value="${esc(r.name)}" ${editable?"":"disabled"}/></div>
     <div class="field"><label>Supported languages</label><select data-fw-field="language" ${editable?"":"disabled"}>${["English + Arabic","English","Arabic"].map(v=>`<option ${r.language===v?"selected":""}>${v}</option>`).join("")}</select></div>
     <div class="field"><label>Published version</label><div class="fw-readonly">${esc(versionText(r))} ${r.status==="Draft"?"· unpublished edits":""}</div></div>
    </div>
    ${readOnly?`<div class="callout" style="margin-top:16px">No BU override exists for ${esc(scope)}. The published enterprise baseline is used until an override is created.</div><div style="margin-top:12px"><button class="button primary small" type="button" data-fw-action="override">Create ${esc(scope)} override</button></div>`:""}
    <div class="field" style="margin-top:18px"><label>Framework evaluation instructions</label><textarea rows="5" data-fw-field="instructions" ${editable?"":"disabled"}>${esc(r.instructions)}</textarea></div>
   </div>
  </section>
  <section class="card">
   <div class="card-head"><div><h2>Behavioural dimensions</h2><div class="sub">${r.dimensions.filter(d=>d.enabled).length} enabled · Editable definitions, examples and exclusions</div></div>${editable?'<button type="button" class="button small" data-fw-action="add">+ Add dimension</button>':""}</div>
   <div class="fw-dimensions">${dims}</div>
  </section>
  <section class="card">
   <div class="card-head"><div><h2>Evidence & language rules</h2><div class="sub">Applied consistently to English, Arabic and code-switched interactions</div></div></div>
   <div class="form-section"><div class="fw-checks">${evidence}</div><div class="callout" style="margin-top:16px">Transcript-only analysis cannot reliably determine vocal tone, pace, true emotional state or actual IQ. Keep evidence in the original language and avoid inferring unobserved CRM actions.</div></div>
  </section>
  <div class="fw-actions">${editable?'<button class="button" data-fw-action="reset" type="button">Discard draft edits</button><button class="button" data-fw-action="save" type="button">Save draft</button><button class="button primary" data-fw-action="publish" type="button">Publish demo version</button>':'<span class="hint">Select All BUs or create an override to edit.</span>'}</div>
 </div>
 <div>
  <section class="card card-pad"><h2>Published history</h2><p class="hint">Each published version is preserved as a configuration snapshot in this browser demo.</p>${history}${scope!=="All BUs"?`<div class="kv"><span>Base version</span><span>${esc(r.baseVersion||records[type]["All BUs"].publishedVersion)}</span></div>`:""}</section>
  <section class="card card-pad"><h2>What the analysis produces</h2><div class="pill-group"><span class="tag good">Observed</span><span class="tag muted">Not Observed</span><span class="tag warn">Not Assessable</span></div><p class="hint" style="margin-top:12px">Each finding includes a dimension, status, supporting dialogue, timestamp, language and the framework version used at evaluation time.</p><div class="callout">No numeric EQ or IQ score is calculated. Formal QA scoring remains in QA.MAFer.AI.</div></section>
  <section class="card card-pad"><h2>Demo storage</h2><p class="hint">Draft and published configurations are saved to this browser's local storage. They are not shared across users or connected to the live transcription/summary engines. Production requires a database, approval controls and a version-pinned evaluation service.</p></section>
 </div></div>`;
}
function setField(type,path,value){
 if(inherited(type))return {render:false,message:"Create a BU override before editing."};
 const r=active(type),parts=path.split(".");
 let target=r;
 for(let i=0;i<parts.length-1;i++){
  if(!(parts[i] in target))return {render:false,message:"Unknown field."};
  target=target[parts[i]];
 }
 const field=parts[parts.length-1];
 if(!(field in target))return {render:false,message:"Unknown field."};
 target[field]=value;
 r.status="Draft";
 return {render:typeof value==="boolean"};
}
function change(type,element){
 if(element.id==="fw-scope"){
  if(!SCOPES.includes(element.value))return {render:false};
  scope=element.value;return {render:true};
 }
 const path=element.dataset.fwField;
 if(!path)return {render:false};
 return setField(type,path,element.type==="checkbox"?element.checked:element.value);
}
function action(type,actionName,index){
 const r=active(type);
 if(actionName==="override"){
  if(!inherited(type))return {message:"An override already exists."};
  const baseline=records[type]["All BUs"],copy=clone(baseline.publishedSnapshot||snapshot(baseline));
  records[type][scope]={...copy,scope,status:"Draft",publishedVersion:"0.0",history:[],baseVersion:baseline.publishedVersion,publishedSnapshot:null};
  return {render:true,message:scope+" override created. Edit and publish when ready."};
 }
 if(inherited(type))return {message:"Create a BU override before editing."};
 if(actionName==="add"){
  if(r.dimensions.length>=20)return {message:"Limit of 20 dimensions reached."};
  r.dimensions.push({id:"custom-"+Date.now(),name:"New behavioural dimension",description:"Describe the observable behaviour.",positive:"Provide a positive example.",caution:"Define exclusions and evidence limitations.",enabled:true});
  r.status="Draft";return {render:true,message:"Dimension added to draft."};
 }
 if(actionName==="remove"){
  const n=Number(index);
  if(!Number.isInteger(n)||n<0||n>=r.dimensions.length)return {message:"Dimension not found."};
  if(r.dimensions.length===1)return {message:"At least one dimension is required."};
  r.dimensions.splice(n,1);r.status="Draft";return {render:true,message:"Dimension removed from draft."};
 }
 if(actionName==="reset"){
  if(!r.publishedSnapshot)return {message:"No published version exists to restore."};
  Object.assign(r,clone(r.publishedSnapshot));r.status="Published";
  return {render:true,message:"Draft changes discarded. Restored "+versionText(r)+"."};
 }
 if(actionName==="save"){
  try{persist();return {render:true,message:"Draft saved in this browser only."};}
  catch(e){return {message:"Browser storage is unavailable; draft remains in memory."};}
 }
 if(actionName==="publish"){
  if(r.status!=="Draft")return {message:"There are no unpublished changes."};
  if(!r.name.trim()||!r.instructions.trim()||!r.dimensions.some(d=>d.enabled)||r.dimensions.some(d=>!d.name.trim()||!d.description.trim()))return {message:"Publish blocked: provide a framework name, instructions and valid enabled dimensions."};
  const old=r.publishedVersion,parts=old.split(".").map(Number);
  const next=old==="0.0"?"1.0":`${Number.isFinite(parts[0])?parts[0]:1}.${Number.isFinite(parts[1])?parts[1]+1:1}`;
  r.publishedVersion=next;r.status="Published";r.publishedSnapshot=snapshot(r);
  r.history.unshift({version:next,at:new Date().toLocaleString("en-GB"),snapshot:clone(r.publishedSnapshot)});
  try{persist();return {render:true,message:"Demo "+versionText(r)+" published in this browser. No live evaluation changed."};}
  catch(e){return {render:true,message:"Published in memory only; browser storage unavailable."};}
 }
 return {render:false};
}
function renderObservations(i){
 const sets=i.frameworkEvidence||{};
 const output=[["eq","EQ behaviour observations"],["problem","Problem-solving observations"]].map(([type,title])=>{
  const result=sets[type];
  const completed=i.trans==="completed"&&i.sum==="completed";
  const observations=result?.observations||[];
  const version=result?`v${esc(result.version)} · ${esc(result.scope||"All BUs")}`:"Not assessed";
  const items=observations.map(o=>{
   const css=o.status==="Observed"?"good":o.status==="Not Observed"?"muted":"warn";
   return `<div class="fw-observation"><div class="flex" style="justify-content:space-between"><b>${esc(o.dimension)}</b><span class="tag ${css}">${esc(o.status)}</span></div><p>${esc(o.note||"")}</p>${o.quote?`<div class="fw-evidence"><span>${esc(o.time||"Time not provided")} · ${esc(o.language||i.language)}</span><q>${esc(o.quote)}</q></div>`:""}</div>`;
  }).join("");
  return `<div class="fw-result"><div class="flex" style="justify-content:space-between"><b>${title}</b><span class="sub">${version}</span></div>${items||(completed?'<p class="hint">Not Assessable from the available demo excerpt; no structured evidence was produced.</p>':'<p class="hint">Pending a completed transcript and summarization run.</p>')}</div>`;
 }).join("");
 return '<div class="fw-result-grid">'+output+'</div><p class="hint">Evidence and framework versions shown here are fixed synthetic examples. Editing a framework does not retroactively re-evaluate historical interactions.</p>';
}
window.MAFerFrameworks={render,change,action,renderObservations};
})();
