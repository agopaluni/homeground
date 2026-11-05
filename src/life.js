// "What lived here then?" — fossil occurrences from the Paleobiology Database
// (PBDB, https://paleobiodb.org), linked to Wikipedia.
//
// We query PBDB around the pin's PRESENT-DAY coordinates: fossils are catalogued
// where the rock sits today, and that rock travelled with the plate, so the
// fossils found here are the organisms that lived at this spot at that time —
// no paleo-coordinate conversion needed.
//
// Raw occurrence counts are dominated by plants, clams and microfossils, so we
// group genera into plain-language categories, boost the charismatic ones a
// little, and pick one genus per category for variety. If the local record is
// empty, we fall back to a short curated list of life typical of the period
// (marine-only when the spot wasn't on land), clearly labelled as such.

const PBDB = 'https://paleobiodb.org/data1.2/occs/taxa.json'
const WIKI = 'https://en.wikipedia.org/w/api.php'

const MAX_ITEMS = 6

// ---------------------------------------------------------------------------
// Classification: [label, habitat ('land' | 'sea' | 'fresh' | 'both'), weight]
// ---------------------------------------------------------------------------
const DINO_FAMILIES = new Set(
  (
    'Tyrannosauridae Dromaeosauridae Troodontidae Ornithomimidae Caenagnathidae ' +
    'Oviraptoridae Therizinosauridae Alvarezsauridae Abelisauridae Noasauridae ' +
    'Allosauridae Carcharodontosauridae Megalosauridae Spinosauridae Coelophysidae ' +
    'Compsognathidae Ceratosauridae Dilophosauridae Herrerasauridae Ceratopsidae ' +
    'Protoceratopsidae Leptoceratopsidae Psittacosauridae Pachycephalosauridae ' +
    'Hadrosauridae Lambeosaurinae Iguanodontidae Thescelosauridae Hypsilophodontidae ' +
    'Heterodontosauridae Ankylosauridae Nodosauridae Stegosauridae Diplodocidae ' +
    'Dicraeosauridae Brachiosauridae Camarasauridae Titanosauridae Saltasauridae ' +
    'Mamenchisauridae Plateosauridae Massospondylidae Rebbachisauridae'
  ).split(' ')
)

const BY_FAMILY = {
  Mosasauridae: ['Marine reptile', 'sea', 3],
  Ichthyornithidae: ['Seabird', 'sea', 1.8],
  Hesperornithidae: ['Seabird', 'sea', 1.8],
}

const BY_ORDER = {
  Theropoda: ['Dinosaur', 'land', 3],
  Sauropoda: ['Dinosaur', 'land', 3],
  Sauropodomorpha: ['Dinosaur', 'land', 3],
  Ornithopoda: ['Dinosaur', 'land', 3],
  Ceratopsia: ['Dinosaur', 'land', 3],
  Ichthyosauria: ['Marine reptile', 'sea', 3],
  Plesiosauria: ['Marine reptile', 'sea', 3],
  Sauropterygia: ['Marine reptile', 'sea', 3],
  Nothosauroidea: ['Marine reptile', 'sea', 3],
  Pterosauria: ['Pterosaur', 'land', 3],
  Crocodylia: ['Crocodilian', 'fresh', 1.4],
  Testudines: ['Turtle', 'both', 1.2],
  Choristodera: ['Aquatic reptile', 'fresh', 1.3],
  Ammonitida: ['Ammonite', 'sea', 2],
  Ceratitida: ['Ammonite', 'sea', 2],
  Goniatitida: ['Ammonite', 'sea', 2],
  Phylloceratida: ['Ammonite', 'sea', 2],
  Lytoceratida: ['Ammonite', 'sea', 2],
  Belemnitida: ['Belemnite', 'sea', 1.6],
  Eurypterida: ['Sea scorpion', 'sea', 2.5],
  Cetacea: ['Whale', 'sea', 2.5],
  Proboscidea: ['Elephant relative', 'land', 2.5],
  Primates: ['Primate', 'land', 2],
  Carnivora: ['Carnivorous mammal', 'land', 2],
  Perissodactyla: ['Hoofed mammal', 'land', 1.8],
  Artiodactyla: ['Hoofed mammal', 'land', 1.8],
  Ichthyornithiformes: ['Seabird', 'sea', 1.8],
  Ichthyornithes: ['Seabird', 'sea', 1.8],
  Hesperornithes: ['Seabird', 'sea', 1.8],
  Hesperornithiformes: ['Seabird', 'sea', 1.8],
  Nektaspidida: ['Arthropod', 'sea', 1.3],
  Bradoriida: ['Arthropod', 'sea', 1],
}

