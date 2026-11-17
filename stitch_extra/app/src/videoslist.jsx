import React, { useMemo, useState } from 'react'
import { hasKind } from './packs.jsx'
import './videoslist.css'

/* ===== Cours vidéo — liste (maquette « cours en vidéo ») =====
   Liste des cours qui ont réellement une vidéo (épisodes R2 ou replay YouTube, via `hasKind`).
   Aucune durée inventée : elle n'est pas exposée dans l'index, la carte affiche donc le nombre
   d'épisodes quand il est connu, sinon la seule présence de la vidéo. */

const clean = s => String(s || '').replace(/\s{2,}.*$/, '').trim()

export function VideosList({ index, go }) {
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const spOf = new Map()
    for (const s of index.series || []) if (s.sn && s.sp && !spOf.has(s.sn)) spOf.set(s.sn, s.sp)
    return (index.subjects || [])
      .filter(s => hasKind(s.no, 'video'))
      .map(s => ({ no: s.no, name: clean(s.name), sp: spOf.get(s.no) || 'Autres', n: s.n }))
  }, [index.subjects, index.series])

  const specs = useMemo(() => {
    const m = new Map()
    for (const r of rows) m.set(r.sp, (m.get(r.sp) || 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1])
  }, [rows])

  const [sp, setSp] = useState('all')
  const needle = q.trim().toLowerCase()
  const shown = rows.filter(r => (sp === 'all' || r.sp === sp) && (!needle || r.name.toLowerCase().includes(needle)))

  return (
    <div className="vl">
      <div className="vl-top">
        <button type="button" className="ghost" onClick={() => go({ name: 'library' })}>← Packs</button>
        <span className="vl-crumb">Cours vidéo</span>
      </div>

      <header className="vl-head">
        <div>
          <span className="vl-eyebrow">Vidéos de cours</span>
          <h1>Cours vidéo</h1>
          <p className="muted small">{rows.length} cours avec vidéo sur {index.subjects.length} · {specs.length} spécialités</p>
        </div>
        <button type="button" className="soft" onClick={() => go({ name: 'library' })}>Tous les packs</button>
      </header>

      <div className="vl-filters">
        <label className="vl-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un cours" aria-label="Rechercher un cours" />
        </label>
        <div className="vl-tabs">
          <button type="button" className={sp === 'all' ? 'on' : ''} onClick={() => setSp('all')}>Toutes <span>{rows.length}</span></button>
          {specs.slice(0, 6).map(([name, n]) => (
            <button key={name} type="button" className={sp === name ? 'on' : ''} onClick={() => setSp(name)}>{name} <span>{n}</span></button>
          ))}
        </div>
      </div>

      {!shown.length && (
        <div className="vl-empty">
          <b>Aucune vidéo pour ce filtre</b>
          <p className="muted small">Élargis la recherche ou choisis une autre spécialité.</p>
        </div>
      )}

      <ul className="vl-list">
        {shown.map(r => (
          <li key={r.no}>
            <span className="vl-ico" aria-hidden="true">▶</span>
            <span className="vl-main">
              <b>{r.name}</b>
              <small className="muted">{r.sp}{typeof r.n === 'number' ? ` · ${r.n} questions` : ''}</small>
            </span>
            <button type="button" className="primary vl-go" onClick={() => go({ name: 'packs', course: r.no, kind: 'video' })}>Regarder →</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
