import React, { useMemo, useState } from 'react'
import './train.css'
import { EmptyState } from './shell.jsx'

/* ===== S'entraîner — accueil de la section (maquette f023b4d3) =====
   Une carte par spécialité : nombre de séries et de questions (index réel), précision calculée
   sur les réponses de l'appareil quand l'identifiant de question est connu. Aucun rang estimé ni
   valeur de maquette : ces deux informations n'existent pas côté client. */

const clean = s => String(s || '').replace(/\s{2,}.*$/, '').trim()

export function TrainPage({ index, state, go, onStart }) {
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const attempts = (state && state.attempts) || []
    const byQ = new Map()
    for (const a of attempts) if (a && a.q) { const cur = byQ.get(a.q) || { n: 0, ok: 0 }; cur.n += 1; if (a.ok) cur.ok += 1; byQ.set(a.q, cur) }
    const m = new Map()
    for (const s of index.series || []) {
      if (!s.sp) continue
      const cur = m.get(s.sp) || { sp: s.sp, series: 0, qids: new Set(), n: 0, ok: 0 }
      cur.series += 1
      for (const id of s.q || []) {
        cur.qids.add(id)
        const st = byQ.get(id)
        if (st) { cur.n += st.n; cur.ok += st.ok }
      }
      m.set(s.sp, cur)
    }
    return [...m.values()].map(r => ({
      sp: r.sp, series: r.series, questions: r.qids.size,
      tried: r.n, pct: r.n ? Math.round((r.ok / r.n) * 100) : null,
    })).sort((a, b) => b.series - a.series)
  }, [index.series, state && state.attempts])

  const totalSeries = rows.reduce((a, r) => a + r.series, 0)
  const totalTried = rows.reduce((a, r) => a + r.n, 0)
  const totalOk = rows.reduce((a, r) => a + r.ok, 0)
  const globalPct = totalTried ? Math.round((totalOk / totalTried) * 100) : null
  const needle = q.trim().toLowerCase()
  const shown = rows.filter(r => !needle || r.sp.toLowerCase().includes(needle))

  return (
    <div className="tr">
      <div className="tr-hero">
        <div>
          <span className="tr-eyebrow">Concours résidanat</span>
          <h1>S’entraîner</h1>
          <p className="muted">Séries par spécialité et séries sur mesure. La précision affichée vient de tes réponses sur cet appareil.</p>
        </div>
        <div className="tr-kpis" role="list">
          <div className="tr-kpi" role="listitem"><span className="k">Séries</span><b>{totalSeries}</b><span>dans l’index</span></div>
          <div className="tr-kpi" role="listitem"><span className="k">Précision</span><b>{globalPct === null ? '—' : `${globalPct} %`}</b><span>{totalTried} réponses</span></div>
          <div className="tr-kpi" role="listitem"><span className="k">Spécialités</span><b>{rows.length}</b><span>modules couverts</span></div>
        </div>
      </div>

      <div className="tr-actions">
        <button type="button" className="primary" onClick={() => go({ name: 'train-create' })}>Créer ma série sur mesure →</button>
        <button type="button" className="soft" onClick={() => go({ name: 'daily' })}>Réviser ce qui est dû</button>
        <button type="button" className="soft" onClick={() => go({ name: 'exam' })}>Examen blanc</button>
      </div>

      <div className="tr-filters">
        <label className="tr-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrer une spécialité" aria-label="Filtrer une spécialité" />
        </label>
        <span className="muted small">{shown.length} spécialité{shown.length > 1 ? 's' : ''}</span>
      </div>

      {!shown.length && (
        <EmptyState icon="search" title="Aucune spécialité ne correspond"
          text="Élargis la recherche ou reviens à la liste complète."
          primary={{ label: 'Toutes les spécialités', onClick: () => setQ('') }} />
      )}
      <div className="tr-grid">
        {shown.map(r => (
          <article key={r.sp} className="tr-card">
            <header>
              <span className="tr-tag">{r.series} séries</span>
              <span className={`tr-tag${r.pct !== null && r.pct >= 60 ? ' ok' : ''}`}>{r.pct === null ? 'Non commencé' : `${r.pct} %`}</span>
            </header>
            <h3>{r.sp}</h3>
            <p className="muted small">{r.series} séries · {r.questions} questions</p>
            <div className="tr-bar"><i style={{ width: `${r.pct || 0}%` }} /></div>
            <button type="button" className="soft tr-cta" onClick={() => go({ name: 'create' })}>{r.pct === null ? 'Commencer' : 'Continuer'} →</button>
          </article>
        ))}
      </div>
    </div>
  )
}
