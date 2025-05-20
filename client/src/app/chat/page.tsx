'use client';

import React from 'react';
import ChatInterface from '@/components/chat/chat-interface';

export default function ChatPage() {
  // In a real app, we would get the user ID from authentication
  const userId = 'user-123';

  return (
    <div className='flex h-screen flex-col'>
      <div className='flex-1 overflow-hidden'>
        <ChatInterface userId={userId} />
      </div>
    </div>
  );
}
