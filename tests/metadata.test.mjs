import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationIdFromFilename, metadataFromJson} from '../public/metadata.js';

const uuid='6bbb0b8f-6d2d-4115-ae5a-0481f21e71f5';
test('automatically extracts the Genesys-like UUID from the provided Call1 recording filename',()=>{
  assert.equal(conversationIdFromFilename('Call1-'+uuid+'.MP3'),uuid);
  assert.equal(conversationIdFromFilename('recording.mp3'),'');
});
test('extracts explicit fields from normalized Genesys metadata',()=>{
  assert.deepEqual(metadataFromJson({conversationId:uuid,agentName:'Layla',bu:'VOX',brand:'VOX Cinemas',market:'United Arab Emirates',spokenLanguage:'ar-AE'}),{
    conversationId:uuid,agentName:'Layla',bu:'VOX',brand:'VOX Cinemas',market:'UAE',language:'ar'
  });
});
test('can use agent participant name from a Genesys conversation JSON export',()=>{
  assert.deepEqual(metadataFromJson({
    conversation:{conversationId:uuid,participants:[
      {purpose:'customer',name:'Caller'},
      {purpose:'agent',userName:'Agent Test'}],
      metadata:{businessUnit:'SHARE',brandName:'SHARE',market:'KSA',language:'en'}}
  }),{
    conversationId:uuid,agentName:'Agent Test',bu:'SHARE',brand:'SHARE',market:'KSA',language:'en'
  });
});
test('does not invent brand or agent from a recording with no supported metadata',()=>{
  assert.deepEqual(metadataFromJson({conversationId:uuid}),{
    conversationId:uuid,agentName:'',bu:'',brand:'',market:'',language:''
  });
});
test('does not use unrelated participant or arbitrary division as the agent or business unit',()=>{
  const meta=metadataFromJson({division:'VOX',participants:[{purpose:'customer',name:'Customer'}],country:'AE'});
  assert.equal(meta.agentName,'');assert.equal(meta.bu,'');assert.equal(meta.market,'UAE');
});
test('rejects arrays and missing JSON objects',()=>{
  assert.throws(()=>metadataFromJson([]),/single object/);
  assert.throws(()=>metadataFromJson(null),/single object/);
});
