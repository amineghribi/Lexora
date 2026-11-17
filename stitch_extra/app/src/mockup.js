import { useEffect, useState } from 'react'
import { supabase } from './session.js'

/* ===== Valeurs de la maquette Stitch (Accueil) =====
   Elles vivent en base dans `public.ui_content` (clé `accueil`) pour être modifiables sans
   redéploiement. Ce fichier n'est que le repli local : il sert quand la migration n'est pas
   appliquée, et il reproduit exactement la valeur semée.

   `demo_kpis` remplace les chiffres réels de l'élève (volume, précision, dossiers ARC, constance,
   objectif quotidien, série du jour, examen blanc). Désactiver la ligne `accueil` en base
   (`enabled = false`) suffit à revenir aux données réelles, sans toucher au code. */

/* Écran « Examens blancs » (export b492b916) : mêmes valeurs que la ligne `examens_blancs`. */
export const EXAMENS_BLANCS_MOCKUP = {
  session: 'Session Principale Décembre 2026',
  title: 'Concours Blanc National — Session Officielle FMT',
  badges: ['Épreuve officielle calibrée', 'Jury national • FMT Tunis'],
  kpis: [
    { k: 'Rang blanc estimé', v: '42e / 1 420', s: 'sur la session en cours' },
    { k: 'Score moyen', v: '15,82 / 20', s: 'moyenne des épreuves' },
  ],
  params: [
    { k: 'Durée réglementaire', v: '03 h 00', s: '180 minutes continues · zéro pause', note: 'Cadence recommandée : 90 s / item' },
    { k: 'Volume d’épreuve', v: '120 questions', s: 'QCM isolés & cas cliniques courts', note: '9 dossiers cliniques progressifs' },
    { k: 'Pondération', v: 'Barème strict', s: 'Note sur 120 ramenée sur 100', note: 'Sous-colonnes & pénalités activées' },
    { k: 'Candidats inscrits', v: '1 420 internes', s: 'Tunis, Sousse, Monastir, Sfax', note: 'Session synchrone active' },
  ],
  specialties: [
    { sp: 'Cardiologie', n: 14, note: 'Cas E1' },
    { sp: 'Pneumologie', n: 12 },
    { sp: 'Neurologie', n: 16 },
    { sp: 'Gastro-entérologie', n: 14 },
    { sp: 'Pédiatrie', n: 16, note: 'Cas E2' },
    { sp: 'Gynéco-obstétrique', n: 12 },
    { sp: 'Chirurgie générale', n: 16 },
    { sp: 'Urgences & réanimation', n: 12 },
    { sp: 'Médecine légale / éthique', n: 8 },
  ],
  rules: [
    { t: 'Mode plein écran obligatoire', d: 'Restriction d’environnement activée ; raccourcis système et captures neutralisés.' },
    { t: 'Surveillance des changements de fenêtre', d: 'Deux sorties tolérées avec avertissement, disqualification au troisième écart.' },
    { t: 'Sauvegarde continue', d: 'Chaque réponse est enregistrée : une coupure de connexion ne fait pas perdre la copie.' },
  ],
}

export const ACCUEIL_MOCKUP = {
  demo_kpis: {
    week: 420,
    week_delta: 12,
    accuracy: 74.2,
    arc: 3,
    arc_avg: 81,
    streak: 9,
    daily_answered: 38,
    daily_target: 50,
    serie_done: 15,
    serie_target: 40,
    due: 24,
    exam_slot: 'Samedi • 09:00',
    exam_candidates: 184,
    exam_session: 14,
    fiches: 180,
    forum_new: 14,
    specialties: [
      { sp: 'Cardiologie', covered: 88 },
      { sp: 'Pédiatrie', covered: 54 },
    ],
  },
  trend: [9, 6, 3, 12, 8, 14, 5],
  quote: {
    text: 'La rigueur de l’examen réside non pas dans la mémorisation brute, mais dans l’aptitude à hiérarchiser une urgence diagnostique en moins de quarante secondes.',
    author: 'Pr. M. Ben Salem',
    role: 'Comité Pédagogique du Résidanat de Médecine',
  },
  recommendation: { label: 'Choc septique 2024' },
}

// Une seule requête par clé et par page, même si plusieurs composants la lisent.
const cache = new Map()
function loadKey(key) {
  if (!cache.has(key)) {
    cache.set(key, supabase.rpc('ui_content', { p_key: key })
      .then(({ data, error }) => (error ? { data: null, missing: true, ready: true } : { data: data || null, missing: false, ready: true }))
      .catch(() => ({ data: null, missing: true, ready: true })))
  }
  return cache.get(key)
}

// Lecture d'une clé d'écran. missing = la table/RPC n'existe pas (migration non appliquée).
export function useUiContent(key) {
  const [state, setState] = useState({ data: undefined, missing: true, ready: false })
  useEffect(() => {
    let live = true
    loadKey(key).then(next => { if (live) setState(next) })
    return () => { live = false }
  }, [key])
  return state
}

// Valeur effective : la base si elle répond, le repli local si la table manque,
// et null quand la clé est explicitement désactivée (retour aux données réelles).
export const uiOrMockup = (ui, fallback) => (ui.missing ? fallback : ui.data || null)
