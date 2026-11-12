/* Fixed, non-editable Audio Intelligence output contract.
   The browser prototype validates synthetic evidence only; it does not run STT or AI. */
(function audioOutputContract(){
"use strict";
const VERSION="3.0";
const PROMPT_VERSION="1.5";
const LABELS=Object.freeze(["Happy","Unhappy","Neutral","Unclear"]);
const CATEGORIES=Object.freeze({
 emotionalIndicators:["Frustration","Concern","Reassurance","Appreciation"],
 conversationSignals:["Interruption","Escalation request","Long silence","Overlapping speech"],
 interactionReferences:["Key question","Commitment","Promise","Resolution","Follow-up action"]
});
const AUDIO_ONLY=new Set(["Interruption","Long silence","Overlapping speech"]);
const FIXED_INSTRUCTIONS=[
 "Produce a complete original-language English/Arabic transcript with speaker labels and mandatory audio-relative start/end timestamps per speech segment.",
 "Summarize the reason for contact, distinct issues, actions explicitly stated, verified resolution status and next steps for CRM. Never claim an action was performed merely because it was promised.",
 "Determine whether the customer left Happy, Unhappy, Neutral or Unclear, using the final customer speech as evidence. Do not assume satisfaction from a polite farewell or ticket resolution.",
 "Extract optional emotional indicators, conversation signals and interaction references only when supported by a timestamped quote or verified audio analysis.",
 "Do not infer vocal tone, interruptions, silence or overlapping speech from transcript text alone. Mark unavailable evidence as unavailable; never fabricate.",
 "Every observation must retain its source, original-language evidence, speaker and timestamp or a verified audio interval with original recording reference.",
 "Do not produce QA criteria, EQ scores, agent grades, pass/fail labels, compliance findings or rubric assessments."
].join(" ");
function ready(interaction){
 return interaction?.sum==="completed"&&window.MAFerTranscript.effectiveStatus(interaction)==="completed";
}
function validSegment(interaction,index,speaker){
 const segments=interaction?.segments;
 if(!Array.isArray(segments)||!Number.isSafeInteger(index)||index<0||index>=segments.length)return null;
 const segment=segments[index];
 if(!segment||typeof segment.speaker!=="string"||!segment.speaker.trim()||typeof segment.text!=="string"||!segment.text.trim())return null;
 if(speaker&&segment.speaker!==speaker)return null;
 if(!Number.isSafeInteger(segment.startMs)||!Number.isSafeInteger(segment.endMs)||segment.startMs<0||segment.endMs<=segment.startMs)return null;
 return segment;
}
function customerClose(interaction){
 if(!ready(interaction))return {label:"Not available",reason:"Customer closing sentiment is unavailable until transcription and summarization complete.",evidence:null};
 const result=interaction.customerClose;
 if(!result||!LABELS.includes(result.label))return {label:"Unclear",reason:"No reliable customer closing evidence.",evidence:null};
 const segment=validSegment(interaction,result.segmentIndex,"Customer");
 if(result.label!=="Unclear"){
  if(!segment)return {label:"Unclear",reason:"Customer closing speech could not be verified.",evidence:null};
  const duration=window.MAFerTranscript.parseDurationMs(interaction.duration);
  if(duration!==null&&segment.startMs<duration*0.65)
   return {label:"Unclear",reason:"Evidence is not from the closing portion of the call.",evidence:null};
  const lastCustomerIndex=interaction.segments.reduce((last,s,index)=>s.speaker==="Customer"?index:last,-1);
  if(result.segmentIndex!==lastCustomerIndex)
   return {label:"Unclear",reason:"Evidence is not the customer's final spoken segment.",evidence:null};
 }
 return {label:result.label,reason:String(result.reason||"").trim()||"Model-inferred from customer closing speech.",
  evidence:segment?{source:"transcript",segmentIndex:result.segmentIndex,startMs:segment.startMs,endMs:segment.endMs,speaker:segment.speaker,text:segment.text}:null};
}
function evidenceFor(interaction,item){
 if(item.source==="audio"){
  if(interaction.audioAnalysisVerified!==true||typeof interaction.recordingRef!=="string"||!interaction.recordingRef.trim())return null;
  if(!Number.isSafeInteger(item.startMs)||!Number.isSafeInteger(item.endMs)||item.startMs<0||item.endMs<=item.startMs)return null;
  const duration=window.MAFerTranscript.parseDurationMs(interaction.duration);
  if(duration!==null&&item.endMs>duration)return null;
  return {source:"audio",startMs:item.startMs,endMs:item.endMs,speaker:item.speaker||"Unknown",recordingReference:interaction.recordingRef};
 }
 if(item.source&&item.source!=="transcript")return null;
 if(AUDIO_ONLY.has(item.type))return null;
 const segment=validSegment(interaction,item.segmentIndex,item.speaker);
 if(!segment)return null;
 return {source:"transcript",segmentIndex:item.segmentIndex,startMs:segment.startMs,endMs:segment.endMs,speaker:segment.speaker,text:segment.text};
}
function observations(interaction,category){
 if(!ready(interaction))return [];
 const validTypes=CATEGORIES[category],rows=interaction[category];
 if(!validTypes||!Array.isArray(rows))return [];
 return rows.flatMap(item=>{
  if(!item||!validTypes.includes(item.type)||typeof item.note!=="string"||!item.note.trim())return [];
  const evidence=evidenceFor(interaction,item);
  return evidence?[{type:item.type,note:item.note.trim(),evidence}]:[];
 });
}
function buildOutput(interaction){
 const trans=window.MAFerTranscript.effectiveStatus(interaction),transReady=trans==="completed";
 const sumReady=transReady&&interaction.sum==="completed";
 return {
  outputSchemaVersion:VERSION,
  transcription:{status:trans,language:interaction.language||null,segments:transReady?interaction.segments.map(s=>({startMs:s.startMs,endMs:s.endMs,speaker:s.speaker,text:s.text})):[]},
  crmSummary:{status:interaction.sum,reasonForContact:sumReady?interaction.reason:null,issues:sumReady?interaction.issues:[],actionsStated:sumReady?interaction.actions:null,resolutionStatus:sumReady?(interaction.resolutionStatus||null):null,nextSteps:sumReady?interaction.next:null,summary:sumReady?interaction.summary:null},
  customerSentiment:customerClose(interaction),
  emotionalIndicators:observations(interaction,"emotionalIndicators"),
  conversationSignals:observations(interaction,"conversationSignals"),
  interactionReferences:observations(interaction,"interactionReferences"),
  interactionMetadata:{genesysConversationId:interaction.id,agent:interaction.agent||null,bu:interaction.bu||null,brand:interaction.brand||null,market:interaction.market||null,language:interaction.language||null,duration:interaction.duration||null,crmTicketId:interaction.ticket||null,recordingReference:interaction.recordingRef||null},
  processing:{transcription:trans,summarization:interaction.sum,crmUpdate:interaction.crm,crmAcknowledgement:interaction.ack,error:interaction.error||window.MAFerTranscript.issue(interaction)?.code||null,transcriptReady:transReady,summaryReady:sumReady}
 };
}
window.MAFerSignals={VERSION,PROMPT_VERSION,LABELS,CATEGORIES,FIXED_INSTRUCTIONS,customerClose,observations,buildOutput};
})();
