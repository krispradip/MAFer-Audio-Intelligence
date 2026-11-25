import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../worker.mjs';

const endpoint='https://apim-testing.example.org/foundry-customer-care-prod/openai/v1/chat/completions';
const env={AWS_REGION:'me-central-1',S3_INPUT_BUCKET:'test-input',S3_OUTPUT_BUCKET:'test-output',
  TRANSCRIPTION_PROVIDER:'amazon',ANALYSIS_PROVIDER:'enterprise',ANALYSIS_MODEL:'gpt-4o',
  ENTERPRISE_AI_ENDPOINT:endpoint,ENTERPRISE_AI_API_KEY:'synthetic-test-key',
  AUDIO_RATE_LIMITER:{limit:async()=>({success:true})}};
const segments=[
  {speakerId:'A',startMs:0,endMs:1000,text:'Welcome, I can help with your order.'},
  {speakerId:'B',startMs:1100,endMs:2400,text:'I am calling about my delivery.'}
];
function request(rows=segments){
  return new Request('https://mafer.test/api/identify-speakers',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({segments:rows})
  });
}
const originalFetch=globalThis.fetch;
test.afterEach(()=>{globalThis.fetch=originalFetch;});
test('speaker identification uses only approved APIM and keeps inferred roles unverified',async()=>{
  globalThis.fetch=async(url,opts)=>{
    assert.equal(String(url),endpoint);
    assert.equal(opts.headers['api-key'],'synthetic-test-key');
    assert.equal(opts.headers.Authorization,undefined);
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{
      content:JSON.stringify({speakers:[
        {speakerId:'A',role:'Agent',confidence:'high',evidenceSegmentIndices:[0]},
        {speakerId:'B',role:'Customer',confidence:'high',evidenceSegmentIndices:[1]}
      ]})}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const response=await handle(request(),env);
  const result=await response.json();
  assert.equal(response.status,200);
  assert.equal(result.requiresReview,false);
  assert.equal(result.speakerMapping.A,'Agent');
  assert.equal(result.verifiedByGenesys,false);
});
test('missing speaker evidence requires review without invented attribution',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{
    content:JSON.stringify({speakers:[
      {speakerId:'A',role:'Agent',confidence:'low',evidenceSegmentIndices:[0]},
      {speakerId:'B',role:'Customer',confidence:'high',evidenceSegmentIndices:[0]}
    ]})}}]}),{status:200});
  const response=await handle(request(),env);
  const result=await response.json();
  assert.equal(response.status,200);
  assert.equal(result.requiresReview,true);
  assert.equal(result.speakerMapping.A,'');
});
test('single-speaker input does not call APIM or create artificial customer roles',async()=>{
  globalThis.fetch=async()=>{throw Error('Unexpected APIM request');};
  const response=await handle(request(segments.slice(0,1)),env);
  const result=await response.json();
  assert.equal(response.status,200);
  assert.equal(result.requiresReview,true);
});
