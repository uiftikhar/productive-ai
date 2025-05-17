FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

# Copy package files from both root and client
COPY package.json yarn.lock ./
COPY client/package.json ./client/

# Install dependencies using workspace protocol
RUN yarn install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy all package files and dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY package.json yarn.lock ./
COPY client ./client

# Set working directory to client folder
WORKDIR /app/client

# Build the application (Next.js should be in node_modules)
RUN yarn build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

# Create a non-root user and switch to it
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy all node modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/client/node_modules ./node_modules

# Specifically copy the next package
COPY --from=builder /app/node_modules/next ./node_modules/next

# Copy the standalone build
COPY --from=builder /app/client/.next/standalone ./
COPY --from=builder /app/client/.next/static ./.next/static
COPY --from=builder /app/client/public ./public

USER nextjs

# Expose the port
EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Start the application
CMD ["node", "server.js"] 