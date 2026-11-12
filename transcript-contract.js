/* Mandatory transcript timing contract shared by the preview UI and its tests.
   Production MUST independently enforce this contract in the STT processing backend. */
(function transcriptContract(){
"use strict";
function parseDurationMs(value){
 if(typeof value!=="string")return null;
 const parts=value.split(":");
 if(![2,3].includes(parts.length)||parts.some(p=>!/^[0-9]+$/.test(p)))return null;
 const nums=parts.map(Number);
 if(nums.some(n=>!Number.isSafeInteger(n))||nums.slice(-2).some(n=>n>=60))return null;
 return (nums.reduce((total,n)=>total*60+n,0))*1000;
}
function formatTimestamp(ms){
 if(!Number.isSafeInteger(ms)||ms<0)return "Invalid time";
 const whole=Math.floor(ms/1000),hours=Math.floor(whole/3600),minutes=Math.floor(whole%3600/60),seconds=whole%60;
 const pad=n=>String(n).padStart(2,"0");
 return (hours?pad(hours)+":":"")+pad(minutes)+":"+pad(seconds)+(ms%1000?"."+String(ms%1000).padStart(3,"0"):"");
}
function validate(interaction){
 const segments=interaction?.segments;
 const fail=(code,index,message)=>({valid:false,code,index,message});
 if(!Array.isArray(segments)||!segments.length)return fail("TRANSCRIPT_TIMESTAMPS_MISSING",-1,"No timestamped speech segments.");
 const duration=parseDurationMs(interaction?.duration);
 let previousStart=-1;
 for(let index=0;index<segments.length;index++){
  const segment=segments[index];
  if(!segment||typeof segment!=="object")return fail("TRANSCRIPT_SEGMENT_INVALID",index,"Segment must be an object.");
  const {startMs,endMs,speaker,text}=segment;
  if(!Number.isSafeInteger(startMs)||!Number.isSafeInteger(endMs)||startMs<0||endMs<=startMs)
   return fail("TRANSCRIPT_TIMESTAMPS_INVALID",index,"Start/end timestamps must be non-negative integer milliseconds, with end after start.");
  if(startMs<previousStart)return fail("TRANSCRIPT_TIMESTAMPS_OUT_OF_ORDER",index,"Segments must be ordered by start time; overlapping speakers are allowed.");
  if(duration!==null&&endMs>duration)return fail("TRANSCRIPT_TIMESTAMPS_OUT_OF_BOUNDS",index,"Segment end exceeds recording duration.");
  if(typeof speaker!=="string"||!speaker.trim()||typeof text!=="string"||!text.trim())
   return fail("TRANSCRIPT_SEGMENT_INCOMPLETE",index,"Every segment requires a speaker label and non-empty original-language text.");
  previousStart=startMs;
 }
 return {valid:true,code:null,index:-1,message:"All speech segments have valid start/end timestamps."};
}
function issue(interaction){
 if(interaction?.trans!=="completed")return null;
 const result=validate(interaction);
 return result.valid?null:result;
}
function effectiveStatus(interaction){return issue(interaction)?"failed":interaction?.trans||"waiting";}
window.MAFerTranscript={parseDurationMs,formatTimestamp,validate,issue,effectiveStatus};
})();
