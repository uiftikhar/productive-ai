FROM node:18-alpine

WORKDIR /app

# Install TypeScript globally
RUN yarn global add typescript

# Copy package files from both root and server
COPY package.json yarn.lock ./
COPY server/package.json ./server/

# Install dependencies using workspace protocol
RUN yarn install --frozen-lockfile

# Copy the server application
COPY server ./server

# Set working directory to server folder
WORKDIR /app/server

# Fix p-limit version to a CommonJS compatible version
RUN yarn add p-limit@3.1.0

# Build the application
RUN yarn build

# Expose the correct port (server runs on 3000)
EXPOSE 3000

# Start the application
CMD ["node", "dist/index.js"]