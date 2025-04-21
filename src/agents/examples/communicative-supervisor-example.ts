import { CommunicativeAgent } from '../communication/communicative-agent.mixin';
import { SupervisorAgent } from '../specialized/supervisor-agent';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { MessageType, MessagePriority } from '../communication/types';
import { BaseAgent } from '../base/base-agent';
import { AgentRequest, AgentResponse } from '../interfaces/base-agent.interface';

// Create a simple worker agent that can handle tasks
class WorkerAgent extends BaseAgent {
  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    return {
      output: `Worker ${this.id} processed: ${request.input}`,
    };
  }

  // Make registerCapability public for the mixin
  public registerCapability(capability: { name: string; description: string }): void {
    super.registerCapability(capability);
  }
}

// Apply the communicative mixin to our agents
const CommunicativeSupervisor = CommunicativeAgent(SupervisorAgent);
const CommunicativeWorker = CommunicativeAgent(WorkerAgent);

/**
 * Example of using communicative agents
 */
async function runCommunicationExample() {
  const logger = new ConsoleLogger();
  logger.info('Starting agent communication example');

  // Create the supervisor
  const supervisor = new CommunicativeSupervisor({
    id: 'supervisor-1',
    name: 'Team Supervisor',
    description: 'Manages and coordinates team members',
    logger,
  });

  // Create worker agents
  const worker1 = new CommunicativeWorker(
    'Data Processor',
    'Processes data tasks',
    { id: 'worker-1', logger },
  );

  const worker2 = new CommunicativeWorker(
    'Calculator',
    'Performs calculations',
    { id: 'worker-2', logger },
  );

  // Initialize all agents
  await supervisor.initialize();
  await worker1.initialize();
  await worker2.initialize();

  // Set up message handlers for workers
  worker1.subscribeToMessages(async (message) => {
    if (message.type === MessageType.TASK) {
      logger.info(`Worker 1 received task: ${message.content.taskDescription}`);
      
      // Process the task
      const result = `Processed data task with ID: ${message.id}`;
      
      // Send response back with the message ID as correlation ID
      await worker1.sendMessageToAgent(
        message.senderId,
        { result },
        {
          type: MessageType.RESPONSE,
          correlationId: message.id
        }
      );
    }
  });

  worker2.subscribeToMessages(async (message) => {
    if (message.type === MessageType.TASK) {
      logger.info(`Worker 2 received task: ${message.content.taskDescription}`);
      
      // Process the task (simple calculation)
      const numbers = [1, 2, 3, 4, 5];
      const sum = numbers.reduce((a, b) => a + b, 0);
      
      // Send response back with the message ID as correlation ID
      await worker2.sendMessageToAgent(
        message.senderId,
        { result: { sum } },
        {
          type: MessageType.RESPONSE,
          correlationId: message.id
        }
      );
    }
  });

  // Create a team channel
  const teamChannelId = await supervisor.createChannel(
    'team-channel',
    'Team coordination channel',
    [worker1.id, worker2.id],
  );

  // Set up subscription for supervisor to handle responses
  supervisor.subscribeToMessages(async (message) => {
    if (message.type === MessageType.RESPONSE) {
      logger.info(`Supervisor received response from ${message.senderId}: ${JSON.stringify(message.content.result)}`);
    }
  });

  // Send a team announcement
  logger.info('Sending team announcement to channel');
  await supervisor.sendToChannel(
    teamChannelId,
    {
      announcement: 'Welcome to the team! Let\'s get started with our tasks.',
      instructions: 'Check your individual assignments coming shortly.',
    },
    {
      type: MessageType.NOTIFICATION,
      priority: MessagePriority.HIGH,
    },
  );

  // Assign tasks to workers
  logger.info('Assigning tasks to workers');
  
  const task1Id = await supervisor.sendTaskToAgent(
    worker1.id,
    'Process the latest data batch',
    {
      priority: MessagePriority.NORMAL,
      metadata: {
        dataSource: 'customer-records',
        deadline: Date.now() + 3600000, // 1 hour from now
      },
    },
  );
  
  const task2Id = await supervisor.sendTaskToAgent(
    worker2.id,
    'Calculate summary statistics',
    {
      priority: MessagePriority.HIGH,
    },
  );

  // Wait for some time to allow for task processing and responses
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Check team status
  logger.info('Checking team status');
  const messages = await supervisor.getMessageHistory();
  logger.info(`Total messages sent by supervisor: ${messages.length}`);

  // Send status update to team
  await supervisor.sendToChannel(
    teamChannelId,
    {
      status: 'Tasks have been assigned and are being processed',
      nextSteps: 'We will review results in the next meeting',
    },
    {
      type: MessageType.STATUS_UPDATE,
    },
  );

  // Clean up
  await supervisor.terminate();
  await worker1.terminate();
  await worker2.terminate();
  
  logger.info('Example completed');
}

// Run the example if this file is executed directly
if (require.main === module) {
  runCommunicationExample().catch(console.error);
}

export { runCommunicationExample, CommunicativeSupervisor, CommunicativeWorker }; 