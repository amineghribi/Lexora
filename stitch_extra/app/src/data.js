// Données de l'application.
// - L'index (séries, cours, listes d'identifiants) reste un fichier statique : il ne contient aucun texte de question.
// - Le contenu des questions vient de Supabase via des fonctions RPC réservées aux comptes connectés (quota : 1000 questions par 2 h, 5000 questions
//   distinctes par jour). Le texte et les propositions arrivent d'abord ; la clé, l'explication, le piège, le mnémo et le lien
//   de cours n'arrivent qu'après la réponse de l'élève (check_answers).
import { useEffect, useState } from 'react'
import { supabase } from './session.js'

let indexP = null
const byId = new Map()
let metaP = null

export class DataError extends Error {
  constructor(code, message) { super(message || code); this.code = code }
}
const CODES = ['AUTH_REQUIRED', 'EMAIL_NOT_CONFIRMED', 'ACCESS_EXPIRED', 'QUOTA_EXCEEDED', 'QUOTA_2H', 'NOT_SERVED', 'TOO_MANY', 'BAD_REQUEST', 'SCOPE_RESTRICTED', 'TRACK_LOCKED', 'TRACK_UNAVAILABLE', 'RATE_LIMITED', 'FACULTY_LOCKED', 'ARC_ACCESS', 'TEACHER_ONLY', 'CASE_NOT_FOUND', 'USE_PUBLISH_RPC', 'USE_SUBMIT_RPC', 'SPECIALTY_FORBIDDEN', 'BAD_KIND', 'INCOMPLETE_CASE', 'QUESTIONS_EMPTY', 'QUESTIONS_TOO_MANY', 'QUESTIONS_BANK_ID', 'QUESTIONS_BANK_UNKNOWN', 'QUESTIONS_CUSTOM_INVALID', 'QUESTIONS_INVALID', 'PRESENTATION_TEXT', 'BAD_MEDIA', 'STEPS_REQUIRED', 'TOO_MANY_STEPS', 'TOO_LARGE', 'HISTORY_ITEMS', 'HISTORY_ITEM_INVALID', 'INVESTIGATION_ITEMS', 'INVESTIGATION_ITEM_INVALID', 'EXAM_REGIONS', 'EXAM_REGION_INVALID', 'DIFFERENTIAL_EXPECTED', 'DIFFERENTIAL_DX', 'DIAGNOSIS_ACCEPTED']
const codeOf = err => {
  const m = String((err && err.message) || '')
  const hit = CODES.find(c => m.includes(c))
  if (hit) return hit
  if (/permission denied|jwt|not authenticated/i.test(m)) return 'AUTH_REQUIRED'
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'NETWORK'
  return 'ERROR'
}
export const errorText = e => ({
  AUTH_REQUIRED: 'Connecte-toi pour accéder aux questions.',
  EMAIL_NOT_CONFIRMED: 'Confirme d’abord ton adresse e-mail pour accéder aux questions.',
  ACCESS_EXPIRED: 'Ton accès est terminé. Abonne-toi pour continuer.',
  QUOTA_EXCEEDED: 'Tu as atteint la limite de 5000 questions par jour. Reviens demain.',
  QUOTA_2H: 'Tu as atteint la limite de 1000 questions en 2 heures. Fais une pause et reviens un peu plus tard.',
  RATE_LIMITED: 'Rythme trop rapide : fais une pause d’une minute puis réessaie.',
  NOT_SERVED: 'Cette série a expiré. Relance-la.',
  SCOPE_RESTRICTED: 'Ces questions ne font pas partie de ton espace.',
  TRACK_LOCKED: 'Ce changement n’est pas possible depuis ton compte. Contacte-nous.',
  TRACK_UNAVAILABLE: 'Cet espace n’est pas encore disponible pour ta faculté.',
  FACULTY_LOCKED: 'Ta faculté est déjà enregistrée et ne peut plus être changée. Contacte-nous.',
  ARC_ACCESS: 'L’ARC fait partie de l’abonnement.',
  TEACHER_ONLY: 'Cette action est réservée aux enseignants.',
  CASE_NOT_FOUND: 'Ce cas n’existe plus ou n’est pas accessible.',
  SPECIALTY_FORBIDDEN: 'Cette spécialité ne fait pas partie de tes spécialités.',
  INCOMPLETE_CASE: 'Le cas est incomplet : vérifie chaque étape avant de publier.',
  BAD_KIND: 'Étape inconnue.',
  QUESTIONS_EMPTY: 'Une étape « Questions » doit contenir au moins une question.',
  QUESTIONS_TOO_MANY: 'Trop de questions dans une étape (30 de la banque, 20 personnelles au maximum).',
  QUESTIONS_BANK_ID: 'Une question de la banque est invalide.',
  QUESTIONS_BANK_UNKNOWN: 'Une question de la banque n’existe plus : retire-la de l’étape.',
  QUESTIONS_CUSTOM_INVALID: 'Une question personnelle est incomplète : énoncé, au moins deux propositions et une bonne réponse sont obligatoires.',
  QUESTIONS_INVALID: 'Étape « Questions » invalide.',
  PRESENTATION_TEXT: 'La présentation du patient est vide.',
  BAD_MEDIA: 'Une image liée au cas est invalide.',
  STEPS_REQUIRED: 'Ajoute au moins une étape au cas.',
  TOO_MANY_STEPS: 'Trop d’étapes (40 au maximum).',
  TOO_LARGE: 'Le cas est trop volumineux.',
  HISTORY_ITEMS: 'L’interrogatoire doit contenir au moins une question.',
  HISTORY_ITEM_INVALID: 'Une ligne de l’interrogatoire est incomplète (intitulé et réponse).',
  INVESTIGATION_ITEMS: 'Les examens complémentaires doivent contenir au moins un examen.',
  INVESTIGATION_ITEM_INVALID: 'Un examen complémentaire est incomplet (intitulé et résultat).',
  EXAM_REGIONS: 'L’examen clinique doit contenir au moins une région.',
  EXAM_REGION_INVALID: 'Une région de l’examen clinique est incomplète (intitulé et constat).',
  DIFFERENTIAL_EXPECTED: 'Ajoute au moins un diagnostic différentiel attendu.',
  DIFFERENTIAL_DX: 'Un diagnostic différentiel est vide.',
  DIAGNOSIS_ACCEPTED: 'Indique au moins un diagnostic accepté.',
  USE_PUBLISH_RPC: 'Utilise le bouton Publier.',
  USE_SUBMIT_RPC: 'Réponse non enregistrée, réessaie.',
  NETWORK: 'Pas de connexion. Vérifie ton réseau puis réessaie.',
}[e && e.code] || 'Impossible de charger les questions pour le moment. Réessaie dans un instant.')
export const needsLogin = e => !!e && (e.code === 'AUTH_REQUIRED' || e.code === 'EMAIL_NOT_CONFIRMED')

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    const code = codeOf(error)
    if (code === 'ACCESS_EXPIRED') window.dispatchEvent(new CustomEvent('access-expired'))
    throw new DataError(code, error.message)
  }
  return data
}

