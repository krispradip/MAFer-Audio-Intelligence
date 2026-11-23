import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PAGES,routeFromHash} from '../public/navigation.js';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');

test('every action has its own page, desktop button and mobile page option',()=>{
  assert.deepEqual(Object.keys(PAGES),['upload','transcript','intelligence','handoff','operations','configuration']);
  for(const route of Object.keys(PAGES)){
    assert.match(html,new RegExp('data-page="'+route+'"'));
    assert.match(html,new RegExp('data-route="'+route+'"'));
    assert.match(html,new RegExp('<option value="'+route+'"'));
  }
  assert.equal((html.match(/data-page=/g)||[]).length,6);
  assert.equal((html.match(/data-route=/g)||[]).length,6);
  assert.doesNotMatch(app,/data-nav-target/);
});

test('initial page is upload only; remaining pages are not part of the landing screen',()=>{
  for(const route of ['transcript','intelligence','handoff','operations','configuration'])
    assert.match(html,new RegExp('data-page="'+route+'" hidden'));
  assert.match(html,/data-page="upload">/);
  assert.match(css,/\.app-page\[hidden\][^}]+display:none/);
});

test('processing state gates transcript, intelligence and QA navigation',()=>{
  assert.match(app,/\$\('navTranscript'\)\.disabled=!transcriptReady/);
  assert.match(app,/\$\('navIntelligence'\)\.disabled=!intelligenceReady/);
  assert.match(app,/\$\('navQA'\)\.disabled=!intelligenceReady/);
  assert.match(app,/navigation\.navigate\('transcript'\)/);
  assert.match(app,/navigation\.navigate\('intelligence'\)/);
});

test('evidence playback and QA download remain accessible in their dedicated pages',()=>{
  assert.match(html,/id="evidencePlayer"/);
  assert.match(html,/id="transcriptPlayer"/);
  assert.match(html,/id="downloadJson"/);
  assert.match(html,/id="downloadText"/);
  assert.match(app,/const audio=\$\('evidencePlayer'\)/);
  assert.match(app,/downloadJson'\)\.addEventListener/);
});

test('route parser supports direct links and falls back safely',()=>{
  assert.equal(routeFromHash('#configuration'),'configuration');
  assert.equal(routeFromHash('#/operations'),'operations');
  assert.equal(routeFromHash('#INTELLIGENCE'),'intelligence');
  assert.equal(routeFromHash('#unexpected'),'upload');
  assert.equal(routeFromHash(''),'upload');
});

test('mobile uses a visible page selector instead of stacking all pages',()=>{
  assert.match(html,/id="mobilePageSelect"/);
  assert.match(css,/\.mobile-nav select/);
  assert.match(app,/initWorkspaceNavigation\(\)/);
});
