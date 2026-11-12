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
 window:{},
 document:{
  querySelector(id){return elements.get(id)||null;},
  addEventListener(name,handler){listeners[name]=handler;},
  createElement(){return {click(){}};}
 },
 localStorage:{getItem(k){return store.get(k)||null;},setItem(k,v){store.set(k,String(v));}},
 setTimeout(){return 1;},clearTimeout(){},
 console
});
for(const file of ["sample-data.js","frameworks.js","app.js"]){
 vm.runInContext(fs.readFileSync(file,"utf8"),context,{filename:file});
}
const app=()=>elements.get("#app").innerHTML;
const nav=()=>elements.get("#nav").innerHTML;
const fw=context.window.MAFerFrameworks;
assert.ok(app().includes("Operations Console"),"Operations Console should render");
assert.ok(nav().includes("Agent EQ Framework"),"Admin EQ navigation");
assert.ok(nav().includes("Problem-Solving Framework"),"Admin reasoning navigation");
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
listeners.change({target:{id:"role",value:"lead",dataset:{}}});
assert.ok(!nav().includes("Agent EQ Framework"),"BU Lead cannot navigate to framework config");
assert.ok(!app().includes("↓ JSON"),"BU Lead JSON export hidden");
assert.ok(app().includes("Framework-based agent observations"),"BU Lead can view evidence");
console.log("Smoke tests passed: startup, EQ, reasoning, bilingual evidence, versions, BU overrides, permissions.");
})();
