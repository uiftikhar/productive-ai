import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import path from 'path';
import fs from 'fs';

/**
 * Service for debugging graph execution issues
 * Provides detailed logging and visualization of graph state
 */
export class GraphDebuggerService {
  private logger: Logger;
  
  constructor(options: { logger?: Logger } = {}) {
    this.logger = options.logger || new ConsoleLogger();
  }

  /**
   * Log detailed information about a graph
   */
  public logGraphDetails(graph: any, graphState: any, context: string): void {
    if (!graph) {
      this.logger.warn(`Cannot log graph details: graph is null or undefined (context: ${context})`);
      return;
    }

    try {
      // Log basic graph structure
      this.logger.info(`=== GRAPH DEBUG: ${context} ===`);
      
      // Get nodes and edges if available
      const nodes = graph.getNodes ? graph.getNodes() : (graph.nodes ? Object.keys(graph.nodes) : []);
      const edges = graph.getEdges ? graph.getEdges() : (graph.edges || []);
      
      this.logger.info(`Graph structure: ${nodes.length} nodes, ${edges.length} edges`);
      
      // Log nodes with their types
      this.logger.info('=== NODES ===');
      for (const node of nodes) {
        const nodeInfo = graph.nodes?.[node] || { type: 'unknown', id: node };
        this.logger.info(`Node: ${node} (${nodeInfo.type || 'unknown type'})`);
      }
      
      // Log edges
      this.logger.info('=== EDGES ===');
      for (const edge of edges) {
        this.logger.info(`Edge: ${edge.source || edge.from} -> ${edge.target || edge.to} (${edge.label || 'no label'})`);
      }
      
      // Log current state if available
      if (graphState) {
        this.logger.info('=== CURRENT STATE ===');
        const { messages, transcript, meetingId, currentNode, nextNode } = graphState;
        
        this.logger.info(`Current node: ${currentNode}, Next node: ${nextNode}`);
        this.logger.info(`Meeting ID: ${meetingId}`);
        this.logger.info(`Transcript present: ${!!transcript} (length: ${transcript ? transcript.length : 0})`);
        this.logger.info(`Messages: ${messages ? messages.length : 0}`);
        
        // Check if transcript is actually passed to the nodes
        if (graphState.nodes && Object.keys(graphState.nodes).length > 0) {
          for (const nodeName of Object.keys(graphState.nodes)) {
            const node = graphState.nodes[nodeName];
            if (node.inputs && node.inputs.length > 0) {
              const hasTranscript = node.inputs.some((input: any) => input.transcript);
              this.logger.info(`Node ${nodeName} inputs contain transcript: ${hasTranscript}`);
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error logging graph details: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Helper method to dump graph state to a file for offline analysis
   */
  public dumpGraphToFile(graph: any, graphState: any, context: string): string {
    try {
      // Create visualizations directory if it doesn't exist
      const visualizationsDir = path.join(process.cwd(), 'visualizations', 'graph-debug');
      if (!fs.existsSync(visualizationsDir)) {
        fs.mkdirSync(visualizationsDir, { recursive: true });
      }
      
      // Create filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = path.join(visualizationsDir, `graph-debug-${context}-${timestamp}.json`);
      
      // Prepare data to dump
      const data = {
        context,
        timestamp: new Date().toISOString(),
        graph: {
          nodes: graph.nodes || {},
          edges: graph.edges || []
        },
        state: graphState || {}
      };
      
      // Write to file
      fs.writeFileSync(filename, JSON.stringify(data, null, 2));
      
      this.logger.info(`Graph debug info saved to: ${filename}`);
      return filename;
    } catch (error) {
      this.logger.error(`Error dumping graph to file: ${error instanceof Error ? error.message : String(error)}`);
      return 'Error saving graph debug info';
    }
  }
  
  /**
   * Create a mermaid diagram representation of the graph
   */
  public createGraphDiagram(graph: any): string {
    try {
      const nodes = graph.nodes || {};
      const edges = graph.edges || [];
      
      let mermaid = 'graph TD;\n';
      
      // Add nodes
      for (const [nodeId, nodeData] of Object.entries(nodes)) {
        const type = (nodeData as any)?.type || 'unknown';
        mermaid += `  ${nodeId}["${nodeId} (${type})"];\n`;
      }
      
      // Add edges
      for (const edge of edges) {
        const source = edge.source || edge.from;
        const target = edge.target || edge.to;
        const label = edge.label || '';
        
        mermaid += `  ${source} --> |${label}| ${target};\n`;
      }
      
      return mermaid;
    } catch (error) {
      this.logger.error(`Error creating graph diagram: ${error instanceof Error ? error.message : String(error)}`);
      return 'graph TD;\n  error["Error creating diagram"];\n';
    }
  }
  
  /**
   * Log message content that contains transcript data
   */
  public logTranscriptMessage(message: any): void {
    if (!message) {
      this.logger.warn('Cannot log transcript message: message is null or undefined');
      return;
    }
    
    try {
      const hasTranscript = typeof message === 'object' && message.transcript;
      
      this.logger.info(`Message contains transcript: ${hasTranscript}`);
      
      if (hasTranscript) {
        const transcript = message.transcript;
        const length = transcript.length;
        const sample = transcript.substring(0, 100).replace(/\n/g, ' ');
        
        this.logger.info(`Transcript length: ${length} characters`);
        this.logger.info(`Transcript sample: ${sample}...`);
      }
      
      // Check other properties
      if (typeof message === 'object') {
        const properties = Object.keys(message);
        this.logger.info(`Message properties: ${properties.join(', ')}`);
        
        // Log meetingId if present
        if (message.meetingId) {
          this.logger.info(`Meeting ID: ${message.meetingId}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error logging transcript message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Enhanced log method specifically for tracing transcript flow through the graph
   */
  public traceTranscriptFlow(graphState: any): void {
    if (!graphState) {
      this.logger.warn('No graph state provided for tracing transcript flow');
      return;
    }

    try {
      // Check for transcript in initial state
      const hasTranscriptInSupervisor = graphState.nodes?.supervisor?.inputs?.[0]?.transcript;
      
      this.logger.info(`Transcript in supervisor node: ${hasTranscriptInSupervisor ? 'PRESENT' : 'MISSING'}`);
      
      // Check if the transcript is being passed to other nodes
      const nodes = Object.keys(graphState.nodes || {});
      
      for (const node of nodes) {
        if (node === 'supervisor') continue; // Already checked
        
        const nodeInputs = graphState.nodes[node]?.inputs || [];
        const hasTranscript = nodeInputs.some((input: any) => 
          input && typeof input === 'object' && 
          (input.transcript || (input.content && input.content.transcript))
        );
        
        this.logger.info(`Transcript in ${node} node: ${hasTranscript ? 'PRESENT' : 'MISSING'}`);
      }
    } catch (error) {
      this.logger.error(`Error tracing transcript flow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Analyze routing decisions and detect potential issues
   */
  public analyzeRoutingDecisions(graph: any, graphState: any): void {
    if (!graphState?.edges) {
      this.logger.warn('No graph edges found for routing analysis');
      return;
    }
    
    try {
      const edges = graphState.edges;
      const routingSequence: Array<{from: string, to: string}> = [];
      
      // Extract routing decisions from edges
      for (const [source, targets] of Object.entries(edges)) {
        for (const target of Object.values(targets as any)) {
          routingSequence.push({
            from: source,
            to: target as string
          });
        }
      }
      
      // Analyze the sequence
      this.logger.info(`Routing sequence (${routingSequence.length} transitions):`);
      
      routingSequence.forEach((route, index) => {
        this.logger.info(`  ${index + 1}. ${route.from} → ${route.to}`);
      });
      
      // Check for repeated cycles between same nodes (potential infinite loops)
      const patternCounts: Record<string, number> = {};
      
      for (let i = 0; i < routingSequence.length - 1; i++) {
        const pattern = `${routingSequence[i].from}→${routingSequence[i].to}→${routingSequence[i+1].to}`;
        patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
      }
      
      // Report potential routing patterns that might indicate issues
      const suspiciousPatterns = Object.entries(patternCounts)
        .filter(([_, count]) => count > 2)
        .sort(([_, countA], [__, countB]) => countB - countA);
      
      if (suspiciousPatterns.length > 0) {
        this.logger.warn('Potential routing pattern issues detected:');
        suspiciousPatterns.forEach(([pattern, count]) => {
          this.logger.warn(`  Pattern "${pattern}" repeats ${count} times (potential loop)`);
        });
      }
      
      // Check for immediate returns to supervisor (potentially wasted routing)
      const immediateReturns = routingSequence.filter((route, index) => 
        index > 0 && 
        route.from !== 'supervisor' && 
        route.to === 'supervisor' && 
        routingSequence[index-1].from === 'supervisor' && 
        routingSequence[index-1].to === route.from
      );
      
      if (immediateReturns.length > 0) {
        this.logger.warn(`${immediateReturns.length} immediate returns to supervisor detected (potential empty work)`);
      }
    } catch (error) {
      this.logger.error(`Error analyzing routing decisions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Add a method for tracing the message flow between nodes
   */
  public traceMessageFlow(graphState: any): void {
    if (!graphState?.messages) {
      this.logger.warn('No messages found in graph state for tracing');
      return;
    }
    
    try {
      const messages = graphState.messages || [];
      this.logger.info(`Analyzing ${messages.length} messages in the graph`);
      
      // Track sender-recipient pairs
      const messageFlows: Array<{from: string, to: string, type: string, timestamp: number}> = [];
      
      for (const message of messages) {
        if (message && typeof message === 'object') {
          const sender = message.sender || 'unknown';
          const recipient = message.recipient || 'supervisor'; // Default to supervisor if not specified
          const type = typeof message.content === 'object' 
            ? Object.keys(message.content).join(',') 
            : typeof message.content;
          
          messageFlows.push({
            from: sender,
            to: recipient,
            type,
            timestamp: message.timestamp || 0
          });
        }
      }
      
      // Sort by timestamp
      messageFlows.sort((a, b) => a.timestamp - b.timestamp);
      
      // Log the message flow
      this.logger.info(`Message flow sequence (${messageFlows.length} messages):`);
      messageFlows.forEach((flow, index) => {
        this.logger.info(`  ${index + 1}. ${flow.from} → ${flow.to} (${flow.type})`);
      });
      
      // Check for message flow issues
      const supervisorMessages = messageFlows.filter(m => m.from === 'supervisor' || m.to === 'supervisor');
      const percentSupervisor = Math.round((supervisorMessages.length / messageFlows.length) * 100);
      
      if (percentSupervisor > 70) {
        this.logger.warn(`High supervisor message concentration (${percentSupervisor}%) - may indicate centralization issues`);
      }
      
      // Check for isolated nodes (nodes that don't receive messages)
      const nodes = new Set([...messageFlows.map(m => m.from), ...messageFlows.map(m => m.to)]);
      const recipients = new Set(messageFlows.map(m => m.to));
      
      nodes.forEach(node => {
        if (node !== 'supervisor' && !recipients.has(node)) {
          this.logger.warn(`Node "${node}" never receives messages - may be isolated`);
        }
      });
    } catch (error) {
      this.logger.error(`Error tracing message flow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if the initial state contains all necessary data
   */
  public validateInitialState(initialState: any): void {
    if (!initialState) {
      this.logger.error('Missing initial state for validation');
      return;
    }
    
    try {
      const issues: string[] = [];
      
      // Check for required fields in the initial supervisor state
      const supervisorInput = initialState.nodes?.supervisor?.inputs?.[0];
      
      if (!supervisorInput) {
        issues.push('No input data found for supervisor node');
      } else {
        // Check essential fields
        if (!supervisorInput.transcript) {
          issues.push('Missing transcript in supervisor input');
        }
        
        if (!supervisorInput.meetingId) {
          issues.push('Missing meetingId in supervisor input');
        }
        
        if (!supervisorInput.sessionId) {
          issues.push('Missing sessionId in supervisor input');
        }
      }
      
      // Log validation results
      if (issues.length > 0) {
        this.logger.error(`Initial state validation failed with ${issues.length} issues:`);
        issues.forEach(issue => this.logger.error(`  - ${issue}`));
      } else {
        this.logger.info('Initial state validation passed - all required fields present');
      }
      
      // Additional data checks
      if (supervisorInput?.transcript) {
        this.logger.info(`Transcript length: ${supervisorInput.transcript.length} characters`);
        if (supervisorInput.transcript.length < 50) {
          this.logger.warn(`Very short transcript detected (${supervisorInput.transcript.length} chars), might cause analysis issues`);
        }
      }
    } catch (error) {
      this.logger.error(`Error validating initial state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Log the current graph state
   */
  public logGraphState(state: any): void {
    try {
      if (!state) {
        this.logger.warn('Cannot log empty graph state');
        return;
      }
      
      // Create a summary of the state
      const stateSummary = {
        nextNode: state.nextNode || 'unknown',
        status: state.status || 'unknown',
        messages: Array.isArray(state.messages) ? state.messages.length : 0,
        progress: state.progress?.overallProgress || 0,
        completedTasks: Object.keys(state.tasks || {}).filter(
          (taskId) => state.tasks[taskId].status === 'completed'
        ).length,
        pendingTasks: Object.keys(state.tasks || {}).filter(
          (taskId) => state.tasks[taskId].status === 'pending' || state.tasks[taskId].status === 'in_progress'
        ).length
      };
      
      // Log the state summary
      this.logger.debug('Graph state summary:', stateSummary);
      
      // If detailed logging is needed, log more specifics
      if (state.messages && state.messages.length > 0) {
        this.logger.debug(`Last message: ${JSON.stringify(state.messages[state.messages.length - 1])}`);
      }
      
      // Log any errors in the state
      if (state.errors && state.errors.length > 0) {
        this.logger.error('Graph errors:', { errors: state.errors });
      }
    } catch (error) {
      this.logger.warn(`Error logging graph state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Static method to get an instance of the debugger
   */
  static getInstance(logger?: Logger): GraphDebuggerService {
    return new GraphDebuggerService({ logger });
  }
}

// Keep the original factory function (but don't duplicate getInstance functionality)
export function getGraphDebugger(logger?: Logger): GraphDebuggerService {
  const instance = new GraphDebuggerService({ logger });
  return instance;
} 