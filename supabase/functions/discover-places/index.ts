/**
 * discover-places — delt anbefalingsdata for én tur.
 *
 * Sikkerhet:
 *  - Krever gyldig JWT + godkjent, aktivt medlem (`requireApprovedMember`).
 *  - Krever medlemskap i oppgitt `trip_id`.
 *  - Klienten kan ALDRI sende koordinater/radius. Senter, radius, radius,
 *    språk og tillatte kategorier leses server-side fra turens
 *    `destination_config`.
 *  - API-nøkkel (`GOOGLE_PLACES_API_KEY`) forlater aldri serveren og logges aldri.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireApprovedMember, authErrorResponse, AuthError } from "../_shared/auth.ts";

const CATEGORIES = ["spise", "afterski", "aktiviteter", "praktisk"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_TYPES: Record<Category, string[]> = {
  spise: ["restaurant", "cafe", "bakery"],
  afterski: ["bar", "night_club"],
  aktiviteter: ["tourist_attraction", "spa", "gym"],
  praktisk: ["supermarket", "pharmacy", "atm"],
};

const DEFAULT_RADIUS_M = 3000;
const MAX_RADIUS_M = 15000;
const MAX_RESULTS = 20;
const PROVIDER_TIMEOUT_MS = 8000;

// Enkelt kostvern: maks N kall per bruker per vindu (per isolat).
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; start: number }>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const cur = hits.get(userId);
  if (!cur || now - cur.start > RATE_WINDOW_MS) {
    hits.set(userId, { count: 1, start: now });
    return false;
  }
  cur.count += 1;
  return cur.count > RATE_LIMIT;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  currentOpeningHours?: { openNow?: boolean };
  googleMapsUri?: string;
}

const PRICE_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/** Stabil, ikke-hemmelig cacheversjon av destinasjonskonfigurasjonen. */
function configVersion(cfg: unknown): string {
  const s = JSON.stringify(cfg ?? {});
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { userId, admin } = await requireApprovedMember(req);
    if (rateLimited(userId)) return json({ error: "rate_limited" }, 429);

    const body = await req.json().catch(() => ({}));
    const tripId = typeof body?.tripId === "string" ? body.tripId : "";
    const category = body?.category as Category;
    if (!tripId) throw new AuthError(400, "invalid_trip");
    if (!CATEGORIES.includes(category)) return json({ error: "invalid_category" }, 400);

    // Medlemskap i akkurat denne turen.
    const { data: member } = await admin
      .from("trip_members")
      .select("trip_id")
      .eq("trip_id", tripId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) return json({ error: "not_trip_member" }, 403);

    const { data: trip } = await admin
      .from("trips")
      .select("id, destination_config")
      .eq("id", tripId)
      .maybeSingle();

    const cfg = (trip?.destination_config ?? {}) as Record<string, unknown>;
    const center = cfg.center as { lat?: number; lon?: number } | undefined;
    if (typeof center?.lat !== "number" || typeof center?.lon !== "number") {
      return json({ error: "destination_not_configured" }, 200);
    }
    const radius = Math.min(
      MAX_RADIUS_M,
      typeof cfg.discoverRadiusM === "number" ? cfg.discoverRadiusM : DEFAULT_RADIUS_M,
    );
    const language = typeof cfg.language === "string" ? cfg.language : "en";

    const cacheKey = `${tripId}:${configVersion(cfg)}:google-places:${category}`;
    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) {
      return json({
        tripId,
        category,
        cacheKey,
        provider: null,
        attribution: null,
        places: [],
        fetchedAt: new Date().toISOString(),
        error: "provider_not_configured",
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.location",
            "places.rating",
            "places.userRatingCount",
            "places.priceLevel",
            "places.currentOpeningHours.openNow",
            "places.googleMapsUri",
          ].join(","),
        },
        body: JSON.stringify({
          includedTypes: CATEGORY_TYPES[category],
          maxResultCount: MAX_RESULTS,
          languageCode: language,
          locationRestriction: {
            circle: { center: { latitude: center.lat, longitude: center.lon }, radius },
          },
        }),
      });
    } catch (e) {
      clearTimeout(timer);
      const aborted = e instanceof DOMException && e.name === "AbortError";
      return json({ error: aborted ? "timeout" : "provider_error" }, aborted ? 504 : 502);
    }
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      console.error(`Places request failed [${res.status}]: ${text.slice(0, 500)}`);
      return json({ error: "provider_error", status: res.status }, res.status);
    }

    const data = (await res.json()) as { places?: GooglePlace[] };
    const places = (data.places ?? [])
      .filter((p) => p.id && typeof p.location?.latitude === "number")
      .map((p) => ({
        id: `google:${p.id}`,
        name: p.displayName?.text ?? "Ukjent sted",
        category,
        lat: p.location!.latitude as number,
        lon: p.location!.longitude as number,
        address: p.formattedAddress ?? null,
        rating: typeof p.rating === "number" ? p.rating : null,
        ratingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
        priceLevel: p.priceLevel ? PRICE_MAP[p.priceLevel] ?? null : null,
        openNow: p.currentOpeningHours?.openNow ?? null,
        photoUrl: null,
        providerUrl: p.googleMapsUri ?? null,
      }));

    return json({
      tripId,
      category,
      cacheKey,
      provider: "google-places",
      attribution: "Stedsdata fra Google Maps",
      places,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return authErrorResponse(err, corsHeaders);
  }
});
