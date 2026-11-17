import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './session.js'
import { EmptyState } from './shell.jsx'
import './forumland.css'

/* ===== Forum & Modération — accueil (maquette 6b7ee2c1) =====
   Fils réels de la table `posts`, réponses comptées dans `comments`, spécialité déduite de
   l'identifiant de question via l'index des séries. Aucun compteur de la maquette n'est repris. */

const ago = ts => {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 3600) return `il y a ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`
  if (s < 7 * 86400) return `il y a ${Math.round(s / 86400)} j`
  const d = new Date(ts)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

export function ForumPage({ index, go }) {
  const [posts, setPosts] = useState(null)
  const [replies, setReplies] = useState(null)
  const [q, setQ] = useState('')
  const [sp, setSp] = useState('all')
  const [sort, setSort] = useState('recent')

  useEffect(() => {
    let live = true
    supabase.from('posts').select('id,qid,title,body,score,created_at').order('created_at', { ascending: false }).limit(60)
      .then(({ data }) => { if (live && data) setPosts(data) })
    supabase.from('comments').select('post_id').limit(1000)
      .then(({ data }) => { if (live && data) setReplies(data) })
    return () => { live = false }
  }, [])

  const spOf = useMemo(() => {
    const m = new Map()
    for (const s of index.series || []) for (const id of s.q || []) if (!m.has(id)) m.set(id, s.sp)
    return m
  }, [index.series])

  const rows = useMemo(() => {
    const counts = new Map()
    for (const c of replies || []) counts.set(c.post_id, (counts.get(c.post_id) || 0) + 1)
    return (posts || []).map(p => ({
      id: p.id, qid: p.qid, title: p.title || `Question ${p.qid || ''}`.trim(),
      body: String(p.body || '').replace(/\s+/g, ' ').slice(0, 170),
      sp: spOf.get(p.qid) || 'Autres', score: Number(p.score) || 0,
      replies: counts.get(p.id) || 0, at: p.created_at,
    }))
  }, [posts, replies, spOf])

  const specs = useMemo(() => {
    const m = new Map()
    for (const r of rows) m.set(r.sp, (m.get(r.sp) || 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1])
  }, [rows])

  const needle = q.trim().toLowerCase()
  const shown = rows
    .filter(r => (sp === 'all' || r.sp === sp) && (!needle || `${r.title} ${r.body}`.toLowerCase().includes(needle)))
    .sort((a, b) => (sort === 'replies' ? b.replies - a.replies : sort === 'votes' ? b.score - a.score : new Date(b.at) - new Date(a.at)))

  return (
    <div className="fo">
      <div className="fo-hero">
        <div>
          <span className="fo-eyebrow">Forum & modération</span>
          <h1>Forum médical & arbitrages pédagogiques</h1>
          <p className="muted">Discussions par question : réponses officielles des modérateurs, débats et validations.</p>
        </div>
        <div className="fo-hero-side">
          <span className="fo-badge">{rows.length} discussions</span>
          <button type="button" className="primary" onClick={() => go({ name: 'forum' })}>+ Poser une question sur un QCM</button>
        </div>
      </div>

      <div className="fo-toolbar">
        <label className="fo-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une discussion" aria-label="Rechercher une discussion" />
        </label>
        <div className="fo-sort">
          <span className="muted small">Trier</span>
          {[['recent', 'Plus récents'], ['replies', 'Plus débattus'], ['votes', 'Votes utiles']].map(([k, label]) => (
            <button key={k} type="button" className={`fo-chip${sort === k ? ' on' : ''}`} onClick={() => setSort(k)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="fo-body">
        <aside className="fo-side">
          <span className="fo-side-h">Spécialités</span>
          <button type="button" className={`fo-side-b${sp === 'all' ? ' on' : ''}`} onClick={() => setSp('all')}>Toutes <span>{rows.length}</span></button>
          {specs.map(([name, n]) => (
            <button key={name} type="button" className={`fo-side-b${sp === name ? ' on' : ''}`} onClick={() => setSp(name)}>{name} <span>{n}</span></button>
          ))}
        </aside>

        <div className="fo-list">
          {posts === null && <p className="muted">Chargement des discussions…</p>}
          {posts && rows.length === 0 && (
            <EmptyState icon="forum" title="Aucune question posée"
              text="Aucune question n’a encore été publiée sur les QCM ou les cas cliniques."
              primary={{ label: 'Poser une question sur un QCM', onClick: () => go({ name: 'forum' }) }}
              secondary={{ label: 'Explorer les discussions', onClick: () => go({ name: 'forum' }) }} />
          )}
          {posts && rows.length > 0 && !shown.length && (
            <EmptyState icon="search" title="Aucune discussion pour ce filtre" text="Élargis la recherche ou choisis une autre spécialité."
              primary={{ label: 'Toutes les spécialités', onClick: () => { setSp('all'); setQ('') } }} />
          )}
          {shown.map(r => (
            <article key={r.id} className="fo-thread">
              <div className="fo-thread-h">
                <span className="fo-tag">{r.sp}</span>
                {r.qid && <span className="muted small">QCM {r.qid}</span>}
                <span className="muted small fo-when">{ago(r.at)}</span>
              </div>
              <h3>{r.title}</h3>
              {r.body && <p>{r.body}…</p>}
              <div className="fo-thread-f">
                <span className="muted small">▲ {r.score}</span>
                <span className="muted small">💬 {r.replies} réponse{r.replies > 1 ? 's' : ''}</span>
                <button type="button" className="link" onClick={() => go({ name: 'forum', qid: r.qid })}>Ouvrir la discussion →</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
