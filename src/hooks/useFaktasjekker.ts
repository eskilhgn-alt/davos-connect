/**
 * useFaktasjekker — manages conversation threads with the AI fact-checker
 * Threads are stored in the database and shared across all users.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface FaktaMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
}

export interface FaktaThread {
  id: string;
  title: string;
  messages: FaktaMessage[];
  createdAt: string;
  userId: string;
  userName?: string;
}

export function useFaktasjekker() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<FaktaThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  // Load all threads from DB
  const fetchThreads = useCallback(async () => {
    try {
      const { data: threadRows, error: thErr } = await supabase
        .from("faktasjekker_threads")
        .select("id, user_id, title, created_at")
        .order("created_at", { ascending: false });

      if (thErr) throw thErr;
      if (!threadRows?.length) {
        setThreads([]);
        setLoading(false);
        return;
      }

      // Get all user ids for display names
      const userIds = [...new Set(threadRows.map((t) => t.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nickname, full_name, email")
        .in("id", userIds);

      const nameMap: Record<string, string> = {};
      profiles?.forEach((p) => {
        nameMap[p.id] = p.nickname || p.full_name || p.email || "Ukjent";
      });

      // Get message counts per thread (we don't load all messages upfront for perf)
      const { data: msgCounts } = await supabase
        .from("faktasjekker_messages")
        .select("thread_id, id")
        .in("thread_id", threadRows.map((t) => t.id));

      const countMap: Record<string, number> = {};
      msgCounts?.forEach((m) => {
        countMap[m.thread_id] = (countMap[m.thread_id] || 0) + 1;
      });

      const mapped: FaktaThread[] = threadRows.map((t) => ({
        id: t.id,
        title: t.title,
        messages: [], // lazy loaded
        createdAt: t.created_at,
        userId: t.user_id,
        userName: nameMap[t.user_id] || "Ukjent",
        _msgCount: countMap[t.id] || 0,
      })) as any;

      setThreads(mapped);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // Load messages for a specific thread
  const loadThreadMessages = useCallback(async (threadId: string) => {
    const { data: msgs } = await supabase
      .from("faktasjekker_messages")
      .select("id, role, content, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (msgs) {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? { ...t, messages: msgs.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content })) }
            : t
        )
      );
    }
  }, []);

  const startNewThread = useCallback(() => {
    setActiveThreadId(null);
    setError(null);
  }, []);

  const openThread = useCallback(
    async (id: string) => {
      setActiveThreadId(id);
      setError(null);
      await loadThreadMessages(id);
    },
    [loadThreadMessages]
  );

  const deleteThread = useCallback(
    async (id: string) => {
      await supabase.from("faktasjekker_threads").delete().eq("id", id);
      setThreads((prev) => prev.filter((t) => t.id !== id));
      if (activeThreadId === id) setActiveThreadId(null);
    },
    [activeThreadId]
  );

  const send = useCallback(
    async (input: string) => {
      if (!user) return;
      setError(null);
      const userMsg: FaktaMessage = { role: "user", content: input };

      let threadId = activeThreadId;

      // Create or reuse thread
      if (!threadId) {
        const { data: newThread, error: insertErr } = await supabase
          .from("faktasjekker_threads")
          .insert({ user_id: user.id, title: input.slice(0, 60) })
          .select("id, created_at")
          .single();

        if (insertErr || !newThread) {
          setError("Kunne ikke opprette samtale");
          return;
        }
        threadId = newThread.id;
        setActiveThreadId(threadId);
        setThreads((prev) => [
          {
            id: threadId!,
            title: input.slice(0, 60),
            messages: [],
            createdAt: newThread.created_at,
            userId: user.id,
            userName: "Deg",
          },
          ...prev,
        ]);
      }

      // Insert user message
      const { data: userMsgRow } = await supabase
        .from("faktasjekker_messages")
        .insert({ thread_id: threadId, role: "user", content: input })
        .select("id")
        .single();

      // Update local state with user message
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? { ...t, messages: [...t.messages, { ...userMsg, id: userMsgRow?.id }] }
            : t
        )
      );

      // Get all messages for context
      const currentThread = threads.find((t) => t.id === threadId);
      const allMessages = [...(currentThread?.messages || []), userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      setStreaming(true);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const jwt = session?.access_token;
        if (!jwt) throw new Error("Du må være logget inn");

        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/faktasjekker`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${jwt}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ messages: allMessages }),
            signal: ac.signal,
          }
        );

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error || `Feil ${resp.status}`);
        }
        if (!resp.body) throw new Error("Ingen respons");

        // Insert empty assistant message in DB
        const { data: assistantRow } = await supabase
          .from("faktasjekker_messages")
          .insert({ thread_id: threadId, role: "assistant", content: "" })
          .select("id")
          .single();

        const assistantMsgId = assistantRow?.id;

        // Add empty assistant message locally
        setThreads((prev) =>
          prev.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: [...t.messages, { id: assistantMsgId, role: "assistant" as const, content: "" }],
                }
              : t
          )
        );

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let textBuffer = "";
        let assistantContent = "";

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
                setThreads((prev) =>
                  prev.map((t) => {
                    if (t.id !== threadId) return t;
                    const msgs = [...t.messages];
                    msgs[msgs.length - 1] = {
                      id: assistantMsgId,
                      role: "assistant",
                      content: assistantContent,
                    };
                    return { ...t, messages: msgs };
                  })
                );
              }
            } catch {
              /* partial JSON */
            }
          }
        }

        // Save final content to DB
        if (assistantMsgId && assistantContent) {
          await supabase
            .from("faktasjekker_messages")
            .update({ content: assistantContent })
            .eq("id", assistantMsgId);
        }
      } catch (e: any) {
        if (e.name !== "AbortError") {
          setError(e.message || "Noe gikk galt");
        }
      } finally {
        setStreaming(false);
      }
    },
    [activeThreadId, threads, user]
  );

  // Get message count for a thread (from the fetched data)
  const getMessageCount = useCallback(
    (threadId: string) => {
      const t = threads.find((th) => th.id === threadId) as any;
      return t?.messages?.length || t?._msgCount || 0;
    },
    [threads]
  );

  return {
    threads,
    activeThread,
    activeThreadId,
    streaming,
    error,
    loading,
    send,
    startNewThread,
    openThread,
    deleteThread,
    getMessageCount,
    userId: user?.id,
  };
}
