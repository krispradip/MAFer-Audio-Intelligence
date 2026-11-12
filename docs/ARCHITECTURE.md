# Production architecture proposal

## Independent responsibility boundaries

**Genesys Cloud CX** creates Conversation IDs and audio recordings. It does not need to know the CRM ticket ID. Existing Genesys-to-CRM CTI or an enterprise mapping service must record relationships between Genesys Conversation ID and CRM ticket IDs, which can be many-to-many. The **CRM is authoritative** for ticket ID, ticket lifecycle and confirmation of updates.

**MAFer Audio Intelligence** ingests the recording + metadata, performs mandatory time-aligned, speaker-labelled English/Arabic transcription, uses a separately configured LLM for factual issues, contact reasons, stated actions, resolution status, next steps and model-inferred sentiment, generates DOCX/JSON, persists stage-specific status, and publishes completed outputs.

**QA.MAFer.AI** independently consumes completed transcript JSON and evidence metadata from approved S3 locations using read-only IAM access. It performs assessments against its own BU rubric and owns assessment state. No QA score or push-based QA handoff is generated in the transcription service.

## Proposed processing states

- transcription: waiting, queued, processing, completed, failed. Completion is prohibited unless every speech segment passes mandatory start/end timestamp validation; failures include `TRANSCRIPT_TIMESTAMPS_MISSING`, `TRANSCRIPT_TIMESTAMPS_INVALID`, `TRANSCRIPT_TIMESTAMPS_OUT_OF_ORDER` and `TRANSCRIPT_TIMESTAMPS_OUT_OF_BOUNDS`.
- summarization: waiting, processing, completed, failed
- crm update: waiting, unmatched, sending, sent, failed, confirmed
- crm acknowledgment: waiting, confirmed, failed, uncertain
- S3 transcript publication: waiting, writing, published, failed
- S3 summary publication: waiting, writing, published, failed
- manifest publication: waiting, published, failed (only after required transcript artifacts are durable)

An expired CRM acknowledgment is **uncertain**, not proof that the ticket was not updated. Reconcile against CRM before an idempotent retry. Every stage logs error code, provider request ID, retry attempt, time and immutable stage version.

## S3 output layout

`s3://<approved-bucket>/03_Completed/{BU}/{Brand}/{Market}/{YYYY}/{MM}/{DD}/{GenesysConversationID}/`

- `Full_Transcript/transcript.docx`
- `CRM_Summary/summary.docx`
- `Machine_Data/transcript.json`
- `Machine_Data/summary.json`
- `Machine_Data/metadata.json`
- `Machine_Data/manifest.json`

Genesys raw export is maintained separately. Market is the business market served, **not** inferred physical caller location.

## Integration contract

Data fields: Genesys Conversation ID, recording IDs/segments, agent IDs and names from Genesys metadata, queue-to-BU mapping, channel, market, language, caller country (only when verified; otherwise unknown), agent work location if available, speaker segments with mandatory `startMs`/`endMs` (audio-relative milliseconds), completeness indicator, issue array and resolution per issue, reason for contact, model-inferred customer sentiment with source/provenance, processing versions and statuses, CRM mapping/status, S3 transcript/summary publication statuses, object versions and manifest URI.

CRM updates use the summary through an authenticated CRM API; QA reads transcript JSON from S3. DOCX is primarily for human download or approved S3 archiving. Backend must enforce schema validation, sanitization, redaction, audit trail, access controls, signed retrieval and retention.

## Configuration security

Admin-managed: select from **DevOps-provisioned** connections/models, choose language and speaker policy (with unknown speaker labels if attribution is uncertain); only approve engines capable of mandatory per-segment start/end timestamps, set allowed retry/timeout profiles, select prompt/schema version, token/output limit, configure approved BU defaults, test connection and controlled sample workloads, activate configuration with audit history.

DevOps: provision AWS/EKS/queues/S3 buckets/IAM, APIM deployments/quotas, managed speech access, Vault secrets, network/TLS, approved CRM credentials and QA read-only S3 IAM access, monitoring and runtime policies. Production connection tests must be server-side. The UI must not accept raw keys.

## Prototype vs production

Current repository is UI-only with local in-browser simulation. Real authentication, per-BU authorization, backend health, audit persistence, document generation service, S3 integration and provider requests have **not** been implemented. Do not ingest real recordings into this public mockup.
## Data ownership and database boundaries

Reuse existing corporate PostgreSQL infrastructure if capacity, security and lifecycle requirements permit, but use **separate application databases or isolated schemas and credentials**:

- Audio Intelligence owns ingestion jobs, Genesys Conversation ID, recording references, transcript versions, agent/BU metadata, issues and sentiment observations, CRM ticket mapping and status, S3 object URIs and version IDs, processing history, and AI usage diagnostics.
- QA.MAFer.AI owns assessment jobs, rubric versions, evidence, coverage, QA scores, and evaluation history.
- QA references the Genesys Conversation ID **plus transcript version/object version**. Avoid storing a second canonical full transcript in QA PostgreSQL.
- S3 stores the actual transcript DOCX/JSON, summary DOCX/JSON, metadata and completion manifest. Only published, complete, timestamp-validated and schema-valid transcript artifacts may be consumed by QA. Summary failure must not block transcript availability.
- S3 event notifications/SQS can wake the QA ingestion worker, which then fetches the manifest and artifacts; scheduled polling is an alternative. QA ingestion is idempotent on Conversation ID + transcript version. A notification is not proof QA assessment completed.

## User permissions

BU Leads see only their BU interactions, full transcripts, CRM summaries and a read-only overview of the active transcription and summarization engine settings; they can download human-readable Word documents. They do not receive JSON export, service endpoints, secret references or editable technical configuration. Platform Admins can export JSON and edit approved integration settings for troubleshooting. Production permissions must be enforced by backend authorization, not just hidden UI buttons.

