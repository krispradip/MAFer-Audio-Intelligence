import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGeminiTranscript, geminiTranscribe, geminiAnalyze} from '../gemini-provider.mjs';

const example={candidates:[{content:{parts:[{audioTranscription:{speakerLabel:'spk_1',text:'I need help.',words:[{word:'I',startOffset:'0s',endOffset:'0.2s'},{word:'need',startOffset:'0.2s',endOffset:'0.5s'},{word:'help.',startOffset:'0.5s',endOffset:'0.9s'}]}},{audioTranscription:{speakerLabel:'spk_2',text:'Let me check.',words:[{word:'Let',startOffset:'1s',endOffset:'1.3s'},{word:'me',startOffset:'1.3s',endOffset:'1.5s'},{word:'check.',startOffset:'1.5s',endOffset:'1.9s'}]}}]}}]};
const env={GEMINI_API_KEY:'fake-not-real',TRANSCRIPTION_MODEL:'gemini-3.5-transcribe',ANALYSIS_MODEL:'gemini-3.8-flash'};
test('parses real Gemini word transcription into timestamped speaker turns',()=>{
  const result=parseGeminiTranscript(example);assert.equal(result.length,2);assert.deepEqual(result[0],{speakerId:'spk_1',startMs:0,endMs:900,text:'I need help.'});assert.deepEqual(result[1],{speakerId:'spk_2',startMs:1000,endMs:1900,text:'Let me check.'});
});
test('refuses missing word timing or speaker IDs, never fabricates a transcript',()=>{
  assert.throws(()=>parseGeminiTranscript({candidates:[{content:{parts:[{text:'I need help.'}]}}]}),/no speaker-labeled/i);
  assert.throws(()=>parseGeminiTranscript({candidates:[{content:{parts:[{audioTranscription:{text:'Hello',words:[{word:'Hello',startOffset:'0s',endOffset:'1s'}]}}]}}]}),/missing speaker/i);
  assert.throws(()=>parseGeminiTranscript({candidates:[{content:{parts:[{audioTranscription:{speakerLabel:'spk_1',words:[{word:'Hello',endOffset:'1s'}]}}]}}]}),/timestamps/i);
});
test('Gemini transcription submits file, turns on diarization and timestamps, and deletes remote media',async()=>{
  const prior=globalThis.fetch;const calls=[];
  globalThis.fetch=async (url,opts)=>{calls.push({url:String(url),opts});
    if(calls.length===1) return new Response('',{status:200,headers:{'x-goog-upload-url':'https://generativelanguage.googleapis.com/upload/session123'}});
    if(calls.length===2)return new Response(JSON.stringify({file:{uri:'https://generativelanguage.googleapis.com/v1beta/files/a123',name:'files/a123'}}));
    if(calls.length===3)return new Response(JSON.stringify(example));
    if(calls.length===4)return new Response('{}');
    throw Error('unexpected request');
  };
  try{
    const file=new File([new Uint8Array(50)],'sample.mp3',{type:'audio/mpeg'});
    const out=await geminiTranscribe(file,'ar',env);assert.equal(out.segments.length,2);assert.deepEqual(out.speakerIds,['spk_1','spk_2']);
    assert.equal(calls[0].opts.headers['x-goog-api-key'],env.GEMINI_API_KEY);
    assert.equal(calls[1].opts.body.size,50);
    const data=JSON.parse(calls[2].opts.body);
    assert.equal(calls[2].url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe:generateContent');
    assert.equal(data.generationConfig.audioTranscriptionConfig.diarization,true);
    assert.equal(data.generationConfig.audioTranscriptionConfig.wordTimestamp,true);
    assert.equal(data.generationConfig.audioTranscriptionConfig.mode,'VERBATIM');
    assert.deepEqual(data.generationConfig.audioTranscriptionConfig.languageCodes,['ar-XA']);
    assert.equal(calls[3].opts.method,'DELETE');
  }finally{globalThis.fetch=prior;}
});
test('Gemini analysis uses configured JSON model and leaves QA normalization to application',async()=>{
  const prior=globalThis.fetch;let request;
  globalThis.fetch=async(url,opts)=>{request={url:String(url),opts};return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({summary:'Requested support'})}]}}],usageMetadata:{totalTokenCount:44}}));};
  try{const result=await geminiAnalyze({metadata:{bu:'VOX'},speakerMapping:{spk_1:'Customer'},segments:[{speakerId:'spk_1',text:'Help',startMs:0,endMs:1000}]},env,'Do not invent evidence',(d)=>d);
    assert.equal(result.intelligence.summary,'Requested support');assert.equal(result.usage.totalTokenCount,44);
    assert.equal(JSON.parse(request.opts.body).generationConfig.responseMimeType,'application/json');
    assert.ok(request.url.includes('gemini-3.8-flash'));
  }finally{globalThis.fetch=prior;}
});
test('missing Gemini key fails without calling provider',async()=>{
  await assert.rejects(()=>geminiTranscribe(new File([new Uint8Array(5)],'x.mp3'),'',{}),/GEMINI_API_KEY/);
});