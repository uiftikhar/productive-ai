/**
 * Integration Tests for CommunicationService
 * 
 * Tests the CommunicationService's integration with agents and message delivery.
 */

import { jest } from '@jest/globals';
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  flushPromises
} from '../test-utils';
import { MessageType } from '../../agentic-meeting-analysis';
describe('CommunicationService Integration', () => {
  let testEnv: any;
  
  beforeAll(async () => {
    // Set up the test environment with all services
    testEnv = await setupTestEnvironment();
  });
  
  afterAll(async () => {
    // Clean up after tests
    await cleanupTestEnvironment();
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  test('should register agents and deliver messages', async () => {
    const { communication } = testEnv;
    
    // Create message handler mocks
    const agent1Handler = jest.fn();
    const agent2Handler = jest.fn();
    
    // Register agents
    await communication.registerAgent('agent-1', agent1Handler);
    await communication.registerAgent('agent-2', agent2Handler);
    
    // Create a test message
    const message = {
      id: 'msg-123',
      type: MessageType.REQUEST,
      sender: 'agent-1',
      recipients: ['agent-2'],
      content: { command: 'analyze', data: 'test data' },
      timestamp: Date.now()
    };
    
    // Send message
    await communication.sendMessage(message);
    
    // Wait for async operations
    await flushPromises();
    
    // Verify message was delivered to the intended recipient
    expect(agent2Handler).toHaveBeenCalledTimes(1);
    expect(agent2Handler).toHaveBeenCalledWith(message);
    
    // Verify message was not delivered to the sender
    expect(agent1Handler).not.toHaveBeenCalled();
  });
  
  test('should handle broadcasts to all agents', async () => {
    const { communication } = testEnv;
    
    // Create message handler mocks
    const agent1Handler = jest.fn();
    const agent2Handler = jest.fn();
    const agent3Handler = jest.fn();
    
    // Register agents
    await communication.registerAgent('agent-1', agent1Handler);
    await communication.registerAgent('agent-2', agent2Handler);
    await communication.registerAgent('agent-3', agent3Handler);
    
    // Create a broadcast message
    const broadcastMessage = {
      id: 'msg-broadcast',
      type: MessageType.NOTIFICATION,
      sender: 'agent-1',
      recipients: 'broadcast',
      content: { notification: 'system event', importance: 'high' },
      timestamp: Date.now()
    };
    
    // Send broadcast message
    await communication.sendMessage(broadcastMessage);
    
    // Wait for async operations
    await flushPromises();
    
    // Verify message was delivered to all agents except sender
    expect(agent1Handler).not.toHaveBeenCalled(); // Sender doesn't receive own broadcast
    expect(agent2Handler).toHaveBeenCalledWith(broadcastMessage);
    expect(agent3Handler).toHaveBeenCalledWith(broadcastMessage);
  });
  
  test('should handle message replies correctly', async () => {
    const { communication } = testEnv;
    
    // Create message handler mocks
    const agent1Handler = jest.fn();
    const agent2Handler = jest.fn();
    
    // Register agents
    await communication.registerAgent('agent-1', agent1Handler);
    await communication.registerAgent('agent-2', agent2Handler);
    
    // Create initial message
    const initialMessage = {
      id: 'msg-request',
      type: MessageType.REQUEST,
      sender: 'agent-1',
      recipients: ['agent-2'],
      content: { request: 'data analysis' },
      timestamp: Date.now()
    };
    
    // Send initial message
    await communication.sendMessage(initialMessage);
    
    // Create reply message
    const replyMessage = {
      id: 'msg-response',
      type: MessageType.RESPONSE,
      sender: 'agent-2',
      recipients: ['agent-1'],
      content: { result: 'analysis complete' },
      replyTo: 'msg-request',
      timestamp: Date.now()
    };
    
    // Send reply
    await communication.sendMessage(replyMessage);
    
    // Wait for async operations
    await flushPromises();
    
    // Verify reply was delivered to the original sender
    expect(agent1Handler).toHaveBeenCalledTimes(1);
    expect(agent1Handler).toHaveBeenCalledWith(replyMessage);
  });
  
  test('should maintain message history for agents', async () => {
    const { communication } = testEnv;
    
    // Clear previous messages
    await communication.clearMessageHistory();
    
    // Create message handler mocks
    const agent1Handler = jest.fn();
    const agent2Handler = jest.fn();
    
    // Register agents
    await communication.registerAgent('agent-1', agent1Handler);
    await communication.registerAgent('agent-2', agent2Handler);
    
    // Create and send multiple messages
    const messages = [
      {
        id: 'msg-1',
        type: MessageType.REQUEST,
        sender: 'agent-1',
        recipients: ['agent-2'],
        content: { request: 'data' },
        timestamp: Date.now() - 2000
      },
      {
        id: 'msg-2',
        type: MessageType.RESPONSE,
        sender: 'agent-2',
        recipients: ['agent-1'],
        content: { response: 'data provided' },
        replyTo: 'msg-1',
        timestamp: Date.now() - 1000
      },
      {
        id: 'msg-3',
        type: MessageType.NOTIFICATION,
        sender: 'agent-1',
        recipients: 'broadcast',
        content: { notification: 'process complete' },
        timestamp: Date.now()
      }
    ];
    
    for (const message of messages) {
      await communication.sendMessage(message);
    }
    
    // Wait for async operations
    await flushPromises();
    
    // Get message history for agent-1
    const agent1History = await communication.getMessageHistory('agent-1');
    
    // Verify agent-1's message history
    expect(agent1History).toHaveLength(3);
    expect(agent1History[0].id).toBe('msg-1');
    expect(agent1History[1].id).toBe('msg-2');
    expect(agent1History[2].id).toBe('msg-3');
    
    // Get message history for agent-2
    const agent2History = await communication.getMessageHistory('agent-2');
    
    // Verify agent-2's message history
    expect(agent2History).toHaveLength(3);
    expect(agent2History[0].id).toBe('msg-1');
    expect(agent2History[1].id).toBe('msg-2');
    expect(agent2History[2].id).toBe('msg-3');
  });
  
  test('should handle unregistering agents correctly', async () => {
    const { communication } = testEnv;
    
    // Create message handler mocks
    const agentHandler = jest.fn();
    
    // Register agent
    await communication.registerAgent('temp-agent', agentHandler);
    
    // Create a test message for the agent
    const message = {
      id: 'msg-temp',
      type: MessageType.NOTIFICATION,
      sender: 'system',
      recipients: ['temp-agent'],
      content: { notification: 'test' },
      timestamp: Date.now()
    };
    
    // Send message
    await communication.sendMessage(message);
    await flushPromises();
    
    // Verify message was delivered
    expect(agentHandler).toHaveBeenCalledTimes(1);
    
    // Unregister agent
    await communication.unregisterAgent('temp-agent');
    
    // Reset mock
    agentHandler.mockClear();
    
    // Send another message to the unregistered agent
    const secondMessage = {
      id: 'msg-temp-2',
      type: MessageType.NOTIFICATION,
      sender: 'system',
      recipients: ['temp-agent'],
      content: { notification: 'test-2' },
      timestamp: Date.now()
    };
    
    // Send message
    await communication.sendMessage(secondMessage);
    await flushPromises();
    
    // Verify message was not delivered to unregistered agent
    expect(agentHandler).not.toHaveBeenCalled();
  });
}); 