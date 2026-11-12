# kshitijvarshney.com

The homepage for kshitijvarshney.com. It's plain HTML, CSS and JavaScript with no build step, deployed as a Cloudflare Worker with static assets.

- `public/` holds the static files. `index.html` is the homepage and `404.html` is shown for any missing path.
- `public/assets/field.js` draws the ASCII wave background.
- `public/assets/main.js` checks `/api/status` and marks services that are down.
- `src/worker.js` handles `/api/status` by asking the Cloudflare API whether the homelab tunnels are connected. Everything else comes from `public/` without running the Worker.
- `wrangler.jsonc` is the Worker config.

## Run it locally

```bash
npx wrangler dev --port 8788
```

On a network drive such as the SMB share, add `--persist-to ~/.cache/kshitijvarshney-wrangler`, because wrangler's SQLite state can't lock files there.

Then open http://localhost:8788. Without the secrets, `/api/status` answers 503 and the cards stay as they are. To preview the maintenance states, add `?down` (everything down) or `?down=trackhost` (one service).

## Deploy

Workers Builds deploys the `main` branch of the GitHub repo with `npx wrangler deploy`. The Worker in the dashboard is named `kshitijvarshney-com`, which must match `name` in `wrangler.jsonc`.

The status endpoint needs two secrets on the Worker, under Settings > Variables and Secrets:

- `CF_ACCOUNT_ID`, the Cloudflare account ID.
- `CF_API_TOKEN`, an API token with only the "Account > Cloudflare Tunnel > Read" permission.

Secrets survive deploys. `SERVICE_TUNNELS` in `src/worker.js` maps each service to its tunnel name.

## Link-preview image

`public/og.png` is a 1200x630 render of the page opened with `?og`:

```bash
brave --headless --hide-scrollbars --window-size=1200,630 --virtual-time-budget=4000 --screenshot=public/og.png "http://localhost:8788/?og"
```

The font is Martian Mono by Evil Martians, under the SIL Open Font License (`public/assets/fonts/OFL.txt`).
