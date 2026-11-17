import React, { useMemo, useState } from 'react'
import { PACK_KINDS } from './packsReady.js'
import { hasKind } from './packs.jsx'
import './library.css'
import { EmptyState } from './shell.jsx'

/* ===== Cours vidéo & Fiches — accueil « Packs de révision » (maquette ff5895af) =====
   Une carte par cours qui possède au moins un contenu (fiche, cartes, mémo, leçon ou vidéo).
   Les compteurs viennent de PACK_KINDS (ce qui est réellement en ligne) ; aucune valeur de
   maquette n'est reprise ici : le nombre de fiches affiché est celui des fichiers servis. */

const KIND_LABEL = { fiche: 'Fiche mémo', resume: 'Résumé', cartes: 'Cartes de révision', concept: 'Cartes conceptuelles', memo: 'Fiche mémo', lecon: 'Leçon interactive' }

const clean = s => String(s || '').replace(/\s{2,}.*$/, '').trim()

export function LibraryPage({ index, go }) {
  const [sp, setSp] = useState('all')
  const [q, setQ] = useState('')

  // sn → spécialité (l'index ne la porte que sur les séries)
  const spOf = useMemo(() => {
    const m = new Map()
    for (const s of index.series || []) if (s.sn && s.sp && !m.has(s.sn)) m.set(s.sn, s.sp)
    return m
  }, [index.series])

  const courses = useMemo(() => (index.subjects || []).map(s => {
    const kinds = PACK_KINDS[s.no] || []
    const fiches = kinds.filter(k => k === 'fiche' || k === 'resume' || k === 'memo').length
    const cards = kinds.filter(k => k === 'cartes' || k === 'concept').length
    const lecons = kinds.filter(k => k === 'lecon').length
    return { no: s.no, name: clean(s.name), sp: spOf.get(s.no) || 'Autres', fiches, cards, lecons, video: hasKind(s.no, 'video'), total: kinds.length + (hasKind(s.no, 'video') ? 1 : 0) }
  }).filter(c => c.total > 0), [index.subjects, spOf])

  const specs = useMemo(() => {
    const m = new Map()
    for (const c of courses) m.set(c.sp, (m.get(c.sp) || 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1])
  }, [courses])

  const needle = q.trim().toLowerCase()
  const shown = courses.filter(c => (sp === 'all' || c.sp === sp) && (!needle || c.name.toLowerCase().includes(needle)))
  const withVideo = courses.filter(c => c.video).length

  return (
    <div className="lib">
      <div className="lib-hero">
        <div>
          <span className="lib-eyebrow">Cours & packs</span>
          <h1>Packs de révision</h1>
          <p className="muted">Fiches synthétiques, cartes, mémos et vidéos de chaque cours — {courses.length} cours couverts.</p>
        </div>
        <div className="lib-kpis" role="list">
          <div className="lib-kpi" role="listitem"><span className="k">Packs disponibles</span><b>{courses.length}</b><span>{specs.length} spécialités</span></div>
          <div className="lib-kpi" role="listitem"><span className="k">Avec vidéo</span><b>{withVideo}</b><span>épisodes ou replay</span></div>
        </div>
      </div>

      <div className="lib-filters">
        <label className="lib-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un cours" aria-label="Rechercher un cours" />
        </label>
        <div className="lib-tabs">
          <button type="button" className={`lib-tab${sp === 'all' ? ' on' : ''}`} onClick={() => setSp('all')}>Tous <span>{courses.length}</span></button>
          {specs.slice(0, 6).map(([name, n]) => (
            <button key={name} type="button" className={`lib-tab${sp === name ? ' on' : ''}`} onClick={() => setSp(name)}>{name} <span>{n}</span></button>
          ))}
        </div>
      </div>

      {!shown.length && (
        <EmptyState icon="packs" title="Aucun pack pour ce filtre"
          text="Aucun contenu publié ne correspond à cette spécialité ou à cette recherche."
          primary={{ label: 'Tous les packs', onClick: () => { setSp('all'); setQ('') } }} />
      )}
      <div className="lib-grid">
        {shown.map(c => (
          <article key={c.no} className="lib-card">
            <header>
              <span className="lib-tag sp">{c.sp}</span>
              <span className={`lib-tag${c.video ? ' ok' : ''}`}>{c.video ? 'Vidéo' : 'Écrit'}</span>
            </header>
            <h3>{c.name}</h3>
            <ul className="lib-list">
              {c.fiches > 0 && <li><b>{c.fiches}</b> fiche{c.fiches > 1 ? 's' : ''} mémo</li>}
              {c.cards > 0 && <li><b>{c.cards}</b> carte{c.cards > 1 ? 's' : ''}</li>}
              {c.lecons > 0 && <li><b>{c.lecons}</b> leçon{c.lecons > 1 ? 's' : ''}</li>}
              {c.video && <li><b>Vidéo</b> du cours</li>}
            </ul>
            <button type="button" className="primary lib-cta" onClick={() => go({ name: 'packs', course: c.no })}>Ouvrir le pack →</button>
          </article>
        ))}
      </div>
    </div>
  )
}
