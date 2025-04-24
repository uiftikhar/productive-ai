# Productive AI Client

This directory contains the client application for Productive AI, built with Next.js 14 and focused on visualizing and interacting with the agent-based backend system.

## Features

- Agent visualization dashboard
- Real-time workflow monitoring
- Interactive agent testing console
- Performance metrics visualization
- Theme classification and knowledge gap analysis UI

## Getting Started

### Prerequisites

- Node.js 18+
- yarn
- Backend server running

### Installation

```bash
# Install dependencies
yarn install

# Start development server
yarn dev
```

The application will be available at http://localhost:8080.

## Development Environment

### Environment Variables

Create a `.env.local` file with the following variables:

```
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000

# Authentication (if applicable)
NEXT_PUBLIC_AUTH_ENABLED=true
```

### Project Structure

```
client/
├── public/              # Static assets
├── src/
│   ├── app/             # Next.js App Router pages
│   ├── components/      # Reusable UI components
│   │   ├── agents/      # Agent-specific components
│   │   ├── dashboard/   # Dashboard components
│   │   ├── ui/          # Shadcn UI components
│   │   └── visualization/ # Graph visualization components
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Utility functions
│   ├── services/        # API service layer
│   └── types/           # TypeScript type definitions
└── ...
```

## Integration with Backend

### API Communication

The client application communicates with the backend server through:

1. REST API endpoints for CRUD operations
2. WebSocket connections for real-time updates
3. Server-sent events for stream processing

Example API client setup:

```typescript
// src/services/api.ts
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add authentication interceptors here
```

### WebSocket Integration

For real-time agent visualization:

```typescript
// src/hooks/useAgentMonitoring.ts
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000';

export function useAgentMonitoring() {
  const [traces, setTraces] = useState([]);
  
  useEffect(() => {
    const socket = io(WS_URL);
    
    socket.on('trace-update', (data) => {
      setTraces((prev) => [...prev, data]);
    });
    
    return () => {
      socket.disconnect();
    };
  }, []);
  
  return { traces };
}
```

## Available Scripts

- `yarn dev` - Start development server
- `yarn build` - Build for production
- `yarn start` - Start production server
- `yarn lint` - Run ESLint
- `yarn test` - Run tests

## Deployment

### Production Build

```bash
yarn build
```

### Docker Deployment

```bash
docker build -t productive-ai-client .
docker run -p 8080:3000 productive-ai-client
```

### With Docker Compose

See the root directory's docker-compose.yml for combined deployment with the backend.

## Contributing

1. Create feature branches from `main`
2. Follow the existing code style and component patterns
3. Write tests for new features
4. Submit pull requests with detailed descriptions
