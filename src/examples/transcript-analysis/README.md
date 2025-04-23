# Transcript Analysis Interface

This example demonstrates a practical implementation of our agent architecture, focusing on meeting transcript analysis and knowledge gap detection.

## Overview

The Transcript Analysis Interface provides a chat-based UI where users can:

1. Upload meeting transcripts for analysis
2. Receive detailed analysis of individual transcripts
3. Compare multiple transcripts to identify knowledge gaps, themes, and divergences
4. Interact with analysis results through a conversational interface

## Architecture

The interface combines several key components:

1. **Frontend Chat Interface**: React-based UI with transcript upload functionality and conversational interface
2. **Backend Services**: Express routes handling transcript processing and agent communication
3. **Agent Integration**:
   - **MeetingAnalysisAgent**: Processes individual meeting transcripts
   - **KnowledgeGapAgent**: Analyzes multiple transcripts to identify themes and divergences

## Implementation Plan

### 1. Backend Setup

#### Create API Endpoints
```typescript
// src/api/routes/transcripts.ts
import { Router } from 'express';
import { MeetingAnalysisAgent } from '../../agents/specialized/meeting-analysis-agent';
import { KnowledgeGapAgent } from '../../agents/specialized/knowledge-gap-agent';
import { AgentRegistry } from '../../agents/agent-registry';

const router = Router();
const agentRegistry = AgentRegistry.getInstance();

// Process a single transcript
router.post('/analyze', async (req, res) => {
  try {
    const { transcript, sessionId } = req.body;
    
    const meetingAnalysisAgent = agentRegistry.getAgent('meeting-analysis-agent') as MeetingAnalysisAgent;
    const result = await meetingAnalysisAgent.analyzeTranscript(transcript, sessionId);
    
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Compare multiple transcripts
router.post('/compare', async (req, res) => {
  try {
    const { transcripts, sessionId } = req.body;
    
    const knowledgeGapAgent = agentRegistry.getAgent('knowledge-gap-agent') as KnowledgeGapAgent;
    const result = await knowledgeGapAgent.findKnowledgeGaps(transcripts, sessionId);
    
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

#### Integrate with Socket.IO for Real-time Updates
```typescript
// src/websocket/transcript-socket.ts
import { Server as SocketServer } from 'socket.io';
import { Server } from 'http';

export function setupTranscriptSockets(server: Server): void {
  const io = new SocketServer(server);
  
  io.on('connection', (socket) => {
    socket.on('join-transcript-session', (sessionId) => {
      socket.join(`transcript-${sessionId}`);
    });
    
    socket.on('transcript-upload', (data) => {
      // Broadcast to all clients in the session
      io.to(`transcript-${data.sessionId}`).emit('transcript-processing-started', {
        transcriptId: data.transcriptId
      });
    });
  });
  
  return io;
}
```

### 2. Knowledge Gap Agent Implementation

We need to ensure we have a specialized agent for knowledge gap analysis:

```typescript
// src/agents/specialized/knowledge-gap-agent.ts
import { BaseAgent } from '../base-agent';
import { AgentCapability } from '../agent.types';
import { PromptManager } from '../../shared/services/prompt-manager.service';

export class KnowledgeGapAgent extends BaseAgent {
  constructor(private promptManager: PromptManager) {
    super('knowledge-gap-agent', 'Knowledge Gap Analysis Agent');
    
    this.registerCapability({
      id: 'find-knowledge-gaps',
      description: 'Analyze multiple transcripts to identify knowledge gaps, recurring themes, and divergences',
      parameters: {
        transcripts: {
          type: 'array',
          description: 'Array of transcript texts to analyze'
        },
        sessionId: {
          type: 'string',
          description: 'Session identifier for tracking the analysis'
        }
      },
      examples: [
        {
          description: 'Identify knowledge gaps between three team meetings',
          parameters: {
            transcripts: ['meeting1.txt', 'meeting2.txt', 'meeting3.txt'],
            sessionId: 'team-sprint-review-q2'
          }
        }
      ]
    });
  }
  
