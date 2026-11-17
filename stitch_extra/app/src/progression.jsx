import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './session.js'
import { useMeta } from './data.js'
import './progression.css'
import { EmptyState } from './shell.jsx'

/* ===== Ma Progression (maquette Stitch 86347122) =====
   Quatre indicateurs, courbe hebdomadaire (volume + score /20 avec seuil), puis maîtrise par
   spécialité avec onglets. Deux sources : `my_progression(p_days)` quand la migration est
   appliquée, sinon les réponses locales (`state.attempts`). Aucune valeur inventée : quand une
   donnée manque (rétention sur second passage), la carte affiche ce qui est réellement mesuré. */

const DAY = 86400000
const pad = n => String(n).padStart(2, '0')
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1) }
const shortDay = s => { const d = parse(s); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) }
const dayName = s => new Date(parse(s)).toLocaleDateString('fr-FR', { weekday: 'short' })
const fmt = n => Number(n || 0).toLocaleString('fr')
const on20 = v => (Math.round((Number(v) || 0) * 20 * 10) / 10).toString().replace('.', ',')

const RANGES = [[7, 'Cette semaine'], [30, 'Mois en cours'], [90, 'Depuis le début']]

function windowDays(days) {
  const out = []
  for (let i = days - 1; i >= 0; i--) out.push(new Date(Date.now() - i * DAY))
  return out
}

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

function streakOf(series) {
  let s = 0
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].answered > 0) s += 1
    else if (i === series.length - 1) continue
    else break
  }
  return s
}

export function useProgression(state, days) {
  const [remote, setRemote] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setFailed(false)
    supabase.rpc('my_progression', { p_days: days }).then(({ data, error }) => {
      if (!live) return
      if (error || !data) { setRemote(null); setFailed(true) } else setRemote(data)
    }).catch(() => { if (live) { setRemote(null); setFailed(true) } })
    return () => { live = false }
  }, [days])

  const misfit = remote && Array.isArray(remote.daily) && remote.daily.length !== days
  const series = useMemo(() => {
    if (remote && Array.isArray(remote.daily) && !misfit) return remote.daily
    const keys = []
    for (let i = days - 1; i >= 0; i--) keys.push(iso(new Date(Date.now() - i * DAY)))
    const inWin = new Set(keys)
    const by = new Map()
    for (const a of state && state.attempts || []) {
      if (!a || !a.d || !inWin.has(a.d)) continue
      const cur = by.get(a.d) || { day: a.d, answered: 0, correct: 0, points: 0 }
      cur.answered += 1
      if (a.ok) cur.correct += 1
      by.set(a.d, cur)
    }
    return keys.map(k => by.get(k) || { day: k, answered: 0, correct: 0, points: 0 })
  }, [remote, misfit, days, state && state.attempts])

  return { series, remote, server: !!remote && !failed && !misfit, bySpecialty: (remote && remote.by_specialty) || null }
}

