# Multi-stage build tuned for Next.js `output: "standalone"`.
# Stage 1 installs deps + builds; stage 2 ships only the standalone server
# output + static assets, so the runtime image stays small and doesn't
# carry devDependencies or the full source tree.

FROM node:22-slim AS deps
WORKDIR /app
# openssl/ca-certificates: sharp/@resvg/resvg-js pull prebuilt native
# binaries at install time and need these present on slim/debian bases.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No secrets are needed at build time — Anthropic/Firecrawl/Supabase/Porter
# env vars are only read at request time (see src/lib/config/env.server.ts),
# never during `next build`.
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
	&& groupadd --system --gid 1001 nodejs \
	&& useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
