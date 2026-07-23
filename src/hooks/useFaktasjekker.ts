import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { parseSseJson, takeSseFrames } from "@/features/fact-checker/sse";

export type FaktaVerdict =
  | "sant"
  | "hovedsakelig_sant"
  | "misvisende"
  | "hovedsakelig_feil"
  | "feil"
  | "ikke_verifiserbart";

export type FaktaStage = "searching" | "comparing" | "writing";

export interface FaktaSource {
  url: string;
  title: string;
}

export interface FaktaMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "processing" | "completed" | "failed";
  verdict: FaktaVerdict | null;
  confidence: number | null;
  sources: FaktaSource[];
  model: string | null;
  createdAt: string;
}

export interface FaktaThread {
  id: string;
  title: string;
  messages: FaktaMessage[];
  createdAt: string;
  updatedAt: string;
  userId: string;
  userName?: string;
  status: "draft" | "processing" | "completed" | "failed";
  visibility: "private" | "group";
  model: string | null;
  messageCount: number;
}

interface ThreadEvent {
  threadId: string;
  userMessageId: string | null;
  assistantMessageId: string;
  createdAt: string;
}

interface StageEvent {
  stage: FaktaStage;
  label: string;
}

interface FinalEvent {
  messageId: string;
  content: string;
  verdict: FaktaVerdict;
  confidence: number;
  sources: FaktaSource[];
  model: string;
  createdAt: string;
}

interface ErrorEvent {
  message: string;
  code?: string;
}

function toSourceArray(value: unknown): FaktaSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      item
      && typeof item === "object"
      && "url" in item
      && typeof item.url === "string"
    ) {
      return [{
        url: item.url,
        title: "title" in item && typeof item.title === "string" ? item.title : item.url,
      }];
    }
    return [];
  });
}

function newAssistantMessage(event: ThreadEvent): FaktaMessage {
  return {
    id: event.assistantMessageId,
    role: "assistant",
    content: "",
    status: "processing",
    verdict: null,
    confidence: null,
    sources: [],
    model: "gpt-5.6-sol",
    createdAt: event.createdAt,
  };
}

