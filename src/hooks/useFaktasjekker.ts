/**
 * useFaktasjekker — manages conversation threads with the AI fact-checker
 */
import { useState, useCallback, useRef } from "react";

export interface FaktaMessage {
  role: "user" | "assistant";
  content: string;
}

export interface FaktaThread {
  id: string;
  title: string;
  messages: FaktaMessage[];
  createdAt: number;
}

const STORAGE_KEY = "faktasjekker-threads";
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/faktasjekker`;

function loadThreads(): FaktaThread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveThreads(threads: FaktaThread[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(threads)); } catch { /* */ }
}

export function useFaktasjekker() {
  const [threads, setThreads] = useState<FaktaThread[]>(loadThreads);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  const persist = useCallback((next: FaktaThread[]) => {
    setThreads(next);
    saveThreads(next);
  }, []);

  const startNewThread = useCallback(() => {
    setActiveThreadId(null);
    setError(null);
  }, []);

  const openThread = useCallback((id: string) => {
    setActiveThreadId(id);
    setError(null);
  }, []);

  const deleteThread = useCallback((id: string) => {
    const next = threads.filter((t) => t.id !== id);
    persist(next);
    if (activeThreadId === id) setActiveThreadId(null);
  }, [threads, activeThreadId, persist]);

  const send = useCallback(async (input: string) => {
    setError(null);
    const userMsg: FaktaMessage = { role: "user", content: input };

    // Create or reuse thread
    let threadId = activeThreadId;
    let currentThreads = [...threads];

    if (!threadId) {
      threadId = crypto.randomUUID();
      const newThread: FaktaThread = {
        id: threadId,
        title: input.slice(0, 60),
        messages: [userMsg],
        createdAt: Date.now(),
      };
      currentThreads = [newThread, ...currentThreads];
      setActiveThreadId(threadId);
    } else {
      currentThreads = currentThreads.map((t) =>
        t.id === threadId ? { ...t, messages: [...t.messages, userMsg] } : t
      );
    }
    persist(currentThreads);

    // Get all messages for context
    const thread = currentThreads.find((t) => t.id === threadId)!;
    const allMessages = thread.messages;

    setStreaming(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages }),
        signal: ac.signal,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Feil ${resp.status}`);
      }
      if (!resp.body) throw new Error("Ingen respons");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantContent = "";

      // Add empty assistant message
      currentThreads = currentThreads.map((t) =>
        t.id === threadId
          ? { ...t, messages: [...t.messages, { role: "assistant" as const, content: "" }] }
          : t
      );
      persist(currentThreads);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIdx);
          textBuffer = textBuffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              currentThreads = currentThreads.map((t) => {
                if (t.id !== threadId) return t;
                const msgs = [...t.messages];
                msgs[msgs.length - 1] = { role: "assistant", content: assistantContent };
                return { ...t, messages: msgs };
              });
              persist(currentThreads);
            }
          } catch { /* partial JSON */ }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setError(e.message || "Noe gikk galt");
      }
    } finally {
      setStreaming(false);
    }
  }, [activeThreadId, threads, persist]);

  return {
    threads,
    activeThread,
    activeThreadId,
    streaming,
    error,
    send,
    startNewThread,
    openThread,
    deleteThread,
  };
}
