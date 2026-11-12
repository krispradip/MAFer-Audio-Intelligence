/* SYNTHETIC demo data — no real customers, agents, identifiers or services. */
window.SEED = {
 interactions:[
 {id:"e812a492-206c-4d32-86cd-a0f000000001",bu:"VOX",brand:"VOX Cinemas",market:"UAE",agent:"Demo Agent A",agentCountry:"UAE (work location)",callerCountry:"Unknown",language:"English",duration:"06:42",time:"11:42",issues:[{name:"Booking cancellation",status:"Information provided"},{name:"Refund status",status:"Follow-up pending"}],reason:"Customer asked about a cancelled cinema booking and delayed refund.",actions:"Agent checked the booking reference and explained the refund process.",next:"Confirm refund completion.",summary:"The customer enquired about a cancelled booking and pending refund. The agent confirmed the request and outlined expected next steps. Actual refund completion was not verified.",sentiment:"Negative → Neutral",lines:[["00:05","Customer","I cancelled my ticket but haven't received the refund."],["00:16","Agent","I understand the concern. Let me check the booking and explain the next steps."]],trans:"completed",sum:"completed",crm:"confirmed",ack:"confirmed",ticket:"DEMO-C4C-101",error:""},
 {id:"e812a492-206c-4d32-86cd-a0f000000002",bu:"SHARE",brand:"SHARE Loyalty",market:"KSA",agent:"Demo Agent B",agentCountry:"UAE (work location)",callerCountry:"Unknown",language:"Arabic + English",duration:"04:10",time:"11:24",issues:[{name:"Points not credited",status:"Review pending"},{name:"Transaction not visible",status:"Guidance provided"}],reason:"Missing SHARE points and transaction visibility.",actions:"Agent reviewed information and explained follow-up.",next:"Verify loyalty-points crediting.",summary:"The customer reported missing loyalty points and could not see the transaction in the account. Follow-up on points was required.",sentiment:"Concerned → Neutral",lines:[["00:04","Customer","مرحبا، النقاط ما نزلت في حسابي بعد الشراء."],["00:13","Agent","أكيد، خليني أتحقق من العملية."],["00:40","Customer","Can you also check my transaction history?"]],trans:"completed",sum:"completed",crm:"unmatched",ack:"waiting",ticket:null,error:"CRM_MAPPING_NOT_FOUND"},
 {id:"e812a492-206c-4d32-86cd-a0f000000003",bu:"AMBU",brand:"Communities",market:"UAE",agent:"Demo Agent C",agentCountry:"UAE (work location)",callerCountry:"Unknown",language:"Arabic",duration:"03:55",time:"10:58",issues:[{name:"Service charges",status:"Explanation provided"}],reason:"Service-charge clarification.",actions:"Agent described the charging process.",next:"Provide a copy of the statement.",summary:"Transcript complete; summarization requires retry.",sentiment:"Not finalized",lines:[["00:06","Customer","عندي استفسار عن رسوم الخدمات."],["00:15","Agent","أكيد، كيف أقدر أساعدك؟"]],trans:"completed",sum:"failed",crm:"waiting",ack:"waiting",ticket:"DEMO-C4C-103",error:"HTTP 429 · QUOTA_OR_RATE_LIMIT"},
 {id:"e812a492-206c-4d32-86cd-a0f000000004",bu:"VOX",brand:"VOX Cinemas",market:"Oman",agent:"Demo Agent D",agentCountry:"Oman (work location)",callerCountry:"Unknown",language:"Arabic",duration:"08:05",time:"10:46",issues:[],reason:"Not available",actions:"",next:"",summary:"Transcription unavailable.",sentiment:"Unavailable",lines:[],trans:"failed",sum:"waiting",crm:"waiting",ack:"waiting",ticket:"DEMO-C4C-104",error:"HTTP 503 · SERVICE_UNAVAILABLE"},
 {id:"e812a492-206c-4d32-86cd-a0f000000005",bu:"VOX",brand:"VOX Cinemas",market:"UAE",agent:"Demo Agent E",agentCountry:"UAE (work location)",callerCountry:"Unknown",language:"English",duration:"07:10",time:"10:18",issues:[{name:"Reschedule cinema booking",status:"Change requested"}],reason:"Customer requested a booking change.",actions:"Agent initiated a rescheduling request.",next:"Confirm the booking change.",summary:"The customer requested rescheduling. The agent initiated the request but confirmation was not recorded.",sentiment:"Neutral → Positive",lines:[["00:05","Customer","Can you help me change my booking?"],["00:17","Agent","Let me check what options are available."]],trans:"completed",sum:"completed",crm:"sent",ack:"failed",ticket:"DEMO-C4C-105",error:"HTTP 504 · CRM_RESPONSE_TIMEOUT"},
 {id:"e812a492-206c-4d32-86cd-a0f000000006",bu:"VOX",brand:"VOX Cinemas",market:"UAE",agent:"Demo Agent F",agentCountry:"UAE (work location)",callerCountry:"Unknown",language:"English",duration:"05:48",time:"09:52",issues:[],reason:"In progress",actions:"",next:"",summary:"Awaiting transcription.",sentiment:"Unavailable",lines:[],trans:"processing",sum:"waiting",crm:"waiting",ack:"waiting",ticket:null,error:""},
 {id:"e812a492-206c-4d32-86cd-a0f000000007",bu:"Retail",brand:"Carrefour",market:"UAE",agent:"Demo Agent G",agentCountry:"UAE (work location)",callerCountry:"Unknown",language:"English",duration:"04:35",time:"09:37",issues:[{name:"Missing delivery item",status:"Replacement requested"}],reason:"Missing item in delivery.",actions:"Agent initiated a replacement request.",next:"Confirm replacement delivery.",summary:"The customer raised a missing-item issue. The agent explained replacement next steps.",sentiment:"Negative → Neutral",lines:[["00:05","Customer","One item was missing from my grocery order."],["00:18","Agent","I'm sorry. I'll review the order and help with a replacement."]],trans:"completed",sum:"completed",crm:"confirmed",ack:"confirmed",ticket:"DEMO-C4C-107",error:""}
 ],
 services:{stt:{name:"Primary Speech Engine",provider:"Amazon Transcribe",model:"AWS managed speech service",region:"me-central-1",connection:"stt-primary",language:"English + Gulf Arabic / multilingual",speaker:"Channel ID when available",timeout:"120",retries:"2",status:"healthy"},sum:{name:"Summary Intelligence",provider:"Corporate OpenAI via APIM",model:"gpt-4o",region:"Corporate APIM",connection:"apim-summary",language:"English + original language",schema:"v1",prompt:"v1.3",tokens:"2500",timeout:"95",retries:"2",status:"healthy"}},
 connections:[{name:"Genesys recording ingestion",kind:"Source",profile:"genesys-s3-ingestion",status:"healthy",note:"S3 export and event queue · demo"},{name:"CRM ticket updates",kind:"Destination",profile:"crm-c4c-approved",status:"degraded",note:"Mapping and acknowledgment require CRM integration"},{name:"DOCX / JSON storage",kind:"Storage",profile:"audio-intelligence-outputs",status:"healthy",note:"BU / Brand / Market / Date / Conversation ID"}]
};

