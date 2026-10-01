FROM node:20-bookworm-slim

WORKDIR /app

# Prisma's query engine needs OpenSSL; Debian slim ships a compatible libssl
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# ⚠️ 2026-09-02: build context is now the repo ROOT (see docker-compose.yml),
# not backend/ — schema.prisma moved to database/schema.prisma (see
# CLAUDE.md's Database Schema section / package.json's "prisma.schema"
# field) and needs to be reachable from this build. All COPY paths below
# are relative to that root context accordingly.

# Install deps first for better layer caching
COPY backend/package*.json ./
RUN npm install

# Copy backend source...
COPY backend/. .
# ...and the Prisma schema, staged at ./prisma/schema.prisma for the
# build-time generate only. Kept INSIDE /app on purpose — Prisma infers its
# "project root" as the common ancestor of the schema's directory and the
# CWD, and a schema outside /app made that ancestor "/" (no package.json),
# so `prisma generate` tried and failed to auto-install prisma there.
# --schema overrides package.json's "../database/schema.prisma", which
# points at the /database mount that only exists at runtime (compose).
# Not ./database any more: that name, mirrored by compose, is what used to
# create an empty backend/database folder on the host (2026-09-15).
COPY database/schema.prisma ./prisma/schema.prisma
RUN npx prisma generate --schema ./prisma/schema.prisma

EXPOSE 4000

CMD ["npm", "run", "dev"]
