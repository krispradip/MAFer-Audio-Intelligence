import test from 'node:test';
import assert from 'node:assert/strict';
import {handle, MAX_AUDIO_BYTES} from '../worker.mjs';
const env={OPENAI_API_KEY:'test-not-real',DEMO_ACCESS_TOKEN:'not-a-real-secret',TRANSCRIPTION_MODEL:'gpt-4o-transcribe-diarize',ANALYSIS_MODEL:'gpt-4o-mini'};
function jsonResponse(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}
function audioRequest({name='test.wav',size=100,token=env.DEMO_ACCESS_TOKEN,language=''}={}){
  const f=new FormData();f.append('audio',new File([new Uint8Array(size)],name,{type:'audio/wav'}));if(language)f.append('language',language);
  return new Request('https://example.test/api/transcribe',{method:'POST',headers:{'x-demo-token':token},body:f});
}
function analysisRequest({roles={A:'Customer',B:'Agent'},segments=[{startMs:0,endMs:1300,speakerId:'A',text:'I need help.'},{startMs:1400,endMs:2500,speakerId:'B',text:'Let me check.'}],token=env.DEMO_ACCESS_TOKEN}={}){
  return new Request('https://example.test/api/analyze',{method:'POST',headers:{'content-type':'application/json','x-demo-token':token},body:JSON.stringify({segments,speakerMapping:roles,metadata:{bu:'VOX',conversationId:'GEN-ABC'}})});
}
const stt={segments:[{start:0,end:1.3,speaker:'A',text:'I need help.'},{start:1.4,end:2.5,speaker:'B',text:'Let me check.'}],text:'I need help. Let me check.'};
const intel={summary:'Customer requested support.',reasonForContact:'Support request',issues:[{description:'Needs help',evidenceSegmentIndices:[0,99]}],actions:[{description:'Agent offered to check',evidenceSegmentIndices:[1]}],resolution:{status:'Unclear',description:'Not confirmed',evidenceSegmentIndices:[0]},nextSteps:[],commitments:[],closingSentiment:{value:'Happy',evidenceSegmentIndices:[]},emotionalIndicators:[],conversationSignals:[]};
const original=globalThis.fetch;
const fakeProvider=handler=>{globalThis.fetch=async (url,opts)=>handler(String(url),opts)};
test.afterEach(()=>{globalThis.fetch=original;});
test('health truthfully reports missing secrets without claiming provider verified',async()=>{
  const r=await handle(new Request('https://example.test/api/health'),{}); const d=await r.json();
  assert.equal(r.status,200);assert.equal(d.engineConfigured,false);assert.equal(d.liveCallsVerified,false);
});
test('upload must have access token and never calls provider when unauthorized',async()=>{
  let called=0;fakeProvider(()=>{called++;throw new Error('should not reach provider');});
  const r=await handle(audioRequest({token:'wrong'}),env);assert.equal(r.status,401);assert.equal(called,0);
});
test('real transcription path forwards binary multipart audio to OpenAI and preserves per-segment timing',async()=>{
  let called=0;
  fakeProvider(async(url,opts)=>{
    called++;assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');
    assert.equal(opts.headers.Authorization,'Bearer '+env.OPENAI_API_KEY);
    assert.equal(opts.body.get('model'),'gpt-4o-transcribe-diarize');assert.equal(opts.body.get('response_format'),'diarized_json');
    assert.equal(opts.body.get('chunking_strategy'),'auto');assert.equal(opts.body.get('language'),'ar');
    assert.equal(opts.body.get('file').size,100);
    return jsonResponse(stt);
  });
  const r=await handle(audioRequest({language:'ar'}),env);const d=await r.json();
  assert.equal(r.status,200);assert.equal(called,1);assert.equal(d.segments.length,2);
  assert.deepEqual(d.speakerIds,['A','B']);assert.equal(d.segments[0].startMs,0);assert.equal(d.segments[0].endMs,1300);
});
test('no-speech/no diarization never fakes completed transcript',async()=>{
  fakeProvider(()=>jsonResponse({text:'Hello',segments:[]}));const r=await handle(audioRequest(),env);const d=await r.json();
  assert.equal(r.status,422);assert.equal(d.ok,false);
});
test('broken timestamps fail closed',async()=>{
  fakeProvider(()=>jsonResponse({segments:[{start:2,end:1,speaker:'A',text:'Bad'}]}));
  const r=await handle(audioRequest(),env);assert.equal(r.status,422);
});
test('file extension and size restrictions enforced before API request',async()=>{
  fakeProvider(()=>{throw new Error('Should not call provider');});
  const r=await handle(audioRequest({name:'test.txt'}),env);assert.equal(r.status,415);
  const tooLarge=await handle(audioRequest({size:MAX_AUDIO_BYTES+1}),env);assert.equal(tooLarge.status,413);
});
test('analysis blocks unconfirmed speaker roles and refuses to call LLM',async()=>{
  fakeProvider(()=>{throw new Error('Should not call provider');});
  const r=await handle(analysisRequest({roles:{A:'Customer',B:'Customer'}}),env);assert.equal(r.status,422);
});
test('analysis calls LLM and rejects unsupported evidence references',async()=>{
  fakeProvider((url,opts)=>{
    assert.equal(url,'https://api.openai.com/v1/chat/completions');
    const payload=JSON.parse(opts.body);assert.equal(payload.model,'gpt-4o-mini');
    assert.equal(payload.response_format.type,'json_object');
    assert.equal(JSON.parse(payload.messages[1].content).speakerMapping.B,'Agent');
    return jsonResponse({choices:[{message:{content:JSON.stringify(intel)}}],usage:{total_tokens:144}});
  });
  const r=await handle(analysisRequest(),env);const d=await r.json();assert.equal(r.status,200);
  assert.equal(d.intelligence.issues[0].evidenceSegmentIndices.length,1);
  assert.equal(d.intelligence.closingSentiment.value,'Unclear');
  assert.equal(d.metadata.bu,'VOX');assert.equal(d.usage.total_tokens,144);
});
test('provider quota error is explicit and does not generate fake analysis',async()=>{
  fakeProvider(()=>jsonResponse({error:{message:'Quota exceeded'}},429));
  const r=await handle(analysisRequest(),env);const d=await r.json();assert.equal(r.status,502);assert.equal(d.ok,false);assert.equal(d.error.code,'PROVIDER_429');
});
test('unknown API route is rejected',async()=>{
  const r=await handle(new Request('https://example.test/api/unknown',{method:'POST',headers:{'x-demo-token':env.DEMO_ACCESS_TOKEN}}),env);assert.equal(r.status,404);
});