// Static GitHub Pages preview of the CORPORATE EKS interface.
// This module intentionally never calls /api or uses any cloud credentials.
import {initWorkspaceNavigation} from './navigation.js';
const $=id=>document.getElementById(id);
for(const button of document.querySelectorAll('[data-route]'))button.disabled=false;
for(const button of document.querySelectorAll('button:not([data-route])')){
  button.disabled=true;
  button.title='Available only after the corporate EKS backend is deployed';
}
for(const element of document.querySelectorAll('input,textarea,select')){
  if(element.id!=='mobilePageSelect')element.disabled=true;
}
const statuses={
  engineStatus:'Preview only · Backend offline',
  progressTitle:'EKS deployment pending',
  progressStage:'Preview',
  progressDetail:'Navigation is available. Transcription, analysis and file processing require the corporate EKS service.',
  progressCount:'0 / 5 stages',
  queueStatus:'GitHub Pages does not run background S3 processing. EKS connection pending.',
  corporateConfigStatus:'No live AWS connection in GitHub Pages preview.',
  metadataState:'No audio or Genesys metadata loaded',
  sttState:'Not connected',
  rolesState:'Not connected',
  llmState:'Not connected',
  qaState:'No live data'
};
for(const [id,value]of Object.entries(statuses)){const node=$(id);if(node)node.textContent=value;}
const inputs={
  runtimeInputLocation:'Configured on corporate EKS (not connected here)',
  runtimeOutputLocation:'Configured on corporate EKS (not connected here)',
  runtimeSpeechProvider:'Amazon Transcribe · pending EKS deployment',
  runtimeAnalysisProvider:'Enterprise APIM · pending EKS deployment'
};
for(const [id,value]of Object.entries(inputs)){const node=$(id);if(node)node.value=value;}
if($('progressBar'))$('progressBar').value=0;
const local=$('configPanel')?.querySelector('.local-browser-options');
if(local)local.remove();
const hideIds=['transcriptPlayer','evidencePlayer','player'];
for(const id of hideIds){const player=$(id);if(player){player.hidden=true;player.removeAttribute('src');}}
const placeholder=(id,message)=>{
  const el=$(id);if(!el)return;
  const node=document.createElement('div');
  node.className='preview-empty';
  node.textContent=message;
  el.replaceChildren(node);
};
placeholder('speakerMap','No speaker data yet. Amazon Transcribe will supply diarization when the corporate service is deployed.');
placeholder('transcript','No transcript available in this static preview.');
placeholder('results','No interaction intelligence available in this static preview. Live analysis will use the approved corporate APIM provider.');
const sections=['uploadPanel','transcriptionPanel','resultsPanel','handoffPanel'];
for(const id of sections){
  const node=$(id);if(!node)continue;
  if(['transcriptionPanel','resultsPanel'].includes(id))node.hidden=false;
}
if($('queueItems')){
  $('queueItems').replaceChildren();
  const notice=document.createElement('div');notice.className='preview-empty';
  notice.textContent='No S3 jobs are running. Operations will show real queue, progress and errors once EKS is connected.';
  $('queueItems').append(notice);
}
if($('sentiment'))$('sentiment').textContent='Unavailable';
if($('resolutionStatus'))$('resolutionStatus').textContent='Unavailable';
if($('progressBar'))$('progressBar').value=0;
const nav=initWorkspaceNavigation();
nav.ensureValidRoute();
