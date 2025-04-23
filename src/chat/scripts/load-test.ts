/**
 * Chat System Load Test Script
 * 
 * This script performs load testing on the chat system under various conditions.
 * It simulates multiple concurrent users, different message rates, and different
 * types of chat interactions.
 * 
 * Usage:
 *   npm run load-test -- --users=100 --duration=300 --rate=5
 * 
 * Options:
 *   --users      Number of concurrent users (default: 50)
 *   --duration   Test duration in seconds (default: 120)
 *   --rate       Messages per second per user (default: 2)
 *   --scenario   Test scenario: "normal", "high-load", "error-prone" (default: "normal")
 *   --host       API host to test against (default: "http://localhost:3000")
 */

import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace(/^--/, '')] = value;
  return acc;
}, {} as Record<string, string>);

// Test configuration
const config = {
  users: parseInt(args.users || '50', 10),
  duration: parseInt(args.duration || '120', 10),
  messagesPerSecond: parseFloat(args.rate || '2'),
  scenario: args.scenario || 'normal',
  host: args.host || 'http://localhost:3000',
  reportFile: args.report || `load-test-report-${Date.now()}.json`,
  connectDelay: 50 // ms delay between user connections to avoid overwhelming the server
};

// Test metrics
const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  responseTimes: [] as number[],
  socketConnections: 0,
  socketErrors: 0,
  messagesSent: 0,
  messagesReceived: 0,
  sessionCreations: 0,
  maxConcurrentUsers: 0,
  activeUsers: 0,
  errors: [] as { time: number; error: string }[],
  statusCodes: {} as Record<number, number>,
  testStartTime: Date.now(),
  testEndTime: 0,
  userMetrics: {} as Record<string, {
    requests: number;
    avgResponseTime: number;
    errors: number;
    messagesSent: number;
    messagesReceived: number;
  }>
};

// Test scenarios
const scenarios = {
  normal: {
    messageLength: 50,
    errorRate: 0.01,
    delayBetweenMessages: 2000,
    sessionSwitchProbability: 0.05
  },
  'high-load': {
    messageLength: 200,
    errorRate: 0.05,
    delayBetweenMessages: 500,
    sessionSwitchProbability: 0.1
  },
  'error-prone': {
    messageLength: 100,
    errorRate: 0.2,
    delayBetweenMessages: 1000,
    sessionSwitchProbability: 0.3
  }
};

// Select scenario
const scenarioConfig = scenarios[config.scenario as keyof typeof scenarios] || scenarios.normal;

