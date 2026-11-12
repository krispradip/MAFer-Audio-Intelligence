(async function manualAudioTests(){
"use strict";
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
let submitted=null,revoked=0,requests=0;
const window={
 URL:{createObjectURL:()=> "blob:synthetic-audio",revokeObjectURL:()=>{revoked++;}},
 MAFER_MANUAL_AUDIO_API_ENABLED:false,
 FormData:class{constructor(){this.fields=[];}append(...args){this.fields.push(args);}},
 fetch:async(url,opts)=>{requests++;submitted={url,opts};return {ok:true,status:202,json:async()=>({jobId:"demo-job-123",status:"queued"})};}
};
const context=vm.createContext({window,console});
vm.runInContext(fs.readFileSync("sample-data.js","utf8"),context,{filename:"sample-data.js"});
vm.runInContext(fs.readFileSync("manual-audio.js","utf8"),context,{filename:"manual-audio.js"});
const manual=window.MAFerManualAudio,data=JSON.parse(JSON.stringify(window.SEED.interactions));
const audio={name:"synthetic-call.wav",type:"audio/wav",size:2048};
assert.match(manual.chooseFile({name:"bad.txt",type:"text/plain",size:50}).message,/Unsupported/);
assert.match(manual.chooseFile({name:"huge.wav",type:"audio/wav",size:51*1024*1024}).message,/50 MB/);
assert.equal(manual.chooseFile(audio).render,true);
assert.ok(manual.render("lead",data).includes("VOX · Your business unit"));
const newRun=manual.stageRun("lead",data);
assert.equal(newRun.render,true);
assert.equal(data[0].bu,"VOX");
assert.equal(data[0].trans,"waiting");
assert.equal(data[0].lines.length,0);
assert.equal(data[0].manualRun.status,"staged");
const blocked=await manual.submit("lead",data);
assert.match(blocked.message,/not connected/);
assert.equal(requests,0,"No audio transmitted when backend is disabled");
window.MAFER_MANUAL_AUDIO_API_ENABLED=true;
const accepted=await manual.submit("lead",data);
assert.equal(accepted.render,true);
assert.equal(submitted.url,"/api/manual-audio/jobs");
assert.equal(submitted.opts.method,"POST");
assert.equal(submitted.opts.mode,"same-origin");
assert.equal(submitted.opts.credentials,"same-origin");
assert.equal(data[0].manualRun.status,"queued");
assert.equal(data[0].trans,"waiting","Backend acknowledgment must not fake transcription completion");
assert.equal(data[0].lines.length,0);
const failedVox=data.find(i=>i.id.endsWith("0004")),failedOther=data.find(i=>i.id.endsWith("0003"));
const before=JSON.stringify({id:failedVox.id,trans:failedVox.trans,sum:failedVox.sum,lines:failedVox.lines});
assert.equal(manual.prefillRetry(failedVox.id,"lead",data).render,true);
assert.equal(manual.stageRun("lead",data).render,undefined,"A fresh file is required after selecting a retry");
manual.chooseFile(audio);
const retry=manual.stageRun("lead",data);
assert.equal(retry.id,failedVox.id);
assert.equal(before,JSON.stringify({id:failedVox.id,trans:failedVox.trans,sum:failedVox.sum,lines:failedVox.lines}));
assert.equal(failedVox.manualRun.status,"staged");
assert.ok(!manual.prefillRetry(failedOther.id,"lead",data).render,"BU Lead cannot retry another BU");
manual.reset();
assert.ok(manual.render("lead",data,"SHARE").includes("SHARE · Your business unit"));
manual.chooseFile(audio);
const shareRun=manual.stageRun("lead",data,"SHARE");
assert.equal(shareRun.render,true);
assert.equal(data[0].bu,"SHARE","SHARE BU Lead can only create SHARE interactions");
assert.ok(!manual.prefillRetry(failedVox.id,"lead",data,"SHARE").render,"SHARE lead cannot retry VOX job");
manual.reset();
assert.ok(revoked>=2,"Browser object URLs are revoked on reset/replacement");
console.log("Manual audio tests passed: validation, role scope, staging, gated upload, same-origin API and safe retries.");
})().catch(error=>{console.error(error);process.exitCode=1;});
