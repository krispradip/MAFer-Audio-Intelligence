// Local-folder adapter for the personal POC.
// User-selected directory handles are stored in IndexedDB, not credentials or recordings.
const DB='mafer-local-folders-v1',STORE='handles';
const AUDIO=/\.(mp3|wav|m4a|aac|flac|ogg|webm|mp4|mpeg|mpga)$/i;

export const localFoldersSupported=()=>Boolean(window.isSecureContext&&typeof window.showDirectoryPicker==='function'&&window.indexedDB);
function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function entry(key,value,write){
  const db=await openDB();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,write?'readwrite':'readonly');
    const r=write?tx.objectStore(STORE).put(value,key):tx.objectStore(STORE).get(key);
    r.onsuccess=()=>resolve(write?value:r.result||null);
    r.onerror=()=>reject(r.error);
    tx.onerror=()=>reject(tx.error);
  });}finally{db.close();}
}
export const getFolder=key=>entry(key,null,false);
export async function selectFolder(key){
  if(!localFoldersSupported())throw Error('Local folders need Microsoft Edge or Chrome on HTTPS or localhost.');
  const handle=await window.showDirectoryPicker({mode:key==='output'?'readwrite':'read'});
  await entry(key,handle,true);
  return handle;
}
export async function requireFolderPermission(handle,mode){
  if(!handle)throw Error('Choose a local folder first.');
  const opts={mode};
  if(await handle.queryPermission(opts)==='granted')return;
  if(await handle.requestPermission(opts)!=='granted')throw Error('Local folder permission was not granted.');
}
export async function listAudioFiles(){
  const root=await getFolder('input');
  await requireFolderPermission(root,'read');
  const found=[];
  async function walk(folder,prefix,depth){
    for await(const item of folder.values()){
      if(found.length>=250)return;
      if(item.kind==='file'&&AUDIO.test(item.name))
        found.push({name:item.name,relative:prefix+item.name,handle:item,parentHandle:folder});
      if(item.kind==='directory'&&depth<2&&!['03_Completed','node_modules','.git'].includes(item.name))
        await walk(item,prefix+item.name+'/',depth+1);
    }
  }
  await walk(root,'',0);
  found.sort((a,b)=>a.relative.localeCompare(b.relative));
  return {folderName:root.name,files:found,limited:found.length>=250};
}

/** Optional sidecar record for BU/agent metadata, never guessed from audio. */
export async function readMetadataSidecar(entry){
  if(!entry?.parentHandle||!entry.name)return null;
  const base=entry.name.replace(/\.[^.]+$/,'');
  for(const name of [base+'.metadata.json',base+'.json',entry.name+'.json']){
    try{
      const handle=await entry.parentHandle.getFileHandle(name);
      const f=await handle.getFile();
      if(f.size>256*1024)continue;
      const data=JSON.parse(await f.text());
      if(data&&typeof data==='object'&&!Array.isArray(data))return data;
    }catch(e){
      if(e?.name==='NotFoundError')continue;
      // Invalid JSON and permission errors are visible via the operations console.
      throw new Error('Failed to read metadata sidecar '+name+': '+e.message);
    }
  }
  return null;
}

