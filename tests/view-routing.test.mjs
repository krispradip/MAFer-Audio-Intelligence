import test from 'node:test';
import assert from 'node:assert/strict';
import {VIEWS,VIEW_TITLES,normalizeView,viewFromHash,hashForView} from '../public/view-routing.js';

test('each navigation action has a dedicated deep-linkable view',()=>{
  assert.deepEqual(VIEWS,['analyzer','transcript','handoff','config']);
  for(const name of VIEWS){
    assert.equal(viewFromHash(hashForView(name)),name);
    assert.ok(VIEW_TITLES[name]);
  }
});
test('invalid or unknown navigation URLs safely return to the Audio Analyzer',()=>{
  for(const hash of ['', '#', '#/unknown', '#/../../', '#/admin', null]){
    assert.equal(viewFromHash(hash),'analyzer');
  }
  assert.equal(normalizeView('settings'),'analyzer');
});
test('direct URLs and back/forward hashes resolve without reprocessing audio',()=>{
  assert.equal(viewFromHash('#/transcript'),'transcript');
  assert.equal(viewFromHash('#/handoff'),'handoff');
  assert.equal(viewFromHash('#/config'),'config');
  assert.equal(viewFromHash('#/ANALYZER'),'analyzer');
});
