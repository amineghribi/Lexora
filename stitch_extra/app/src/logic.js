import { similarIds } from './data.js'

export const LETTERS = ['A', 'B', 'C', 'D', 'E']

// Parties du cours à revoir : regroupe les questions ratées par cours + section
export function weakParts(wrong) {
  const m = new Map()
  for (const e of wrong) {
    if (!e.cp || !e.cp[0]) continue
    const k = `${e.cp[0]}|${e.cs || ''}`
    const g = m.get(k) || { key: e.cp[0], section: e.cs || 'Section non identifiée', pages: new Set(), n: 0, obj: new Set(), sn: e.sn }
    g.n++
    if (e.cp[1]) g.pages.add(e.cp[1])
    if (e.ob) g.obj.add(e.ob)
    m.set(k, g)
  }
  return [...m.values()].map(g => ({ ...g, pages: [...g.pages].sort((a, b) => a - b), obj: [...g.obj] })).sort((a, b) => b.n - a.n)
}

// Questions semblables (même objectif > même tag+thème > même page du cours) : calcul fait côté serveur, identifiants seulement
export async function similarTo(wrongIds, exclude, max = 20) {
  try { return await similarIds(wrongIds, exclude, max) } catch (e) { return [] }
}

// Série suggérée pour demain matin : à revoir (échéance) + ratées du jour + semblables
export async function tomorrowPlan(state, todayWrongIds, dueIdsList, max = 30) {
  const ids = [...new Set([...todayWrongIds, ...dueIdsList])]
  const extra = todayWrongIds.length ? await similarTo(todayWrongIds, ids, Math.max(0, max - ids.length)) : []
  return [...ids, ...extra].slice(0, max)
}

export const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0)

// Cas cliniques : plusieurs questions partagent le même énoncé. index.cases = listes d'identifiants (dans l'ordre de la série d'origine).
const caseMaps = new WeakMap()
function caseMap(index) {
  let m = caseMaps.get(index)
  if (!m) { m = new Map(); for (const g of (index && index.cases) || []) for (const q of g) { const o = m.get(q); if (!o || g.length > o.length) m.set(q, g) }; caseMaps.set(index, m) }
  return m
}
// Complète une liste d'identifiants : chaque question d'un cas clinique entraîne toutes les autres questions du même cas,
// placées à la suite. Si max est donné, on s'arrête dès qu'il est atteint (sans jamais couper un cas en deux).
export function expandCases(ids, index, max) {
  const m = caseMap(index), out = [], seen = new Set()
  for (const id of ids) {
    if (max && out.length >= max) break
    if (seen.has(id)) continue
    for (const q of m.get(id) || [id]) if (!seen.has(q)) { seen.add(q); out.push(q) }
  }
  return out
}
