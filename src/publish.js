import {randomUUID} from 'node:crypto';
import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
import {buildRelativePath} from '../public/local-folders.js';

/** Manual upload results use the same BU-first object layout as S3 automation.
 * Server-side writer: no S3 keys or AWS credentials are exposed to the browser.
 */
const pathJoin=(...parts)=>parts.map(x=>String(x||'').replace(/^\/+|\/+$/g,'')).filter(Boolean).join('/');
function check(pkg){
  if(!pkg||typeof pkg!=='object'||pkg.readyForQA!==true||!pkg.intelligence||
     !Array.isArray(pkg.transcript?.segments)||!pkg.transcript.segments.length||
     !pkg.metadata||typeof pkg.metadata!=='object')
    throw Error('A complete analyzed interaction package is required.');
  if(pkg.transcript.segments.length>2000)throw Error('Too many transcript segments.');
  for(const s of pkg.transcript.segments){
    if(!Number.isInteger(s.startMs)||!Number.isInteger(s.endMs)||
       s.startMs<0||s.endMs<=s.startMs||typeof s.text!=='string'||!s.text.trim()||
       !['Agent','Customer','Other'].includes(s.speaker))
      throw Error('Invalid timestamp or speaker role in transcript.');
  }
}
async function write(s3,env,key,value,contentType='application/json'){
  const body=contentType==='application/json'?JSON.stringify(value,null,2)+'\n':value;
  const params={Bucket:env.S3_OUTPUT_BUCKET,Key:key,Body:body,ContentType:contentType};
  if(env.S3_KMS_KEY_ID){params.ServerSideEncryption='aws:kms';params.SSEKMSKeyId=env.S3_KMS_KEY_ID;}
  await s3.send(new PutObjectCommand(params));
}
export async function publishManualPackage(pkg,env){
  check(pkg);
  if(!env.S3_OUTPUT_BUCKET||!(env.AWS_REGION||env.AWS_DEFAULT_REGION))
    throw Error('S3 output destination or AWS Region is not configured.');
  const s3=new S3Client({region:env.AWS_REGION||env.AWS_DEFAULT_REGION});
  const date=new Date();
  const prefix=pathJoin(env.S3_OUTPUT_PREFIX||'03_Completed/',
    ...buildRelativePath(pkg.metadata,date).slice(1),'run-'+date.toISOString().replace(/[-:.TZ]/g,'')+'-'+randomUUID().slice(0,8));
  const transcript=pkg.transcript;
  const summary={summary:pkg.intelligence.summary,reasonForContact:pkg.intelligence.reasonForContact,
    issues:pkg.intelligence.issues,actions:pkg.intelligence.actions,resolution:pkg.intelligence.resolution,
    commitments:pkg.intelligence.commitments,nextSteps:pkg.intelligence.nextSteps,
    closingSentiment:pkg.intelligence.closingSentiment};
  const provenance=transcript.segments.map((s,index)=>({
    segmentIndex:index,source:'timestamped_transcript',
    startMs:s.startMs,endMs:s.endMs,speaker:s.speaker,text:s.text
  }));
  const artifacts={
    'Full_Transcript/transcript.json':transcript,
    'CRM_Summary/summary.json':summary,
    'Machine_Data/interaction_metadata.json':pkg.metadata,
    'Machine_Data/universal_intelligence.json':pkg.intelligence,
    'Machine_Data/timeline_metrics.json':pkg.timelineMetrics||{status:'NOT_AVAILABLE'},
    'Machine_Data/acoustic_evidence.json':{status:'NOT_PROCESSED',reason:'Waveform acoustic analyzer not implemented.'},
    'Machine_Data/evidence_provenance.json':{
      sourceRecording:pkg.recording?.originalFileName||null,
      speakerRoleSource:pkg.speakerRoleSource||'unspecified',
      speakerRolesVerified:pkg.speakerRolesVerified===true,segments:provenance}
  };
  for(const [name,data] of Object.entries(artifacts))
    await write(s3,env,pathJoin(prefix,name),data);
  const manifest={schemaVersion:'1.1',producer:'MAFer Audio Intelligence',
    status:'COMPLETE',source:'manual_audio_upload',createdAt:date.toISOString(),
    bu:pkg.metadata.bu||null,brand:pkg.metadata.brand||null,market:pkg.metadata.market||null,
    agentName:pkg.metadata.agentName||null,interactionId:pkg.metadata.conversationId||null,
    qaScoringPerformed:false,speakerRolesVerified:pkg.speakerRolesVerified===true,
    acousticStatus:'NOT_PROCESSED',files:Object.keys(artifacts),outputPrefix:prefix};
  await write(s3,env,pathJoin(prefix,'manifest.json'),manifest);
  s3.destroy();
  return {path:prefix,status:'COMPLETE'};
}
