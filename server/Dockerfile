FROM node:20-alpine AS build

WORKDIR /app

RUN yarn global add @nestjs/cli

# Copy yarn.lock from root and package.json from server
COPY yarn.lock ./
COPY server/package.json ./

RUN yarn install

# Copy server source code
COPY server/ ./

# Build the application
RUN yarn build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy yarn.lock from root and package.json from server
COPY yarn.lock ./
COPY server/package.json ./

RUN yarn install --production

# Copy built application from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data

# Create data directories with proper permissions
RUN mkdir -p data/file-storage/meetings \
    data/file-storage/memory \
    data/file-storage/results \
    data/file-storage/sessions \
    data/file-storage/teams \
    data/file-storage/transcripts && \
    chmod -R 777 data/file-storage

# Environment variables
ENV NODE_ENV=production

# Expose the port the app will run on
EXPOSE 3000

# Start the application
CMD ["node", "dist/main"] 