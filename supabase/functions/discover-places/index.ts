/**
 * discover-places — delt anbefalingsdata for én tur.
 *
 * Sikkerhet:
 *  - Krever gyldig JWT + godkjent, aktivt medlem (`requireApprovedMember`).
 *  - Krever medlemskap i oppgitt `trip_id` FØR cache leses.
 *  - Arkiverte turer (`trips.status != 'active'`) utløser aldri providerfeed.
 *  - Klienten kan ALDRI sende koordinater/radius/filtre. Senter kommer fra
 *    `destination_config.center`, resten fra `destination_config.discovery`.
 *  - API-nøkkel (`GOOGLE_PLACES_API_KEY`) forlater aldri serveren og logges aldri.
 *  - Providerrespons logges aldri i sin helhet — kun status/kode.
 *  - Servercache er delt per tur og lagrer aldri brukerposisjon.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireApprovedMember, authErrorResponse, AuthError } from "../_shared/auth.ts";
import {
  applyFilters,
  buildCacheKey,
  isCategory,
  resolveDiscovery,
  type Category,
} from "./discovery.ts";

const CACHE_TABLE = "discover_place_cache";

const CATEGORY_TYPES: Record<Category, string[]> = {
  spise: ["restaurant", "cafe", "bakery"],
  afterski: ["bar", "night_club"],
  aktiviteter: ["tourist_attraction", "spa", "gym"],
  praktisk: ["supermarket", "pharmacy", "atm"],
};

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

const ATTRIBUTION = "Stedsdata fra Google Maps";

/** Manglende cachetabell skal aldri felle forespørselen eller lekke detaljer. */
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /does not exist|schema cache/i.test(err.message ?? "");
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
    if (!isCategory(category)) return json({ error: "invalid_category" }, 400);

    // Medlemskap i akkurat denne turen — alltid før cache leses.
    const { data: member } = await admin
      .from("trip_members")
      .select("trip_id")
      .eq("trip_id", tripId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) return json({ error: "not_trip_member" }, 403);

    const { data: trip } = await admin
      .from("trips")
      .select("id, status, destination_config")
      .eq("id", tripId)
      .maybeSingle();
    if (!trip) return json({ error: "invalid_trip" }, 404);

    // Arkivgrense: ingen dynamisk providerfeed for arkiverte turer.
    if (trip.status !== "active") {
      return json({ tripId, category, archived: true, places: [], error: "trip_archived" }, 200);
    }

    const discovery = resolveDiscovery(trip.destination_config);
    if (!discovery.configured) {
      return json({ tripId, category, places: [], error: discovery.error }, 200);
    }
    if (!discovery.categories.includes(category)) {
      return json({ error: "category_not_enabled" }, 400);
    }

    const provider = discovery.providers.find((p) => p === "google-places");
    if (!provider) return json({ tripId, category, places: [], error: "provider_not_configured" }, 200);

    const cacheKey = buildCacheKey({
      tripId,
      discoveryVersion: discovery.version,
      provider,
      category,
      filterVersion: discovery.filterVersion,
    });

    // 1) Delt server-snapshot (service role only).
    //    EØS: snapshotet lagrer BARE place_id + koordinater, provider og
    //    cacheversjon — aldri navn, adresse, rating, åpningstid, pris, bilder
    //    eller reviewdata, og aldri brukerposisjon.
    const { data: snapshot, error: cacheErr } = await admin
      .from(CACHE_TABLE)
      .select("place_refs, expires_at")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (cacheErr && !isMissingTable(cacheErr)) {
      console.error(`discover snapshot read failed [${cacheErr.code ?? "unknown"}]`);
    }
    const snapshotRefs = Array.isArray(snapshot?.place_refs)
      ? (snapshot!.place_refs as Array<{ id?: string }>)
          .map((r) => (typeof r?.id === "string" ? r.id : null))
          .filter((x): x is string => !!x)
      : null;


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
          languageCode: discovery.language,
          locationRestriction: {
            circle: {
              center: { latitude: discovery.center.lat, longitude: discovery.center.lon },
              radius: discovery.radiusM,
            },
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
      // Kun sikker statuskode logges — aldri providerens kropp.
      console.error(`Places request failed with status ${res.status}`);
      return json({ error: "provider_error", status: res.status }, res.status);
    }

    const data = (await res.json()) as { places?: GooglePlace[] };
    const normalized = (data.places ?? [])
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
    const filtered = applyFilters(normalized, discovery.filters);

    // Delt rekkefølge: finnes et snapshot, følger alle medlemmer snapshotets
    // kandidatsett og rekkefølge. Ellers providerens egen rekkefølge.
    const places = snapshotRefs
      ? snapshotRefs
          .map((id) => filtered.find((p) => p.id === id))
          .filter((p): p is (typeof filtered)[number] => !!p)
      : filtered;

    const payload = {
      tripId,
      category,
      cacheKey,
      provider,
      attribution: ATTRIBUTION,
      places,
      fetchedAt: new Date().toISOString(),
    };

    // 2) Skriv KUN place_id + koordinater til delt snapshot. Ingen navn,
    //    adresser, ratings, åpningstid, pris, bilder eller reviewdata.
    //    Ingen brukerposisjon, ingen bruker-id. TTL alltid <= 30 dager.
    if (!snapshotRefs) {
      const placeRefs = places.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon }));
      const ttlMs = Math.min(discovery.ttlSeconds, MAX_SNAPSHOT_TTL_SECONDS) * 1000;
      const { error: writeErr } = await admin.from(CACHE_TABLE).upsert(
        {
          cache_key: cacheKey,
          trip_id: tripId,
          provider,
          category,
          discovery_version: discovery.version,
          filter_version: discovery.filterVersion,
          place_refs: placeRefs,
          expires_at: new Date(Date.now() + ttlMs).toISOString(),
        },
        { onConflict: "cache_key" },
      );
      if (writeErr && !isMissingTable(writeErr)) {
        console.error(`discover snapshot write failed [${writeErr.code ?? "unknown"}]`);
      }
    }

    return json({ ...payload, cached: !!snapshotRefs });
  } catch (err) {
    return authErrorResponse(err, corsHeaders);
  }
});
