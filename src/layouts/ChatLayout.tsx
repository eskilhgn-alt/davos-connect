/**
 * ChatLayout - Standalone layout for chat route
 * No BottomNavigation to prevent keyboard issues
 */

import * as React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { BottomNavigation } from '@/components/layout/BottomNavigation';

export const ChatLayout: React.FC = () => {
  return (
    <>
      <Outlet />
      <BottomNavigation />
    </>
  );
};

export default ChatLayout;
