import { Injectable, Logger } from '@nestjs/common';
import { AgentEventService } from './agent-event.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Helper utility to generate mock agent visualization events for testing
 */
@Injectable()
export class MockVisualizationHelper {
  private readonly logger = new Logger(MockVisualizationHelper.name);
  
  constructor(private readonly agentEventService: AgentEventService) {}
  
  /**
   * Generate mock agent events to test visualization
   */
  async generateMockAgentEvents(sessionId: string): Promise<void> {
    this.logger.log(`Generating mock visualization events for session ${sessionId}`);
    
    // Emit workflow started event
    this.agentEventService.emitWorkflowEvent('started', {
      sessionId,
      timestamp: Date.now(),
    });
    
    // Create a supervisor agent
    const supervisorId = `supervisor-${uuidv4().substring(0, 8)}`;
    
    // Start the supervisor
    this.agentEventService.emitAgentEvent('started', {
      agentId: supervisorId,
      agentType: 'SupervisorAgent',
      sessionId,
      timestamp: Date.now(),
      input: { transcriptLength: 4500 }
    });
    
    // Create and start worker agents
    await this.createWorkerAgent(sessionId, supervisorId, 'TopicExtractionAgent');
    await this.delay(1000);
    
    await this.createWorkerAgent(sessionId, supervisorId, 'ActionItemAgent');
    await this.delay(1000);
    
    await this.createWorkerAgent(sessionId, supervisorId, 'SentimentAnalysisAgent');
    await this.delay(1000);
    
    await this.createWorkerAgent(sessionId, supervisorId, 'SummaryAgent');
    await this.delay(1000);
    
    // Complete the supervisor agent
    this.agentEventService.emitAgentEvent('completed', {
      agentId: supervisorId,
      agentType: 'SupervisorAgent',
      sessionId,
      timestamp: Date.now(),
      duration: 5000,
      output: { message: 'Analysis completed successfully' }
    });
    
    // Emit workflow completed event
    this.agentEventService.emitWorkflowEvent('completed', {
      sessionId,
      timestamp: Date.now(),
      duration: 6000,
    });
    
    this.logger.log(`Completed generating mock events for session ${sessionId}`);
  }
  
  /**
   * Create a worker agent with service calls
   */
  private async createWorkerAgent(
    sessionId: string,
    supervisorId: string,
    agentType: string
  ): Promise<void> {
    const agentId = `${agentType.toLowerCase()}-${uuidv4().substring(0, 8)}`;
    
    // Start the agent
    this.agentEventService.emitAgentEvent('started', {
      agentId,
      agentType,
      sessionId,
      parentAgentId: supervisorId,
      timestamp: Date.now(),
      input: { task: `Extract ${agentType.replace('Agent', '')}` }
    });
    
    // Emit a service event (LLM call)
    this.agentEventService.emitServiceEvent(
      'llm',
      `process_${agentType}`,
      {
        agentId,
        agentType,
        sessionId,
        timestamp: Date.now(),
      },
      { prompt: `Processing with ${agentType}` },
      { duration: 800 }
    );
    
    await this.delay(500);
    
    // Complete the agent
    this.agentEventService.emitAgentEvent('completed', {
      agentId,
      agentType,
      sessionId,
      parentAgentId: supervisorId,
      timestamp: Date.now(),
      duration: 1200,
      output: { result: `${agentType} analysis complete` }
    });
  }
  
  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 