const BY_CLASS = {
  Ornithischia: ['Dinosaur', 'land', 3],
  Saurischia: ['Dinosaur', 'land', 3],
  Dinosauria: ['Dinosaur', 'land', 3],
  Mammalia: ['Mammal', 'land', 1.6],
  Aves: ['Bird', 'land', 1.6],
  Reptilia: ['Reptile', 'land', 1.3],
  Synapsida: ['Proto-mammal', 'land', 2],
  Therapsida: ['Proto-mammal', 'land', 2],
  Amphibia: ['Amphibian', 'fresh', 1.2],
  Temnospondyli: ['Amphibian', 'fresh', 1.2],
  Osteichthyes: ['Bony fish', 'both', 1],
  Actinopterygii: ['Bony fish', 'both', 1],
  Sarcopterygii: ['Lobe-finned fish', 'both', 1.5],
  Chondrichthyes: ['Shark or ray', 'sea', 1.5],
  Elasmobranchii: ['Shark or ray', 'sea', 1.5],
  Placodermi: ['Armoured fish', 'sea', 2.5],
  Insecta: ['Insect', 'land', 1.2],
  Arachnida: ['Arachnid', 'land', 1],
  Merostomata: ['Horseshoe crab', 'sea', 1.5],
  Malacostraca: ['Crustacean', 'sea', 0.9],
  Trilobita: ['Trilobite', 'sea', 2.2],
  Ostracoda: ['Ostracod', 'sea', 0.2],
  Bivalvia: ['Clam', 'sea', 0.8],
  Gastropoda: ['Snail', 'both', 0.8],
  Cephalopoda: ['Cephalopod', 'sea', 1.6],
  Rhynchonellata: ['Brachiopod', 'sea', 0.9],
  Strophomenata: ['Brachiopod', 'sea', 0.9],
  Lingulata: ['Brachiopod', 'sea', 0.9],
  Anthozoa: ['Coral', 'sea', 1],
  Echinoidea: ['Sea urchin', 'sea', 1],
  Crinoidea: ['Sea lily', 'sea', 1.1],
  Asteroidea: ['Starfish', 'sea', 1],
  Blastoidea: ['Blastoid', 'sea', 1],
  Graptolithina: ['Graptolite', 'sea', 1.4],
  Graptolithoidea: ['Graptolite', 'sea', 1.4],
  Stenolaemata: ['Bryozoan', 'sea', 0.6],
  Gymnolaemata: ['Bryozoan', 'sea', 0.6],
  Demospongea: ['Sponge', 'sea', 0.8],
  Hexactinellida: ['Sponge', 'sea', 0.8],
  Lycopsida: ['Club moss', 'land', 1],
  Polypodiopsida: ['Fern', 'land', 1],
  Filicopsida: ['Fern', 'land', 1],
  Equisetopsida: ['Horsetail', 'land', 1],
  Pinopsida: ['Conifer', 'land', 1],
  Ginkgoopsida: ['Ginkgo', 'land', 1.2],
  Cycadopsida: ['Cycad', 'land', 1.2],
  Magnoliopsida: ['Flowering plant', 'land', 0.9],
  Liliopsida: ['Flowering plant', 'land', 0.9],
  Magnoliophyta: ['Flowering plant', 'land', 0.9],
  Gymnospermopsida: ['Seed plant', 'land', 1],
}

