export interface TimelapseClip {
  src: string;
  date: string;
  period: "daily" | "weekly" | "monthly" | "other";
}

const cache = new Map<string, { clip: TimelapseClip; expires: number }>();
const MEDIA_HOSTS = new Set(["data.skaping.com", "skaping.s3.gra.io.cloud.ovh.net"]);

/** Only provider-returned MP4 URLs. No invented latest.mp4 path or fixed date. */
export function parseTimelapseResponse(value: unknown): TimelapseClip {
  const data = value as { medias?: Array<{ src?: unknown; date?: unknown; meta?: { timelapse?: { timelapse?: { name?: string } } } }> };
  const clips: TimelapseClip[] = [];
  for (const media of Array.isArray(data?.medias) ? data.medias : []) {
    if (!media || typeof media.src !== "string" || typeof media.date !== "string" || !/^\d{4}-\d{2}-\d{2} /.test(media.date)) continue;
    try {
      const url = new URL(media.src);
      if (!MEDIA_HOSTS.has(url.hostname) || url.port || url.username || url.password || !/^https?:$/.test(url.protocol) || !/\.mp4$/i.test(url.pathname)) continue;
      url.protocol = "https:";
      const name = media.meta?.timelapse?.timelapse?.name;
      clips.push({ src: url.href, date: media.date.slice(0, 10), period: name === "daily" || name === "weekly" || name === "monthly" ? name : "other" });
    } catch { /* Ignore malformed provider records, never fetch arbitrary URLs. */ }
  }
  clips.sort((a, b) => b.date.localeCompare(a.date) || Number(b.period === "daily") - Number(a.period === "daily"));
  if (!clips[0]) throw new Error("Ingen tilgjengelig timelapse");
  return clips[0];
}

export async function fetchSkapingTimelapse(key: string, signal: AbortSignal, refresh = false): Promise<TimelapseClip> {
  if (!/^[A-Za-z0-9-]+$/.test(key)) throw new Error("Ugyldig kamera");
  const saved = cache.get(key);
  if (!refresh && saved && saved.expires > Date.now()) return saved.clip;
  const url = new URL("https://api.skaping.com/media/search");
  url.search = new URLSearchParams({ api_key: key, types: "timelapse", _o: "creation_date DESC", _n: "8" }).toString();
  const response = await fetch(url, { signal, credentials: "omit", ...(refresh ? { cache: "no-cache" as const } : {}) });
  if (!response.ok) throw new Error("Timelapse utilgjengelig");
  const clip = parseTimelapseResponse(await response.json());
  cache.set(key, { clip, expires: Date.now() + 5 * 60_000 });
  return clip;
}

export function timelapseCaption(clip: TimelapseClip): string {
  const [year, month, day] = clip.date.split("-");
  const period = clip.period === "weekly" ? "uke fra " : clip.period === "monthly" ? "måned fra " : "";
  return `Timelapse · ${period}${day}.${month}.${year}`;
}
