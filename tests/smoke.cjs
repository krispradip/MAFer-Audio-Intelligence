(function smokeTests(){
"use strict";
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const elements=new Map(["#app","#nav","#crumb","#role","#sidebar","#menu","#toast"].map(id=>[id,{
 innerHTML:"",textContent:"",value:"",
 classList:{add(){},remove(){},toggle(){}},
 addEventListener(){}
}]));
const listeners={};
const store=new Map();
const context=vm.createContext({
 window:{URL:{createObjectURL(){return "blob:demo-preview";},revokeObjectURL(){}}},
 document:{
  querySelector(id){return elements.get(id)||null;},
  addEventListener(name,handler){listeners[name]=handler;},
  createElement(){return {click(){}};}
 },
 localStorage:{getItem(k){return store.get(k)||null;},setItem(k,v){store.set(k,String(v));}},
 setTimeout(){return 1;},clearTimeout(){},
 console
});
for(const file of ["sample-data.js","transcript-contract.js","conversation-signals.js","manual-audio.js","app.js"]){
 vm.runInContext(fs.readFileSync(file,"utf8"),context,{filename:file});
}
const app=()=>elements.get("#app").innerHTML;
const nav=()=>elements.get("#nav").innerHTML;
assert.ok(app().includes("Operations Console"),"Operations Console should render");
assert.ok(nav().includes("Intelligence Configuration"),"Admin intelligence navigation");
assert.ok(nav().includes("Manual Audio Upload"),"Admin manual audio navigation");
assert.ok(!nav().includes("Agent EQ Framework"),"No EQ framework in audio navigation");
assert.ok(!nav().includes("Problem-Solving Framework"),"No problem-solving scoring framework in audio navigation");
assert.ok(!("frameworkEvidence" in context.window.SEED.interactions[0]),"Audio records exclude QA evidence");
assert.ok(!("eq" in context.window.SEED.interactions[0]),"Audio records exclude EQ scores");
assert.ok(!("reasoning" in context.window.SEED.interactions[0]),"Audio records exclude reasoning scores");
assert.ok(context.window.SEED.serviceProfiles.sum[0].instructions.includes("optional non-scored observations"),"Summary prompt treats EQ as non-scored look-fors");
function clickNav(id){
 listeners.click({target:{closest(sel){return sel==="[data-nav]"?{dataset:{nav:id}}:null;}}});
}
clickNav("intelligence");
assert.ok(app().includes("Speech-to-Text"),"Transcription configuration visible");
assert.ok(app().includes("Timestamp policy"),"Mandatory timestamp policy shown");
assert.ok(app().includes("Mandatory — start/end per segment"),"Timestamp requirement is non-optional");
assert.ok(app().includes("CRM Summary Intelligence"),"Summary configuration visible");
assert.ok(app().includes("Did the customer leave the call happy?"),"Sentiment asks only about customer outcome at close");
assert.ok(app().includes("EQ look-fors"),"EQ cues are visible as non-QA observations");
assert.ok(app().includes("Prompt version"),"Summary prompt version visible");
assert.ok(!app().includes("secretRef"),"No secret reference in intelligence view");
assert.ok(!app().includes("https://stt-demo.example.invalid"),"No API endpoint exposed");
assert.ok(!app().includes("Require direct dialogue quote"),"QA evidence rules absent");
clickNav("config");
assert.ok(app().includes("Configuration Console"),"Admin retains technical configuration editor");
clickNav("interactions");
assert.ok(app().includes("Customer sentiment at call close"),"Customer closing sentiment appears in summary");
assert.ok(app().includes("Unhappy"),"Explicit customer dissatisfaction shown");
assert.ok(app().includes("06:30 – 06:38"),"Closing sentiment evidence is timestamped");
assert.ok(app().includes("EQ look-fors · observational, not QA"),"EQ observations are non-scored");
assert.ok(app().includes("Emotional acknowledgement"),"Observed EQ cue appears");
assert.ok(!app().includes("QA score"),"No QA score in interaction summary");
assert.ok(app().includes("↓ JSON"),"Admin JSON export available");
listeners.click({target:{closest(sel){return sel==="[data-tab]"?{dataset:{tab:"transcript"}}:null;}}});
assert.ok(app().includes("00:05 – 00:12"),"Transcript displays start and end timestamps");
assert.ok(app().includes("00:16 – 00:26"),"Second segment has time range");
listeners.change({target:{id:"role",value:"lead-VOX",dataset:{}}});
assert.ok(nav().includes("Intelligence Configuration"),"BU Lead processing config visible");
assert.ok(nav().includes("Manual Audio Upload"),"BU Lead manual audio navigation visible");
assert.ok(!nav().includes("Config Console"),"BU Lead technical configuration hidden");
assert.ok(!nav().includes("Agent EQ Framework"),"BU Lead does not see EQ rubric");
assert.ok(!nav().includes("Problem-Solving Framework"),"BU Lead does not see QA problem-solving rubric");
assert.ok(!app().includes("↓ JSON"),"BU Lead JSON export hidden");
clickNav("intelligence");
assert.ok(app().includes("VOX BU view"),"VOX Lead sees BU context");
assert.ok(app().includes("Speech-to-Text"),"BU Lead sees transcription engine");
assert.ok(app().includes("CRM Summary Intelligence"),"BU Lead sees summarization engine");
assert.ok(!app().includes("API endpoint URL"),"BU Lead cannot inspect integration endpoint");
assert.ok(!app().includes("Credential header"),"BU Lead cannot inspect credential configuration");
assert.ok(!app().includes('data-setting='),"BU Lead config is read-only");
clickNav("manual");
assert.ok(app().includes('id="manual-file"'),"Manual audio input renders");
assert.ok(app().includes("VOX · Your business unit"),"Lead upload scoped to VOX");
const manual=context.window.MAFerManualAudio;
assert.match(manual.chooseFile({name:"notes.txt",size:500,type:"text/plain"}).message,/Unsupported/);
assert.match(manual.chooseFile({name:"huge.wav",size:60*1024*1024,type:"audio/wav"}).message,/50 MB/);
const sampleAudio={name:"vox-demo.wav",size:102400,type:"audio/wav"};
listeners.change({target:{id:"manual-file",files:[sampleAudio],dataset:{}}});
assert.ok(app().includes("blob:demo-preview"),"Selected audio preview shown");
function manualClick(action){
 listeners.click({target:{closest(sel){return sel==="[data-manual-action]"?{dataset:{manualAction:action}}:null;}}});
}
manualClick("stage");
assert.ok(app().includes("Staged locally"),"Manual audio staged in browser");
manualClick("open");
assert.ok(app().includes("Manual upload"),"Manual interaction visible in Explorer");
listeners.click({target:{closest(sel){return sel==="[data-tab]"?{dataset:{tab:"transcript"}}:null;}}});
assert.ok(app().includes("Transcript unavailable"),"Manual upload does not invent a transcript");
const failedVox="e812a492-206c-4d32-86cd-a0f000000004";
listeners.click({target:{closest(sel){return sel==="[data-open]"?{dataset:{open:failedVox}}:null;}}});
assert.ok(app().includes("Upload audio to retry"),"Failed interaction offers manual retry");
listeners.click({target:{closest(sel){return sel==="[data-action]"?{dataset:{action:"manual-retry:"+failedVox}}:null;}}});
assert.ok(app().includes("Retrying"),"Retry mode prefilled");
listeners.change({target:{id:"manual-file",files:[sampleAudio],dataset:{}}});
manualClick("stage");
assert.ok(app().includes(failedVox),"Retry retains Genesys Conversation ID");
assert.ok(app().includes("Staged locally"),"Retry staged without false success");
listeners.change({target:{id:"role",value:"lead-SHARE",dataset:{}}});
assert.ok(app().includes("SHARE Loyalty"),"SHARE lead sees SHARE interactions");
assert.ok(!app().includes("VOX Cinemas"),"SHARE lead cannot see VOX interactions");
clickNav("intelligence");
assert.ok(app().includes("SHARE BU view"),"SHARE Lead sees SHARE processing context");
assert.ok(app().includes("Speech-to-Text"),"SHARE Lead sees configured transcription engine");
assert.ok(!app().includes("Empathy in VOX"),"No cross-BU EQ content");
clickNav("manual");
assert.ok(app().includes("SHARE · Your business unit"),"SHARE lead manual upload scoped to SHARE");
listeners.change({target:{id:"manual-file",files:[sampleAudio],dataset:{}}});
manualClick("stage");
assert.ok(app().includes("Staged locally"),"SHARE lead can stage a SHARE recording");
manualClick("open");
assert.ok(app().includes("Manual upload"),"SHARE manual interaction visible");
listeners.click({target:{closest(sel){return sel==="[data-open]"?{dataset:{open:failedVox}}:null;}}});
assert.equal(elements.get("#toast").textContent,"Access denied.","Cross-BU interaction access blocked");
console.log("Smoke tests passed: mandatory segment timestamps, QA separation, read-only BU configuration, BU permissions and manual recovery.");
})();
