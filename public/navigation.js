/**
 * MAFer Audio Intelligence page navigation.
 * One screen at a time on desktop and mobile. No loss of processing state.
 * Hash routes are intentionally client-side: no Worker routing change needed.
 */
export const PAGES=Object.freeze({
  upload:'Audio Upload',
  transcript:'Transcript & Evidence',
  intelligence:'Interaction Intelligence',
  handoff:'QA Handoff',
  operations:'Operations & Health',
  configuration:'Configuration'
});
export function routeFromHash(hash){
  const name=String(hash||'').replace(/^#\/?/,'').toLowerCase();
  return Object.hasOwn(PAGES,name)?name:'upload';
}
export function initWorkspaceNavigation(){
  const buttons=[...document.querySelectorAll('[data-route]')];
  const pages=[...document.querySelectorAll('[data-page]')];
  const mobile=document.getElementById('mobilePageSelect');
  const title=document.getElementById('pageTitle');
  let active=null;

  function isAvailable(route){
    const button=buttons.find(b=>b.dataset.route===route);
    return Boolean(button&&!button.disabled);
  }
  function show(){
    const desired=routeFromHash(window.location.hash);
    const route=isAvailable(desired)?desired:'upload';
    if(route!==desired)window.history.replaceState(null,'','#upload');
    for(const page of pages)page.hidden=(page.dataset.page!==route);
    for(const button of buttons){
      const selected=button.dataset.route===route;
      button.classList.toggle('active',selected);
      if(selected)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    }
    if(mobile){
      for(const option of mobile.options)option.disabled=!isAvailable(option.value);
      mobile.value=route;
    }
    if(title)title.textContent=PAGES[route];
    document.title='MAFer Audio Intelligence · '+PAGES[route];
    if(active!==route){
      active=route;
      window.scrollTo({top:0,behavior:'instant'});
    }
    return route;
  }
  function navigate(route){
    if(!isAvailable(route))return false;
    const hash='#'+route;
    if(window.location.hash===hash)show();
    else window.location.hash=hash;
    return true;
  }
  function ensureValidRoute(){
    const desired=routeFromHash(window.location.hash);
    if(!isAvailable(desired))navigate('upload');
    else {
      if(mobile)for(const option of mobile.options)option.disabled=!isAvailable(option.value);
      if(active!==desired)show();
    }
  }
  buttons.forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.route)));
  if(mobile)mobile.addEventListener('change',()=>navigate(mobile.value));
  window.addEventListener('hashchange',show);
  show();
  return {navigate,ensureValidRoute,current:()=>active};
}
