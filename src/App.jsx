import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Globe from './Globe.jsx'
import Timeline from './Timeline.jsx'
import InfoPanel from './InfoPanel.jsx'
import {
  MODELS,
  DEFAULT_MODEL,
  reconstructPoint,
  coastlines,
  geocode,
  reverseGeocode,
  interpolatePoint,
  nearestCachedCoastlines,
  prefetchPoints,
  prefetchCoastlines,
} from './gplates.js'
import { confidenceFor } from './geology.js'
import { placeAt } from './modernPlace.js'

// Throttle a rapidly-changing value: emit at most once per `ms`, but always
// with a trailing update so the final resting value is never missed. Unlike a
// plain debounce this keeps firing during continuous autoplay (when the value
// changes every frame), so the map and pin refresh at a steady cadence instead
// of freezing until playback stops. Cache + 5 Ma snapping keep GWS load light.
function useThrottled(value, ms) {
  const [v, setV] = useState(value)
  const last = useRef(0)
  const timer = useRef(null)
  useEffect(() => {
    const now = Date.now()
    const remaining = ms - (now - last.current)
    if (remaining <= 0) {
      last.current = now
      setV(value)
    } else {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        last.current = Date.now()
        setV(value)
      }, remaining)
    }
    return () => clearTimeout(timer.current)
  }, [value, ms])
  return v
}

const SPEEDS = [
  { label: '1×', maPerSec: 25 },
  { label: '2×', maPerSec: 60 },
  { label: '4×', maPerSec: 140 },
]

