# kshitijvarshney.com

The homepage for kshitijvarshney.com. It's plain HTML, CSS and JavaScript with no build step, served by Cloudflare Pages.

- `public/` is what Pages serves. `index.html` is the homepage and `404.html` is shown for any missing path.
- `public/assets/field.js` draws the ASCII wave background.
- `public/assets/main.js` checks `/api/status` and marks services that are down.
- `functions/api/status.js` is a Pages Function. It asks the Cloudflare API whether the homelab tunnels are connected.

## Run it locally

```bash
npx wrangler pages dev public --port 8788 --compatibility-date=2026-11-10
```

On a network drive such as the SMB share, add `--persist-to ~/.cache/kshitijvarshney-wrangler`, because wrangler's SQLite state can't lock files there.


Then open http://localhost:8788. Without the API variables, `/api/status` answers 503 and the cards stay as they are. To preview the maintenance states, add `?down` (everything down) or `?down=trackhost` (one service).

## Deploy

Pages builds from the `main` branch of the GitHub repo. In the project settings, the build command is empty and the output directory is `public`.

The status function needs two settings in the Pages project:

- `CF_ACCOUNT_ID`, a plain variable holding the Cloudflare account ID.
- `CF_API_TOKEN`, a secret holding an API token with only the "Account > Cloudflare Tunnel > Read" permission.

`SERVICE_TUNNELS` in `functions/api/status.js` maps each service to its tunnel name.

## Link-preview image

`public/og.png` is a 1200x630 render of the page opened with `?og`:

```bash
brave --headless --hide-scrollbars --window-size=1200,630 --virtual-time-budget=3000 --screenshot=public/og.png "http://localhost:8788/?og"
```

The font is Martian Mono by Evil Martians, under the SIL Open Font License (`public/assets/fonts/OFL.txt`).