// Statut d'accès : { status: 'trial' | 'paid' | 'expired', trial_ends_at, paid_until, now }. null si indisponible (on ne bloque pas).
export async function getAccess() {
  try { return await rpc('my_access', {}) } catch (e) { return null }
}

// Espace de l'élève : { track: 'residanat' | 'dcem1' | 'dcem2' | 'dcem3s1' | 'dcem3', faculty, chosen, courses: numéros de cours (parcours DCEM) ou null (tout) }. null si indisponible.
export async function getScope() {
  try { return await rpc('my_scope', {}) } catch (e) { return null }
}
// Interface servie par le serveur : 'teacher' | 'residanat' | 'dcem3' | 'level' | 'expired'. null si indisponible.
export async function getInterface() {
  try { return await rpc('my_interface', {}) } catch (e) { return null }
}
// Spécialités (ARC et banque par spécialité) : tout passe par des RPC filtrées par le serveur.
export const getSpecialties = () => rpc('get_specialties', {})
export const getQuestionsBySpecialty = (sp, limit = 30, offset = 0) => rpc('get_questions_by_specialty', { p_sp: sp, p_limit: limit, p_offset: offset })
export const listArcCases = sp => rpc('list_arc_cases', { p_specialty: sp })
export const getArcCase = id => rpc('get_arc_case', { p_id: id })
export const arcSuggest = (c, kind, q) => rpc('arc_suggest', { p_case: c, p_kind: kind, p_q: q })
// Régions d'examen d'un cas (libellés seuls ; les constats passent par arc_ask)
export const arcCaseRegions = c => rpc('arc_case_regions', { p_case: c })
// Diagnostic différentiel : hypothèses candidates, puis correction de la matrice pour/contre
export const arcDifferential = c => rpc('arc_differential', { p_case: c })
export const arcDifferentialGrade = (c, cells) => rpc('arc_differential_grade', { p_case: c, p_cells: cells })
// Diagnostic final : scores déclarés par le cas, puis correction de la formulation
export const arcDiagnosis = c => rpc('arc_diagnosis', { p_case: c })
export const arcDiagnosisGrade = (c, text, pillars) => rpc('arc_diagnosis_grade', { p_case: c, p_text: text, p_pillars: pillars })
// Ordonnance : catalogue prescriptible du cas, puis correction des items retenus
export const arcTreatment = c => rpc('arc_treatment', { p_case: c })
export const arcTreatmentGrade = (c, ids) => rpc('arc_treatment_grade', { p_case: c, p_ids: ids })
// Débriefing : dernier bilan du compte sur le cas + explications du barème
export const arcDebrief = c => rpc('arc_debrief', { p_case: c })
export const arcAsk = (c, kind, text) => rpc('arc_ask', { p_case: c, p_kind: kind, p_text: text })
export const submitArcAttempt = (c, answers) => rpc('submit_arc_attempt', { p_case: c, p_answers: answers })
export const saveArcCase = payload => rpc('save_arc_case', { p_payload: payload })
export const publishArcCase = (id, pub) => rpc('publish_arc_case', { p_id: id, p_publish: pub })
export const arcCaseStats = c => rpc('arc_case_stats', { p_case: c })
// Banque de questions pour l'enseignant (sa spécialité, sans clé de réponse) et correction d'une question écrite par l'enseignant.
export const teacherBankQuestions = (q, limit = 10, offset = 0, ids = null) => rpc('teacher_bank_questions', { p_q: q || null, p_limit: limit, p_offset: offset, p_ids: ids })
export const arcCheckCustom = (c, qid, chosen) => rpc('arc_check_custom', { p_case: c, p_qid: qid, p_chosen: chosen })
// Lien temporaire (30 min) vers une image de la banque d'images ARC (bucket R2 privé), signé par /api/arc-media.
export async function arcMediaUrl(key) {
  const { data } = await supabase.auth.getSession()
  const tok = data && data.session && data.session.access_token
  if (!tok) throw new DataError('AUTH_REQUIRED')
  const r = await fetch('/api/arc-media?key=' + encodeURIComponent(key), { headers: { Authorization: 'Bearer ' + tok } })
  if (!r.ok) throw new DataError(r.status === 403 ? 'ARC_ACCESS' : 'ERROR')
  return (await r.json()).url
}
export async function chooseTrack(track, faculty) {
  return rpc('choose_track', { p_track: track, p_faculty: faculty || null })
}