/* Courbe combinée : barres de volume + ligne de score /20, seuil cible à 14/20 */
function ComboChart({ series, width = 720 }) {
  const W = Math.max(320, width), H = 240, padL = 34, padR = 44, padT = 14, padB = 34
  const fs = W < 520 ? 9.5 : 10.5
  const n = Math.max(1, series.length)
  const maxVol = Math.max(1, ...series.map(d => d.answered))
  const x = i => padL + (i * (W - padL - padR)) / Math.max(1, n - 1)
  const yScore = v => padT + (1 - Math.min(20, v) / 20) * (H - padT - padB)
  const yVol = v => (v / maxVol) * (H - padT - padB) * 0.62
  const scorePts = series.map((d, i) => (d.answered ? [x(i), yScore((d.correct / d.answered) * 20)] : null)).filter(Boolean)
  const line = scorePts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const bw = Math.max(3, ((W - padL - padR) / n) * 0.42)
  const ticks = [5, 10, 15, 20]
  const showEvery = n > 40 ? 0 : n > 14 ? 1 : 0
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Volume quotidien et score moyen sur 20">
      {ticks.map(t => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={yScore(t)} y2={yScore(t)} stroke="var(--line2)" />
          <text x={padL - 6} y={yScore(t) + 3.5} textAnchor="end" fontSize={fs} fill="var(--muted)">{t}</text>
        </g>
      ))}
      <line x1={padL} x2={W - padR} y1={yScore(14)} y2={yScore(14)} stroke="var(--warn)" strokeDasharray="5 4" strokeWidth="1.2" />
      <text x={W - padR + 5} y={yScore(14) + 3.5} fontSize={fs} fill="var(--warn)">14</text>
      <text x={W - padR + 5} y={yScore(20) + 3.5} fontSize={fs} fill="var(--muted)">{maxVol}</text>
      <text x={W - padR + 5} y={H - padB} fontSize={fs} fill="var(--muted)">0</text>
      {series.map((d, i) => d.answered > 0 && (
        <rect key={d.day} x={x(i) - bw / 2} y={H - padB - yVol(d.answered)} width={bw} height={yVol(d.answered)}
          rx="2" fill="color-mix(in srgb, var(--acc) 38%, var(--card))" />
      ))}
      {line && <path d={line} fill="none" stroke="var(--acc2)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {scorePts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.6" fill="var(--card)" stroke="var(--acc2)" strokeWidth="1.8" />)}
      {series.map((d, i) => (n <= 10 || i % (n <= 30 ? 5 : 15) === 0) && (
        <text key={d.day} x={x(i)} y={H - 10} textAnchor="middle" fontSize={fs} fill="var(--muted)">{dayName(d.day)}</text>
      ))}
    </svg>
  )
}

const Kpi = ({ k, v, unit, sub, tone }) => (
  <article className="pg-kpi">
    <span className="k">{k}</span>
    <b className={tone || ''}>{v}{unit && <small>{unit}</small>}</b>
    {sub && <span className="s">{sub}</span>}
  </article>
)

