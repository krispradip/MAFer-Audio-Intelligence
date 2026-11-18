# MAFer Audio Intelligence — working Gemini-powered MVP

This is a **standalone audio transcription and interaction-intelligence application**, separate from QA.MAFer.AI. The Worker code calls real Google AI models and refuses incomplete timestamps or speaker attribution. No example interactions are seeded into the live interface. **Code integration and mocked tests are not proof of a completed live Gemini call**.

## Architecture

- **Frontend:** `public/`, served by Cloudflare Workers static assets.
- **Backend:** `worker.mjs`, with a provider-independent output schema and the isolated `gemini-provider.mjs` adapter.
- **Transcription provider (default):** Gemini `gemini-3.5-transcribe`. The Worker uploads audio to Gemini Files API, requests **VERBATIM**, speaker diarization and **word-level timestamps**, and maps speaker words into timestamped turns for the existing UI. No invented offsets or speaker assignments. Gemini's word timestamps may affect recognition accuracy; verify against the audio.
- **Intelligence provider (default):** Gemini `gemini-3.8-flash`, JSON generation grounded in the confirmed transcript. Outputs closing sentiment, issues, actions, commitments, next steps, resolutions and segment-linked evidence. It does not award QA scores or infer tone, silence or overlaps solely from text.
- **Alternative adapters:** The original OpenAI code remains selectable with `TRANSCRIPTION_PROVIDER=openai` and/or `ANALYSIS_PROVIDER=openai`. The provider boundary allows a future Amazon Transcribe adapter without changing the handoff JSON.
- **Export:** Timestamped transcript TXT and QA.MAFer.AI-ready JSON. No S3 push or QA evaluation in this MVP.

## One-time Cloudflare configuration

1. Store an approved Google AI Studio API key as **Secret** `GEMINI_API_KEY` under Cloudflare → Workers & Pages → `mafer-audio-intelligence` → Settings → Variables and Secrets. Do not paste the key into GitHub, browser JavaScript or this chat.
2. Deploy the **latest GitHub main** Worker and `public/` assets with the repository Wrangler configuration. GitHub commits do not, by themselves, prove the deployed Worker was updated.
3. The `wrangler.jsonc` configuration includes an `AUDIO_RATE_LIMITER` binding. The Worker refuses paid model requests if this guard is missing.
4. Optional environment variables (defaults apply when omitted):

   ```text
   TRANSCRIPTION_PROVIDER=gemini
   ANALYSIS_PROVIDER=gemini
   TRANSCRIPTION_MODEL=gemini-3.5-transcribe
   ANALYSIS_MODEL=gemini-3.8-flash
   ```

5. For deployment from a machine with Node.js and access to the correct Cloudflare account:

   ```sh
   npm install
   npx wrangler login
   npx wrangler deploy
   ```

If the secret was added **before** deploying the new Worker, preserve it on the same Worker/environment. The browser does not require an access code, but the public URL needs a Cloudflare Access/WAF restriction and provider usage budgets to prevent unauthorized consumption. A per-IP rate limiter alone does not protect customer data or cap total spend.

## Verify before the demonstration

1. Open `https://mafer-audio-intelligence.kris-pradip.workers.dev/api/health`.
2. Confirm `engineConfigured: true`, `rateLimitConfigured: true`, `transcriptionProvider: gemini`, `analysisProvider: gemini`, and the two Gemini model names. **Health checks configuration, not provider accessibility**.
3. Upload a short, **non-sensitive authorized** English or Arabic conversation (two speakers, up to 24 MiB). Select its language or auto-detection and click **Transcribe audio**.
4. Confirm that recognized words, diarized speakers and audio-relative start/end times appear. Assign Agent and Customer roles, then click **Analyze interaction with AI**.
5. Verify the generated summary, sentiment, evidence playback and downloadable JSON against the recording. The sidebar's Transcript & Evidence and QA Handoff actions unlock only when their stages are complete.

If a model call is blocked by account access, billing, quotas, file format, network settings or unexpected API output, the application shows an error. **No synthetic success fallback is permitted.**

## Gemini API details

The implementation uses Google's published Files resumable upload API and `generateContent` transcription/JSON endpoints. Gemini transcription only accepts supported audio containers; the adapter rejects MP4 video files without converting them. The product's 24 MiB upload limit is intentionally conservative. With diarization/word timestamps enabled, Gemini documents a 30-minute duration limit. Word timestamps, speaker attribution and a verified recording should be retained for downstream evidence.

When using Files API, **Google hosts a temporary copy of the uploaded audio under its own data policies**. The adapter attempts to delete that uploaded file after transcription, including in error paths; deletion is best-effort and is not a substitute for privacy and retention approval. Do not use customer call recordings on this personal/public test Worker or unapproved Google AI Studio account.

## Test and production readiness

```sh
npm test
node --check worker.mjs
node --check gemini-provider.mjs
node --check public/app.js
```

Tests mock provider responses to validate request formatting, time alignment, normalization and error cases. They do not prove live vendor connectivity. Production needs Cloudflare Access/corporate SSO, centralized credentials, S3/Genesys integration, asynchronous ingestion, hardened rate limits, retention and audit controls.

Google references:
- https://ai.google.dev/gemini-api/docs/generate-content/transcribe
- https://ai.google.dev/gemini-api/docs/file-input-methods