// HTTP client with interceptors for metrics
const api = axios.create({
  baseURL: config.host,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Intercept requests for tracking
api.interceptors.request.use(request => {
  (request as any).startTime = Date.now();
  return request;
});

// Intercept responses for metrics
api.interceptors.response.use(
  response => {
    const duration = Date.now() - (response.config as any).startTime;
    metrics.responseTimes.push(duration);
    metrics.totalRequests++;
    metrics.successfulRequests++;
    
    // Track status codes
    if (!metrics.statusCodes[response.status]) {
      metrics.statusCodes[response.status] = 0;
    }
    metrics.statusCodes[response.status]++;
    
    return response;
  },
  error => {
    metrics.totalRequests++;
    metrics.failedRequests++;
    
    // Capture error details
    const errorMsg = error.response 
      ? `${error.response.status}: ${JSON.stringify(error.response.data)}` 
      : error.message;
      
    metrics.errors.push({
      time: Date.now(),
      error: errorMsg
    });
    
    // Track status codes for errors too
    if (error.response) {
      if (!metrics.statusCodes[error.response.status]) {
        metrics.statusCodes[error.response.status] = 0;
      }
      metrics.statusCodes[error.response.status]++;
    }
    
    return Promise.reject(error);
  }
);

// Simulated user class
class SimulatedUser {
  id: string;
  socket: Socket | null = null;
  connected: boolean = false;
  sessionId: string | null = null;
  messagesSent: number = 0;
  messagesReceived: number = 0;
  sessionIds: string[] = [];
  errors: number = 0;
  responseTimes: number[] = [];
  
  constructor(id: string) {
    this.id = id;
    this.initialize();
  }
  
  async initialize() {
    try {
      // Set up user metrics
      metrics.userMetrics[this.id] = {
        requests: 0,
        avgResponseTime: 0,
        errors: 0,
        messagesSent: 0,
        messagesReceived: 0
      };
      
      // Connect socket
      await this.connectSocket();
      
      // Create initial session
      await this.createSession();
      
      // Start sending messages
      this.scheduleNextMessage();
      
    } catch (error) {
      console.error(`User ${this.id} initialization error:`, error);
      this.errors++;
      metrics.userMetrics[this.id].errors++;
    }
  }
  
  async connectSocket() {
    try {
      this.socket = io(`${config.host}`, {
        transports: ['websocket'],
        auth: {
          userId: this.id
        }
      });
      
      this.socket.on('connect', () => {
        this.connected = true;
        metrics.socketConnections++;
        metrics.activeUsers++;
        
        if (metrics.activeUsers > metrics.maxConcurrentUsers) {
          metrics.maxConcurrentUsers = metrics.activeUsers;
        }
      });
      
      this.socket.on('message_response', (data) => {
        this.messagesReceived++;
        metrics.messagesReceived++;
        metrics.userMetrics[this.id].messagesReceived++;
      });
      
      this.socket.on('error', (error) => {
        metrics.socketErrors++;
        this.errors++;
        metrics.userMetrics[this.id].errors++;
      });
      
      this.socket.on('disconnect', () => {
        this.connected = false;
        metrics.activeUsers = Math.max(0, metrics.activeUsers - 1);
      });
      
      // Wait for connection to establish
      await new Promise<void>((resolve) => {
        if (this.socket!.connected) {
          resolve();
        } else {
          this.socket!.on('connect', () => resolve());
        }
      });
      
    } catch (error) {
      console.error(`Socket connection error for user ${this.id}:`, error);
      metrics.socketErrors++;
      this.errors++;
      metrics.userMetrics[this.id].errors++;
    }
  }
  
  async createSession() {
    try {
      const startTime = Date.now();
      
      const response = await api.post('/api/chat/sessions', {
        userId: this.id,
        metadata: {
          source: 'load-test',
          scenario: config.scenario
        }
      });
      
      const duration = Date.now() - startTime;
      this.responseTimes.push(duration);
      this.updateUserResponseMetrics(duration);
      
      this.sessionId = response.data.sessionId;
      this.sessionIds.push(this.sessionId!);
      metrics.sessionCreations++;
      
      // Join session room via socket
      if (this.socket && this.connected) {
        this.socket.emit('join_session', this.sessionId);
      }
      
      return this.sessionId;
      
    } catch (error) {
      console.error(`Create session error for user ${this.id}:`, error);
      this.errors++;
      metrics.userMetrics[this.id].errors++;
      throw error;
    }
  }
  
  async sendMessage() {
    if (!this.sessionId || !this.connected) {
      // Try to create a new session if needed
      if (!this.sessionId) {
        await this.createSession();
      }
      return;
    }
    
    try {
      // Generate random message
      const message = this.generateRandomMessage();
      
      const startTime = Date.now();
      
      // First try socket-based message sending
      if (this.socket && this.connected && Math.random() > 0.3) {
        this.socket.emit('new_message', {
          sessionId: this.sessionId as string,
          content: message
        });
      } else {
        // Fallback to REST API
        await api.post('/api/chat/messages', {
          sessionId: this.sessionId,
          content: message,
          metadata: {
            source: 'load-test'
          }
        });
      }
      
      const duration = Date.now() - startTime;
      this.responseTimes.push(duration);
      this.updateUserResponseMetrics(duration);
      
      this.messagesSent++;
      metrics.messagesSent++;
      metrics.userMetrics[this.id].messagesSent++;
      
      // Randomly switch sessions
      if (Math.random() < scenarioConfig.sessionSwitchProbability) {
        if (this.sessionIds.length > 1) {
          // Switch to another existing session
          this.sessionId = this.sessionIds[Math.floor(Math.random() * this.sessionIds.length)];
          
          // Join session room via socket
          if (this.socket && this.connected) {
            this.socket.emit('join_session', this.sessionId);
          }
        } else if (Math.random() < 0.5) {
          // Create a new session
          await this.createSession();
        }
      }
      
    } catch (error) {
      console.error(`Send message error for user ${this.id}:`, error);
      this.errors++;
      metrics.userMetrics[this.id].errors++;
    }
  }
  
  scheduleNextMessage() {
    // Calculate delay - randomized around the configured delay
    const baseDelay = scenarioConfig.delayBetweenMessages;
    const jitter = baseDelay * 0.2; // 20% jitter
    const delay = baseDelay + (Math.random() * jitter * 2 - jitter);
    
    setTimeout(async () => {
      await this.sendMessage();
      this.scheduleNextMessage();
    }, delay);
  }
  
  generateRandomMessage(): string {
    const templates = [
      'Hello, how are you?',
      'Can you help me with something?',
      'I need information about {topic}.',
      'Tell me more about {topic}.',
      'What do you know about {topic}?',
      'I\'m looking for {topic}.',
      'How does {topic} work?',
      'Can you explain {topic}?',
      'I want to learn about {topic}.',
      'Is there any information about {topic}?'
    ];
    
    const topics = [
      'artificial intelligence',
      'machine learning',
      'software development',
      'cloud computing',
      'web development',
      'mobile apps',
      'data science',
      'blockchain',
      'cybersecurity',
      'quantum computing',
      'internet of things',
      'augmented reality',
      'virtual reality',
      'robotics',
      'space exploration'
    ];
    
    let template = templates[Math.floor(Math.random() * templates.length)];
    const topic = topics[Math.floor(Math.random() * topics.length)];
    
    // Replace {topic} placeholder
    let message = template.replace('{topic}', topic);
    
    // For longer messages, add some random text
    if (scenarioConfig.messageLength > message.length) {
      const additionalLength = scenarioConfig.messageLength - message.length;
      const words = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(' ');
      
      let additionalText = '';
      while (additionalText.length < additionalLength) {
        additionalText += ' ' + words[Math.floor(Math.random() * words.length)];
      }
      
      message += '. ' + additionalText.trim();
    }
    
    // Randomly introduce errors if in error-prone mode
    if (Math.random() < scenarioConfig.errorRate) {
      // Add some problematic characters or make it very long
      const errorTypes = ['invalid_chars', 'very_long', 'special_chars'];
      const errorType = errorTypes[Math.floor(Math.random() * errorTypes.length)];
      
      if (errorType === 'invalid_chars') {
        message = message.split('').map(c => 
          Math.random() < 0.1 ? String.fromCharCode(Math.floor(Math.random() * 65535)) : c
        ).join('');
      } else if (errorType === 'very_long') {
        // Make message very long
        message = message.repeat(20);
      } else if (errorType === 'special_chars') {
        // Add SQL-injection like content or script tags
        const specialStrings = [
          "'; DROP TABLE users; --",
          "<script>alert('XSS')</script>",
          "${process.env.SECRET_KEY}",
          "'; TRUNCATE sessions; --"
        ];
        message += ' ' + specialStrings[Math.floor(Math.random() * specialStrings.length)];
      }
    }
    
    return message;
  }
  
  updateUserResponseMetrics(duration: number) {
    const userMetrics = metrics.userMetrics[this.id];
    userMetrics.requests++;
    
    // Update average response time
    userMetrics.avgResponseTime = 
      (userMetrics.avgResponseTime * (userMetrics.requests - 1) + duration) / 
      userMetrics.requests;
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
  }
}

// Run the load test
async function runLoadTest() {
  console.log(`Starting load test with ${config.users} users, ${config.duration}s duration`);
  console.log(`Scenario: ${config.scenario}, Message rate: ${config.messagesPerSecond}/s per user`);
  
  // Create users
  const users: SimulatedUser[] = [];
  
  // Connect users with delay to avoid overwhelming the server
  for (let i = 0; i < config.users; i++) {
    const userId = `loadtest-${uuidv4().substring(0, 8)}`;
    const user = new SimulatedUser(userId);
    users.push(user);
    
    // Delay between user connections
    await new Promise(resolve => setTimeout(resolve, config.connectDelay));
    
    // Log progress
    if ((i + 1) % 10 === 0 || i === config.users - 1) {
      console.log(`Connected ${i + 1}/${config.users} users`);
    }
  }
  
  // Run test for specified duration
  console.log(`All users connected. Test running for ${config.duration} seconds...`);
  
  // Print metrics periodically
  const metricsInterval = setInterval(() => {
    const elapsedSeconds = (Date.now() - metrics.testStartTime) / 1000;
    const avgResponseTime = metrics.responseTimes.length > 0 
      ? metrics.responseTimes.reduce((sum, time) => sum + time, 0) / metrics.responseTimes.length 
      : 0;
    
    console.log(`[${elapsedSeconds.toFixed(1)}s] Requests: ${metrics.totalRequests}, ` +
      `Avg response time: ${avgResponseTime.toFixed(2)}ms, ` +
      `Active users: ${metrics.activeUsers}, ` +
      `Messages: ${metrics.messagesSent} sent / ${metrics.messagesReceived} received`);
      
  }, 5000);
  
  // Wait for test duration
  await new Promise(resolve => setTimeout(resolve, config.duration * 1000));
  
  // Stop metrics reporting
  clearInterval(metricsInterval);
  
  // Disconnect all users
  console.log('Test completed. Disconnecting users...');
  for (const user of users) {
    user.disconnect();
  }
  
  // Final metrics calculation
  metrics.testEndTime = Date.now();
  const testDurationMs = metrics.testEndTime - metrics.testStartTime;
  const avgResponseTime = metrics.responseTimes.length > 0 
    ? metrics.responseTimes.reduce((sum, time) => sum + time, 0) / metrics.responseTimes.length 
    : 0;
  
  const report = {
    config,
    metrics: {
      ...metrics,
      testDurationSeconds: testDurationMs / 1000,
      avgResponseTimeMs: avgResponseTime,
      requestsPerSecond: metrics.totalRequests / (testDurationMs / 1000),
      messagesPerSecond: metrics.messagesSent / (testDurationMs / 1000),
      successRate: metrics.successfulRequests / metrics.totalRequests,
    }
  };
  
  // Save report to file
  fs.writeFileSync(
    path.join(process.cwd(), config.reportFile), 
    JSON.stringify(report, null, 2)
  );
  
  // Print summary
  console.log('\nTest Summary:');
  console.log(`Duration: ${(testDurationMs / 1000).toFixed(1)} seconds`);
  console.log(`Total Requests: ${metrics.totalRequests}`);
  console.log(`Successful Requests: ${metrics.successfulRequests}`);
  console.log(`Failed Requests: ${metrics.failedRequests}`);
  console.log(`Average Response Time: ${avgResponseTime.toFixed(2)} ms`);
  console.log(`Requests/second: ${(metrics.totalRequests / (testDurationMs / 1000)).toFixed(2)}`);
  console.log(`Messages sent: ${metrics.messagesSent}`);
  console.log(`Messages received: ${metrics.messagesReceived}`);
  console.log(`Socket connections: ${metrics.socketConnections}`);
  console.log(`Socket errors: ${metrics.socketErrors}`);
  console.log(`Max concurrent users: ${metrics.maxConcurrentUsers}`);
  console.log(`Report saved to: ${config.reportFile}`);
}

// Run the test
runLoadTest().catch(error => {
  console.error('Load test error:', error);
  process.exit(1);
}); 