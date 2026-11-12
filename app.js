(function(){
"use strict";
const timing=window.MAFerTranscript;const signals=window.MAFerSignals;const seed=window.SEED;let data=JSON.parse(JSON.stringify(seed.interactions));let services=JSON.parse(JSON.stringify(seed.services));let role="admin",leadBU="VOX",page="operations",selected=data[0].id,tab="summary",cfg="stt",query="",filter="all",scenario="200",results={stt:"200",sum:"200",connections:"200"};
const esc=v=>String(v??"").replace(/[&<>"\x27]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",[String.fromCharCode(34)]:"&quot;",[String.fromCharCode(39)]:"&#39;"}[c]));
const tag=x=>{let map={completed:["Completed","good"],processing:["In progress","info"],failed:["Failed","bad"],waiting:["Waiting","muted"],confirmed:["Confirmed","good"],delivered:["Delivered","good"],unmatched:["Unmatched","bad"],sent:["Awaiting CRM","warn"],healthy:["Healthy","good"],degraded:["Degraded","warn"],untested:["Not tested","muted"]};let a=map[x]||[x,"muted"];return '<span class="tag '+a[1]+'">'+esc(a[0])+'</span>';};
const btn=(label,action,sty="small")=>'<button type="button" class="button '+sty+'" data-action="'+action+'">'+label+"</button>";
const heading=(name,desc)=>'<div class="heading"><span class="eyebrow">MAFer AUDIO INTELLIGENCE</span><h1>'+name+'</h1><p>'+desc+"</p></div>";
const card=(name,num,desc)=>'<div class="card metric"><div class="k">'+name+'</div><strong>'+num+'</strong><div class="foot">'+desc+"</div></div>";
const transStatus=i=>timing.effectiveStatus(i);
const transIssue=i=>timing.issue(i);
const statusCount=(field)=>{let r={completed:0,processing:0,failed:0,waiting:0};data.forEach(i=>{let s=field==="trans"?transStatus(i):i[field];if(s==="confirmed"||s==="delivered")s="completed";if(s==="unmatched")s="failed";if(s==="sent")s="processing";r[s in r?s:"waiting"]++;});return r;};
const exceptions=()=>data.filter(i=>!!i.error||i.crm==="unmatched"||i.ack==="failed"||!!transIssue(i));
function operations(){let tc=statusCount("trans"),ac=statusCount("ack");let stages=[["trans","Transcription"],["sum","AI Summarization"],["crm","CRM Ticket Update"],["ack","CRM Confirmation"]];let bars=stages.map(([key,label])=>{let n=statusCount(key),total=data.length;return '<div class="stage"><div class="stage-row"><b>'+label+'</b><small>'+n.completed+'/'+total+' completed</small></div><div class="bar"><span class="done" style="width:'+100*n.completed/total+'%"></span><span class="busy" style="width:'+100*n.processing/total+'%"></span><span class="fail" style="width:'+100*n.failed/total+'%"></span><span class="wait" style="width:'+100*n.waiting/total+'%"></span></div><div class="legend"><span>'+n.completed+' completed</span><span>'+n.processing+' processing</span><span>'+n.failed+' failed</span><span>'+n.waiting+' waiting</span></div></div>';}).join("");let errors=exceptions().map(i=>'<div class="exception"><div class="erricon">!</div><div class="grow"><strong>'+esc(i.brand)+' · '+esc(i.error||transIssue(i)?.code||'Processing exception')+'</strong><p>'+esc(i.id)+'</p></div>'+btn("Investigate","open:"+i.id)+"</div>").join("");return heading("Operations Console","Pipeline status, service connectivity, CRM confirmation and exceptions. Full interaction drill-down is in Interaction Explorer.")+'<div class="grid4">'+card("Audio received / staged",data.length,"Genesys and manual interactions")+card("Transcripts complete",tc.completed,tc.processing+" processing · "+tc.failed+" failed")+card("CRM confirmed",ac.completed,ac.processing+" pending · "+ac.failed+" failed")+card("Needs attention",exceptions().length,"Across processing stages")+'</div><div class="layout"><div><div class="card"><div class="card-head"><h2>Processing pipeline</h2>'+btn("↑ Upload audio","manual","primary small")+btn("+ Simulate call","simulate")+'</div>'+bars+'</div><div class="card"><div class="card-head"><h2>Needs attention</h2>'+btn("All diagnostics","diagnostics")+'</div>'+(errors||'<div class="empty">No exceptions</div>')+'</div></div><div><div class="card"><div class="card-head"><h2>Service connectivity</h2></div>'+[["Genesys recording ingestion",connectionTests.genesys?.code==="200"?"healthy":"untested"],["Speech-to-text",connectionTests.stt?.code==="200"?"healthy":"untested"],["Summary intelligence",connectionTests.sum?.code==="200"?"healthy":"untested"],["CRM interface",connectionTests.crm?.code==="200"?"healthy":"untested"],["Output storage",connectionTests.storage?.code==="200"?"healthy":"untested"]].map(([n,s])=>'<div class="service-row"><b>'+n+'</b>'+tag(s)+"</div>").join("")+'</div><div class="card card-pad"><h2>S3 output readiness · simulated</h2><div class="kv"><span>Full transcripts</span><span>"+data.filter(i=>transStatus(i)==="completed").length+" ready to publish</span></div><div class="kv"><span>CRM summaries</span><span>"+data.filter(i=>i.sum==="completed"&&transStatus(i)==="completed").length+" ready to publish</span></div><p class="hint">Readiness is derived from demo processing status; no S3 upload has occurred. QA.MAFer.AI reads published transcript JSON from S3 independently.</p></div><div class="card card-pad"><h2>CRM safety rule</h2><p class="hint">An acknowledgment timeout is not proof that the update failed. Reconcile with CRM before retrying to avoid duplicate ticket updates.</p></div></div></div>';}
function current(){return data.find(i=>i.id===selected&&(role==="admin"||i.bu===leadBU))||data.find(i=>role==="admin"||i.bu===leadBU);}
function speechEvidence(segment){
 if(!segment)return "";
 return '<p class="hint"><b>Transcript evidence · '+esc(timing.formatTimestamp(segment.startMs))+' – '+esc(timing.formatTimestamp(segment.endMs))+' · '+esc(segment.speaker)+'</b>: '+esc(segment.text)+'</p>';
}
function conversationSignalsHtml(i){
 const close=signals.customerClose(i),highlights=signals.eqHighlights(i);
 return '<h3>Customer sentiment at call close (model-inferred)</h3>'+
  '<p class="hint">Question: Did the customer leave the call happy?</p>'+
  '<p><b>'+esc(close.label)+'</b> · '+esc(close.reason)+'</p>'+speechEvidence(close.evidence)+
  '<h3>EQ look-fors · observational, not QA</h3>'+
  (highlights.length?highlights.map(item=>'<div class="issue"><b>'+esc(item.cue)+'</b><p>'+esc(item.note)+'</p>'+speechEvidence(item.evidence)+'</div>').join(""):'<p class="hint">No EQ highlights recorded for this interaction. This is not a negative finding or a QA assessment.</p>')+
  '<p class="hint">EQ cues are descriptive observations only. No weights, scores, pass/fail results or agent grades.</p>';
}
function conversationSignalsExport(i){
 const close=signals.customerClose(i),highlights=signals.eqHighlights(i);
 const quote=segment=>segment?'<p>Evidence · '+esc(timing.formatTimestamp(segment.startMs))+' – '+esc(timing.formatTimestamp(segment.endMs))+' · '+esc(segment.speaker)+': '+esc(segment.text)+'</p>':"";
 return '<h2>Customer closing sentiment (model-inferred)</h2><p>'+esc(close.label)+' — '+esc(close.reason)+'</p>'+quote(close.evidence)+
  '<h2>EQ observations (not QA scoring)</h2>'+(highlights.length?highlights.map(item=>'<p><b>'+esc(item.cue)+'</b>: '+esc(item.note)+'</p>'+quote(item.evidence)).join(""):'<p>No EQ observations recorded. No performance conclusion is implied.</p>');
}
function detail(i){
 if(tab==="summary"){
  return '<h3>Reason for contact</h3><p>'+esc(i.reason)+'</p><h3>Issues raised ('+i.issues.length+')</h3>'+
   (i.issues.map((o,n)=>'<div class="issue"><b>'+(n+1)+'. '+esc(o.name)+'</b><small>'+esc(o.status)+'</small></div>').join("")||'<p>Not yet available.</p>')+
   '<h3>Post-call summary</h3><p>'+esc(i.summary)+'</p><h3>Actions and next steps</h3><p>'+esc(i.actions)+' '+esc(i.next)+'</p>'+
   conversationSignalsHtml(i);
 }
 if(tab==="transcript"){
  const problem=transIssue(i);
  if(problem)return '<div class="empty">Transcript rejected: '+esc(problem.code)+' · '+esc(problem.message)+'</div>';
  return i.segments?.length?i.segments.map(segment=>'<div class="transcript-line"><header><span>'+esc(segment.speaker)+'</span><span>'+esc(timing.formatTimestamp(segment.startMs))+' – '+esc(timing.formatTimestamp(segment.endMs))+'</span></header><p>'+esc(segment.text)+'</p></div>').join(""):'<div class="empty">Transcript unavailable until processing completes.</div>';
 }
 const fields=tab==="metadata"?[
  ["Conversation ID",i.id],["Agent",i.agent],["Business unit",i.bu],["Brand",i.brand],
  ["Market",i.market],["Language",i.language],["Agent location",i.agentCountry],
  ["Caller country",i.callerCountry],["Duration",i.duration],["Timestamp requirement","Mandatory start/end per segment"],["CRM ticket",i.ticket||"Unmatched"],["Issue count",i.issues.length]
 ]:[
  ["Transcription",transStatus(i)],["Timestamp validation",i.trans==="completed"?(transIssue(i)?.code||"Passed"):"Pending completed transcript"],["Summarization",i.sum],["CRM update",i.crm],["CRM response",i.ack],
  ["Transcript S3 output (demo)",transStatus(i)==="completed"?"Ready to publish":"Not ready"],
  ["Summary S3 output (demo)",i.sum==="completed"&&transStatus(i)==="completed"?"Ready to publish":"Not ready"],
  ...(role==="admin"?[["Technical error",i.error||transIssue(i)?.code||"None"]]:[])
 ];
 if(i.manualRun)fields.push(
  ["Manual audio file",i.manualRun.fileName],["Manual run status",i.manualRun.status],
  ["Manual attempt",i.manualRun.attempt],["Manual processing",i.manualRun.message]
 );
 return fields.map(([k,v])=>'<div class="kv"><span>'+esc(k)+'</span><span>'+esc(v)+'</span></div>').join("");
}
function interactions(){let i=current();if(!i)return heading("Interactions","No available interactions.");let list=data.filter(x=>(role==="admin"||x.bu===leadBU)&&([x.id,x.agent,x.bu,x.brand,x.ticket||"",x.error].join(" ").toLowerCase().includes(query.toLowerCase()))&&(filter==="all"||(filter==="issues"&&!!x.error)||(filter==="ready"&&transStatus(x)==="completed")));let items=list.map(x=>'<button class="interaction-link '+(x.id===i.id?"active":"")+'" data-open="'+esc(x.id)+'"><span class="grow"><strong>'+esc(x.brand)+" · "+esc(x.agent)+'</strong><small>'+esc(x.id.slice(0,15))+' · '+esc(x.language)+'</small></span>'+tag(transStatus(x))+"</button>").join("");return heading(role==="admin"?"Interaction Explorer":"My BU Interactions","Transcripts, factual summaries, customer closing sentiment, non-scored EQ observations and CRM ticket references.")+'<div class="layout"><section class="card"><div class="card-head"><h2>Interactions</h2><span class="sub">'+list.length+' results</span></div><div class="toolbar"><input class="input" id="search" placeholder="Search conversation, agent, brand or ticket" value="'+esc(query)+'"/><select id="filter"><option value="all">All statuses</option><option value="issues" '+(filter==="issues"?"selected":"")+'>Needs attention</option><option value="ready" '+(filter==="ready"?"selected":"")+'>Completed transcripts</option></select></div><div class="interaction-list">'+(items||'<div class="empty">No matching interactions.</div>')+'</div></section><section class="card"><div class="detail-header"><strong>'+esc(i.brand)+" · "+esc(i.agent)+'</strong><div class="sub mono">'+esc(i.id)+'</div><div class="pill-group" style="margin-top:10px">'+tag(transStatus(i))+tag(i.sum)+tag(i.crm)+(i.manualRun?'<span class="tag info">Manual upload · '+esc(i.manualRun.status)+'</span>':"")+'</div></div><div class="tabs">'+[["summary","Summary"],["transcript","Full Transcript"],["metadata","Metadata"],["status","Processing Status"]].map(([k,n])=>'<button class="tab '+(tab===k?"active":"")+'" data-tab="'+k+'">'+n+"</button>").join("")+'</div><div class="detail-content">'+detail(i)+'<div class="downloads">'+btn("↓ Transcript .doc","export-transcript")+btn("↓ Summary .doc","export-summary")+(role==="admin"?btn("↓ JSON","export-json"):"")+'</div></div>'+(transStatus(i)==="failed"||i.sum==="failed"?'<div class="action-footer"><div><b>Manual recovery</b><div class="sub">Attach the original audio to stage a retry for this Conversation ID.</div></div>'+btn("↑ Upload audio to retry","manual-retry:"+i.id,"primary small")+'</div>':role==="admin"?'<div class="action-footer"><div><b>Admin investigation</b><div class="sub">'+esc(i.error||"No technical exception")+'</div></div>'+(i.ack==="failed"?btn("Reconcile CRM","reconcile","primary small"):i.crm==="unmatched"?btn("Review mapping","mapping","primary small"):btn("View diagnostics","diagnostics"))+'</div>':"")+"</section></div>";}
const field=(lab,key,val,opts)=>'<div class="field"><label>'+lab+'</label>'+(opts?'<select data-setting="'+key+'">'+opts.map(o=>'<option value="'+esc(o)+'" '+(o===val?"selected":"")+'>'+esc(o)+"</option>").join("")+"</select>":'<input data-setting="'+key+'" value="'+esc(val)+'"/>')+"</div>";

const connectionProfiles=JSON.parse(JSON.stringify(seed.connectionProfiles));
const serviceProfiles=JSON.parse(JSON.stringify(seed.serviceProfiles));
const connectionTests={};
const credentialDrafts={};
let selectedProfile={stt:"stt-main",sum:"sum-main"};
const configSections=[
 ["stt","Transcription Engine"],["sum","Summary Intelligence"],["genesys","Genesys Ingestion"],
 ["crm","CRM Ticket Updates"],["storage","Output Storage"],
 ["connections","Enterprise Connections"]
];
const fieldsBySection={
 stt:[["name","Connection name"],["service","API type / service"],["endpoint","API endpoint URL"],["model","Transcription model / deployment"],["auth","Authentication method"],["header","Credential header"],["secretRef","Vault secret reference"],["region","Region"],["healthPath","Health-check path"],["language","Languages (English / Arabic)"],["speakers","Speaker identification"],["timeout","Timeout (seconds)"],["retries","Retry attempts"]],
 sum:[["name","Connection name"],["service","API type / service"],["endpoint","API endpoint URL"],["model","Summary model / deployment"],["auth","Authentication method"],["header","Credential header"],["secretRef","Vault secret reference"],["region","Region"],["healthPath","Health-check path"],["language","Summary language"],["prompt","Prompt version"],["schema","Response schema"],["instructions","Summary extraction instructions"],["sentimentGuidance","Customer closing sentiment guidance"],["eqGuidance","EQ observational look-fors (not QA)"],["tokens","Max output tokens"],["timeout","Timeout (seconds)"],["retries","Retry attempts"]],
 genesys:[["name","Connection name"],["mode","Recording ingestion method"],["environment","Genesys organisation / environment"],["sourceBucket","Source S3 bucket"],["sourcePrefix","Recording object prefix"],["region","AWS region"],["queue","SQS event queue URL"],["auth","Authentication method"],["clientId","Client ID (if applicable)"],["secretRef","Vault / IAM reference"],["correlation","Genesys correlation field"]],
 crm:[["name","Connection name"],["system","CRM platform"],["endpoint","CRM base API URL"],["lookupPath","Ticket lookup by Genesys Conversation ID"],["updatePath","Post-call summary update API path"],["acknowledgePath","Update acknowledgment / reconciliation path"],["auth","Authentication method"],["clientId","OAuth client ID"],["secretRef","Vault secret reference"],["correlation","Conversation ID mapping field"],["policy","CRM acknowledgment policy"]],
 storage:[["name","Connection name"],["bucket","Destination S3 bucket"],["prefix","Root output folder"],["region","AWS region"],["folderPattern","Subfolder pattern"],["transcriptName","Full transcript Word filename"],["summaryName","Post-call summary Word filename"],["includeJSON","Machine-readable JSON output"],["encryption","Encryption"],["retention","Retention (days)"],["auth","Authentication method"],["secretRef","Vault / IAM reference"]]
};
const getConfig=()=>cfg==="stt"||cfg==="sum"?(serviceProfiles[cfg].find(p=>p.id===selectedProfile[cfg])||serviceProfiles[cfg][0]):connectionProfiles[cfg];
function config(){
 const active=getConfig();
 const tabs='<div class="config-tabs">'+configSections.map(([key,label])=>'<button data-cfg="'+key+'" class="'+(cfg===key?"active":"")+'">'+label+'</button>').join("")+'</div>';
 if(cfg==="connections"){
   const list=configSections.filter(x=>x[0]!=="connections").map(([key,label])=>{
     const p=(key==="stt"||key==="sum")?serviceProfiles[key].find(x=>x.active)||serviceProfiles[key][0]:connectionProfiles[key];
     const result=connectionTests[key];
     const currentStatus=result?(result.code==="200"?"healthy":"degraded"):"untested";
     return '<div class="mini-metric"><div class="flex" style="justify-content:space-between"><b>'+esc(label)+'</b>'+tag(currentStatus)+'</div><p class="hint">'+esc(p?.name||"Not configured")+'</p><div class="kv"><span>Endpoint / resource</span><span class="mono">'+esc(p?.endpoint||p?.sourceBucket||p?.bucket||"Not specified")+'</span></div><div class="kv"><span>Last check</span><span>'+esc(result?("Simulated HTTP "+result.code+" · "+result.time):"Not tested")+'</span></div>'+btn("Configure","section:"+key)+'</div>';
   }).join("");
   return heading("Enterprise Connections","Connection health is shown here after configuring each integration. All checks in this frontend are simulations, not real service probes.")+tabs+'<div class="grid2">'+list+'</div><div class="note">No connection is considered genuinely healthy until a backend verifies authentication, access, supported operations and a sample request. The Operations Console will show these untested statuses until verified.</div>';
 }
 const isLLM=cfg==="stt"||cfg==="sum";
 const profiles=isLLM?serviceProfiles[cfg]:[];
 const secretKey=cfg+":"+(active?.id||"main");
 const controls=fieldsBySection[cfg].map(([key,label])=>{
   const value=active?.[key]??"";
   const large=["instructions","sentimentGuidance","eqGuidance"].includes(key);
   const input=large?'<textarea rows="5" data-setting="'+cfg+'.'+key+'">'+esc(value)+'</textarea>':'<input data-setting="'+cfg+'.'+key+'" value="'+esc(value)+'" autocomplete="off"/>';
   return '<div class="field"><label>'+esc(label)+'</label>'+input+'</div>';
 }).join("");
 const authSection='<div class="credential-panel"><h3>Credentials & authentication</h3><p class="hint">For a real integration, credentials must be submitted to a secure backend and stored in Vault. This prototype never saves or sends the secret.</p><div class="form-grid"><div class="field"><label>API key / client secret (masked, session-only)</label><input id="credential-entry" type="password" placeholder="Enter key for secure backend connection" autocomplete="new-password" value=""/><small>Not saved to browser storage, GitHub or a service</small></div><div class="field"><label>Credential status</label><div class="health-box">'+(credentialDrafts[secretKey]?"Secret entered in this browser session · not connected":"No secret entered · Vault reference is configuration only")+'</div></div></div></div>';
 const test=connectionTests[cfg];
 const testState=test?(test.code==="200"?"healthy":"degraded"):"untested";
 const selector=isLLM?'<div class="profile-toolbar"><div class="field"><label>Configured service</label><select id="profile-select">'+profiles.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===selectedProfile[cfg]?"selected":"")+'>'+esc(p.name)+'</option>').join("")+'</select></div>'+btn("+ Add service","add-profile","small")+'</div>':"";
 const explanation=cfg==="storage"?'<div class="callout">This is the destination for generated full-transcript and CRM-summary Word documents and structured JSON. QA.MAFer.AI independently reads transcript JSON from S3 using read-only IAM access; no QA handoff API is needed. CRM receives the summary through its API. Raw Genesys recordings stay in the ingestion/source location. The folder pattern groups outputs by BU, brand, market, date and Genesys Conversation ID.</div>':cfg==="crm"?'<div class="callout">The CRM creates ticket IDs. The connector looks up the CRM ticket using the Genesys Conversation ID, posts the summary and confirms the update. Timeouts require reconciliation before retry.</div>':cfg==="genesys"?'<div class="callout">Configure the Genesys recording source and event queue. The Genesys Conversation ID remains the correlation key; a CRM ticket ID is not assumed to exist in Genesys.</div>':cfg==="sum"?'<div class="callout">The summarization engine produces factual CRM fields, customer sentiment at the end of the call, and optional non-scored EQ observations. Closing sentiment must rely on customer speech; EQ look-fors are descriptive, not QA scorecard criteria. Do not infer satisfaction solely from issue resolution or a polite goodbye.</div>':'<div class="callout">Configure an API endpoint, model and credentials for this engine independently. English/Arabic speech, speaker labels and mandatory start/end timestamps must be validated using real sample audio before a provider can be approved. Timestamps are a fixed output requirement, not a configurable toggle. Never place an API key in source code.</div>';
 return heading("Configuration Console","Add or edit your transcription and summary services, Genesys ingestion, CRM integration and output storage. Enterprise Connections is the final health overview.")+tabs+
 '<div class="layout"><section class="card"><div class="card-head"><div><h2>'+esc(configSections.find(x=>x[0]===cfg)[1])+' Configuration</h2><div class="sub">Editable integration settings · synthetic examples</div></div>'+tag(testState)+'</div><div class="form-section">'+selector+'<div class="form-grid">'+controls+'</div>'+authSection+explanation+'</div><div class="action-footer"><span class="hint">Drafts are non-secret browser settings only</span><div class="actions">'+btn("Save configuration","save-config")+btn("Test connection","test","primary small")+'</div></div></section><div><section class="card"><div class="card-head"><h2>Connection diagnostics</h2>'+tag(testState)+'</div><div class="form-section"><div class="health-box"><h3>'+(test?("Simulated HTTP "+test.code):"Not tested")+'</h3><p>'+esc(test?.message||"Configure this connection, then run a simulated test.")+'</p><p>Actual connectivity, authorization and credentials cannot be verified from this static prototype.</p></div><div class="field" style="margin-top:16px"><label>Simulated response code</label><select id="scenario">'+[["200","200 — Success"],["401","401 — Unauthorized"],["403","403 — Forbidden"],["429","429 — Rate limit"],["503","503 — Service unavailable"],["504","504 — Gateway timeout"]].map(([code,label])=>'<option value="'+code+'" '+(scenario===code?"selected":"")+'>'+label+'</option>').join("")+'</select></div><div style="margin-top:14px">'+btn("Run simulated check","test","primary small")+'</div></div></section><section class="card card-pad"><h2>Deployment boundary</h2><p class="hint">A secure backend must accept secrets over HTTPS, store them in corporate Vault, test each API and report real status codes. No API keys are sent by this browser mockup.</p><div class="callout">After configuring the services, open Enterprise Connections to review each service and its most recent test result.</div></section></div></div>';
}

