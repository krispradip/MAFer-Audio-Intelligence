// Stable client-side view routes. Navigation does not reload or discard the audio session.
export const VIEWS=Object.freeze(['analyzer','transcript','handoff','config']);
export const VIEW_TITLES=Object.freeze({
  analyzer:'Audio Analyzer',
  transcript:'Transcript & Evidence',
  handoff:'QA Handoff',
  config:'Configuration'
});
export function normalizeView(view){
  return VIEWS.includes(view)?view:'analyzer';
}
export function viewFromHash(hash){
  const raw=String(hash||'').replace(/^#\/?/,'').split(/[?&]/,1)[0].toLowerCase();
  return normalizeView(raw);
}
export function hashForView(view){
  return '#/'+normalizeView(view);
}
