import React, { useEffect, useRef, useState } from 'react'
import { supabase, openAuth } from './session.js'
import { useAuth } from './auth.jsx'

const CATS = [['questions', 'Questions / séries à ajouter'], ['fonctionnalite', 'Nouvelle fonctionnalité'], ['bug', 'Problème dans l’app'], ['cours', 'Cours / explications'], ['autre', 'Autre']]

// Fenêtre « Une suggestion ? » : l'élève écrit, le message est enregistré dans la table suggestions (relue par l'équipe)
export function SuggestButton() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [cat, setCat] = useState('questions')
  const [txt, setTxt] = useState('')
  const [st, setSt] = useState('idle') // idle | busy | ok | err | many
  const area = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const esc = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', esc)
    if (area.current) area.current.focus()
    return () => document.removeEventListener('keydown', esc)
  }, [open])
  const show = () => { if (!user) { openAuth('login'); return } setSt('idle'); setOpen(true) }
  const send = async e => {
    e.preventDefault()
    if (txt.trim().length < 5) return
    setSt('busy')
    try {
      const { error } = await supabase.rpc('send_suggestion', { p_cat: cat, p_body: txt.trim().slice(0, 1000) })
      if (error) throw error
      setTxt(''); setSt('ok')
    } catch (err) { setSt(/TOO_MANY/.test(String(err && err.message)) ? 'many' : 'err') }
  }
  return (
    <>
      <button className="ghost bell-b" onClick={show} aria-label="Envoyer une suggestion" title="Une suggestion ?">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></svg>
      </button>
      {open && (
        <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && setOpen(false)}>
          <form className="modal card" role="dialog" aria-modal="true" aria-label="Envoyer une suggestion" onSubmit={send}>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 0 }}><h2 style={{ margin: 0 }}>Une suggestion ?</h2><button type="button" className="ghost" onClick={() => setOpen(false)} aria-label="Fermer">✕</button></div>
            {st === 'ok' ? (
              <>
                <p className="okmsg" role="status">Merci ! Ta suggestion a bien été envoyée à l’équipe.</p>
                <div className="row"><button type="button" className="primary" onClick={() => setOpen(false)}>Fermer</button><button type="button" className="ghost" onClick={() => setSt('idle')}>Envoyer une autre</button></div>
              </>
            ) : (
              <>
                <p className="muted small">Dis-nous ce qu’on peut améliorer : des questions à ajouter, une fonctionnalité, un problème…</p>
                <label className="fld">Sujet
                  <select value={cat} onChange={e => setCat(e.target.value)} style={{ font: 'inherit', minHeight: 44, padding: '8px 10px' }}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                </label>
                <label className="fld">Ta suggestion
                  <textarea ref={area} rows={5} maxLength={1000} required minLength={5} value={txt} onChange={e => setTxt(e.target.value)} placeholder="Écris ici…" />
                </label>
                <p className="muted small" style={{ margin: 0, textAlign: 'right' }}>{txt.length}/1000</p>
                {st === 'err' && <p className="err" role="alert">Envoi impossible, réessaie dans un instant.</p>}
                {st === 'many' && <p className="err" role="alert">Trop de suggestions aujourd’hui, reviens demain.</p>}
                <div className="row"><button className="primary" disabled={st === 'busy' || txt.trim().length < 5}>{st === 'busy' ? '…' : 'Envoyer'}</button><button type="button" className="ghost" onClick={() => setOpen(false)}>Annuler</button></div>
              </>
            )}
          </form>
        </div>
      )}
    </>
  )
}
