#!/bin/bash
set -e

echo "🚀 Starting production build and deployment..."

# Ensure the script exits on any error
set -e

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker and try again."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose and try again."
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️ .env file not found. Creating from .env.example..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ Created .env file from .env.example. Please edit it with your production values."
    else
        echo "❌ .env.example file not found. Please create a .env file manually."
        exit 1
    fi
fi

echo "🔨 Building server and client..."

# Build the server
echo "🔨 Building server..."
cd server
npm install
npm run build
cd ..

# Build the client
echo "🔨 Building client..."
cd client
npm install
npm run build
cd ..

# Build Docker images
echo "🔨 Building Docker images..."
docker-compose build

# Start the containers
echo "🚀 Starting Docker containers..."
docker-compose up -d

echo "✅ Production deployment completed!"
echo "🌐 Client is running at: http://localhost:3000"
echo "🔌 Server API is running at: http://localhost:3001"
echo ""
echo "📋 To view logs: docker-compose logs -f"
echo "🛑 To stop: docker-compose down" 