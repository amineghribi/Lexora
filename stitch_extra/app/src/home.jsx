import React, { useEffect, useMemo, useState } from 'react'
import { useMeta } from './data.js'
import { supabase } from './session.js'
import { expandCases, pct } from './logic.js'
import { dueIds, dayKey, ptsOf } from './store.js'
import { hasKind } from './packs.jsx'
import { FACULTIES } from './track.jsx'
import { Ico, Ring } from './shell.jsx'
import { ACCUEIL_MOCKUP, useUiContent, uiOrMockup } from './mockup.js'
import './home.css'

/* ===== Accueil — tableau de bord =====
   Les textes et les chiffres de démonstration viennent de `ui_content` (clé `accueil`) : par
   défaut, la page affiche la maquette Stitch ; la ligne de contenu peut être désactivée en base
   pour repasser aux données réelles de l'élève. Aucune autre valeur n'est inventée ici. */

const DAY = 86400000
const pad = n => String(n).padStart(2, '0')
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

function weekStats(attempts) {
  const now = Date.now()
  let cur = 0
  let prev = 0
  for (const a of attempts || []) {
    const t = a && a.t ? Number(a.t) : null
    if (!t) continue
    const age = now - t
    if (age < 7 * DAY) cur += 1
    else if (age < 14 * DAY) prev += 1
  }
  const delta = prev === 0 ? null : Math.round(((cur - prev) / prev) * 100)
  return { cur, prev, delta }
}

function streakOf(attempts) {
  const days = new Set((attempts || []).map(a => a && a.d).filter(Boolean))
  let s = 0
  for (let i = 0; i < 400; i++) {
    const d = iso(new Date(Date.now() - i * DAY))
    if (days.has(d)) s += 1
    else if (i === 0) continue
    else break
  }
  return s
}

function last7(attempts) {
  const out = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY)
    const key = iso(d)
    const n = (attempts || []).filter(a => a && a.d === key).length
    out.push({ key, letter: DAY_LETTERS[d.getDay()], n })
  }
  return out
}

const Kpi = ({ icon, label, value, unit, children, accent }) => (
  <article className="kpi">
    <header>
      <span>{label}</span>
      <span className={`kpi-ico${accent ? ` ${accent}` : ''}`} aria-hidden="true"><Ico n={icon} size={17} /></span>
    </header>
    <b className="kpi-val">{value}{unit && <small>{unit}</small>}</b>
    {children}
  </article>
)

const SecHead = ({ n, kicker, title, right }) => (
  <div className="sec-head">
    <span className="sec-num">{n}</span>
    <div>
      <span className="sec-kicker">{kicker}</span>
      <h2>{title}</h2>
    </div>
    <span className="sec-right">{right}</span>
  </div>
)

