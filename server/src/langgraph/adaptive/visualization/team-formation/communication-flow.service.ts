import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  CommunicationEvent,
  CommunicationFlowVisualization,
} from '../../interfaces/visualization.interface';

/**
 * Implementation of the communication flow visualization service
 * This service tracks agent communication and visualizes message flows
 */
export class CommunicationFlowVisualizationImpl
  implements CommunicationFlowVisualization
{
  private logger: Logger;
  private communications: Map<string, CommunicationEvent> = new Map();
  private agentCommunicationIndex: Map<string, Set<string>> = new Map();
  private taskCommunicationIndex: Map<string, Set<string>> = new Map();
  private threadIndex: Map<string, Set<string>> = new Map(); // Maps a message to its responses

  constructor(
    options: {
      logger?: Logger;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.logger.info('Communication flow visualization service initialized');
  }

  /**
   * Record a new communication event
   */
  recordCommunication(communication: Omit<CommunicationEvent, 'id'>): string {
    const id = uuidv4();

    const newCommunication: CommunicationEvent = {
      ...communication,
      id,
    };

    // Store the communication
    this.communications.set(id, newCommunication);

    // Update agent indexes
    this.updateAgentIndex(newCommunication.sourceAgentId, id);
    this.updateAgentIndex(newCommunication.targetAgentId, id);

    // Update task index if applicable
    if (newCommunication.taskId) {
      this.updateTaskIndex(newCommunication.taskId, id);
    }

    // Update thread index if this is a response
    if (newCommunication.responseToId) {
      this.updateThreadIndex(newCommunication.responseToId, id);
    }

    this.logger.debug(
      `Recorded communication ${id} from ${communication.sourceAgentId} to ${communication.targetAgentId}`,
    );

    return id;
  }

  /**
   * Get a specific communication event
   */
  getCommunication(communicationId: string): CommunicationEvent {
    const communication = this.communications.get(communicationId);

    if (!communication) {
      this.logger.warn(`Communication not found: ${communicationId}`);
      throw new Error(`Communication not found: ${communicationId}`);
    }

    return communication;
  }

  /**
   * Get all communications for a specific agent
   */
  getAgentCommunications(
    agentId: string,
    startTime?: Date,
    endTime?: Date,
  ): CommunicationEvent[] {
    const communicationIds =
      this.agentCommunicationIndex.get(agentId) || new Set<string>();

    let communications = Array.from(communicationIds)
      .map((id) => this.communications.get(id))
      .filter(Boolean) as CommunicationEvent[];

    // Apply time filters if provided
    if (startTime || endTime) {
      communications = communications.filter((comm) => {
        const timestamp = comm.timestamp;

        if (startTime && endTime) {
          return timestamp >= startTime && timestamp <= endTime;
        } else if (startTime) {
          return timestamp >= startTime;
        } else if (endTime) {
          return timestamp <= endTime;
        }

        return true;
      });
    }

    // Sort by timestamp
    communications.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    return communications;
  }

  /**
   * Get all communications for a specific task
   */
  getTaskCommunications(taskId: string): CommunicationEvent[] {
    const communicationIds =
      this.taskCommunicationIndex.get(taskId) || new Set<string>();

    const communications = Array.from(communicationIds)
      .map((id) => this.communications.get(id))
      .filter(Boolean) as CommunicationEvent[];

    // Sort by timestamp
    communications.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    return communications;
  }

  /**
   * Visualize communication flow between agents
   */
  visualizeCommunicationFlow(
    agentIds: string[],
    startTime?: Date,
    endTime?: Date,
  ): any {
    this.logger.debug(
      `Visualizing communication flow for ${agentIds.length} agents`,
    );

    // Get all communications between the specified agents
    const agentCommunications: CommunicationEvent[] = [];

    for (const agentId of agentIds) {
      const communications = this.getAgentCommunications(
        agentId,
        startTime,
        endTime,
      ).filter(
        (comm) =>
          agentIds.includes(comm.sourceAgentId) &&
          agentIds.includes(comm.targetAgentId),
      );

      agentCommunications.push(...communications);
    }

    // Deduplicate communications
    const uniqueCommunications =
      this.deduplicateCommunications(agentCommunications);

    // Calculate communication frequencies between agents
    const communicationFrequency: Record<string, Record<string, number>> = {};

    for (const agentId of agentIds) {
      communicationFrequency[agentId] = {};

      for (const targetId of agentIds) {
        if (agentId !== targetId) {
          communicationFrequency[agentId][targetId] = 0;
        }
      }
    }

    // Count messages between each agent pair
    for (const communication of uniqueCommunications) {
      const { sourceAgentId, targetAgentId } = communication;
      communicationFrequency[sourceAgentId][targetAgentId] =
        (communicationFrequency[sourceAgentId][targetAgentId] || 0) + 1;
    }

    // Create nodes for all agents
    const nodes = agentIds.map((agentId) => {
      const outgoingCount = Object.values(
        communicationFrequency[agentId] || {},
      ).reduce((sum, count) => sum + count, 0);

      const incomingCount = agentIds
        .filter((id) => id !== agentId)
        .reduce(
          (sum, id) => sum + (communicationFrequency[id][agentId] || 0),
          0,
        );

      return {
        id: agentId,
        outgoingMessages: outgoingCount,
        incomingMessages: incomingCount,
        totalMessages: outgoingCount + incomingCount,
      };
    });

    // Create edges for communication flows
    const edges = [];

    for (const sourceId of agentIds) {
      for (const targetId of agentIds) {
        if (
          sourceId !== targetId &&
          communicationFrequency[sourceId][targetId] > 0
        ) {
          edges.push({
            source: sourceId,
            target: targetId,
            messageCount: communicationFrequency[sourceId][targetId],
            bidirectional: communicationFrequency[targetId][sourceId] > 0,
          });
        }
      }
    }

    // Create a communication flow visualization object
    const communicationFlow = {
      nodes,
      edges,
      timeRange: {
        start: startTime || this.getEarliestTimestamp(uniqueCommunications),
        end: endTime || this.getLatestTimestamp(uniqueCommunications),
      },
      metrics: {
        totalMessages: uniqueCommunications.length,
        messageTypes: this.getMessageTypeCounts(uniqueCommunications),
        mostActiveAgent: this.getMostActiveAgent(nodes),
        bottlenecks: this.identifyCommunicationBottlenecks(agentIds),
      },
      threads: this.analyzeConversationThreads(agentIds),
    };

    return communicationFlow;
  }

  /**
   * Analyze conversation threads
   */
  analyzeConversationThreads(agentIds: string[]): any {
    this.logger.debug(
      `Analyzing conversation threads for ${agentIds.length} agents`,
    );

    // Get all communications for the specified agents
    const allCommunications: CommunicationEvent[] = [];

    for (const agentId of agentIds) {
      const communications = this.getAgentCommunications(agentId).filter(
        (comm) =>
          agentIds.includes(comm.sourceAgentId) &&
          agentIds.includes(comm.targetAgentId),
      );

      allCommunications.push(...communications);
    }

    // Deduplicate communications
    const uniqueCommunications =
      this.deduplicateCommunications(allCommunications);

    // Build conversation threads from root messages (those without responseToId)
    const rootMessages = uniqueCommunications.filter(
      (comm) => !comm.responseToId,
    );

    // Recursively build thread structures
    const threads = rootMessages.map((rootMessage) =>
      this.buildThreadStructure(rootMessage),
    );

    // Calculate metrics for each thread
    const threadAnalysis = threads.map((thread) => {
      const participantSet = new Set<string>();
      this.collectThreadParticipants(thread, participantSet);

      return {
        threadId: thread.id,
        rootMessage: {
          id: thread.id,
          sender: thread.sourceAgentId,
          receiver: thread.targetAgentId,
          type: thread.messageType,
          timestamp: thread.timestamp,
        },
        messageCount: this.countThreadMessages(thread),
        depth: this.calculateThreadDepth(thread),
        participants: Array.from(participantSet),
        participantCount: participantSet.size,
        duration: this.calculateThreadDuration(thread),
      };
    });

    // Sort threads by message count (most active first)
    threadAnalysis.sort((a, b) => b.messageCount - a.messageCount);

    return {
      threads: threadAnalysis,
      metrics: {
        totalThreads: threadAnalysis.length,
        averageThreadDepth: this.calculateAverage(
          threadAnalysis.map((t) => t.depth),
        ),
        averageParticipantCount: this.calculateAverage(
          threadAnalysis.map((t) => t.participantCount),
        ),
        averageThreadDuration: this.calculateAverage(
          threadAnalysis.map((t) => t.duration),
        ),
      },
    };
  }

  /**
   * Identify communication bottlenecks
   */
  identifyCommunicationBottlenecks(agentIds: string[]): any {
    this.logger.debug(
      `Identifying communication bottlenecks for ${agentIds.length} agents`,
    );

    // Get agent communications
    const communicationsByAgent: Record<string, CommunicationEvent[]> = {};

    for (const agentId of agentIds) {
      communicationsByAgent[agentId] = this.getAgentCommunications(
        agentId,
      ).filter(
        (comm) =>
          agentIds.includes(comm.sourceAgentId) &&
          agentIds.includes(comm.targetAgentId),
      );
    }

    // Calculate incoming and outgoing message ratios
    const messageRatios: Record<
      string,
      {
        incomingCount: number;
        outgoingCount: number;
        ratio: number;
        responseDelay: number;
      }
    > = {};

    for (const agentId of agentIds) {
      const allCommunications = communicationsByAgent[agentId];

      const incomingCount = allCommunications.filter(
        (comm) => comm.targetAgentId === agentId,
      ).length;
      const outgoingCount = allCommunications.filter(
        (comm) => comm.sourceAgentId === agentId,
      ).length;

      // Calculate average response delay for this agent
      const responseDelay = this.calculateAverageResponseDelay(agentId);

      messageRatios[agentId] = {
        incomingCount,
        outgoingCount,
        ratio: outgoingCount > 0 ? incomingCount / outgoingCount : 0,
        responseDelay,
      };
    }

    // Identify potential bottlenecks
    const bottlenecks = agentIds
      .filter((agentId) => {
        const stats = messageRatios[agentId];

        // An agent might be a bottleneck if:
        // 1. It receives many more messages than it sends (high incoming/outgoing ratio)
        // 2. It has a significant response delay
        // 3. It receives a large number of messages in general

        return (
          stats.ratio > 2 || // Receives more than twice the messages it sends
          stats.responseDelay > 5000 || // Average response delay > 5 seconds
          (stats.incomingCount > 10 &&
            stats.incomingCount > stats.outgoingCount * 1.5)
        );
      })
      .map((agentId) => ({
        agentId,
        ...messageRatios[agentId],
        bottleneckScore: this.calculateBottleneckScore(messageRatios[agentId]),
      }));

    // Sort bottlenecks by bottleneck score (highest first)
    bottlenecks.sort((a, b) => b.bottleneckScore - a.bottleneckScore);

    return bottlenecks;
  }

  /**
   * Helper method to update agent index
   */
  private updateAgentIndex(agentId: string, communicationId: string): void {
    if (!this.agentCommunicationIndex.has(agentId)) {
      this.agentCommunicationIndex.set(agentId, new Set<string>());
    }

    this.agentCommunicationIndex.get(agentId)!.add(communicationId);
  }

  /**
   * Helper method to update task index
   */
  private updateTaskIndex(taskId: string, communicationId: string): void {
    if (!this.taskCommunicationIndex.has(taskId)) {
      this.taskCommunicationIndex.set(taskId, new Set<string>());
    }

    this.taskCommunicationIndex.get(taskId)!.add(communicationId);
  }

  /**
   * Helper method to update thread index
   */
  private updateThreadIndex(parentId: string, responseId: string): void {
    if (!this.threadIndex.has(parentId)) {
      this.threadIndex.set(parentId, new Set<string>());
    }

    this.threadIndex.get(parentId)!.add(responseId);
  }

  /**
   * Helper method to deduplicate communications
   */
  private deduplicateCommunications(
    communications: CommunicationEvent[],
  ): CommunicationEvent[] {
    const uniqueIds = new Set<string>();
    const uniqueCommunications: CommunicationEvent[] = [];

    for (const communication of communications) {
      if (!uniqueIds.has(communication.id)) {
        uniqueIds.add(communication.id);
        uniqueCommunications.push(communication);
      }
    }

    return uniqueCommunications;
  }

  /**
   * Helper method to get the earliest timestamp in a list of communications
   */
  private getEarliestTimestamp(communications: CommunicationEvent[]): Date {
    if (communications.length === 0) {
      return new Date();
    }

    const timestamps = communications.map((comm) => comm.timestamp);
    return new Date(Math.min(...timestamps.map((date) => date.getTime())));
  }

  /**
   * Helper method to get the latest timestamp in a list of communications
   */
  private getLatestTimestamp(communications: CommunicationEvent[]): Date {
    if (communications.length === 0) {
      return new Date();
    }

    const timestamps = communications.map((comm) => comm.timestamp);
    return new Date(Math.max(...timestamps.map((date) => date.getTime())));
  }

  /**
   * Helper method to count message types
   */
  private getMessageTypeCounts(
    communications: CommunicationEvent[],
  ): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const communication of communications) {
      const { messageType } = communication;
      counts[messageType] = (counts[messageType] || 0) + 1;
    }

    return counts;
  }

  /**
   * Helper method to find most active agent
   */
  private getMostActiveAgent(nodes: any[]): string | null {
    if (nodes.length === 0) {
      return null;
    }

    nodes.sort((a, b) => b.totalMessages - a.totalMessages);
    return nodes[0].id;
  }

  /**
   * Helper method to build thread structure
   */
  private buildThreadStructure(message: CommunicationEvent): any {
    const responses = Array.from(
      this.threadIndex.get(message.id) || new Set<string>(),
    )
      .map((id) => this.communications.get(id))
      .filter(Boolean) as CommunicationEvent[];

    const responseStructures = responses.map((response) =>
      this.buildThreadStructure(response),
    );

    return {
      ...message,
      responses: responseStructures,
    };
  }

  /**
   * Helper method to collect thread participants
   */
  private collectThreadParticipants(
    thread: any,
    participantSet: Set<string>,
  ): void {
    participantSet.add(thread.sourceAgentId);
    participantSet.add(thread.targetAgentId);

    for (const response of thread.responses) {
      this.collectThreadParticipants(response, participantSet);
    }
  }

  /**
   * Helper method to count thread messages
   */
  private countThreadMessages(thread: any): number {
    let count = 1; // Count this message

    for (const response of thread.responses) {
      count += this.countThreadMessages(response);
    }

    return count;
  }

  /**
   * Helper method to calculate thread depth
   */
  private calculateThreadDepth(thread: any): number {
    if (thread.responses.length === 0) {
      return 1;
    }

    const responseDepths = thread.responses.map((response: any) =>
      this.calculateThreadDepth(response),
    );
    return 1 + Math.max(...responseDepths);
  }

  /**
   * Helper method to calculate thread duration
   */
  private calculateThreadDuration(thread: any): number {
    const startTime = thread.timestamp.getTime();
    let endTime = startTime;

    // Recursively find the latest timestamp in the thread
    this.findLatestTimestamp(thread, (timestamp) => {
      endTime = Math.max(endTime, timestamp.getTime());
    });

    return endTime - startTime;
  }

  /**
   * Helper method to find the latest timestamp in a thread
   */
  private findLatestTimestamp(
    thread: any,
    callback: (timestamp: Date) => void,
  ): void {
    callback(thread.timestamp);

    for (const response of thread.responses) {
      this.findLatestTimestamp(response, callback);
    }
  }

  /**
   * Helper method to calculate average value
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }

    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }

  /**
   * Helper method to calculate average response delay for an agent
   */
  private calculateAverageResponseDelay(agentId: string): number {
    const incomingMessages = Array.from(
      this.agentCommunicationIndex.get(agentId) || new Set<string>(),
    )
      .map((id) => this.communications.get(id))
      .filter(
        (comm) => comm && comm.targetAgentId === agentId,
      ) as CommunicationEvent[];

    // Calculate response delays
    const responseDelays: number[] = [];

    for (const incomingMessage of incomingMessages) {
      const responses = Array.from(
        this.threadIndex.get(incomingMessage.id) || new Set<string>(),
      )
        .map((id) => this.communications.get(id))
        .filter(
          (comm) => comm && comm.sourceAgentId === agentId,
        ) as CommunicationEvent[];

      for (const response of responses) {
        const delay =
          response.timestamp.getTime() - incomingMessage.timestamp.getTime();
        responseDelays.push(delay);
      }
    }

    return this.calculateAverage(responseDelays);
  }

  /**
   * Helper method to calculate bottleneck score
   */
  private calculateBottleneckScore(stats: {
    incomingCount: number;
    outgoingCount: number;
    ratio: number;
    responseDelay: number;
  }): number {
    // Calculate bottleneck score based on multiple factors
    const ratioComponent = Math.min(stats.ratio, 10) / 10; // 0-1 scale
    const delayComponent = Math.min(stats.responseDelay / 10000, 1); // 0-1 scale
    const volumeComponent = Math.min(stats.incomingCount / 100, 1); // 0-1 scale

    // Weighted score (higher means more likely to be a bottleneck)
    return ratioComponent * 0.4 + delayComponent * 0.4 + volumeComponent * 0.2;
  }
}
