import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './session.js'
import './shell.css'
import { ACCUEIL_MOCKUP, useUiContent, uiOrMockup } from './mockup.js'

/* ===== Coquille d'interface (IA « Stitch ») =====
   Barre latérale à 8 entrées, barre supérieure, widget Objectif/J-xx.
   Le composant ne décide de rien côté données : il rend ce que App lui passe
   (`view`, `go`, `objective`) et n'appelle qu'une RPC de lecture (my_objective),
   avec repli local si la migration n'est pas encore appliquée. */

/* ---------- Icônes (traits 24×24, même facture que les icônes de l'app) ---------- */
const PATHS = {
  home: 'M3 10.2 12 3l9 7.2V21h-6v-6H9v6H3z',
  train: 'M12 5v14M5 12h14',
  arc: 'M6 3v6a4 4 0 0 0 8 0V3M6 3h2M12 3h2M10 13v3a4 4 0 0 0 8 0v-1M18 9.5a1.6 1.6 0 1 0 0 .01',
  exam: 'M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2zM9 8h6M9 12h6M9 16h3',
  video: 'M4 6h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM17 10.5 22 8v8l-5-2.5',
  packs: 'M12 3 3 7l9 4 9-4zM3 12l9 4 9-4M3 17l9 4 9-4',
  forum: 'M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z',
  progression: 'M4 20V5M4 20h16M8 16l3.5-4.5L15 14l4.5-6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-2 8-2 8h16s-2-1-2-8M10 21a2 2 0 0 0 4 0',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  layers: 'M4 5h16M4 10h16M4 15h10',
  daily: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l3 2',
  prio: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  series: 'M4 6h10M4 12h10M4 18h6M17 8l3 4-3 4',
  book: 'M4 5a2 2 0 0 1 2-2h6v18H6a2 2 0 0 1-2-2zM12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6',
  flame: 'M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 1 3s2-3 2-7.5z',
  cap: 'M3 9l9-4 9 4-9 4zM7 11.5V17c0 1.5 2.2 2.5 5 2.5s5-1 5-2.5v-5.5M21 9v5',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19',
  openbook: 'M12 6c-1.6-1.2-3.8-1.6-6-1.6H4v13h2c2.2 0 4.4.4 6 1.6 1.6-1.2 3.8-1.6 6-1.6h2v-13h-2c-2.2 0-4.4.4-6 1.6zM12 6v14',
  dots: 'M12 6h.01M12 12h.01M12 18h.01',
}

