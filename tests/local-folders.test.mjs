import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRelativePath} from '../public/local-folders.js';

test('local and S3 adapters share the same business-first relative path contract',()=>{
  const path=buildRelativePath({conversationId:'GEN-1234',bu:'SHARE',brand:'SHARE',
    market:'UAE'},new Date('2026-11-22T10:00:00Z'));
  assert.deepEqual(path,['03_Completed','SHARE','SHARE','UAE','2026','11','22','GEN-1234']);
});
test('unsafe separators cannot escape the output root or create unexpected folders',()=>{
  const path=buildRelativePath({conversationId:'../../secrets',bu:'Retail/Other',brand:'..',
    market:'UAE\\West'},new Date('2026-11-22T10:00:00Z'));
  assert.equal(path.length,8);
  for(const segment of path){
    assert.ok(segment.length>0);
    assert.notEqual(segment,'.');
    assert.notEqual(segment,'..');
    assert.ok(!segment.includes('/')&&!segment.includes('\\'));
  }
});
test('missing Genesys ID produces a local-only manual reference',()=>{
  const path=buildRelativePath({bu:'VOX'},new Date('2026-11-22T10:00:00Z'));
  assert.match(path[7],/^manual-/);
});
