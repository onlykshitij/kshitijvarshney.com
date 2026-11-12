// GET /api/status reports whether each service's Cloudflare tunnel is connected.
// Response: { "services": { "trackhost": "up" | "down" | "unknown", ... }, "checked": ISO time }
//
// Pages project settings it needs:
//   CF_ACCOUNT_ID  plain variable, the Cloudflare account that owns the tunnels
//   CF_API_TOKEN   secret, an API token with only "Account > Cloudflare Tunnel > Read"
// Without them it answers 503 and the page leaves the cards as they are.

// Which tunnel (by its name in Cloudflare) each service sits behind.
const SERVICE_TUNNELS = {
  trackhost: "trackhost",
  media: "homelab",
  seerr: "homelab",
};

const CACHE_SECONDS = 60;

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/status", request.url).toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) return json({ error: "not configured" }, 503);

  let tunnels;
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/cfd_tunnel?is_deleted=false&per_page=100`,
      { headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` } }
    );
    if (!res.ok) return json({ error: `cloudflare api ${res.status}` }, 502);
    tunnels = (await res.json()).result || [];
  } catch (err) {
    return json({ error: "cloudflare api unreachable" }, 502);
  }

  const statusByName = new Map(tunnels.map((t) => [t.name, t.status]));
  const services = {};
  for (const [service, tunnel] of Object.entries(SERVICE_TUNNELS)) {
    const status = statusByName.get(tunnel);
    // Cloudflare reports healthy, degraded (some connections lost), down or inactive.
    services[service] = status === undefined ? "unknown" : status === "healthy" || status === "degraded" ? "up" : "down";
  }

  const response = json({ services, checked: new Date().toISOString() }, 200, CACHE_SECONDS);
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

function json(body, status, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
    },
  });
}