export function useFaktasjekker() {
  const { user, profile } = useAuth();
  const [threads, setThreads] = useState<FaktaThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [stage, setStage] = useState<StageEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, threads],
  );

  const loadThreadMessages = useCallback(async (threadId: string) => {
    const { data, error: messageError } = await supabase
      .from("faktasjekker_messages")
      .select(
        "id, role, content, status, verdict, confidence, sources, model, created_at",
      )
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (messageError) throw messageError;

    const messages: FaktaMessage[] = (data ?? []).map((message) => ({
      id: message.id,
      role: message.role as "user" | "assistant",
      content: message.content,
      status: message.status as FaktaMessage["status"],
      verdict: message.verdict as FaktaVerdict | null,
      confidence: message.confidence,
      sources: toSourceArray(message.sources),
      model: message.model,
      createdAt: message.created_at,
    }));

    setThreads((previous) =>
      previous.map((thread) =>
        thread.id === threadId
          ? { ...thread, messages, messageCount: messages.length }
          : thread,
      ),
    );
  }, []);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    try {
      const { data: threadRows, error: threadError } = await supabase
        .from("faktasjekker_threads")
        .select(
          "id, user_id, title, created_at, updated_at, status, visibility, model",
        )
        .order("updated_at", { ascending: false });
      if (threadError) throw threadError;

      const userIds = [...new Set((threadRows ?? []).map((thread) => thread.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase
            .from("profiles")
            .select("id, nickname, full_name")
            .in("id", userIds)
        : { data: [] };

      const nameMap = new Map(
        (profiles ?? []).map((item) => [
          item.id,
          item.nickname || item.full_name || "Ukjent",
        ]),
      );

      const threadIds = (threadRows ?? []).map((thread) => thread.id);
      const { data: messageRows } = threadIds.length
        ? await supabase
            .from("faktasjekker_messages")
            .select("id, thread_id")
            .in("thread_id", threadIds)
        : { data: [] };
      const countMap = new Map<string, number>();
      for (const message of messageRows ?? []) {
        countMap.set(message.thread_id, (countMap.get(message.thread_id) ?? 0) + 1);
      }

      setThreads(
        (threadRows ?? []).map((thread) => ({
          id: thread.id,
          title: thread.title,
          messages: [],
          createdAt: thread.created_at,
          updatedAt: thread.updated_at,
          userId: thread.user_id,
          userName: thread.user_id === user?.id
            ? "Deg"
            : nameMap.get(thread.user_id) ?? "Ukjent",
          status: thread.status as FaktaThread["status"],
          visibility: thread.visibility as FaktaThread["visibility"],
          model: thread.model,
          messageCount: countMap.get(thread.id) ?? 0,
        })),
      );
    } catch (caught) {
      console.error("Kunne ikke laste faktasjekker", caught);
      setError("Kunne ikke laste faktasjekk-historikken");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const startNewThread = useCallback(() => {
    abortRef.current?.abort();
    setActiveThreadId(null);
    setStage(null);
    setError(null);
  }, []);

  const openThread = useCallback(
    async (id: string) => {
      setActiveThreadId(id);
      setStage(null);
      setError(null);
      try {
        await loadThreadMessages(id);
      } catch (caught) {
        console.error("Kunne ikke laste faktasjekk", caught);
        setError("Kunne ikke laste faktasjekken");
      }
    },
    [loadThreadMessages],
  );

  const deleteThread = useCallback(
    async (id: string) => {
      const { error: deleteError } = await supabase
        .from("faktasjekker_threads")
        .delete()
        .eq("id", id);
      if (deleteError) {
        setError("Kunne ikke slette faktasjekken");
        return;
      }
      setThreads((previous) => previous.filter((thread) => thread.id !== id));
      if (activeThreadId === id) setActiveThreadId(null);
    },
    [activeThreadId],
  );

  const shareThread = useCallback(async (id: string, shared: boolean) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setError("Du må være logget inn");
      return false;
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/faktasjekker`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "share", thread_id: id, shared }),
      },
    );
    const result = await response.json().catch(() => ({})) as {
      error?: string;
      visibility?: "private" | "group";
    };
    if (!response.ok || !result.visibility) {
      setError(result.error ?? "Kunne ikke endre deling");
      return false;
    }

    setThreads((previous) =>
      previous.map((thread) =>
        thread.id === id ? { ...thread, visibility: result.visibility! } : thread,
      ),
    );
    return true;
  }, []);

  const send = useCallback(
    async (rawInput: string) => {
      const input = rawInput.trim();
      if (!user || !input || streaming) return;

      const requestId = crypto.randomUUID();
      const ac = new AbortController();
      abortRef.current?.abort();
      abortRef.current = ac;
      setStreaming(true);
      setError(null);
      setStage({ stage: "searching", label: "Søker etter kilder" });

      let resolvedThreadId = activeThreadId;
      let finalReceived = false;
      let streamError: string | null = null;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Du må være logget inn");

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/faktasjekker`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              action: "check",
              thread_id: activeThreadId,
              claim: input,
              request_id: requestId,
            }),
            signal: ac.signal,
          },
        );

        if (!response.ok) {
          const details = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(details.error ?? `Faktasjekk feilet (${response.status})`);
        }
        if (!response.body) throw new Error("Faktasjekk ga ingen respons");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let textBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          textBuffer += decoder.decode(value, { stream: true });
          const parsed = takeSseFrames(textBuffer);
          textBuffer = parsed.rest;

          for (const event of parsed.events) {
            if (event.event === "thread") {
              const payload = parseSseJson<ThreadEvent>(event.data);
              if (!payload) continue;
              resolvedThreadId = payload.threadId;
              setActiveThreadId(payload.threadId);

              setThreads((previous) => {
                const found = previous.find((thread) => thread.id === payload.threadId);
                const userMessage: FaktaMessage | null = payload.userMessageId
                  ? {
                      id: payload.userMessageId,
                      role: "user",
                      content: input,
                      status: "completed",
                      verdict: null,
                      confidence: null,
                      sources: [],
                      model: null,
                      createdAt: new Date().toISOString(),
                    }
                  : null;
                const assistantMessage = newAssistantMessage(payload);

                if (!found) {
                  return [
                    {
                      id: payload.threadId,
                      title: input.slice(0, 80),
                      messages: userMessage
                        ? [userMessage, assistantMessage]
                        : [assistantMessage],
                      createdAt: payload.createdAt,
                      updatedAt: payload.createdAt,
                      userId: user.id,
                      userName: profile?.nickname || profile?.full_name || "Deg",
                      status: "processing",
                      visibility: "private",
                      model: "gpt-5.6-sol",
                      messageCount: userMessage ? 2 : 1,
                    },
                    ...previous,
                  ];
                }

                const withoutPlaceholder = found.messages.filter(
                  (message) => message.id !== payload.assistantMessageId,
                );
                const additions = userMessage
                  ? [userMessage, assistantMessage]
                  : [assistantMessage];
                return previous.map((thread) =>
                  thread.id === payload.threadId
                    ? {
                        ...thread,
                        messages: [...withoutPlaceholder, ...additions],
                        status: "processing",
                        model: "gpt-5.6-sol",
                        messageCount: withoutPlaceholder.length + additions.length,
                      }
                    : thread,
                );
              });
            }

            if (event.event === "stage") {
              const payload = parseSseJson<StageEvent>(event.data);
              if (payload) setStage(payload);
            }

            if (event.event === "final") {
              const payload = parseSseJson<FinalEvent>(event.data);
              if (!payload || !resolvedThreadId) continue;
              finalReceived = true;
              setThreads((previous) =>
                previous.map((thread) =>
                  thread.id === resolvedThreadId
                    ? {
                        ...thread,
                        status: "completed",
                        model: payload.model,
                        updatedAt: new Date().toISOString(),
                        messages: thread.messages.map((message) =>
                          message.id === payload.messageId
                            ? {
                                ...message,
                                content: payload.content,
                                status: "completed",
                                verdict: payload.verdict,
                                confidence: payload.confidence,
                                sources: payload.sources,
                                model: payload.model,
                              }
                            : message,
                        ),
                      }
                    : thread,
                ),
              );
            }

            if (event.event === "error") {
              const payload = parseSseJson<ErrorEvent>(event.data);
              streamError = payload?.message ?? "Faktasjekken kunne ikke fullføres";
            }
          }
        }

        if (streamError) throw new Error(streamError);
        if (!finalReceived) throw new Error("Faktasjekken ble avbrutt før den var ferdig");
        if (resolvedThreadId) await loadThreadMessages(resolvedThreadId);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        const message = caught instanceof Error ? caught.message : "Noe gikk galt";
        setError(message);
        if (resolvedThreadId) {
          setThreads((previous) =>
            previous.map((thread) =>
              thread.id === resolvedThreadId
                ? {
                    ...thread,
                    status: "failed",
                    messages: thread.messages.map((item) =>
                      item.status === "processing" ? { ...item, status: "failed" } : item,
                    ),
                  }
                : thread,
            ),
          );
        }
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
        setStreaming(false);
        setStage(null);
      }
    },
    [
      activeThreadId,
      loadThreadMessages,
      profile?.full_name,
      profile?.nickname,
      streaming,
      user,
    ],
  );

  return {
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
    userId: user?.id,
    refresh: fetchThreads,
  };
}