export const Ico = ({ n, size = 20, stroke = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={PATHS[n] || PATHS.layers} />
  </svg>
)

/* ---------- Entrées de la barre latérale ---------- */
// key → libellé + écran cible. Les écrans secondaires restent accessibles (bloc « Plus »).
export const SIDEBAR = [
  { key: 'home', label: 'Accueil', icon: 'home', target: { name: 'home' }, views: ['home', 'dcem3'] },
  { key: 'train', label: "S'entraîner (QCM & Séries)", icon: 'openbook', target: { name: 'train' }, views: ['train', 'create', 'series', 'daily', 'prio', 'pre'] },
  { key: 'arc', label: 'ARC — Raisonnement Clinique', icon: 'arc', target: { name: 'arc' }, views: ['arc'], short: 'ARC' },
  { key: 'exam', label: 'Examens blancs', icon: 'exam', target: { name: 'exam' }, views: ['exam'] },
  { key: 'packs', label: 'Cours vidéo & Fiches', icon: 'video', target: { name: 'library' }, views: ['library', 'packs'] },
  { key: 'forum', label: 'Forum & Modération', icon: 'forum', target: { name: 'forum-home' }, views: ['forum-home', 'forum'] },
  { key: 'progression', label: 'Ma Progression', icon: 'progression', target: { name: 'progression' }, views: ['progression'] },
]

const SECONDARY = [
  { key: 'series', label: 'Séries 4 facultés', icon: 'exam' },
  { key: 'daily', label: 'Révision espacée', icon: 'train' },
  { key: 'prio', label: 'Priorités', icon: 'progression' },
  { key: 'search', label: 'Recherche', icon: 'search' },
  { key: 'groups', label: 'Groupes', icon: 'account' },
  { key: 'study', label: 'Study time', icon: 'exam' },
  { key: 'history', label: 'Historique', icon: 'progression' },
  { key: 'pre', label: 'Avant le cours', icon: 'train' },
  { key: 'parcours', label: 'Parcours DCEM3', icon: 'layers', dcem3: true },
]

const TEACHER_NAV = [
  { key: 't-home', label: 'Mes cas', icon: 'arc', target: { name: 'home' }, views: ['home'] },
  { key: 't-bank', label: 'Banque des ARC', icon: 'packs', target: { name: 'tbank' }, views: ['tbank'] },
  { key: 't-new', label: 'Nouveau cas', icon: 'train', target: { name: 'tnew' }, views: ['tnew'] },
]

const LABEL = { home: 'Accueil', create: "S'entraîner", arc: 'ARC — Raisonnement Clinique', exam: 'Examens blancs', packs: 'Cours vidéo & Fiches', forum: 'Forum', progression: 'Progression', account: 'Mon compte', search: 'Recherche', series: 'Séries 4 facultés', daily: 'Révision espacée', prio: 'Priorités', groups: 'Groupes', study: 'Study time', pre: 'Avant le cours', dcem3: 'DCEM3', parcours: 'Parcours DCEM3' }

const TRACK_LABEL = { residanat: 'Résidanat', dcem1: 'DCEM1', dcem2: 'DCEM2', dcem3s1: 'DCEM3 S1', dcem3: 'DCEM3' }
const FAC_LABEL = { tunis: 'Tunis', monastir: 'Monastir', sousse: 'Sousse', sfax: 'Sfax' }
const trackLabel = scope => (scope && TRACK_LABEL[scope.track]) || 'Résidanat'
const facultyLabel = scope => (scope && FAC_LABEL[scope.faculty]) || ''
const STATUS_LABEL = { paid: 'Session active', trial: 'Essai en cours', teacher: 'Espace enseignant', expired: 'Accès expiré' }

function navFor(iface) {
  if (iface === 'teacher') return TEACHER_NAV
  return SIDEBAR.map(x => (iface === 'level' && x.key === 'home' ? { ...x, label: 'Spécialités' } : x))
}

function isActive(entry, view) {
  if (!view) return false
  return entry.views.includes(view.name)
}

export function sectionOf(view) {
  if (!view) return 'home'
  const hit = SIDEBAR.find(e => isActive(e, view))
  return hit ? hit.key : view.name
}

/* ---------- Date d'examen : repli local ----------
   La date officielle vit en base (table public.exam_targets, RPC my_objective).
   Tant que la migration n'est pas appliquée — ou si la RPC échoue — le widget
   s'appuie sur cette constante. Elle porte la date officielle confirmée le
   2026-11-16 par l'équipe : si elle change, la base fait foi. */
export const FALLBACK_EXAM_DATE = '2026-12-23'
const DAY = 86400000
const pad = n => String(n).padStart(2, '0')
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseDay = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1) }
export const daysLeft = examDate => Math.round((parseDay(examDate) - parseDay(isoDay(new Date()))) / DAY)
const fmtDate = s => {
  const d = parseDay(s)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
const DEFAULT_GOALS = { daily_questions: 20, weekly_questions: 140, daily_minutes: 60 }

// Nombre de réponses sur les 7 derniers jours, calculé sur l'état local (toujours disponible).
function localWeek(state) {
  const att = (state && state.attempts) || []
  const now = Date.now()
  let n = 0
  for (const a of att) {
    const t = a && a.t ? Number(a.t) : null
    if (t && now - t < 7 * DAY) n += 1
  }
  return n
}

export function buildObjective(remote, state) {
  const exam_date = (remote && remote.exam_date) || FALLBACK_EXAM_DATE
  const goals = { ...DEFAULT_GOALS, ...((remote && remote.goals) || {}) }
  const d = daysLeft(exam_date)
  const week = remote && remote.week && typeof remote.week.answered === 'number'
    ? remote.week.answered
    : localWeek(state)
  const target = Math.max(1, Number(goals.weekly_questions) || DEFAULT_GOALS.weekly_questions)
  const pct = Math.max(0, Math.min(100, Math.round((week / target) * 100)))
  const required = Math.max(1, Math.round(target / 7))
  const avg = Math.round((week / 7) * 10) / 10
  // Rythme : part du but hebdomadaire couverte, comparée à la part de semaine écoulée
  // (tolérance de 15 %, pour ne pas signaler « en retard » dès le lundi matin).
  const dow = new Date().getDay() || 7 // 1 = lundi … 7 = dimanche
  const expected = target * (dow / 7)
  const onTrack = week >= expected * 0.85
  const todayKey = isoDay(new Date())
  const todayAnswered = ((state && state.attempts) || []).filter(a => a && a.d === todayKey).length
  return {
    source: remote ? 'db' : 'local',
    today: { answered: todayAnswered, target: Math.max(1, Number(goals.daily_questions) || DEFAULT_GOALS.daily_questions) },
    exam_date,
    exam_date_label: fmtDate(exam_date),
    label: (remote && remote.label) || 'Concours — date à confirmer',
    is_confirmed: !!(remote && remote.is_confirmed),
    days_left: d,
    goals,
    week: { answered: week, target, pct },
    pace: {
      avg_per_day: remote && remote.pace ? Number(remote.pace.avg_per_day) || avg : avg,
      needed_per_day: remote && remote.pace ? Number(remote.pace.needed_per_day) || required : required,
      on_track: remote && remote.pace ? !!remote.pace.on_track : onTrack,
    },
    by_specialty: (remote && remote.by_specialty) || [],
  }
}

// Lecture unique par session de page : my_objective (fichier supabase/migrations/*_exam_objective.sql).
// Toute erreur (migration absente, hors ligne) laisse le repli local, sans bloquer l'écran.
export function useObjective(user, state) {
  const [remote, setRemote] = useState(null)
  const uid = user && user.id
  useEffect(() => {
    let live = true
    if (!uid) { setRemote(null); return undefined }
    supabase.rpc('my_objective').then(({ data, error }) => {
      if (live && !error && data) setRemote(data)
    }).catch(() => {})
    return () => { live = false }
  }, [uid])
  return useMemo(() => buildObjective(remote, state), [remote, state && state.attempts])
}

/* ---------- Anneau de progression ---------- */
export function Ring({ pct = 0, size = 64, stroke = 6, children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, Number(pct) || 0))
  return (
    <span className="obj-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--acc)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${(p / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .4s ease' }} />
      </svg>
      <span className="val">{children}</span>
    </span>
  )
}

