import { describe, expect, test, beforeEach } from '@jest/globals';
import { InMemoryMessagingService } from '../in-memory-messaging.service';
import { MessageFactory } from '../message-factory';
import { MessageType, MessagePriority, AgentMessage } from '../types';
import { MockLogger } from '../../tests/mocks/mock-logger';

describe('Messaging Service Tests', () => {
  let messagingService: InMemoryMessagingService;
  let mockLogger: MockLogger;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setLogLevel: jest.fn(),
      log: jest.fn(),
    } as any;

    // Get a fresh instance for each test
    // @ts-ignore: Access private method for testing
    InMemoryMessagingService.instance = undefined;
    messagingService = InMemoryMessagingService.getInstance(mockLogger);
  });

  test('should send a message between agents', async () => {
    // Arrange
    const senderId = 'agent-1';
    const recipientId = 'agent-2';
    const content = { text: 'Hello from Agent 1!' };

    // Act
    const result = await messagingService.sendMessage(
      MessageFactory.createMessage(senderId, content, { recipientId }),
    );

    // Assert
    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();

    // Verify message can be retrieved
    const messages = await messagingService.queryMessages({
      senderIds: [senderId],
    });
    expect(messages.length).toBe(1);
    expect(messages[0].content).toEqual(content);
    expect(messages[0].recipientId).toBe(recipientId);
  });

  test('should support message subscriptions', async () => {
    // Arrange
    const senderId = 'agent-1';
    const recipientId = 'agent-2';
    const content = { text: 'Hello, agent 2!' };
    const receivedMessages: AgentMessage[] = [];

    // Set up subscription
    const handler = async (message: AgentMessage) => {
      receivedMessages.push(message);
    };

    messagingService.subscribeToMessages(recipientId, handler);

    // Act
    await messagingService.sendMessage(
      MessageFactory.createMessage(senderId, content, { recipientId }),
    );

    // Assert
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].senderId).toBe(senderId);
    expect(receivedMessages[0].content).toEqual(content);
  });

  test('should filter messages based on subscription options', async () => {
    // Arrange
    const senderId = 'agent-1';
    const recipientId = 'agent-2';
    const normalPriorityMessages: AgentMessage[] = [];
    const highPriorityMessages: AgentMessage[] = [];

    // Set up filtered subscriptions
    messagingService.subscribeToMessages(
      recipientId,
      async (message) => {
        normalPriorityMessages.push(message);
      },
      {
        filter: {
          priorities: [MessagePriority.NORMAL],
        },
      },
    );

    messagingService.subscribeToMessages(
      recipientId,
      async (message) => {
        highPriorityMessages.push(message);
      },
      {
        filter: {
          priorities: [MessagePriority.HIGH],
        },
      },
    );

    // Act - send messages with different priorities
    await messagingService.sendMessage(
      MessageFactory.createMessage(
        senderId,
        { text: 'Normal message' },
        {
          recipientId,
          priority: MessagePriority.NORMAL,
        },
      ),
    );

    await messagingService.sendMessage(
      MessageFactory.createMessage(
        senderId,
        { text: 'High priority message' },
        {
          recipientId,
          priority: MessagePriority.HIGH,
        },
      ),
    );

    // Assert
    expect(normalPriorityMessages.length).toBe(1);
    expect(normalPriorityMessages[0].priority).toBe(MessagePriority.NORMAL);

    expect(highPriorityMessages.length).toBe(1);
    expect(highPriorityMessages[0].priority).toBe(MessagePriority.HIGH);
  });

  test('should create and manage channels', async () => {
    // Arrange
    const channelName = 'test-channel';
    const agentIds = ['agent-1', 'agent-2', 'agent-3'];

    // Act
    const channel = await messagingService.createChannel(
      channelName,
      'Test channel for communication',
      agentIds,
    );

    // Assert
    expect(channel.id).toBeDefined();
    expect(channel.name).toBe(channelName);
    expect(channel.participants.size).toBe(3);

    // Verify we can get the channel
    const retrievedChannel = messagingService.getChannel(channel.id);
    expect(retrievedChannel).toBeDefined();
    expect(retrievedChannel?.name).toBe(channelName);

    // Add and remove participants
    channel.addParticipant('agent-4');
    expect(channel.participants.size).toBe(4);

    channel.removeParticipant('agent-1');
    expect(channel.participants.size).toBe(3);
    expect(channel.hasParticipant('agent-1')).toBe(false);
    expect(channel.hasParticipant('agent-2')).toBe(true);
  });

  test('should send messages to channels', async () => {
    // Arrange
    const senderId = 'agent-1';
    const recipientIds = ['agent-2', 'agent-3'];
    const channelMessages: AgentMessage[] = [];

    // Create a channel with participants
    const channel = await messagingService.createChannel(
      'test-channel',
      'Test channel',
      [senderId, ...recipientIds],
    );

    // Subscribe agent-2 to messages
    messagingService.subscribeToMessages('agent-2', async (message) => {
      channelMessages.push(message);
    });

    // Act
    const results = await messagingService.sendToChannel(
      channel.id,
      MessageFactory.createMessage(senderId, { text: 'Channel message' }),
    );

    // Assert
    expect(results.length).toBe(3); // One for each participant, including the sender
    expect(results.every((r) => r.success)).toBe(true);

    // Verify agent-2 received the message
    expect(channelMessages.length).toBe(1);
    expect(channelMessages[0].senderId).toBe(senderId);
    expect(channelMessages[0].content.text).toBe('Channel message');
  });

  test('should handle task messages with responses', async () => {
    // Arrange
    const senderId = 'agent-1';
    const recipientId = 'agent-2';
    const taskDescription = 'Process this data';
    const taskData = { numbers: [1, 2, 3, 4, 5] };
    const responseMessages: AgentMessage[] = [];

    // Subscribe the sender to responses
    messagingService.subscribeToMessages(senderId, async (message) => {
      if (message.type === MessageType.RESPONSE) {
        responseMessages.push(message);
      }
    });

    // Act - Send a task message
    const taskMessage = MessageFactory.createTaskMessage(
      senderId,
      recipientId,
      taskDescription,
      {
        metadata: { data: taskData },
      },
    );

    const taskResult = await messagingService.sendMessage(taskMessage);

    // Simulate the recipient responding to the task
    const responseMessage = MessageFactory.createResponseMessage(
      recipientId,
      senderId,
      { sum: 15 },
      taskResult.messageId,
    );

    await messagingService.sendMessage(responseMessage);

    // Assert
    expect(responseMessages.length).toBe(1);
    expect(responseMessages[0].type).toBe(MessageType.RESPONSE);
    expect(responseMessages[0].correlationId).toBe(taskResult.messageId);
    expect(responseMessages[0].content.result.sum).toBe(15);
  });

  test('should clear messages for an agent', async () => {
    // Arrange
    const agent1 = 'agent-1';
    const agent2 = 'agent-2';

    // Send several messages
    await messagingService.sendMessage(
      MessageFactory.createMessage(
        agent1,
        { text: 'Message 1' },
        { recipientId: agent2 },
      ),
    );

    await messagingService.sendMessage(
      MessageFactory.createMessage(
        agent2,
        { text: 'Message 2' },
        { recipientId: agent1 },
      ),
    );

    await messagingService.sendMessage(
      MessageFactory.createMessage(
        agent1,
        { text: 'Message 3' },
        { recipientId: agent2 },
      ),
    );

    // Verify messages exist
    let messages = await messagingService.queryMessages({});
    expect(messages.length).toBe(3);

    // Act - Clear messages for agent1
    const cleared = await messagingService.clearMessages(agent1);

    // Assert
    expect(cleared).toBe(3); // All messages involve agent1

    // Verify messages are cleared
    messages = await messagingService.queryMessages({});
    expect(messages.length).toBe(0);
  });

  test('should broadcast messages to multiple recipients', async () => {
    // Arrange
    const senderId = 'agent-1';
    const recipientIds = ['agent-2', 'agent-3', 'agent-4'];
    const message = { text: 'Broadcast test' };

    // Act
    const results = await messagingService.broadcastMessage(
      MessageFactory.createMessage(senderId, message),
      recipientIds,
    );

    // Assert
    expect(results.length).toBe(3);
    expect(results.every((r) => r.success)).toBe(true);

    // Check that messages were stored
    const storedMessages = await messagingService.queryMessages({
      senderIds: [senderId],
    });

    expect(storedMessages.length).toBe(3);
    expect(storedMessages[0].content).toEqual(message);
    expect(storedMessages[1].content).toEqual(message);
    expect(storedMessages[2].content).toEqual(message);

    // Each should have a different recipient
    const recipients = storedMessages.map((m) => m.recipientId);
    expect(recipients.sort()).toEqual(recipientIds.sort());
  });
});
