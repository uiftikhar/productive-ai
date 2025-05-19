FROM node:18-alpine AS build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built application from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data

# Create data directories if they don't exist
RUN mkdir -p data/file-storage/meetings data/file-storage/memory data/file-storage/results \
    data/file-storage/sessions data/file-storage/teams data/file-storage/transcripts

# Environment variables
ENV NODE_ENV=production

# Expose the port the app will run on
EXPOSE 3000

# Start the application
CMD ["node", "dist/main"] 