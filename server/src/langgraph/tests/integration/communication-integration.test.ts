/**
 * Communication Integration Tests (Refactored)
 * 
 * Tests the CommunicationService's integration with agents and message delivery.
 * 
 * This uses the new testing approach with real services.
 */

import { jest } from '@jest/globals';
import { setupTestEnvironment } from '../utils';
import { v4 as uuidv4 } from 'uuid';
import { MessageType, AgentMessage } from '../../agentic-meeting-analysis';

describe('Communication Integration', () => {
  let testEnv: any;
  
  beforeEach(async () => {
    // Set up the test environment with real services
    testEnv = await setupTestEnvironment();
  });
  
  afterEach(async () => {
    // Clean up resources
    await testEnv.cleanup();
  });
  
  test('should register agents and deliver messages', async () => {
    // Arrange
    const agentId = `test-agent-${uuidv4()}`;
    const receiveMessage = jest.fn();
    
    // Act - Register agent
    await testEnv.communication.registerAgent(agentId, receiveMessage);
    
    // Create a message to send
    const message: AgentMessage = {
      id: uuidv4(),
      type: MessageType.REQUEST,
      sender: 'system',
      recipients: [agentId],
      content: { task: 'test-task', priority: 'high' },
      timestamp: Date.now()
    };
    
    // Act - Send message to agent
    await testEnv.communication.sendMessage(message);
    
    // Assert
    expect(receiveMessage).toHaveBeenCalledWith(message);
  });

  test('should broadcast messages to all registered agents', async () => {
    // Arrange
    const agent1Id = `agent1-${uuidv4()}`;
    const agent2Id = `agent2-${uuidv4()}`;
    const agent3Id = `agent3-${uuidv4()}`;
    
    const agent1ReceiveMessage = jest.fn();
    const agent2ReceiveMessage = jest.fn();
    const agent3ReceiveMessage = jest.fn();
    
    // Register 3 agents
    await testEnv.communication.registerAgent(agent1Id, agent1ReceiveMessage);
    await testEnv.communication.registerAgent(agent2Id, agent2ReceiveMessage);
    await testEnv.communication.registerAgent(agent3Id, agent3ReceiveMessage);
    
    // Create a broadcast message
    const broadcastMessage: Omit<AgentMessage, 'recipients'> = {
      id: uuidv4(),
      type: MessageType.NOTIFICATION,
      sender: 'system',
      content: { announcement: 'system-announcement', importance: 'high' },
      timestamp: Date.now()
    };
    
    // Act - Broadcast message
    await testEnv.communication.broadcastMessage(broadcastMessage);
    
    // Assert
    expect(agent1ReceiveMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: MessageType.NOTIFICATION,
      sender: 'system',
      content: expect.objectContaining({ announcement: 'system-announcement' })
    }));
    expect(agent2ReceiveMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: MessageType.NOTIFICATION,
      sender: 'system',
      content: expect.objectContaining({ announcement: 'system-announcement' })
    }));
    expect(agent3ReceiveMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: MessageType.NOTIFICATION,
      sender: 'system',
      content: expect.objectContaining({ announcement: 'system-announcement' })
    }));
  });

  test('should unregister agents properly', async () => {
    // Arrange
    const agentId = `test-agent-${uuidv4()}`;
    const receiveMessage = jest.fn();
    
    // Register agent
    await testEnv.communication.registerAgent(agentId, receiveMessage);
    
    // Create a message
    const message: AgentMessage = {
      id: uuidv4(),
      type: MessageType.REQUEST,
      sender: 'system',
      recipients: [agentId],
      content: { task: 'test-task', priority: 'high' },
      timestamp: Date.now()
    };
    
    // Verify agent receives messages
    await testEnv.communication.sendMessage(message);
    expect(receiveMessage).toHaveBeenCalledTimes(1);
    
    // Act - Unregister agent
    await testEnv.communication.unregisterAgent(agentId);
    
    // Create another message
    const secondMessage: AgentMessage = {
      id: uuidv4(),
      type: MessageType.REQUEST,
      sender: 'system',
      recipients: [agentId],
      content: { task: 'another-task', priority: 'medium' },
      timestamp: Date.now()
    };
    
    // Send message to unregistered agent
    await testEnv.communication.sendMessage(secondMessage);
    
    // Assert - Should not have received the second message
    expect(receiveMessage).toHaveBeenCalledTimes(1);
  });

  test('should maintain message history', async () => {
    // Arrange
    const agentId = `test-agent-${uuidv4()}`;
    const message1: AgentMessage = {
      id: uuidv4(),
      type: MessageType.REQUEST,
      sender: 'system',
      recipients: [agentId],
      content: { task: 'task-1' },
      timestamp: Date.now() - 1000
    };
    
    const message2: AgentMessage = {
      id: uuidv4(),
      type: MessageType.RESPONSE,
      sender: agentId,
      recipients: ['system'],
      content: { result: 'result-1' },
      timestamp: Date.now()
    };
    
    // Register agent
    await testEnv.communication.registerAgent(agentId, jest.fn());
    
    // Act - Send messages
    await testEnv.communication.sendMessage(message1);
    await testEnv.communication.sendMessage(message2);
    
    // Act - Get message history
    const history = await testEnv.communication.getMessageHistory({});
    
    // Assert
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history).toContainEqual(expect.objectContaining({
      id: message1.id,
      type: MessageType.REQUEST
    }));
    expect(history).toContainEqual(expect.objectContaining({
      id: message2.id,
      type: MessageType.RESPONSE
    }));
  });

  test('should filter message history by type', async () => {
    // Arrange
    const agentId = `test-agent-${uuidv4()}`;
    
    // Create messages of different types
    const taskRequestMessage: AgentMessage = {
      id: uuidv4(),
      type: MessageType.REQUEST,
      sender: 'system',
      recipients: [agentId],
      content: { task: 'filter-test' },
      timestamp: Date.now() - 2000
    };
    
    const taskResultMessage: AgentMessage = {
      id: uuidv4(),
      type: MessageType.RESPONSE,
      sender: agentId,
      recipients: ['system'],
      content: { result: 'filter-result' },
      timestamp: Date.now() - 1000
    };
    
    const announcementMessage: Omit<AgentMessage, 'recipients'> = {
      id: uuidv4(),
      type: MessageType.NOTIFICATION,
      sender: 'system',
      content: { announcement: 'filter-announcement' },
      timestamp: Date.now()
    };
    
    // Register agent
    await testEnv.communication.registerAgent(agentId, jest.fn());
    
    // Send messages
    await testEnv.communication.sendMessage(taskRequestMessage);
    await testEnv.communication.sendMessage(taskResultMessage);
    await testEnv.communication.broadcastMessage(announcementMessage);
    
    // Act - Get filtered history
    const requests = await testEnv.communication.getMessageHistory({
      types: [MessageType.REQUEST]
    });
    
    const notifications = await testEnv.communication.getMessageHistory({
      types: [MessageType.NOTIFICATION]
    });
    
    // Assert
    expect(requests.length).toBeGreaterThanOrEqual(1);
    expect(requests[0].type).toBe(MessageType.REQUEST);
    
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    expect(notifications[0].type).toBe(MessageType.NOTIFICATION);
  });
}); 