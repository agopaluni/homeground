import { useEffect, useRef } from 'react'
import { geoOrthographic, geoPath, geoGraticule10 } from 'd3-geo'

// Ease a rotation array [lambda, phi, gamma] toward a target, taking the
// short way around in longitude.
function easeRot(cur, target, k) {
  const out = cur.slice()
  let dl = ((target[0] - cur[0] + 540) % 360) - 180
  out[0] = cur[0] + dl * k
  out[1] = cur[1] + (target[1] - cur[1]) * k
  return out
}

/**
 * Canvas globe. Renders reconstructed coastlines for the current era and a pin
 * at the reconstructed position of the user's location. The view eases to keep
 * the pin centered, selling the "drift" feel. Click to drop a new pin; drag to
 * spin the globe.
 */
export default function Globe({ coastlines, pin, onPick, confidenceKey }) {
  const canvasRef = useRef(null)
  const rotRef = useRef([0, -20, 0])
  const targetRef = useRef([0, -20, 0])
  const coastRef = useRef(coastlines)
  const pinRef = useRef(pin)
  const confRef = useRef(confidenceKey)
  const dragRef = useRef(null)
  const sizeRef = useRef({ w: 0, h: 0 })

  // Keep latest props in refs so the animation loop reads fresh values.
  coastRef.current = coastlines
  pinRef.current = pin
  confRef.current = confidenceKey

  // When a valid pin position arrives, aim the globe at it.
  useEffect(() => {
    if (pin && pin.valid) {
      targetRef.current = [-pin.lon, -pin.lat, 0]
    }
  }, [pin])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf

    const colors = () => {
      const cs = getComputedStyle(document.documentElement)
      return {
        ocean: cs.getPropertyValue('--ocean').trim() || '#0b1a2a',
        oceanEdge: cs.getPropertyValue('--ocean-edge').trim() || '#12314d',
        land: cs.getPropertyValue('--land').trim() || '#c9b487',
        landStroke: cs.getPropertyValue('--land-stroke').trim() || '#8a7852',
        grat: cs.getPropertyValue('--grat').trim() || 'rgba(255,255,255,0.06)',
      }
    }

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = rect.width + 'px'
      canvas.style.height = rect.height + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sizeRef.current = { w: rect.width, h: rect.height }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement)

    const graticule = geoGraticule10()

    const draw = () => {
      const { w, h } = sizeRef.current
      const c = colors()
      rotRef.current = easeRot(rotRef.current, targetRef.current, 0.12)

      const scale = Math.min(w, h) / 2 - 8
      const projection = geoOrthographic()
        .scale(scale)
        .translate([w / 2, h / 2])
        .rotate(rotRef.current)
        .clipAngle(90)
      const path = geoPath(projection, ctx)

      ctx.clearRect(0, 0, w, h)

      // Ocean sphere.
      ctx.beginPath()
      path({ type: 'Sphere' })
      const grad = ctx.createRadialGradient(
        w / 2 - scale * 0.3,
        h / 2 - scale * 0.3,
        scale * 0.2,
        w / 2,
        h / 2,
        scale
      )
      grad.addColorStop(0, c.oceanEdge)
      grad.addColorStop(1, c.ocean)
      ctx.fillStyle = grad
      ctx.fill()

      // Graticule.
      ctx.beginPath()
      path(graticule)
      ctx.strokeStyle = c.grat
      ctx.lineWidth = 0.6
      ctx.stroke()

      // Coastlines / continents.
      const geo = coastRef.current
      if (geo && geo.features) {
        ctx.beginPath()
        path(geo)
        ctx.fillStyle = c.land
        ctx.fill()
        ctx.strokeStyle = c.landStroke
        ctx.lineWidth = 0.5
        ctx.stroke()
      }

      // Sphere outline.
      ctx.beginPath()
      path({ type: 'Sphere' })
      ctx.strokeStyle = 'rgba(120,180,240,0.35)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Pin.
      const p = pinRef.current
      if (p && p.valid) {
        const xy = projection([p.lon, p.lat])
        // Only draw if on the visible near side.
        const center = projection.invert([w / 2, h / 2])
        const visible = isVisible(projection, p.lon, p.lat, center)
        if (xy && visible) {
          const t = (Date.now() % 1600) / 1600
          const pulse = 6 + Math.sin(t * Math.PI * 2) * 3
          const conf = confRef.current
          const pinColor =
            conf === 'high' ? '#ff5c7a' : conf === 'modeled' ? '#ffb14e' : '#c88bff'
          // Halo
          ctx.beginPath()
          ctx.arc(xy[0], xy[1], pulse + 6, 0, Math.PI * 2)
          ctx.fillStyle = hexA(pinColor, 0.18)
          ctx.fill()
          // Dot
          ctx.beginPath()
          ctx.arc(xy[0], xy[1], 5, 0, Math.PI * 2)
          ctx.fillStyle = pinColor
          ctx.fill()
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  // ---- Interaction: click to pick, drag to rotate ----
  const pointerToLonLat = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const { w, h } = sizeRef.current
    const scale = Math.min(w, h) / 2 - 8
    const projection = geoOrthographic()
      .scale(scale)
      .translate([w / 2, h / 2])
      .rotate(rotRef.current)
    return projection.invert([e.clientX - rect.left, e.clientY - rect.top])
  }

  const onPointerDown = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* pointer capture is a nicety; ignore if unsupported */
    }
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    const rot = targetRef.current
    const k = 0.35
    targetRef.current = [rot[0] + dx * k, clampPhi(rot[1] - dy * k), 0]
    rotRef.current = [
      rotRef.current[0] + dx * k,
      clampPhi(rotRef.current[1] - dy * k),
      0,
    ]
    d.x = e.clientX
    d.y = e.clientY
  }
  const onPointerUp = (e) => {
    const d = dragRef.current
    dragRef.current = null
    if (d && !d.moved) {
      const ll = pointerToLonLat(e)
      if (ll && isFinite(ll[0]) && isFinite(ll[1])) {
        onPick(ll[0], ll[1])
      }
    }
  }

  return (
    <div className="globe-wrap">
      <canvas
        ref={canvasRef}
        className="globe-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => (dragRef.current = null)}
      />
      <div className="globe-hint">Click to drop a pin · drag to spin</div>
    </div>
  )
}

function clampPhi(phi) {
  return Math.max(-89, Math.min(89, phi))
}

// Is a lon/lat on the near hemisphere given the current view center?
function isVisible(projection, lon, lat, center) {
  if (!center) return true
  const geoDist = geoDistanceDeg(lon, lat, -projection.rotate()[0], -projection.rotate()[1])
  return geoDist < 90
}

function geoDistanceDeg(lon1, lat1, lon2, lat2) {
  const toR = Math.PI / 180
  const a = Math.sin(lat1 * toR) * Math.sin(lat2 * toR)
  const b =
    Math.cos(lat1 * toR) *
    Math.cos(lat2 * toR) *
    Math.cos((lon1 - lon2) * toR)
  return Math.acos(Math.max(-1, Math.min(1, a + b))) / toR
}

function hexA(hex, a) {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}
