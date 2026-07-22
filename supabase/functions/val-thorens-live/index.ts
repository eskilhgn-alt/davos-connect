import { load } from "cheerio";

const SOURCE_URL = "https://bulletinv3.lumiplan.pro/bulletin.php?lang=en&station=val-thorens";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type LiftStatus = "open" | "scheduled" | "closed" | "delayed" | "stopped" | "out_of_period" | "unknown";
type LiveItemKind = "lifts" | "trails" | "connections" | "activities" | "other";

let memoryCache: { at: number; data: unknown } | null = null;

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function statusFromSources(sources: string[]): LiftStatus {
  const value = sources.join(" ").toLowerCase();
  if (value.includes("out_of_period") || value.includes("out-of-period")) return "out_of_period";
  if (value.includes("scheduled")) return "scheduled";
  if (value.includes("delay")) return "delayed";
  if (value.includes("stopped") || value.includes("stop")) return "stopped";
  if (value.includes("opened") || value.includes("_open")) return "open";
  if (value.includes("closed") || value.includes("_close")) return "closed";
  return "unknown";
}

function kindFromLabel(label: string): LiveItemKind {
  const value = label.toLowerCase();
  if (value.includes("lift") || value.includes("remont")) return "lifts";
  if (value.includes("trail") || value.includes("slope") || value.includes("piste")) return "trails";
  if (value.includes("connection") || value.includes("link") || value.includes("liaison")) return "connections";
  if (value.includes("activit") || value.includes("activité")) return "activities";
  return "other";
}

function parseBulletin(html: string) {
  const $ = load(html);
  const updatedAtLabel = clean($(".intro_maj").first().text()) || null;

  const weather = $(".bloc_meteo .meteo_card").toArray().map((node) => {
    const card = $(node);
    const title = clean(card.find(".bloc_title_text").first().text());
    const heading = clean(card.find("h2").first().text());
    const elevationMatch = `${title} ${heading}`.match(/(\d{3,4})\s*m/i);
    const entries = card.find(".meteo_matin").toArray();
    const textAt = (index: number, selector: string) => {
      const value = entries[index] ? clean($(entries[index]).find(selector).first().text()) : "";
      return value || null;
    };
    return {
      name: title || heading.replace(/[-–]\s*\d{3,4}\s*m/i, "").trim() || "Val Thorens",
      elevationM: elevationMatch ? Number(elevationMatch[1]) : null,
      morningTemperature: textAt(0, ".text") ?? textAt(0, ".subtext"),
      afternoonTemperature: textAt(1, ".text") ?? textAt(1, ".subtext"),
      wind: textAt(2, ".text") ?? textAt(2, ".subtext"),
      windDirection: textAt(3, ".text") ?? textAt(3, ".subtext"),
      freshSnow: textAt(4, ".text") ?? textAt(4, ".subtext"),
      conditionIcon: card.find("img").first().attr("src") || null,
    };
  }).filter((point) => point.name || point.elevationM);

  const totals = $(".totaux_row .c100").toArray().map((node) => {
    const item = $(node);
    const fullText = clean(item.text());
    const open = Number(clean(item.find(".strong").first().text()).match(/\d+/)?.[0] || 0);
    const ratio = fullText.match(/(\d+)\s*\/\s*(\d+)/);
    const total = ratio ? Number(ratio[2]) : Number(fullText.match(/\b\d+\b/g)?.at(-1) || open);
    const img = item.find("img").first();
    const imageSource = img.attr("src") || "";
    const label = /LIFTS/i.test(imageSource)
      ? "Heiser"
      : /TRAILS|PISTES/i.test(imageSource)
        ? "Løyper"
        : clean(img.attr("alt") || img.attr("title") || item.next().text()) || "Åpent";
    return { label, open, total };
  }).filter((total) => total.total > 0);

  const groups: Array<{
    sector: string;
    kind: LiveItemKind;
    label: string;
    items: Array<{ name: string; status: LiftStatus; hours: string | null; typeIcon: string | null; groomingIcon: string | null }>;
  }> = [];

  $(".bloc_pistes_remontees .meteo_card").each((_index, sectorNode) => {
    const sectorCard = $(sectorNode);
    const sector = clean(sectorCard.find(".bloc_title_text").first().text()) || "Val Thorens";
    let current: (typeof groups)[number] | null = null;
    sectorCard.find(".card-content.remontee_pistes").children().each((_childIndex, childNode) => {
      const child = $(childNode);
      if (child.hasClass("POI_title")) {
        const label = clean(child.find(".title").first().text()) || clean(child.text()) || "Status";
        current = { sector, kind: kindFromLabel(label), label, items: [] };
        groups.push(current);
        return;
      }
      const rows = child.hasClass("POI_info") ? child : child.find(".POI_info");
      rows.each((_rowIndex, rowNode) => {
        const row = $(rowNode);
        const name = clean(row.find(".nom").first().text());
        if (!name) return;
        if (!current) {
          current = { sector, kind: "other", label: "Status", items: [] };
          groups.push(current);
        }
        const statusSources = row.find(".img_status img, img.img_status").toArray()
          .map((img) => $(img).attr("src") || "");
        const groomingIcon = statusSources.find((src) => /damage|groom|dame/i.test(src)) || null;
        const status = statusFromSources(statusSources);
        const typeIcon = row.find(".img_type img, img.img_type").first().attr("src") || null;
        const hours = clean(row.find(".heure").first().text()) || null;
        current.items.push({ name, status, hours, typeIcon, groomingIcon });
      });
    });
  });

  return {
    fetchedAt: new Date().toISOString(),
    updatedAtLabel,
    sourceUrl: SOURCE_URL,
    weather,
    totals,
    groups: groups.filter((group) => group.items.length > 0),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (memoryCache && Date.now() - memoryCache.at < 30_000) {
    return new Response(JSON.stringify(memoryCache.data), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, max-age=30" },
    });
  }

  try {
    const response = await fetch(SOURCE_URL, {
      headers: { "User-Agent": "GuttaHutte/1.0", "Accept-Language": "en" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Lumiplan HTTP ${response.status}`);
    const data = parseBulletin(await response.text());
    memoryCache = { at: Date.now(), data };
    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=30, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    if (memoryCache) {
      return new Response(JSON.stringify({ ...(memoryCache.data as object), stale: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Upstream error" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
