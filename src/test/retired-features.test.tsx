import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MoreTiles } from '@/pages/MoreScreen';
import { MessageItem } from '@/chat/MessageItem';
import { normalizeAttachment } from '@/chat/logic';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }));
vi.mock('@/hooks/useAppBadges', () => ({ useAppBadges: () => ({ chat: 0, stories: 0, agenda: 0, total: 0 }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: query } }));
vi.mock('@/chat/store', () => ({ chatStore: {} }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('retired features', () => {
  it('keeps useful navigation while removing all three retired destinations', () => {
    render(<MemoryRouter><MoreTiles /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/agenda');
    expect(screen.getByRole('link', { name: 'Shot' })).toHaveAttribute('href', '/shot');
    expect(screen.queryByRole('link', { name: 'Runder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Faktasjekk' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Avstemninger' })).not.toBeInTheDocument();
  });

  it('preserves old poll message text without fetching a retired poll or offering a broken link', () => {
    render(<MessageItem
      message={{
        id: 'old-message', text: 'Vi valgte pizza', createdAt: Date.UTC(2026, 8, 1),
        senderId: 'other', senderName: 'Gruppen',
        attachments: [normalizeAttachment({ id: 'old-card', kind: 'poll', poll_id: 'old-poll', poll_event: 'ended' })],
      }}
      isOwn={false} showSender={true} currentUserId="me"
      onShowActions={vi.fn()} onReply={vi.fn()} onQuickReact={vi.fn()} onShowReactions={vi.fn()}
    />);
    expect(screen.getByText('Vi valgte pizza')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(query).not.toHaveBeenCalled();
  });
});
