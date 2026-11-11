# Production architecture proposal

## Independent responsibility boundaries

**Genesys Cloud CX** creates Conversation IDs and audio recordings. It does not need to know the CRM ticket ID. Existing Genesys-to-CRM CTI or an enterprise mapping service must record relationships between Genesys Conversation ID and CRM ticket IDs, which can be many-to-many. The **CRM is authoritative** for ticket ID, ticket lifecycle and confirmation of updates.

**MAFer Audio Intelligence** ingests the recording + metadata, performs speaker-labelled English/Arabic transcription, uses a separately configured LLM for issues, sentiment, summary and observable EQ/reasoning indicators, generates DOCX/JSON, persists stage-specific status, and publishes completed outputs.

**QA.MAFer.AI** obtains transcript/audio evidence via a secured API or controlled S3 access and evaluates against its own BU rubric. No QA score is generated in this service.

## Proposed processing states

- transcription: waiting, queued, processing, completed, failed
- summarization: waiting, processing, completed, failed
- crm update: waiting, unmatched, sending, sent, failed, confirmed
- crm acknowledgment: waiting, confirmed, failed, uncertain
- QA handoff: waiting, delivered, failed

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

Data fields: Genesys Conversation ID, recording IDs/segments, agent IDs and names from Genesys metadata, queue-to-BU mapping, channel, market, language, caller country (only when verified; otherwise unknown), agent work location if available, speaker segments/timestamps, completeness indicator, issue array and resolution per issue, reason for contact, customer sentiment trend, observable EQ and reasoning evidence with confidence/source, processing versions and statuses, CRM mapping/status, QA handoff status.

Summary JSON is consumed directly by CRM. DOCX is primarily for human download or approved S3 archiving. Backend must enforce schema validation, sanitization, redaction, audit trail, access controls, signed retrieval and retention.

## Configuration security

Admin-managed: select from **DevOps-provisioned** connections/models, choose language and speaker policy (only when supported), set allowed retry/timeout profiles, select prompt/schema version, token/output limit, configure approved BU defaults, test connection and controlled sample workloads, activate configuration with audit history.

DevOps: provision AWS/EKS/queues/S3 buckets/IAM, APIM deployments/quotas, managed speech access, Vault secrets, network/TLS, approved CRM and QA credentials, monitoring and runtime policies. Production connection tests must be server-side. The UI must not accept raw keys.

## Prototype vs production

Current repository is UI-only with local in-browser simulation. Real authentication, per-BU authorization, backend health, audit persistence, document generation service, S3 integration and provider requests have **not** been implemented. Do not ingest real recordings into this public mockup.