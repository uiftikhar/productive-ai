# Meeting Analysis Chat Integration

This document provides instructions for running the integrated meeting analysis chat system. The system consists of a Next.js frontend and a Node.js/Express backend with our hierarchical agent architecture.

## System Overview

The integration consists of:

1. **Frontend** (Next.js)
   - Chat UI for interacting with the analysis system
   - Transcript upload capabilities
   - Analysis status tracking and result visualization

2. **Backend** (Express)
   - API endpoints for chat interaction
   - SupervisorCoordinationService orchestrating analysis
   - ChatAgentInterface for NLP-based interaction
   - Persistence and state management

## Prerequisites

- Node.js 16+ and npm
- Git

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/productive-ai.git
   cd productive-ai
   ```

2. Install server dependencies:
   ```bash
   cd server
   npm install
   ```

3. Install client dependencies:
   ```bash
   cd ../client
   npm install
   ```

## Configuration

1. Create a `.env` file in the server directory:
   ```bash
   cd ../server
   touch .env
   ```

2. Add the following environment variables to the server `.env` file:
   ```
   PORT=3001
   CLIENT_URL=http://localhost:3000
   ```

3. Create a `.env.local` file in the client directory:
   ```bash
   cd ../client
   touch .env.local
   ```

4. Add the following environment variables to the client `.env.local` file:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```

## Running the System

### Development Mode

1. Start the server:
   ```bash
   cd ../server
   npm run dev
   ```

2. In a new terminal, start the client:
   ```bash
   cd ../client
   npm run dev
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:3000/chat
   ```

### Production Mode

1. Build and start the server:
   ```bash
   cd ../server
   npm run build
   npm start
   ```

2. Build and start the client:
   ```bash
   cd ../client
   npm run build
   npm start
   ```

## Using the Chat Interface

1. **Start a Chat Session**
   - Navigate to `http://localhost:3000/chat`
   - The system will automatically create a new session

2. **Upload a Transcript**
   - Click the attachment button (paperclip icon)
   - Select a transcript file (.txt, .md, .json, or .vtt format)
   - The system will upload and begin analyzing the transcript

3. **Chat with the System**
   - Ask questions about the meeting transcript
   - Request summaries, action items, key topics, etc.
   - View related meetings when analysis is complete

## Troubleshooting

### Server Issues

- Check server logs for errors:
  ```bash
  cd server
  npm run logs
  ```

- Verify the server is running:
  ```bash
  curl http://localhost:3001/api/health
  ```

### Client Issues

- Clear browser cache and reload
- Check browser console for errors
- Verify API URL in `.env.local` matches server address

## Development Notes

### Adding New Features

1. **Backend Enhancements**
   - Add new services to `server/src/langgraph/agentic-meeting-analysis/services/`
   - Update the ServiceFactory to initialize new services
   - Add API routes in `server/src/api/chat/`

2. **Frontend Enhancements**
   - Extend API client in `client/src/lib/api/chat.ts`
   - Add new UI components in `client/src/components/chat/`
   - Update chat interface to support new features
