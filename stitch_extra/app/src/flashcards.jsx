import React, { useCallback, useEffect, useMemo, useState } from 'react'
import './study.css'

/* ===== Fiches mémo / flashcards (maquette « fiches mémo ») =====
   Recto/verso avec persistance locale par cours : la carte courante, les cartes marquées
   « su » et « à revoir » sont conservées sur l'appareil (clé `fc:<cours>`).
   Aucune carte n'est inventée : le paquet vient de `deck` (fiches réellement publiées).
   Sans paquet, l'écran affiche un état vide explicite. */

const KEY = course => `fc:${course}`

function load(course) {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(course)) || '{}')
    return { i: Number.isInteger(v.i) ? v.i : 0, known: Array.isArray(v.known) ? v.known : [], again: Array.isArray(v.again) ? v.again : [] }
  } catch { return { i: 0, known: [], again: [] } }
}

export function Flashcards({ index, go, init }) {
  const course = init && init.course != null ? init.course : (index.subjects[0] || {}).no
  const deck = (init && Array.isArray(init.deck) ? init.deck : [])
  const subject = (index.subjects || []).find(s => s.no === course)
  const [st, setSt] = useState(() => load(course))
  const [flip, setFlip] = useState(false)

  useEffect(() => { setSt(load(course)); setFlip(false) }, [course])
  useEffect(() => { try { localStorage.setItem(KEY(course), JSON.stringify(st)) } catch {} }, [st, course])

  const n = deck.length
  const card = deck[Math.min(st.i, Math.max(n - 1, 0))]
  const mark = useCallback(kind => {
    setSt(s => {
      const known = new Set(s.known), again = new Set(s.again)
      if (kind === 'su') { known.add(s.i); again.delete(s.i) } else { again.add(s.i); known.delete(s.i) }
      return { i: Math.min(s.i + 1, Math.max(n - 1, 0)), known: [...known], again: [...again] }
    })
    setFlip(false)
  }, [n])

  useEffect(() => {
    const onKey = e => {
      if (e.key === ' ') { e.preventDefault(); setFlip(f => !f) }
      if (e.key === 'ArrowRight') mark('su')
      if (e.key === 'ArrowLeft') mark('revoir')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mark])

  const done = st.known.length + st.again.length
  const pct = n ? Math.round((done / n) * 100) : 0

  return (
    <div className="stp">
      <div className="stp-top">
        <button type="button" className="ghost" onClick={() => go({ name: 'library' })}>← Packs</button>
        <span className="stp-crumb">{subject ? subject.name : 'Fiches mémo'}</span>
      </div>

      <header className="stp-head">
        <div>
          <span className="stp-eyebrow">Fiches mémo</span>
          <h1>Flashcards</h1>
          <p className="muted small">
            {n ? `${n} cartes · ${done} vues · ${st.known.length} sues` : 'Aucune fiche publiée pour ce cours'}
          </p>
        </div>
        {!!n && (
          <div className="fc-acts">
            <button type="button" className="soft" onClick={() => { setSt({ i: 0, known: [], again: [] }); setFlip(false) }}>Recommencer</button>
          </div>
        )}
      </header>

      {!!n && (
        <div className="fc-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progression">
          <span style={{ width: `${pct}%` }} />
        </div>
      )}

      {!n ? (
        <div className="stp-empty">
          <b>Pas encore de cartes</b>
          <p className="muted small">
            Les fiches de ce cours ne sont pas encore publiées en cartes. Tu peux lire la fiche complète ci-dessous.
          </p>
          <button type="button" className="primary" onClick={() => go({ name: 'packs', course, kind: 'fiche' })}>Ouvrir la fiche</button>
        </div>
      ) : (
        <>
          <div className="fc-stage">
            <div className={`fc-card${flip ? ' flip' : ''}`} onClick={() => setFlip(f => !f)} role="button" tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter') setFlip(f => !f) }}
              aria-label={`Carte ${st.i + 1} sur ${n}, ${flip ? 'verso' : 'recto'}`}>
              <span className="fc-side">{flip ? 'Verso' : 'Recto'}</span>
              {card && card.tag && <span className="fc-tag">{card.tag}</span>}
              <p className="fc-txt">{card ? (flip ? card.back : card.front) : ''}</p>
              <span className="fc-hint">{flip ? 'Réponse' : 'Clique pour révéler'}</span>
            </div>
          </div>

          <div className="fc-ctrl">
            <button type="button" className="soft" onClick={() => mark('revoir')}>À revoir</button>
            <span className="muted small">{Math.min(st.i + 1, n)} / {n}</span>
            <button type="button" className="primary" onClick={() => mark('su')}>Su</button>
          </div>
          <p className="muted small fc-keys">Espace pour retourner · ← à revoir · → su</p>
        </>
      )}
    </div>
  )
}