/* Non-sensitive SAMPLE configuration. No API credentials are included. */
window.SEED.serviceProfiles = {
  stt: [{
    id: "stt-main", active: true, name: "Primary Speech-to-Text",
    service: "Speech API", endpoint: "https://stt-demo.example.invalid/v1/audio/transcriptions",
    model: "speech-deployment-id", auth: "Bearer token", header: "Authorization",
    secretRef: "demo/audio/stt-primary", region: "UAE", healthPath: "/health",
    language: "English + Arabic (bilingual)", speakers: "Identify speakers",
    timeout: "120", retries: "2"
  }],
  sum: [{
    id: "sum-main", active: true, name: "Post-call Summary AI",
    service: "OpenAI-compatible chat API", endpoint: "https://ai-demo.example.invalid/v1/chat/completions",
    model: "gpt-4o", auth: "Bearer token", header: "Authorization",
    secretRef: "demo/audio/summary-primary", region: "UAE", healthPath: "/health",
    language: "English + original language", prompt: "v1.3", schema: "v1",
    instructions: "Produce a factual CRM-ready summary. Extract the reason for contact, distinct customer issues, any actions explicitly stated, resolution status, next steps, and clearly label sentiment as model-inferred. Preserve original-language meaning and distinguish proposed actions from confirmed outcomes. Never fabricate system actions or assess agent performance.",
    tokens: "2500", timeout: "95", retries: "2"
  }]
};
window.SEED.connectionProfiles = {
  genesys: {
    name:"Genesys recording ingestion",
    mode:"AWS S3 recording export",
    environment:"Genesys Cloud CX — test organisation",
    sourceBucket:"maf-demo-genesys-recordings",
    sourcePrefix:"recordings/",
    region:"me-central-1",
    queue:"https://sqs.me-central-1.amazonaws.com/000000000000/audio-demo-events",
    auth:"AWS IAM role",clientId:"",
    secretRef:"demo/genesys/recording-reader",
    correlation:"conversationId"
  },
  crm: {
    name:"CRM ticket updates",
    system:"SAP C4C — test",
    endpoint:"https://crm-demo.example.invalid",
    lookupPath:"/v1/tickets/by-genesys-id/{conversationId}",
    updatePath:"/v1/tickets/{ticketId}/summary",
    acknowledgePath:"/v1/updates/{requestId}/status",
    auth:"OAuth2 client credentials",clientId:"crm-demo-client",
    secretRef:"demo/crm/connector",
    correlation:"genesysConversationId",
    policy:"Require confirmed CRM acknowledgment"
  },
  storage: {
    name:"Generated transcription outputs",
    bucket:"maf-demo-audio-intelligence",
    prefix:"03_Completed",
    region:"me-central-1",
    folderPattern:"{BU}/{Brand}/{Market}/{YYYY}/{MM}/{DD}/{ConversationID}",
    transcriptName:"transcript.docx",
    summaryName:"summary.docx",
    includeJSON:"Yes — CRM and QA machine data",
    encryption:"SSE-KMS",
    retention:"90",
    auth:"AWS IAM role",
    secretRef:"demo/audio/output-writer"
  }
};
