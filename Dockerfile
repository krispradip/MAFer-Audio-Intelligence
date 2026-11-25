# Mirrors MAFerLens EKS pattern: Node 24 verification stage -> distroless non-root runtime.
FROM node:24-alpine AS verify
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src/ ./src/
COPY public/ ./public/
COPY worker.mjs speaker-roles.mjs ./
RUN npm run check:eks
RUN node --check speaker-roles.mjs

FROM gcr.io/distroless/nodejs24-debian13:nonroot
WORKDIR /app
ENV NODE_ENV=production PORT=8080 TRANSCRIPTION_PROVIDER=amazon ANALYSIS_PROVIDER=enterprise
COPY --from=verify --chown=65532:65532 /app/package.json ./
COPY --from=verify --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=verify --chown=65532:65532 /app/src ./src
COPY --from=verify --chown=65532:65532 /app/public ./public
COPY --from=verify --chown=65532:65532 /app/worker.mjs ./worker.mjs
COPY --from=verify --chown=65532:65532 /app/speaker-roles.mjs ./speaker-roles.mjs
USER 65532
EXPOSE 8080
CMD ["src/server.js"]