/* ---------- Widget Objectif / J-xx ----------
   variant : 'sidebar' (rail, anneau) · 'card' (tiroir et écran Progression, large) */
export function ObjectiveWidget({ objective, go, variant = 'sidebar', compact = false }) {
  if (!objective) return null
  const d = objective.days_left
  const late = !objective.pace.on_track
  const jLabel = d >= 0 ? `J-${d}` : 'Jour J'
  return (
    <div className={`obj${variant === 'card' ? '' : ' flat'}`} role="group" aria-label="Objectif et jours avant le concours">
      <div className="obj-h">
        <span>Objectif</span>
        <button type="button" onClick={() => go({ name: 'progression' })}>Progression →</button>
      </div>
      <div className="obj-body">
        <Ring pct={objective.week.pct} size={compact ? 52 : 64}>
          <b style={{ fontSize: compact ? 17 : 21 }}>{d >= 0 ? d : '✓'}</b>
          <small>{d >= 0 ? 'jours' : 'J'}</small>
        </Ring>
        <span className="obj-meta">
          <b>{jLabel} · {objective.label.replace(/ —.*/, '')}</b>
          <span>{objective.exam_date_label}</span>
          {!objective.is_confirmed && <span className="obj-note">Date à confirmer par l’équipe</span>}
        </span>
      </div>
      <div className="obj-goal">
        <span className="lb"><span>Cette semaine</span><span>{objective.week.answered}/{objective.week.target} questions</span></span>
        <div className={`obj-bar${late ? ' late' : ''}`}><i style={{ width: `${objective.week.pct}%` }} /></div>
      </div>
      <div className={`obj-foot${late ? ' late' : ''}`}>
        <span aria-hidden="true">{late ? '▲' : '●'}</span>
        <span>{late ? `Prends ${objective.pace.needed_per_day}/jour pour revenir dans le rythme` : `Rythme tenu (${objective.pace.avg_per_day}/jour)`}</span>
      </div>
    </div>
  )
}

/* ---------- En-tête de section ----------
   Même géométrie que `.page-h` (héritée), avec en plus un sur-titre et une zone d'actions. */
