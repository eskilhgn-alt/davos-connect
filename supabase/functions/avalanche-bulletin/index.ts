/**
 * avalanche-bulletin — Proxies the official SLF (WSL) avalanche bulletin API
 * Filters for Davos-region warning regions and returns structured data
 * Maps regions to local ski resorts for easy understanding
 * Source: https://aws.slf.ch/api/bulletin/caaml (CC BY 4.0)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Keywords that indicate the bulletin covers Davos-relevant areas
const DAVOS_KEYWORDS = [
  "davos", "parsenn", "jakobshorn", "pischa", "rinerhorn",
  "flüela", "prättigau", "klosters", "madrisa", "schanfigg",
  "albula", "silvretta", "calanda", "lenzerheide", "arosa",
];

// Map region name substrings to local ski resorts people know
const SKI_RESORT_MAPPINGS: Array<{ keywords: string[]; resort: string; emoji: string }> = [
  { keywords: ["davos"], resort: "Davos", emoji: "🏔️" },
  { keywords: ["prättigau", "klosters"], resort: "Klosters / Madrisa", emoji: "⛷️" },
  { keywords: ["schanfigg", "arosa"], resort: "Arosa / Schanfigg", emoji: "🎿" },
  { keywords: ["silvretta"], resort: "Silvretta", emoji: "🏔️" },
  { keywords: ["calanda", "flims"], resort: "Flims / Laax", emoji: "⛷️" },
  { keywords: ["albula", "lenzerheide"], resort: "Lenzerheide / Albula", emoji: "🎿" },
  { keywords: ["bernina", "st. moritz", "corvatsch"], resort: "St. Moritz / Engadin", emoji: "⛷️" },
];

// Specific Davos ski areas with their approximate locations for matching
const DAVOS_SKI_AREAS = [
  { name: "Parsenn / Weissfluhjoch", elevation: "2844m", keywords: ["davos", "prättigau", "klosters"] },
  { name: "Jakobshorn", elevation: "2590m", keywords: ["davos"] },
  { name: "Pischa", elevation: "2483m", keywords: ["davos", "flüela"] },
  { name: "Rinerhorn", elevation: "2528m", keywords: ["davos"] },
  { name: "Madrisa", elevation: "2602m", keywords: ["klosters", "prättigau"] },
  { name: "Schatzalp / Strela", elevation: "2350m", keywords: ["davos", "schanfigg"] },
];

interface DangerRating {
  mainValue: string;
  elevation?: { lowerBound?: string; upperBound?: string };
  validTimePeriod?: string;
}

interface AvalancheProblem {
  problemType: string;
  elevation?: { lowerBound?: string; upperBound?: string };
  aspects?: string[];
  validTimePeriod?: string;
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

function dangerLabel(level: string): string {
  const labels: Record<string, string> = {
    low: "Liten", moderate: "Moderat", considerable: "Betydelig",
    high: "Stor", very_high: "Meget stor", no_rating: "Ikke vurdert", no_snow: "Ingen snø",
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

/** Match ski resorts mentioned in a region name string */
function matchSkiResorts(regionName: string): string[] {
  const lower = regionName.toLowerCase();
  const matched = new Set<string>();

  for (const mapping of SKI_RESORT_MAPPINGS) {
    if (mapping.keywords.some((kw) => lower.includes(kw))) {
      matched.add(mapping.resort);
    }
  }
  return Array.from(matched);
}

/** Match specific Davos ski areas from region name */
function matchDavosSkiAreas(regionName: string): Array<{ name: string; elevation: string }> {
  const lower = regionName.toLowerCase();
  const matched: Array<{ name: string; elevation: string }> = [];

  for (const area of DAVOS_SKI_AREAS) {
    if (area.keywords.some((kw) => lower.includes(kw))) {
      matched.push({ name: area.name, elevation: area.elevation });
    }
  }
  return matched;
}