export function Home({ index, state, setState, go, access, onStart, objective, scope, profile }) {
  const { rows: pool } = useMeta(null)
  const [arc, setArc] = useState(null)
  const ui = useUiContent('accueil')
  const mock = uiOrMockup(ui, ACCUEIL_MOCKUP)
  const D = mock && mock.demo_kpis ? mock.demo_kpis : null

  const attempts = state.attempts || []
  const uniq = index.uniq || index.subjects.reduce((a, s) => a + s.n, 0)
  const acc = attempts.length ? pct(attempts.reduce((a, x) => a + ptsOf(x), 0), attempts.length) : null
  const due = dueIds(state, dayKey()).length
  const week = weekStats(attempts)
  const streak = streakOf(attempts)
  const chart = last7(attempts)
  const maxDay = Math.max(1, ...(D && mock.trend ? mock.trend : chart.map(d => d.n)))
  const today = objective && objective.today ? objective.today : { answered: 0, target: 20 }
  const fiches = index.subjects.filter(s => hasKind(s.no, 'fiche')).length
  const coverage = attempts.length ? Math.min(100, Math.round((new Set(attempts.map(a => a.q)).size / Math.max(1, uniq)) * 100)) : 0

  // Dossiers ARC : lignes du compte (RLS « ses lignes »). Silencieux si indisponible.
  useEffect(() => {
    if (D) return undefined
    let live = true
    supabase.from('arc_attempts').select('pct').order('created_at', { ascending: false }).limit(200)
      .then(({ data, error }) => {
        if (!live || error || !data) return
        const n = data.length
        const avg = n ? Math.round(data.reduce((a, r) => a + (Number(r.pct) || 0), 0) / n) : null
        setArc({ n, avg })
      })
    return () => { live = false }
  }, [D])

  const facultyName = (FACULTIES.find(([k]) => k === (scope && scope.faculty)) || [])[1]
  const sessionLabel = objective && objective.exam_date_label ? objective.exam_date_label : 'date à confirmer'
  const name = (profile && profile.username) || ''
  const days = objective ? Math.max(0, objective.days_left) : null

  // Valeurs affichées : maquette si `demo_kpis` est actif, sinon état réel.
  const V = useMemo(() => {
    const realSpecs = ((objective && objective.by_specialty) || [])
      .filter(r => r && r.answered)
      .sort((a, b) => b.answered - a.answered)
      .slice(0, 2)
      .map(r => ({ sp: r.sp, pct: Math.max(0, Math.min(100, Math.round((r.correct / r.answered) * 100))) }))
    const trendSrc = D && mock.trend ? mock.trend : chart.map(d => d.n)
    const todayDow = new Date().getDay()
    return {
      volume: D ? D.week : week.cur,
      delta: D ? D.week_delta : week.delta,
      accuracy: D ? D.accuracy : acc,
      arcCount: D ? D.arc : (arc ? arc.n : null),
      arcAvg: D ? D.arc_avg : (arc ? arc.avg : null),
      streak: D ? D.streak : streak,
      dailyAnswered: D ? D.daily_answered : today.answered,
      dailyTarget: D ? D.daily_target : Math.max(1, Number(today.target) || 20),
      serieDone: D ? D.serie_done : today.answered,
      serieTarget: D ? D.serie_target : Math.max(1, Number(today.target) || 20),
      due: D ? D.due : due,
      exam: D ? { slot: D.exam_slot, seats: D.exam_candidates, session: D.exam_session } : null,
      trend: trendSrc.map((n, i) => ({ letter: DAY_LETTERS[(todayDow - 6 + i + 7) % 7], n })),
      specialities: D && Array.isArray(D.specialties) && D.specialties.length
        ? D.specialties.map(x => ({ sp: x.sp, pct: x.covered, label: 'couvert' }))
        : (realSpecs.length ? realSpecs.map(r => ({ ...r, label: 'réussite' })) : [{ sp: 'Couverture de la banque', pct: coverage, label: 'couvert' }]),
      fiches: D ? D.fiches : fiches,
      forumNew: D ? D.forum_new : null,
      quote: mock && mock.quote ? mock.quote : null,
      recommendation: mock && mock.recommendation ? mock.recommendation.label : null,
    }
  }, [D, mock, week, acc, arc, streak, today, due, chart, coverage, fiches, objective])

  const quick = () => {
    const ids = due ? dueIds(state, dayKey()).slice(0, 20) : pickTypical(pool, 20)
    if (!ids.length) { go({ name: 'create' }); return }
    onStart({ title: due ? 'Révision du jour' : 'Série rapide — questions typiques', ids: expandCases(ids, index, 20), subjectHint: null, mode: 'immediate', kind: 'custom' })
  }

  const dayPct = Math.min(100, Math.round((V.dailyAnswered / Math.max(1, V.dailyTarget)) * 100))
  const seriePct = Math.min(100, Math.round((V.serieDone / Math.max(1, V.serieTarget)) * 100))
  const maxTrend = Math.max(1, ...V.trend.map(d => d.n))

  return (
    <div className="dash">
      <section className="dash-hero">
        <div className="dash-hero-txt">
          <span className="dash-eyebrow"><Ico n="exam" size={13} /> Concours national de résidanat{facultyName ? ` • FMT ${facultyName}` : ''}</span>
          <h1>Bonjour{name ? ` ${name}` : ''},</h1>
          <p>Préparation au concours national de Résidanat — <b>J-{days === null ? '—' : days}</b> <span className="muted">(session du {sessionLabel})</span></p>
        </div>
        <div className="dash-actions">
          <button type="button" className="soft" onClick={() => go({ name: 'account' })}>Ajuster mon cursus</button>
          <button type="button" className="primary" onClick={quick}>▶ Reprendre le travail</button>
        </div>
      </section>

      <div className="kpis">
        <Kpi icon="packs" label="Volume hebdomadaire" value={V.volume.toLocaleString('fr')} unit=" QCM">
          <span className={`kpi-sub${V.delta !== null && V.delta < 0 ? ' down' : ''}`}>
            {V.delta === null ? 'Pas de semaine de référence' : `${V.delta >= 0 ? '↗' : '↘'} ${V.delta >= 0 ? '+' : ''}${V.delta}% vs sem. passée`}
          </span>
        </Kpi>
        <Kpi icon="arc" label="Précision globale" value={V.accuracy === null ? '—' : String(V.accuracy).replace('.', ',')} unit={V.accuracy === null ? '' : ' %'}>
          <span className="kpi-bar"><i style={{ width: `${V.accuracy || 0}%` }} /></span>
        </Kpi>
        <Kpi icon="forum" label="Dossiers ARC résolus" value={V.arcCount === null ? '—' : V.arcCount} unit={V.arcCount > 1 ? ' cas cliniques' : ' cas clinique'}>
          <span className="kpi-sub">{V.arcAvg !== null ? `Score moyen : ${V.arcAvg}%` : 'Aucun dossier encore'}</span>
        </Kpi>
        <Kpi icon="train" label="Constance de révision" value={V.streak} unit={V.streak > 1 ? " jours d'affilée" : " jour d'affilée"} accent="warm">
          <span className="kpi-sub"><i className={`dot${V.streak >= 3 ? ' on' : ''}`} />{V.streak >= 3 ? 'Rythme conforme ciblé' : 'Reprends le rythme'}</span>
        </Kpi>

        <article className="card trend" aria-labelledby="trend-h">
          <div className="bar" style={{ margin: 0 }}>
            <strong id="trend-h">Tendance 7 jours</strong>
          </div>
          <div className="trend-bars">
            {V.trend.map((d, i) => (
              <div key={i} className="trend-col" title={`${d.letter} : ${d.n} réponse${d.n > 1 ? 's' : ''}`}>
                <div className="trend-track"><i style={{ height: `${Math.round((d.n / maxTrend) * 100)}%` }} className={d.n === maxTrend && d.n > 0 ? 'max' : ''} /></div>
                <span>{d.letter}</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <SecHead n="01" kicker="Quotidien" title="Chaque jour"
        right={<span className="muted small">Remise à zéro quotidienne à 04:00</span>} />
      <div className="cols3">
        <article className="card dc">
          <header><Ico n="daily" size={18} /><span className="pill info">Nouveau aujourd’hui</span></header>
          <h3>Série du jour</h3>
          <p className="muted small">Questions tirées selon la pondération du concours national, en priorité celles que tu n’as pas encore vues.</p>
          <div className="dc-prog"><span>Progression du jour</span><b>{V.serieDone} / {V.serieTarget} faits</b></div>
          <span className="kpi-bar"><i style={{ width: `${seriePct}%` }} /></span>
          <button type="button" className="primary wide" onClick={quick}>Continuer la série →</button>
        </article>

        <article className="card dc">
          <header><Ico n="prio" size={18} /><span className={`pill${V.due ? ' warn' : ''}`}>● {V.due} à réviser</span></header>
          <h3>Questions prioritaires</h3>
          <p className="muted small">Questions à fort rendement ou manquées récemment, avec révision espacée.</p>
          <div className="dc-meta"><Ico n="daily" size={14} />{V.due ? `${V.due} question${V.due > 1 ? 's' : ''} à revoir` : 'Rien à revoir aujourd’hui'}</div>
          <button type="button" className="wide" disabled={!due && !D} onClick={quick}>Attaquer les {V.due} questions →</button>
        </article>

        <article className="card dc">
          <header><Ico n="exam" size={18} /><span className="pill">{V.exam ? V.exam.slot : 'Chronométré'}</span></header>
          <h3>Examen blanc</h3>
          <p className="muted small">Épreuve en conditions réelles, correction à la fin, tirage pondéré par la fréquence aux examens.</p>
          <div className="dc-meta">
            <Ico n="exam" size={14} />
            {V.exam ? <>{V.exam.seats} candidats inscrits <span className="muted">· Session #{V.exam.session}</span></> : <>{index.series.length} séries des 4 facultés disponibles</>}
          </div>
          <button type="button" className="soft wide" onClick={() => go({ name: 'exam' })}>Configurer mon examen →</button>
        </article>
      </div>

      <SecHead n="02" kicker="Entraînement ciblé" title="S'entraîner"
        right={<button type="button" className="link" onClick={() => go({ name: 'create' })}>Toutes les modalités →</button>} />
      <div className="cols3">
        <article className="card dc">
          <header><Ico n="create" size={18} /></header>
          <h3>Créer ma série sur-mesure</h3>
          <p className="muted small">Sélection par spécialité et par cours, niveau de difficulté, questions typiques ou à fort taux de chute.</p>
          <div className="chips-row"><span className="chip">Chronométré</span><span className="chip">Mode tuteur</span><span className="chip">10 à 200 QCM</span></div>
          <button type="button" className="soft wide" onClick={() => go({ name: 'create' })}>Configurer un test +</button>
        </article>

        <article className="card dc">
          <header><Ico n="series" size={18} /><span className="pill info">{index.subjects.length} modules</span></header>
          <h3>Séries par spécialité</h3>
          <p className="muted small">Les examens de Tunis, Monastir, Sousse et Sfax, par année et par thème.</p>
          <ul className="sp-rows">
            {V.specialities.map(r => (
              <li key={r.sp}>
                <span><b>{r.sp}</b><i style={{ width: `${r.pct}%` }} /></span>
                <small>{r.pct}% {r.label}</small>
              </li>
            ))}
          </ul>
          <button type="button" className="soft wide" onClick={() => go({ name: 'series' })}>Explorer le catalogue →</button>
        </article>

        <article className="card dc">
          <header><Ico n="book" size={18} /><span className="pill">Socle de base</span></header>
          <h3>Pré-requis & fondamentaux</h3>
          <p className="muted small">Questions générales pour se mettre dans le sujet avant de lire un cours.</p>
          <div className="dc-callout"><b>Avant le cours</b><span>Questions d’introduction, sans chronomètre</span></div>
          <button type="button" className="soft wide" onClick={() => go({ name: 'pre' })}>Réviser les fondamentaux →</button>
        </article>
      </div>

      <SecHead n="03" kicker="Raisonnement & références" title="Ressources & ARC"
        right={<span className="muted small">Conformes aux référentiels du programme</span>} />
      <div className="cols-arc">
        <article className="card arc-card">
          <header>
            <span className="arc-ico" aria-hidden="true"><Ico n="arc" size={18} /></span>
            <span className="pill on-dark">Module ARC</span>
            <span className="pill ghost-dark">Format ARC officiel</span>
          </header>
          <h3>Raisonnement clinique</h3>
          <p>Un patient virtuel au service d’accueil : interrogatoire, examens par paliers, prise en charge, puis débriefing. Chaque tentative est notée et conservée.</p>
          <div className="arc-strip">
            <span className="dot on" aria-hidden="true" />
            <span>{V.arcCount !== null && V.arcCount > 0 ? `${V.arcCount} dossier${V.arcCount > 1 ? 's' : ''} déjà résolu${V.arcCount > 1 ? 's' : ''}` : 'Aucun dossier ouvert pour le moment'}</span>
            <span className="arc-level">{V.arcAvg !== null ? `Score moyen ${V.arcAvg}%` : 'Score à venir'}</span>
          </div>
          <div className="arc-actions">
            <button type="button" className="primary" onClick={() => go({ name: 'arc' })}>▶ Démarrer une simulation ARC</button>
            <button type="button" className="ghost-dark" onClick={() => go({ name: 'arc' })}>Mes bilans</button>
          </div>
        </article>

        <article className="card dc">
          <header><Ico n="packs" size={18} /><span className="pill">PDF & web</span></header>
          <h3>Fiches mémo & tableaux</h3>
          <p className="muted small">Fiches synthétiques, algorithmes décisionnels et arbres diagnostiques de chaque cours.</p>
          <div className="dc-meta"><Ico n="packs" size={14} />{V.fiches} fiches disponibles</div>
          <button type="button" className="soft wide" onClick={() => go({ name: 'packs' })}>Consulter les fiches →</button>
        </article>

        <article className="card dc">
          <header><Ico n="forum" size={18} /><span className="pill"><i className="dot on" /> Actif</span></header>
          <h3>Forum & débats cliniques</h3>
          <p className="muted small">Questions litigieuses analysées et argumentées, discutées par question.</p>
          <div className="dc-meta"><Ico n="forum" size={14} />{V.forumNew !== null ? `${V.forumNew} nouvelles discussions` : 'Discussions ouvertes par question'}</div>
          <button type="button" className="soft wide" onClick={() => go({ name: 'forum' })}>Participer aux échanges →</button>
        </article>
      </div>

      <footer className="dash-foot quote">
        <div className="foot-ico" aria-hidden="true">”</div>
        <div className="quote-body">
          {V.quote ? (
            <>
              <p className="quote-text">« {V.quote.text} »</p>
              <span className="quote-auth">— {V.quote.author}{V.quote.role ? ` • ${V.quote.role}` : ''}</span>
            </>
          ) : (
            <>
              <b>Conseil du jour</b>
              <p className="muted small">
                {due ? `${due} question${due > 1 ? 's' : ''} arrivent à échéance aujourd’hui : les revoir avant d’ouvrir un nouveau cours.` : 'Rien n’est dû aujourd’hui : une série de 20 questions typiques entretient le rythme.'}
              </p>
            </>
          )}
        </div>
        {V.recommendation && (
          <button type="button" className="link" onClick={() => go({ name: 'packs' })}>Recommandation du jour : {V.recommendation} ↗</button>
        )}
      </footer>
    </div>
  )
}

// Tirage « questions typiques » : fréquence aux examens d'abord, hasard pour le reste.
function pickTypical(pool, n) {
  if (!pool) return []
  const rows = pool.filter(e => e.p && e.f !== 'x').map(e => ({ e, r: Math.random() }))
  rows.sort((a, b) => (((b.e.fr && b.e.fr[0]) || 0) - ((a.e.fr && a.e.fr[0]) || 0)) || a.r - b.r)
  return rows.slice(0, n).map(x => x.e.i)
}