export function PageHead({ eyebrow, title, subtitle, meta, actions }) {
  return (
    <div className="page-h">
      {eyebrow && <span className="ph-eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
      {meta && <p className="muted small">{meta}</p>}
      {actions && <div className="ph-actions">{actions}</div>}
    </div>
  )
}

/* ---------- État vide ----------
   Même forme partout (forum, packs, entraînement, progression) : icône, titre, phrase, puis une
   action principale et une secondaire facultative. Reprend l'état vide de la maquette 196975ec. */
export function EmptyState({ icon = 'search', title, text, primary, secondary }) {
  return (
    <div className="empty">
      <span className="empty-ico" aria-hidden="true"><Ico n={icon} size={20} /></span>
      <b>{title}</b>
      {text && <p className="muted">{text}</p>}
      {(primary || secondary) && (
        <div className="empty-actions">
          {primary && <button type="button" className="primary" onClick={primary.onClick}>{primary.label}</button>}
          {secondary && <button type="button" className="ghost" onClick={secondary.onClick}>{secondary.label}</button>}
        </div>
      )}
    </div>
  )
}

/* ---------- Coquille ---------- */
export function Shell({ view, go, iface, objective, user, profile, access, scope, actions, focus = false, dcem3 = false, children }) {
  const [drawer, setDrawer] = useState(false)
  const [more, setMore] = useState(false)
  const secondaryRef = useRef(null)
  const nav = useMemo(() => navFor(iface), [iface])
  const secondary = useMemo(() => SECONDARY.filter(x => (iface !== 'level' || x.key !== 'pre') && (!x.dcem3 || dcem3)), [iface, dcem3])
  const onAccount = () => go({ name: 'account' })
  const goTo = v => { setDrawer(false); go(v) }
  const activeKey = sectionOf(view)
  const sectionLabel = iface === 'teacher'
    ? (nav.find(e => isActive(e, view)) || {}).label || 'Espace enseignant'
    : (SIDEBAR.find(e => e.key === activeKey) || {}).label || LABEL[view && view.name] || 'Accueil'

  const year = (objective && objective.exam_date ? String(objective.exam_date).slice(0, 4) : String(new Date().getFullYear()))
  const fac = FACULTIES_LABEL(scope, objective)
  const status = (access && access.status) || null
  // Objectif quotidien affiché : valeurs de la maquette si la clé `accueil` les porte,
  // sinon les réponses réelles du jour (voir mockup.js et ui_content).
  const uiAccueil = uiOrMockup(useUiContent('accueil'), ACCUEIL_MOCKUP)
  const demoDaily = uiAccueil && uiAccueil.demo_kpis ? uiAccueil.demo_kpis : null
  const today = demoDaily
    ? { answered: demoDaily.daily_answered, target: demoDaily.daily_target }
    : ((objective && objective.today) || { answered: 0, target: 20 })
  const dayPct = Math.min(100, Math.round((today.answered / Math.max(1, today.target)) * 100))
  const days = objective ? Math.max(0, objective.days_left) : null
  const who = (profile && profile.username) || (user ? 'Mon compte' : 'Connexion')
  const roleLine = iface === 'teacher' ? 'Enseignant' : [trackLabel(scope), fac ? `FMT ${fac}` : null].filter(Boolean).join(' • ')

  useEffect(() => {
    if (!drawer) return undefined
    const esc = e => { if (e.key === 'Escape') setDrawer(false) }
    document.addEventListener('keydown', esc)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = prev }
  }, [drawer])

  useEffect(() => { setDrawer(false) }, [view && view.name, view && view.kind])

  // Le groupe « Plus » déplié doit apparaître dans la zone visible du rail
  useEffect(() => {
    if (!more || !secondaryRef.current) return
    const t = setTimeout(() => { if (secondaryRef.current) secondaryRef.current.scrollIntoView({ block: 'nearest' }) }, 30)
    return () => clearTimeout(t)
  }, [more])

  const Item = ({ e }) => (
    <button type="button" className={`sh-item${isActive(e, view) ? ' on' : ''}`}
      aria-current={isActive(e, view) ? 'page' : undefined}
      title={e.label} onClick={() => goTo(e.target)}>
      <Ico n={e.icon} />
      <span>{e.label}</span>
    </button>
  )

  const Brand = () => (
    <button type="button" className="sh-brand" onClick={() => goTo({ name: 'home' })}>
      <span className="sh-logo" aria-hidden="true"><i /><i /></span>
      <span className="sh-brand-txt">Résidanat <b>QCM</b><small>{fac ? `Faculté de ${fac}` : 'Préparation au concours'}</small></span>
      <span className="sh-year">{year}</span>
    </button>
  )

  const Prefs = () => (
    <div className="sh-prefs">
      <div className="sh-pref"><span className="sh-pref-l"><Ico n="cap" size={14} />Mode</span><span className="sh-chip">{iface === 'teacher' ? 'Enseignant' : 'Étudiant'}</span></div>
      <div className="sh-pref"><span className="sh-pref-l"><Ico n="sun" size={14} />Affichage</span><span className="sh-chip">Auto</span></div>
    </div>
  )

  const Account = () => (
    <button type="button" className="sh-user" onClick={onAccount} >
      <span className="av" aria-hidden="true"><Ico n="account" size={16} /></span>
      <span className="sh-user-txt"><b>{who}</b><small>{roleLine}</small></span>
    </button>
  )

  const showObjective = iface !== 'teacher' && objective

  return (
    <div className={`sh${focus ? ' focus' : ''}`}>
      <aside className="sh-sb" aria-label="Navigation principale">
        <Brand />
        <nav className="sh-nav">
          <span className="sh-grp">Menu</span>
          {nav.map(e => <Item key={e.key} e={e} />)}
          {iface !== 'teacher' && (
            <>
              <button type="button" className="sh-more" aria-expanded={more} onClick={() => setMore(v => !v)}>
                <span>Plus</span><span aria-hidden="true">{more ? '▴' : '▾'}</span>
              </button>
              {more && <div className="sh-secondary" ref={secondaryRef}>{secondary.map(x => <Item key={x.key} e={{ ...x, target: { name: x.key }, views: [x.key] }} />)}</div>}
            </>
          )}
        </nav>
        <div className="sh-foot">
          <Prefs />
          <Account />
        </div>
      </aside>

      <div className="sh-main">
        <header className="sh-tb">
          <button type="button" className="sh-icon-btn sh-menu-btn" onClick={() => setDrawer(true)}
            aria-label="Ouvrir le menu" aria-expanded={drawer} aria-controls="sh-drawer">
            <Ico n="menu" />
          </button>
          <nav className="sh-crumbs" aria-label="Fil d’Ariane">
            <span>Résidanat {year}</span>
            <span className="sh-sep" aria-hidden="true">›</span>
            <b>{sectionLabel}</b>
          </nav>
          <div className="sh-tb-right">
            {status && (
              <span className={`sh-status ${status}`}>
                <i aria-hidden="true" />{STATUS_LABEL[status] || 'Session'}
              </span>
            )}
            {showObjective && (
              <button type="button" className="sh-goal" onClick={() => goTo({ name: 'progression' })}>
                <Ring pct={dayPct} size={32} stroke={4}>
                  <b style={{ fontSize: 10 }}>{today.answered}</b>
                </Ring>
                <span className="sh-goal-txt">
                  <small>Objectif quotidien</small>
                  <b>{today.answered} / {today.target} QCM</b>
                </span>
              </button>
            )}
            {showObjective && days !== null && (
              <span className="sh-jchip" title="Jours avant le concours">J-{days}</span>
            )}
            {iface !== 'teacher' && (
              <button type="button" className="sh-icon-btn sh-search" onClick={() => goTo({ name: 'search' })} aria-label="Recherche"><Ico n="search" /></button>
            )}
            {actions}
            <button type="button" className="sh-avatar" onClick={onAccount} aria-label={`Mon compte ${who}`}>{who[0].toUpperCase()}</button>
          </div>
        </header>
        <div className="sh-content">{children}</div>
      </div>

      <div className={`sh-scrim${drawer ? ' open' : ''}`} onClick={() => setDrawer(false)} aria-hidden="true" />
      <aside id="sh-drawer" className={`sh-drawer${drawer ? ' open' : ''}`} aria-label="Menu" aria-hidden={!drawer} {...(!drawer ? { inert: '' } : {})}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="sh-brand" onClick={() => goTo({ name: 'home' })} style={{ flex: 1 }}>
            <span className="sh-logo" aria-hidden="true"><i /><i /></span>
            <span className="sh-brand-txt">Résidanat <b>QCM</b><small>{fac ? `Faculté de ${fac}` : 'Préparation au concours'}</small></span>
          </button>
          <button type="button" className="sh-icon-btn" onClick={() => setDrawer(false)} aria-label="Fermer le menu"><Ico n="close" /></button>
        </div>
        {showObjective && <ObjectiveWidget objective={objective} go={goTo} variant="card" />}
        <nav className="sh-nav" aria-label="Navigation">
          {nav.map(e => <Item key={e.key} e={e} />)}
          {iface !== 'teacher' && secondary.length > 0 && (
            <>
              <button type="button" className="sh-more" aria-expanded={more} onClick={() => setMore(v => !v)}>
                <span>Plus</span><span aria-hidden="true">{more ? '▴' : '▾'}</span>
              </button>
              {more && <div className="sh-secondary">{secondary.map(x => <Item key={x.key} e={{ ...x, target: { name: x.key }, views: [x.key] }} />)}</div>}
            </>
          )}
        </nav>
        <div className="sh-foot">
          <Prefs />
          <Account />
        </div>
      </aside>
    </div>
  )
}

function FACULTIES_LABEL(scope, objective) {
  return (scope && FAC_LABEL[scope.faculty]) || ''
}