export function ProgressionView({ state, objective, go, onStart, index }) {
  const [days, setDays] = useState(7)
  const [boxRef, boxW] = useWidth()
  const { series, server, bySpecialty } = useProgression(state, days)
  const { rows: meta } = useMeta(null)
  const [tab, setTab] = useState('all')

  const answered = series.reduce((a, d) => a + d.answered, 0)
  const correct = series.reduce((a, d) => a + d.correct, 0)
  const acc = answered ? correct / answered : 0
  const streak = streakOf(series)
  const activeDays = series.filter(d => d.answered > 0).length
  const total = (index && index.uniq) || 0
  const seen = attemptsSeen(state)
  const coverage = total ? Math.min(100, Math.round((seen / total) * 100)) : 0

  // Spécialités : la base d'abord, sinon métadonnées locales (question → spécialité)
  const specs = useMemo(() => {
    if (bySpecialty && bySpecialty.length) {
      return [...bySpecialty].map(r => ({ sp: r.sp, n: r.answered, pct: r.answered ? Math.round((r.correct / r.answered) * 100) : 0 }))
        .sort((a, b) => b.pct - a.pct)
    }
    const spOf = new Map()
    for (const r of meta || []) if (r && r.i && r.sp) spOf.set(r.i, r.sp)
    const win = new Set(series.map(d => d.day))
    const m = new Map()
    for (const a of state.attempts || []) {
      if (!a || !a.d || !win.has(a.d)) continue
      const sp = spOf.get(a.q) || 'Autres'
      const cur = m.get(sp) || { sp, n: 0, ok: 0 }
      cur.n += 1
      if (a.ok) cur.ok += 1
      m.set(sp, cur)
    }
    return [...m.values()].map(r => ({ sp: r.sp, n: r.n, pct: Math.round((r.ok / r.n) * 100) })).sort((a, b) => b.pct - a.pct)
  }, [bySpecialty, meta, series.length, state.attempts])

  const strong = specs.filter(s => s.pct >= 75)
  const weak = specs.filter(s => s.pct < 60)
  const shownSpecs = tab === 'strong' ? strong : tab === 'weak' ? weak : specs

  return (
    <div className="pg">
      <div className="pg-hero">
        <div>
          <span className="pg-eyebrow">Tableau de bord pédagogique</span>
          <h1>Ma progression & analyse des performances</h1>
          <p className="muted">{server ? 'Données consolidées du compte' : 'Données de cet appareil (repli local)'} · {activeDays} jour{activeDays > 1 ? 's' : ''} actif{activeDays > 1 ? 's' : ''} sur {days}</p>
        </div>
        <div className="pg-hero-actions">
          <div className="pg-tabs" role="tablist" aria-label="Période">
            {RANGES.map(([d, label]) => (
              <button key={d} type="button" role="tab" aria-selected={days === d} className={`pg-tab${days === d ? ' on' : ''}`} onClick={() => setDays(d)}>{label}</button>
            ))}
          </div>
          <button type="button" className="soft" onClick={() => window.print()}>Exporter le bilan</button>
        </div>
      </div>

      <div className="pg-kpis">
        <Kpi k="Score moyen récent" v={answered ? on20(acc) : '—'} unit={answered ? ' / 20' : ''}
          sub={`Seuil ciblé 14,0 / 20`} tone={acc * 20 >= 14 ? 'good' : 'warn'} />
        <Kpi k="Volume d’items traités" v={fmt(seen)} unit={` / ${fmt(total)}`} sub={`${coverage} % du programme · ${fmt(Math.max(0, total - seen))} restants`} />
        <Kpi k="Précision sur la période" v={answered ? `${Math.round(acc * 100)} %` : '—'} sub={`${fmt(correct)} bonnes réponses sur ${fmt(answered)}`} />
        <Kpi k="Régularité d’entraînement" v={streak} unit={streak > 1 ? ' jours consécutifs' : ' jour consécutif'} sub={streak >= 3 ? 'Rythme conforme ciblé' : 'Reprends le rythme'} tone={streak >= 3 ? 'good' : 'warn'} />
      </div>

      <section className="pg-card">
        <div className="pg-card-h">
          <div>
            <h2>Dynamique hebdomadaire — score moyen journalier & volume d’items</h2>
            <p className="muted small">Volume de QCM résolus (barres) et score moyen sur 20 (ligne). Seuil ciblé à 14,0 / 20.</p>
          </div>
        </div>
        <div ref={boxRef}><ComboChart series={series} width={boxW} /></div>
        {series.length <= 10 && (
          <ul className="pg-week">
            {series.map(d => (
              <li key={d.day}>
                <span className="d">{dayName(d.day)} {parse(d.day).getDate()}</span>
                <b>{d.answered ? on20(d.correct / d.answered) : '—'}</b>
                <span className="v">{d.answered} QCM</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pg-card">
        <div className="pg-card-h">
          <div>
            <h2>Maîtrise par spécialité du programme national</h2>
            <p className="muted small">{specs.length} module{specs.length > 1 ? 's' : ''} · part de bonnes réponses par spécialité</p>
          </div>
          <div className="pg-tabs">
            {[['all', `Toutes (${specs.length})`], ['strong', `Points forts (${strong.length})`], ['weak', `Prioritaires (${weak.length})`]].map(([k, label]) => (
              <button key={k} type="button" className={`pg-tab${tab === k ? ' on' : ''}`} aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
        </div>
        {shownSpecs.length ? (
          <ul className="pg-specs">
            {shownSpecs.map(s => (
              <li key={s.sp}>
                <span className="sp">{s.sp}<small>{s.n} items</small></span>
                <span className="bar"><i style={{ width: `${s.pct}%` }} className={s.pct >= 75 ? 'good' : s.pct < 60 ? 'weak' : ''} /></span>
                <span className="pct">{s.pct} %</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="progression" title="Aucune spécialité dans ce filtre"
            text="Aucune réponse enregistrée sur cette période pour ce filtre."
            primary={{ label: 'Toutes les spécialités', onClick: () => setTab('all') }} />
        )}
      </section>

      <div className="row">
        <button className="primary" onClick={() => go({ name: 'daily' })}>Réviser ce qui est dû</button>
        <button onClick={() => go({ name: 'create' })}>Créer une série</button>
      </div>
    </div>
  )
}

function attemptsSeen(state) {
  return new Set((state && state.attempts || []).map(a => a && a.q).filter(Boolean)).size
}

function useWidth(fallback = 760) {
  const ref = useRef(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(e => {
      const cw = e[0] && e[0].contentRect ? e[0].contentRect.width : 0
      if (cw > 0) setW(Math.round(cw))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}
