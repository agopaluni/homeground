// "What is at these coordinates on TODAY's map?" — the reconstructed pin gives
// a paleo-position in the modern lat/lon reference frame, so overlaying today's
// geography answers "your hometown was sitting where ___ is now." This gives
// people a spatial anchor, since reading raw lat/lon on a globe is hard.
//
// Done locally with a bundled countries dataset so it works offline, per-frame,
// with no geocoding rate limits.
//
// NOTE: we use planar (lon/lat) ray-casting rather than d3-geo's spherical
// geoContains. geoContains depends on ring winding order, and this dataset
// follows the RFC 7946 (counter-clockwise) convention that is the *opposite*
// of what d3 expects — which makes small countries "contain" half the planet.
// Ray-casting is winding-agnostic and plenty accurate at country resolution.
import countries from './data/countries.geo.json'

const features = countries.features

function pointInRing(lon, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// poly = [exteriorRing, hole1, hole2, ...]
function pointInPolygon(lon, lat, poly) {
  if (!pointInRing(lon, lat, poly[0])) return false
  for (let k = 1; k < poly.length; k++) {
    if (pointInRing(lon, lat, poly[k])) return false // inside a hole
  }
  return true
}

/**
 * Returns { name, isOcean } for a present-day lat/lon.
 * If no country contains the point, we name the ocean basin instead.
 */
export function placeAt(lat, lon) {
  for (const f of features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Polygon') {
      if (pointInPolygon(lon, lat, g.coordinates)) {
        return { name: f.properties.name, isOcean: false }
      }
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) {
        if (pointInPolygon(lon, lat, poly)) {
          return { name: f.properties.name, isOcean: false }
        }
      }
    }
  }
  return { name: oceanBasin(lat, lon), isOcean: true }
}

// Coarse ocean-basin naming — enough for "out over what's now the Pacific".
function oceanBasin(lat, lon) {
  if (lat >= 66) return 'the Arctic Ocean'
  if (lat <= -60) return 'the Southern Ocean'
  const L = ((lon + 540) % 360) - 180 // normalise to [-180, 180)
  // Atlantic: the wedge between the Americas and Europe/Africa.
  if (L > -83 && L < 25) return 'the Atlantic Ocean'
  // Indian: east of Africa to around Australia.
  if (L >= 25 && L < 147 && lat < 32) return 'the Indian Ocean'
  return 'the Pacific Ocean'
}
