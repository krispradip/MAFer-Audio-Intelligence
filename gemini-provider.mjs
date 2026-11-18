/** Gemini provider adapter for MAFer Audio Intelligence.
 * Uses the Gemini Files API and GenerateContent. Does not store credentials or fabricate results.
 * The provider-specific transcript is normalized to the existing QA handoff contract.
 */
const HOST = 'https://generativelanguage.googleapis.com';
const MAX_PROVIDER_MESSAGE = 220;
const MIME = Object.freeze({mp3:'audio/mp3',wav:'audio/wav',m4a:'audio/m4a',aac:'audio/aac',flac:'audio/flac',ogg:'audio/ogg',webm:'audio/webm',mpeg:'audio/mpeg',mpga:'audio/mpeg',aiff:'audio/aiff'});
function failure(message, code='GEMINI_INVALID_RESPONSE', stage='gemini-response') { const e = new Error(message);e.code=code;e.stage=stage;return e; }
async function responseJson(response) {
  if(response.status>=300 && response.status<400)throw failure('Google API returned an unexpected redirect; request not followed.','GEMINI_UNEXPECTED_REDIRECT');
  const body=await response.text();let parsed;
  try {parsed=JSON.parse(body);}catch {parsed=null;}
  if(!response.ok) {
    const providerMessage=String(parsed?.error?.message||`Google API returned HTTP ${response.status}`).slice(0,MAX_PROVIDER_MESSAGE);
    throw failure(providerMessage,`GEMINI_${response.status}`);
  }
  if(!parsed||typeof parsed!=='object')throw failure('Gemini returned a non-JSON response.');
  return parsed;
}
function offsetMs(offset){
  if(typeof offset!=='string'||!/^\d+(?:\.\d{1,9})?s$/.test(offset))throw failure('Gemini did not provide valid word timestamps.');
  const n=Math.round(parseFloat(offset)*1000);
  if(!Number.isSafeInteger(n))throw failure('Gemini timestamp is invalid.');
  return n;
}
function joinWords(words){
  return words.map(w=>String(w).trim()).filter(Boolean).join(' ').replace(/\s+([.,!?;:،؛؟])/g,'$1').trim();
}
/** Converts provider-generated, time-aligned words to evidence segments.
 * Every word MUST carry start/end and a speaker label on its turn; no model guesswork.
 */
