/**
 * Socket.IO Chat Client Example
 *
 * This file demonstrates how to connect to the WebSocket server,
 * join sessions, send messages, and handle real-time events.
 */

// Socket.IO connection
let socket;

// Connection status
let isConnected = false;

// Current session ID
let currentSessionId = null;

// DOM elements (to be initialized after page load)
let messagesContainer;
let messageInput;
let sendButton;
let statusDisplay;
let sessionIdInput;
let joinSessionButton;
let typingIndicator;

// Store tokens for streaming responses
const streamingTokens = new Map();

// Socket.IO events enum (keep in sync with server)
const SocketEvents = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',
  JOIN_SESSION: 'join_session',
  LEAVE_SESSION: 'leave_session',
  NEW_MESSAGE: 'new_message',
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_RESPONSE: 'message_response',
  MESSAGE_TOKEN: 'message_token',
  TYPING_START: 'typing_start',
  TYPING_END: 'typing_end',
  READ_RECEIPT: 'read_receipt',
};

/**
 * Initialize the chat client
 */
function initChatClient() {
  // Get DOM elements
  messagesContainer = document.getElementById('messages');
  messageInput = document.getElementById('message-input');
  sendButton = document.getElementById('send-button');
  statusDisplay = document.getElementById('status');
  sessionIdInput = document.getElementById('session-id');
  joinSessionButton = document.getElementById('join-session');
  typingIndicator = document.getElementById('typing-indicator');

  // Add event listeners
  sendButton.addEventListener('click', sendMessage);
  joinSessionButton.addEventListener('click', joinSession);
  messageInput.addEventListener('keydown', handleTypingStart);
  messageInput.addEventListener('keyup', handleKeyUp);

  // Connect to socket server
  connectSocket();
}

/**
 * Connect to the Socket.IO server
 */
function connectSocket() {
  updateStatus('Connecting...');

  // Get user ID from localStorage or generate a temporary one
  const userId = localStorage.getItem('userId') || `user-${Date.now()}`;

  // Store user ID in localStorage for persistence
  localStorage.setItem('userId', userId);

  // Connect to Socket.IO server with authentication
  socket = io({
    auth: {
      userId,
    },
  });

  // Set up event listeners
  socket.on('connect', handleConnect);
  socket.on('disconnect', handleDisconnect);
  socket.on('connected', handleConnected);
  socket.on('error', handleError);
  socket.on('session_joined', handleSessionJoined);
  socket.on('session_left', handleSessionLeft);
  socket.on(SocketEvents.MESSAGE_RECEIVED, handleMessageReceived);
  socket.on(SocketEvents.MESSAGE_TOKEN, handleMessageToken);
  socket.on(SocketEvents.MESSAGE_RESPONSE, handleMessageResponse);
  socket.on(SocketEvents.TYPING_START, handleRemoteTypingStart);
  socket.on(SocketEvents.TYPING_END, handleRemoteTypingEnd);
  socket.on(SocketEvents.READ_RECEIPT, handleReadReceipt);
}

/**
 * Handle successful connection to server
 */
function handleConnect() {
  isConnected = true;
  updateStatus('Connected to server');
}

/**
 * Handle disconnection from server
 */
function handleDisconnect() {
  isConnected = false;
  updateStatus('Disconnected from server');
}

/**
 * Handle the 'connected' event with user details
 */
function handleConnected(data) {
  updateStatus(`Connected as ${data.userId}`);

  // Enable UI elements
  joinSessionButton.disabled = false;
}

/**
 * Handle errors from the server
 */
function handleError(error) {
  console.error('Socket error:', error);
  updateStatus(`Error: ${error.message}`);
}

/**
 * Join a chat session
 */
function joinSession() {
  const sessionId = sessionIdInput.value.trim();

  if (!sessionId) {
    updateStatus('Please enter a valid session ID');
    return;
  }

  updateStatus(`Joining session ${sessionId}...`);
  socket.emit(SocketEvents.JOIN_SESSION, sessionId);
}

/**
 * Handle successful session join
 */
function handleSessionJoined(data) {
  currentSessionId = data.sessionId;
  updateStatus(`Joined session: ${currentSessionId}`);

  // Enable chat UI
  messageInput.disabled = false;
  sendButton.disabled = false;

  // Clear messages
  messagesContainer.innerHTML = '';

  // Add a system message
  addSystemMessage(`Joined session ${currentSessionId}`);
}

/**
 * Handle leaving a session
 */
function handleSessionLeft(data) {
  updateStatus(`Left session: ${data.sessionId}`);
  currentSessionId = null;

  // Disable chat UI
  messageInput.disabled = true;
  sendButton.disabled = true;

  // Add a system message
  addSystemMessage(`Left session ${data.sessionId}`);
}

/**
 * Send a message to the current session
 */
