// Thin client for the GPlates Web Service (GWS) run by the EarthByte Group,
// University of Sydney. Free public REST API: https://gws.gplates.org/
//
// All responses are cached in-memory per (endpoint, params) so scrubbing the
// same range repeatedly does not hammer the public server.

const GWS = 'https://gws.gplates.org'

// ---------------------------------------------------------------------------
// Reconstruction models. `maxTime` is the practical upper bound we expose in
// the UI for each model (the age beyond which the model has no meaningful
// coverage). MERDITH2021 reaches deep time (~1 Ga) so it is our default.
// ---------------------------------------------------------------------------
// `api` is the exact model id the GWS expects (case-sensitive). `maxTime` is
// the age beyond which the model has no coverage (probed against the API).
export const MODELS = {
  MERDITH2021: { api: 'MERDITH2021', label: 'Merdith 2021 — deep time', maxTime: 1000 },
  MULLER2019: { api: 'MULLER2019', label: 'Müller 2019 — best-constrained recent', maxTime: 250 },
  MATTHEWS2016: { api: 'matthews2016_pmag_ref', label: 'Matthews 2016', maxTime: 410 },
  ZAHIROVIC2022: { api: 'ZAHIROVIC2022', label: 'Zahirovic 2022', maxTime: 410 },
  PALEOMAP: { api: 'PALEOMAP', label: 'Scotese PALEOMAP', maxTime: 750 },
}

export const DEFAULT_MODEL = 'MERDITH2021'

// Simple Map-based caches. Keys are strings.
const pointCache = new Map()
const coastCache = new Map()

// A tiny concurrency guard so rapid scrubbing does not open dozens of sockets.
const inflight = new Map()

function dedupe(key, fn) {
  if (inflight.has(key)) return inflight.get(key)
  const p = fn().finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

async function getJSON(url, signal) {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`GWS ${res.status} for ${url}`)
  return res.json()
}

// Grid steps. Points are tiny, so we sample them finely for smooth motion;
// coastline slices are ~600 KB each so we sample them more coarsely.
export const POINT_STEP = 5
export const COAST_STEP = 20

const snap = (t, step) => Math.round(t / step) * step

// Map our model key to the exact id the GWS expects.
const apiId = (model) => MODELS[model]?.api || model

function pointKey(lon, lat, t, model) {
  return `${model}|${lon.toFixed(4)}|${lat.toFixed(4)}|${t}`
}

/**
 * Reconstruct a single present-day point back to `time` Ma.
 * Returns { lon, lat, valid } where valid=false means the point was not on
 * assigned continental crust at that time (likely open ocean / subducted).
 */
export async function reconstructPoint(lon, lat, time, model) {
  const t = Math.round(time * 10) / 10
  const key = pointKey(lon, lat, t, model)
  if (pointCache.has(key)) return pointCache.get(key)

  return dedupe('pt:' + key, async () => {
    const url =
      `${GWS}/reconstruct/reconstruct_points/` +
      `?lons=${lon}&lats=${lat}&time=${t}&model=${apiId(model)}&fc`
    const data = await getJSON(url)
    const feat = data?.features?.[0]
    let result
    if (!feat || feat.geometry == null) {
      const vt = feat?.properties?.valid_time
      result = { valid: false, lon: null, lat: null, validTime: vt || null }
    } else {
      const [rlon, rlat] = feat.geometry.coordinates
      result = {
        valid: true,
        lon: rlon,
        lat: rlat,
        validTime: feat.properties?.valid_time || null,
      }
    }
    pointCache.set(key, result)
    return result
  })
}

/**
 * Reconstructed low-resolution coastline polygons for a time slice.
 * Returns a GeoJSON FeatureCollection. We snap `time` to a 5 Ma grid so the
 * cache stays small and warm during animation.
 */
export async function coastlines(time, model) {
  const t = Math.round(time / 5) * 5
  const key = `${model}|${t}`
  if (coastCache.has(key)) return coastCache.get(key)

  return dedupe('cl:' + key, async () => {
    const url =
      `${GWS}/reconstruct/coastlines_low/?time=${t}&model=${apiId(model)}`
    const data = await getJSON(url)
    coastCache.set(key, data)
    return data
  })
}

export function snapTime(time) {
  return snap(time, 5)
}

// ---------------------------------------------------------------------------
// Synchronous cache access + interpolation. These let the render loop read
// already-fetched data every frame (no awaiting), so playback stays smooth:
// the pin glides along a great circle between sampled points and the map flips
// through cached coastline slices instead of freezing until a fetch resolves.
// ---------------------------------------------------------------------------

