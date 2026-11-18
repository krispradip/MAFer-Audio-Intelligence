// Metadata is populated from explicit sources only. Never guess an agent, brand or market from speech.
const uuidPattern=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const tidy=(value,max=128)=>typeof value==='string'?value.trim().slice(0,max):'';
export function conversationIdFromFilename(name){
  return tidy(String(name||'').match(uuidPattern)?.[0]||'',128);
}
function field(objects,keys,max=120){
  for(const o of objects){
    if(!object(o))continue;
    for(const key of keys){
      const value=tidy(o[key],max);
      if(value)return value;
    }
  }
  return '';
}
function normalizeBU(value){
  const normalized=tidy(value).toLowerCase();
  return ({vox:'VOX',share:'SHARE',ambu:'AMBU',retail:'Retail',other:'Other'})[normalized]||'';
}
function normalizeMarket(value){
  const key=tidy(value).toLowerCase().replace(/[._-]+/g,' ').replace(/\\s+/g,' ').trim();
  return ({
    'uae':'UAE','ae':'UAE','united arab emirates':'UAE',
    'ksa':'KSA','sa':'KSA','saudi arabia':'KSA',
    'oman':'Oman','om':'Oman','bahrain':'Bahrain','bh':'Bahrain'
  })[key]||'';
}
function normalizeLanguage(value){
  const code=tidy(value).toLowerCase().replace(/_/g,'-');
  if(code==='en'||code.startsWith('en-')||code==='english')return 'en';
  if(code==='ar'||code.startsWith('ar-')||code==='arabic')return 'ar';
  return '';
}
export function metadataFromJson(input){
  if(!object(input))throw new Error('Metadata JSON must contain a single object.');
  const conversation=object(input.conversation)?input.conversation:input;
  const nested=[conversation,conversation.metadata,conversation.attributes,conversation.customAttributes,conversation.participantData,
    input,input.metadata,input.attributes,input.customAttributes].filter(object);
  const participants=Array.isArray(conversation.participants)?conversation.participants:[];
  const agent=participants.find(p=>object(p)&&['agent','employee'].includes(tidy(p.purpose||p.role).toLowerCase()));
  const agentDetails=agent?[agent,agent.user,agent.attributes,agent.participantData].filter(object):[];
  const conversationId=field(nested,['conversationId','conversationID'],128)||
    (uuidPattern.test(tidy(conversation.id))?tidy(conversation.id):'');
  const agentName=field(nested,['agentName','agentDisplayName'],120)||
    field(agentDetails,['userName','displayName','agentName','name'],120);
  return {
    conversationId,
    agentName,
    bu:normalizeBU(field(nested,['businessUnit','bu'])),
    brand:field(nested,['brand','brandName'],80),
    market:normalizeMarket(field(nested,['market','country','countryCode'])),
    language:normalizeLanguage(field(nested,['spokenLanguage','languageCode','language']))
  };
}