import test from 'node:test';
import assert from 'node:assert/strict';
import {handle,MAX_AUDIO_BYTES} from '../worker.mjs';

const endpoint='https://apim-testing.example.org/foundry-customer-care-prod/openai/v1/chat/completions';
const env={
  AWS_REGION:'me-central-1',S3_INPUT_BUCKET:'test-input',S3_OUTPUT_BUCKET:'test-output',
  TRANSCRIPTION_PROVIDER:'amazon',ANALYSIS_PROVIDER:'enterprise',ANALYSIS_MODEL:'gpt-4o',
  ENTERPRISE_AI_ENDPOINT:endpoint,ENTERPRISE_AI_API_KEY:'synthetic-test-key',
  AUDIO_RATE_LIMITER:{limit:async()=>({success:true})}
};
const segments=[
  {startMs:0,endMs:1300,speakerId:'A',text:'I need help with an order.'},
  {startMs:1400,endMs:2500,speakerId:'B',text:'Let me check your order.'}
];
const validInsight={
  summary:'Customer requested help.',reasonForContact:'Order request',
  issues:[{description:'Order help',evidenceSegmentIndices:[0,1000]}],
  actions:[{description:'Agent offered to check',evidenceSegmentIndices:[1]}],
  resolution:{status:'Unclear',description:'Not verified',evidenceSegmentIndices:[0]},
  nextSteps:[],commitments:[],closingSentiment:{value:'Happy',evidenceSegmentIndices:[]},
  emotionalIndicators:[],conversationSignals:[]
};
const priorFetch=globalThis.fetch;
test.afterEach(()=>{globalThis.fetch=priorFetch;});
function audioRequest({name='test.wav',size=100}={}){
  const body=new FormData();
  body.append('audio',new File([new Uint8Array(size)],name,{type:'audio/wav'}));
  return new Request('https://mafer.test/api/transcribe',{method:'POST',body});
}
function analysisRequest(roleMapping={A:'Customer',B:'Agent'}){
  return new Request('https://mafer.test/api/analyze',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({segments,speakerMapping:roleMapping,metadata:{bu:'VOX'}})
  });
}
test('corporate health identifies Amazon + enterprise APIM without claiming live vendor success',async()=>{
  const response=await handle(new Request('https://mafer.test/api/health'),env);
  const data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.engineConfigured,true);
  assert.equal(data.transcriptionProvider,'amazon');
  assert.equal(data.analysisProvider,'enterprise');
  assert.equal(data.transcriptionModel,'amazon-transcribe');
  assert.equal(data.analysisModel,'gpt-4o');
  assert.equal(data.liveCallsVerified,false);
});
test('missing corporate credentials fail closed',async()=>{
  const response=await handle(new Request('https://mafer.test/api/health'),{});
  const body=await response.json();
  assert.equal(body.engineConfigured,false);
  assert.equal(body.transcriptionProvider,'amazon');
  assert.equal(body.analysisProvider,'enterprise');
});
test('non-corporate provider selection is rejected',async()=>{
  const speech=await handle(audioRequest(),{...env,TRANSCRIPTION_PROVIDER:'gemini'});
  const analysis=await handle(analysisRequest(),{...env,ANALYSIS_PROVIDER:'openai'});
  assert.equal(speech.status,503);
  assert.equal(analysis.status,503);
});
test('rate-limiter is required and enforces call limits',async()=>{
  const unavailable=await handle(analysisRequest(),{...env,AUDIO_RATE_LIMITER:undefined});
  const denied=await handle(analysisRequest(),{...env,AUDIO_RATE_LIMITER:{limit:async()=>({success:false})}});
  assert.equal(unavailable.status,503);
  assert.equal(denied.status,429);
});
test('upload validation blocks unsupported types and oversize before AWS calls',async()=>{
  const invalid=await handle(audioRequest({name:'test.txt'}),env);
  const oversized=await handle(audioRequest({size:MAX_AUDIO_BYTES+1}),env);
  assert.equal(invalid.status,415);
  assert.equal(oversized.status,413);
});
test('unconfirmed agent role blocks APIM requests',async()=>{
  let calls=0;
  globalThis.fetch=async()=>{calls++;throw Error('must not call APIM');};
  const response=await handle(analysisRequest({A:'Customer',B:'Customer'}),env);
  assert.equal(response.status,422);
  assert.equal(calls,0);
});
test('corporate analysis calls APIM only and filters unsupported evidence',async()=>{
  let calls=0;
  globalThis.fetch=async (url,options)=>{
    calls++;
    assert.equal(String(url),endpoint);
    assert.equal(options.headers['api-key'],'synthetic-test-key');
    assert.equal(options.headers.Authorization,undefined);
    const request=JSON.parse(options.body);
    assert.equal(request.model,'gpt-4o');
    assert.equal(request.response_format.type,'json_object');
    return new Response(JSON.stringify({
      choices:[{finish_reason:'stop',message:{content:JSON.stringify(validInsight)}}]
    }),{status:200,headers:{'content-type':'application/json'}});
  };
  const response=await handle(analysisRequest(),env);
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(calls,1);
  assert.deepEqual(body.intelligence.issues[0].evidenceSegmentIndices,[0]);
  assert.equal(body.intelligence.closingSentiment.value,'Unclear');
  assert.equal(body.qaScoringPerformed,undefined);
});
test('APIM HTTP 429 returns a controlled failure, never synthetic analysis',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({
    error:{message:'Testing rate-limit rejection'}
  }),{status:429,headers:{'content-type':'application/json'}});
  const response=await handle(analysisRequest(),env);
  const body=await response.json();
  assert.equal(response.status,429);
  assert.equal(body.ok,false);
  assert.equal(body.intelligence,undefined);
});
test('unknown routes return 404',async()=>{
  const response=await handle(new Request('https://mafer.test/api/not-an-endpoint',{method:'POST'}),env);
  assert.equal(response.status,404);
});