const BY_PHYLUM = {
  Angiospermae: ['Flowering plant', 'land', 0.9],
  Coniferophyta: ['Conifer', 'land', 1],
  Pteridophyta: ['Fern', 'land', 1],
  Lycophyta: ['Club moss', 'land', 1],
  Ginkgophyta: ['Ginkgo', 'land', 1.2],
  Cycadophyta: ['Cycad', 'land', 1.2],
  Pteridospermophyta: ['Seed fern', 'land', 1.1],
  Bryophyta: ['Moss', 'land', 0.6],
  Magnoliophyta: ['Flowering plant', 'land', 0.9],
  Arthropoda: ['Arthropod', 'both', 1.1],
  Mollusca: ['Mollusc', 'sea', 0.9],
  Priapulida: ['Marine worm', 'sea', 1.2],
  Annelida: ['Marine worm', 'sea', 1],
  Lobopodia: ['Lobopodian', 'sea', 1.5],
  Brachiopoda: ['Brachiopod', 'sea', 0.9],
  Bryozoa: ['Bryozoan', 'sea', 0.6],
  Porifera: ['Sponge', 'sea', 0.8],
  Echinodermata: ['Echinoderm', 'sea', 1],
  Cnidaria: ['Cnidarian', 'sea', 1],
  Retaria: ['Foraminifer', 'sea', 0.15],
  Foraminifera: ['Foraminifer', 'sea', 0.15],
  Radiozoa: ['Radiolarian', 'sea', 0.15],
  Haptophyta: ['Coccolith algae', 'sea', 0.1],
  Bacillariophyta: ['Diatom', 'both', 0.1],
  Dinoflagellata: ['Dinoflagellate', 'sea', 0.1],
  Chlorophyta: ['Green alga', 'both', 0.3],
  Rhodophyta: ['Red alga', 'sea', 0.3],
  Cyanobacteria: ['Cyanobacteria', 'sea', 0.5],
}

const known = (v) => v && !v.startsWith('NO_')

function classify(r) {
  if (known(r.fml) && DINO_FAMILIES.has(r.fml)) return ['Dinosaur', 'land', 3]
  if (known(r.fml) && BY_FAMILY[r.fml]) return BY_FAMILY[r.fml]
  if (known(r.odl) && BY_ORDER[r.odl]) return BY_ORDER[r.odl]
  if (known(r.cll) && BY_CLASS[r.cll]) return BY_CLASS[r.cll]
  if (known(r.phl) && BY_PHYLUM[r.phl]) return BY_PHYLUM[r.phl]
  const fallback = known(r.cll) ? r.cll : known(r.phl) ? r.phl : 'Organism'
  return [fallback, 'both', 0.7]
}

// ---------------------------------------------------------------------------
// PBDB query
// ---------------------------------------------------------------------------

// Time window around the target age: tight for recent times, wider in deep time
// (where stage boundaries — and dating — are coarser).
function timeWindow(time) {
  const half = Math.min(20, Math.max(2, time * 0.06))
  return { min: Math.max(0, time - half), max: time + half }
}

function box(lat, lon, radiusKm) {
  const dLat = radiusKm / 111
  const dLon = Math.min(60, radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180))))
  return {
    latmin: Math.max(-90, lat - dLat),
    latmax: Math.min(90, lat + dLat),
    lngmin: Math.max(-180, lon - dLon),
    lngmax: Math.min(180, lon + dLon),
  }
}