  async findKnowledgeGaps(transcripts: string[], sessionId: string): Promise<any> {
    this.logger.info(`Beginning knowledge gap analysis for session ${sessionId}`);
    
    try {
      // 1. Process each transcript for key topics and entities
      const processedTranscripts = await Promise.all(
        transcripts.map(async (transcript, index) => {
          // Extract key topics and entities
          return this.extractKeyTopics(transcript, `transcript-${index}`);
        })
      );
      
      // 2. Compare across transcripts to find gaps and themes
      const analysis = await this.compareTranscripts(processedTranscripts);
      
      // 3. Generate comprehensive report
      const report = await this.generateReport(analysis, processedTranscripts);
      
      this.logger.info(`Completed knowledge gap analysis for session ${sessionId}`);
      return report;
    } catch (error) {
      this.logger.error(`Error in knowledge gap analysis: ${error.message}`);
      throw error;
    }
  }
  
  private async extractKeyTopics(transcript: string, transcriptId: string): Promise<any> {
    // Use LLM to extract key topics, entities, and information
    const prompt = await this.promptManager.buildPrompt('knowledge-extraction', {
      transcript: transcript
    });
    
    const response = await this.llmService.generateText(prompt);
    return this.parseTopicsResponse(response, transcriptId);
  }
  
  private async compareTranscripts(processedTranscripts: any[]): Promise<any> {
    // Compare transcripts to identify gaps, overlaps, and unique themes
    const prompt = await this.promptManager.buildPrompt('knowledge-comparison', {
      processedTranscripts: JSON.stringify(processedTranscripts)
    });
    
    const response = await this.llmService.generateText(prompt);
    return this.parseComparisonResponse(response);
  }
  
  private async generateReport(analysis: any, processedTranscripts: any[]): Promise<any> {
    // Generate comprehensive report with actionable insights
    const prompt = await this.promptManager.buildPrompt('knowledge-gap-report', {
      analysis: JSON.stringify(analysis),
      transcriptCount: processedTranscripts.length
    });
    
    const response = await this.llmService.generateText(prompt);
    return this.parseReportResponse(response);
  }
  
  private parseTopicsResponse(response: string, transcriptId: string): any {
    try {
      return JSON.parse(response);
    } catch (error) {
      this.logger.error(`Error parsing topics response for ${transcriptId}: ${error.message}`);
      return { error: 'Failed to parse response', transcriptId };
    }
  }
  
  private parseComparisonResponse(response: string): any {
    try {
      return JSON.parse(response);
    } catch (error) {
      this.logger.error(`Error parsing comparison response: ${error.message}`);
      return { error: 'Failed to parse comparison response' };
    }
  }
  
  private parseReportResponse(response: string): any {
    try {
      return JSON.parse(response);
    } catch (error) {
      this.logger.error(`Error parsing report response: ${error.message}`);
      return { error: 'Failed to parse report response' };
    }
  }
  
  public cleanup(): void {
    this.logger.info('Cleaning up KnowledgeGapAgent resources');
    // Cleanup any resources, connections or timers
  }
}
```

### 3. Frontend Development

#### Main Components

Create React components for the chat interface:

```jsx
// TranscriptChat.jsx
import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './TranscriptChat.css';
import TranscriptUploader from './TranscriptUploader';
import ChatMessage from './ChatMessage';
import { analyzeTranscript, compareTranscripts } from '../services/transcriptService';