export function parseGeminiTranscript(result){
  const parts=result?.candidates?.[0]?.content?.parts||[];
  const segments=[];
  for(const part of parts){
    const trans=part?.audioTranscription;
    if(!trans)continue;
    if(!Array.isArray(trans.words)||!trans.words.length)continue;
    let current=null;
    for(const w of trans.words){
      const word=String(w?.word||'').trim(),speaker=String(w?.speakerLabel||trans.speakerLabel||'').trim();
      if(!speaker||!word)throw failure('Gemini transcript is missing speaker or word text.');
      const startMs=offsetMs(w.startOffset),endMs=offsetMs(w.endOffset);
      if(endMs<=startMs)throw failure('Gemini transcript contains invalid word timing.');
      if(!current||current.speakerId!==speaker||current.words.length>=40||startMs-current.endMs>2400){
        if(current)segments.push(current);
        current={speakerId:speaker,startMs,endMs,words:[word]};
      }else{
        if(startMs<current.startMs)throw failure('Gemini transcript word timestamps are out of order.');
        current.endMs=Math.max(current.endMs,endMs);current.words.push(word);
      }
    }
    if(current)segments.push(current);
  }
  if(!segments.length)throw failure('Gemini returned no speaker-labeled, time-aligned words. Cannot complete QA-ready transcription.');
  return segments.map(s=>({speakerId:s.speakerId,startMs:s.startMs,endMs:s.endMs,text:joinWords(s.words)}))
    .sort((a,b)=>a.startMs-b.startMs);
}
function audioMime(audio){
  const extension=String(audio?.name||'').split('.').pop().toLowerCase();
  const mime=MIME[extension];
  if(!mime)throw failure('Google transcription supports WAV, MP3, M4A, AAC, FLAC, OGG, WebM and AIFF for this MVP.','UNSUPPORTED_AUDIO');
  return mime;
}
function providerUrl(model){
  if(typeof model!=='string'||!/^[A-Za-z0-9.-]{2,80}$/.test(model))throw failure('Invalid configured Gemini model name.');
  return `${HOST}/v1beta/models/${model}:generateContent`;
}
async function postJson(url,key,data){
  return responseJson(await fetch(url, {method:'POST',headers:{'x-goog-api-key':key,'content-type':'application/json'},body:JSON.stringify(data),redirect:'manual',signal:AbortSignal.timeout(150000)}));
}
export async function uploadGeminiAudio(audio, key){
  const mime=audioMime(audio);
  // Google's Files API supports multi-MB recordings without an oversized base64 JSON request.
  const started=await fetch(`${HOST}/upload/v1beta/files`,{
    method:'POST',headers:{'x-goog-api-key':key,'X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start',
      'X-Goog-Upload-Header-Content-Length':String(audio.size),'X-Goog-Upload-Header-Content-Type':mime,'content-type':'application/json'},
    body:JSON.stringify({file:{displayName:'MAFerAudio temporary transcription'}}),redirect:'manual',signal:AbortSignal.timeout(150000)
  });
  if(!started.ok)await responseJson(started);
  const raw=started.headers.get('x-goog-upload-url');
  if(!raw)throw failure('Gemini did not provide a resumable upload URL.');
  const destination=new URL(raw);
  if(destination.protocol!=='https:'||!(destination.hostname==='googleapis.com'||destination.hostname.endsWith('.googleapis.com')))
    throw failure('Google returned an invalid upload destination.');
  const completed=await fetch(destination.toString(),{method:'POST',
    headers:{'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize','content-type':mime},
    body:audio,redirect:'manual',signal:AbortSignal.timeout(150000)});
  const info=await responseJson(completed);
  if(typeof info?.file?.uri!=='string'||typeof info?.file?.name!=='string')throw failure('Gemini file upload did not return a valid file URI and name.');
  if(!info.file.name.startsWith('files/'))throw failure('Gemini returned an invalid file reference.');
  return {uri:info.file.uri,name:info.file.name,mime};
}
async function deleteGeminiFile(name,key){
  if(!name?.startsWith('files/'))return;
  try{await fetch(`${HOST}/v1beta/${name}`,{method:'DELETE',headers:{'x-goog-api-key':key},redirect:'manual',signal:AbortSignal.timeout(12000)});}catch{}
}
export async function geminiTranscribe(audio,requestedLanguage,env){
  if(!env.GEMINI_API_KEY)throw failure('GEMINI_API_KEY is not configured in Cloudflare.','NOT_CONFIGURED');
  const model=env.TRANSCRIPTION_MODEL||'gemini-3.5-transcribe';
  let file;
  try{
    try{file=await uploadGeminiAudio(audio,env.GEMINI_API_KEY);}
    catch(e){e.stage=e.stage||'audio-upload';throw e;}
    const cfg={diarization:true,wordTimestamp:true,mode:'VERBATIM'};
    if(requestedLanguage==='en')cfg.languageCodes=['en-US'];
    if(requestedLanguage==='ar')cfg.languageCodes=['ar-XA'];
    let result;try{result=await postJson(providerUrl(model),env.GEMINI_API_KEY,{
      contents:[{role:'user',parts:[{fileData:{fileUri:file.uri,mimeType:file.mime}}]}],
      generationConfig:{audioTranscriptionConfig:cfg}
    });}catch(e){e.stage='gemini-model-request';throw e;}
    let segments;try{segments=parseGeminiTranscript(result);}catch(e){e.stage='gemini-transcript-output';throw e;}
    return {segments,language:requestedLanguage==='en'?'English':requestedLanguage==='ar'?'Arabic':'Auto-detected',provider:{transcriptionModel:model},speakerIds:[...new Set(segments.map(s=>s.speakerId))]};
  }finally{if(file)await deleteGeminiFile(file.name,env.GEMINI_API_KEY);}
}
export async function geminiAnalyze(verified,env,systemInstruction,normalize){
  if(!env.GEMINI_API_KEY)throw failure('GEMINI_API_KEY is not configured in Cloudflare.','NOT_CONFIGURED');
  const model=env.ANALYSIS_MODEL||'gemini-3.8-flash';
  const userData={metadata:verified.metadata,speakerMapping:verified.speakerMapping,segments:verified.segments.map((s,index)=>({index,...s}))};
  const result=await postJson(providerUrl(model),env.GEMINI_API_KEY,{
    systemInstruction:{parts:[{text:systemInstruction}]},contents:[{role:'user',parts:[{text:JSON.stringify(userData)}]}],
    generationConfig:{responseMimeType:'application/json',temperature:0,maxOutputTokens:8192}
  });
  const content=(result?.candidates?.[0]?.content?.parts||[]).filter(p=>typeof p.text==='string').map(p=>p.text).join('');
  let parsed;try{parsed=JSON.parse(content);}catch{throw failure('Gemini analysis did not return valid JSON.');}
  return {intelligence:normalize(parsed,verified.segments.length,Object.keys(verified.speakerMapping)),
    summaryModel:model,usage:result.usageMetadata||null};
}