async function fetchJSON(url, ms = 15000) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function pbdbGenera(lat, lon, radiusKm, win) {
  const b = box(lat, lon, radiusKm)
  const url =
    `${PBDB}?lngmin=${b.lngmin.toFixed(2)}&lngmax=${b.lngmax.toFixed(2)}` +
    `&latmin=${b.latmin.toFixed(2)}&latmax=${b.latmax.toFixed(2)}` +
    `&max_ma=${win.max.toFixed(1)}&min_ma=${win.min.toFixed(1)}` +
    `&rank=genus&show=class&limit=all`
  const data = await fetchJSON(url)
  // Drop form-taxa / ichnotaxa (flag F / I) — trackways, burrows, etc. — and
  // pollen/spore form-genera, which PBDB doesn't always flag but which describe
  // microscopic grains rather than the plants themselves.
  return (data.records || []).filter(
    (r) => r.nam && !(r.flg && /[FI]/.test(r.flg)) && !POLLEN.test(r.nam)
  )
}

const POLLEN = /(pollenit|sporit|colpit|pollis$|sporis$|triletes$|monolete)/i

// Group genera by category, rank categories by their best weighted score, and
// keep the top few genera of each as candidates (so a Wikipedia miss can fall
// through to the next genus in the same category).
function rankCandidates(records) {
  const groups = new Map()
  for (const r of records) {
    const [label, habitat, weight] = classify(r)
    const score = (r.noc || 1) * weight
    if (!groups.has(label)) groups.set(label, { label, habitat, best: 0, total: 0, genera: [] })
    const g = groups.get(label)
    g.best = Math.max(g.best, score)
    g.total += r.noc || 1
    g.genera.push({ name: r.nam, finds: r.noc || 1, score })
  }
  const ranked = [...groups.values()].sort((a, b) => b.best - a.best)
  for (const g of ranked) g.genera.sort((a, b) => b.score - a.score)
  return ranked
}

function habitatSummary(groups) {
  let sea = 0
  let land = 0
  for (const g of groups) {
    if (g.habitat === 'sea') sea += g.total
    else if (g.habitat === 'land' || g.habitat === 'fresh') land += g.total
  }
  const all = sea + land
  if (!all) return null
  const s = sea / all
  if (s > 0.75) return 'Mostly marine fossils — this spot was likely under a sea.'
  if (s < 0.25) return 'Mostly land and freshwater fossils — this spot was likely dry land, rivers or lakes.'
  return 'A mix of land and marine fossils — possibly a coastline or a shifting shoreline.'
}

// ---------------------------------------------------------------------------
// Wikipedia (one batched request for all candidate titles)
// ---------------------------------------------------------------------------
const BIO_HINT =
  /genus|species|extinct|fossil|family|order|class|phylum|kingdom|clade|taxon|dinosaur|reptile|mammal|bird|fish|shark|plant|tree|fern|insect|animal|organism|snail|clam|coral|arthropod|mollusc|ammonite|trilobite|cephalopod|brachiopod|echinoderm|sponge|alga|crustacean|amphibian|whale|primate|bacteri|prokaryot|protozo|protist|crinoid|conifer|cycad|moss|archosaur|synapsid|eukaryot|worm|horse|mammoth|sperm/i

async function wikiLookup(titles) {
  const out = new Map()
  const unique = [...new Set(titles)].slice(0, 50)
  if (!unique.length) return out
  const url =
    `${WIKI}?action=query&format=json&origin=*&redirects=1` +
    `&prop=pageprops|description|pageimages&ppprop=disambiguation` +
    `&piprop=thumbnail&pithumbsize=96&titles=${encodeURIComponent(unique.join('|'))}`
  let q
  try {
    q = (await fetchJSON(url, 10000)).query || {}
  } catch {
    return out // Wikipedia down → caller falls back to search links
  }
  const alias = new Map()
  for (const n of q.normalized || []) alias.set(n.from, n.to)
  for (const r of q.redirects || []) alias.set(r.from, r.to)
  const byTitle = new Map()
  for (const p of Object.values(q.pages || {})) byTitle.set(p.title, p)
  for (const t of unique) {
    let cur = t
    for (let i = 0; i < 3 && alias.has(cur); i++) cur = alias.get(cur)
    const p = byTitle.get(cur)
    if (!p || 'missing' in p || p.pageprops?.disambiguation !== undefined) continue
    if (p.description && !BIO_HINT.test(p.description)) continue // wrong article
    out.set(t, {
      title: p.title,
      description: p.description || null,
      thumb: p.thumbnail?.source || null,
    })
  }
  return out
}

