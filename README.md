# Homeground 🌍

**Watch any spot on Earth drift across a billion years of plate tectonics.**

Drop a pin (or search a place), scrub a timeline from today back to ~1000 million
years ago, and watch that location travel across a globe whose continents morph in
real time — splitting, colliding, assembling into Pangea and Rodinia. All positions
come from real plate‑tectonic reconstructions, not guesswork.

## What it does

- **Location input** — search any place (OpenStreetMap Nominatim geocoding) or click
  the globe to drop a pin. Drag to spin the view.
- **Timeline** — scrub 0 → 1000 Ma with labelled geological markers (Pangea assembly
  and breakup, the Great Dying, the Cambrian explosion, Rodinia…). Click a marker to jump.
- **Morphing globe** — an orthographic canvas globe redraws reconstructed coastlines for
  every era and eases to keep your pin centered, so it really feels like drifting.
- **Play** — auto‑animate through deep time at 1× / 2× / 4× speed.
- **Info panel** — paleo‑latitude/longitude, hemisphere, era, supercontinent context,
  and plain‑language facts ("it sat almost on the equator", "this was open ocean").
- **Confidence indicator** — shifts from **High confidence** (0–200 Ma, constrained by
  preserved ocean‑floor magnetic stripes) → **Modeled estimate** (200–750 Ma) →
  **Highly approximate** (750+ Ma), with an explainer behind the ⓘ icon.
- **Graceful edge cases** — locations that were open ocean (not on continental crust)
  at a given time show a distinct 🌊 state instead of erroring; each model's slider is
  capped at its supported age.

## Data source

Plate motions are computed by the **[GPlates Web Service (GWS)](https://gws.gplates.org/)**,
a free public REST API run by the [EarthByte Group](https://www.earthbyte.org/) at the
University of Sydney. We do not attempt to reconstruct tectonics ourselves — GWS already
solves it.

Endpoints used:

| Purpose | Endpoint |
| --- | --- |
| Reconstruct a pin's position | `/reconstruct/reconstruct_points/?lons=&lats=&time=&model=&fc` |
| Morph the map background | `/reconstruct/coastlines_low/?time=&model=` |

Reconstruction models (selectable in the UI):

- **MERDITH2021** — default; deep‑time coverage back to ~1 Ga.
- **ZAHIROVIC2022** — to ~410 Ma.
- **PALEOMAP** (Scotese) — to ~750 Ma.

## Run it locally

Requires Node 18+.

```bash
npm install
npm run dev      # http://localhost:5173
```

Build for production:

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

This repo ships a GitHub Actions workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml))
that builds the app and publishes it to Pages on every push to `main`. Vite's `base`
is set to `./` (relative), so it works under any `https://<user>.github.io/<repo>/` path.

One-time setup after the first push: in the repo on GitHub, go to
**Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
The next push (or a manual "Run workflow") will deploy, and the live URL appears in the
Actions run summary.

## How it stays fast

- **Client‑side caching** of every `(model, time)` coastline slice and
  `(model, lat, lon, time)` point, so re‑scrubbing a range never re‑hits the API.
- **Throttled fetching** (~160 ms) plus **time snapped to a 5 Ma grid** for coastlines,
  keeping the cache warm during both scrubbing and autoplay while the globe eases
  smoothly between fetched frames.
- **In‑flight de‑duplication** so rapid slider movement can't open many identical requests.
- Uses the lighter `coastlines_low` layer (~500 polygons) rather than the full‑resolution
  set, rendered to a `<canvas>` for smooth per‑frame morphing.

## A note on rate limits / self‑hosting

The public GWS server is a shared community resource. This app caches aggressively to be
polite, but for heavy use the EarthByte team publishes a Docker image so you can run your
own instance — see the
[gplates-web-service repo](https://github.com/GPlates/gplates-web-service). Point the
`GWS` constant in [`src/gplates.js`](src/gplates.js) at your local server if you self‑host.

## Accuracy disclaimer

Deep‑time reconstructions are **models, not measurements**. Confidence drops sharply the
further back you go: ocean floor older than ~200 Ma has been subducted and destroyed, so
older positions rely on paleomagnetism and geological inference. Longitude in particular is
loosely constrained in deep time. Treat anything beyond a couple hundred million years as a
plausible scientific estimate, not a GPS fix.

## Tech

React + Vite, `d3-geo` for the orthographic projection and GeoJSON path rendering, Canvas
2D for the globe. No heavy tile‑map library — we're drawing ancient geography, not modern
map tiles.

## Credits

- Reconstructions: **GPlates Web Service**, EarthByte Group, University of Sydney.
- Geocoding: **OpenStreetMap Nominatim**.
