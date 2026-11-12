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
assert.ok(!nav().includes("Intelligence Configuration"),"No business intelligence configuration screen");
assert.ok(nav().includes("Manual Audio Upload"),"Admin manual upload navigation");
assert.ok(!nav().includes("Agent EQ Framework"),"No EQ framework");
assert.ok(!nav().includes("Problem-Solving Framework"),"No problem-solving QA framework");
assert.ok(!("frameworkEvidence" in context.window.SEED.interactions[0]),"Audio records exclude QA evidence");
assert.ok(!("eqHighlights" in context.window.SEED.interactions[0]),"No EQ rubric highlights");
assert.ok(context.window.MAFerSignals.FIXED_INSTRUCTIONS.includes("Do not produce QA criteria"),"Fixed contract excludes QA");
assert.ok(context.window.MAFerSignals.CATEGORIES.emotionalIndicators.includes("Frustration"),"Fixed emotional indicator category");
function clickNav(id){
 listeners.click({target:{closest(sel){return sel==="[data-nav]"?{dataset:{nav:id}}:null;}}});
}
clickNav("config");
assert.ok(app().includes("Configuration Console"),"Admin retains technical configuration");
listeners.click({target:{closest(sel){return sel==="[data-cfg]"?{dataset:{cfg:"sum"}}:null;}}});
assert.ok(app().includes("Fixed output contract v3.0"),"Fixed extraction contract is visible");
assert.ok(!app().includes('data-setting="sum.instructions"'),"No editable summary instructions");
assert.ok(!app().includes('data-setting="sum.eqGuidance"'),"No editable EQ guidance");
assert.ok(!app().includes('data-setting="sum.sentimentGuidance"'),"No editable sentiment rules");
assert.ok(app().includes("Summary model / deployment"),"Provider model remains configurable");
clickNav("interactions");
assert.ok(app().includes("Customer sentiment at call close"),"Customer closing sentiment appears in summary");
assert.ok(app().includes("Unhappy"),"Explicit customer dissatisfaction shown");
assert.ok(app().includes("06:30 – 06:38"),"Closing sentiment evidence is timestamped");
assert.ok(app().includes("Emotional indicators"),"Fixed emotional indicator section");
assert.ok(app().includes("Frustration"),"Explicit customer frustration has transcript evidence");
assert.ok(app().includes("Conversation signals"),"Fixed conversation signal section");
assert.ok(app().includes("Interaction references"),"Fixed interaction references section");
assert.ok(app().includes("Commitment"),"Agent commitment preserved as reference, not verified action");
assert.ok(!app().includes("EQ look-fors"),"No EQ rubric in summary");
assert.ok(app().includes("↓ JSON"),"Admin JSON export available");
listeners.click({target:{closest(sel){return sel==="[data-tab]"?{dataset:{tab:"transcript"}}:null;}}});
assert.ok(app().includes("00:05 – 00:12"),"Transcript displays start and end timestamps");
assert.ok(app().includes("00:16 – 00:26"),"Second segment has time range");
listeners.change({target:{id:"role",value:"lead-VOX",dataset:{}}});
assert.ok(!nav().includes("Intelligence Configuration"),"BU Lead has no intelligence config screen");
assert.ok(nav().includes("Manual Audio Upload"),"BU Lead manual audio upload visible");
assert.ok(!nav().includes("Config Console"),"BU Lead technical configuration hidden");
assert.ok(!app().includes("↓ JSON"),"BU Lead JSON export hidden");
assert.ok(app().includes("Emotional indicators"),"BU Lead sees fixed outputs");
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
assert.ok(app().includes("Customer sentiment at call close"),"SHARE lead sees sentiment outcome");
assert.ok(!nav().includes("Intelligence Configuration"),"SHARE lead has no unnecessary config");
clickNav("manual");
assert.ok(app().includes("SHARE · Your business unit"),"SHARE lead manual upload scoped to SHARE");
listeners.change({target:{id:"manual-file",files:[sampleAudio],dataset:{}}});
manualClick("stage");
assert.ok(app().includes("Staged locally"),"SHARE lead can stage a SHARE recording");
manualClick("open");
assert.ok(app().includes("Manual upload"),"SHARE manual interaction visible");
listeners.click({target:{closest(sel){return sel==="[data-open]"?{dataset:{open:failedVox}}:null;}}});
assert.equal(elements.get("#toast").textContent,"Access denied.","Cross-BU interaction access blocked");
console.log("Smoke tests passed: fixed outputs, mandatory timestamps, no EQ config, BU permissions and manual recovery.");
})();
