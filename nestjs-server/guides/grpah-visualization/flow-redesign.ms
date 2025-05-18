
# Meeting Analysis Flow Redesign

## Overview

This document outlines a comprehensive plan to reimagine the meeting analysis user experience by creating a real-time visualization workflow. The new design will:

1. Immediately redirect users to a dedicated session page after submitting a transcript
2. Show a real-time visualization of the agent workflow as it happens
3. Display final analysis results below the visualization when complete

## Client-Side Changes

### 1. `/meeting-analysis` Page Modifications

**File: `client/src/app/meeting-analysis/page.tsx`**

```markdown
- Simplify to focus solely on transcript submission
- Remove visualization-related code from this page
- Update for immediate redirect after session creation
```

**Changes:**
- Simplify the CreateSessionForm to only handle session creation
- Remove visualization components from this page
- Update form submission to redirect immediately on session creation

### 2. CreateSessionForm Component

**File: `client/src/components/meeting-analysis/create-session-form.tsx`**

```markdown
- Remove visualization-related code
- Modify to focus solely on session creation
- Update handleSubmit to redirect immediately on success
```

**Changes:**
```typescript
// Remove these lines
const [showVisualization, setShowVisualization] = useState(false);
const { events, connected, isLoading: isLoadingEvents, connectionError } = useAgentVisualization(sessionId || '');

// Update handleSubmit to immediately redirect
const handleSubmit = async (e: React.FormEvent) => {
  // ... existing validation code ...
  
  try {
    const response = await MeetingAnalysisService.analyzeTranscript(request);
    
    // Immediately redirect to session page
    router.push(`/meeting-analysis/${response.sessionId}`);
    
    // Notify parent with the session ID
    onAnalysisStarted(response.sessionId);
  } catch (err) {
    // ... error handling ...
  }
};

// Remove AgentVisualization component from the return JSX
```

### 3. Session Details Page Enhancement

**File: `client/src/app/meeting-analysis/[sessionId]/page.tsx`**

```markdown
- Restructure to show visualization at the top
- Add loading states for visualization and results
- Implement automatic refresh for analysis results
```

**Changes:**
- Update layout to prioritize visualization
- Add a clear visual separation between visualization and results
- Implement a status indicator showing analysis progress

```tsx
return (
  <div className="container mx-auto py-8">
    <h1 className="text-2xl font-bold mb-6">Meeting Analysis</h1>
    
    {/* Visualization Section */}
    <div className="mb-8">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Agent Workflow Visualization</CardTitle>
          <CardDescription>Real-time view of the analysis process</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <SessionVisualization sessionId={sessionId} />
        </CardContent>
      </Card>
    </div>
    
    {/* Results Section */}
    <div>
      <ResultsSection sessionId={sessionId} />
    </div>
  </div>
);
```

### 4. New SessionVisualization Component

**File: `client/src/components/meeting-analysis/visualization/SessionVisualization.tsx`**

```markdown
- Create new component focused on real-time visualization
- Connect to WebSocket and display agent workflow
- Show appropriate loading and error states
```

**Implementation:**
```tsx
'use client';

import { useAgentVisualization } from '@/hooks/useAgentVisualization';
import { AgentVisualization } from './AgentVisualization';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface SessionVisualizationProps {
  sessionId: string;
}

export function SessionVisualization({ sessionId }: SessionVisualizationProps) {
  const { events, connected, isLoading, connectionError } = useAgentVisualization(sessionId);
  
  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }
  
  if (connectionError && events.length === 0) {
    return (
      <Alert variant="destructive" className="m-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Connection Error</AlertTitle>
        <AlertDescription>
          {connectionError}
          <p className="mt-2">Unable to connect to the visualization service.</p>
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <AgentVisualization 
      events={events} 
      sessionId={sessionId} 
      connected={connected}
      connectionError={connectionError}
    />
  );
}
```

### 5. New ResultsSection Component

**File: `client/src/components/meeting-analysis/ResultsSection.tsx`**

```markdown
- Create component focused on displaying analysis results
- Implement auto-refresh until analysis is complete
- Show appropriate loading and error states
```

