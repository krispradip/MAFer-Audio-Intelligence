# MAFer Audio Intelligence — Live Audio Analyzer MVP

This is **working integration code** (real OpenAI API calls), not the legacy interactive/synthetic prototype. The deployed Worker serves **only** the files in `public/`. The older root `index.html`, `app.js` and `sample-data.js` are retained as archive/source reference and are NOT deployed through this Wrangler configuration.

## Live workflow

1. Open the Worker site. No access code is required in the application. The Worker must have `OPENAI_API_KEY` configured and a working Cloudflare rate-limit binding.
2. Choose a real, non-sensitive English/Arabic recording up to **24 MiB**. Optional metadata: Genesys Conversation ID, agent name, BU, brand and market.
3. **Transcribe audio** invokes `POST /api/transcribe` → OpenAI `gpt-4o-transcribe-diarize` with `diarized_json`, `chunking_strategy=auto`. This returns real **speaker IDs and per-turn start/end timestamps**. Invalid/missing timestamps fail closed.
4. Confirm which speaker is **Agent** and **Customer** in the UI. These roles are not invented by the LLM.
5. **Analyze interaction** invokes `POST /api/analyze` → OpenAI `gpt-4o-mini` in JSON mode. The model extracts reason for contact, issue(s), action(s), resolution, commitments, next steps, closing customer sentiment, optional language-supported emotions/signals and segment evidence. It **does not** analyze acoustic tone, silence or overlap; transcript-only evidence cannot prove those.
6. Download verified transcript TXT and QA handoff JSON. **No QA score is generated.** The QA platform is NOT called; S3/CRM ingestion are not connected yet.

No test recordings, synthetic interaction cards, fabricated model responses or placeholder success states are included. Runtime data is held in the open browser tab and HTTP request/response only. Nothing is persisted by this application. OpenAI processes the audio/transcript for these two calls. No audio file is stored by the Worker.

## Deploy using Cloudflare Workers

**Prerequisites:** Cloudflare account with Workers, access to this repository, an OpenAI API key permitted for the models above. These secrets must be set on the Worker, **never committed or entered into the public frontend**.

```sh
npm install
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler deploy
```

Run `wrangler secret put` using the same account and `name` as in `wrangler.jsonc`. The Worker name is `mafer-audio-intelligence` and assets are built from `public/`. If the existing Cloudflare site is deployed by a different method, change/reconcile its deployment config carefully; a GitHub commit alone does **not** redeploy the site.

**For local development** copy `.dev.vars.example` to `.dev.vars`, enter a non-production OpenAI API key (do **not** commit `.dev.vars`), then:

```sh
npm install
npm run dev
```

No access-code entry or `DEMO_ACCESS_TOKEN` is used. The Worker requires an `AUDIO_RATE_LIMITER` binding and rejects requests when it is missing. The included Wrangler configuration limits each IP to six `/api/*` requests per minute per Cloudflare location. **A per-IP rate limit is not authentication or a hard cost cap.** Configure Cloudflare Access or another private allowlist and OpenAI budget limits before making the model-backed site broadly available; use synthetic or expressly authorized non-sensitive recordings for this prototype. Do not upload real customer recordings to an unapproved public Workers URL or personal OpenAI account.


### Minimum one-time Cloudflare setup

The **only API secret required** is `OPENAI_API_KEY`. Configure it in **Cloudflare Dashboard → Workers & Pages → mafer-audio-intelligence → Settings → Variables and Secrets → Add → Secret**. Paste the approved OpenAI API key there (never into the webpage or GitHub). Configure Cloudflare Access or a restrictive WAF rule on the public Worker before making the demo broadly reachable.

Redeploy the **current GitHub main** using `npx wrangler deploy` so that the `AUDIO_RATE_LIMITER` binding is installed. GitHub commits alone do not deploy the Worker. Visit `/api/health` and confirm `engineConfigured: true` and `rateLimitConfigured: true`; these flags mean **configured**, not that a real model call has succeeded. Process a short, non-sensitive authorized recording and check transcript timestamps, speaker mapping, and output JSON to prove the end-to-end integration.

## Test

```sh
npm test
node --check worker.mjs
node --check public/app.js
```

Tests mock upstream HTTP responses **only to verify integration logic, gating, failure modes and evidence safety**. They are not live-provider tests. A real smoke test requires deploying the Worker with valid secrets, uploading an authorized non-sensitive audio file, confirming both speaker roles and verifying the JSON export. `GET /api/health` reports configuration status, not successful LLM connectivity.

## API / Handoff

- `GET /api/health` — indicates which services are configured; does not imply a successful API call.
- `POST /api/transcribe` — form-data `audio`, optional `language` (`en`, `ar`); no demo access-code header. Requires the `AUDIO_RATE_LIMITER` binding.
- `POST /api/analyze` — JSON `{segments, speakerMapping, metadata}`; no demo access-code header. Requires the `AUDIO_RATE_LIMITER` binding.
- Output: `MAFerAudio_<conversation_id>_QA_handoff.json` with `handoffSchemaVersion=1.0`, `qaScoringPerformed=false`, confirmed role mapping, audio-derived `startMs/endMs`, original text, structured interaction intelligence and evidence indices.

### Constraints / Migration

- OpenAI currently limits audio transcription uploads to 25 MB, so this MVP uses a 24 MiB limit; no automatic splitting is implemented. Large recordings require a production streaming/chunking pipeline.
- The MVP `gpt-4o-transcribe-diarize` model is **deprecated and due to be shut down February 26, 2027**. Do not build a permanent production dependency on it. Plan migration to `gpt-transcribe` with a supported external diarization/timestamp alignment stage, or a supported later-model equivalent.
- Speaker roles require human verification. QA should ingest **only** JSON with role mapping confirmed. More complex conference calls and one-speaker recordings are not supported in this constrained MVP.
- Segment evidence is structurally verified and tied to recognized speech. The LLM cannot prove CRM operations, acoustic signals, or a resolution that was not confirmed in dialogue.
- Corporate APIM/SSO, CRM writeback, Genesys automatic ingestion, S3 and managed persistence are **not** implemented and require separate deployment approval.