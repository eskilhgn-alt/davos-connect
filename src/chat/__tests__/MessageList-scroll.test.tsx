import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/chat/types";
import { MessageList } from "@/chat/MessageList";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "me" } }),
}));

vi.mock("@/chat/useMarkAsRead", () => ({
  useMarkAsRead: () => ({ markAsRead: vi.fn() }),
}));

vi.mock("@/chat/useReadReceipts", () => ({
  useReadReceipts: () => new Map<string, number>(),
}));

vi.mock("@/chat/store", () => ({
  chatStore: {
    loadEarlier: vi.fn(async () => ({ hasMore: false })),
    ensureMessageLoaded: vi.fn(async () => undefined),
    subscribeToChannelStatus: vi.fn(() => () => undefined),
    toggleReaction: vi.fn(),
    setReplyTo: vi.fn(),
    discardFailed: vi.fn(),
    deleteMessage: vi.fn(),
  },
}));

vi.mock("@/chat/MessageItem", () => ({
  MessageItem: ({ message }: { message: Message }) => (
    <div data-testid="message-row">{message.text}</div>
  ),
}));

const message = (id: string, createdAt: number): Message => ({
  id,
  createdAt,
  text: id,
  senderName: "Test",
  senderId: "other",
  attachments: [],
  deliveryState: "sent",
});

describe("MessageList newest-message anchoring", () => {
  let scrollHeight: ReturnType<typeof vi.spyOn>;
  let clientHeight: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scrollHeight = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(1_000);
    clientHeight = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
  });

  afterEach(() => {
    scrollHeight.mockRestore();
    clientHeight.mockRestore();
  });

  it("renders chronologically and opens at the newest message", () => {
    render(
      <MessageList
        messages={[message("newest", 30), message("oldest", 10), message("middle", 20)]}
        currentUserId="me"
        composerHeight={80}
        viewportHeight={700}
        isTyping={false}
      />,
    );

    expect(screen.getAllByTestId("message-row").map((row) => row.textContent)).toEqual([
      "oldest",
      "middle",
      "newest",
    ]);
    expect(screen.getByTestId("message-scroll").scrollTop).toBe(700);
  });

  it("does not pull the user back down after an intentional upward scroll", () => {
    const { rerender } = render(
      <MessageList
        messages={[message("oldest", 10), message("newest", 20)]}
        currentUserId="me"
        composerHeight={80}
        viewportHeight={700}
        isTyping={false}
      />,
    );
    const viewport = screen.getByTestId("message-scroll");

    fireEvent.pointerDown(viewport);
    viewport.scrollTop = 200;
    fireEvent.scroll(viewport);

    rerender(
      <MessageList
        messages={[message("oldest", 10), message("newest", 20), message("incoming", 30)]}
        currentUserId="me"
        composerHeight={80}
        viewportHeight={700}
        isTyping={false}
      />,
    );
    expect(viewport.scrollTop).toBe(200);
    expect(screen.getByRole("button", { name: "Bla til nyeste meldinger" })).toBeInTheDocument();
  });
});
