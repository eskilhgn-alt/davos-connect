import * as React from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe2,
  History,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import {
  type FaktaMessage,
  type FaktaStage,
  type FaktaThread,
  type FaktaVerdict,
  useFaktasjekker,
} from "@/hooks/useFaktasjekker";
import { cn } from "@/lib/utils";

const VERDICTS: Record<FaktaVerdict, { label: string; className: string }> = {
  sant: {
    label: "Sant",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  hovedsakelig_sant: {
    label: "Hovedsakelig sant",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  misvisende: {
    label: "Misvisende",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  hovedsakelig_feil: {
    label: "Hovedsakelig feil",
    className: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  },
  feil: {
    label: "Feil",
    className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  },
  ikke_verifiserbart: {
    label: "Ikke verifiserbart",
    className: "border-border bg-muted text-muted-foreground",
  },
};

const PROGRESS_STEPS: Array<{ stage: FaktaStage; label: string }> = [
  { stage: "searching", label: "Søker etter kilder" },
  { stage: "comparing", label: "Sammenligner informasjon" },
  { stage: "writing", label: "Skriver konklusjon" },
];

function cleanResultContent(content: string): string {
  return content
    .replace(/^DOM:\s*[^\n]+\n?/i, "")
    .replace(/^SIKKERHET:\s*\d{1,3}\s*\n?/i, "")
    .trim();
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const ProgressCard: React.FC<{ stage: FaktaStage | null }> = ({ stage }) => {
  const activeIndex = Math.max(
    0,
    PROGRESS_STEPS.findIndex((item) => item.stage === stage),
  );

  return (
    <div className="rounded-2xl rounded-bl-md border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Loader2 size={16} className="animate-spin text-primary" />
        <p className="text-sm font-semibold text-foreground">Faktasjekker påstanden</p>
      </div>
      <div className="space-y-2">
        {PROGRESS_STEPS.map((item, index) => {
          const completed = index < activeIndex;
          const active = index === activeIndex;
          return (
            <div
              key={item.stage}
              className={cn(
                "flex items-center gap-2 text-xs transition-colors",
                active ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "h-5 w-5 rounded-full border flex items-center justify-center",
                  completed && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-primary",
                )}
              >
                {completed ? <Check size={11} /> : index + 1}
              </span>
              {item.label}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        GPT-5.6 Sol bruker ekstra høy resonnering og aktivt nettsøk. Dette kan ta litt tid.
      </p>
    </div>
  );
};

const ResultCard: React.FC<{ message: FaktaMessage }> = ({ message }) => {
  const verdict = message.verdict ? VERDICTS[message.verdict] : VERDICTS.ikke_verifiserbart;
  return (
    <article className="rounded-2xl rounded-bl-md border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/25">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", verdict.className)}>
            {verdict.label}
          </span>
          {message.confidence !== null && (
            <span className="text-[11px] text-muted-foreground">
              {message.confidence}% sikkerhet
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
            <ShieldCheck size={11} />
            {message.model ?? "gpt-5.6-sol"}
          </span>
        </div>
      </div>

      <div className="p-4">
        <div className="prose prose-sm max-w-none text-foreground [&_p]:text-sm [&_p]:leading-relaxed [&_li]:text-sm [&_strong]:text-foreground [&_a]:text-primary">
          <ReactMarkdown
            components={{
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {cleanResultContent(message.content)}
          </ReactMarkdown>
        </div>
      </div>

      {message.sources.length > 0 && (
        <div className="border-t border-border p-4 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Globe2 size={13} />
            Kilder
          </div>
          <div className="grid gap-2">
            {message.sources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-border bg-muted/30 p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground line-clamp-2">{source.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {sourceHost(source.url)}
                  </p>
                </div>
                <ExternalLink size={13} className="shrink-0 text-muted-foreground" />
              </a>
            ))}
          </div>
        </div>
      )}
    </article>
  );
};

const ThreadRow: React.FC<{
  thread: FaktaThread;
  own: boolean;
  onOpen: () => void;
  onDelete: () => void;
}> = ({ thread, own, onOpen, onDelete }) => (
  <div className="flex items-center border-b border-border last:border-0">
    <button
      type="button"
      onClick={onOpen}
      className="min-w-0 flex-1 text-left px-4 py-3.5 hover:bg-muted/50 active:bg-muted transition-colors"
    >
      <p className="text-sm font-medium text-foreground truncate">{thread.title}</p>
      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
        <User size={10} />
        <span>{thread.userName || "Ukjent"}</span>
        <span>·</span>
        <span>{thread.messageCount} meldinger</span>
        {thread.visibility === "group" && (
          <>
            <span>·</span>
            <Share2 size={10} />
            <span>Delt</span>
          </>
        )}
      </div>
    </button>
    {own && (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        className="tap-target flex items-center justify-center text-muted-foreground hover:text-destructive"
        aria-label="Slett faktasjekk"
      >
        <Trash2 size={16} />
      </button>
    )}
  </div>
);

export const FaktasjekkerScreen: React.FC = () => {
  const {
    threads,
    activeThread,
    activeThreadId,
    streaming,
    stage,
    error,
    loading,
    send,
    startNewThread,
    openThread,
    deleteThread,
    shareThread,
    userId,
  } = useFaktasjekker();

  const [input, setInput] = React.useState("");
  const [view, setView] = React.useState<"search" | "chat" | "history">("search");
  const [sharing, setSharing] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (activeThreadId) setView("chat");
  }, [activeThreadId]);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [activeThread?.messages, stage]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = input.trim();
    if (!value || streaming) return;
    setInput("");
    void send(value);
  };

  const newCheck = () => {
    startNewThread();
    setView("search");
    setInput("");
  };

  const removeThread = (thread: FaktaThread) => {
    if (window.confirm(`Slette faktasjekken «${thread.title}»?`)) {
      void deleteThread(thread.id);
    }
  };

  if (view === "search" && !activeThreadId) {
    return (
      <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
        <AppHeader
          title="Faktasjekk"
          subtitle="GPT-5.6 Sol · nettsøk"
          leftAction={<BackButton fallbackPath="/mer" />}
          rightAction={
            threads.length ? (
              <button
                type="button"
                onClick={() => setView("history")}
                className="tap-target flex items-center justify-center text-muted-foreground"
                aria-label="Vis historikk"
              >
                <History size={18} />
              </button>
            ) : undefined
          }
        />

        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex flex-col items-center px-6 pt-12 pb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
              <Sparkles size={30} className="text-primary" />
            </div>
            <h2 className="font-heading text-xl font-bold text-foreground text-center">
              Hva vil du faktasjekke?
            </h2>
            <p className="text-sm text-muted-foreground text-center mt-2 mb-7 max-w-sm">
              Påstanden undersøkes mot oppdaterte nettkilder. Du får en dom,
              nyansering, sikkerhetsgrad og klikkbare kilder.
            </p>

            <form onSubmit={submit} className="w-full max-w-md">
              <label htmlFor="fact-check-input" className="sr-only">Påstand</label>
              <div className="relative">
                <Search size={18} className="absolute left-4 top-4 text-muted-foreground" />
                <textarea
                  id="fact-check-input"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Skriv påstanden du vil undersøke…"
                  rows={4}
                  maxLength={4000}
                  className="w-full resize-none rounded-2xl border border-border bg-muted/30 pl-11 pr-4 pt-3.5 pb-14 text-base text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className={cn(
                    "absolute bottom-3 right-3 rounded-xl px-3 py-2 flex items-center gap-2 text-sm font-semibold transition-colors",
                    input.trim()
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  Faktasjekk
                  <Send size={15} />
                </button>
              </div>
            </form>
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : threads.length > 0 ? (
            <section className="px-4 pb-8">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Nylige faktasjekker
                </h3>
                <button
                  type="button"
                  onClick={() => setView("history")}
                  className="text-xs font-medium text-primary"
                >
                  Se alle
                </button>
              </div>
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                {threads.slice(0, 3).map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => void openThread(thread.id)}
                    className="w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-muted/40"
                  >
                    <p className="text-sm font-medium text-foreground truncate">{thread.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {thread.userName} · {new Date(thread.updatedAt).toLocaleDateString("nb-NO")}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {error && <p className="px-6 pb-6 text-center text-sm text-destructive">{error}</p>}
        </div>
      </div>
    );
  }

  if (view === "history") {
    return (
      <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
        <AppHeader
          title="Faktasjekker"
          subtitle="Dine og ferdige delte resultater"
          leftAction={
            <button type="button" onClick={() => setView("search")} className="tap-target -ml-2 flex items-center justify-center">
              <ArrowLeft size={20} />
            </button>
          }
          rightAction={
            <button type="button" onClick={newCheck} className="tap-target -mr-2 flex items-center justify-center" aria-label="Ny faktasjekk">
              <Plus size={20} />
            </button>
          }
        />
        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}
        >
          {threads.length ? (
            <div className="divide-y divide-border">
              {threads.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  own={thread.userId === userId}
                  onOpen={() => void openThread(thread.id)}
                  onDelete={() => removeThread(thread)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <MessageCircle size={32} className="mb-3 opacity-50" />
              <p className="text-sm">Ingen faktasjekker ennå</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const ownThread = activeThread?.userId === userId;
  const completed = activeThread?.status === "completed";

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader
        title="Faktasjekk"
        subtitle={activeThread ? `${activeThread.userName} · ${activeThread.model ?? "GPT-5.6 Sol"}` : "GPT-5.6 Sol"}
        leftAction={
          <button type="button" onClick={newCheck} className="tap-target -ml-2 flex items-center justify-center">
            <ArrowLeft size={20} />
          </button>
        }
        rightAction={
          <button type="button" onClick={newCheck} className="tap-target -mr-2 flex items-center justify-center" aria-label="Ny faktasjekk">
            <Plus size={20} />
          </button>
        }
      />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {activeThread?.messages.map((message) => (
          <div
            key={message.id}
            className={cn("max-w-[94%]", message.role === "user" ? "ml-auto" : "mr-auto")}
          >
            {message.role === "user" ? (
              <div className="rounded-2xl rounded-br-md bg-primary px-4 py-3 text-primary-foreground">
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
            ) : message.status === "processing" ? (
              <ProgressCard stage={stage?.stage ?? null} />
            ) : message.status === "failed" ? (
              <div className="rounded-2xl rounded-bl-md border border-destructive/30 bg-destructive/5 px-4 py-3">
                <p className="text-sm text-destructive">Faktasjekken ble ikke fullført.</p>
              </div>
            ) : (
              <ResultCard message={message} />
            )}
          </div>
        ))}

        {completed && ownThread && (
          <button
            type="button"
            disabled={sharing}
            onClick={async () => {
              if (!activeThread) return;
              setSharing(true);
              await shareThread(activeThread.id, activeThread.visibility !== "group");
              setSharing(false);
            }}
            className="w-full rounded-xl border border-border bg-muted/30 px-4 py-3 flex items-center justify-between text-sm text-foreground"
          >
            <span className="flex items-center gap-2">
              {activeThread.visibility === "group" ? <Share2 size={15} /> : <Lock size={15} />}
              {activeThread.visibility === "group"
                ? "Delt med gjengen"
                : "Privat – del ferdig resultat"}
            </span>
            {sharing ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
          </button>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {completed && (
          <p className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
            <Clock size={10} />
            Kontrollert {new Date(activeThread.updatedAt).toLocaleString("nb-NO")}
          </p>
        )}
      </div>

      {(!activeThread || ownThread) && (
        <div
          className="border-t border-border bg-background px-4 py-3"
          style={{ paddingBottom: "calc(var(--bottom-nav-h-effective) + 12px)" }}
        >
          <form onSubmit={submit} className="flex items-end gap-2">
            <label htmlFor="fact-check-followup" className="sr-only">Oppfølgingsspørsmål</label>
            <textarea
              id="fact-check-followup"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Still et oppfølgingsspørsmål…"
              rows={1}
              maxLength={4000}
              disabled={streaming}
              className="min-h-11 max-h-28 flex-1 resize-none rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-base text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              className={cn(
                "h-11 w-11 shrink-0 rounded-xl flex items-center justify-center",
                input.trim() && !streaming
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
              aria-label="Send"
            >
              {streaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default FaktasjekkerScreen;
