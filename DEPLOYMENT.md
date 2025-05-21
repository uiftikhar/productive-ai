# FollowThrough AI Deployment Guide

This guide explains how to deploy the FollowThrough AI application in a production environment using Docker.

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ and npm installed for local development and building
- Git for cloning the repository

## Production Deployment

### Option 1: Using the Automated Script

The simplest way to deploy the application is to use the provided build script:

```bash
./build-production.sh
```

This script will:
1. Check for Docker and Docker Compose
2. Create a `.env` file if it doesn't exist
3. Build both server and client applications
4. Build Docker images
5. Start the containers in detached mode

### Option 2: Manual Deployment

If you prefer to deploy manually, follow these steps:

1. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your production values
   ```

2. **Build the applications**:
   ```bash
   # Build server
   cd server
   npm install
   npm run build
   cd ..

   # Build client
   cd client
   npm install
   npm run build
   cd ..
   ```

3. **Build and start Docker containers**:
   ```bash
   docker-compose build
   docker-compose up -d
   ```

## Environment Variables

Ensure your `.env` file contains all required variables:

```
# MongoDB Settings
MONGO_USERNAME=your_username
MONGO_PASSWORD=your_secure_password

# OpenAI API
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4-turbo

# Pinecone (for vector database)
PINECONE_API_KEY=your_pinecone_key
PINECONE_REGION=us-west-1
PINECONE_CLOUD=aws
PINECONE_INDEX=productive-ai

# JWT for authentication
JWT_SECRET=your_secure_secret_key
JWT_EXPIRATION=24h

# Client settings
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

## Monitoring and Management

- **View logs**:
  ```bash
  docker-compose logs -f
  ```

- **Stop the application**:
  ```bash
  docker-compose down
  ```

- **Restart the application**:
  ```bash
  docker-compose restart
  ```

## Scaling and Production Considerations

For a production environment, consider:

1. Using a managed MongoDB service instead of the Docker container
2. Setting up a reverse proxy (Nginx, Traefik) with SSL
3. Implementing proper monitoring and alerting
4. Using container orchestration for larger deployments (Kubernetes)

## Troubleshooting

- **Container fails to start**: Check logs with `docker-compose logs -f service_name`
- **Database connection issues**: Verify MongoDB connection string and credentials
- **API not accessible**: Ensure ports are properly exposed and not blocked by firewall 