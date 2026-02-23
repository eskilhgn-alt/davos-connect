/**
 * avalanche-bulletin — Proxies the official SLF (WSL) avalanche bulletin API
 * Filters for Davos-region warning regions and returns structured data
 * Source: https://aws.slf.ch/api/bulletin/caaml (CC BY 4.0)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Davos-area SLF warning region IDs (from SLF warning region map)
const DAVOS_REGION_IDS = [
  "CH-7111", // Davos
  "CH-7112", // Albula/Scaletta
  "CH-7113", // Flüelapass
  "CH-7121", // Prättigau
  "CH-7122", // Schanfigg
  "CH-7211", // Calanda
];

// Broader match: also match by name keywords
const DAVOS_KEYWORDS = ["davos", "parsenn", "jakobshorn", "pischa", "rinerhorn", "flüela", "prättigau", "klosters", "madrisa"];

interface DangerRating {
  mainValue: string; // "low", "moderate", "considerable", "high", "very_high"
  elevation?: { lowerBound?: string; upperBound?: string };
  validTimePeriod?: string;
}

interface AvalancheProblem {
  problemType: string;
  elevation?: { lowerBound?: string; upperBound?: string };
  aspects?: string[];
  validTimePeriod?: string;
  dangerRating?: { mainValue: string };
}

function dangerLevelNumber(level: string): number {
  const map: Record<string, number> = {
    low: 1, moderate: 2, considerable: 3, high: 4, very_high: 5, no_rating: 0, no_snow: 0,
  };
  return map[level] ?? 0;
}

function dangerColor(level: number): string {
  const colors: Record<number, string> = {
    0: "#cccccc", 1: "#50B848", 2: "#FFF200", 3: "#F6921E", 4: "#ED1C24", 5: "#000000",
  };
  return colors[level] ?? "#cccccc";
}

function dangerLabel(level: string, lang: string): string {
  if (lang === "no") {
    const labels: Record<string, string> = {
      low: "Liten", moderate: "Moderat", considerable: "Betydelig",
      high: "Stor", very_high: "Meget stor", no_rating: "Ikke vurdert", no_snow: "Ingen snø",
    };
    return labels[level] ?? level;
  }
  const labels: Record<string, string> = {
    low: "Low", moderate: "Moderate", considerable: "Considerable",
    high: "High", very_high: "Very High", no_rating: "No rating", no_snow: "No snow",
  };
  return labels[level] ?? level;
}

function problemLabel(type: string): string {
  const labels: Record<string, string> = {
    new_snow: "Nysnø",
    wind_slab: "Fokksnø",
    persistent_weak_layers: "Vedvarende svake lag",
    wet_snow: "Våt snø",
    gliding_snow: "Glidesnø",
    cornices: "Skavler",
    no_distinct_avalanche_problem: "Ingen tydelig skredproblem",
    favourable_situation: "Gunstig situasjon",
  };
  return labels[type] ?? type.replace(/_/g, " ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Fetch the full GeoJSON bulletin in English
    const [enRes, deRes] = await Promise.all([
      fetch("https://aws.slf.ch/api/bulletin/caaml/en/geojson"),
      fetch("https://aws.slf.ch/api/bulletin/caaml/de/geojson"),
    ]);

    if (!enRes.ok) {
      return new Response(
        JSON.stringify({ error: "SLF API unavailable", status: enRes.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const enData = await enRes.json();
    const deData = deRes.ok ? await deRes.json() : null;

    // Filter features for Davos area
    const features = enData.features || [];
    const deFeatures = deData?.features || [];

    const relevantFeatures = features.filter((f: any) => {
      const regionId = String(f.properties?.regionID || f.properties?.id || f.id || "");
      const regionName = String(f.properties?.regionName || f.properties?.name || "").toLowerCase();

      // Match by ID
      if (DAVOS_REGION_IDS.some((id) => regionId.includes(id))) return true;

      // Match by name
      if (DAVOS_KEYWORDS.some((kw) => regionName.includes(kw))) return true;

      // Match regions list inside properties
      const regions = f.properties?.regions || [];
      if (Array.isArray(regions)) {
        for (const r of regions) {
          const rId = String(r?.regionID || r?.id || "");
          const rName = String(r?.name || "").toLowerCase();
          if (DAVOS_REGION_IDS.some((id) => rId.includes(id))) return true;
          if (DAVOS_KEYWORDS.some((kw) => rName.includes(kw))) return true;
        }
      }

      return false;
    });

    // If no region-specific match, try to get the broadest bulletin data
    const bulletinFeatures = relevantFeatures.length > 0 ? relevantFeatures : features.slice(0, 5);

    // Extract structured data
    const regions = bulletinFeatures.map((f: any) => {
      const props = f.properties || {};

      // Find matching German feature for bilingual highlights
      const deMatch = deFeatures.find((df: any) =>
        (df.properties?.regionID || df.id) === (props.regionID || f.id)
      );

      const dangerRatings: DangerRating[] = (props.dangerRatings || []).map((dr: any) => ({
        mainValue: dr.mainValue || "no_rating",
        elevation: dr.elevation || {},
        validTimePeriod: dr.validTimePeriod || "all_day",
      }));

      const maxDanger = dangerRatings.reduce(
        (max: number, dr: DangerRating) => Math.max(max, dangerLevelNumber(dr.mainValue)),
        0
      );

      const problems: AvalancheProblem[] = (props.avalancheProblems || []).map((ap: any) => ({
        problemType: ap.problemType || "unknown",
        elevation: ap.elevation || {},
        aspects: ap.aspects || [],
        validTimePeriod: ap.validTimePeriod || "all_day",
      }));

      // Extract region name from nested regions array
      const nestedRegions = props.regions || [];
      const regionNames = Array.isArray(nestedRegions)
        ? nestedRegions.map((r: any) => r?.name || r?.regionName || "").filter(Boolean)
        : [];
      const bestName = regionNames.length > 0
        ? regionNames.join(" / ")
        : props.regionName || props.name || `Varslingsregion ${f.id ?? ""}`;

      return {
        regionId: String(props.regionID || f.id || "unknown"),
        regionName: bestName,
        dangerRatings,
        maxDangerLevel: maxDanger,
        maxDangerColor: dangerColor(maxDanger),
        maxDangerLabel: dangerLabel(
          dangerRatings.find((d: DangerRating) => dangerLevelNumber(d.mainValue) === maxDanger)?.mainValue || "no_rating",
          "no"
        ),
        avalancheProblems: problems.map((p) => ({
          ...p,
          label: problemLabel(p.problemType),
        })),
        highlights: props.highlights || deMatch?.properties?.highlights || "",
        comment: props.avalancheActivityComment || props.comment || "",
        snowpackComment: props.snowpackStructureComment || "",
        tendencyComment: props.tendencyComment || "",
        validTime: props.validTime || {},
      };
    });

    // Get overall max danger
    const overallMaxDanger = regions.reduce(
      (max: number, r: any) => Math.max(max, r.maxDangerLevel),
      0
    );

    // Publication metadata
    const meta = enData.properties || enData.metadata || {};

    const result = {
      source: "SLF / WSL Institute for Snow and Avalanche Research",
      sourceUrl: "https://whiterisk.ch",
      license: "CC BY 4.0",
      fetchedAt: new Date().toISOString(),
      publicationTime: meta.publicationTime || meta.dateTime || null,
      validTime: meta.validTime || null,
      overallMaxDanger,
      overallMaxDangerColor: dangerColor(overallMaxDanger),
      overallMaxDangerLabel: dangerLabel(
        overallMaxDanger === 5 ? "very_high" :
        overallMaxDanger === 4 ? "high" :
        overallMaxDanger === 3 ? "considerable" :
        overallMaxDanger === 2 ? "moderate" :
        overallMaxDanger === 1 ? "low" : "no_rating",
        "no"
      ),
      regions,
      totalRegionsInBulletin: features.length,
      matchedRegions: relevantFeatures.length,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" },
    });
  } catch (error) {
    console.error("Avalanche bulletin error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch avalanche bulletin" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