**Implementation:**
```tsx
'use client';

import { useState, useEffect } from 'react';
import { MeetingAnalysisService } from '@/lib/api/meeting-analysis-service';
import { ResultVisualization } from './result-visualization';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ResultsSectionProps {
  sessionId: string;
}

export function ResultsSection({ sessionId }: ResultsSectionProps) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchResults = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await MeetingAnalysisService.getAnalysisResults(sessionId);
      setResults(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load results');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchResults();
    
    // Auto-refresh if analysis is not complete
    const interval = setInterval(() => {
      if (results && (results.status === 'completed' || results.status === 'failed')) {
        clearInterval(interval);
      } else {
        fetchResults();
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [sessionId, results?.status]);
  
  if (loading && !results) {
    return <Skeleton className="h-96 w-full" />;
  }
  
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error loading results</AlertTitle>
        <AlertDescription>
          {error}
          <Button variant="outline" className="mt-2" onClick={fetchResults}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Analysis Results</h2>
        {results && results.status !== 'completed' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Analysis in progress... auto-refreshing
          </div>
        )}
      </div>
      
      {results && <ResultVisualization data={results} />}
    </div>
  );
}
```

### 6. Update useAgentVisualization Hook

**File: `client/src/hooks/useAgentVisualization.ts`**

```markdown
- Fix port configuration for WebSocket connection
- Improve error handling and reconnection logic
- Enhance event logging
```

**Changes:**
```typescript
// Update the API_URL line to ensure consistency
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Enhance socket configuration
const socketInstance = io(`${API_URL}/visualization`, {
  transports: ['websocket', 'polling'],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 10000
});
```

## Server-Side Changes

### 1. RagController Modification

**File: `nestjs-server/src/rag/rag.controller.ts`**

```markdown
- Modify to create session before starting analysis
- Return session ID immediately
- Update analysis endpoint to run asynchronously
```

**Changes:**
- Split session creation and analysis into separate operations
- Return session ID immediately after creation
- Start analysis process in the background

```typescript
@Post('/rag-meeting-analysis')
async analyzeTranscript(@Body() request: AnalyzeTranscriptRequest): Promise<{ sessionId: string }> {
  this.logger.log('Received transcript analysis request');
  
  // Create session immediately
  const sessionId = await this.workflowService.createSession({
    transcript: request.transcript,
    metadata: request.metadata
  });
  
  // Start analysis process in background
  this.workflowService.runAnalysis(sessionId).catch(error => {
    this.logger.error(`Analysis failed for session ${sessionId}: ${error.message}`, error.stack);
  });
  
  // Return session ID immediately
  return { sessionId };
}
```

### 2. WorkflowService Update

**File: `nestjs-server/src/langgraph/graph/workflow.service.ts`**

```markdown
- Split session creation and analysis processes
- Add session status tracking
- Ensure proper event emission for visualization
```

**Changes:**
- Create methods for session initialization and analysis execution
- Track session status (created, in_progress, completed, failed)
- Emit appropriate events for visualization

```typescript
/**
 * Create a new analysis session
 */
async createSession(data: { transcript: string, metadata: any }): Promise<string> {
  const sessionId = uuidv4();
  
  // Initialize session in database with status "created"
  await this.stateService.saveSession(sessionId, {
    transcript: data.transcript,
    metadata: data.metadata,
    status: 'created',
    createdAt: new Date().toISOString(),
  });
  
  this.logger.log(`Created new analysis session: ${sessionId}`);
  return sessionId;
}

/**
 * Run analysis for an existing session
 */
async runAnalysis(sessionId: string): Promise<void> {
  try {
    // Update session status to "in_progress"
    await this.stateService.updateSession(sessionId, { status: 'in_progress' });
    
    // Get session data
    const session = await this.stateService.getSession(sessionId);
    if (!session || !session.transcript) {
      throw new Error(`Invalid session: ${sessionId}`);
    }
    
    // Run the analysis workflow
    const result = await this.executeWorkflow(session);
    
    // Save results and update status to "completed"
    await this.stateService.updateSession(sessionId, { 
      status: 'completed',
      results: result,
      completedAt: new Date().toISOString()
    });
    
    this.logger.log(`Analysis completed for session ${sessionId}`);
  } catch (error) {
    // Update session status to "failed"
    await this.stateService.updateSession(sessionId, {
      status: 'failed',
      error: error.message,
      completedAt: new Date().toISOString()
    });
    
    this.logger.error(`Analysis failed for session ${sessionId}: ${error.message}`);
    throw error;
  }
}
```

### 3. VisualizationGateway Enhancements

**File: `nestjs-server/src/langgraph/visualization/visualization.gateway.ts`**

