import React, { useState } from 'react'
import './phase5.css'

/* Modale « Signaler cette question ».
   Le motif est obligatoire : un signalement sans motif n'est pas exploitable par la modération. */

const MOTIFS = ['Énoncé ambigu', 'Erreur de correction', 'Réponse donnée erronée', 'Hors programme', 'Doublon', 'Autre']

export function ReportModal({ questionId, onSubmit, onClose }) {
  const [motif, setMotif] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (!motif || busy) return
    setBusy(true); setErr(null)
    try { await onSubmit({ questionId, motif, note: note.trim() }); onClose() }
    catch (e) { setErr('Le signalement n’a pas pu être enregistré.') }
    finally { setBusy(false) }
  }

  return (
    <div className="mo-back" role="dialog" aria-modal="true" aria-label="Signaler cette question">
      <div className="mo">
        <div className="mo-h">
          <b>Signaler cette question</b>
          <button type="button" className="ghost" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <p className="muted small">{questionId ? `Question ${questionId}` : 'Question non identifiée'} · le signalement est transmis aux modérateurs.</p>
        <div className="mo-chips" role="group" aria-label="Motif">
          {MOTIFS.map(m => (
            <button key={m} type="button" className={motif === m ? 'on' : ''} onClick={() => setMotif(m)}>{m}</button>
          ))}
        </div>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={4} placeholder="Précise si nécessaire (facultatif)…" aria-label="Précision" />
        <div className="mo-f">
          <span className={motif ? 'muted small' : 'mo-hint'}>{motif ? `Motif : ${motif}` : 'Choisis un motif'}</span>
          <div className="mo-a">
            <button type="button" className="soft" onClick={onClose}>Annuler</button>
            <button type="button" className="primary" disabled={!motif || busy} onClick={send}>{busy ? 'Envoi…' : 'Signaler'}</button>
          </div>
        </div>
        {err && <p className="mo-err">{err}</p>}
      </div>
    </div>
  )
}
