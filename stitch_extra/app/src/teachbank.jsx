import React, { useMemo, useState } from 'react'
import './teachbank.css'

/* 5.1 — Banque des patients (espace enseignant), en LECTURE.
   Liste les cas réellement enregistrés par l'enseignant (`sim_cases_mine`), sans action d'écriture :
   l'aperçu ouvre le cas tel que l'élève le verra. */

const STATUS = { draft: 'Brouillon', published: 'Publié', archived: 'Archivé' }
const pretty = m => String(m || '').replace(/[-_]/g, ' ')

export function TeacherBank({ cases, spec, err, onPreview, onEdit }) {
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')

  const all = cases || []
  const counts = useMemo(() => {
    const m = { all: all.length, draft: 0, published: 0, archived: 0 }
    for (const c of all) m[c.status] = (m[c.status] || 0) + 1
    return m
  }, [all])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all.filter(c =>
      (tab === 'all' || c.status === tab) &&
      (!needle || String(c.title || '').toLowerCase().includes(needle) || pretty(c.motif_id).toLowerCase().includes(needle)))
  }, [all, tab, q])

  return (
    <div className="tb">
      <header className="tb-head">
        <div>
          <span className="tb-eyebrow">Espace enseignant{spec ? ` · ${spec.label}` : ''}</span>
          <h1>Banque des patients</h1>
          <p className="muted small">
            {cases === null ? 'Chargement…' : `${counts.all} cas · ${counts.published} publié${counts.published > 1 ? 's' : ''} · ${counts.draft} brouillon${counts.draft > 1 ? 's' : ''}`}
          </p>
        </div>
      </header>

      {err && <div className="tb-err" role="alert"><b>Chargement impossible</b><p className="muted small">{err}</p></div>}

      <div className="tb-bar">
        <nav className="tb-tabs" aria-label="État des cas">
          {[['all', 'Tous'], ['published', 'Publiés'], ['draft', 'Brouillons'], ['archived', 'Archivés']].map(([k, l]) => (
            <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {l}{counts[k] ? ` ${counts[k]}` : ''}
            </button>
          ))}
        </nav>
        <label className="tb-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un cas ou un motif" aria-label="Rechercher un cas" />
        </label>
      </div>

      {cases !== null && !list.length && !err && (
        <div className="tb-empty">
          <b>{all.length ? 'Aucun cas dans ce filtre' : 'Aucun cas enregistré'}</b>
          <p className="muted small">{all.length ? 'Change d’onglet ou vide la recherche.' : 'Les cas que tu écriras apparaîtront ici.'}</p>
        </div>
      )}

      {!!list.length && (
        <ul className="tb-list">
          {list.map(c => (
            <li key={c.id}>
              <div className="tb-row">
                <span className={`tb-st ${c.status}`}>{STATUS[c.status] || c.status}</span>
                <b>{c.title}</b>
                <span className="tb-date">{c.updated_at ? new Date(c.updated_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</span>
              </div>
              <div className="tb-meta">
                <span>motif : {pretty(c.motif_id) || '—'}</span>
                <span className="tb-acts">
                  <button type="button" className="link" onClick={() => onPreview(c.id, c.motif_id)}>Aperçu élève →</button>
                  {onEdit && <button type="button" className="link" onClick={() => onEdit(c.id)}>Modifier →</button>}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="tb-note">
        Lecture seule : la création, la modification et la publication d’un cas passent par l’éditeur
        pas à pas, qui écrit en base et demande une migration appliquée.
      </p>
    </div>
  )
}
