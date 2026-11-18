import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../worker.mjs';

const limiter={limit:async()=>({success:true})};
const env={GEMINI_API_KEY:'fake-key',AUDIO_RATE_LIMITER:limiter};
const words={candidates:[{content:{parts:[
 {audioTranscription:{speakerLabel:'spk_1',words:[{word:'Hello',startOffset:'0s',endOffset:'0.6s'}]}},
 {audioTranscription:{speakerLabel:'spk_2',words:[{word:'Welcome',startOffset:'1s',endOffset:'1.7s'}]}}
]}}]};
test('Gemini configured health reports selected models and no live-success claim',async()=>{
 const res=await handle(new Request('https://localhost/api/health'),env); const status=await res.json();
 assert.equal(status.engineConfigured,true);assert.equal(status.rateLimitConfigured,true);
 assert.equal(status.transcriptionModel,'gemini-3.5-transcribe');assert.equal(status.analysisModel,'gemini-3.8-flash');assert.equal(status.liveCallsVerified,false);
});
test('Worker Gemini transcription makes real outgoing API requests and validates timestamps',async()=>{
 const prior=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,opts)=>{calls++;if(calls===1)return new Response('',{status:200,headers:{'x-goog-upload-url':'https://generativelanguage.googleapis.com/upload/test'}});
 if(calls===2)return new Response(JSON.stringify({file:{name:'files/abc',uri:'https://generativelanguage.googleapis.com/v1beta/files/abc'}}));
 if(calls===3)return new Response(JSON.stringify(words));
 if(calls===4)return new Response('{}');
 throw Error('Unexpected request '+url);};
 try{
   const form=new FormData();form.append('audio',new File([new Uint8Array(200)],'synthetic.wav',{type:'audio/wav'}));
   const res=await handle(new Request('https://localhost/api/transcribe',{method:'POST',body:form}),env);
   const body=await res.json();assert.equal(res.status,200);assert.equal(body.segments.length,2);assert.equal(body.speakerIds[0],'spk_1');assert.equal(calls,4);
 }finally{globalThis.fetch=prior;}
});
test('Worker Gemini analysis generates normalized evidence and never applies QA scoring',async()=>{
 const prior=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({summary:'Visitor needs help',reasonForContact:'Assistance',issues:[{description:'Issue',evidenceSegmentIndices:[0,999]}],actions:[],resolution:{status:'Unclear',description:'No verification',evidenceSegmentIndices:[0]},nextSteps:[],commitments:[],closingSentiment:{value:'Neutral',evidenceSegmentIndices:[0]},emotionalIndicators:[],conversationSignals:[]})}]}}]}));
 try{
 const payload={segments:[{speakerId:'A',startMs:0,endMs:1000,text:'I need help'},{speakerId:'B',startMs:1100,endMs:2000,text:'How can I help?'}],speakerMapping:{A:'Customer',B:'Agent'},metadata:{bu:'VOX'}};
 const res=await handle(new Request('https://localhost/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),env);
 const data=await res.json();assert.equal(res.status,200);assert.equal(data.summaryModel,'gemini-3.8-flash');assert.deepEqual(data.intelligence.issues[0].evidenceSegmentIndices,[0]);assert.equal(data.qaScoringPerformed,undefined);
 }finally{globalThis.fetch=prior;}
});