import React, { useMemo, useState } from 'react'
import { expandCases } from './logic.js'
import './trainseries.css'

/* ===== Séries par spécialité (maquette « séries d'entraînement par spécialité ») =====
   Bandeau d'indicateurs puis liste par discipline. Tous les chiffres viennent de l'index réel
   (`index.series`) et de l'historique du compte (`state.sessions`, `state.attempts`). */

const fmtDate = ts => {
  const d = new Date(ts)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay ? `Aujourd’hui, ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

export function TrainSeries({ index, state, go, onStart }) {
  const [q, setQ] = useState('')
  const [onlyTodo, setOnlyTodo] = useState(false)

  const specs = useMemo(() => {
    const attempts = (state && state.attempts) || []
    const byQ = new Map()
    for (const a of attempts) if (a && a.q) { const c = byQ.get(a.q) || { n: 0, ok: 0 }; c.n += 1; if (a.ok) c.ok += 1; byQ.set(a.q, c) }
    const m = new Map()
    for (const s of index.series || []) {
      if (!s.sp) continue
      const cur = m.get(s.sp) || { sp: s.sp, series: 0, qids: new Set(), tried: 0, ok: 0 }
      cur.series += 1
      for (const id of s.q || []) {
        cur.qids.add(id)
        const st = byQ.get(id)
        if (st) { cur.tried += st.n; cur.ok += st.ok }
      }
      m.set(s.sp, cur)
    }
    return [...m.values()].map(r => ({
      sp: r.sp, series: r.series, questions: r.qids.size,
      pct: r.tried ? Math.round((r.ok / r.tried) * 100) : null,
    })).sort((a, b) => b.series - a.series)
  }, [index.series, state && state.attempts])

  const totalSeries = specs.reduce((a, r) => a + r.series, 0)
  const totalQ = specs.reduce((a, r) => a + r.questions, 0)
  const sessions = (state && state.sessions) || []
  const seriesDone = sessions.filter(s => s && !s.exam).length
  const tried = specs.reduce((a, r) => a + (r.pct === null ? 0 : 1), 0)
  const accSum = specs.filter(r => r.pct !== null)
  const avg = accSum.length ? Math.round((accSum.reduce((a, r) => a + r.pct, 0) / accSum.length) * 20) / 100 : null
  const last = sessions.filter(Boolean).sort((a, b) => (b.t || 0) - (a.t || 0))[0]

  const needle = q.trim().toLowerCase()
  const rows = specs.filter(r => (!needle || r.sp.toLowerCase().includes(needle)) && (!onlyTodo || r.pct === null || r.pct < 60))

  const quick = () => {
    const ids = (index.series || []).flatMap(s => s.q || []).slice(0, 60)
    const picked = [...new Set(ids)].slice(0, 20)
    if (picked.length) onStart({ title: 'Session rapide — 20 QCM', ids: expandCases(picked, index, 20), subjectHint: null, mode: 'immediate', kind: 'custom' })
  }

  return (
    <div className="tsl">
      <div className="tsl-top">
        <button type="button" className="ghost" onClick={() => go({ name: 'train' })}>← S’entraîner</button>
        <span className="tsl-crumb">Programme officiel · {totalSeries} séries indexées</span>
      </div>

      <header className="tsl-head">
        <div>
          <span className="tsl-eyebrow">Banque par spécialité</span>
          <h1>Séries d’entraînement par spécialité</h1>
        </div>
        <div className="tsl-actions">
          <button type="button" className="soft" onClick={() => go({ name: 'history' })}>Historique complet</button>
          <button type="button" className="primary" onClick={quick}>▶ Session rapide (20 QCM)</button>
        </div>
      </header>

      <div className="tsl-kpis" role="list">
        <div className="tsl-kpi" role="listitem"><span className="k">Banque globale</span><b>{totalSeries}</b><span>{totalQ.toLocaleString('fr')} questions indexées</span></div>
        <div className="tsl-kpi" role="listitem"><span className="k">Séries terminées</span><b>{seriesDone} / {totalSeries}</b><span>{totalSeries ? Math.round((seriesDone / totalSeries) * 100) : 0} % du programme</span></div>
        <div className="tsl-kpi" role="listitem"><span className="k">Moyenne pondérée</span><b>{avg === null ? '—' : `${avg.toFixed(2).replace('.', ',')} / 20`}</b><span>{tried} spécialité{tried > 1 ? 's' : ''} travaillée{tried > 1 ? 's' : ''}</span></div>
        <div className="tsl-kpi" role="listitem"><span className="k">Dernière activité</span><b>{last ? (last.title || 'Série').slice(0, 22) : '—'}</b><span>{last && last.t ? fmtDate(last.t) : 'Aucune session'}</span></div>
      </div>

      <div className="tsl-filters">
        <label className="tsl-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrer une spécialité" aria-label="Filtrer une spécialité" />
        </label>
        <button type="button" className={`tsl-chip${onlyTodo ? ' on' : ''}`} aria-pressed={onlyTodo} onClick={() => setOnlyTodo(v => !v)}>À consolider (&lt; 60 %)</button>
        <span className="muted small">{rows.length} discipline{rows.length > 1 ? 's' : ''}</span>
      </div>

      {!rows.length && <p className="muted">Aucune discipline ne correspond à ce filtre.</p>}
      <ul className="tsl-list">
        {rows.map(r => (
          <li key={r.sp}>
            <span className="tsl-sp">
              <b>{r.sp}</b>
              <small>{r.series} séries · {r.questions} questions</small>
            </span>
            <span className="tsl-bar"><i style={{ width: `${r.pct || 0}%` }} className={r.pct === null ? '' : r.pct >= 60 ? 'ok' : 'weak'} /></span>
            <span className={`tsl-pct${r.pct === null ? '' : r.pct >= 60 ? ' ok' : ' weak'}`}>{r.pct === null ? '—' : `${r.pct} %`}</span>
            <button type="button" className="soft tsl-go" onClick={() => go({ name: 'series', sp: r.sp })}>Ouvrir →</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
