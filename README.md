# MAFer Audio Intelligence

Standalone, bilingual contact-centre **audio transcription and interaction intelligence** platform prototype.

> **Prototype only:** all recordings, Genesys conversation IDs, CRM ticket references, service responses, provider states, tokens and errors in the application are synthetic. No actual Genesys, S3, CRM, APIM, Vault, or QA.MAFer.AI integrations are connected. Never enter real credentials or customer information into this preview.

## Scope

- **Operations Console:** end-to-end processing counts and statuses for transcription, AI summarization, CRM update, CRM confirmation, and S3 output readiness; stage-specific exceptions.
- **Manual Audio Upload:** browser-local file selection, audio playback, new interaction staging and failed-run retry staging (MP3/WAV/M4A/AAC/FLAC/OGG/WebM, up to 50 MB). Actual transcription requires a secure backend.
- **Interaction Explorer:** full English/Arabic timestamped transcript, CRM summary, customer closing sentiment, emotional indicators, conversation signals, interaction references, original-language evidence, interaction metadata and Word-compatible preview exports.
- **Configuration Console (Admin only):** technical speech-to-text and summarization provider settings, Genesys/CRM/S3 connections and simulated health checks. **Extraction categories, rules and output schema are fixed in code, not editable.**
- **AI Usage & Diagnostics:** audio minutes, LLM tokens, retries, provider error codes, request IDs and stage-specific diagnostics.
- **Demo personas:** Platform Admin and BU-scoped Leads (VOX, SHARE, AMBU and Retail). Both can access manual audio upload and their permitted interactions. Admin retains technical Config Console and diagnostics. These are UI-only simulations; production authorization must be enforced on a backend.

## Design principles

1. The Genesys **Conversation ID** is the interaction correlation key. The CRM owns ticket IDs and the mapping from Conversation ID to one or more tickets.
2. This product owns transcription and interaction intelligence; **QA.MAFer.AI independently owns quality scoring**.
3. Every speech segment must have STT-generated audio-relative start/end timestamps in milliseconds, a speaker label and original-language text. English, Arabic and bilingual speech are all subject to the same mandatory contract. CRM summaries are provided in configured languages.
4. The service uses a **fixed, versioned output contract**: transcript, CRM summary, customer closing sentiment, optional emotional indicators, conversation signals, interaction references, metadata, evidence and processing state. No editable EQ framework, intelligence enrichment configuration, QA rubric or scoring logic.
5. Failures are independently tracked by stage. CRM acknowledgment timeout must be reconciled before retrying writes.
6. The Word files are human-readable deliverables; **JSON/APIs** (once implemented) are for downstream CRM and QA consumption.
7. Sensitive credentials stay in corporate Vault; the admin UI should only reference DevOps-approved connections.

## Run locally

Open `index.html` in a modern browser. No dependencies or build tooling required.

Some non-secret integration configuration is stored in browser localStorage only. Manually selected audio is held in memory for the current browser session, **never in localStorage**. Do not treat localStorage as production persistence or a shared approval workflow.

## Files

- `index.html` — page shell
- `styles.css` — responsive visual design
- `sample-data.js` — synthetic interactions with start/end timestamps and seeded configuration
- `transcript-contract.js` — mandatory segment timing schema, validation, and completion gate (browser prototype only)
- `conversation-signals.js` — fixed extraction instructions, versioned structured output and evidence validation; no QA rubric
- `app.js` — UI rendering, filtering, simulated actions, diagnostics, document exports
- `manual-audio.js` — file validation, local audio playback, manual run staging and feature-gated same-origin submission
- `tests/smoke.cjs` — Node.js startup, fixed-output, timestamp display, no intelligence configuration and BU access tests
- `tests/timestamps.cjs` — mandatory timing validation, completion gate and error cases
- `tests/conversation-signals.cjs` — fixed output schema, closing sentiment, evidence and audio-only validation
- `docs/ARCHITECTURE.md` — production integration boundaries and future build plan

## Production integration (not included)

Corporate AWS EKS, Genesys recording export to S3 + processing queue, configurable English/Arabic speech engine, APIM-based summarization, PostgreSQL, Vault and IAM, CRM ticket reconciliation, read-only QA.MAFer.AI S3 ingestion, authorization, audit, observability, security, retention, and approved S3 DOCX storage.

