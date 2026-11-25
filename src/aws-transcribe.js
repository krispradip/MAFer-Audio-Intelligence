import {randomUUID} from 'node:crypto';
import {S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand} from '@aws-sdk/client-s3';
import {TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand} from '@aws-sdk/client-transcribe';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const audioExtensions=new Set(['wav','mp3','mp4','flac','ogg','webm','m4a','amr']);
const safePrefix=p=>String(p||'').replace(/^\/+/, '').replace(/\/+/g,'/');
const seconds=v=>Number.isFinite(Number(v))?Math.round(Number(v)*1000):null;
function wordText(item){
  const content=item?.alternatives?.[0]?.content;
  return typeof content==='string'?content.trim():'';
}
export function transcribeSegments(result){
  const items=Array.isArray(result?.results?.items)?result.results.items:[];
  const speakerPeriods=(result?.results?.speaker_labels?.segments||[]).filter(x=>x?.speaker_label);
  function speakerFor(item){
    if(item.speaker_label)return String(item.speaker_label);
    const start=Number(item.start_time);
    if(!Number.isFinite(start))return 'unknown';
    const period=speakerPeriods.find(s=>Number(s.start_time)<=start&&Number(s.end_time)>=start);
    return period?.speaker_label||'unknown';
  }
  const segments=[];
  let current=null;
  for(const item of items){
    const token=wordText(item);
    if(!token)continue;
    if(item.type==='punctuation'){
      if(current)current.text+=token;
      continue;
    }
    const startMs=seconds(item.start_time),endMs=seconds(item.end_time);
    if(!Number.isInteger(startMs)||!Number.isInteger(endMs)||endMs<=startMs)continue;
    const speakerId=speakerFor(item);
    // Respect actual word timestamps; limit segments for the downstream QA contract.
    const append=current&&current.speakerId===speakerId&&startMs-current.endMs<=850&&
      current.text.length+token.length<240&&(current.endMs-current.startMs)<11000;
    if(append){
      current.text+=' '+token;current.endMs=endMs;
    }else{
      current={startMs,endMs,speakerId,text:token};segments.push(current);
    }
  }
  if(!segments.length)throw Object.assign(new Error('Amazon Transcribe returned no aligned words.'),{code:'TRANSCRIPT_EMPTY',stage:'amazon-transcribe-output'});
  if(segments.length>2000)throw Object.assign(new Error('Transcription exceeds the supported number of segments.'),{code:'TRANSCRIPT_SEGMENT_LIMIT',stage:'amazon-transcribe-output'});
  if(segments.some(s=>s.speakerId==='unknown'))
    throw Object.assign(new Error('Amazon Transcribe returned speech without reliable diarization labels.'),{code:'TRANSCRIPT_SPEAKER_UNAVAILABLE',stage:'amazon-transcribe-output'});
  return segments;
}
function languageSettings(requestedLanguage,env){
  if(requestedLanguage==='en')return {LanguageCode:env.TRANSCRIBE_EN_LANGUAGE||'en-US'};
  if(requestedLanguage==='ar')return {LanguageCode:env.TRANSCRIBE_AR_LANGUAGE||'ar-AE'};
  const mode=String(env.TRANSCRIBE_LANGUAGE_MODE||'auto').toLowerCase();
  if(mode==='multi')return {IdentifyMultipleLanguages:true,LanguageOptions:['en-US','ar-AE']};
  return {IdentifyLanguage:true,LanguageOptions:['en-US','ar-AE']};
}
function makeClients(env){
  const region=env.AWS_REGION||env.AWS_DEFAULT_REGION;
  if(!region)throw Object.assign(new Error('AWS_REGION is required.'),{code:'AWS_NOT_CONFIGURED'});
  return {s3:new S3Client({region}),transcribe:new TranscribeClient({region}),region};
}
function objectKey(prefix,suffix){
  const base=safePrefix(prefix);
  return (base?(base.endsWith('/')?base:base+'/'):'')+suffix;
}
async function fetchJson(s3,bucket,key){
  const response=await s3.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  const raw=await response.Body.transformToString();
  return JSON.parse(raw);
}
export async function amazonTranscribeS3({inputBucket,inputKey,requestedLanguage='',env,outputBucket=null}){
  const destination=outputBucket||env.S3_OUTPUT_BUCKET;
  if(!inputBucket||!inputKey||!destination)
    throw Object.assign(new Error('S3 input/output bucket configuration is missing.'),{code:'AWS_NOT_CONFIGURED'});
  const {s3,transcribe,region}=makeClients(env);
  const id=randomUUID().replace(/-/g,'');
  const jobName='mafer-'+id;
  const resultKey=objectKey(env.S3_OUTPUT_PREFIX||'03_Completed/','_transcribe_jobs/'+jobName+'.json');
  const mediaUri='s3://'+inputBucket+'/'+inputKey.split('/').map(encodeURIComponent).join('/');
  const input={TranscriptionJobName:jobName,Media:{MediaFileUri:mediaUri},
    OutputBucketName:destination,OutputKey:resultKey,
    Settings:{ShowSpeakerLabels:true,MaxSpeakerLabels:Math.min(10,Math.max(2,Number(env.MAX_SPEAKERS||5)))},
    ...languageSettings(requestedLanguage,env)};
  if(env.TRANSCRIBE_VOCABULARY_NAME)input.Settings.VocabularyName=env.TRANSCRIBE_VOCABULARY_NAME;
  await transcribe.send(new StartTranscriptionJobCommand(input));
  const maxMs=Math.max(60000,Math.min(900000,Number(env.TRANSCRIBE_MAX_WAIT_MS||600000)));
  const begin=Date.now();
  let job;
  while(Date.now()-begin<maxMs){
    const response=await transcribe.send(new GetTranscriptionJobCommand({TranscriptionJobName:jobName}));
    job=response.TranscriptionJob||{};
    if(job.TranscriptionJobStatus==='COMPLETED')break;
    if(job.TranscriptionJobStatus==='FAILED')
      throw Object.assign(new Error('Amazon Transcribe job failed: '+String(job.FailureReason||'unknown').slice(0,200)),{code:'AMAZON_TRANSCRIBE_FAILED',stage:'amazon-transcribe'});
    await sleep(4500);
  }
  if(job?.TranscriptionJobStatus!=='COMPLETED')
    throw Object.assign(new Error('Amazon Transcribe job did not finish before the timeout. Check the job using its name: '+jobName),{code:'AMAZON_TRANSCRIBE_TIMEOUT',stage:'amazon-transcribe'});
  let raw;
  try{raw=await fetchJson(s3,destination,resultKey);}
  catch(error){
    throw Object.assign(new Error('Transcription finished, but its JSON output cannot be read from S3: '+error.message),{code:'TRANSCRIBE_OUTPUT_UNAVAILABLE',stage:'amazon-transcribe-output'});
  }
  const segments=transcribeSegments(raw);
  return {segments,language:job.LanguageCode||(Array.isArray(job.LanguageCodes)?job.LanguageCodes.map(x=>x.LanguageCode).join(', '):'Auto-detected'),
    speakerIds:[...new Set(segments.map(s=>s.speakerId))],
    provider:{transcriptionModel:'amazon-transcribe',region,jobName,provider:'amazon'},transcriptionOutput:{bucket:destination,key:resultKey}};
}
export async function amazonTranscribeUpload(file,requestedLanguage,env){
  const bucket=env.S3_INPUT_BUCKET;
  if(!bucket)throw Object.assign(new Error('S3_INPUT_BUCKET is required for manual upload to Amazon Transcribe.'),{code:'AWS_NOT_CONFIGURED'});
  const ext=String(file.name||'').split('.').pop().toLowerCase();
  if(!audioExtensions.has(ext))throw Object.assign(new Error('Unsupported media format for Amazon Transcribe: '+ext),{code:'UNSUPPORTED_AUDIO'});
  const {s3}=makeClients(env);
  const key=objectKey(env.S3_INPUT_PREFIX||'01_Incoming/','_manual_staging/'+randomUUID()+'.'+ext);
  await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:Buffer.from(await file.arrayBuffer()),ContentType:file.type||'application/octet-stream'}));
  try{return await amazonTranscribeS3({inputBucket:bucket,inputKey:key,requestedLanguage,env});}
  finally{
    try{await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));}
    catch{ /* transient staging object must also be governed by S3 lifecycle expiry */ }
  }
}