// Une seule question = un seul identifiant. Les copies d'une même question (même énoncé, mêmes propositions,
// même clé, années différentes) pointent vers une question canonique ; copie -> canonique vient de la base (canon_map).
let canon = {}
let canonP = null
export const canonOf = id => canon[id] || id
export const twinsOf = id => { const c = canonOf(id); return [c, ...Object.keys(canon).filter(k => canon[k] === c)] }
const CANON_KEY = 'canon-map-v1'
export function loadCanon() {
  if (!canonP) {
    // Copie gardée sur l'appareil : le démarrage n'attend plus le serveur, la mise à jour se fait en arrière-plan
    let cached = null
    try { const raw = localStorage.getItem(CANON_KEY); if (raw) cached = JSON.parse(raw) } catch (e) { cached = null }
    const fresh = Promise.resolve(supabase.rpc('canon_map')).then(({ data, error }) => {
      if (!error && data && typeof data === 'object') { canon = data; try { localStorage.setItem(CANON_KEY, JSON.stringify(data)) } catch (e) { /* stockage indisponible */ } }
      return canon
    }).catch(() => canon)
    if (cached && typeof cached === 'object') { canon = cached; canonP = Promise.resolve(canon) } else canonP = fresh
  }
  return canonP
}
const uniq = l => { const seen = new Set(); const out = []; for (const x of l || []) { const c = canonOf(x); if (!seen.has(c)) { seen.add(c); out.push(c) } } return out }