const TranscriptChat = () => {
  const [messages, setMessages] = useState([]);
  const [uploadedTranscripts, setUploadedTranscripts] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState(Date.now().toString());
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Socket.IO setup
  useEffect(() => {
    socketRef.current = io();
    socketRef.current.emit('join-transcript-session', sessionId);
    
    socketRef.current.on('transcript-processing-started', (data) => {
      addMessage({
        type: 'system',
        content: `Processing transcript ${data.transcriptId}...`
      });
    });
    
    socketRef.current.on('analysis-complete', (data) => {
      addMessage({
        type: 'agent',
        content: data.result,
        agentName: 'Meeting Analysis Agent'
      });
      setIsProcessing(false);
    });
    
    socketRef.current.on('comparison-complete', (data) => {
      addMessage({
        type: 'agent',
        content: data.result,
        agentName: 'Knowledge Gap Agent'
      });
      setIsProcessing(false);
    });
    
    return () => socketRef.current.disconnect();
  }, [sessionId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (message) => {
    setMessages((prevMessages) => [...prevMessages, message]);
  };

  const handleTranscriptUpload = async (files) => {
    if (!files || files.length === 0) return;
    
    setIsProcessing(true);
    const newTranscripts = [];
    
    for (const file of files) {
      const reader = new FileReader();
      const transcriptId = Date.now().toString();
      
      reader.onload = async (e) => {
        const content = e.target.result;
        
        addMessage({
          type: 'user',
          content: `Uploaded transcript: ${file.name}`
        });
        
        socketRef.current.emit('transcript-upload', {
          sessionId,
          transcriptId
        });
        
        try {
          const result = await analyzeTranscript({
            transcript: content,
            sessionId
          });
          
          addMessage({
            type: 'agent',
            content: result.result,
            agentName: 'Meeting Analysis Agent'
          });
          
          newTranscripts.push({
            id: transcriptId,
            name: file.name,
            content,
            analysis: result.result
          });
          
          setUploadedTranscripts((prev) => [...prev, {
            id: transcriptId,
            name: file.name,
            content,
            analysis: result.result
          }]);
        } catch (error) {
          addMessage({
            type: 'system',
            content: `Error analyzing transcript: ${error.message}`
          });
        }
      };
      
      reader.readAsText(file);
    }
    
    setIsProcessing(false);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || isProcessing) return;
    
    addMessage({
      type: 'user',
      content: inputText
    });
    
    const messageText = inputText.toLowerCase();
    setInputText('');
    setIsProcessing(true);
    
    if (messageText.includes('compare') && uploadedTranscripts.length > 1) {
      try {
        const result = await compareTranscripts({
          transcripts: uploadedTranscripts.map(t => t.content),
          sessionId
        });
        
        addMessage({
          type: 'agent',
          content: result.result,
          agentName: 'Knowledge Gap Agent'
        });
      } catch (error) {
        addMessage({
          type: 'system',
          content: `Error comparing transcripts: ${error.message}`
        });
      }
    } else {
      // Process as regular message or command
      addMessage({
        type: 'agent',
        content: `I'm your transcript analysis assistant. You can upload transcripts for analysis or ask me to compare multiple transcripts to find knowledge gaps.`,
        agentName: 'Assistant'
      });
    }
    
    setIsProcessing(false);
  };

  return (
    <div className="transcript-chat">
      <div className="chat-header">
        <h2>Transcript Analysis</h2>
        <div className="transcript-badges">
          {uploadedTranscripts.length > 0 && (
            <span className="badge">{uploadedTranscripts.length} transcripts</span>
          )}
        </div>
      </div>
      
      <div className="chat-messages">
        {messages.map((msg, index) => (
          <ChatMessage key={index} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <TranscriptUploader onUpload={handleTranscriptUpload} />
      
      <form className="chat-input" onSubmit={handleSendMessage}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          disabled={isProcessing}
        />
        <button type="submit" disabled={isProcessing || !inputText.trim()}>
          {isProcessing ? 'Processing...' : 'Send'}
        </button>
      </form>
    </div>
  );
};

export default TranscriptChat;
```

Create the transcript uploader component:

```jsx
// TranscriptUploader.jsx
import React, { useRef } from 'react';
import './TranscriptUploader.css';

const TranscriptUploader = ({ onUpload }) => {
  const fileInputRef = useRef(null);
  
  const handleClick = () => {
    fileInputRef.current.click();
  };
  
  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      onUpload(e.target.files);
      e.target.value = null; // Reset file input
    }
  };

  return (
    <div className="transcript-uploader">
      <button type="button" onClick={handleClick} className="upload-button">
        Upload Transcript
      </button>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".txt,.md,.json"
        multiple
        style={{ display: 'none' }}
      />
      <p className="upload-help">
        Upload meeting transcripts to analyze or compare.
      </p>
    </div>
  );
};

export default TranscriptUploader;
```

Create the chat message component:

```jsx
// ChatMessage.jsx
import React from 'react';
import './ChatMessage.css';

const ChatMessage = ({ message }) => {
  const renderContent = () => {
    if (typeof message.content === 'string') {
      return <p>{message.content}</p>;
    }
    
    // Handle structured data from agent responses
    return (
      <div className="structured-content">
        {message.content.meetingTitle && (
          <h3 className="meeting-title">{message.content.meetingTitle}</h3>
        )}
        
        {message.content.summary && (
          <div className="summary-section">
            <h4>Summary</h4>
            <p>{message.content.summary}</p>
          </div>
        )}
        
        {message.content.keyTopics && message.content.keyTopics.length > 0 && (
          <div className="topics-section">
            <h4>Key Topics</h4>
            <ul>
              {message.content.keyTopics.map((topic, index) => (
                <li key={index}>{topic}</li>
              ))}
            </ul>
          </div>
        )}
        
        {message.content.actionItems && message.content.actionItems.length > 0 && (
          <div className="action-items-section">
            <h4>Action Items</h4>
            <ul>
              {message.content.actionItems.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        
        {message.content.decisions && message.content.decisions.length > 0 && (
          <div className="decisions-section">
            <h4>Decisions</h4>
            <ul>
              {message.content.decisions.map((decision, index) => (
                <li key={index}>{decision}</li>
              ))}
            </ul>
          </div>
        )}
        
        {message.content.knowledgeGaps && message.content.knowledgeGaps.length > 0 && (
          <div className="gaps-section">
            <h4>Knowledge Gaps</h4>
            <ul>
              {message.content.knowledgeGaps.map((gap, index) => (
                <li key={index}>{gap}</li>
              ))}
            </ul>
          </div>
        )}
        
        {message.content.thematicAnalysis && (
          <div className="themes-section">
            <h4>Thematic Analysis</h4>
            <p>{message.content.thematicAnalysis}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`chat-message ${message.type}`}>
      {message.type === 'agent' && (
        <div className="agent-name">{message.agentName}</div>
      )}
      <div className="message-content">
        {renderContent()}
      </div>
    </div>
  );
};

export default ChatMessage;
```

Create the API service for transcript analysis:

```jsx
// transcriptService.js
import axios from 'axios';

const API_URL = '/api/transcripts';

export const analyzeTranscript = async (data) => {
  try {
    const response = await axios.post(`${API_URL}/analyze`, data);
    return response.data;
  } catch (error) {
    console.error('Error analyzing transcript:', error);
    throw new Error(error.response?.data?.error || 'Failed to analyze transcript');
  }
};

export const compareTranscripts = async (data) => {
  try {
    const response = await axios.post(`${API_URL}/compare`, data);
    return response.data;
  } catch (error) {
    console.error('Error comparing transcripts:', error);
    throw new Error(error.response?.data?.error || 'Failed to compare transcripts');
  }
};
```

### 4. Prompt Templates for Knowledge Gap Agent

Add the necessary prompt templates to support our Knowledge Gap Agent:

```typescript
// Add these to src/shared/prompts/instruction-templates.ts

// Add to InstructionTemplateNameEnum
KNOWLEDGE_EXTRACTION = 'KNOWLEDGE_EXTRACTION',
KNOWLEDGE_COMPARISON = 'KNOWLEDGE_COMPARISON',
KNOWLEDGE_GAP_REPORT = 'KNOWLEDGE_GAP_REPORT',

// Add to InstructionTemplates record
KNOWLEDGE_EXTRACTION: {
  format: {
    requiredSections: ['topics', 'entities', 'information'],
    outputFormat: 'json_object',
    jsonSchema: {
      properties: {
        topics: {
          type: 'array',
          description: 'Key topics discussed in the transcript'
        },
        entities: {
          type: 'array',
          description: 'Important entities mentioned (people, projects, technologies)'
        },
        information: {
          type: 'object',
          description: 'Structured information extracted from the transcript'
        }
      }
    }
  },
  rules: [
    'Extract all key topics discussed in the transcript',
    'Identify all important entities mentioned',
    'Organize information into a structured format',
    'Preserve context and relationships between topics',
    'Maintain factual accuracy without adding assumptions'
  ],
  outputRequirements: [
    'The output should be only a valid JSON object',
    'The output should not include any other text or formatting',
    'Complete structured data in JSON format'
  ],
  promptTemplate: `
You are a Knowledge Extraction Expert. Your task is to extract the key topics, entities, and information from a meeting transcript.

Analyze the following transcript text and extract:
1. Key topics discussed
2. Important entities mentioned (people, projects, technologies, etc.)
3. Structured information organized by topic

Please provide your analysis in the following JSON format:
{
  "topics": ["Topic 1", "Topic 2", ...],
  "entities": [
    {"name": "Entity Name", "type": "person/project/technology", "mentions": 5},
    ...
  ],
  "information": {
    "Topic 1": ["Key point 1", "Key point 2", ...],
    "Topic 2": ["Key point 1", "Key point 2", ...],
    ...
  }
}

Transcript:
{{transcript}}
`
},

KNOWLEDGE_COMPARISON: {
  format: {
    requiredSections: ['commonTopics', 'uniqueTopics', 'knowledgeGaps', 'thematicAnalysis'],
    outputFormat: 'json_object',
    jsonSchema: {
      properties: {
        commonTopics: {
          type: 'array',
          description: 'Topics that appear across multiple transcripts'
        },
        uniqueTopics: {
          type: 'object',
          description: 'Topics unique to each transcript'
        },
        knowledgeGaps: {
          type: 'array',
          description: 'Identified knowledge gaps between transcripts'
        },
        thematicAnalysis: {
          type: 'string',
          description: 'Analysis of thematic patterns and divergences'
        }
      }
    }
  },
  rules: [
    'Identify topics that appear across multiple transcripts',
    'Determine topics unique to each transcript',
    'Detect knowledge gaps and inconsistencies',
    'Analyze thematic patterns and divergences',
    'Maintain objective analysis without assumptions'
  ],
  outputRequirements: [
    'The output should be only a valid JSON object',
    'The output should not include any other text or formatting',
    'Complete structured data in JSON format'
  ],
  promptTemplate: `
You are a Knowledge Gap Analyst. Your task is to compare multiple transcript analyses to identify commonalities, divergences, and knowledge gaps.

Analyze the following processed transcripts:
{{processedTranscripts}}

Compare these transcripts and identify:
1. Common topics that appear across multiple transcripts
2. Unique topics specific to individual transcripts
3. Knowledge gaps or inconsistencies between transcripts
4. Thematic patterns and divergences

Provide your analysis in the following JSON format:
{
  "commonTopics": ["Topic 1", "Topic 2", ...],
  "uniqueTopics": {
    "transcript-0": ["Topic A", "Topic B", ...],
    "transcript-1": ["Topic C", "Topic D", ...],
    ...
  },
  "knowledgeGaps": [
    "Description of knowledge gap 1",
    "Description of knowledge gap 2",
    ...
  ],
  "thematicAnalysis": "Comprehensive analysis of thematic patterns and divergences across transcripts"
}
`
},

KNOWLEDGE_GAP_REPORT: {
  format: {
    requiredSections: ['summary', 'keyFindings', 'knowledgeGaps', 'recommendations'],
    outputFormat: 'json_object',
    jsonSchema: {
      properties: {
        summary: {
          type: 'string',
          description: 'Summary of the overall analysis'
        },
        keyFindings: {
          type: 'array',
          description: 'Key findings from the transcript comparison'
        },
        knowledgeGaps: {
          type: 'array',
          description: 'Detailed knowledge gaps identified'
        },
        recommendations: {
          type: 'array',
          description: 'Actionable recommendations to address gaps'
        }
      }
    }
  },
  rules: [
    'Summarize the overall analysis concisely',
    'Highlight key findings from the transcript comparison',
    'Detail each knowledge gap with context',
    'Provide actionable recommendations',
    'Focus on objective insights with practical value'
  ],
  outputRequirements: [
    'The output should be only a valid JSON object',
    'The output should not include any other text or formatting',
    'Complete structured data in JSON format'
  ],
  promptTemplate: `
You are a Knowledge Management Expert. Your task is to generate a comprehensive report based on an analysis of {{transcriptCount}} meeting transcripts.

Based on the following analysis:
{{analysis}}

Generate a detailed report that includes:
1. A summary of the overall analysis
2. Key findings from the transcript comparison
3. Detailed knowledge gaps identified with context
4. Actionable recommendations to address these gaps

Provide your report in the following JSON format:
{
  "summary": "Concise summary of the overall analysis",
  "keyFindings": [
    "Key finding 1",
    "Key finding 2",
    ...
  ],
  "knowledgeGaps": [
    {
      "description": "Description of gap 1",
      "context": "Related context",
      "impact": "Potential impact of this gap"
    },
    ...
  ],
  "recommendations": [
    {
      "title": "Recommendation 1",
      "description": "Detailed explanation",
      "implementation": "How to implement"
    },
    ...
  ]
}
`
},
```

### 5. Integration with Main Application

#### Update App Component to Include Transcript Analysis Route

```jsx
// App.jsx
import React from 'react';
import { BrowserRouter as Router, Route, Switch, Link } from 'react-router-dom';
import TranscriptChat from './components/TranscriptChat';
import Dashboard from './components/Dashboard';
import './App.css';

const App = () => {
  return (
    <Router>
      <div className="app">
        <nav className="app-nav">
          <ul>
            <li>
              <Link to="/">Dashboard</Link>
            </li>
            <li>
              <Link to="/transcript-analysis">Transcript Analysis</Link>
            </li>
          </ul>
        </nav>
        
        <main className="app-content">
          <Switch>
            <Route path="/" exact component={Dashboard} />
            <Route path="/transcript-analysis" component={TranscriptChat} />
          </Switch>
        </main>
      </div>
    </Router>
  );
};

export default App;
```

## Running the Example

1. Ensure the backend services are running with both the MeetingAnalysisAgent and KnowledgeGapAgent registered
2. Start the frontend development server
3. Navigate to the `/transcript-analysis` route
4. Upload one or more meeting transcripts
5. Interact with the analysis through the chat interface
6. Use commands like "compare transcripts" to activate the KnowledgeGapAgent

## Next Steps

Once the basic implementation is complete, consider these enhancements:

1. **Persistent Storage**: Save transcript analyses to a database for future reference
2. **Visualization**: Add graphs and charts to represent themes and topic relationships
3. **Export Options**: Allow users to export analysis results in various formats
4. **Batch Processing**: Enable batch upload and processing of multiple transcripts
5. **Custom Prompts**: Allow users to customize the analysis with specific questions

## Resources

Example transcripts for testing are available in the `/examples/transcripts` directory:

- team_standup.txt
- product_review.txt
- stakeholder_meeting.txt 