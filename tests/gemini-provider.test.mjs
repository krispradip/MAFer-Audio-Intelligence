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
    assert.ok(calls.every(call=>call.opts.redirect==='manual'),'All Gemini requests must use Cloudflare-supported manual redirects');
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
test('Gemini explicitly rejects HTTP redirect without following a provider upload URL',async()=>{
  const previous=globalThis.fetch;let calls=0;
  globalThis.fetch=async (url,options)=>{
    calls++;
    assert.equal(options.redirect,'manual');
    return new Response('',{status:302,headers:{location:'https://untrusted.example/redirect'}});
  };
  try{
    await assert.rejects(
      ()=>geminiTranscribe(new File([new Uint8Array(50)],'synthetic.mp3',{type:'audio/mpeg'}),'en',env),
      error=>error.code==='GEMINI_UNEXPECTED_REDIRECT' && /unexpected redirect/i.test(error.message)
    );
    assert.equal(calls,1,'Never follow an untrusted upstream redirect');
  }finally{globalThis.fetch=previous;}
});


test('preserves zero-duration words inside genuinely timestamped speaker turns',()=>{
  const input={candidates:[{content:{parts:[
    {audioTranscription:{speakerLabel:'spk_1',words:[
      {word:'I',startOffset:'0s',endOffset:'0.2s'},
      {word:'uh',startOffset:'0.2s',endOffset:'0.2s'},
      {word:'agree.',startOffset:'0.2s',endOffset:'0.6s'}
    ]}},
    {audioTranscription:{speakerLabel:'spk_2',words:[
      {word:'Yes.',startOffset:'1s',endOffset:'1.3s'}
    ]}}
  ]}}]};
  const s=parseGeminiTranscript(input);
  assert.deepEqual(s,[{speakerId:'spk_1',startMs:0,endMs:600,text:'I uh agree.'},{speakerId:'spk_2',startMs:1000,endMs:1300,text:'Yes.'}]);
});
test('zero-length words across adjacent Gemini parts attach to the same measurable speaker turn',()=>{
  const input={candidates:[{content:{parts:[
    {audioTranscription:{speakerLabel:'spk_1',words:[{word:'Um',startOffset:'0s',endOffset:'0s'}]}},
    {audioTranscription:{speakerLabel:'spk_1',words:[{word:'hello',startOffset:'0.2s',endOffset:'0.7s'}]}},
    {audioTranscription:{speakerLabel:'spk_1',words:[{word:'!',startOffset:'0.7s',endOffset:'0.7s'}]}}
  ]}}]};
  assert.deepEqual(parseGeminiTranscript(input),[{speakerId:'spk_1',startMs:0,endMs:700,text:'Um hello!'}]);
});
test('sub-millisecond offsets rounded to one millisecond can be grouped, without altering provider times',()=>{
  const input={candidates:[{content:{parts:[{audioTranscription:{speakerLabel:'spk_1',words:[
    {word:'Hm',startOffset:'0.0001s',endOffset:'0.0002s'},
    {word:'yes',startOffset:'0.3s',endOffset:'0.5s'}
  ]}}]}}]};
  assert.deepEqual(parseGeminiTranscript(input),[{speakerId:'spk_1',startMs:0,endMs:500,text:'Hm yes'}]);
});
test('rejects reversed timestamps and turns with no measurable duration; never invents offsets',()=>{
  const one=(words)=>({candidates:[{content:{parts:[{audioTranscription:{speakerLabel:'spk_1',words}}]}}]});
  assert.throws(()=>parseGeminiTranscript(one([{word:'Hi',startOffset:'2s',endOffset:'1s'}])),/reversed/);
  assert.throws(()=>parseGeminiTranscript(one([{word:'Hi',startOffset:'1s',endOffset:'1s'}])),e=>e.code==='GEMINI_ZERO_DURATION_TURN');
  assert.throws(()=>parseGeminiTranscript(one([{word:'Um',startOffset:'0s',endOffset:'0s'},{word:'Hello',startOffset:'5s',endOffset:'6s'}])),e=>e.code==='GEMINI_ZERO_DURATION_TURN');
});
test('keeps overlapping speakers in separate timestamped turns',()=>{
  const input={candidates:[{content:{parts:[
    {audioTranscription:{speakerLabel:'spk_1',words:[{word:'A',startOffset:'0s',endOffset:'1s'}]}},
    {audioTranscription:{speakerLabel:'spk_2',words:[{word:'B',startOffset:'0.8s',endOffset:'1.1s'}]}}
  ]}}]};
  const s=parseGeminiTranscript(input);
  assert.equal(s.length,2);assert.equal(s[0].speakerId,'spk_1');assert.equal(s[1].speakerId,'spk_2');
});


test('Gemini transient 503 retries only model generation and reuses already uploaded file',async()=>{
  const prior=globalThis.fetch;const calls=[];let modelCalls=0;
  globalThis.fetch=async (url,opts)=>{
    calls.push({url:String(url),method:opts.method});
    if(calls.length===1)return new Response('',{headers:{'x-goog-upload-url':'https://generativelanguage.googleapis.com/upload/session-test'}});
    if(calls.length===2)return new Response(JSON.stringify({file:{uri:'https://generativelanguage.googleapis.com/v1beta/files/test',name:'files/test'}}));
    if(String(url).includes(':generateContent')){
      modelCalls++;
      if(modelCalls<=2)return new Response(JSON.stringify({error:{message:'High model demand'}}),{status:503});
      return new Response(JSON.stringify(example));
    }
    if(opts.method==='DELETE')return new Response('{}');
    throw Error('Unexpected fetch');
  };
  try{
    const result=await geminiTranscribe(new File([new Uint8Array(100)],'synthetic.wav',{type:'audio/wav'}),'',env);
    assert.equal(result.segments.length,2);
    assert.equal(modelCalls,3);
    assert.equal(calls.filter(x=>x.url.includes('/upload/v1beta/files')).length,1);
    assert.equal(calls.filter(x=>x.method==='DELETE').length,1);
    assert.equal(calls.length,6);
  }finally{globalThis.fetch=prior;}
});
test('Gemini nontransient 400 is never retried',async()=>{
  const prior=globalThis.fetch;let modelCalls=0,calls=0;
  globalThis.fetch=async(url,opts)=>{
    calls++;
    if(calls===1)return new Response('',{headers:{'x-goog-upload-url':'https://generativelanguage.googleapis.com/upload/test'}});
    if(calls===2)return new Response(JSON.stringify({file:{uri:'https://generativelanguage.googleapis.com/v1beta/files/test',name:'files/test'}}));
    if(opts.method==='DELETE')return new Response('{}');
    modelCalls++;return new Response(JSON.stringify({error:{message:'Invalid request'}}),{status:400});
  };
  try{
    await assert.rejects(()=>geminiTranscribe(new File([new Uint8Array(100)],'synthetic.wav'),'en',env),error=>error.code==='GEMINI_400');
    assert.equal(modelCalls,1);
    assert.equal(calls,4);
  }finally{globalThis.fetch=prior;}
});
