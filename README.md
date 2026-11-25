# MAFer Audio Intelligence — Corporate EKS Build

**Source branch: corporate/eks-audio-intelligence**

This is the **corporate Node.js/EKS source code**, adapted from the personal audio intelligence prototype using the actual MAFerLens Node.js 24/distroless Docker and server pattern. This application is independently deployed and does not modify MAFerLens.

**Status: EKS integration candidate. Not approved production.** Corporate security, IAM, authentication, performance, S3/Transcribe and APIM connectivity tests are mandatory before customer recordings.

## Runtime

- Node.js 24 server: src/server.js, port 8080.
- Dockerfile: Node 24 Alpine build/verification and distroless Node 24 Debian 13 non-root final image.
- Amazon Transcribe batch with speaker diarization and real timestamps, through AWS SDK v3 (src/aws-transcribe.js).
- Corporate Azure OpenAI/Foundry through approved APIM and Vault-injected secret (src/enterprise-ai.js), based on the MAFerLens enterprise AI adapter.
- Background S3 scanner/processor (src/s3-processor.js) continues processing without an open browser.
- Manual upload: one click runs transcription, conservative speaker identification, AI intelligence and S3 publication (src/publish.js).
- Existing frontend pages under public/ are served by the Node app, **not Cloudflare**.

## Corporate deployment steps

1. Download this branch and upload its **extracted folder structure** into a dedicated corporate GitHub application/repository, separate from MAFerLens.
2. Replace placeholders in deploy/eks.example.yaml using your actual corporate namespace, registry, internal hostname, approved AWS region, bucket names and APIM endpoint. This is a template, not a directly deployable manifest.
3. Configure an independent EKS ServiceAccount with an approved **Pod Identity or IRSA** role; never place static AWS access keys in source, environment templates or the UI.
4. Authorize least-privilege S3 List/Get/Put/Head for approved input/output prefixes, Delete for temporary staging audio, Amazon Transcribe Start/Get, and KMS access when applicable. Verify the Transcribe service can read input and write its output to S3.
5. Inject ENTERPRISE_AI_API_KEY through Vault or an approved Kubernetes secret integration. ENTERPRISE_AI_ENDPOINT remains a non-secret runtime setting.
6. Provision the standard corporate internal-only ingress with TLS, authentication, networking and approved outbound paths. Set PUBLIC_ORIGIN to the full corporate HTTPS origin. **No SSO or RBAC middleware has been implemented in this application.**
7. Test in EKS dev with approved synthetic/anonymized audio. The corporate pipeline should generate and commit a reviewed package-lock.json and then use npm ci for reproducible builds.

The app adopts MAFerLens's deployment convention but must use its **own** ingress hostname, service account, storage, and release lifecycle. Do not copy MAFerLens's existing application secrets or database.

## Environment configuration

Core variables are represented in deploy/eks.example.yaml:

- PORT = 8080
- PUBLIC_ORIGIN = corporate HTTPS origin
- AWS_REGION = approved AWS region
- TRANSCRIPTION_PROVIDER = amazon
- ANALYSIS_PROVIDER = enterprise
- ANALYSIS_MODEL = approved deployment, e.g. gpt-4o
- ENTERPRISE_AI_ENDPOINT = approved APIM HTTPS Chat Completions URL
- ENTERPRISE_AI_API_KEY = secret injected at runtime
- S3_INPUT_BUCKET / S3_INPUT_PREFIX
- S3_OUTPUT_BUCKET / S3_OUTPUT_PREFIX
- S3_PROCESS_ENABLED = true
- S3_SCAN_INTERVAL_SECONDS = 90
- S3_MAX_BATCH = 3
- TRANSCRIBE_LANGUAGE_MODE = auto or multi (confirm country/language combinations)
- MAX_SPEAKERS = 5
- S3_KMS_KEY_ID = optional corporate KMS key

