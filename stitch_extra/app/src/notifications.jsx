import React from 'react'
import './phase5.css'

/* Tiroir de notifications — aucune notification n'est inventée : la liste vient de `items`,
   et l'état vide est explicite. Chaque élément porte son type, sa date et sa cible. */

export function NotificationsDrawer({ items, onClose, go }) {
  const list = Array.isArray(items) ? items : []
  return (
    <div className="nt-back" role="dialog" aria-modal="true" aria-label="Notifications">
      <aside className="nt">
        <div className="nt-h">
          <b>Notifications</b>
          <button type="button" className="ghost" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        {!list.length ? (
          <div className="nt-empty">
            <b>Aucun message</b>
            <p className="muted small">Les réponses à tes questions et les arbitrages de modération apparaîtront ici.</p>
          </div>
        ) : (
          <ul className="nt-l">
            {list.map((n, i) => (
              <li key={n.id || i} className={n.read ? '' : 'unread'}>
                <span className="t">{n.type || 'info'}</span>
                <b>{n.title}</b>
                {n.text && <p className="muted small">{n.text}</p>}
                {n.at && <span className="d">{new Date(n.at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>}
                {n.target && <button type="button" className="link" onClick={() => go && go(n.target)}>Ouvrir →</button>}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  )
}
