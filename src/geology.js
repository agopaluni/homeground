// Geological reference data used to make the timeline meaningful and to
// generate plain-language context in the info panel.

// Labelled reference points along the timeline (Ma = millions of years ago).
export const ERA_MARKERS = [
  { time: 0, label: 'Today' },
  { time: 2.5, label: 'First humans' },
  { time: 66, label: 'Dinosaur extinction' },
  { time: 175, label: 'Pangea breakup begins' },
  { time: 250, label: 'Great Dying' },
  { time: 335, label: 'Pangea assembled' },
  { time: 540, label: 'Cambrian explosion' },
  { time: 750, label: 'Rodinia breakup' },
  { time: 1000, label: 'Rodinia' },
]

// Named geological periods for a "what era is this?" readout.
const PERIODS = [
  { start: 0, end: 2.6, name: 'Quaternary' },
  { start: 2.6, end: 23, name: 'Neogene' },
  { start: 23, end: 66, name: 'Paleogene' },
  { start: 66, end: 145, name: 'Cretaceous' },
  { start: 145, end: 201, name: 'Jurassic' },
  { start: 201, end: 252, name: 'Triassic' },
  { start: 252, end: 299, name: 'Permian' },
  { start: 299, end: 359, name: 'Carboniferous' },
  { start: 359, end: 419, name: 'Devonian' },
  { start: 419, end: 444, name: 'Silurian' },
  { start: 444, end: 485, name: 'Ordovician' },
  { start: 485, end: 541, name: 'Cambrian' },
  { start: 541, end: 1000, name: 'Neoproterozoic' },
  { start: 1000, end: 100000, name: 'Precambrian' },
]

export function periodFor(time) {
  const p = PERIODS.find((p) => time >= p.start && time < p.end)
  return p ? p.name : 'deep Precambrian'
}

// Confidence bands. The farther back, the less ocean-floor magnetic record
// survives to constrain the reconstruction.
export const CONFIDENCE = [
  {
    max: 200,
    key: 'high',
    label: 'High confidence',
    blurb:
      'Well constrained by preserved ocean-floor magnetic stripes, which record ' +
      'plate motions precisely for roughly the last 200 million years.',
  },
  {
    max: 750,
    key: 'modeled',
    label: 'Modeled estimate',
    blurb:
      'Older ocean crust has been subducted and destroyed, so positions here ' +
      'rely on paleomagnetism and geological correlation rather than seafloor data.',
  },
  {
    max: Infinity,
    key: 'approx',
    label: 'Highly approximate',
    blurb:
      'Deep-time reconstructions are inferred from paleomagnetic latitudes and ' +
      'sparse rock evidence. Longitude in particular is poorly constrained — treat ' +
      'these positions as a plausible model, not a measurement.',
  },
]

export function confidenceFor(time) {
  return CONFIDENCE.find((c) => time <= c.max)
}

// Supercontinent membership is only a coarse heuristic based on age; it is not
// derived per-location. We phrase it accordingly in the UI.
export function supercontinentFor(time) {
  if (time < 175) return null // continents dispersing toward their modern layout
  if (time < 320) return 'Pangea'
  if (time < 540) return 'Gondwana / Laurussia assembling'
  if (time < 750) return 'post-Rodinia fragments'
  return 'Rodinia'
}

export function hemisphere(lat) {
  if (lat > 0) return 'Northern Hemisphere'
  if (lat < 0) return 'Southern Hemisphere'
  return 'the Equator'
}

// Build a couple of plain-language facts for the current reconstructed state.
export function facts({ valid, lat, time }) {
  const out = []
  if (!valid) {
    out.push(
      'At this time this spot was not part of any reconstructed landmass — it was ' +
        'likely open ocean, or crust that has since been recycled into the mantle.'
    )
    return out
  }
  const absLat = Math.abs(lat)
  if (absLat < 12) {
    out.push('It sat almost on the equator — tropical, and probably warm year-round.')
  } else if (absLat < 30) {
    out.push('It lay in the subtropics.')
  } else if (absLat > 66) {
    out.push('It was in polar latitudes — near one of the poles.')
  } else {
    out.push(`It sat at about ${Math.round(absLat)}° from the equator, in the mid-latitudes.`)
  }

  const sc = supercontinentFor(time)
  if (sc === 'Pangea') {
    out.push('This was during the age of Pangea, when nearly all land was fused into one supercontinent.')
  } else if (sc === 'Rodinia') {
    out.push('This predates most complex life on land — the supercontinent Rodinia dominated the globe.')
  }
  return out
}
