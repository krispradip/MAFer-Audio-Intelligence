import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../worker.mjs';
const env={OPENAI_API_KEY:'test-token',TRANSCRIPTION_PROVIDER:'openai',
  ANALYSIS_PROVIDER:'openai',ANALYSIS_MODEL:'gpt-4o-mini',
  AUDIO_RATE_LIMITER:{limit:async()=>({success:true})}};
const segments=[
  {speakerId:'A',startMs:0,endMs:1000,text:'Welcome to the service desk, I can help.'},
  {speakerId:'B',startMs:1100,endMs:2400,text:'I am calling about my order.'}
];
function request(segmentsOverride=segments){
  return new Request('https://example.test/api/identify-speakers',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({segments:segmentsOverride})
  });
}
const original=globalThis.fetch;
test.afterEach(()=>{globalThis.fetch=original;});
test('speaker inference returns unverified roles only when grounded and high-confidence',async()=>{
  globalThis.fetch=async(url,options)=>{
    assert.equal(String(url),'https://api.openai.com/v1/chat/completions');
    const body=JSON.parse(options.body);
    assert.equal(body.response_format.type,'json_object');
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({speakers:[
      {speakerId:'A',role:'Agent',confidence:'high',evidenceSegmentIndices:[0]},
      {speakerId:'B',role:'Customer',confidence:'high',evidenceSegmentIndices:[1]}
    ]})}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await handle(request(),env);
  const body=await result.json();
  assert.equal(result.status,200);
  assert.equal(body.ok,true);
  assert.equal(body.requiresReview,false);
  assert.equal(body.speakerMapping.A,'Agent');
  assert.equal(body.verifiedByGenesys,false);
});
test('missing/unsupported role evidence requires review without inventing labels',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({speakers:[
    {speakerId:'A',role:'Agent',confidence:'low',evidenceSegmentIndices:[0]},
    {speakerId:'B',role:'Customer',confidence:'high',evidenceSegmentIndices:[0]}
  ]})}}]}),{status:200});
  const response=await handle(request(),env),data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.requiresReview,true);
  assert.equal(data.speakerMapping.A,'');
});
test('single-speaker recording does not make a billable role inference call',async()=>{
  globalThis.fetch=async()=>{throw Error('Provider must not be called');};
  const response=await handle(request(segments.slice(0,1)),env),data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.requiresReview,true);
});
