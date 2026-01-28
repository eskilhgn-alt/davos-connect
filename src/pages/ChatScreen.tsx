/**
 * ChatScreen - Messenger-style chat page
 * Uses the new feature module for all chat functionality
 */

import * as React from 'react';
import { ChatThread } from '@/features/chat';

export const ChatScreen: React.FC = () => {
  return <ChatThread />;
};

export default ChatScreen;
