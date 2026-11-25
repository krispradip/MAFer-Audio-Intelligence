import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,extname,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {S3Client,ListObjectsV2Command} from '@aws-sdk/client-s3';
import {handle} from '../worker.mjs';
import {createProcessingGuard} from './processing-guard.js';
import {createS3Processor} from './s3-processor.js';
import {publishManualPackage} from './publish.js';

// Same Node.js 24 EKS pattern as corporate MAFerLens: serve public/ and APIs on 8080.
const PUBLIC_DIR=resolve(dirname(fileURLToPath(import.meta.url)),'../public');
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
function responseJson(obj,status=200){
  return new Response(JSON.stringify(obj),{status,headers:{
    'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff'}});
}
async function serveAsset(request){
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD'}});
  let path;
  try{path=decodeURIComponent(new URL(request.url).pathname);}
  catch{return new Response('Bad path',{status:400});}
  const filename=resolve(PUBLIC_DIR,'.'+(path==='/'?'/index.html':path));
  if(!filename.startsWith(PUBLIC_DIR+sep))return new Response('Not found',{status:404});
  try{
    const body=await readFile(filename);
    return new Response(request.method==='HEAD'?null:body,{
      headers:{'content-type':TYPES[extname(filename)]||'application/octet-stream',
        'x-content-type-options':'nosniff','cache-control':'no-cache'}});
  }catch(e){
    if(['ENOENT','EISDIR','ENOTDIR','EINVAL'].includes(e.code))return new Response('Not found',{status:404});
    throw e;
  }
}
function requiredReady(env){
  const audio=env.TRANSCRIPTION_PROVIDER||'amazon';
  const analysis=env.ANALYSIS_PROVIDER||'enterprise';
  const region=env.AWS_REGION||env.AWS_DEFAULT_REGION;
  const storage=Boolean(region&&env.S3_INPUT_BUCKET&&env.S3_OUTPUT_BUCKET);
  const transcribe=audio==='amazon'&&storage;
  const llm=analysis==='enterprise'&&Boolean(env.ENTERPRISE_AI_ENDPOINT&&env.ENTERPRISE_AI_API_KEY&&
    !String(env.ENTERPRISE_AI_API_KEY).startsWith('vault:'));
  return {ready:transcribe&&llm,transcriptionConfigured:transcribe,intelligenceConfigured:llm,
    s3Configured:storage,transcriptionProvider:audio,intelligenceProvider:analysis};
}
const publicConfig=env=>({
  transcriptionProvider:env.TRANSCRIPTION_PROVIDER||'amazon',
  analysisProvider:env.ANALYSIS_PROVIDER||'enterprise',
  analysisModel:env.ANALYSIS_MODEL||'gpt-4o',
  awsRegion:env.AWS_REGION||env.AWS_DEFAULT_REGION||null,
  input:{type:'s3',bucket:env.S3_INPUT_BUCKET||null,prefix:env.S3_INPUT_PREFIX||'01_Incoming/'},
  output:{type:'s3',bucket:env.S3_OUTPUT_BUCKET||null,prefix:env.S3_OUTPUT_PREFIX||'03_Completed/'},
  scanEnabled:String(env.S3_PROCESS_ENABLED||'false')==='true',
  configurationSource:'EKS runtime environment and secret bindings',
  runtimeSettingsEditable:false,
  credentialsSource:'AWS Pod Identity/IRSA and Vault-injected secrets; never returned to browser'
});
export function createAppServer(rawEnv=process.env){
  const env={
    ...rawEnv,
    TRANSCRIPTION_PROVIDER:rawEnv.TRANSCRIPTION_PROVIDER||'amazon',
    ANALYSIS_PROVIDER:rawEnv.ANALYSIS_PROVIDER||'enterprise'
  };
  const applicationEnv={...env,AUDIO_RATE_LIMITER:createProcessingGuard({
    limit:Math.max(5,Number(env.APP_REQUEST_LIMIT_PER_MINUTE||40))})};
  const processor=createS3Processor(env,applicationEnv);
  const origin=new URL(env.PUBLIC_ORIGIN||'http://localhost:8080').origin;
  const server=createServer({requestTimeout:720000,headersTimeout:20000},async(incoming,outgoing)=>{
    try{
      const chunks=[];let size=0;
      for await(const chunk of incoming){
        size+=chunk.length;
        if(size>27*1024*1024){
          outgoing.writeHead(413,{'content-type':'application/json',connection:'close'});
          outgoing.end(JSON.stringify({ok:false,error:{code:'TOO_LARGE',message:'Maximum request size exceeded.'}}));
          return;
        }
        chunks.push(chunk);
      }
      const request=new Request(origin+(incoming.url||'/'),{
        method:incoming.method,headers:incoming.headers,
        ...(!['GET','HEAD'].includes(incoming.method)?{body:Buffer.concat(chunks)}:{})
      });
      const path=new URL(request.url).pathname;
      let reply;
      if(path==='/readyz'&&request.method==='GET'){
        const ready=requiredReady(env);reply=responseJson(ready,ready.ready?200:503);
      }
      else if(path==='/api/livez'&&request.method==='GET')reply=responseJson({ok:true,service:'mafer-audio-intelligence'});
      else if(path==='/api/config'&&request.method==='GET')reply=responseJson({ok:true,config:publicConfig(env)});
      else if(path==='/api/operations'&&request.method==='GET')reply=responseJson({ok:true,operations:processor.state});
      else if(path==='/api/connections/health'&&request.method==='GET'){
        const region=env.AWS_REGION||env.AWS_DEFAULT_REGION;
        if(!region||!env.S3_INPUT_BUCKET||!env.S3_OUTPUT_BUCKET)reply=responseJson({ok:false,s3:'not_configured'},503);
        else {
          try{
            const s3=new S3Client({region});
            await Promise.all([env.S3_INPUT_BUCKET,env.S3_OUTPUT_BUCKET].map(Bucket=>
              s3.send(new ListObjectsV2Command({Bucket,MaxKeys:1,
                Prefix:Bucket===env.S3_INPUT_BUCKET?(env.S3_INPUT_PREFIX||'01_Incoming/'):(env.S3_OUTPUT_PREFIX||'03_Completed/')}))));
            s3.destroy();
            reply=responseJson({ok:true,s3:'list_access_verified',region,
              transcribe:'configured_not_tested',enterpriseAI:'configured_not_tested'});
          }catch(error){reply=responseJson({ok:false,s3:'connection_failed',code:error.name||'UNKNOWN'},503);}
        }
      }else if(path==='/api/publish'&&request.method==='POST'){
        const submittedOrigin=request.headers.get('origin');
        if(submittedOrigin&&submittedOrigin!==origin)reply=responseJson({ok:false,error:{code:'ORIGIN_REJECTED',message:'Cross-origin processing blocked.'}},403);
        else {
          try{
            const raw=Buffer.concat(chunks).toString('utf8');
            if(raw.length>300000)throw Error('Output JSON exceeds the allowed size.');
            const value=await publishManualPackage(JSON.parse(raw),env);
            reply=responseJson({ok:true,...value});
          }catch(error){reply=responseJson({ok:false,error:{code:'PUBLISH_FAILED',message:String(error.message||'Unable to save output').slice(0,230)}},422);}
        }
      }else if(path.startsWith('/api/')&&request.method==='POST'){
        const submittedOrigin=request.headers.get('origin');
        if(submittedOrigin&&submittedOrigin!==origin)reply=responseJson({ok:false,error:{code:'ORIGIN_REJECTED',message:'Cross-origin processing blocked.'}},403);
        else reply=await handle(request,applicationEnv);
      }else reply=await handle(request,{...applicationEnv,ASSETS:{fetch:serveAsset}});
      outgoing.writeHead(reply.status,Object.fromEntries(reply.headers));
      if(incoming.method==='HEAD')outgoing.end();
      else outgoing.end(Buffer.from(await reply.arrayBuffer()));
    }catch(error){
      if(!outgoing.headersSent)outgoing.writeHead(500,{'content-type':'application/json','cache-control':'no-store'});
      outgoing.end(JSON.stringify({ok:false,error:{code:'SERVER_ERROR',message:'Internal server error'}}));
      // Avoid logging request bodies or customer audio.
      console.error('MAFer API failure:',error?.name||'Error');
    }
  });
  return {server,processor,ready:()=>requiredReady(env)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const {server,processor}=createAppServer();
  server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>{
    console.log('MAFer Audio Intelligence EKS runtime listening on',server.address().port);
    processor.start();
  });
  const shutdown=()=>{
    processor.stop();
    server.close();
    setTimeout(()=>server.closeAllConnections(),25000).unref();
  };
  process.once('SIGTERM',shutdown);
  process.once('SIGINT',shutdown);
}
