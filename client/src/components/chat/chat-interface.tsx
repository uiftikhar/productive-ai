import React, { useState, useRef, useEffect } from 'react';
import { chatApi, ChatMessage, ChatResponse, ChatSession } from '@/lib/api/chat';

interface ChatInterfaceProps {
  userId: string;
  initialSessionId?: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ userId, initialSessionId }) => {
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null);
  const [messages, setMessages] = useState<(ChatMessage | ChatResponse)[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize chat session
  useEffect(() => {
    const initializeSession = async () => {
      if (!sessionId) {
        try {
          const session = await chatApi.createSession(userId);
          setSessionId(session.id);

          // Add system welcome message
          setMessages([
            {
              id: 'welcome',
              content:
                'Hello! I can help you analyze meeting transcripts. What would you like to do?',
              type: 'text',
              timestamp: Date.now(),
            },
          ]);
        } catch (error) {
          console.error('Failed to create chat session:', error);
        }
      } else {
        // Load existing session messages
        try {
          const history = await chatApi.getMessageHistory(sessionId);
          setMessages(history);
        } catch (error) {
          console.error('Failed to load message history:', error);
        }
      }
    };

    initializeSession();
  }, [userId, sessionId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!sessionId || !inputValue.trim()) return;

    // Create temporary user message
    const userMessage: ChatMessage = {
      id: `tmp-${Date.now()}`,
      content: inputValue,
      role: 'user',
      timestamp: Date.now(),
    };

    // Update UI immediately with user message
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Send message to API
      const response = await chatApi.sendMessage(sessionId, inputValue);

      // Update messages with response
      setMessages(prev => [...prev, response]);
    } catch (error) {
      console.error('Failed to send message:', error);

      // Add error message
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          content: 'Sorry, there was an error processing your message. Please try again.',
          type: 'error',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadTranscript = async (transcriptText: string) => {
    if (!sessionId) return;

    setIsLoading(true);

    try {
      // Add message about uploading
      setMessages(prev => [
        ...prev,
        {
          id: `upload-${Date.now()}`,
          content: 'Uploading and processing your transcript...',
          type: 'loading',
          timestamp: Date.now(),
        },
      ]);

      // Upload transcript
      const uploadResponse = await chatApi.uploadTranscript(
        transcriptText,
        'Meeting Transcript', // Default title
        'Uploaded via chat interface' // Default description
      );

      // Start analysis
      const analysisResponse = await chatApi.analyzeTranscript(uploadResponse.meetingId);

      // Add confirmation message
      setMessages(prev => [
        ...prev.filter(msg => (msg as ChatResponse).type !== 'loading'), // Remove loading message
        {
          id: `analysis-${Date.now()}`,
          content: `Transcript uploaded and analysis started. Analysis progress: ${analysisResponse.progress.overallProgress}%`,
          type: 'analysis',
          timestamp: Date.now(),
          attachments: [
            {
              type: 'analysis_info',
              data: {
                meetingId: uploadResponse.meetingId,
                status: analysisResponse.status,
              },
              metadata: {
                progress: analysisResponse.progress,
              },
            },
          ],
        },
      ]);

      // Start polling for analysis status
      pollAnalysisStatus(uploadResponse.meetingId);
    } catch (error) {
      console.error('Failed to upload transcript:', error);

      // Add error message
      setMessages(prev => [
        ...prev.filter(msg => (msg as ChatResponse).type !== 'loading'), // Remove loading message
        {
          id: `error-${Date.now()}`,
          content: 'Sorry, there was an error uploading your transcript. Please try again.',
          type: 'error',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const pollAnalysisStatus = async (meetingId: string) => {
    // Poll for status updates every 5 seconds
    const pollInterval = setInterval(async () => {
      try {
        const statusResponse = await chatApi.getAnalysisStatus(meetingId);

        // Update the analysis message with new progress
        setMessages(prev => {
          const updatedMessages = [...prev];
          const analysisMessageIndex = updatedMessages.findIndex(
            msg =>
              (msg as ChatResponse).type === 'analysis' &&
              (msg as ChatResponse).attachments?.some(att => att.data?.meetingId === meetingId)
          );

          if (analysisMessageIndex >= 0) {
            const updatedMessage = {
              ...updatedMessages[analysisMessageIndex],
              content: `Transcript analysis in progress. Current progress: ${statusResponse.progress.overallProgress}%`,
              attachments: [
                {
                  type: 'analysis_info',
                  data: {
                    meetingId,
                    status: statusResponse.status,
                  },
                  metadata: {
                    progress: statusResponse.progress,
                  },
                },
              ],
            };
            updatedMessages[analysisMessageIndex] = updatedMessage;
          }

          return updatedMessages;
        });

        // If analysis is complete, stop polling and show results
        if (statusResponse.status === 'completed') {
          clearInterval(pollInterval);

          // Add completion message
          setMessages(prev => [
            ...prev,
            {
              id: `complete-${Date.now()}`,
              content: 'Analysis complete! You can now ask questions about the meeting.',
              type: 'text',
              timestamp: Date.now(),
            },
          ]);

          // Get related meetings (if any)
          try {
            const relatedMeetings = await chatApi.getRelatedMeetings(meetingId);
            if (relatedMeetings.length > 0) {
              setMessages(prev => [
                ...prev,
                {
                  id: `related-${Date.now()}`,
                  content: `I found ${relatedMeetings.length} related meetings that might be relevant.`,
                  type: 'text',
                  timestamp: Date.now(),
                  attachments: [
                    {
                      type: 'related_meetings',
                      data: relatedMeetings,
                    },
                  ],
                },
              ]);
            }
          } catch (error) {
            console.error('Failed to get related meetings:', error);
          }
        } else if (statusResponse.status === 'failed') {
          clearInterval(pollInterval);

          // Add failure message
          setMessages(prev => [
            ...prev,
            {
              id: `failed-${Date.now()}`,
              content: 'Analysis failed. Please try again or upload a different transcript.',
              type: 'error',
              timestamp: Date.now(),
            },
          ]);
        }
      } catch (error) {
        console.error('Failed to poll analysis status:', error);
        clearInterval(pollInterval);
      }
    }, 5000);

    // Clean up interval on component unmount
    return () => clearInterval(pollInterval);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target?.result as string;
      handleUploadTranscript(content);
    };
    reader.readAsText(file);
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className='flex h-full max-h-screen flex-col bg-gray-50'>
      <div className='border-b bg-white p-4 shadow-sm'>
        <h2 className='text-xl font-semibold'>Meeting Analysis Chat</h2>
      </div>

      <div className='flex-1 space-y-4 overflow-y-auto p-4'>
        {messages.map(message => (
          <div
            key={message.id}
            className={`flex ${(message as ChatMessage).role === 'user' || !('role' in message) ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-3/4 rounded-lg p-3 ${
                (message as ChatMessage).role === 'user'
                  ? 'bg-blue-500 text-white'
                  : (message as ChatResponse).type === 'error'
                    ? 'bg-red-100 text-red-800'
                    : (message as ChatResponse).type === 'loading'
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-gray-200 text-gray-800'
              }`}
            >
              <div className='whitespace-pre-wrap'>{message.content}</div>
              <div className='mt-1 text-xs opacity-70'>{formatTimestamp(message.timestamp)}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className='border-t bg-white p-4'>
        <div className='flex items-center space-x-2'>
          <button
            className='rounded-full bg-gray-200 p-2 hover:bg-gray-300'
            onClick={() => document.getElementById('file-upload')?.click()}
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-5 w-5'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13'
              />
            </svg>
            <input
              id='file-upload'
              type='file'
              accept='.txt,.md,.json,.vtt'
              onChange={handleFileUpload}
              className='hidden'
            />
          </button>

          <textarea
            className='flex-1 rounded-lg border p-2 focus:outline-none focus:ring-2 focus:ring-blue-500'
            placeholder='Type a message or upload a transcript file...'
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            rows={1}
          />

          <button
            className='rounded-full bg-blue-500 p-2 text-white hover:bg-blue-600 disabled:opacity-50'
            onClick={handleSendMessage}
            disabled={isLoading || !inputValue.trim()}
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-5 w-5'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M12 19l9 2-9-18-9 18 9-2zm0 0v-8'
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