function diagnostics(){let events=[["10:42","Transcription","HTTP 503","SERVICE_UNAVAILABLE",data[3].id],["10:38","Summarization","HTTP 429","QUOTA_OR_RATE_LIMIT",data[2].id],["10:29","CRM response","HTTP 504","RESPONSE_TIMEOUT",data[4].id],["10:21","CRM mapping","Internal","CRM_MAPPING_NOT_FOUND",data[1].id]];return heading("AI Usage & Diagnostics","Transcription minutes, LLM token usage, stage-specific failures and provider error codes.")+'<div class="grid4">'+card("Audio minutes","7,260","Synthetic metering")+card("LLM input","1.82M","Tokens · synthetic")+card("LLM output","310K","Tokens · synthetic")+card("Attention required",exceptions().length,"Current mockup exceptions")+'</div><div class="grid2"><div class="card"><div class="card-head"><h2>Token usage</h2></div><div class="bars">'+[[68,22],[84,30],[77,28],[95,35],[71,24]].map(v=>'<div class="bar-group"><span style="height:'+v[0]+'%"></span><span style="height:'+v[1]+'%"></span></div>').join("")+'</div><div class="axis"><span>08 Nov</span><span>09 Nov</span><span>10 Nov</span><span>11 Nov</span><span>12 Nov</span></div></div><div class="card card-pad"><h2>Observability requirements</h2><p class="hint">Log provider, stage, actual HTTP code, sanitized error body, request ID, retries, latency, audio minutes, model tokens, quota utilization and CRM acknowledgment status.</p><div class="callout">An unacknowledged CRM update requires reconciliation before retrying.</div></div></div><div class="card"><div class="card-head"><h2>Diagnostic event log</h2></div><div class="table-wrap"><table><thead><tr><th>Time</th><th>Stage</th><th>Response</th><th>Diagnostic</th><th>Action</th></tr></thead><tbody>'+events.map(e=>'<tr><td>'+e[0]+'</td><td>'+e[1]+'</td><td>'+e[2]+'</td><td>'+e[3]+'</td><td>'+btn("Investigate","open:"+e[4])+"</td></tr>").join("")+"</tbody></table></div></div>";}
function toast(msg){let t=document.querySelector("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(window.__tid);window.__tid=setTimeout(()=>t.classList.remove("show"),3500);}
function render(){
 const leadPages=["interactions","manual"];
 if(role==="lead"&&!leadPages.includes(page))page="interactions";
 const nav=role==="admin"?[
  ["operations","▦","Operations Console"],["manual","↑","Manual Audio Upload"],
  ["interactions","◉","Interaction Explorer"],
  ["config","⚙","Config Console"],["diagnostics","◷","AI Usage & Diagnostics"]
 ]:[
  ["interactions","◉","My BU Interactions"],["manual","↑","Manual Audio Upload"],
  
 ];
 document.querySelector("#nav").innerHTML=nav.map(([key,icon,name])=>
  
  '<button class="nav-item '+(page===key?"active":"")+'" data-nav="'+key+'"><i>'+icon+"</i>"+name+"</button>"
 ).join("");
 const labels={operations:"Operations Console",manual:"Manual Audio Upload",interactions:"Interaction Explorer",
  config:"Config Console",diagnostics:"AI Usage & Diagnostics"};
 document.querySelector("#crumb").textContent=labels[page];
 const views={operations,manual:()=>window.MAFerManualAudio.render(role,data,leadBU),interactions,
  config,diagnostics};
 document.querySelector("#app").innerHTML=views[page]();
 document.querySelector("#role").value=role==="lead"?"lead-"+leadBU:"admin";
 document.querySelector("#sidebar").classList.remove("open");
}
function exportSample(kind){
 const i=current();
 if(kind==="export-json"){
  if(role!=="admin")return toast("JSON export is restricted to Platform Admin.");
  const blob=new Blob([JSON.stringify(i,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="sample_"+i.id+".json";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  return;
 }
 if(kind==="export-transcript"&&transStatus(i)!=="completed")return toast("Transcript requires validated start/end timestamps before export.");
 if(kind==="export-summary"&&(i.sum!=="completed"||transStatus(i)!=="completed"))return toast("Summary export requires a completed, timestamp-validated transcript.");
 const metadata="<p><b>Genesys Conversation ID:</b> "+esc(i.id)+"<br><b>CRM Ticket:</b> "+esc(i.ticket||"Not matched")+"<br><b>Agent:</b> "+esc(i.agent)+"<br><b>Business unit / brand:</b> "+esc(i.bu)+" / "+esc(i.brand)+"<br><b>Language:</b> "+esc(i.language)+"</p>";
 const transcript=(i.segments||[]).map(segment=>"<p><b>"+esc(timing.formatTimestamp(segment.startMs))+" – "+esc(timing.formatTimestamp(segment.endMs))+" · "+esc(segment.speaker)+":</b> "+esc(segment.text)+"</p>").join("");
 const summary="<h2>Reason for contact</h2><p>"+esc(i.reason)+"</p><h2>Customer issues ("+i.issues.length+")</h2><ul>"+i.issues.map(x=>"<li>"+esc(x.name)+" — "+esc(x.status)+"</li>").join("")+"</ul><h2>Post-call summary</h2><p>"+esc(i.summary)+"</p>"+conversationSignalsExport(i);
 const title=kind==="export-transcript"?"Full Interaction Transcript":"CRM Post-call Summary";
 const html="<html><head><meta charset='utf-8'></head><body><h1>"+title+"</h1>"+metadata+(kind==="export-transcript"?transcript:summary)+"<p><small>SYNTHETIC PROTOTYPE DOCUMENT. Production will generate native DOCX. This document is a transcription/summary artifact, not a QA assessment.</small></p></body></html>";
 const blob=new Blob(["\ufeff",html],{type:"application/msword"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=(kind==="export-transcript"?"transcript":"summary")+".doc";a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function act(a){
 if(a.startsWith("open:")){
  const id=a.slice(5),i=data.find(x=>x.id===id);
  if(!i||(role==="lead"&&i.bu!==leadBU))return toast("Access denied.");
  selected=id;tab="summary";page="interactions";render();return;
 }
 if(a.startsWith("export-"))return exportSample(a);
 if(a==="manual"){page="manual";render();return;}
 if(a.startsWith("manual-retry:")){
  const result=window.MAFerManualAudio.prefillRetry(a.slice("manual-retry:".length),role,data,leadBU);
  if(result.render){page="manual";render();}
  if(result.message)toast(result.message);
  return;
 }
 if(a==="config"||a==="diagnostics"){if(role==="admin"){page=a;render();}return;}
 if(role!=="admin")return toast("Admin access required.");
 const i=current();
 if(a.startsWith("section:")){cfg=a.slice(8);scenario="200";page="config";render();return;}
if(a==="add-profile"){
 if(cfg!=="stt"&&cfg!=="sum")return;
 const copy=JSON.parse(JSON.stringify(getConfig()));
 copy.id=cfg+"-"+Date.now().toString(36);copy.name="New "+(cfg==="stt"?"Transcription":"Summary")+" Service";copy.active=false;copy.endpoint="";copy.model="";copy.secretRef="";
 serviceProfiles[cfg].push(copy);selectedProfile[cfg]=copy.id;delete connectionTests[cfg];render();toast("New service created. Enter connection details.");return;
}
if(a==="simulate"){let n=data.length+1;data.unshift({...JSON.parse(JSON.stringify(seed.interactions[5])),id:"00000000-0000-4000-8000-"+String(n).padStart(12,"0"),agent:"Demo Agent "+n});toast("New sample call added; speech-to-text in progress.");render();}
else if(a==="test"){const messages={"200":"Simulated connection accepted","401":"Authentication failed","403":"Permission denied","429":"Quota or rate limit","503":"Service unavailable","504":"Gateway timeout; outcome uncertain"};connectionTests[cfg]={code:scenario,message:messages[scenario],time:"Current session"};toast("Simulation only: HTTP "+scenario+" · "+messages[scenario]);render();}
else if(a==="save-config"){
 try{
  const safeServices=JSON.parse(JSON.stringify(serviceProfiles));
  const safeConnections=JSON.parse(JSON.stringify(connectionProfiles));
  localStorage.setItem("mafer-audio-config-v2",JSON.stringify({serviceProfiles:safeServices,connectionProfiles:safeConnections}));
  toast("Non-secret configuration saved in this browser. Credentials were not saved.");
 }catch{toast("Unable to save draft in this browser.");}
}
else if(a==="publish"){toast("Production publishing requires a secure backend.");}
else if(a==="retry"){if(transStatus(i)==="failed")i.trans="processing";else if(i.sum==="failed")i.sum="processing";i.error="";toast("Simulated safe retry queued.");render();}else if(a==="mapping")toast("Ticket mapping must come from CRM/CTI; never guess a ticket.");else if(a==="reconcile")toast("CRM outcome must be reconciled before retrying a ticket update.");}
document.addEventListener("click",e=>{
 const manual=e.target.closest("[data-manual-action]");
 if(manual){
  if(page!=="manual")return;
  const action=manual.dataset.manualAction;
  if(action==="clear"){window.MAFerManualAudio.reset();render();toast("Manual upload form cleared.");return;}
  if(action==="stage"){
   const result=window.MAFerManualAudio.stageRun(role,data,leadBU);
   if(result.id)selected=result.id;
   if(result.render)render();
   if(result.message)toast(result.message);
   return;
  }
  if(action==="submit"){
   const request=window.MAFerManualAudio.submit(role,data,leadBU);
   render();
   request.then(result=>{
    if(result.render)render();
    if(result.message)toast(result.message);
   }).catch(()=>toast("Manual processing request failed."));
   return;
  }
  if(action==="open"){page="interactions";tab="summary";render();return;}
 }
 const n=e.target.closest("[data-nav]"),a=e.target.closest("[data-action]"),
       o=e.target.closest("[data-open]"),t=e.target.closest("[data-tab]"),
       c=e.target.closest("[data-cfg]");
 if(n){page=n.dataset.nav;render();}
 else if(a)act(a.dataset.action);
 else if(o)act("open:"+o.dataset.open);
 else if(t){tab=t.dataset.tab;render();}
 else if(c){cfg=c.dataset.cfg;scenario="200";render();}
});
document.addEventListener("change",e=>{
 const t=e.target;
 if(t.id==="manual-file"&&page==="manual"){
  const result=window.MAFerManualAudio.chooseFile(t.files?.[0]);
  if(result.render)render();
  if(result.message)toast(result.message);
  return;
 }
 if(t.dataset.manualField&&page==="manual"){
  const result=window.MAFerManualAudio.update(t.dataset.manualField,t.value,role,data,leadBU);
  if(result.render)render();
  if(result.message)toast(result.message);
  return;
 }
 if(t.id==="role"){
  const next=String(t.value||"");
  if(next==="admin")role="admin";
  else if(next.startsWith("lead-")&&["VOX","SHARE","AMBU","Retail"].includes(next.slice(5))){
   role="lead";leadBU=next.slice(5);
  }else return;
  window.MAFerManualAudio.reset();
  query="";filter="all";tab="summary";
  page=role==="lead"?"interactions":"operations";
  selected=role==="lead"?(data.find(i=>i.bu===leadBU)?.id||""):data[0]?.id||"";
  render();
 }
 else if(t.id==="filter"){filter=t.value;render();}
 else if(t.id==="scenario")scenario=t.value;
 else if(t.id==="profile-select"){selectedProfile[cfg]=t.value;render();}
 else if(t.id==="credential-entry"){credentialDrafts[cfg+":"+(getConfig()?.id||"main")]=t.value?"entered":"";t.value="";render();}
 else if(t.dataset.setting){let parts=t.dataset.setting.split(".");let obj=(parts[0]==="stt"||parts[0]==="sum")?getConfig():connectionProfiles[parts[0]];if(obj){obj[parts[1]]=t.value;delete connectionTests[cfg];}}
});
document.addEventListener("input",e=>{
 const t=e.target;
 if(t.dataset.manualField&&page==="manual"){
  window.MAFerManualAudio.update(t.dataset.manualField,t.value,role,data,leadBU);
  return;
 }
 if(t.id==="search"){
  query=t.value;const p=t.selectionStart;render();
  const input=document.querySelector("#search");
  if(input){input.focus();input.setSelectionRange(p,p);}
 }
});
document.querySelector("#menu").addEventListener("click",()=>document.querySelector("#sidebar").classList.toggle("open"));
try{let s=JSON.parse(localStorage.getItem("mafer-audio-config-v2")||"null");if(s?.serviceProfiles?.stt&&s?.serviceProfiles?.sum){Object.assign(serviceProfiles,s.serviceProfiles);Object.assign(connectionProfiles,s.connectionProfiles);}}catch(e){}
render();
})();