function cachedPointAt(lon, lat, t, model) {
  return pointCache.get(pointKey(lon, lat, t, model))
}

// Great-circle interpolation between the two sampled points bracketing `time`.
// Returns { valid, lon, lat } or null if neither bracket is cached yet.
export function interpolatePoint(lon, lat, time, model) {
  const lo = Math.floor(time / POINT_STEP) * POINT_STEP
  const hi = lo + POINT_STEP
  const a = cachedPointAt(lon, lat, lo, model)
  const b = cachedPointAt(lon, lat, Math.min(hi, 100000), model)

  if (!a && !b) return null
  // If we can't cleanly tween (missing endpoint, or crossing a land/ocean
  // boundary), just snap to whichever sampled point is nearer.
  if (!a || !b || !a.valid || !b.valid) {
    const nearer = time - lo < hi - time ? a || b : b || a
    return nearer || null
  }
  const f = (time - lo) / POINT_STEP
  return {
    valid: true,
    lon: a.lon + shortestDelta(a.lon, b.lon) * f,
    lat: a.lat + (b.lat - a.lat) * f,
  }
}

function shortestDelta(a, b) {
  return ((b - a + 540) % 360) - 180
}

// Nearest already-cached coastline slice for `model`, or null. Scans the small
// cache (a few dozen slices at most) for the closest time.
export function nearestCachedCoastlines(time, model) {
  let best = null
  let bestDist = Infinity
  const prefix = model + '|'
  for (const [key, val] of coastCache) {
    if (!key.startsWith(prefix)) continue
    const t = Number(key.slice(prefix.length))
    const d = Math.abs(t - time)
    if (d < bestDist) {
      bestDist = d
      best = val
    }
  }
  return best
}

// Small async pool so background prefetch stays polite to the public server.
async function pool(items, worker, concurrency) {
  let i = 0
  const runners = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++
      await worker(items[idx])
    }
  })
  await Promise.all(runners)
}

// Warm the point cache for a location across the whole timeline. Cheap
// requests, so we can sample finely and get buttery pin motion during play.
export async function prefetchPoints(lon, lat, model, maxTime, shouldStop) {
  const times = []
  for (let t = 0; t <= maxTime; t += POINT_STEP) times.push(t)
  await pool(
    times,
    async (t) => {
      if (shouldStop?.()) return
      await reconstructPoint(lon, lat, t, model).catch(() => {})
    },
    5
  )
}

// Warm the coastline cache for a model across the timeline (coarser grid).
export async function prefetchCoastlines(model, maxTime, onProgress, shouldStop) {
  const times = []
  for (let t = 0; t <= maxTime; t += COAST_STEP) times.push(t)
  let done = 0
  await pool(
    times,
    async (t) => {
      if (shouldStop?.()) return
      await coastlines(t, model).catch(() => {})
      done += 1
      onProgress?.(done / times.length)
    },
    3
  )
}

// ---------------------------------------------------------------------------
// Geocoding via OpenStreetMap Nominatim (free, no key). We forward the user's
// email as the required contact per Nominatim usage policy.
// ---------------------------------------------------------------------------
const NOMINATIM = 'https://nominatim.openstreetmap.org'

export async function geocode(query) {
  const url =
    `${NOMINATIM}/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Geocoding failed')
  const arr = await res.json()
  if (!arr.length) return null
  const hit = arr[0]
  return {
    lat: parseFloat(hit.lat),
    lon: parseFloat(hit.lon),
    name: hit.display_name,
  }
}

export async function reverseGeocode(lat, lon) {
  const url =
    `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=8`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    return data?.display_name || null
  } catch {
    return null
  }
}

// Structured reverse geocode → { state, country } for a present-day point, used
// to add "which state/province" to the on-today's-map perspective. Returns null
// over ocean (Nominatim can't geocode open water). Cached by coordinate; the
// caller only fires this on a settled timeline (debounced) to respect Nominatim
// rate limits. Different countries expose the first admin level under different
// keys, so we probe several.
const detailCache = new Map()
export async function reverseGeocodeDetail(lat, lon) {
  const key = `${lat},${lon}`
  if (detailCache.has(key)) return detailCache.get(key)
  const url =
    `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lon}` +
    `&zoom=8&addressdetails=1`
  let result = null
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (res.ok) {
      const data = await res.json()
      const a = data && !data.error ? data.address : null
      if (a && a.country) {
        const state =
          a.state ||
          a.province ||
          a.region ||
          a.state_district ||
          a.county ||
          null
        result = { state: state || null, country: a.country }
      }
    }
  } catch {
    /* network hiccup → treat as no detail */
  }
  detailCache.set(key, result)
  return result
}