The frontend cannot determine if a provider is actually healthy by testing only from the browser: production connectivity tests and health metrics must run on a secure backend.

## Security

The GitHub repository was created with **public** visibility as observed when first accessed. Keep only synthetic data in this repository. Change visibility to private in GitHub settings before adding internal specs or sensitive implementation details; never commit secrets or real customer transcripts.
## Current preview limitations

- This version creates **Word-compatible .doc** demo downloads, not native **.docx**. Native DOCX generation and S3 folder writing belong in the production backend.
- The project owner has provided a Cloudflare Workers preview URL. The deployed revision and CI workflow result must be verified separately; source commits alone do not establish live deployment.
- The demo role selector is not real authentication. Production needs backend-enforced RBAC.


## Personal test deployment

Cloudflare Workers URL provided by project owner:
https://mafer-audio-intelligence.kris-pradip.workers.dev/

**Verification:** The link was provided as the deployment target, but live reachability and the published code revision have not been verified from this environment.

### Test-data policy

The personal sandbox is intended to process **synthetic English, Arabic and bilingual audio recordings**. Using synthetic audio does **not** require model responses to be simulated: future integrations can call real, separately configurable speech-to-text and summarization APIs through server-side adapters with secure secrets. No real customer recordings, CRM credentials, or corporate secrets should be committed to this public repository.

Target test flow:
1. Upload or select a synthetic call recording; assign a mock Genesys Conversation ID.
2. Execute an approved speech-to-text service that provides per-segment start/end timestamps and speaker labels; reject results without valid time alignment.
3. Execute the independently configured summarization service using **code-owned extraction instructions** for CRM facts, closing sentiment, emotional indicators, conversation signals and interaction references, without scoring agent behaviour.
4. Produce two Word documents and JSON artifacts.
5. Simulate or sandbox-test CRM ticket correlation, update, acknowledgment, timeout and retry/reconciliation.
6. Publish completed transcript JSON and a versioned manifest to S3 for independent read-only consumption by QA.MAFer.AI, without incorporating official QA scoring into this standalone service.

The committed frontend **currently simulates** the transcription, summary and connection responses. Audio file selection, playback and local staging are implemented; actual transcription/model invocation and native DOCX export still require the backend. GitHub-to-Cloudflare auto-deployment has not been established by this repository's current code.

## Mandatory transcription timestamps

**Non-negotiable STT output contract:** Every spoken segment must contain `startMs` and `endMs` (integer milliseconds relative to recording start), `speaker` and `text` in the original language. Timestamps are produced by the transcription engine or a time-aligned STT adapter, **not guessed by the summarization LLM**. This requirement applies equally to English, Arabic and code-switched calls; it is not a QA scoring setting or a toggle in Config Console.

```json
{
  "transcriptSchemaVersion": "1.0",
  "segments": [
    {"startMs": 5000, "endMs": 12000, "speaker": "Customer", "text": "I need help with my booking."},
    {"startMs": 16000, "endMs": 26000, "speaker": "Agent", "text": "Let me check the booking."}
  ]
}
```

Completion requires at least one valid speech segment, integer nonnegative times, `endMs > startMs`, ordered start times, end times within known recording duration, and nonempty speaker/text fields. Overlapping speaker turns are allowed. If a recording is genuinely silent, it needs an explicit **no-speech** outcome rather than a fabricated transcript or a false `completed` status.

When timing is missing, invalid, out of order or outside the audio duration, the transcription must be marked failed/incomplete with a diagnostic code. It cannot be counted as completed, exported as a completed transcript, or published to S3/QA; downstream summary/CRM processing must wait for a valid transcript. A provider that cannot deliver timestamps is **not eligible** for production use.

The prototype validates structural timestamp correctness, displays start/end time ranges, and blocks completion/readiness for invalid demo records. **It does not perform real STT or verify audio-to-text synchronization**. Production must enforce the same contract in the backend, verify time alignment against the actual recording and preserve the timestamps in DOCX/JSON/S3 artifacts.

## Customer sentiment at call close and EQ look-fors

These are **conversation intelligence signals**, not QA assessment parameters.

