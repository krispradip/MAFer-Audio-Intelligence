/**
 * Transcript-timestamp-derived conversation metrics.
 * These are NOT acoustic measurements from waveform; not QA pass/fail.
 */
function mergeIntervals(input){
  const sorted=input.slice().sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
  const merged=[];
  for(const row of sorted){
    const previous=merged[merged.length-1];
    if(previous&&row.startMs<=previous.endMs)previous.endMs=Math.max(previous.endMs,row.endMs);
    else merged.push({startMs:row.startMs,endMs:row.endMs});
  }
  return merged;
}
export function deriveTimelineMetrics(segments,roleMapping={},recordingDurationMs=null){
  const valid=(Array.isArray(segments)?segments:[]).filter(s=>Number.isInteger(s.startMs)&&
    Number.isInteger(s.endMs)&&s.endMs>s.startMs&&typeof s.speakerId==='string');
  const speakerIds=[...new Set(valid.map(s=>s.speakerId))];
  const bySpeaker=speakerIds.map(id=>{
    const items=valid.filter(s=>s.speakerId===id);
    const intervals=mergeIntervals(items);
    const speakingMs=intervals.reduce((sum,x)=>sum+x.endMs-x.startMs,0);
    const words=items.reduce((sum,s)=>sum+(String(s.text||'').trim().match(/\S+/g)||[]).length,0);
    return {speakerId:id,role:roleMapping[id]||'Unknown',speakingMs,
      approximatelyWordCount:words,
      approximateWordsPerMinute:speakingMs>0?Math.round(words*60000/speakingMs):null};
  });
  const global=mergeIntervals(valid);
  const inferredEnd=global.length?global[global.length-1].endMs:0;
  const hasValidDuration=Number.isFinite(recordingDurationMs)&&recordingDurationMs>0;
  const totalDurationMs=hasValidDuration?Math.max(inferredEnd,recordingDurationMs):inferredEnd;
  const candidateGaps=[];
  let cursor=0;
  for(const item of global){
    if(item.startMs>cursor)candidateGaps.push({startMs:cursor,endMs:item.startMs,durationMs:item.startMs-cursor});
    cursor=Math.max(cursor,item.endMs);
  }
  if(totalDurationMs>cursor)candidateGaps.push({startMs:cursor,endMs:totalDurationMs,durationMs:totalDurationMs-cursor});
  // Count active distinct speakers rather than overlapping segments of one speaker.
  const events=valid.flatMap(s=>[{time:s.startMs,type:1,speaker:s.speakerId},
    {time:s.endMs,type:-1,speaker:s.speakerId}]).sort((a,b)=>a.time-b.time||a.type-b.type);
  const active=new Map();
  const overlap=[];
  let previousTime=null;
  for(const event of events){
    if(previousTime!==null&&event.time>previousTime&&[...active.values()].filter(n=>n>0).length>=2)
      overlap.push({startMs:previousTime,endMs:event.time});
    const count=(active.get(event.speaker)||0)+event.type;
    if(count<=0)active.delete(event.speaker);else active.set(event.speaker,count);
    previousTime=event.time;
  }
  const mergedOverlap=mergeIntervals(overlap).map(x=>({...x,durationMs:x.endMs-x.startMs}));
  const roleMs=role=>bySpeaker.filter(x=>x.role===role).reduce((sum,x)=>sum+x.speakingMs,0);
  const agentMs=roleMs('Agent'),customerMs=roleMs('Customer');
  return {schemaVersion:'1.0',source:'provider_timestamped_transcript',
    audioWaveformAnalyzed:false,recordingDurationMs:hasValidDuration?recordingDurationMs:null,
    transcriptSpanMs:inferredEnd,speakers:bySpeaker,
    speakerSpeechRatio:agentMs+customerMs>0?{
      agentPercent:Math.round(agentMs/(agentMs+customerMs)*100),
      customerPercent:Math.round(customerMs/(agentMs+customerMs)*100)
    }:null,
    overlapCandidates:mergedOverlap.slice(0,500),
    overlapCandidateTotalMs:mergedOverlap.reduce((sum,x)=>sum+x.durationMs,0),
    candidateSpeechGaps:candidateGaps.slice(0,500),
    speechGapCandidateTotalMs:candidateGaps.reduce((sum,x)=>sum+x.durationMs,0),
    caveat:'All timing and overlaps are derived from provider-transcribed segments. Validate against original audio before treating silence, interruption or dead air as confirmed acoustic evidence.'};
}
