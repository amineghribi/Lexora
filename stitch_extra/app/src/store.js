// Progression locale (localStorage) : réponses, cartes de révision espacée, signalements
const KEY = 'residanat-qcm.v1'
const INTERVALS = [1, 3, 7, 14, 30] // jours selon la "boîte" (0..4)

export const dayKey = (d = new Date()) => {
  const z = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY))
    if (s && s.v === 1) return { favs: {}, sessions: [], reports: {}, ...s }
  } catch (e) { /* ignore */ }
  return { v: 1, attempts: [], cards: {}, reports: {}, sessions: [], favs: {} }
}
export function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch (e) { /* quota */ }
}

export const sameSet = (a, b) => [...a].sort().join('') === [...b].sort().join('')

// Note d'une question, de 0 à 1 :
//  - toutes les bonnes réponses cochées et aucune fausse : 1
//  - au moins une fausse réponse cochée : 0
//  - que des bonnes réponses, mais pas toutes (ex. 1 sur 3) : la fraction (1/3)
export function score(chosen, correct) {
  const c = [...(correct || [])], s = [...new Set(chosen || [])]
  if (!c.length || !s.length || s.some(x => !c.includes(x))) return 0
  return s.length / c.length
}
// Note d'une tentative enregistrée (anciennes tentatives sans note : tout ou rien)
export const ptsOf = a => (typeof a.p === 'number' ? a.p : a.ok ? 1 : 0)

// Enregistre une réponse. Retourne le nouvel état.
// ok : résultat fourni par le serveur (la clé de réponse n'est pas connue du navigateur avant la correction)
export function record(state, entry, chosen, seriesId, okFromServer) {
  const full = typeof okFromServer === 'boolean' ? okFromServer : sameSet(chosen, entry.c)
  const p = full ? 1 : entry.c ? score(chosen, entry.c) : 0
  const ok = p === 1
  const now = new Date()
  const attempts = [...state.attempts, { q: entry.i, ok, p, ch: chosen.join(''), s: seriesId || null, d: dayKey(now), t: now.getTime() }]
  const c = state.cards[entry.i] || { box: 0, seen: 0, wrong: 0 }
  // entièrement juste : +2 boîtes ; incomplète (que des bonnes cases, mais pas toutes) : +1 ; fausse : retour à 0
  const box = ok ? Math.min(c.box + 2, INTERVALS.length - 1) : p > 0 ? Math.min(c.box + 1, INTERVALS.length - 1) : 0
  const due = dayKey(addDays(now, p > 0 ? INTERVALS[box] : 1))
  const cards = { ...state.cards, [entry.i]: { box, seen: c.seen + 1, wrong: c.wrong + (ok ? 0 : 1), last: dayKey(now), due } }
  return { ...state, attempts, cards }
}

export function dueIds(state, upTo) {
  const cards = (state && state.cards) || {}
  return Object.entries(cards).filter(([, c]) => c && c.due && c.due <= upTo).map(([id]) => id)
}
export const todayAttempts = state => state.attempts.filter(a => a.d === dayKey())
export const tomorrowKey = () => dayKey(addDays(new Date(), 1))

export function exportJSON(state) {
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `progression-${dayKey()}.json`
  a.click()
}
export async function importJSON(file) {
  const s = JSON.parse(await file.text())
  if (!s || s.v !== 1) throw new Error('Fichier invalide')
  return { favs: {}, sessions: [], reports: {}, ...s }
}
