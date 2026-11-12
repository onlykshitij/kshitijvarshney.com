// Worker for kshitijvarshney.com.
// Workers static assets serve everything in public/ without running this code. Only paths
// matched by run_worker_first in wrangler.jsonc (/api/*) reach fetch() below.
//
// GET /api/status reports whether each service's Cloudflare tunnel is connected:
//   { "services": { "trackhost": "up" | "down" | "unknown", ... }, "checked": ISO time }
// It needs two secrets on the Worker (Settings > Variables and Secrets):
//   CF_ACCOUNT_ID  the Cloudflare account that owns the tunnels
//   CF_API_TOKEN   an API token with only "Account > Cloudflare Tunnel > Read"
// Without them it answers 503 and the page leaves the cards as they are.

// Which tunnel (by its name in Cloudflare) each service sits behind.
const SERVICE_TUNNELS = {
  trackhost: "Trackhost_Tunnel",
  media: "KV_ROG_CFTunnel",
  seerr: "KV_ROG_CFTunnel",
};

const CACHE_SECONDS = 60;

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/status" && request.method === "GET") return status(request, env, ctx);
    // Anything else under /api/ falls through to the assets, which answer with the 404 page.
    return env.ASSETS.fetch(request);
  },
};

async function status(request, env, ctx) {
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
    const s = statusByName.get(tunnel);
    // Cloudflare reports healthy, degraded (some connections lost), down or inactive.
    services[service] = s === undefined ? "unknown" : s === "healthy" || s === "degraded" ? "up" : "down";
  }

  const response = json({ services, checked: new Date().toISOString() }, 200, CACHE_SECONDS);
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

function json(body, status, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
