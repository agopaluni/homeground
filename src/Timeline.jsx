import { ERA_MARKERS, CONFIDENCE } from './geology'

// Horizontal timeline: a range input over a confidence-coloured track, with
// labelled geological markers. Because the recent end is crowded (Today and
// First humans sit almost on top of each other on a billion-year scale), the
// markers alternate above and below the track so nothing collides.
export default function Timeline({ time, maxTime, onChange }) {
  const pct = (t) => (t / maxTime) * 100

  const markers = ERA_MARKERS.filter((m) => m.time <= maxTime)

  // Confidence gradient stops, clipped to the model's max time.
  const bands = CONFIDENCE.map((c, i) => {
    const start = i === 0 ? 0 : CONFIDENCE[i - 1].max
    const end = Math.min(c.max, maxTime)
    return { ...c, start, end }
  }).filter((b) => b.start < maxTime)

  const bandColor = { high: '#2f6d4f', modeled: '#7a5a2a', approx: '#5a3a6e' }

  // Labels near the crowded recent end (and the far edge) anchor to one side so
  // they extend away from their neighbours instead of overlapping them.
  const alignFor = (p) => (p < 12 ? 'left' : p > 88 ? 'right' : 'center')

  return (
    <div className="timeline">
      <div className="timeline-track-wrap">
        {/* Marker ticks. Labels cycle through 4 vertical lanes (2 above the
            track, 2 below) so tightly-spaced markers never collide. */}
        {markers.map((m, i) => {
          const p = pct(m.time)
          const lane = i % 4 // 0: above-far, 1: below-near, 2: above-near, 3: below-far
          return (
            <div
              key={m.label}
              className={`era-tick era-lane-${lane} align-${alignFor(p)}`}
              style={{ left: p + '%' }}
            >
              <button
                type="button"
                className="era-tick-label"
                onClick={() => onChange(m.time)}
                title={`Jump to ${m.time} Ma`}
              >
                <span className="era-tick-name">{m.label}</span>
                <span className="era-tick-ma">{m.time} Ma</span>
              </button>
              <div className="era-tick-line" />
            </div>
          )
        })}

        {/* Confidence band background (the visual track) */}
        <div className="conf-band">
          {bands.map((b) => (
            <div
              key={b.key}
              className="conf-seg"
              style={{
                left: pct(b.start) + '%',
                width: pct(b.end - b.start) + '%',
                background: bandColor[b.key],
              }}
              title={`${b.label}: ${b.blurb}`}
            />
          ))}
        </div>

        <input
          type="range"
          min={0}
          max={maxTime}
          step={1}
          value={time}
          onChange={(e) => onChange(Number(e.target.value))}
          className="timeline-range"
          aria-label="Geological time in millions of years ago"
        />
      </div>
    </div>
  )
}
