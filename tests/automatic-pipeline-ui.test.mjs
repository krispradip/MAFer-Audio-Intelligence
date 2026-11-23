import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const storage=readFileSync(new URL('../public/local-folders.js',import.meta.url),'utf8');
test('Configuration has only folder choices, not manual scanning/loading controls',()=>{
  assert.match(html,/id="selectInputFolder"/);
  assert.match(html,/id="selectOutputFolder"/);
  assert.match(html,/id="saveConfiguration"/);
  assert.doesNotMatch(html,/id="scanInputFolder"|id="localAudioFile"|id="loadLocalFile"/);
  assert.doesNotMatch(app,/scanInputFolder|localAudioFile|loadLocalFile/);
});
test('single Transcribe click triggers optional speaker detection and full analysis pipeline',()=>{
  assert.match(app,/processRecording\(\)/);
  assert.match(app,/api\('identify-speakers'/);
  assert.match(app,/runInteractionAnalysis\(\{automatic\}\)/);
  assert.match(app,/persistConfiguredOutput\(\)/);
  assert.match(app,/navigation\.navigate\('intelligence'\)/);
});
test('automatic scan is opt-in via saved folder mode and never assumes a connected S3 adapter',()=>{
  assert.match(app,/async function scanConfiguredInput/);
  assert.match(app,/if\(configured\.input!=='local'\)/);
  assert.match(app,/if\(configured\.output!=='local'\)/);
  assert.match(app,/processRecording\(\{automatic:true\}\)/);
  assert.match(app,/AUTO_SESSION_LIMIT=12/);
  assert.match(app,/input\.queryPermission\(\{mode:'read'\}\)/);
  assert.match(storage,/readMetadataSidecar/);
  assert.match(html,/value="s3" disabled/);
});
test('progress and job queue are visible with truthful evidence limitations',()=>{
  for(const id of ['progressBar','progressTitle','progressDetail','queueCount','queueCompleted','queueFailed','queueStatus'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(app,/progressStage\(5,'Processing complete'/);
  assert.match(storage,/acoustic_evidence\.json/);
  assert.match(storage,/NOT_PROCESSED/);
});
test('missing BU and market tags are not silently mapped to VOX and UAE',()=>{
  assert.match(html,/<select id="bu"><option value="">Unassigned/);
  assert.match(html,/<select id="market"><option value="">Unassigned/);
  assert.match(app,/\$\('bu'\)\.value='';\$\('market'\)\.value='';/);
});