function sendMessage() {
  if (!currentSessionId) {
    updateStatus('Please join a session first');
    return;
  }

  const content = messageInput.value.trim();

  if (!content) {
    return;
  }

  // Prepare message payload
  const payload = {
    sessionId: currentSessionId,
    content,
    metadata: {
      source: 'web',
      timestamp: new Date().toISOString(),
    },
  };

  // Add message to UI
  addUserMessage(content);

  // Clear input
  messageInput.value = '';

  // Create streaming container for response
  const streamingId = Date.now().toString();
  streamingTokens.set(streamingId, '');
  addStreamingMessage(streamingId);

  // Send the message
  socket.emit(SocketEvents.NEW_MESSAGE, payload);

  // Stop typing indicator
  handleTypingEnd();
}

/**
 * Handle message acknowledgment from server
 */
function handleMessageReceived(data) {
  console.log('Message received by server:', data);
}

/**
 * Handle streaming tokens from the server
 */
function handleMessageToken(data) {
  const { token, sessionId } = data;

  // Find the last streaming message container
  const streamingId = Array.from(streamingTokens.keys()).pop();
  if (!streamingId) return;

  // Append token to accumulated response
  streamingTokens.set(streamingId, streamingTokens.get(streamingId) + token);

  // Update the UI
  const streamingElement = document.getElementById(`streaming-${streamingId}`);
  if (streamingElement) {
    streamingElement.textContent = streamingTokens.get(streamingId);
  }
}

/**
 * Handle complete message response
 */
function handleMessageResponse(data) {
  const { message } = data;

  // Clear streaming tokens for this response
  streamingTokens.clear();

  // Remove the streaming message element
  const streamingElements = document.querySelectorAll('.streaming-message');
  streamingElements.forEach((el) => el.remove());

  // Add the complete message
  addAssistantMessage(message.content);

  // Send read receipt
  socket.emit(SocketEvents.READ_RECEIPT, {
    sessionId: currentSessionId,
    messageId: message.id,
  });
}

/**
 * Handle typing start event
 */
function handleTypingStart(event) {
  if (!currentSessionId || !isConnected) return;

  // Only emit if we're actually typing content
  if (event.key !== 'Enter' && event.key !== 'Escape' && event.key !== 'Tab') {
    socket.emit(SocketEvents.TYPING_START, currentSessionId);
  }
}

/**
 * Handle key up event for enter key
 */
function handleKeyUp(event) {
  if (event.key === 'Enter') {
    sendMessage();
  } else if (messageInput.value.trim() === '') {
    // If the input is empty after keyup, stop typing
    handleTypingEnd();
  }
}

/**
 * Stop typing indicator
 */
function handleTypingEnd() {
  if (!currentSessionId || !isConnected) return;

  socket.emit(SocketEvents.TYPING_END, currentSessionId);
}

/**
 * Handle typing indicator from another user
 */
function handleRemoteTypingStart(data) {
  typingIndicator.textContent = `${data.userId} is typing...`;
  typingIndicator.style.display = 'block';
}

/**
 * Handle typing end from another user
 */
function handleRemoteTypingEnd(data) {
  typingIndicator.style.display = 'none';
}

/**
 * Handle read receipt from another user
 */
function handleReadReceipt(data) {
  console.log(
    `${data.userId} read message ${data.messageId} at ${data.timestamp}`,
  );
  // You could update UI to show read status if needed
}

/**
 * Add a user message to the UI
 */
function addUserMessage(content) {
  const messageElement = document.createElement('div');
  messageElement.className = 'message user-message';
  messageElement.textContent = content;
  messagesContainer.appendChild(messageElement);
  scrollToBottom();
}

/**
 * Add an assistant message to the UI
 */
function addAssistantMessage(content) {
  const messageElement = document.createElement('div');
  messageElement.className = 'message assistant-message';
  messageElement.textContent = content;
  messagesContainer.appendChild(messageElement);
  scrollToBottom();
}

/**
 * Add a system message to the UI
 */
function addSystemMessage(content) {
  const messageElement = document.createElement('div');
  messageElement.className = 'message system-message';
  messageElement.textContent = content;
  messagesContainer.appendChild(messageElement);
  scrollToBottom();
}

/**
 * Add a streaming message container
 */
function addStreamingMessage(streamingId) {
  const messageElement = document.createElement('div');
  messageElement.className = 'message assistant-message streaming-message';
  messageElement.id = `streaming-${streamingId}`;
  messagesContainer.appendChild(messageElement);
  scrollToBottom();
}

/**
 * Update the status display
 */
function updateStatus(message) {
  statusDisplay.textContent = message;
}

/**
 * Scroll to the bottom of the messages container
 */
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Initialize chat client when the DOM is loaded
document.addEventListener('DOMContentLoaded', initChatClient);
