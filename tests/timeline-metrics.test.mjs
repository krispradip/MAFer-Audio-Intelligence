import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveTimelineMetrics} from '../public/timeline-metrics.js';
test('timing metrics count speech overlaps and gaps without claiming acoustic measurement',()=>{
  const metrics=deriveTimelineMetrics([
    {speakerId:'A',startMs:0,endMs:1000,text:'How may I help you'},
    {speakerId:'B',startMs:500,endMs:1500,text:'I need assistance'}
  ],{A:'Agent',B:'Customer'},2000);
  assert.equal(metrics.speakerSpeechRatio.agentPercent,50);
  assert.equal(metrics.overlapCandidateTotalMs,500);
  assert.equal(metrics.speechGapCandidateTotalMs,500);
  assert.equal(metrics.audioWaveformAnalyzed,false);
  assert.equal(metrics.source,'provider_timestamped_transcript');
});
test('same-speaker overlapping segments are not false multi-speaker overlap',()=>{
  const metrics=deriveTimelineMetrics([
    {speakerId:'A',startMs:0,endMs:1000,text:'Hello'},
    {speakerId:'A',startMs:200,endMs:900,text:'Again'}
  ],{A:'Agent'});
  assert.equal(metrics.overlapCandidateTotalMs,0);
  assert.equal(metrics.speakers[0].speakingMs,1000);
});
test('unknown speaker mappings have no invented talk ratio',()=>{
  const metrics=deriveTimelineMetrics([{speakerId:'A',startMs:0,endMs:500,text:'Hi'}],{});
  assert.equal(metrics.speakerSpeechRatio,null);
});
