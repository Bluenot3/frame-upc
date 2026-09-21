# FrameScan · Order Studio

[Open the private live app](https://framescan-order-studio-havertown.zenagi.chatgpt.site/) · [Source repository](https://github.com/Bluenot3/frame-upc)

Sign in with the same ChatGPT account on your laptop or phone to access saved records.

A private Sites workspace for photographing paper orders, reviewing extracted administrative details, tracking status, and collecting frame UPCs for one-at-a-time Encompass entry.

## Workflows

- **Patient orders:** live camera or multiple JPEG/PNG/WebP/BMP photos; crop/rotate, on-device OCR, explicit review, save and next paper. Name, order number, frame UPC, lab, dates, status and notes are searchable and editable. Status changes have a history; stale edits are rejected. Due-today/overdue filters and CSV export are included.
- **Frame UPC batches:** continuous camera scanning, adjustable wireframe, close-up and repeated-read confirmation, photo crop, manual entry, pasted lists, saved batches, duplicate grouping, CSV, and a copy/mark-done queue for Encompass.

Photos and raw OCR text stay in browser memory and are discarded when capture closes. Only explicitly reviewed fields and UPCs are sent to the authenticated service. Stored data is scoped to the signed-in account in D1. No real patient data is bundled in source or example content. CSV exports include patient details; the operator chooses where to save them.

Camera autofocus, zoom, and disabling portrait effects depend on the browser/device. A phone's rear camera usually resolves small print better than a laptop webcam. The Windows native no-effects bridge belongs to the separate local FrameScan app and is not exposed by this website. Encompass transfer copies codes; it does not automate or verify submission in Encompass.

## Development

Requires Node.js 22.13 or newer and npm. A clean checkout defaults to the portable profile.

```sh
npm ci
npm run build
# Apply this initial migration once to a new local database:
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_smart_sue_storm.sql
npm run dev -- --hostname 127.0.0.1 --port 4320
```

Open http://127.0.0.1:4320 and use the local mock sign-in. Production uses Sites private authentication. The `predev` and `prebuild` hooks recreate self-hosted OCR workers, WASM and the English model from the locked npm dependencies; generated assets are omitted from GitHub.

`npm test` runs the scanner and extraction checks. `npm run typecheck` checks TypeScript. With the local preview running, `node scripts/check-local-api.mjs` exercises storage and authentication using synthetic local records only.

Schema is in `db/schema.ts`; committed generated migrations are in `drizzle/`. Apply a new migration once to the local DB before testing. Production migrations are applied through the Sites deployment workflow. Do not copy `.wrangler` data to production.

Run `node --test tests/*.test.mjs` and `npx tsc --noEmit`. Use the Sites build/workflow scripts for publishing. The manifest holds the registered project ID and logical DB binding only.

The page exposes `filter_patient_orders` (read/search) and `start_order_capture` (opens the capture dialog only) through feature-detected WebMCP.

## Hosting

This repository is an additional home for the application source. The live deployment remains on Sites; a GitHub push does not automatically deploy it. This app needs a Cloudflare-compatible server, a D1 database, and trusted Sites authentication headers, so it cannot run as a standalone GitHub Pages site. Use the existing Sites publication workflow to update the private app.

The public repository contains no patient records, paper photos, local database, session credentials, or build caches. The registered project ID in `.openai/hosting.json` is deployment metadata, not a credential.