export default function App() {
  const [model, setModel] = useState(DEFAULT_MODEL)
  const maxTime = MODELS[model].maxTime

  const [time, setTime] = useState(0)
  const debTime = useThrottled(time, 160)

  // Present-day location the user chose.
  const [loc, setLoc] = useState(null) // { lat, lon, name }
  const [pin, setPin] = useState(null) // reconstructed { valid, lon, lat }
  const [coast, setCoast] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)

  const [playing, setPlaying] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(0)

  const [mapProgress, setMapProgress] = useState(0) // coastline prefetch 0..1

  const reqId = useRef(0)

  // ---- Background prefetch: warm the caches so playback is smooth ----------
  // Coastline slices for the whole timeline (per model). These are location-
  // independent, so we only refetch when the model changes.
  useEffect(() => {
    let stop = false
    setMapProgress(0)
    prefetchCoastlines(model, maxTime, (p) => !stop && setMapProgress(p), () => stop)
    return () => {
      stop = true
    }
  }, [model, maxTime])

  // Point samples for the chosen location across the whole timeline. Tiny
  // requests, so this finishes fast and gives frame-by-frame pin motion.
  useEffect(() => {
    if (!loc) return
    let stop = false
    prefetchPoints(loc.lon, loc.lat, model, maxTime, () => stop)
    return () => {
      stop = true
    }
  }, [loc, model, maxTime])

  // ---- Fetch coastlines whenever the (debounced) time or model changes ----
  useEffect(() => {
    let alive = true
    coastlines(debTime, model)
      .then((data) => alive && setCoast(data))
      .catch(() => {
        /* keep last good coastlines; non-fatal */
      })
    return () => {
      alive = false
    }
  }, [debTime, model])

  // ---- Fetch reconstructed pin position ----
  useEffect(() => {
    if (!loc) return
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    reconstructPoint(loc.lon, loc.lat, debTime, model)
      .then((res) => {
        if (id !== reqId.current) return
        setPin(res)
        setLoading(false)
      })
      .catch(() => {
        if (id !== reqId.current) return
        setError('Could not reach the reconstruction service. Retrying is fine.')
        setLoading(false)
      })
  }, [loc, debTime, model])

  // ---- Play / animate ----
  useEffect(() => {
    if (!playing) return
    let raf
    let last = performance.now()
    const step = (now) => {
      const dt = (now - last) / 1000
      last = now
      setTime((t) => {
        const next = t + SPEEDS[speedIdx].maPerSec * dt
        if (next >= maxTime) {
          setPlaying(false)
          return maxTime
        }
        return next
      })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, speedIdx, maxTime])

  // Clamp time if the model's range shrank.
  useEffect(() => {
    if (time > maxTime) setTime(maxTime)
  }, [maxTime]) // eslint-disable-line

  const pickLocation = useCallback(async (lon, lat, name) => {
    const clean = { lat, lon, name: name || `${lat.toFixed(2)}, ${lon.toFixed(2)}` }
    setLoc(clean)
    if (!name) {
      const rn = await reverseGeocode(lat, lon)
      if (rn) setLoc((cur) => (cur && cur.lat === lat ? { ...cur, name: rn } : cur))
    }
  }, [])

  const onGlobePick = useCallback(
    (lon, lat) => {
      pickLocation(lon, lat)
    },
    [pickLocation]
  )

  const onSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    try {
      const hit = await geocode(query.trim())
      if (!hit) {
        setError(`No place found for “${query}”.`)
      } else {
        await pickLocation(hit.lon, hit.lat, hit.name)
      }
    } catch {
      setError('Geocoding failed. Check your connection and try again.')
    } finally {
      setSearching(false)
    }
  }

  const conf = confidenceFor(time)

  // Derived, per-frame display values. Reading the caches synchronously here
  // lets the pin glide and the map morph continuously during playback instead
  // of waiting on network round-trips. Fall back to the async-fetched state
  // for any slice not cached yet.
  const displayPin = loc ? interpolatePoint(loc.lon, loc.lat, time, model) || pin : pin
  const displayCoast = nearestCachedCoastlines(time, model) || coast

  // Cross-reference the reconstructed position with TODAY's map: what modern
  // country/ocean sits at those coordinates now? Memoised on coarsely-rounded
  // coords so we only re-run the point-in-polygon test when the pin has moved
  // enough to matter (cheap during playback).
  const pinValid = !!(displayPin && displayPin.valid)
  const rLat = pinValid ? Math.round(displayPin.lat * 2) / 2 : null
  const rLon = pinValid ? Math.round(displayPin.lon * 2) / 2 : null
  const modernPlace = useMemo(
    () => (pinValid ? placeAt(rLat, rLon) : null),
    [pinValid, rLat, rLon]
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◍</span>
          <div>
            <h1>Homeground</h1>
            <p className="tagline">Watch your hometown drift across a billion years</p>
          </div>
        </div>
        <form className="search" onSubmit={onSearch}>
          <input
            type="text"
            placeholder="Search a place — e.g. Tokyo, Mount Everest…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" disabled={searching}>
            {searching ? '…' : 'Go'}
          </button>
        </form>
        <label className="model-select">
          Model
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {Object.entries(MODELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label} (→{v.maxTime} Ma)
              </option>
            ))}
          </select>
        </label>
      </header>

      <main className="stage">
        <div className="globe-col">
          <Globe
            coastlines={displayCoast}
            pin={displayPin}
            onPick={onGlobePick}
            confidenceKey={conf.key}
          />
          {mapProgress > 0 && mapProgress < 1 && (
            <div className="map-warming">
              Warming the deep-time map… {Math.round(mapProgress * 100)}%
            </div>
          )}
        </div>
        <aside className="side-col">
          <InfoPanel
            time={Math.round(time)}
            pin={displayPin}
            place={loc}
            modernPlace={modernPlace}
            loading={loading}
            error={error}
          />
        </aside>
      </main>

      <footer className="controls">
        <div className="transport">
          <button
            className="play-btn"
            onClick={() => {
              if (time >= maxTime) setTime(0)
              setPlaying((p) => !p)
            }}
          >
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <div className="speed">
            {SPEEDS.map((s, i) => (
              <button
                key={s.label}
                className={i === speedIdx ? 'active' : ''}
                onClick={() => setSpeedIdx(i)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="time-readout">
            <span className="time-num">{Math.round(time)}</span>
            <span className="time-unit">Ma ago</span>
          </div>
        </div>
        <Timeline time={time} maxTime={maxTime} onChange={(t) => setTime(t)} />
        <p className="disclaimer">
          Positions come from the{' '}
          <a href="https://gws.gplates.org/" target="_blank" rel="noreferrer">
            GPlates Web Service
          </a>{' '}
          (EarthByte, Univ. of Sydney). Deep-time reconstructions are models, not
          measurements — certainty falls off sharply beyond ~200 Ma.
        </p>
      </footer>
    </div>
  )
}
