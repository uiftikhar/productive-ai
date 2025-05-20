# syntax=docker/dockerfile:1

FROM node:20-alpine AS base

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package.json from client directory and yarn.lock from root
COPY client/package.json ./
COPY yarn.lock ./

# Install dependencies with yarn
RUN yarn install --frozen-lockfile


# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

COPY client/.env.production .env.production

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy client source code
COPY client/ ./
# tsconfig.json is already included in the client directory copy

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Ensure next is available for building
RUN yarn add next@14.0.3

# Build the Next.js app
RUN yarn build

# Production image, copy all the files and run next
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production
# Disable telemetry during runtime
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# server.js is created by next build from the standalone output
CMD ["node", "server.js"]