async function verifyOutputWrite(handle){
  const name='.mafer-permission-check-'+crypto.randomUUID().slice(0,8);
  try{
    const check=await handle.getFileHandle(name,{create:true});
    const stream=await check.createWritable();
    try{await stream.write('MAFer permission check');}finally{await stream.close();}
  }finally{try{await handle.removeEntry(name);}catch{}}
}
export async function testLocalFolder(key){
  const handle=await getFolder(key);
  await requireFolderPermission(handle,key==='output'?'readwrite':'read');
  if(key==='output')await verifyOutputWrite(handle);
  return {name:handle.name,status:'Verified '+(key==='output'?'read/write':'read')+' access'};
}
const safe=(value,fallback='Unknown')=>{
  const v=String(value||'').trim().replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^\.+/,'').slice(0,80);
  return v||fallback;
};
const pad=x=>String(x).padStart(2,'0');
export function buildRelativePath(metadata={},date=new Date()){
  const id=safe(metadata.conversationId,'manual-'+crypto.randomUUID());
  return ['03_Completed',safe(metadata.bu,'Unassigned'),safe(metadata.brand,'Unspecified'),
    safe(metadata.market,'Unknown'),String(date.getUTCFullYear()),pad(date.getUTCMonth()+1),
    pad(date.getUTCDate()),id];
}
async function nestedFolder(root,parts){
  let handle=root;
  for(const name of parts)handle=await handle.getDirectoryHandle(name,{create:true});
  return handle;
}
async function writeFile(root,parts,body){
  const folder=await nestedFolder(root,parts.slice(0,-1));
  const handle=await folder.getFileHandle(parts[parts.length-1],{create:true});
  const stream=await handle.createWritable();
  try{await stream.write(body);}finally{await stream.close();}
}
function textTranscript(segments){
  function time(ms){const s=Math.floor(ms/1000);return pad(Math.floor(s/3600))+':'+pad(Math.floor(s%3600/60))+':'+pad(s%60);}
  return segments.map(s=>'['+time(s.startMs)+' - '+time(s.endMs)+'] '+s.speaker+': '+s.text).join('\n')+'\n';
}
export async function saveToLocalFolder(pkg){
  if(!pkg?.readyForQA||!Array.isArray(pkg.transcript?.segments)||!pkg.transcript.segments.length||!pkg.intelligence)
    throw Error('Finish verified transcription and intelligence analysis before saving.');
  const root=await getFolder('output');
  await requireFolderPermission(root,'readwrite');
  const date=new Date();
  const prefix=[...buildRelativePath(pkg.metadata,date),'run-'+date.toISOString().replace(/[-:.TZ]/g,'')+'-'+crypto.randomUUID().slice(0,8)];
  const summary={summary:pkg.intelligence.summary,reasonForContact:pkg.intelligence.reasonForContact,
    issues:pkg.intelligence.issues,actions:pkg.intelligence.actions,resolution:pkg.intelligence.resolution,
    commitments:pkg.intelligence.commitments,nextSteps:pkg.intelligence.nextSteps,
    closingSentiment:pkg.intelligence.closingSentiment};
  const evidence=pkg.transcript.segments.map((s,index)=>({
    segmentIndex:index,source:'transcript',speaker:s.speaker,startMs:s.startMs,endMs:s.endMs,text:s.text
  }));
  const artifacts=[
    {path:['Full_Transcript','transcript.json'],data:pkg.transcript},
    {path:['Full_Transcript','transcript.txt'],text:textTranscript(pkg.transcript.segments)},
    {path:['CRM_Summary','summary.json'],data:summary},
    {path:['Machine_Data','interaction_metadata.json'],data:pkg.metadata},
    {path:['Machine_Data','universal_intelligence.json'],data:pkg.intelligence},
    {path:['Machine_Data','timeline_metrics.json'],data:pkg.timelineMetrics||{status:'NOT_AVAILABLE'}},
    {path:['Machine_Data','acoustic_evidence.json'],data:{status:'NOT_PROCESSED',reason:'An audio-signal analyzer is not connected in this POC. No acoustic events were inferred from transcript alone.'}},
    {path:['Machine_Data','evidence_provenance.json'],data:{sourceFile:pkg.recording.originalFileName,source:'provider_timestamped_transcript',segments:evidence}}
  ];
  for(const artifact of artifacts){
    const body=artifact.text!==undefined?artifact.text:JSON.stringify(artifact.data,null,2)+'\n';
    await writeFile(root,[...prefix,...artifact.path],body);
  }
  const manifest={
    schemaVersion:'1.0',producer:'MAFer Audio Intelligence',createdAt:date.toISOString(),
    status:'COMPLETE',qaScoringPerformed:false,conversationId:pkg.metadata.conversationId||null,
    bu:pkg.metadata.bu||null,agentName:pkg.metadata.agentName||null,brand:pkg.metadata.brand||null,
    market:pkg.metadata.market||null,source:pkg.metadata.source||'unspecified',speakerRoleSource:pkg.speakerRoleSource||'not_verified',speakerRolesVerified:pkg.speakerRolesVerified===true,
    stages:{transcription:'completed',intelligence:'completed',acoustic:'NOT_PROCESSED',crmUpdate:'NOT_CONNECTED'},
    files:artifacts.map(a=>a.path.join('/')),outputPrefix:prefix.join('/')
  };
  // Consumers only consider a run complete after the manifest is present.
  await writeFile(root,[...prefix,'manifest.json'],JSON.stringify(manifest,null,2)+'\n');
  return {path:prefix.join('/'),manifest};
}
