export interface ServerSentEvent {
  event: string;
  data: string;
}

/**
 * Pulls complete SSE frames out of a text buffer. The unfinished tail is
 * returned so callers can prepend it to the next streamed chunk.
 */
export function takeSseFrames(input: string): {
  events: ServerSentEvent[];
  rest: string;
} {
  const normalized = input.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  const events = parts.flatMap((frame) => {
    let event = "message";
    const data: string[] = [];

    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }

    return data.length ? [{ event, data: data.join("\n") }] : [];
  });

  return { events, rest };
}

export function parseSseJson<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}