export function loadIndex() {
  if (!indexP) {
    indexP = Promise.all([fetch('/data/index.json').then(r => r.json()), loadCanon()]).then(([ix]) => {
      for (const s of ix.series || []) s.q = uniq(s.q)
      if (ix.pre) for (const k of Object.keys(ix.pre)) ix.pre[k] = uniq(ix.pre[k])
      return ix
    })
  }
  return indexP
}

// Fusionne une question reçue du serveur dans le cache (même objet : les séries en cours voient la correction arriver)
function put(e) {
  const o = byId.get(e.i)
  if (o) { Object.assign(o, e); return o }
  byId.set(e.i, e)
  return e
}

// Regroupe les demandes faites dans la même fenêtre de 25 ms en un seul appel serveur
let queue = null
function fetchBatch(ids) {
  if (!queue) {
    const q = { ids: new Set(), p: null }
    q.p = new Promise(res => setTimeout(res, 25)).then(async () => {
      if (queue === q) queue = null
      const all = [...q.ids]
      for (let k = 0; k < all.length; k += 150) {
        const rows = await rpc('get_questions', { p_ids: all.slice(k, k + 150), p_reveal: false })
        for (const e of rows || []) put(e)
      }
    })
    queue = q
  }
  ids.forEach(i => queue.ids.add(i))
  return queue.p
}

// Charge des questions par identifiant (énoncé + propositions, sans la correction)
export async function loadQuestions(ids) {
  const want = [...new Set(ids.map(canonOf))]
  const missing = want.filter(i => !byId.has(i))
  if (missing.length) await fetchBatch(missing)
  return want.map(i => byId.get(i)).filter(Boolean)
}

// Même chose, avec la correction pour les questions auxquelles l'élève a déjà répondu
export async function loadWithAnswers(ids) {
  const want = [...new Set(ids.map(canonOf))]
  for (let k = 0; k < want.length; k += 150) {
    const rows = await rpc('get_questions', { p_ids: want.slice(k, k + 150), p_reveal: true })
    for (const e of rows || []) put(e)
  }
  return want.map(i => byId.get(i)).filter(Boolean)
}

// Correction côté serveur. items : [{ id, chosen: ['A','C'] }] → Map(id → juste ?)
export async function checkAnswers(items) {
  const out = new Map()
  for (let k = 0; k < items.length; k += 150) {
    const chunk = items.slice(k, k + 150)
    const res = await rpc('check_answers', { p_items: chunk.map(x => ({ i: x.id, c: [...x.chosen].sort().join('') })) })
    for (const r of res || []) {
      const e = byId.get(r.i)
      if (e) Object.assign(e, r.sec)
      out.set(r.i, !!r.ok)
    }
  }
  return out
}

// Répartition des réponses des autres élèves (affichée après la correction). null si pas assez de réponses.
export async function choiceStats(id) {
  try { const r = await rpc('get_choice_stats', { p_qid: id }); return r && r.show ? r : null } catch (e) { return null }
}

// Enregistre côté serveur qu'une question a été répondue, sans toucher au cache local ni afficher la correction
// (mode examen : évite de perdre les réponses si l'élève ferme l'onglet avant la fin de la série)
export async function registerAnswers(items) {
  await rpc('check_answers', { p_items: items.map(x => ({ i: x.id, c: [...x.chosen].sort().join('') })) })
}

