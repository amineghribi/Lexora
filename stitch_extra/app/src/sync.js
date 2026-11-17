// Synchronisation de la progression avec Supabase (table user_progress, une ligne par élève).
// Fusion sans perte : on garde l'union des réponses, des séances, des favoris et des signalements,
// et pour chaque carte de révision la plus récente.
import { supabase } from './session.js'

const uniq = (arr, key) => { const m = new Map(); for (const x of arr || []) m.set(key(x), x); return [...m.values()] }

// Study time : union des séances (par id) et des tâches du planning (celle avec le plus de pomodoros faits gagne) ;
// réglages et date d'examen : la modification la plus récente (champ at) l'emporte. Le minuteur en cours reste local.
export function mergeStudy(a, b) {
  if (!a) return b
  if (!b) return a
  const sessions = uniq([...(a.sessions || []), ...(b.sessions || [])], x => x.id).sort((x, y) => x.t - y.t).slice(-500)
  const pm = new Map()
  for (const p of [...(a.plan || []), ...(b.plan || [])]) {
    const o = pm.get(p.id)
    pm.set(p.id, !o || (p.done || 0) > (o.done || 0) || ((p.done || 0) === (o.done || 0) && p.checked && !o.checked) ? p : o)
  }
  const newer = (b.at || 0) > (a.at || 0) ? b : a, other = newer === a ? b : a
  return { sessions, plan: [...pm.values()], settings: newer.settings || other.settings, exam: newer.exam ?? other.exam ?? '', at: Math.max(a.at || 0, b.at || 0) }
}

export function mergeState(a, b) {
  const attempts = uniq([...(a.attempts || []), ...(b.attempts || [])], x => `${x.t}|${x.q}`).sort((x, y) => x.t - y.t)
  const sessions = uniq([...(a.sessions || []), ...(b.sessions || [])], x => `${x.t}|${x.title}`).sort((x, y) => x.t - y.t).slice(-200)
  const cards = { ...(a.cards || {}) }
  for (const [id, c] of Object.entries(b.cards || {})) {
    const o = cards[id]
    cards[id] = !o || (c.last || '') > (o.last || '') || ((c.last || '') === (o.last || '') && (c.seen || 0) > (o.seen || 0)) ? c : o
  }
  const study = a.study || b.study ? { study: mergeStudy(a.study, b.study) } : {}
  return { ...a, ...b, v: 1, attempts, sessions, cards, favs: { ...(a.favs || {}), ...(b.favs || {}) }, reports: { ...(a.reports || {}), ...(b.reports || {}) }, ...study }
}

export async function pull(uid) {
  const { data, error } = await supabase.from('user_progress').select('data').eq('user_id', uid).maybeSingle()
  if (error) throw error
  return data ? data.data : null
}
export async function push(uid, state) {
  const { error } = await supabase.from('user_progress').upsert({ user_id: uid, data: state, updated_at: new Date().toISOString() })
  if (error) throw error
}

// Ramène la progression sur les identifiants canoniques (une question = un identifiant).
// Les anciennes copies d'une même question sont fusionnées : réponses conservées, cartes de révision cumulées.
export function canonState(state, canonOf) {
  const touched = [...(state.attempts || [])].some(a => canonOf(a.q) !== a.q)
    || Object.keys(state.cards || {}).some(i => canonOf(i) !== i)
    || Object.keys(state.favs || {}).some(i => canonOf(i) !== i)
    || Object.keys(state.reports || {}).some(i => canonOf(i) !== i)
  if (!touched) return state
  const attempts = (state.attempts || []).map(a => (canonOf(a.q) === a.q ? a : { ...a, q: canonOf(a.q) }))
  const cards = {}
  for (const [id, c] of Object.entries(state.cards || {})) {
    const k = canonOf(id), o = cards[k]
    if (!o) { cards[k] = c; continue }
    const later = (c.last || '') > (o.last || '') ? c : o
    cards[k] = { ...later, seen: (o.seen || 0) + (c.seen || 0), wrong: (o.wrong || 0) + (c.wrong || 0) }
  }
  const favs = {}
  for (const [id, v] of Object.entries(state.favs || {})) favs[canonOf(id)] = v
  const reports = {}
  for (const [id, v] of Object.entries(state.reports || {})) { const k = canonOf(id); reports[k] = reports[k] && reports[k] !== v ? `${reports[k]} / ${v}` : v }
  return { ...state, attempts, cards, favs, reports }
}
