# MAFer Audio Intelligence — EKS architecture

## Universal service

One standalone enterprise audio intelligence service serves every BU. Genesys audio and approved
interaction tags enter S3. The EKS processor uses Amazon Transcribe, corporate APIM for transcript
intelligence, and writes immutable interaction evidence to a categorized S3 output prefix.

SHARE, Retail, VOX and AMBU QA tools are **independently deployed consumers** of that versioned
evidence package. Rubrics, scores, coaching decisions and BU-specific workflows are not part
of the central transcription engine.

## Architecture

1. Corporate EKS Node.js 24 server (port 8080), MAFerLens-style distroless non-root container.
2. Server-side S3 poller with Pod Identity/IRSA and verified input metadata.
3. Amazon Transcribe batch with word timestamps, language selection and diarization.
4. Evidence-gated speaker mapping; uncertain assignments require review.
5. Corporate APIM inference for contact reasons, actions, sentiment and evidence-linked observations.
6. S3 publisher writes full transcript, CRM summary, universal intelligence, timestamp metrics,
   provenance, acoustic status, and COMPLETE/NEEDS_SPEAKER_REVIEW manifest last.
7. BU-specific MAFerLens consumers access approved BU outputs under their own authorization.

## Processing limitations

- The S3 poller is single-replica; distributed SQS job coordination is future work.
- Runtime ConfigMap/secret changes do not need a Docker source update, but do require an EKS rollout.
- UI displays S3 paths and connectivity; authenticated editing of corporate settings is not available.
- Provider-timestamp overlap and gap measurements are candidates, not verified acoustic indicators.
- Acoustic waveform analyzer, CRM verification, QA scoring, durable job database and MAFerLens adapter
  are not shipped in this codebase.
- Corporate ingress authentication, IAM, retention, encryption and vendor connectivity must be
  approved and tested before production customer recordings.

## Key files

- Dockerfile: Node 24 distroless image.
- deploy/eks.example.yaml: ConfigMap, Deployment and Service placeholders.
- src/server.js: Node HTTP/static UI and health endpoints.
- src/aws-transcribe.js: AWS S3 and Transcribe batch adapter.
- src/enterprise-ai.js: MAFerLens-pattern Azure APIM JSON adapter.
- src/s3-processor.js: server-side S3 scan, identity, processing and manifests.
- src/publish.js: manual recording output to S3.
- public/: frontend for upload, transcripts, intelligence, operations and configuration.
- README.md: integration/deployment instructions.
