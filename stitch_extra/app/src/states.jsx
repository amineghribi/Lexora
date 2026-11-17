import React from 'react'
import './phase5.css'

/* États d'interface : chargement, erreur réseau, hors ligne, page introuvable, liste vide.
   Un seul composant, cinq états, utilisé partout où une donnée peut manquer. */

const COPY = {
  loading: ['Chargement…', 'Les données arrivent.'],
  offline: ['Hors ligne', 'Reconnecte-toi pour reprendre ; tes réponses enregistrées sur cet appareil sont conservées.'],
  error: ['Erreur réseau', 'La requête n’a pas abouti. Réessaie dans un instant.'],
  notfound: ['Page introuvable', 'Cette adresse ne correspond à aucun écran.'],
  empty: ['Rien à afficher', 'Aucun élément ne correspond à ce filtre pour le moment.'],
}

export function StateBlock({ kind = 'empty', title, text, action, onAction }) {
  const [t, d] = COPY[kind] || COPY.empty
  return (
    <div className={`st st-${kind}`} role={kind === 'loading' ? 'status' : 'alert'}>
      {kind === 'loading' ? <span className="spin" aria-hidden="true" /> : <span className="ico" aria-hidden="true">{kind === 'offline' ? '⌁' : kind === 'error' ? '!' : kind === 'notfound' ? '?' : '∅'}</span>}
      <b>{title || t}</b>
      <p className="muted small">{text || d}</p>
      {action && <button type="button" className="soft" onClick={onAction}>{action}</button>}
    </div>
  )
}
