# Production architecture proposal

## Independent responsibility boundaries

**Genesys Cloud CX** creates Conversation IDs and audio recordings. It does not need to know the CRM ticket ID. Existing Genesys-to-CRM CTI or an enterprise mapping service must record relationships between Genesys Conversation ID and CRM ticket IDs, which can be many-to-many. The **CRM is authoritative** for ticket ID, ticket lifecycle and confirmation of updates.

**MAFer Audio Intelligence** ingests the recording + metadata, performs speaker-labelled English/Arabic transcription, uses a separately configured LLM for issues, sentiment, summary and observable EQ/reasoning indicators, generates DOCX/JSON, persists stage-specific status, and publishes completed outputs.

**QA.MAFer.AI** independently consumes completed transcript JSON and evidence metadata from approved S3 locations using read-only IAM access. It performs assessments against its own BU rubric and owns assessment state. No QA score or push-based QA handoff is generated in the transcription service.

## Proposed processing states

- transcription: waiting, queued, processing, completed, failed
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

Data fields: Genesys Conversation ID, recording IDs/segments, agent IDs and names from Genesys metadata, queue-to-BU mapping, channel, market, language, caller country (only when verified; otherwise unknown), agent work location if available, speaker segments/timestamps, completeness indicator, issue array and resolution per issue, reason for contact, customer sentiment trend, observable EQ and reasoning evidence with confidence/source, processing versions and statuses, CRM mapping/status, S3 transcript/summary publication statuses, object versions and manifest URI.

CRM updates use the summary through an authenticated CRM API; QA reads transcript JSON from S3. DOCX is primarily for human download or approved S3 archiving. Backend must enforce schema validation, sanitization, redaction, audit trail, access controls, signed retrieval and retention.

## Configuration security

Admin-managed: select from **DevOps-provisioned** connections/models, choose language and speaker policy (only when supported), set allowed retry/timeout profiles, select prompt/schema version, token/output limit, configure approved BU defaults, test connection and controlled sample workloads, activate configuration with audit history.

DevOps: provision AWS/EKS/queues/S3 buckets/IAM, APIM deployments/quotas, managed speech access, Vault secrets, network/TLS, approved CRM credentials and QA read-only S3 IAM access, monitoring and runtime policies. Production connection tests must be server-side. The UI must not accept raw keys.

## Prototype vs production

Current repository is UI-only with local in-browser simulation. Real authentication, per-BU authorization, backend health, audit persistence, document generation service, S3 integration and provider requests have **not** been implemented. Do not ingest real recordings into this public mockup.
## Data ownership and database boundaries

Reuse existing corporate PostgreSQL infrastructure if capacity, security and lifecycle requirements permit, but use **separate application databases or isolated schemas and credentials**:

- Audio Intelligence owns ingestion jobs, Genesys Conversation ID, recording references, transcript versions, agent/BU metadata, issues and sentiment observations, CRM ticket mapping and status, S3 object URIs and version IDs, processing history, and AI usage diagnostics.
- QA.MAFer.AI owns assessment jobs, rubric versions, evidence, coverage, QA scores, and evaluation history.
- QA references the Genesys Conversation ID **plus transcript version/object version**. Avoid storing a second canonical full transcript in QA PostgreSQL.
- S3 stores the actual transcript DOCX/JSON, summary DOCX/JSON, metadata and completion manifest. Only published, complete, schema-valid transcript artifacts may be consumed by QA. Summary failure must not block transcript availability.
- S3 event notifications/SQS can wake the QA ingestion worker, which then fetches the manifest and artifacts; scheduled polling is an alternative. QA ingestion is idempotent on Conversation ID + transcript version. A notification is not proof QA assessment completed.

## User permissions

BU Leads see their BU interactions, full transcripts and CRM summaries and can download human-readable Word documents. They do not receive JSON export or technical configuration access. Platform Admins can export JSON for troubleshooting. Production permissions must be enforced by backend authorization, not just hidden UI buttons.
