import {createHash} from 'node:crypto';
import {S3Client,ListObjectsV2Command,GetObjectCommand,PutObjectCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
import {amazonTranscribeS3} from './aws-transcribe.js';
import {handle as intelligenceAPI} from '../worker.mjs';
import {deriveTimelineMetrics} from '../public/timeline-metrics.js';
import {metadataFromJson,conversationIdFromFilename} from '../public/metadata.js';

const AUDIO=/\.(mp3|wav|m4a|flac|ogg|webm|mp4)$/i;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const noSlash=s=>String(s||'').replace(/^\/+/, '').replace(/\/+/g,'/');
const pathPart=(value,fallback='Unknown')=>String(value||'').trim().replace(/[^a-zA-Z0-9._-]/g,'_').replace(/^\.+/,'').slice(0,90)||fallback;
const pad=x=>String(x).padStart(2,'0');
const join=(prefix,...parts)=>[noSlash(prefix).replace(/\/$/,''),...parts].filter(Boolean).join('/');
const fingerprint=(bucket,key,etag)=>createHash('sha256').update(bucket+'\n'+key+'\n'+String(etag||'')).digest('hex').slice(0,20);
function outputPrefix(env,meta,date,sourceHash){
  const interactionId=pathPart(meta.conversationId,'source-'+sourceHash);
  return join(env.S3_OUTPUT_PREFIX||'03_Completed/',
    pathPart(meta.bu,'Unassigned'),pathPart(meta.brand,'Unspecified'),
    pathPart(meta.market,'Unknown'),String(date.getUTCFullYear()),
    pad(date.getUTCMonth()+1),pad(date.getUTCDate()),interactionId,'run-'+sourceHash);
}
async function exists(s3,bucket,key){
  try{await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}));return true;}
  catch(e){if(e?.$metadata?.httpStatusCode===404||e.name==='NotFound'||e.name==='NoSuchKey')return false;throw e;}
}
async function readJson(s3,bucket,key){
  const r=await s3.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  const text=await r.Body.transformToString();
  if(text.length>256*1024)throw Error('Metadata sidecar too large.');
  return JSON.parse(text);
}
async function sourceMetadata(s3,bucket,key){
  let parsed={};
  const stem=key.replace(/\.[^./]+$/,'');
  for(const candidate of [stem+'.metadata.json',stem+'.json',key+'.json']){
    try{parsed=metadataFromJson(await readJson(s3,bucket,candidate));break;}
    catch(e){if(e?.$metadata?.httpStatusCode===404||e?.name==='NoSuchKey')continue;throw e;}
  }
  const parts=key.split('/');
  const knownBU=['SHARE','VOX','Retail','AMBU'];
  const tagged=parts.map(x=>x.replace(/^bu=/i,'')).find(x=>knownBU.some(v=>v.toLowerCase()===x.toLowerCase()));
  const bu=parsed.bu||knownBU.find(v=>v.toLowerCase()===String(tagged||'').toLowerCase())||'';
  const conversationId=parsed.conversationId||conversationIdFromFilename(parts.at(-1));
  return {...parsed,conversationId,bu,agentName:parsed.agentName||'',
    brand:parsed.brand||'',market:parsed.market||'',source:'S3 automatic ingestion'};
}
async function internalRequest(endpoint,data,env){
  const r=await intelligenceAPI(new Request('http://internal.mafer/api/'+endpoint,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(data)
  }),env);
  const body=await r.json();
  if(!r.ok||!body.ok)throw Error(endpoint+' failed: '+String(body?.error?.message||'HTTP '+r.status).slice(0,200));
  return body;
}
async function putJson(s3,bucket,key,data,env){
  const args={Bucket:bucket,Key:key,Body:JSON.stringify(data,null,2)+'\n',ContentType:'application/json'};
  if(env.S3_KMS_KEY_ID){args.ServerSideEncryption='aws:kms';args.SSEKMSKeyId=env.S3_KMS_KEY_ID;}
  await s3.send(new PutObjectCommand(args));
}
async function putText(s3,bucket,key,text,env){
  const args={Bucket:bucket,Key:key,Body:text,ContentType:'text/plain; charset=utf-8'};
  if(env.S3_KMS_KEY_ID){args.ServerSideEncryption='aws:kms';args.SSEKMSKeyId=env.S3_KMS_KEY_ID;}
  await s3.send(new PutObjectCommand(args));
}
export function createS3Processor(env,processingEnv){
  const enabled=String(env.S3_PROCESS_ENABLED||'false').toLowerCase()==='true';
  const region=env.AWS_REGION||env.AWS_DEFAULT_REGION;
  const inputBucket=env.S3_INPUT_BUCKET,outputBucket=env.S3_OUTPUT_BUCKET;
  const intervalMs=Math.max(30000,Number(env.S3_SCAN_INTERVAL_SECONDS||90)*1000);
  const state={enabled,ready:false,status:enabled?'initializing':'disabled',
    scannedAt:null,current:null,completed:0,needsReview:0,failed:0,queued:0,errors:[],recent:[]};
  if(!enabled)return {state,start(){},stop(){}};
  if(!region||!inputBucket||!outputBucket)throw Error('AWS_REGION, S3_INPUT_BUCKET and S3_OUTPUT_BUCKET required.');
  if(inputBucket===outputBucket){
    const input=noSlash(env.S3_INPUT_PREFIX||'01_Incoming/'),output=noSlash(env.S3_OUTPUT_PREFIX||'03_Completed/');
    if(input===output||output.startsWith(input)||input.startsWith(output))
      throw Error('S3 input and output prefixes must not overlap.');
  }
  const s3=new S3Client({region});
  let busy=false,stopped=false,timer;
  async function writePackage(prefix,data){
    for(const [path,body] of Object.entries(data)){
      if(path==='manifest.json')continue;
      if(typeof body==='string')await putText(s3,outputBucket,join(prefix,path),body,env);
      else await putJson(s3,outputBucket,join(prefix,path),body,env);
    }
    // The manifest is the publication marker; write it last.
    await putJson(s3,outputBucket,join(prefix,'manifest.json'),data['manifest.json'],env);
  }
  async function processObject(obj){
    const sourceHash=fingerprint(inputBucket,obj.Key,obj.ETag);
    const meta=await sourceMetadata(s3,inputBucket,obj.Key);
    const date=obj.LastModified instanceof Date?obj.LastModified:new Date();
    const prefix=outputPrefix(env,meta,date,sourceHash);
    const manifestKey=join(prefix,'manifest.json');
    if(await exists(s3,outputBucket,manifestKey))return {skipped:true};
    state.current={sourceKey:obj.Key,stage:'transcription'};
    const transcript=await amazonTranscribeS3({inputBucket,inputKey:obj.Key,
      requestedLanguage:'',env,outputBucket});
    let mapping={},roleSource='needs_human_review',roleLabels=[],intelligence=null,analysis=null;
    const speakerResult=await internalRequest('identify-speakers',{segments:transcript.segments},processingEnv);
    mapping=speakerResult.speakerMapping;
    roleLabels=speakerResult.speakers||[];
    if(!speakerResult.requiresReview){
      roleSource='transcript_inference_unverified';
      state.current.stage='intelligence';
      analysis=await internalRequest('analyze',{segments:transcript.segments,
        speakerMapping:mapping,roleSource,metadata:meta},processingEnv);
      intelligence=analysis.intelligence;
    }
    const status=intelligence?'COMPLETE':'NEEDS_SPEAKER_REVIEW';
    const fullTranscript={...transcript,
      segments:transcript.segments.map(s=>({...s,speaker:mapping[s.speakerId]||'Unverified'}))};
    const summary=intelligence?{
      summary:intelligence.summary,reasonForContact:intelligence.reasonForContact,
      issues:intelligence.issues,actions:intelligence.actions,resolution:intelligence.resolution,
      commitments:intelligence.commitments,nextSteps:intelligence.nextSteps,
      closingSentiment:intelligence.closingSentiment
    }:{status:'NEEDS_SPEAKER_REVIEW',summary:null};
    const metrics=deriveTimelineMetrics(transcript.segments,mapping,null);
    const evidence=transcript.segments.map((s,index)=>({
      index,source:'provider_timestamped_transcript',startMs:s.startMs,
      endMs:s.endMs,speakerId:s.speakerId,role:mapping[s.speakerId]||'Unverified',text:s.text
    }));
    const lineText=fullTranscript.segments.map(s=>'['+s.startMs+'-'+s.endMs+'ms] '+s.speaker+': '+s.text).join('\n')+'\n';
    const documents={
      'Full_Transcript/transcript.json':fullTranscript,
      'Full_Transcript/transcript.txt':lineText,
      'CRM_Summary/summary.json':summary,
      'Machine_Data/interaction_metadata.json':meta,
      'Machine_Data/universal_intelligence.json':intelligence||{status:'NEEDS_SPEAKER_REVIEW'},
      'Machine_Data/timeline_metrics.json':metrics,
      'Machine_Data/acoustic_evidence.json':{status:'NOT_PROCESSED',reason:'No waveform acoustic analysis is attached. Timestamp candidates are not audio-verified.'},
      'Machine_Data/evidence_provenance.json':{sourceBucket:inputBucket,sourceKey:obj.Key,sourceEtag:obj.ETag,
        speakerMappingSource:roleSource,speakerRolesVerified:false,speakerLabels:roleLabels,segments:evidence},
      'manifest.json':{schemaVersion:'1.1',status,producer:'MAFer Audio Intelligence',
        createdAt:new Date().toISOString(),source:{bucket:inputBucket,key:obj.Key,etag:obj.ETag},
        interactionId:meta.conversationId||null,bu:meta.bu||null,agentName:meta.agentName||null,
        market:meta.market||null,brand:meta.brand||null,speakerRoleSource:roleSource,
        speechStatus:'completed',intelligenceStatus:intelligence?'completed':'NEEDS_SPEAKER_REVIEW',
        acousticStatus:'NOT_PROCESSED',qaScoringPerformed:false,
        provider:transcript.provider,model:analysis?.summaryModel||null,
        files:Object.keys(documents).filter(x=>x!=='manifest.json'),outputPrefix:prefix}
    };
    state.current.stage='saving';
    await writePackage(prefix,documents);
    return {status,prefix};
  }
  async function scan(){
    if(busy||stopped)return;
    busy=true;state.status='scanning';state.scannedAt=new Date().toISOString();
    try{
      const result=await s3.send(new ListObjectsV2Command({
        Bucket:inputBucket,Prefix:noSlash(env.S3_INPUT_PREFIX||'01_Incoming/'),MaxKeys:Math.min(1000,Math.max(1,Number(env.S3_SCAN_MAX_KEYS||500)))
      }));
      const files=(result.Contents||[]).filter(x=>x?.Key&&AUDIO.test(x.Key)&&Number(x.Size)>0)
        .sort((a,b)=>new Date(a.LastModified)-new Date(b.LastModified));
      const batchLimit=Math.max(1,Math.min(25,Number(env.S3_MAX_BATCH||3)));
      state.queued=files.length;
      let attempts=0;
      for(const item of files){
        if(attempts>=batchLimit)break;
        state.current={sourceKey:item.Key,stage:'starting'};
        try{
          const value=await processObject(item);
          if(!value?.skipped)attempts++;
          if(value?.status==='COMPLETE')state.completed++;
          else if(value?.status==='NEEDS_SPEAKER_REVIEW')state.needsReview++;
          state.recent.unshift({key:item.Key,status:value?.status||'SKIPPED',at:new Date().toISOString()});
        }catch(error){
          attempts++;
          state.failed++;
          state.errors.unshift({key:item.Key,message:String(error.message||'Processing error').slice(0,200),at:new Date().toISOString()});
        }
        state.recent=state.recent.slice(0,20);
        state.errors=state.errors.slice(0,20);
      }
      state.status='idle';state.ready=true;
    }catch(error){
      state.status='error';state.errors.unshift({message:String(error.message||'S3 scan failed').slice(0,250),at:new Date().toISOString()});
      state.errors=state.errors.slice(0,20);
    }finally{state.current=null;busy=false;}
  }
  return {state,start(){
    void scan();
    timer=setInterval(()=>{void scan();},intervalMs);
    timer.unref?.();
  },stop(){stopped=true;if(timer)clearInterval(timer);}};
}
