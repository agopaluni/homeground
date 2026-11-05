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

export default function InfoPanel({
  time,
  pin,
  place,
  modernPlace,
  modernLabel,
  life,
  playing,
  loading,
  error,
}) {
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
            {time > 5 && pin && pin.valid && modernLabel ? (
              <>
                At {time} Ma, <strong>{shortName(place.name)}</strong> sat over what
                is now <strong>{modernLabel}</strong>
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

      {place && time >= 1 && <LifeSection life={life} playing={playing} time={time} />}

      {!pin && !loading && (
        <div className="info-empty">
          Search for a place or click the globe to drop a pin, then scrub the
          timeline to watch it drift.
        </div>
      )}
    </div>
  )
}

// "Life here then" — fossil-record species for this spot and age, each linked
// to its Wikipedia article.
function LifeSection({ life, playing, time }) {
  const status = life?.status || 'idle'
  const data = life?.data

  return (
    <div className="life">
      <div className="life-head">Life here then</div>

      {status === 'idle' && playing && (
        <div className="life-note">Pause to see what lived here.</div>
      )}
      {status === 'loading' && (
        <div className="life-note">Digging through the fossil record…</div>
      )}
      {status === 'error' && (
        <div className="life-note">
          Couldn’t reach the fossil database right now. Try again in a moment.
        </div>
      )}

      {status === 'ready' && data && (
        <>
          {data.source === 'fossils' ? (
            <div className="life-note">
              Fossils found within ~{data.radiusKm} km of this spot in rocks{' '}
              {Math.round(data.window.min)}–{Math.round(data.window.max)} million years
              old.
              {data.habitat && <> {data.habitat}</>}
            </div>
          ) : (
            <div className="life-note">
              No fossils of this age are catalogued near here, so these are
              examples of life typical of the time.
            </div>
          )}

          <ul className="life-list">
            {data.items.map((it) => (
              <li key={it.name} className="life-item">
                {it.thumb ? (
                  <img className="life-thumb" src={it.thumb} alt="" loading="lazy" />
                ) : (
                  <div className="life-thumb life-thumb-empty" aria-hidden="true" />
                )}
                <div className="life-text">
                  <a href={it.url} target="_blank" rel="noreferrer" className="life-name">
                    {it.name}
                  </a>
                  <span className="life-label">
                    {it.label}
                    {it.finds ? ` · ${it.finds} ${it.finds === 1 ? 'find' : 'finds'}` : ''}
                  </span>
                  {it.description && <span className="life-desc">{it.description}</span>}
                </div>
              </li>
            ))}
          </ul>

          <div className="life-source">
            {data.source === 'fossils' ? (
              <>
                From the{' '}
                <a href="https://paleobiodb.org/" target="_blank" rel="noreferrer">
                  Paleobiology Database
                </a>
                . The fossil record is patchy — it favours hard shells, bones and
                quiet water, so absence doesn’t mean nothing lived here.
              </>
            ) : (
              <>Illustrative picks for {time} Ma, not records from this exact spot.</>
            )}
          </div>
        </>
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
