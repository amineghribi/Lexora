import React, { useState } from 'react'
import './phase5.css'

/* Modale « Poser une question sur un QCM ».
   Publie via le store du forum (forumStore.js) ; si la publication échoue, le message d'erreur
   est affiché tel quel. Aucune publication n'est simulée. */

export function AskModal({ questionId, onClose, onPublish }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const ok = text.trim().length >= 20

  const send = async () => {
    if (!ok || busy) return
    setBusy(true); setErr(null)
    try {
      await onPublish({ questionId, body: text.trim() })
      onClose()
    } catch (e) { setErr('La publication a échoué. Réessaie dans un instant.') } finally { setBusy(false) }
  }

  return (
    <div className="mo-back" role="dialog" aria-modal="true" aria-label="Poser une question sur un QCM">
      <div className="mo">
        <div className="mo-h">
          <b>Poser une question sur un QCM</b>
          <button type="button" className="ghost" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <p className="muted small">
          {questionId ? `Question rattachée : ${questionId}` : 'Aucune question rattachée à ce fil.'} Ton message est visible par les autres candidats et les modérateurs.
        </p>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={6} placeholder="Décris précisément ce qui te pose problème (énoncé, proposition, référence)…" aria-label="Message" />
        <div className="mo-f">
          <span className={ok ? 'muted small' : 'mo-hint'}>{text.trim().length} / 20 caractères minimum</span>
          <div className="mo-a">
            <button type="button" className="soft" onClick={onClose}>Annuler</button>
            <button type="button" className="primary" disabled={!ok || busy} onClick={send}>{busy ? 'Publication…' : 'Publier'}</button>
          </div>
        </div>
        {err && <p className="mo-err">{err}</p>}
      </div>
    </div>
  )
}
