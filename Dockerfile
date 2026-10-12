# Production image from the Next.js standalone output: only traced runtime
# files, no source checkout or devDependencies needed at runtime.
# Build: docker build -t oneground .
# Run:   docker run -p 3180:3000 -v oneground-data:/data oneground
FROM node:22-bookworm-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    ONEGROUND_DB_PATH=/data/oneground.sqlite
RUN adduser --system --uid 1001 oneground
COPY --from=builder /app/.next/standalone ./
USER oneground
VOLUME /data
EXPOSE 3000
CMD ["node", "server.js"]
