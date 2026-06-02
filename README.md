# DropVentures — Lovable template

Drop one supplier photo, get a **7-asset store-ready brand pack** in ~90 seconds. Cutout, white-background studio, 3 lifestyle scenes (AI-picked per product), 9:16 hero, 1:1 ad creative. Optionally match the visual style of a reference ad you like.

**Built for dropshippers, Amazon FBA sellers, Shopify owners, and small DTC brands rebranding supplier (AliExpress / 1688 / Alibaba) photos at scale.**

100% browser. No backend. No database. Fork it, drop in your two API keys, ship. Powered by [Runflow](https://www.runflow.io) (image pipeline) + [OpenAI](https://platform.openai.com) (gpt-4o vision).

## Quick start

```bash
git clone https://github.com/runflow-io/dtc-ad-builder.git
cd dtc-ad-builder
npm install
npm run dev
# → open http://localhost:5173
```

The Settings modal opens on first load. Paste your two API keys and you're live.

## How to get the keys

| Key | Where | What it costs |
|---|---|---|
| **Runflow API key** | [app.runflow.io/settings/api-keys](https://app.runflow.io/settings/api-keys) | Pay-per-call: ~$0.25 per brand pack (cutout + 4 generations + 2 ratios) |
| **OpenAI API key** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Pay-per-call: ~$0.01 per pack (one gpt-4o vision read of the product photo) |

You pay both providers directly — the template never sees your money. Each user runs their own fork with their own keys.

## How it works

```
Supplier photo (+ optional reference style image)
       ↓
1. Upload to Runflow assets
2. gpt-4o vision → product category, scene prompts (style-matched if reference given)
3. runflow/object-removal/prompt → strip watermarks, hands, text overlays (conditional)
4. runflow/product-isolation → RGBA cutout
5. [parallel x4] openai/gpt-image-2/edit
     • white studio shot (Amazon main image)
     • lifestyle scene A / B / C (placed per gpt-4o's scene prompts)
6. [parallel x2]
     • runflow/outpaint/aspect-ratio → 9:16 hero
     • runflow/smart-resize → 1:1 ad creative
       ↓
7-asset pack · individual downloads + one-click ZIP
```

## Features

- **7 store-ready assets per pack**, generated end-to-end in ~90 seconds
- **Reference-style matching** — optional second dropzone for "match the look of this ad I like"
- **Lightbox with arrow-key nav** for browsing the output pack
- **Recent packs persist in IndexedDB** — survives reloads, click any past pack to reopen
- **ZIP download** of all 7 assets
- **Zero backend** — all API calls happen in the browser, keys stay in localStorage

## Customize it

This is the Lovable template — open it in Lovable (or any IDE) and modify away. Common edits:

| What | Where |
|---|---|
| Add / remove output assets | `src/lib/pipeline.ts` — adjust the fan-out steps |
| Change brand colors / typography | `tailwind.config.ts` + `src/index.css` |
| Switch the vision model | `src/lib/openai.ts` — `model: "gpt-4o"` |
| Localize text / change copy | `src/App.tsx`, `src/components/*` |
| Change the scene-picker rules | `src/lib/pipeline.ts` — `VISION_USER_BASE` / `VISION_USER_WITH_REF` |
| Add a logo overlay step | `src/lib/pipeline.ts` — wrap the result Blob through a canvas before zipping |

## Architecture

| Concern | How it's handled |
|---|---|
| API keys | `localStorage` only. Never sent anywhere except api.runflow.io + api.openai.com directly. |
| Job state | `useState` in App.tsx during a run |
| Output assets | Blob URLs (`URL.createObjectURL`) for display + JSZip for the bundle |
| History | IndexedDB (`src/lib/history.ts`) — survives reloads, scoped to the browser |
| No backend | Truly zero — no Vercel functions, no Supabase. The whole app is static + browser APIs |

## Caveats

- **Browser CORS:** Runflow and OpenAI both allow CORS from browsers. If you fork and add an unrelated API that doesn't, you'll need a Vercel function or similar.
- **Keys in the browser:** secure enough for a self-hosted personal tool. If you ship this as a multi-tenant SaaS, move keys server-side via a proxy.
- **IndexedDB size:** each pack is ~3-7MB of image blobs. After ~50 packs you might hit storage warnings — clear via browser dev tools or extend `src/lib/history.ts` to LRU-evict.

## License

MIT. Use it however you want.

## Credits

- Pipeline & API: [Runflow](https://www.runflow.io)
- Vision: [OpenAI gpt-4o](https://platform.openai.com)
- Icons: [Lucide](https://lucide.dev)
- Template: forkable, MIT-licensed, no strings.
