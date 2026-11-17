import React from 'react'
import { openPdf } from './pdf.js'
import './qcmfeedback.css'

/* ===== Correction détaillée + références (maquette « correction détaillée ») =====
   Panneau affiché sous les options après validation : verdict, clé de réponse, explication et
   lien vers la page du cours quand la question en porte une. La clé vient du serveur
   (`checkAnswers`), jamais d'un calcul local. */

export function QcmFeedback({ q, ok, sel }) {
  if (!q) return null
  const key = q.c ? String(q.c).split('').sort().join(', ') : null
  const chosen = (sel || []).slice().sort().join(', ')
  const explanation = q.x || q.explain || q.exp || null
  const page = Array.isArray(q.cp) && q.cp[1] ? q.cp[1] : null
  const courseNo = Array.isArray(q.cp) && q.cp[0] ? q.cp[0] : null

  return (
    <div className={`qfb ${ok ? 'ok' : 'ko'}`} role="status">
      <div className="qfb-head">
        <b>{ok ? 'Bonne réponse' : 'Réponse incorrecte'}</b>
        <span className="qfb-keys">
          {chosen && <>Ta réponse : <b>{chosen}</b></>}
          {key && <> · Clé : <b>{key}</b></>}
        </span>
      </div>

      {explanation && <p className="qfb-text">{explanation}</p>}

      {(page || courseNo) && (
        <div className="qfb-refs">
          <span className="qfb-label">Référence</span>
          <a className="link" href="#" onClick={e => (page ? openPdf(e, courseNo, page) : e.preventDefault())}>
            Cours{courseNo ? ` ${courseNo}` : ''}{page ? `, page ${page}` : ''} ↗
          </a>
        </div>
      )}
    </div>
  )
}