```markdown
- Improve event emission for visualization
- Enhance session history management
- Better error handling for WebSocket connections
```

**Changes:**
- Ensure all agent events have sessionId for proper routing
- Implement robust error handling for WebSocket events
- Improve cleanup of disconnected clients

```typescript
// Ensure CORS is properly configured
@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:8080'],
    credentials: true
  },
  namespace: 'visualization',
})

// Improve broadcastEvent method
private async broadcastEvent(eventName: string, payload: any) {
  // ... existing implementation with improved error handling
}
```

### 4. AgentEventService Improvements

**File: `nestjs-server/src/langgraph/visualization/agent-event.service.ts`**

```markdown
- Ensure consistent event structure
- Improve error handling
- Add more descriptive event types
```

**Changes:**
- Ensure all events have required fields (sessionId, timestamp, etc.)
- Add event types for workflow status changes
- Improve error handling for event emission failures

```typescript
/**
 * Emit a workflow status event
 */
emitWorkflowEvent(
  eventType: 'created' | 'started' | 'completed' | 'failed',
  payload: { sessionId: string; [key: string]: any }
) {
  const event = {
    ...payload,
    timestamp: payload.timestamp || Date.now(),
    eventType
  };
  
  try {
    this.eventEmitter.emit(`workflow.${eventType}`, event);
    this.logger.debug(`Emitted workflow.${eventType} event for ${payload.sessionId}`);
  } catch (error) {
    this.logger.error(`Failed to emit workflow.${eventType} event: ${error.message}`);
  }
}
```

## Client-Server Integration

### 1. API Service Updates

**File: `client/src/lib/api/meeting-analysis-service.ts`**

```markdown
- Update API methods to match new server endpoints
- Add method for checking analysis status
- Improve error handling
```

**Changes:**
```typescript
/**
 * Submit a transcript for analysis
 */
static async analyzeTranscript(request: AnalyzeTranscriptRequest): Promise<{ sessionId: string }> {
  const response = await api.post('/rag-meeting-analysis', request);
  return response.data;
}

/**
 * Get analysis results for a session
 */
static async getAnalysisResults(sessionId: string): Promise<MeetingAnalysisResponse> {
  const response = await api.get(`/rag-meeting-analysis/${sessionId}`);
  return response.data;
}

/**
 * Check analysis status
 */
static async checkAnalysisStatus(sessionId: string): Promise<{ status: string }> {
  const response = await api.get(`/rag-meeting-analysis/${sessionId}/status`);
  return response.data;
}
```

### 2. WebSocket Event Schema

Update the WebSocket event schema to ensure consistency:

```typescript
interface BaseEvent {
  timestamp: number;
  sessionId: string;
}

interface AgentEvent extends BaseEvent {
  event: string;
  data: {
    agentId: string;
    agentType: string;
    parentAgentId?: string;
    duration?: number;
    input?: any;
    output?: any;
    error?: string;
  };
}

interface ServiceEvent extends BaseEvent {
  event: string;
  data: {
    serviceType: 'rag' | 'pinecone' | 'llm';
    operation: string;
    agentId: string;
    query?: { [key: string]: any };
    options?: { [key: string]: any };
  };
}

interface WorkflowEvent extends BaseEvent {
  event: string;
  data: {
    status: 'created' | 'in_progress' | 'completed' | 'failed';
    metadata?: any;
  };
}
```

## Implementation Plan

### Phase 1: Server-Side Changes

1. Modify RagController to split session creation and analysis
2. Update WorkflowService with new session management methods
3. Enhance VisualizationGateway for improved WebSocket handling
4. Update AgentEventService with new event types

### Phase 2: Client-Side Changes

1. Update API service with new endpoint methods
2. Modify CreateSessionForm for immediate redirect
3. Create SessionVisualization component
4. Implement ResultsSection component
5. Update the session details page layout

### Phase 3: Testing and Refinement

1. Test WebSocket connection and event flow
2. Verify real-time visualization updates
3. Ensure analysis results are displayed properly
4. Test error handling and recovery

## Conclusion

This implementation plan creates a more seamless and engaging user experience for meeting analysis. By separating session creation from analysis execution and providing immediate feedback through real-time visualization, users will have a better understanding of the analysis process and improved engagement with the application.

The new flow provides:
- Immediate feedback after transcript submission
- Real-time visualization of the analysis process
- Clear status updates throughout the workflow
- Comprehensive results display once analysis is complete