## Timestamped transcript acceptance contract

The transcription service must produce `transcriptSchemaVersion: "1.0"` with `segments: [{startMs, endMs, speaker, text}]`. `startMs` and `endMs` are integer milliseconds relative to the **original recording start**, not wall-clock time. The STT engine or a trusted time-aligned adapter must generate them; the summary LLM must never invent timestamps. Preserve the original-language text for English, Arabic and code-switched speech. If speaker attribution is uncertain, use an explicit unknown speaker label rather than inventing an identity.

**Backend validation gate before marking transcription `completed`:** at least one nonempty speech segment; valid nonnegative integer start/end times; `endMs > startMs`; segments ordered by start time; end within recording duration; nonempty speaker label and transcript text. Allow overlapping speech from different speakers. A genuine no-speech result must be a distinct processing outcome, not a fabricated completed transcript. Audio synchronization and STT alignment quality must be checked by the production backend; syntactically valid timestamps alone do not establish accuracy.

If validation fails, record a timestamp-specific error, keep the transcription in failed/incomplete state, and do **not** publish a completion manifest, completed transcript DOCX/JSON or downstream summary/CRM/QA artifacts. Retries should use an approved timestamp-capable engine. The provider's ability to generate aligned segment boundaries must be proven with English, Arabic and code-switched sample recordings before activation. **This is a mandatory service contract, not an editable QA rubric or optional UI setting.**

## Processing intelligence and QA ownership

MAFer Audio Intelligence is a **source-of-truth transcription and CRM summarization service**, not an agent-quality evaluator. It must preserve English, Arabic and code-switched speech in the original language, with speaker labels and mandatory STT-generated start/end timestamps. A provider that cannot deliver time-aligned segments is ineligible for production. Transcription confidence, incomplete audio and speaker uncertainty are **data quality metadata**, not negative QA findings.

The summarization stage extracts only conversation content: contact reason, each distinct issue, actions explicitly stated by participants, resolution status (distinguishing proposed from verified actions), next steps, and optionally model-inferred sentiment. It must not infer completed CRM/system actions without external confirmation. The configured prompt/schema version is recorded with the summary output for traceability.

**QA.MAFer.AI** owns all rubric-driven agent evaluation, including EQ/empathy, active listening, problem-solving, compliance, scoring, evidence requirements, Not Assessable/Unverified handling, BU-specific rubrics, approval and version history. The transcription service must not create, store or apply QA framework versions or assessment results.

**BU Lead visibility:** a read-only Intelligence Configuration screen displays the selected speech engine, summary model, language/speaker capabilities, prompt version and response schema. It does not reveal endpoints, credentials, Vault references or allow edits. Platform Admin uses the separate Config Console. In production, backend RBAC must enforce access; demo role switching is not authentication.

## Manual audio ingestion and failed-run recovery

**Manual Audio Upload** is a controlled fallback to automated Genesys-to-S3 ingestion, not a separate transcription pipeline. Both automated and manual submissions must use the same processing job schema, STT engine, summarization engine, output contracts, and observability.

### Frontend prototype (implemented)

- Platform Admin can stage a new recording for any configured BU; each simulated BU Lead can stage recordings for their own BU only.
- Both can attach and locally preview supported audio (MP3, WAV, M4A, AAC, FLAC, OGG, WebM; 50 MB maximum) and stage a new interaction or a retry of an existing failed STT/summarization job.
- A retry retains the Genesys Conversation ID and existing completed artifacts; it must not overwrite a prior successful transcript or summary before the replacement version is durable and validated.
- No audio bytes are persisted in browser localStorage or committed to GitHub. The demo cannot transcribe or summarize audio.
- The feature-gated `POST /api/manual-audio/jobs` client is included but the production endpoint is **not implemented**. The flag `window.MAFER_MANUAL_AUDIO_API_ENABLED` must remain disabled until the backend is approved.

### Backend contract (to implement)

`POST /api/manual-audio/jobs` (same-origin, authenticated, multipart/form-data):

- `audio`: binary recording, verified MIME/signature, max 50 MB (configurable by policy)
- `conversationId`: existing Genesys ID for retry, or an explicitly tracked manual ID for a new run
- `mode`: `new` or `retry`
- `bu`, `brand`, `agent`, `market`, `language`, `attempt`: validated against authoritative metadata and the caller's BU entitlements

Successful acceptance: HTTP 202 and JSON `{"jobId":"<opaque-id>","status":"queued"}`. The frontend must not infer that transcription, CRM update or QA processing completed from this acknowledgment. Expose a separate authenticated job-status endpoint and only display verified stage results.

Server-side requirements: Entra/SSO or approved identity, backend RBAC, virus scanning, content validation, throttling, file encryption, temporary upload storage, durable queue, job correlation, idempotent retries, failure classification, request tracing, retention, signed artifact access and audit history. Never accept a BU assignment from the browser without verifying the user's authorization. Avoid sending raw audio through APIM chat-completions endpoints. The STT adapter and LLM summarization adapter remain separate.

For a failed **summarization-only** job with a valid completed transcript, a production retry may use the existing transcript without retranscribing audio; the backend chooses the safe restart stage. For failed transcription, the manually attached recording can be used to restart STT. CRM update retries remain subject to CRM acknowledgment reconciliation and are not automatically triggered by a manual audio upload.

**Operational acceptance criteria:** upload with audio preview, no accidental auto-submission, a manual retry retaining the original Conversation ID, server-enforced BU access, mandatory audio-aligned start/end timestamps for every segment, clear queued/processing/completed/failed states, immutable output versions, and no synthetic findings presented as real audio-derived intelligence.
