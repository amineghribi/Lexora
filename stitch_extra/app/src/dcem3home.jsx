import React, { useMemo, useState } from 'react'
import { useMeta } from './data.js'
import { expandCases, pct } from './logic.js'
import { ptsOf } from './store.js'
import { hasKind } from './packs.jsx'
import { FACULTIES } from './track.jsx'

const clean = s => String(s || '').replace(/\s{2,}.*$/, '').trim()
const fold = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const QCM_N = 20

// Accueil d'un compte DCEM3 : la liste des cours de son espace, avec deux actions par cours (vidéo, QCM).
// Les cours viennent de l'index déjà filtré par le serveur (scopeIndex) : rien d'inaccessible n'est proposé.
export function Dcem3Home({ index, state, go, onStart, faculty }) {
  const { rows: pool } = useMeta(null)
  const [q, setQ] = useState('')
  const facName = (FACULTIES.find(([k]) => k === faculty) || [])[1]
  const counts = useMemo(() => {
    const m = new Map()
    for (const e of pool || []) if (e.p && e.f !== 'x') m.set(e.sn, (m.get(e.sn) || 0) + 1)
    return m
  }, [pool])
  const courses = useMemo(() => index.subjects.map(s => ({ no: s.no, name: clean(s.name) })).sort((a, b) => a.name.localeCompare(b.name, 'fr')), [index])
  const shown = q.trim() ? courses.filter(c => fold(c.name).includes(fold(q.trim()))) : courses
  const att = state.attempts || []
  const acc = pct(att.reduce((a, x) => a + ptsOf(x), 0), att.length)

  const startQcm = c => {
    const seen = state.cards || {}
    const rows = (pool || []).filter(e => e.sn === c.no && e.p && e.f !== 'x').map(e => ({ e, r: Math.random() }))
    rows.sort((a, b) => ((seen[a.e.i] ? 1 : 0) - (seen[b.e.i] ? 1 : 0)) || (((b.e.fr && b.e.fr[0]) || 0) - ((a.e.fr && a.e.fr[0]) || 0)) || a.r - b.r)
    const ids = expandCases(rows.map(x => x.e.i), index, QCM_N)
    if (ids.length) onStart({ title: `QCM — ${c.name}`, ids, subjectHint: c.no, mode: 'immediate', kind: 'custom' })
  }

  return (
    <div>
      <div className="page-h">
        <h1>DCEM3{facName ? ` · ${facName}` : ''}</h1>
        <p className="muted">Tes cours. Pour chacun : la vidéo ou les QCM (nouvelles questions d’abord).</p>
        <p className="muted small">{att.length.toLocaleString('fr')} réponses données{att.length ? ` · ${acc} % de réussite` : ''}</p>
      </div>
      <input type="search" placeholder="Rechercher un cours, ex. diabète" value={q} onChange={e => setQ(e.target.value)} aria-label="Rechercher un cours" style={{ width: '100%', marginBottom: 12 }} />
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {shown.map(c => {
          const n = counts.get(c.no) || 0
          const vid = hasKind(c.no, 'video')
          return (
            <li key={c.no} className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ minWidth: 0 }}><b>{c.name}</b>{pool && <span className="muted small"> · {n} question{n > 1 ? 's' : ''}</span>}</span>
              <span style={{ display: 'inline-flex', gap: 8 }}>
                <button type="button" className="ghost" disabled={!vid} title={vid ? undefined : 'Pas encore de vidéo pour ce cours'} onClick={() => go({ name: 'packs', video: { course: c.no } })}>Vidéo</button>
                <button type="button" className="primary" disabled={!pool || !n} onClick={() => startQcm(c)}>QCM</button>
              </span>
            </li>
          )
        })}
        {!shown.length && <li className="muted small">Aucun cours ne correspond.</li>}
      </ul>
    </div>
  )
}
