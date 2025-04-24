/**
 * Socket.IO Client Test Script
 *
 * This script connects to the Socket.IO server and tests various functions
 * like joining sessions, sending messages, and handling real-time events.
 *
 * Run with: node test-socket-client.js
 */

const { io } = require('socket.io-client');
const readline = require('readline');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const USER_ID = process.env.USER_ID || `test-user-${Date.now()}`;

// Create interface for command line input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Current session ID
let currentSessionId = null;

// Connect to Socket.IO server
console.log(`Connecting to ${SERVER_URL} as ${USER_ID}...`);
const socket = io(SERVER_URL, {
  auth: {
    userId: USER_ID,
  },
});

// Handle connection events
socket.on('connect', () => {
  console.log('Connected to server');
  showCommands();
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

socket.on('connected', (data) => {
  console.log(`Connected successfully as ${data.userId}`);
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});

// Handle session events
socket.on('session_joined', (data) => {
  console.log(`Joined session: ${data.sessionId}`);
  currentSessionId = data.sessionId;
});

socket.on('session_left', (data) => {
  console.log(`Left session: ${data.sessionId}`);
  currentSessionId = null;
});

// Handle message events
socket.on('message_received', (data) => {
  console.log('Message received by server:', data);
});

socket.on('message_token', (data) => {
  process.stdout.write(data.token);
});

socket.on('message_response', (data) => {
  console.log('\nComplete message:', data.message.content);
});

// Handle typing indicators and read receipts
socket.on('typing_start', (data) => {
  console.log(`${data.userId} is typing...`);
});

socket.on('typing_end', () => {
  // Do nothing, just stop showing typing
});

socket.on('read_receipt', (data) => {
  console.log(
    `${data.userId} read message ${data.messageId} at ${data.timestamp}`,
  );
});

// Process user commands
function processCommand(input) {
  const [command, ...args] = input.trim().split(' ');

  switch (command) {
    case 'help':
      showCommands();
      break;

    case 'join':
      joinSession(args[0]);
      break;

    case 'leave':
      leaveSession();
      break;

    case 'send':
      sendMessage(args.join(' '));
      break;

    case 'typing':
      sendTypingIndicator();
      break;

    case 'read':
      sendReadReceipt(args[0]);
      break;

    case 'exit':
      console.log('Exiting...');
      socket.disconnect();
      rl.close();
      process.exit(0);
      break;

    default:
      console.log('Unknown command. Type "help" for available commands.');
      break;
  }
}

// Show available commands
function showCommands() {
  console.log('\nAvailable commands:');
  console.log('  help                - Show this help message');
  console.log('  join [sessionId]    - Join a chat session');
  console.log('  leave               - Leave the current session');
  console.log('  send [message]      - Send a message in the current session');
  console.log('  typing              - Send typing indicator');
  console.log('  read [messageId]    - Send read receipt for a message');
  console.log('  exit                - Disconnect and exit');
  console.log('');
}

// Join a session
function joinSession(sessionId) {
  if (!sessionId) {
    console.log('Please provide a session ID');
    return;
  }

  console.log(`Joining session ${sessionId}...`);
  socket.emit('join_session', sessionId);
}

// Leave the current session
function leaveSession() {
  if (!currentSessionId) {
    console.log('Not in a session');
    return;
  }

  console.log(`Leaving session ${currentSessionId}...`);
  socket.emit('leave_session', currentSessionId);
}

// Send a message
function sendMessage(message) {
  if (!currentSessionId) {
    console.log('Please join a session first');
    return;
  }

  if (!message) {
    console.log('Please provide a message');
    return;
  }

  console.log('Sending message...');
  socket.emit('new_message', {
    sessionId: currentSessionId,
    content: message,
    metadata: {
      source: 'test-client',
      timestamp: new Date().toISOString(),
    },
  });
}

// Send typing indicator
function sendTypingIndicator() {
  if (!currentSessionId) {
    console.log('Please join a session first');
    return;
  }

  console.log('Sending typing indicator...');
  socket.emit('typing_start', currentSessionId);

  // Automatically stop typing after 3 seconds
  setTimeout(() => {
    socket.emit('typing_end', currentSessionId);
    console.log('Typing indicator stopped');
  }, 3000);
}

// Send read receipt
function sendReadReceipt(messageId) {
  if (!currentSessionId) {
    console.log('Please join a session first');
    return;
  }

  if (!messageId) {
    console.log('Please provide a message ID');
    return;
  }

  console.log('Sending read receipt...');
  socket.emit('read_receipt', {
    sessionId: currentSessionId,
    messageId,
  });
}

// Start the command prompt
rl.on('line', processCommand);
rl.on('close', () => {
  socket.disconnect();
  process.exit(0);
});

// Print a welcome message
console.log('Socket.IO Client Test Script');
console.log('===========================');
