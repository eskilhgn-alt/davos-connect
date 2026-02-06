/**
 * ChatLayout - Standalone layout for chat route
 * No BottomNavigation to prevent keyboard issues
 */

import * as React from 'react';
import { Outlet } from 'react-router-dom';

export const ChatLayout: React.FC = () => {
  return <Outlet />;
};

export default ChatLayout;
