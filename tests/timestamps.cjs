(function timestampContractTests(){
"use strict";
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const context=vm.createContext({window:{}});
for(const file of ["sample-data.js","transcript-contract.js"])
 vm.runInContext(fs.readFileSync(file,"utf8"),context,{filename:file});
const timing=context.window.MAFerTranscript;
const completed=context.window.SEED.interactions.filter(i=>i.trans==="completed");
assert.equal(completed.length,5,"Five synthetic completed transcripts expected");
for(const interaction of completed){
 assert.equal(timing.validate(interaction).valid,true,"Completed transcript must have valid timestamped segments: "+interaction.id);
 assert.equal(timing.effectiveStatus(interaction),"completed");
}
const base={trans:"completed",duration:"01:00",segments:[
 {startMs:0,endMs:8000,speaker:"Customer",text:"مرحبا"},
 {startMs:7000,endMs:11000,speaker:"Agent",text:"Hello"}
]};
assert.equal(timing.validate(base).valid,true,"Overlapping speech is valid when segment starts are ordered");
assert.equal(timing.formatTimestamp(0),"00:00");
assert.equal(timing.formatTimestamp(65001),"01:05.001");
assert.equal(timing.formatTimestamp(3600000),"01:00:00");
assert.equal(timing.parseDurationMs("06:42"),402000);
const copy=()=>JSON.parse(JSON.stringify(base));
function expectInvalid(interaction,code){
 const result=timing.validate(interaction);
 assert.equal(result.valid,false,code+" must fail");
 assert.equal(result.code,code);
 assert.equal(timing.effectiveStatus(interaction),"failed","Invalid timestamp contract must block Completed");
}
const missing=copy();missing.segments=[];expectInvalid(missing,"TRANSCRIPT_TIMESTAMPS_MISSING");
const noEnd=copy();delete noEnd.segments[0].endMs;expectInvalid(noEnd,"TRANSCRIPT_TIMESTAMPS_INVALID");
const stringStart=copy();stringStart.segments[0].startMs="0";expectInvalid(stringStart,"TRANSCRIPT_TIMESTAMPS_INVALID");
const backwards=copy();backwards.segments[0].endMs=0;expectInvalid(backwards,"TRANSCRIPT_TIMESTAMPS_INVALID");
const unordered=copy();unordered.segments[1].startMs=-1;expectInvalid(unordered,"TRANSCRIPT_TIMESTAMPS_INVALID");
const order=copy();order.segments[1].startMs=1000;order.segments[0].startMs=2000;expectInvalid(order,"TRANSCRIPT_TIMESTAMPS_OUT_OF_ORDER");
const outOfBounds=copy();outOfBounds.segments[1].endMs=61000;expectInvalid(outOfBounds,"TRANSCRIPT_TIMESTAMPS_OUT_OF_BOUNDS");
const missingSpeaker=copy();missingSpeaker.segments[0].speaker="";expectInvalid(missingSpeaker,"TRANSCRIPT_SEGMENT_INCOMPLETE");
const missingText=copy();missingText.segments[0].text=" ";expectInvalid(missingText,"TRANSCRIPT_SEGMENT_INCOMPLETE");
const inProgress=copy();inProgress.trans="processing";inProgress.segments=[];
assert.equal(timing.effectiveStatus(inProgress),"processing","Pending jobs are not incorrectly failed");
console.log("Timestamp contract tests passed: mandatory start/end, speaker/text, ordering, overlap, bounds and completion gate.");
})();