The configuration page **displays effective S3 and provider settings read-only** and checks real S3 list-access. Securely editing runtime values from that page is not implemented yet: updating approved ConfigMap/secret references and rolling out pods changes the service **without changing Docker source**. All credentials remain server side.

## Build and validation

~~~sh
npm install
npm run check:eks
npm test
docker build -t mafer-audio-intelligence:eks .
~~~

The corporate image copies worker.mjs as an internal API module only. It does not run Wrangler or Cloudflare Workers.

## Health and API endpoints

- GET /api/livez — liveness probe
- GET /readyz — runtime configuration readiness; **not** vendor-connection verification
- GET /api/health — configured provider names and model IDs
- GET /api/config — effective S3/provider settings, no secrets
- GET /api/operations — S3 scanner status and recent jobs (per-pod, non-persistent counters)
- GET /api/connections/health — actual S3 list-access check only; **not** a live Transcribe/APIM test
- POST /api/transcribe — upload audio; Amazon Transcribe batch
- POST /api/identify-speakers — evidence-linked, unverified candidate roles
- POST /api/analyze — transcript-grounded universal interaction intelligence
- POST /api/publish — manual analyzed package to corporate S3

All interfaces must be behind authenticated internal ingress. There is no integrated corporate SSO in this source package.

## Universal S3 output

The EKS scanner reads files from the configured input prefix. Genesys metadata can be provided by an adjacent sidecar file (<audio-filename-stem>.metadata.json or <audio-filename-stem>.json). BU may also be derived from a trusted BU-labelled input key. **Missing BU/agent/market values remain unassigned, not guessed.**

Output paths:

~~~text
<S3_OUTPUT_PREFIX>/BU/Brand/Market/YYYY/MM/DD/InteractionID/run-<fingerprint>/
  Full_Transcript/transcript.json
  Full_Transcript/transcript.txt
  CRM_Summary/summary.json
  Machine_Data/interaction_metadata.json
  Machine_Data/universal_intelligence.json
  Machine_Data/timeline_metrics.json
  Machine_Data/acoustic_evidence.json
  Machine_Data/evidence_provenance.json
  manifest.json
~~~

The manifest is written last. COMPLETE marks the package ready for BU-specific QA consumers. Unclear diarized speaker roles produce NEEDS_SPEAKER_REVIEW, not a falsely verified agent/customer mapping. The model outputs no QA scores. Failed S3 items generate durable failure markers under <S3_OUTPUT_PREFIX>/_failures/ and do not repeatedly trigger paid requests on every scan. Removing a failure marker after investigation permits retry.

Timestamp-based talk ratios, gaps and overlap intervals are provisional derived metrics, not verified waveform evidence. Acoustic evidence is NOT_PROCESSED until an actual signal analyzer is added. CRM actions and policy compliance are not inferred as externally verified facts from audio alone.

## Limits and pending production readiness

- One EKS scanner replica only. Production-scale concurrency requires SQS/distributed job coordination and durable centralized job-status storage.
- Current Operations counters exist per pod and reset on restart. S3 manifests remain durable.
- Speaker-review workflows require an administrative review/resume implementation before full unattended completion can be guaranteed.
- Manual Amazon Transcribe batch requests may run longer than standard ingress idle timeouts; validate with IT. The background S3 pipeline is the preferred operating mode.
- APIM model output, Arabic/English switching, transcription quotas, S3 regional support, folder authorization, encryption, scanning throughput, and actual AWS IAM must be validated in corporate EKS.
- MAFerLens consumption of the richer versioned metadata is a **separate application update**, not implemented in this repository.
- No customer PII/call recordings should be uploaded before corporate security, retention and access approvals.

## Personal POC stays separate

The personal GitHub main branch remains the Cloudflare/Gemini prototype. **Do not merge personal Wrangler/Cloudflare configuration into the corporate deployment.** This dedicated branch is the corporate EKS package.
