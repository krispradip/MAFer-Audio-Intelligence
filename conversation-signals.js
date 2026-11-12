/* Conversation intelligence signals — observational only, never QA scores.
   Production LLM outputs require independent backend schema/evidence validation. */
(function conversationSignals(){
"use strict";
const LABELS=new Set(["Happy","Unhappy","Neutral","Unclear"]);
const EQ_GUIDANCE=Object.freeze([
 {cue:"Empathy",lookFor:"Acknowledges the customer's difficulty or feelings without minimizing them."},
 {cue:"Active listening",lookFor:"Reflects the customer's stated concern or asks clarifying questions; do not assume audio-only behaviours from text."},
 {cue:"Emotional acknowledgement",lookFor:"Recognizes the customer's expressed worry, frustration or other feeling."},
 {cue:"Patience",lookFor:"Gives the customer space to explain and responds without rushing; audio cues require audio evidence."},
 {cue:"Reassurance",lookFor:"Explains credible next steps without promising an unverified outcome."},
 {cue:"Composure",lookFor:"Maintains respectful language under pressure; vocal calmness requires audio evidence."}
]);
const EQ_CUES=Object.freeze(EQ_GUIDANCE.map(item=>item.cue));
function validSegment(interaction,index,speaker){
 const segments=interaction?.segments;
 if(!Array.isArray(segments)||!Number.isSafeInteger(index)||index<0||index>=segments.length)return null;
 const segment=segments[index];
 if(!segment||segment.speaker!==speaker||typeof segment.text!=="string"||!segment.text.trim())return null;
 if(!Number.isSafeInteger(segment.startMs)||!Number.isSafeInteger(segment.endMs)||segment.startMs<0||segment.endMs<=segment.startMs)return null;
 return segment;
}
function ready(interaction){
 return interaction?.sum==="completed"&&window.MAFerTranscript.effectiveStatus(interaction)==="completed";
}
function customerClose(interaction){
 if(!ready(interaction))return {label:"Not available",reason:"Customer closing sentiment is unavailable until transcription and summarization complete.",evidence:null};
 const result=interaction.customerClose;
 if(!result||!LABELS.has(result.label))return {label:"Unclear",reason:"No reliable end-of-call customer evidence was provided.",evidence:null};
 const evidence=validSegment(interaction,result.segmentIndex,"Customer");
 if(result.label!=="Unclear"){
  if(!evidence)return {label:"Unclear",reason:"Closing sentiment could not be verified against a customer speech segment.",evidence:null};
  const duration=window.MAFerTranscript.parseDurationMs(interaction.duration);
  if(duration!==null&&evidence.startMs<duration*0.65)
   return {label:"Unclear",reason:"Evidence is not from the closing portion of the recording.",evidence:null};
 }
 return {label:result.label,reason:String(result.reason||"").trim()||"Closing sentiment inferred from customer speech.",evidence:evidence||null};
}
function eqHighlights(interaction){
 if(!ready(interaction))return [];
 const observations=Array.isArray(interaction.eqHighlights)?interaction.eqHighlights:[];
 return observations.filter(item=>item&&EQ_CUES.includes(item.cue)&&typeof item.note==="string"&&item.note.trim()&&validSegment(interaction,item.segmentIndex,"Agent"))
  .map(item=>({cue:item.cue,note:item.note.trim(),evidence:validSegment(interaction,item.segmentIndex,"Agent")}));
}
window.MAFerSignals={customerClose,eqHighlights,EQ_CUES,EQ_GUIDANCE,LABELS:Array.from(LABELS)};
})();
