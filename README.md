# CANDYSIGN AI 小电拼 Ultra — live web dashboard

<!-- TODO(lead): tighten the one-line pitch below. -->
A zero-dependency, public web dashboard for the CANDYSIGN AI 小电拼 Ultra (CP-02) 160 W 4C1A charger:
per-port power/voltage/current, a live power-flow view, and a responsive portrait/landscape layout.

> **Disclaimer:** This is an **unofficial** community project. It is **not affiliated with, endorsed by,
> or supported by CANDYSIGN**. Product names and trademarks belong to their respective owners.

## Screenshots

<!-- TODO(lead): drop real screenshots into assets/img/ and uncomment.
![Portrait view](assets/img/screenshot-portrait.png)
![Landscape view](assets/img/screenshot-landscape.png)
-->

_Screenshots pending._

## Quick start

<!-- TODO(lead): confirm the actual port/route list served by server.mjs. -->

```bash
# Requires Node.js 18+ (no dependencies, no build step)
node server.mjs
# then open http://127.0.0.1:8787 (TODO: confirm port with data-layer owner)
```

Windows: double-click `start.bat`. macOS/Linux: `./start.sh`.

## Data sources

<!-- TODO(lead): document the snapshot contract and link docs/DATA-CONTRACT.md. -->

The dashboard never talks to the charger directly (the device sends no CORS headers).
A zero-dependency local proxy (`server.mjs`) reads the charger's `/metrics.json` and
Prometheus `/metrics` text endpoint and re-serves a normalized snapshot to the browser.

- Device: `http://<device-hostname>.local` (TODO: document via `config.json`, which is gitignored —
  never hardcode the real hostname: it embeds the charger PSN)
- Proxy API: `/api/snapshot`, `/api/history`, `/api/info`, `/api/scan`, `/api/health` (TODO: confirm)
- No PSN, MAC address, SSID, or IP is committed to this repository.

## Deployment

Static site published to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`.
No npm install or build step: `index.html` + `assets/` + `manifest.webmanifest` + `.nojekyll` are served as-is.

## License

[MIT](LICENSE) © 2026 wzqvip