// Métadonnées sans texte (cours, jouable, fréquence aux examens…) pour les tirages et les statistiques
// Copie gardée sur l'appareil (comme canon_map) : la page s'ouvre sans attendre le serveur, la mise à jour se fait en arrière-plan.
// Ce sont les mêmes données que le serveur renvoie déjà à l'élève connecté (aucun texte, aucune clé).
const META_KEY = 'qmeta-v1'
const META_FRESH_MS = 10 * 60 * 1000
const mapMeta = rows => (rows || []).map(([i, sn, p, f, n, l, hc]) => ({ i, sn, p: !!p, f, fr: n == null ? null : [n, l == null ? 0 : l], hc: !!hc }))
export function loadMeta() {
  if (!metaP) {
    let cached = null
    try { const raw = JSON.parse(localStorage.getItem(META_KEY) || 'null'); if (raw && Array.isArray(raw.rows) && raw.rows.length) cached = raw } catch (e) { cached = null }
    const fresh = () => rpc('question_meta', {}).then(rows => {
      try { localStorage.setItem(META_KEY, JSON.stringify({ t: Date.now(), rows })) } catch (e) { /* stockage plein ou indisponible */ }
      return mapMeta(rows)
    })
    if (cached) {
      metaP = Promise.resolve(mapMeta(cached.rows))
      if (Date.now() - cached.t > META_FRESH_MS) fresh().catch(() => {}) // visible à la prochaine ouverture
    } else {
      metaP = fresh()
      metaP.catch(() => { metaP = null })
    }
  }
  return metaP
}
export function useMeta(scope) {
  const [st, setSt] = useState({ rows: null, error: null })
  const key = scope ? scope.join(',') : ''
  useEffect(() => {
    let live = true
    setSt({ rows: null, error: null })
    loadMeta().then(all => {
      if (!live) return
      const set = scope ? new Set(scope) : null
      setSt({ rows: set ? all.filter(r => set.has(r.sn)) : all, error: null })
    }).catch(error => { if (live) setSt({ rows: null, error }) })
    return () => { live = false }
  }, [key])
  return st
}

export async function searchQuestions(words, sns) {
  const rows = await rpc('search_questions', { p_words: words, p_sns: sns && sns.length ? sns : null, p_limit: 30 })
  return (rows || []).map(put)
}
export async function similarIds(wrongIds, excludeIds, max) {
  if (!wrongIds.length || max <= 0) return []
  return (await rpc('similar_questions', { p_wrong: wrongIds.slice(0, 150), p_exclude: excludeIds.slice(0, 500), p_max: max })) || []
}

export const getQ = id => byId.get(canonOf(id))

// Une seule question à la demande (forum, groupes). Ne contacte le serveur que pour un identifiant bien formé.
const VALID = /^Q\d{3,7}$/
export function useQuestion(rawId) {
  const qid = canonOf(rawId)
  const [st, setSt] = useState({ q: null, loading: false, error: null })
  useEffect(() => {
    if (!qid || !VALID.test(qid)) { setSt({ q: null, loading: false, error: null }); return undefined }
    if (byId.has(qid)) { setSt({ q: byId.get(qid), loading: false, error: null }); return undefined }
    let live = true
    setSt({ q: null, loading: true, error: null })
    const h = setTimeout(() => {
      loadQuestions([qid]).then(l => { if (live) setSt({ q: l[0] || null, loading: false, error: null }) })
        .catch(error => { if (live) setSt({ q: null, loading: false, error }) })
    }, 300)
    return () => { live = false; clearTimeout(h) }
  }, [qid])
  return st
}


// jour d'examen (J1 / J2) de chaque question, d'après les séries de l'index
const _dayCache = new WeakMap()
export function examDays(index) {
  let m = _dayCache.get(index)
  if (m) return m
  m = new Map()
  for (const s of index.series || []) if (s.j) for (const id of s.q || []) { const k = canonOf(id); (m.get(k) || m.set(k, new Set()).get(k)).add(s.j) }
  _dayCache.set(index, m)
  return m
}
export const inDay = (index, id, day) => !day || examDays(index).get(canonOf(id))?.has(day) === true