export function wikiUrl(title) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}
function wikiSearchUrl(q) {
  return `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`
}

// ---------------------------------------------------------------------------
// Curated fallback: typical life of each period, split by land / sea.
// ---------------------------------------------------------------------------
const TYPICAL = [
  { max: 2.6, land: [['Woolly mammoth', 'Mammal'], ['Smilodon', 'Mammal'], ['Megatherium', 'Mammal']], sea: [['Blue whale', 'Whale'], ['Otodus megalodon', 'Shark or ray']] },
  { max: 23, land: [['Deinotherium', 'Elephant relative'], ['Hipparion', 'Hoofed mammal'], ['Paraceratherium', 'Mammal']], sea: [['Otodus megalodon', 'Shark or ray'], ['Livyatan', 'Whale']] },
  { max: 66, land: [['Gastornis', 'Bird'], ['Titanoboa', 'Reptile'], ['Eohippus', 'Hoofed mammal']], sea: [['Basilosaurus', 'Whale'], ['Nummulite', 'Foraminifer']] },
  { max: 145, land: [['Tyrannosaurus', 'Dinosaur'], ['Triceratops', 'Dinosaur'], ['Quetzalcoatlus', 'Pterosaur']], sea: [['Mosasaurus', 'Marine reptile'], ['Elasmosaurus', 'Marine reptile'], ['Cretoxyrhina', 'Shark or ray']] },
  { max: 201, land: [['Allosaurus', 'Dinosaur'], ['Stegosaurus', 'Dinosaur'], ['Archaeopteryx', 'Bird']], sea: [['Ichthyosaurus', 'Marine reptile'], ['Plesiosaurus', 'Marine reptile'], ['Ammonoidea', 'Ammonite']] },
  { max: 252, land: [['Coelophysis', 'Dinosaur'], ['Postosuchus', 'Reptile'], ['Lystrosaurus', 'Proto-mammal']], sea: [['Shonisaurus', 'Marine reptile'], ['Nothosaurus', 'Marine reptile'], ['Ceratites', 'Ammonite']] },
  { max: 299, land: [['Dimetrodon', 'Proto-mammal'], ['Scutosaurus', 'Reptile'], ['Glossopteris', 'Seed fern']], sea: [['Helicoprion', 'Shark or ray'], ['Fusulinida', 'Foraminifer']] },
  { max: 359, land: [['Meganeura', 'Insect'], ['Arthropleura', 'Arthropod'], ['Lepidodendron', 'Club moss']], sea: [['Stethacanthus', 'Shark or ray'], ['Crinoid', 'Sea lily'], ['Goniatitida', 'Ammonite']] },
  { max: 419, land: [['Tiktaalik', 'Lobe-finned fish'], ['Archaeopteris', 'Tree'], ['Rhynia', 'Early land plant']], sea: [['Dunkleosteus', 'Armoured fish'], ['Phacops', 'Trilobite'], ['Ammonoidea', 'Ammonite']] },
  { max: 444, land: [['Cooksonia', 'Early land plant']], sea: [['Eurypterus', 'Sea scorpion'], ['Pentamerus', 'Brachiopod'], ['Halysites', 'Coral']] },
  { max: 485, land: [], sea: [['Cameroceras', 'Cephalopod'], ['Isotelus', 'Trilobite'], ['Graptolithina', 'Graptolite']] },
  { max: 541, land: [], sea: [['Anomalocaris', 'Arthropod'], ['Hallucigenia', 'Lobopodian'], ['Olenellus', 'Trilobite']] },
  { max: 635, land: [], sea: [['Dickinsonia', 'Ediacaran organism'], ['Charnia', 'Ediacaran organism'], ['Spriggina', 'Ediacaran organism']] },
  { max: Infinity, land: [], sea: [['Stromatolite', 'Microbial mat'], ['Cyanobacteria', 'Microbe'], ['Acritarch', 'Microfossil']] },
]

