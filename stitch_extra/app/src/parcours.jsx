import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './session.js'
import { useMeta } from './data.js'
import { expandCases } from './logic.js'
import { hasKind } from './packs.jsx'
import { Ring, PageHead } from './shell.jsx'

/* ===== Parcours DCEM3 =====
   Le programme de révision DCEM3 S2, module par module, avec l'avancement de l'élève.
   Source : RPC my_parcours() (supabase/migrations/*_dcem3_parcours.sql) ; l'avancement
   s'écrit par parcours_mark(). Si la migration n'est pas appliquée, l'écran retombe sur
   la liste des cours du parcours (index filtré par le serveur) — rien n'est inventé. */

const QCM_N = 20
const clean = s => String(s || '').replace(/\s{2,}.*$/, '').trim()
const KIND_LABEL = { qcm: 'QCM', video: 'Vidéo', fiche: 'Fiche', arc: 'Cas clinique' }

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

export function ParcoursView({ index, state, go, onStart }) {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | unavailable
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState('')
  const [override, setOverride] = useState({}) // item_id → statut local (mise à jour optimiste)
  const { rows: pool } = useMeta(null)

  useEffect(() => {
    let live = true
    rpc('my_parcours').then(d => {
      if (!live) return
      setData(d || null)
      setStatus(d && d.parcours ? 'ready' : 'unavailable')
      setOpen(d && d.modules && d.modules[0] ? d.modules[0].id : null)
    }).catch(() => { if (live) setStatus('unavailable') })
    return () => { live = false }
  }, [])

  const modules = useMemo(() => {
    if (!data || !Array.isArray(data.modules)) return []
    return data.modules.map(m => {
      const items = (m.items || []).map(it => ({ ...it, status: override[it.id] || it.status || 'todo' }))
      const done = items.filter(i => i.status === 'done').length
      return { ...m, items, done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 }
    })
  }, [data, override])

  const totalDone = modules.reduce((a, m) => a + m.done, 0)
  const totalItems = modules.reduce((a, m) => a + m.total, 0)
  const pct = totalItems ? Math.round((totalDone / totalItems) * 100) : 0

  const mark = async (item, next) => {
    if (busy) return
    setBusy(item.id); setMsg('')
    const before = item.status
    setOverride(o => ({ ...o, [item.id]: next }))
    try {
      await rpc('parcours_mark', { p_item: item.id, p_status: next })
    } catch (e) {
      setOverride(o => ({ ...o, [item.id]: before }))
      setMsg('Enregistrement impossible pour le moment. Réessaie dans un instant.')
    } finally { setBusy(null) }
  }

  const startCourse = sn => {
    if (!pool || !sn) return
    const seen = (state && state.cards) || {}
    const rows = pool.filter(e => e.sn === sn && e.p && e.f !== 'x').map(e => ({ e, r: Math.random() }))
    rows.sort((a, b) => ((seen[a.e.i] ? 1 : 0) - (seen[b.e.i] ? 1 : 0)) || (((b.e.fr && b.e.fr[0]) || 0) - ((a.e.fr && a.e.fr[0]) || 0)) || a.r - b.r)
    const ids = expandCases(rows.map(x => x.e.i), index, QCM_N)
    if (ids.length) onStart({ title: `Parcours — ${clean((index.subjects.find(s => s.no === sn) || {}).name) || `Cours ${sn}`}`, ids, subjectHint: sn, mode: 'immediate', kind: 'custom' })
  }

  const Header = () => (
    <PageHead eyebrow="Parcours DCEM3"
      title={(data && data.parcours && data.parcours.title) || 'Parcours DCEM3'}
      subtitle={(data && data.parcours && data.parcours.subtitle) || 'Le programme de révision du semestre, module par module.'} />
  )

  if (status === 'loading') return (<div><Header /><div className="card skeleton" style={{ margin: 0 }} role="status">Chargement du parcours…</div></div>)

  // Repli : pas de migration appliquée → liste des cours du parcours, sans avancement inventé.
  if (status === 'unavailable') {
    const courses = (index && index.subjects ? index.subjects : []).map(s => ({ no: s.no, name: clean(s.name) })).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    return (
      <div>
        <Header />
        <div className="card" style={{ marginTop: 0 }}>
          <b>Avancement du parcours bientôt disponible</b>
          <p className="muted small" style={{ margin: '4px 0 0' }}>En attendant, les {courses.length} cours de ton espace restent accessibles ci-dessous.</p>
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {courses.map(c => (
            <li key={c.no} className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', margin: 0 }}>
              <span style={{ minWidth: 0 }}><b>{c.name}</b></span>
              <span style={{ display: 'inline-flex', gap: 8 }}>
                {hasKind(c.no, 'video') && <button type="button" className="ghost" onClick={() => go({ name: 'packs', kind: 'video', course: c.no })}>Vidéo</button>}
                <button type="button" className="primary" disabled={!pool} onClick={() => startCourse(c.no)}>QCM</button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div>
      <Header />
      <section className="card" style={{ marginTop: 0, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Ring pct={pct} size={72} stroke={7}><b>{pct}%</b><small>fait</small></Ring>
        <div style={{ minWidth: 0, flex: 1 }}>
          <b>{totalDone} sur {totalItems} étapes</b>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            {modules.length} modules · {data.parcours && data.parcours.ends_on ? `fin le ${new Date(data.parcours.ends_on).toLocaleDateString('fr-FR')}` : 'rythme libre'}
          </p>
        </div>
        <button type="button" className="primary" onClick={() => go({ name: 'daily' })}>Réviser ce qui est dû</button>
      </section>

      {msg && <p role="alert" className="callout" style={{ marginTop: 12 }}>{msg}</p>}

      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {modules.map(m => {
          const isOpen = open === m.id
          return (
            <section key={m.id} className="card" style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : m.id)}
                aria-expanded={isOpen} aria-controls={`pm-${m.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', border: 0, background: 'none', padding: 14, textAlign: 'left', minHeight: 56 }}>
                <Ring pct={m.pct} size={38} stroke={4}><b style={{ fontSize: 11 }}>{m.pct}%</b></Ring>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block' }}>{m.title}</b>
                  <span className="muted small">{m.done}/{m.total} étapes{m.specialty ? ` · ${m.specialty}` : ''}</span>
                </span>
                <span aria-hidden="true" className="muted">{isOpen ? '▴' : '▾'}</span>
              </button>
              {isOpen && (
                <ul id={`pm-${m.id}`} style={{ listStyle: 'none', margin: 0, padding: '0 14px 12px', display: 'grid', gap: 6 }}>
                  {m.items.map(it => {
                    const done = it.status === 'done'
                    return (
                      <li key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--line2)' }}>
                        <span className="chip" style={{ flex: 'none' }}>{KIND_LABEL[it.kind] || it.kind}</span>
                        <span style={{ flex: 1, minWidth: 0, textDecoration: done ? 'line-through' : 'none', opacity: done ? .65 : 1 }}>{it.label}</span>
                        {it.kind === 'qcm' && <button type="button" className="ghost" style={{ minHeight: 34, padding: '4px 10px', fontSize: 13 }} disabled={!pool} onClick={() => startCourse(it.sn)}>Faire</button>}
                        {it.sn != null && hasKind(it.sn, 'video') && (
                          <button type="button" className="ghost" style={{ minHeight: 34, padding: '4px 10px', fontSize: 13 }}
                            onClick={() => go({ name: 'packs', kind: 'video', course: it.sn })}
                            title={it.kind === 'video' ? 'Ouvrir la vidéo du cours' : 'Ce cours a une vidéo (épisodes ou replay)'}>
                            {it.kind === 'video' ? 'Regarder' : 'Vidéo'}
                          </button>
                        )}
                        <button type="button" className={done ? 'ghost' : 'ghost'} style={{ minHeight: 34, padding: '4px 10px', fontSize: 13, color: done ? 'var(--good)' : undefined }}
                          disabled={busy === it.id} onClick={() => mark(it, done ? 'todo' : 'done')}
                          aria-pressed={done}>
                          {done ? '✓ Fait' : 'Marquer fait'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
