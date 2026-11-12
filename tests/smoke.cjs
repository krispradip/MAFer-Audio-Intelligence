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
for(const file of ["sample-data.js","frameworks.js","manual-audio.js","app.js"]){
 vm.runInContext(fs.readFileSync(file,"utf8"),context,{filename:file});
}
const app=()=>elements.get("#app").innerHTML;
const nav=()=>elements.get("#nav").innerHTML;
const fw=context.window.MAFerFrameworks;
assert.ok(app().includes("Operations Console"),"Operations Console should render");
assert.ok(nav().includes("Agent EQ Framework"),"Admin EQ navigation");
assert.ok(nav().includes("Problem-Solving Framework"),"Admin reasoning navigation");
assert.ok(nav().includes("Manual Audio Upload"),"Admin manual audio navigation");
assert.ok(fw.render("eq").includes("Empathy &amp; acknowledgement"),"EQ dimension appears");
assert.ok(fw.render("problem").includes("Diagnostic questioning"),"Reasoning dimension appears");
assert.ok(fw.render("eq").includes("English + Arabic"),"Bilingual policy appears");
assert.ok(fw.renderObservations(context.window.SEED.interactions[1]).includes("أكيد"),"Arabic evidence appears");
assert.ok(fw.renderObservations(context.window.SEED.interactions[0]).includes("v1.0"),"Pinned version appears");
const changed=fw.change("eq",{dataset:{fwField:"instructions"},value:"Updated baseline instruction. Cite original-language evidence.",type:"textarea"});
assert.equal(changed.render,false);
const published=fw.action("eq","publish");
assert.match(published.message,/v1\.1/);
assert.ok(fw.render("eq").includes("v1.1"),"Published baseline increments version");
assert.ok(store.has("mafer-audio-framework-config-v1"),"Versioned framework stored locally");
const persisted=JSON.parse(store.get("mafer-audio-framework-config-v1"));
assert.ok(persisted.eq["All BUs"].history[0].snapshot.dimensions.length>0,"Published version has a retained snapshot");
fw.change("eq",{dataset:{fwField:"instructions"},value:"UNPUBLISHED_BASELINE_DRAFT",type:"textarea"});
fw.change("eq",{id:"fw-scope",value:"VOX"});
assert.ok(!fw.render("eq").includes("UNPUBLISHED_BASELINE_DRAFT"),"BU inheritance uses published baseline, not unpublished edits");
assert.ok(fw.render("eq").includes("Create VOX override"),"BU inherits baseline until override");
const override=fw.action("eq","override");
assert.equal(override.render,true);
fw.change("eq",{dataset:{fwField:"dimensions.0.name"},value:"UNPUBLISHED_VOX_DRAFT",type:"text"});
assert.ok(!fw.render("eq",{role:"lead",bu:"VOX"}).includes("UNPUBLISHED_VOX_DRAFT"),"Lead cannot see unpublished BU override");
fw.change("eq",{dataset:{fwField:"dimensions.0.name"},value:"Empathy in VOX",type:"text"});
const buPublished=fw.action("eq","publish");
assert.match(buPublished.message,/v1\.0/);
assert.ok(fw.render("eq").includes("Empathy in VOX"),"BU-specific dimension edited");
fw.change("eq",{id:"fw-scope",value:"All BUs"});
assert.ok(fw.render("eq").includes("Empathy &amp; acknowledgement"),"Baseline not overwritten by BU override");
function clickNav(id){
 listeners.click({target:{closest(sel){return sel==="[data-nav]"?{dataset:{nav:id}}:null;}}});
}
clickNav("eq-framework");
assert.ok(app().includes("Framework settings"),"EQ page routed");
clickNav("problem-framework");
assert.ok(app().includes("Problem-Solving Framework"),"Problem-solving page routed");
clickNav("interactions");
assert.ok(app().includes("Framework-based agent observations"),"Interaction evidence rendered");
assert.ok(app().includes("↓ JSON"),"Admin JSON export available");
listeners.change({target:{id:"role",value:"lead-VOX",dataset:{}}});
assert.ok(nav().includes("Agent EQ Framework"),"BU Lead EQ navigation visible");
assert.ok(nav().includes("Problem-Solving Framework"),"BU Lead problem-solving navigation visible");
assert.ok(nav().includes("Manual Audio Upload"),"BU Lead manual audio navigation visible");
assert.ok(!nav().includes("Config Console"),"BU Lead technical configuration hidden");
assert.ok(!app().includes("↓ JSON"),"BU Lead JSON export hidden");
assert.ok(app().includes("Framework-based agent observations"),"BU Lead can view evidence");
clickNav("eq-framework");
assert.ok(app().includes("Empathy in VOX"),"Lead sees published BU EQ override");
assert.ok(!app().includes('data-fw-action="publish"'),"Lead cannot publish frameworks");
assert.ok(!app().includes('id="fw-scope"'),"Lead cannot switch BU scope");
clickNav("problem-framework");
assert.ok(app().includes("Diagnostic questioning"),"Lead sees problem-solving framework");
assert.ok(!app().includes('data-fw-action="override"'),"Lead cannot create override");
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
clickNav("eq-framework");
assert.ok(app().includes("SHARE · Your business unit"),"SHARE lead sees SHARE framework scope");
assert.ok(!app().includes("Empathy in VOX"),"SHARE lead does not see VOX override");
clickNav("manual");
assert.ok(app().includes("SHARE · Your business unit"),"SHARE lead manual upload scoped to SHARE");
listeners.change({target:{id:"manual-file",files:[sampleAudio],dataset:{}}});
manualClick("stage");
assert.ok(app().includes("Staged locally"),"SHARE lead can stage a SHARE recording");
manualClick("open");
assert.ok(app().includes("Manual upload"),"SHARE manual interaction visible");
listeners.click({target:{closest(sel){return sel==="[data-open]"?{dataset:{open:failedVox}}:null;}}});
assert.equal(elements.get("#toast").textContent,"Access denied.","Cross-BU interaction access blocked");
console.log("Smoke tests passed: navigation, bilingual evidence, versioned frameworks, multi-BU permissions, manual upload and retry.");
})();