- **Customer closing sentiment** answers only: *Did the customer leave the call happy?* Allowed outputs: **Happy**, **Unhappy**, **Neutral**, or **Unclear**. Use the customer's own closing statements and the original STT segment timestamps as evidence. Do not treat a polite goodbye, a solved ticket, or the agent's friendliness as proof of customer happiness. When closing evidence is absent, return **Unclear**; when summarization has not completed, return **Not available**. The prototype shows explicit synthetic closing dialogue for its Happy/Unhappy/Neutral examples.
- **EQ look-fors** identify what to notice in the agent's dialogue: **empathy, active listening, emotional acknowledgement, patience, reassurance, composure**. Include only evidence-backed, descriptive highlights, with the original speaker text and timestamps. A missing observation is **not** a failure. Do not assign scores, grades, weights, pass/fail flags or negative findings, and do not make any official agent performance judgment.
- **QA.MAFer.AI** remains the sole owner of rubric-based QA evaluation and agent scoring. It can consume the original timestamped transcript independently; this audio product does not issue QA assessment results.

The Config Console lets Platform Admin maintain the summary prompt's customer sentiment guidance and EQ observational guidance. Intelligence Configuration exposes the fixed outcome question, outcome labels and EQ look-fors to both Admin and BU Lead in read-only form. This is still a synthetic frontend; production must validate LLM output against transcript evidence on the backend.

## Intelligence Configuration (BU Lead read-only)

The sidebar now provides **Intelligence Configuration** to both Platform Admin and BU Lead personas. It shows the selected Speech-to-Text engine and CRM Summary Intelligence engine, model/deployment identifiers, language capabilities, speaker identification, prompt version and output schema. It is a **read-only overview**, with no provider URLs, secret references, credential fields or editing controls. The Platform Admin retains full integration configuration in **Config Console**.

This page shows browser-held **demo settings**, not verified live service health. BU Lead role switching is a preview feature, not authentication or backend RBAC. The displayed engine profiles are enterprise-level demo profiles; per-BU model overrides have not been implemented.

**QA boundary:** rubric-driven Agent EQ assessment, Problem-Solving assessment, compliance, evidence grading, weights, pass/fail outcomes and performance scores belong in **QA.MAFer.AI**. Audio Intelligence **does** include EQ look-fors as descriptive, timestamp-linked conversation observations and customer sentiment at call close; neither is a QA criterion or grade. Audio Intelligence also preserves original-language speech, speaker labels and **mandatory** audio-relative start/end timestamps.

## Manual audio upload and controlled recovery

The **Manual Audio Upload** page is available to Platform Admin and BU Lead personas. The demo role selector supports VOX, SHARE, AMBU and Retail leads, each restricted to their BU's interactions. It accepts MP3, WAV, M4A, AAC, FLAC, OGG and WebM files up to **50 MB**, validates extension/MIME/size, and offers an in-browser audio player where the browser supports the format. Use **synthetic recordings only** in this public preview.

Two workflows are supported:

1. **New manual interaction:** choose a file and enter BU, brand, agent, market, language and optionally an existing Genesys Conversation ID. Staging creates a new interaction with waiting processing statuses and **no fabricated transcript or intelligence results**.
2. **Retry failed interaction:** open a failed transcription or summarization interaction and choose **Upload audio to retry**, or select Retry from the manual upload page. Staging preserves the existing Conversation ID and any completed transcript/summary. The retry is marked as browser-local until a real service accepts it.

Staging does not upload audio or invoke an LLM. Audio bytes are held in browser memory only and are discarded on refresh or when the form is cleared. The **Submit to processing service** button is intentionally gated behind `window.MAFER_MANUAL_AUDIO_API_ENABLED === true` and cannot submit audio until the secure same-origin API is provisioned. When enabled, it sends `multipart/form-data` to `POST /api/manual-audio/jobs` and expects a JSON response with a non-empty `jobId`. The UI marks the job as accepted, **not completed**. The backend must own subsequent status updates and artifact publication.

**Required backend controls:** authenticated identity, server-enforced BU scope, authorized retry against the original Conversation ID, file/MIME/size validation, malware scanning, secure temporary/S3 storage, idempotency, processing queue, status/result retrieval, audit trail, retention and retries. Do not enable the feature flag before this API and its access controls are deployed. The browser must never hold service API keys.

The current demo has **no connected processing endpoint**; real audio-to-text, conversation summarization, sentiment extraction, CRM updates and S3 output are not produced by staging. The existing synthetic interactions remain available for demonstrations of completed results.
