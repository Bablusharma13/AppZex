# syntax=docker/dockerfile:1
#
# Isolated, multi-stage build for the AppZex AgencyOS API.
#
# Why a Dockerfile instead of letting the host run `npm install`:
# this repository is an npm workspace, so dependencies are hoisted to the repo
# root. Running `npm install` from `backend/` resolves to that root and would
# drag the entire Next.js frontend in as well. Copying only `backend/package.json`
# makes npm treat this directory as a standalone project, so the image contains
# the API and nothing else.

# ----------------------------------------------------------------- build ----
FROM node:22-alpine AS build

WORKDIR /app

# Manifests first so the dependency layer is cached until they change.
# NOTE: `npm install` rather than `npm ci`, because the lockfile for this
# workspace lives at the repository root and does not describe this isolated
# tree.
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# --------------------------------------------------------------- runtime ----
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# Production dependencies only - no TypeScript, no Jest, no test tooling.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist

# Uploaded files live outside the web root. On Render this should be a
# persistent disk; without one the container filesystem is ephemeral and
# uploads are lost on every redeploy.
RUN mkdir -p /app/storage
ENV STORAGE_DIR=/app/storage

EXPOSE 5000

# Render's health check endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "dist/server.js"]