function typicalFor(time, onLand) {
  const era = TYPICAL.find((e) => time <= e.max)
  const land = onLand ? era.land : []
  // Interleave land and sea picks so both habitats show up.
  const picks = []
  for (let i = 0; i < 3; i++) {
    if (land[i]) picks.push(land[i])
    if (era.sea[i]) picks.push(era.sea[i])
  }
  return picks.slice(0, 5)
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
const cache = new Map()

/**
 * What lived at this present-day spot around `time` Ma?
 * @param onLand whether the reconstructed point sat on continental crust
 * Resolves to:
 *   { source: 'fossils', items, habitat, radiusKm, window, total }
 *   { source: 'typical', items, window }
 * Each item: { name, label, finds?, url, description, thumb }
 */
export async function lifeAt(lat, lon, time, onLand) {
  const key = `${lat.toFixed(2)}|${lon.toFixed(2)}|${Math.round(time)}|${onLand}`
  if (cache.has(key)) return cache.get(key)

  const win = timeWindow(time)
  let records = []
  let radiusKm = 0
  let usedWin = win
  // Widen the search progressively until we find a meaningful fossil record.
  const attempts = [
    [250, win],
    [600, win],
    [1200, { min: Math.max(0, win.min - (win.max - win.min) / 2), max: win.max + (win.max - win.min) / 2 }],
  ]
  for (const [r, w] of attempts) {
    records = await pbdbGenera(lat, lon, r, w)
    radiusKm = r
    usedWin = w
    if (records.length >= 6) break
  }

  let result
  if (records.length) {
    const groups = rankCandidates(records)
    const top = groups.slice(0, 10)
    const wiki = await wikiLookup(top.flatMap((g) => g.genera.slice(0, 3).map((x) => x.name)))
    // Prefer categories with a real Wikipedia article; only use search-link
    // entries to fill any remaining slots. Keep the original category ranking.
    const picks = top.map((g, rank) => {
      const hit = g.genera.slice(0, 3).find((x) => wiki.has(x.name))
      return { g, rank, genus: hit || g.genera[0], hasPage: !!hit }
    })
    const chosen = [
      ...picks.filter((p) => p.hasPage),
      ...picks.filter((p) => !p.hasPage),
    ]
      .slice(0, MAX_ITEMS)
      .sort((a, b) => a.rank - b.rank)
    const items = chosen.map(({ g, genus }) => {
      const w = wiki.get(genus.name)
      return {
        name: genus.name,
        label: g.label,
        finds: genus.finds,
        url: w ? wikiUrl(w.title) : wikiSearchUrl(genus.name),
        description: w?.description || null,
        thumb: w?.thumb || null,
      }
    })
    result = {
      source: 'fossils',
      items,
      habitat: habitatSummary(groups),
      radiusKm,
      window: usedWin,
      total: records.length,
    }
  } else {
    const picks = typicalFor(time, onLand)
    const wiki = await wikiLookup(picks.map(([n]) => n))
    result = {
      source: 'typical',
      window: win,
      items: picks.map(([name, label]) => {
        const w = wiki.get(name)
        return {
          name,
          label,
          url: w ? wikiUrl(w.title) : wikiSearchUrl(name),
          description: w?.description || null,
          thumb: w?.thumb || null,
        }
      }),
    }
  }
  cache.set(key, result)
  return result
}
