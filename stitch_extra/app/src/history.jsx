import React, { useMemo, useState } from 'react'
import { EmptyState } from './shell.jsx'
import './history.css'

/* ===== Historique (maquette 28b3016d) =====
   Séries et examens enregistrés dans `state.sessions` (une entrée par série terminée).
   Regroupement par jour, filtres Tout / Séries / Examens, et trois indicateurs réels. */

const fmtDur = s => {
  const sec = Math.max(0, Math.round(Number(s) || 0))
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), sec2 = sec % 60
  if (h) return `${h} h ${String(m).padStart(2, '0')}`
  return `${m} min ${String(sec2).padStart(2, '0')} s`
}
const dayLabel = d => {
  const today = new Date(); const yesterday = new Date(Date.now() - 86400000)
  const key = d.toISOString().slice(0, 10)
  if (key === today.toISOString().slice(0, 10)) return 'Aujourd’hui'
  if (key === yesterday.toISOString().slice(0, 10)) return 'Hier'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function HistoryPage({ state, go }) {
  const [tab, setTab] = useState('all')
  const sessions = (state && state.sessions) || []

  const rows = useMemo(() => sessions.map(s => {
    const n = Number(s.n) || 0
    const ok = Number(s.ok) || 0
    return { ...s, n, ok, pct: n ? Math.round((ok / n) * 100) : 0, exam: !!s.exam, ts: Number(s.t) || Date.now() }
  }).sort((a, b) => b.ts - a.ts), [sessions])

  const shown = rows.filter(r => (tab === 'all' ? true : tab === 'exam' ? r.exam : !r.exam))
  const totalN = rows.reduce((a, r) => a + r.n, 0)
  const totalOk = rows.reduce((a, r) => a + r.ok, 0)
  const totalSec = rows.reduce((a, r) => a + (Number(r.sec) || 0), 0)
  const avg = totalN ? Math.round((totalOk / totalN) * 100) : null

  const groups = useMemo(() => {
    const m = new Map()
    for (const r of shown) {
      const d = new Date(r.ts)
      const key = d.toISOString().slice(0, 10)
      const g = m.get(key) || { key, label: dayLabel(d), items: [] }
      g.items.push(r)
      m.set(key, g)
    }
    return [...m.values()]
  }, [shown])

  return (
    <div className="hi">
      <div className="hi-hero">
        <div>
          <span className="hi-eyebrow">Historique</span>
          <h1>Historique des séries et examens</h1>
          <p className="muted">Chaque série terminée est conservée sur cet appareil et synchronisée avec le compte.</p>
        </div>
        <div className="hi-kpis" role="list">
          <div className="hi-kpi" role="listitem"><span className="k">Sessions</span><b>{rows.length}</b><span>{totalN} questions</span></div>
          <div className="hi-kpi" role="listitem"><span className="k">Temps total</span><b>{fmtDur(totalSec)}</b><span>temps de réponse</span></div>
          <div className="hi-kpi" role="listitem"><span className="k">Moyenne</span><b>{avg === null ? '—' : `${avg} %`}</b><span>toutes sessions</span></div>
        </div>
      </div>

      <div className="hi-tabs" role="tablist" aria-label="Type de session">
        {[['all', 'Tout'], ['serie', 'Séries'], ['exam', 'Examens blancs']].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`hi-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {!shown.length && (
        <EmptyState icon="exam" title="Aucune session enregistrée"
          text="Termine une série ou un examen blanc : il apparaîtra ici avec son score et sa durée."
          primary={{ label: 'Créer une série', onClick: () => go({ name: 'create' }) }} />
      )}

      {groups.map(g => (
        <section key={g.key} className="hi-day">
          <div className="hi-day-h"><b>{g.label}</b><span className="muted small">{g.items.length} épreuve{g.items.length > 1 ? 's' : ''}</span></div>
          <ul>
            {g.items.map((r, i) => (
              <li key={`${g.key}-${i}`}>
                <span className={`hi-ico${r.exam ? ' exam' : ''}`} aria-hidden="true">{r.exam ? '⏱' : '✓'}</span>
                <span className="hi-main">
                  <b>{r.title || (r.exam ? 'Examen blanc' : 'Série')}</b>
                  <small className="muted">{r.n} questions · {r.ok} bonnes{r.sec ? ` · ${fmtDur(r.sec)}` : ''}</small>
                </span>
                <span className="hi-score"><b>{r.ok}/{r.n}</b><small className={r.pct >= 70 ? 'good' : r.pct >= 40 ? '' : 'bad'}>{r.pct} %</small></span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
