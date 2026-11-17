import React, { useMemo, useState } from 'react'
import './study.css'

/* ===== Pré-requis avant le cours (maquette « pré-requis ») =====
   Reprend la logique existante : un sujet est proposé quand au moins 5 questions d'introduction
   existent (index.pre), filtré par spécialité et par recherche. Aucun sujet, compteur ou durée
   n'est inventé : tout vient de l'index. */

export function PreReadPage({ index, go, onStart }) {
  const [sp, setSp] = useState('')
  const [q, setQ] = useState('')
  const fold = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  const sps = useMemo(() => [...new Set((index.series || []).map(s => s.sp))].sort(), [index.series])
  const spSn = useMemo(() => {
    const m = {}
    for (const s of index.series || []) if (s.sn) (m[s.sp] = m[s.sp] || new Set()).add(s.sn)
    return m
  }, [index.series])

  const all = (index.subjects || []).filter(s => ((index.pre || {})[s.no] || []).length >= 5)
  const rows = all.filter(s =>
    (!sp || (spSn[sp] && spSn[sp].has(s.no))) &&
    (!q.trim() || fold(s.name + ' ' + (s.title || '')).includes(fold(q.trim())))
  )
  const total = all.reduce((n, s) => n + index.pre[s.no].length, 0)

  return (
    <div className="stp">
      <div className="stp-top">
        <button type="button" className="ghost" onClick={() => go({ name: 'train' })}>← S’entraîner</button>
        <span className="stp-crumb">Pré-requis</span>
      </div>

      <header className="stp-head">
        <div>
          <span className="stp-eyebrow">Avant de lire le cours</span>
          <h1>Pré-requis</h1>
          <p className="muted small">
            {all.length} sujets · {total.toLocaleString('fr')} questions d’introduction
          </p>
        </div>
      </header>

      <div className="stp-bar">
        <label className="stp-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un sujet" aria-label="Rechercher un sujet" />
        </label>
        <div className="stp-tabs">
          <button type="button" className={sp === '' ? 'on' : ''} onClick={() => setSp('')}>Toutes <span>{all.length}</span></button>
          {sps.map(name => {
            const n = all.filter(s => spSn[name] && spSn[name].has(s.no)).length
            return (
              <button key={name} type="button" className={sp === name ? 'on' : ''} onClick={() => setSp(name)} disabled={!n}>
                {name} <span>{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      <p className="stp-note">
        Rappels de définitions, mécanismes, anatomie et épidémiologie à passer avant d’ouvrir le cours.
        La sélection des questions est automatique.
      </p>

      {!rows.length && (
        <div className="stp-empty">
          <b>Aucun sujet ne correspond</b>
          <p className="muted small">Élargis la recherche ou retire le filtre de spécialité.</p>
        </div>
      )}

      <ul className="stp-grid">
        {rows.map(s => (
          <li key={s.no} className="stp-card">
            <span className="stp-no">Sujet {s.no}</span>
            <b>{s.name}</b>
            <span className="muted small">{index.pre[s.no].length} questions</span>
            <div className="stp-actions">
              <button type="button" className="primary" onClick={() => onStart({
                title: `Avant le cours : ${s.name}`, ids: index.pre[s.no], subjectHint: s.no, mode: 'immediate', kind: 'pre',
              })}>Commencer</button>
              <button type="button" className="link" onClick={() => go({ name: 'course', course: s.no })}>Voir le cours →</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
