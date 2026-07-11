import { useState } from 'react'
import {
  periodFor,
  confidenceFor,
  supercontinentFor,
  hemisphere,
  facts,
} from './geology'

const ACCRETION_CAVEAT =
  'Within a single modern mountain range or region, neighbouring rocks can have ' +
  'wildly different deep-time histories. Accretion stitches together terranes that ' +
  'drifted in separately, so a point a few kilometres away may show a completely ' +
  'different past — a single pin can’t capture a whole range.'

export default function InfoPanel({ time, pin, place, modernPlace, loading, error }) {
  const [showExplainer, setShowExplainer] = useState(false)
  const conf = confidenceFor(time)
  const period = periodFor(time)
  const sc = supercontinentFor(time)
  const placeName = place?.name

  const factList =
    pin && pin.valid
      ? facts({ valid: true, lat: pin.lat, time })
      : pin
      ? facts({ valid: false, time })
      : []

  return (
    <div className="info-panel">
      <div className="info-head">
        <div>
          <div className="info-place">{placeName || 'No location selected'}</div>
          <div className="info-sub">
            {period} · {time} Ma
          </div>
        </div>
        <div className={`conf-chip conf-${conf.key}`}>
          {conf.label}
          <button
            className="conf-info"
            aria-label="What does confidence mean?"
            onClick={() => setShowExplainer((v) => !v)}
          >
            i
          </button>
        </div>
      </div>

      {showExplainer && (
        <div className="conf-explainer">
          <strong>{conf.label}.</strong> {conf.blurb}
          <div className="conf-explainer-note">
            Reconstructions grow less certain the further back you go. Longitude
            especially is loosely constrained in deep time.
          </div>
          <div className="conf-explainer-note">{ACCRETION_CAVEAT}</div>
        </div>
      )}

      {error && <div className="info-error">{error}</div>}

      {loading && <div className="info-loading">Reconstructing…</div>}

      {!error && pin && (
        <div className="info-body">
          {pin.valid ? (
            <>
              <div className="info-stat-row">
                <div className="info-stat">
                  <div className="info-stat-num">{fmtLat(pin.lat)}</div>
                  <div className="info-stat-lbl">paleo-latitude</div>
                </div>
                <div className="info-stat">
                  <div className="info-stat-num">{fmtLon(pin.lon)}</div>
                  <div className="info-stat-lbl">paleo-longitude</div>
                </div>
              </div>
              <div className="info-line">{hemisphere(pin.lat)}</div>
              {sc && (
                <div className="info-line">
                  Part of the world of <strong>{sc}</strong>
                  <span className="info-caveat"> (era-based estimate)</span>
                </div>
              )}
            </>
          ) : (
            <div className="info-ocean">
              🌊 This location was <strong>not on land</strong> at {time} Ma.
              <div className="info-ocean-note">{ACCRETION_CAVEAT}</div>
            </div>
          )}
          <ul className="info-facts">
            {factList.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {place && (
        <div className="info-today">
          <div className="info-today-head">On today’s map</div>
          <div className="info-today-body">
            {time > 5 && pin && pin.valid && modernPlace ? (
              <>
                At {time} Ma, <strong>{shortName(place.name)}</strong> sat over what
                is now <strong>{modernPlace.name}</strong>
                {' '}({fmtLat(pin.lat)}, {fmtLon(pin.lon)}) — a drift of about{' '}
                <strong>{Math.abs(place.lat - pin.lat).toFixed(0)}° of latitude</strong>{' '}
                {place.lat >= pin.lat ? 'north' : 'south'}
                {crossedEquator(pin.lat, place.lat) ? ', across the equator' : ''}.
              </>
            ) : time > 5 && pin && !pin.valid ? (
              <>
                At {time} Ma, this crust hadn’t assembled into the land you know as{' '}
                <strong>{shortName(place.name)}</strong> yet.
              </>
            ) : (
              <>
                <strong>{shortName(place.name)}</strong> sits at {fmtLat(place.lat)},{' '}
                {fmtLon(place.lon)} today. Scrub back in time to see where this ground
                used to be on the modern map.
              </>
            )}
          </div>
        </div>
      )}

      {!pin && !loading && (
        <div className="info-empty">
          Search for a place or click the globe to drop a pin, then scrub the
          timeline to watch it drift.
        </div>
      )}
    </div>
  )
}

// Keep just the first couple of components of a long geocoded name.
function shortName(name) {
  if (!name) return 'This spot'
  return name.split(',').slice(0, 2).join(',').trim()
}

function crossedEquator(a, b) {
  return a === 0 || b === 0 ? false : a > 0 !== b > 0
}

function fmtLat(lat) {
  const dir = lat >= 0 ? 'N' : 'S'
  return `${Math.abs(lat).toFixed(1)}°${dir}`
}
function fmtLon(lon) {
  const dir = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lon).toFixed(1)}°${dir}`
}
