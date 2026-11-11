# MAFer Audio Intelligence

Standalone, bilingual contact-centre **audio transcription and interaction intelligence** platform prototype.

> **Prototype only:** all recordings, Genesys conversation IDs, CRM ticket references, service responses, provider states, tokens and errors in the application are synthetic. No actual Genesys, S3, CRM, APIM, Vault, or QA.MAFer.AI integrations are connected. Never enter real credentials or customer information into this preview.

## Scope

- **Operations Console:** end-to-end processing counts and statuses for transcription, AI summarization, CRM update, CRM confirmation, and QA handoff; stage-specific exceptions.
- **Interaction Explorer:** searchable full transcript, CRM summary, language, issues, sentiment, agent EQ/reasoning observations, ticket mapping, downloadable Word-compatible preview documents, and QA handoff status.
- **Configuration Console:** independently configured speech-to-text service, AI summarization service and enterprise connections, with simulated health/error diagnostics and auditable demo configuration changes.
- **AI Usage & Diagnostics:** audio minutes, LLM tokens, retries, provider error codes, request IDs and stage-specific diagnostics.
- **Demo personas:** Platform Admin and a business-unit restricted BU Lead. These are UI-only simulations; real authorization must be enforced on a backend.

## Design principles

1. The Genesys **Conversation ID** is the interaction correlation key. The CRM owns ticket IDs and the mapping from Conversation ID to one or more tickets.
2. This product owns transcription and interaction intelligence; **QA.MAFer.AI independently owns quality scoring**.
3. Full transcripts preserve English, Arabic and bilingual speech. CRM summaries are provided in configured languages.
4. EQ and reasoning are *observations supported by dialogue*, not psychometric IQ measurements or formal QA scores.
5. Failures are independently tracked by stage. CRM acknowledgment timeout must be reconciled before retrying writes.
6. The Word files are human-readable deliverables; **JSON/APIs** (once implemented) are for downstream CRM and QA consumption.
7. Sensitive credentials stay in corporate Vault; the admin UI should only reference DevOps-approved connections.

## Run locally

Open `index.html` in a modern browser. No dependencies or build tooling required.

The mockup's configuration and some simulated interaction actions are stored in browser localStorage only. Use *Reset demo* to restore the sample dataset. Do not treat localStorage as production persistence.

## Files

- `index.html` — page shell
- `styles.css` — responsive visual design
- `sample-data.js` — synthetic interactions and seeded configuration
- `app.js` — UI rendering, filtering, simulated actions, diagnostics, document exports
- `docs/ARCHITECTURE.md` — production integration boundaries and future build plan

## Production integration (not included)

Corporate AWS EKS, Genesys recording export to S3 + processing queue, configurable English/Arabic speech engine, APIM-based summarization, PostgreSQL, Vault and IAM, CRM ticket reconciliation, QA.MAFer.AI transcript API, authorization, audit, observability, security, retention, and approved S3 DOCX storage.

The frontend cannot determine if a provider is actually healthy by testing only from the browser: production connectivity tests and health metrics must run on a secure backend.

## Security

The GitHub repository was created with **public** visibility as observed when first accessed. Keep only synthetic data in this repository. Change visibility to private in GitHub settings before adding internal specs or sensitive implementation details; never commit secrets or real customer transcripts.
## Current preview limitations

- This version creates **Word-compatible .doc** demo downloads, not native **.docx**. Native DOCX generation and S3 folder writing belong in the production backend.
- This is a source-code build, **not yet a hosted site**. Browser functionality and CI workflow execution have not yet been confirmed in this chat.
- The demo role selector is not real authentication. Production needs backend-enforced RBAC.


## Personal test deployment

Cloudflare Workers URL provided by project owner:
https://mafer-audio-intelligence.kris-pradip.workers.dev/

**Verification:** The link was provided as the deployment target, but live reachability and the published code revision have not been verified from this environment.

### Test-data policy

The personal sandbox is intended to process **synthetic English, Arabic and bilingual audio recordings**. Using synthetic audio does **not** require model responses to be simulated: future integrations can call real, separately configurable speech-to-text and summarization APIs through server-side adapters with secure secrets. No real customer recordings, CRM credentials, or corporate secrets should be committed to this public repository.

Target test flow:
1. Upload or select a synthetic call recording; assign a mock Genesys Conversation ID.
2. Execute the approved speech-to-text service and capture the full time-aligned transcript.
3. Execute the independent AI summarization service to extract sentiment, agent reasoning/EQ observations, issues, summary and next steps.
4. Produce two Word documents and JSON artifacts.
5. Simulate or sandbox-test CRM ticket correlation, update, acknowledgment, timeout and retry/reconciliation.
6. Expose transcript JSON to QA.MAFer.AI without incorporating official QA scoring into this standalone service.

The committed frontend **currently simulates** the transcription, summary and connection responses. Real audio upload, actual model invocation and native DOCX export are future implementation items. GitHub-to-Cloudflare auto-deployment has not been established by this repository's current code.
