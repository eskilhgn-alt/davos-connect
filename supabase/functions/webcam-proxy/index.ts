/**
 * Webcam Proxy - Fetches webcam images and serves them with proper CORS headers
 * Caches images for 60 seconds to reduce load on source servers
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// In-memory cache for images
const imageCache = new Map<string, { data: ArrayBuffer; contentType: string; cachedAt: number }>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const url = new URL(req.url);
    const imageUrl = url.searchParams.get("url");

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "Missing 'url' parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL (only allow known webcam sources)
    const allowedHosts = [
      "wtvpict.feratel.com",
      "wtvlogo.feratel.com",
      "www.davosklostersmountains.ch",
      "roundshot.com",
      "webcam.davos.ch",
    ];

    const parsedUrl = new URL(imageUrl);
    if (!allowedHosts.some(host => parsedUrl.hostname.includes(host))) {
      return new Response(
        JSON.stringify({ error: "URL not allowed" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check cache
    const now = Date.now();
    const cached = imageCache.get(imageUrl);
    if (cached && (now - cached.cachedAt) < CACHE_TTL_MS) {
      console.log(`Cache hit for: ${imageUrl}`);
      return new Response(cached.data, {
        headers: {
          ...corsHeaders,
          "Content-Type": cached.contentType,
          "Cache-Control": "public, max-age=60",
          "X-Cache": "HIT",
        },
      });
    }

    // Fetch the image
    console.log(`Fetching: ${imageUrl}`);
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DavosApp/1.0)",
        "Accept": "image/*",
        "Referer": "https://www.davos.ch/",
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch webcam image: ${response.status}`);
      return new Response(
        JSON.stringify({ error: `Upstream error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = response.headers.get("Content-Type") || "image/jpeg";
    const imageData = await response.arrayBuffer();

    // Cache the result
    imageCache.set(imageUrl, {
      data: imageData,
      contentType,
      cachedAt: now,
    });

    // Cleanup old cache entries (keep max 100 entries)
    if (imageCache.size > 100) {
      const entries = Array.from(imageCache.entries());
      entries.sort((a, b) => a[1].cachedAt - b[1].cachedAt);
      for (let i = 0; i < entries.length - 50; i++) {
        imageCache.delete(entries[i][0]);
      }
    }

    return new Response(imageData, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=60",
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    console.error("Webcam proxy error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
