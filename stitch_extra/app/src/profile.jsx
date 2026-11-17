import React, { useMemo } from 'react'
import './account.css'

/* ===== 4.1 Profil candidat =====
   Tout est calculé depuis la session réelle : identité, périmètre (parcours/faculté),
   abonnement, et statistiques dérivées des tentatives enregistrées. Aucun rang, aucune
   série de jours ni aucun objectif n'est affiché s'il n'est pas mesurable. */

const pct = (a, b) => (b ? Math.round((a / b) * 100) : null)

export function ProfilePage({ state, profile, scope, access, objective, go }) {
  const attempts = (state && state.attempts) || []
  const stats = useMemo(() => {
    const byQ = new Map()
    for (const a of attempts) {
      const e = byQ.get(a.q) || { ok: false }
      if (a.ok) e.ok = true
      byQ.set(a.q, e)
    }
    const seen = byQ.size
    const ok = [...byQ.values()].filter(v => v.ok).length
    return { answered: attempts.length, seen, ok, rate: pct(ok, seen) }
  }, [attempts])

  const initials = String((profile && profile.username) || '?').slice(0, 2).toUpperCase()
  const trackLabel = scope && scope.track === 'dcem3' ? 'DCEM3' : scope && scope.track === 'residanat' ? 'Résidanat' : '—'

  return (
    <div className="acc">
      <div className="acc-top">
        <button type="button" className="ghost" onClick={() => go({ name: 'home' })}>← Accueil</button>
        <span className="acc-crumb">Mon compte</span>
      </div>

      <header className="acc-head">
        <div className="acc-id">
          <span className="acc-av">{initials}</span>
          <div>
            <span className="acc-eyebrow">Profil candidat</span>
            <h1>{(profile && (profile.full_name || profile.username)) || 'Candidat'}</h1>
            <p className="muted small">
              {trackLabel}{scope && scope.faculty ? ` · FMT ${scope.faculty.charAt(0).toUpperCase()}${scope.faculty.slice(1)}` : ''}
            </p>
          </div>
        </div>
        <div className="acc-badge">
          <span className={access && access.status === 'paid' ? 'on' : ''}>
            {access && access.status === 'paid' ? 'Abonnement actif' : access && access.status ? `Statut : ${access.status}` : 'Statut inconnu'}
          </span>
          <button type="button" className="soft" onClick={() => go({ name: 'settings' })}>Réglages</button>
        </div>
      </header>

      <ul className="acc-stats">
        <li><b>{stats.seen.toLocaleString('fr')}</b><span>questions travaillées</span></li>
        <li><b>{stats.answered.toLocaleString('fr')}</b><span>réponses enregistrées</span></li>
        <li><b>{stats.rate == null ? '—' : `${stats.rate} %`}</b><span>taux de réussite</span></li>
        <li><b>{objective && objective.exam_date ? new Date(objective.exam_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</b><span>date du concours</span></li>
      </ul>

      <section className="acc-card">
        <div className="acc-card-h"><b>Mon parcours</b></div>
        <ul className="acc-rows">
          <li><span>Accès</span><em>{access && access.status === 'paid' ? 'Complet' : (access && access.status) || '—'}</em></li>
          <li><span>Interface</span><em>{trackLabel}</em></li>
          <li><span>Faculté</span><em>{scope && scope.faculty ? `FMT ${scope.faculty}` : '—'}</em></li>
        </ul>
        <div className="acc-acts">
          <button type="button" className="primary" onClick={() => go({ name: 'progression' })}>Voir ma progression</button>
          <button type="button" className="soft" onClick={() => go({ name: 'history' })}>Mon historique</button>
        </div>
      </section>
    </div>
  )
}
