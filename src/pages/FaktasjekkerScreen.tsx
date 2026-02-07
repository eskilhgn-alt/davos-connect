/**
 * FaktasjekkerScreen — AI fact-checker with conversation history
 * Features: search bar, streaming responses, thread history, continue conversations
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useFaktasjekker, FaktaThread } from "@/hooks/useFaktasjekker";
import ReactMarkdown from "react-markdown";
import {
  Search,
  Send,
  ArrowLeft,
  Clock,
  Trash2,
  Plus,
  Loader2,
  Sparkles,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const FaktasjekkerScreen: React.FC = () => {
  const {
    threads,
    activeThread,
    activeThreadId,
    streaming,
    error,
    send,
    startNewThread,
    openThread,
    deleteThread,
  } = useFaktasjekker();

  const [input, setInput] = React.useState("");
  const [view, setView] = React.useState<"search" | "chat" | "history">("search");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll on new content
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeThread?.messages]);

  // Switch to chat view when thread becomes active
  React.useEffect(() => {
    if (activeThreadId) setView("chat");
  }, [activeThreadId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    send(input.trim());
    setInput("");
  };

  const handleNewChat = () => {
    startNewThread();
    setView("search");
    setInput("");
  };

  const handleOpenThread = (thread: FaktaThread) => {
    openThread(thread.id);
    setView("chat");
  };

  // Search/landing view
  if (view === "search" && !activeThreadId) {
    return (
      <div
        className="flex flex-col overflow-hidden bg-background"
        style={{ height: "var(--app-height)" }}
      >
        <AppHeader
          title="Faktasjekker"
          subtitle="Spør AI hva som helst"
          leftAction={<BackButton fallbackPath="/hjem" />}
        />

        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{
            paddingBottom: "var(--bottom-nav-h-effective)",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div className="flex flex-col items-center justify-center px-6 pt-16 pb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <Sparkles size={32} className="text-primary" />
            </div>

            <h2 className="font-heading text-xl font-bold text-foreground mb-2">
              Hva lurer du på?
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-8 max-w-xs">
              Spør om fakta, statistikk, eller hva som helst. AI-en svarer basert på oppdatert kunnskap.
            </p>

            {/* Search bar */}
            <form onSubmit={handleSubmit} className="w-full max-w-md">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Skriv et spørsmål..."
                  className="w-full pl-11 pr-12 py-3.5 rounded-xl border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  style={{ fontSize: 16 }}
                />
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors",
                    input.trim()
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <Send size={16} />
                </button>
              </div>
            </form>
          </div>

          {/* History section */}
          {threads.length > 0 && (
            <div className="px-4 pb-8">
              <button
                onClick={() => setView("history")}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3 hover:text-foreground transition-colors"
              >
                <Clock size={14} />
                Tidligere spørsmål ({threads.length})
              </button>
              <div className="space-y-2">
                {threads.slice(0, 3).map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => handleOpenThread(thread)}
                    className="w-full text-left px-4 py-3 rounded-lg border border-border bg-card hover:bg-muted/50 active:bg-muted transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground truncate">
                      {thread.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {thread.messages.length} meldinger
                    </p>
                  </button>
                ))}
                {threads.length > 3 && (
                  <button
                    onClick={() => setView("history")}
                    className="w-full text-center py-2 text-xs text-primary font-medium"
                  >
                    Se alle →
                  </button>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive text-center px-4">{error}</p>
          )}
        </div>
      </div>
    );
  }

  // History view
  if (view === "history") {
    return (
      <div
        className="flex flex-col overflow-hidden bg-background"
        style={{ height: "var(--app-height)" }}
      >
        <AppHeader
          title="Historikk"
          subtitle={`${threads.length} samtaler`}
          leftAction={
            <button onClick={() => setView("search")} className="p-2 -ml-2">
              <ArrowLeft size={20} className="text-foreground" />
            </button>
          }
        />

        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{
            paddingBottom: "var(--bottom-nav-h-effective)",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div className="divide-y divide-border">
            {threads.map((thread) => (
              <div key={thread.id} className="flex items-center">
                <button
                  onClick={() => handleOpenThread(thread)}
                  className="flex-1 text-left px-4 py-3.5 hover:bg-muted/50 active:bg-muted transition-colors"
                >
                  <p className="text-sm font-medium text-foreground truncate">
                    {thread.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {thread.messages.length} meldinger ·{" "}
                    {new Date(thread.createdAt).toLocaleDateString("nb-NO")}
                  </p>
                </button>
                <button
                  onClick={() => deleteThread(thread.id)}
                  className="p-3 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          {threads.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <MessageCircle size={32} className="mb-3 opacity-50" />
              <p className="text-sm">Ingen samtaler enda</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Chat view
  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Faktasjekker"
        leftAction={
          <button onClick={handleNewChat} className="p-2 -ml-2">
            <ArrowLeft size={20} className="text-foreground" />
          </button>
        }
        rightAction={
          <button onClick={handleNewChat} className="p-2 -mr-2">
            <Plus size={20} className="text-foreground" />
          </button>
        }
      />

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {activeThread?.messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[90%]",
              msg.role === "user" ? "ml-auto" : "mr-auto"
            )}
          >
            {msg.role === "user" ? (
              <div className="bg-primary text-primary-foreground px-4 py-3 rounded-2xl rounded-br-md">
                <p className="text-sm">{msg.content}</p>
              </div>
            ) : (
              <div className="bg-muted/50 border border-border px-4 py-3 rounded-2xl rounded-bl-md">
                {msg.content ? (
                  <div className="prose prose-sm max-w-none text-foreground [&_p]:text-sm [&_li]:text-sm [&_strong]:text-foreground [&_a]:text-primary">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-xs">Tenker...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div
        className="border-t border-border px-4 py-3 bg-background"
        style={{ paddingBottom: "calc(var(--bottom-nav-h-effective) + 12px)" }}
      >
        {error && (
          <p className="text-xs text-destructive mb-2">{error}</p>
        )}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Følg opp med et spørsmål..."
            disabled={streaming}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
            style={{ fontSize: 16 }}
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className={cn(
              "p-2.5 rounded-xl transition-colors flex-shrink-0",
              input.trim() && !streaming
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {streaming ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default FaktasjekkerScreen;