/** Create a short Norwegian-friendly region label */
function createShortName(regionName: string, skiResorts: string[]): string {
  if (skiResorts.length > 0) {
    return skiResorts.join(" · ");
  }
  // Fallback: take first 2 place names from the long German string
  const parts = regionName.split(" / ").slice(0, 2);
  return parts.join(" / ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const enRes = await fetch("https://aws.slf.ch/api/bulletin/caaml/en/geojson");

    if (!enRes.ok) {
      return new Response(
        JSON.stringify({ error: "SLF API unavailable", status: enRes.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const enData = await enRes.json();
    const features = enData.features || [];

    // Filter features for Davos area by matching keywords in region names
    const relevantFeatures = features.filter((f: any) => {
      const props = f.properties || {};

      // Check main region name
      const regionName = String(props.regionName || props.name || "").toLowerCase();
      if (DAVOS_KEYWORDS.some((kw) => regionName.includes(kw))) return true;

      // Check nested regions array
      const regions = props.regions || [];
      if (Array.isArray(regions)) {
        for (const r of regions) {
          const rName = String(r?.name || r?.regionName || "").toLowerCase();
          if (DAVOS_KEYWORDS.some((kw) => rName.includes(kw))) return true;
        }
      }

      // Check regionID patterns
      const regionId = String(props.regionID || f.id || "");
      const davosRegionIds = ["CH-7111", "CH-7112", "CH-7113", "CH-7121", "CH-7122", "CH-7211"];
      if (davosRegionIds.some((id) => regionId.includes(id))) return true;

      return false;
    });

    const bulletinFeatures = relevantFeatures.length > 0 ? relevantFeatures : features.slice(0, 3);

    // Extract structured data with ski resort mapping
    const regions = bulletinFeatures.map((f: any) => {
      const props = f.properties || {};

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

      // Build full region name from nested regions
      const nestedRegions = props.regions || [];
      const regionNames = Array.isArray(nestedRegions)
        ? nestedRegions.map((r: any) => r?.name || r?.regionName || "").filter(Boolean)
        : [];
      const fullName = regionNames.length > 0
        ? regionNames.join(" / ")
        : props.regionName || props.name || `Region ${f.id ?? ""}`;

      // Map to ski resorts and Davos ski areas
      const skiResorts = matchSkiResorts(fullName);
      const davosSkiAreas = matchDavosSkiAreas(fullName);
      const shortName = createShortName(fullName, skiResorts);

      return {
        regionId: String(props.regionID || f.id || "unknown"),
        regionName: shortName,
        fullRegionName: fullName,
        skiResorts,
        davosSkiAreas,
        dangerRatings,
        maxDangerLevel: maxDanger,
        maxDangerColor: dangerColor(maxDanger),
        maxDangerLabel: dangerLabel(
          dangerRatings.find((d: DangerRating) => dangerLevelNumber(d.mainValue) === maxDanger)?.mainValue || "no_rating",
        ),
        avalancheProblems: problems.map((p) => ({
          ...p,
          label: problemLabel(p.problemType),
        })),
        highlights: props.highlights || "",
        comment: props.avalancheActivityComment || props.comment || "",
        snowpackComment: props.snowpackStructureComment || "",
        tendencyComment: props.tendencyComment || "",
        validTime: props.validTime || {},
      };
    });

    const overallMaxDanger = regions.reduce(
      (max: number, r: any) => Math.max(max, r.maxDangerLevel),
      0
    );

    // Collect all affected Davos ski areas across all regions
    const allDavosSkiAreas = new Map<string, string>();
    for (const r of regions) {
      for (const area of r.davosSkiAreas) {
        allDavosSkiAreas.set(area.name, area.elevation);
      }
    }

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
      ),
      regions,
      affectedDavosSkiAreas: Array.from(allDavosSkiAreas.entries()).map(([name, elevation]) => ({
        name, elevation,
      })),
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
