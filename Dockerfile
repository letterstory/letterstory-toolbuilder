# Multi-stage build tuned for Next.js `output: "standalone"`.
# Stage 1 installs deps + builds; stage 2 ships only the standalone server
# output + static assets, so the runtime image stays small and doesn't
# carry devDependencies or the full source tree.

FROM node:22-slim AS deps
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# openssl/ca-certificates: sharp/@resvg/resvg-js pull prebuilt native
# binaries at install time and need these present on slim/debian bases.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install chromium

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
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
	openssl \
	ca-certificates \
	curl \
	unzip \
	fonts-liberation \
	libasound2 \
	libatk-bridge2.0-0 \
	libatk1.0-0 \
	libatspi2.0-0 \
	libcairo2 \
	libdbus-1-3 \
	libdrm2 \
	libgbm1 \
	libglib2.0-0 \
	libgtk-3-0 \
	libnspr4 \
	libnss3 \
	libpango-1.0-0 \
	libpangocairo-1.0-0 \
	libu2f-udev \
	libvulkan1 \
	libx11-6 \
	libx11-xcb1 \
	libxcb1 \
	libxcomposite1 \
	libxdamage1 \
	libxext6 \
	libxfixes3 \
	libxkbcommon0 \
	libxrandr2 \
	libxrender1 \
	libxshmfence1 \
	&& curl -fsSL https://install.porter.run | bash \
	&& rm -rf /var/lib/apt/lists/* \
	&& groupadd --system --gid 1001 nodejs \
	&& useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=deps --chown=nextjs:nodejs /ms-playwright /ms-playwright

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
