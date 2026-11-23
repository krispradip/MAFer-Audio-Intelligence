import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSpeakerRoles} from '../speaker-roles.mjs';
const segments=[
  {speakerId:'A',startMs:0,endMs:1200,text:'Hello, this is your advisor.'},
  {speakerId:'B',startMs:1300,endMs:2600,text:'I have an issue.'}
];
test('speaker role inference proceeds only with distinct evidence-backed high-confidence roles',()=>{
  const result=normalizeSpeakerRoles({speakers:[
    {speakerId:'A',role:'Agent',confidence:'high',evidenceSegmentIndices:[0]},
    {speakerId:'B',role:'Customer',confidence:'high',evidenceSegmentIndices:[1]}
  ]},segments);
  assert.equal(result.requiresReview,false);
  assert.equal(result.speakerMapping.A,'Agent');
  assert.equal(result.speakerMapping.B,'Customer');
  assert.equal(result.verifiedByGenesys,false);
});
test('unsupported evidence or low confidence must require human review',()=>{
  const result=normalizeSpeakerRoles({speakers:[
    {speakerId:'A',role:'Agent',confidence:'high',evidenceSegmentIndices:[1]},
    {speakerId:'B',role:'Customer',confidence:'medium',evidenceSegmentIndices:[1]}
  ]},segments);
  assert.equal(result.requiresReview,true);
  assert.equal(result.speakerMapping.A,'');
  assert.equal(result.speakerMapping.B,'');
});
test('one-speaker recordings do not invent agent/customer roles',()=>{
  const result=normalizeSpeakerRoles({speakers:[
    {speakerId:'A',role:'Agent',confidence:'high',evidenceSegmentIndices:[0]}
  ]},segments.slice(0,1));
  assert.equal(result.requiresReview,true);
});
