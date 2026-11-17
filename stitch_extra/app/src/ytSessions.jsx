import React, { useState } from 'react'
import SESSIONS from './ytSessions.json'

// Séances de révision enregistrées et publiées sur YouTube par des tiers, rattachées aux cours.
// Champs : id (YouTube), c (cours), t (titre), d (date de mise en ligne), s (durée en s), ch (chaîne), f (faculté d'origine si connue), m (séance commune à plusieurs cours)
const BY_COURSE = new Map()
for (const v of SESSIONS) for (const n of v.c) { if (!BY_COURSE.has(n)) BY_COURSE.set(n, []); BY_COURSE.get(n).push(v) }
export const hasYt = n => BY_COURSE.has(n)
export const ytCount = n => (BY_COURSE.get(n) || []).length

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const fmtDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : '' }
const fmtDur = s => { const h = Math.floor((s || 0) / 3600), m = Math.round(((s || 0) % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min` }

export function YtSessions({ course }) {
  const list = [...(BY_COURSE.get(course) || [])].sort((a, b) => (b.d || '').localeCompare(a.d || '') || a.t.localeCompare(b.t, 'fr'))
  const [cur, setCur] = useState(null)
  if (!list.length) return null
  return (
    <section aria-label="Séances enregistrées" style={{ marginTop: 16 }}>
      <h3 style={{ margin: '0 0 4px' }}>Séances enregistrées ({list.length})</h3>
      <p className="muted small" style={{ margin: '0 0 10px' }}>Séances de révision publiées sur YouTube par d’autres étudiants ou enseignants, accessibles à tous les comptes. Elles ne sont pas produites par Résidanat QCM et leur contenu n’est pas vérifié ici : confronte-les au cours.</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {list.map(v => (
          <div key={v.id} className="card" style={{ margin: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span style={{ minWidth: 0 }}>
                <b>{v.t}</b>
                <br /><span className="muted small">
                  Mise en ligne le {fmtDate(v.d)} · {fmtDur(v.s)} · {v.f ? `Faculté : ${v.f}` : 'Faculté non précisée'}{v.ch ? ` · Chaîne : ${v.ch}` : ''}
                </span>
                {v.m ? <><br /><span className="muted small">Séance commune à plusieurs cours.</span></> : null}
              </span>
              <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                <button className={cur === v.id ? 'ghost' : 'primary'} onClick={() => setCur(cur === v.id ? null : v.id)}>{cur === v.id ? 'Fermer' : 'Regarder'}</button>
                <a className="ghost" style={{ display: 'inline-flex', alignItems: 'center', padding: '0 12px', minHeight: 40 }} href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer">YouTube</a>
              </span>
            </div>
            {cur === v.id && (
              <div style={{ marginTop: 10, position: 'relative', paddingTop: '56.25%', background: '#000', borderRadius: 'var(--r)', overflow: 'hidden' }}>
                <iframe title={v.t} src={`https://www.youtube-nocookie.com/embed/${v.id}?rel=0`} allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
