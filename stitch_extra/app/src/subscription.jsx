import React, { useEffect, useMemo, useState } from 'react'
import './billing.css'

/* ===== 4.4 Abonnement =====
   Lit uniquement ce que la plateforme expose (statut d'accès, offre, échéance, quotas) et
   conserve localement la dernière vérification observée. Aucun prix ni aucune remise n'est
   affiché s'ils ne viennent pas des données : la page ne vend rien, elle explique l'accès. */

const KEY = 'sub_last_seen'
const dateFR = v => {
  const d = v ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : null
}

const FEATURES = [
  ['Banque de QCM par cours', 'Entraînement immédiat, séries par spécialité et correction détaillée.'],
  ['ARC — raisonnement clinique', 'Cas progressifs en huit étapes, du motif au débriefing.'],
  ['Examens blancs calibrés', 'Épreuve chronométrée avec consignes réglementaires et résultats.'],
  ['Cours, fiches et vidéos', 'Supports des cours du programme, avec pré-requis et flashcards.'],
  ['Progression et historique', 'Courbes de score, points faibles et reprise du travail.'],
]

export function SubscriptionPage({ access, go }) {
  const status = (access && access.status) || null
  const plan = (access && (access.plan || access.offer)) || null
  const until = dateFR(access && (access.until || access.expires_at))
  const since = dateFR(access && (access.since || access.started_at))
  const [seen, setSeen] = useState(null)

  useEffect(() => {
    if (!status) return
    const rec = { status, at: Date.now() }
    try { localStorage.setItem(KEY, JSON.stringify(rec)) } catch {}
    setSeen(rec)
  }, [status])

  const lastCheck = useMemo(() => {
    let rec = seen
    if (!rec) { try { rec = JSON.parse(localStorage.getItem(KEY) || 'null') } catch { rec = null } }
    if (!rec || !rec.at) return null
    return new Date(rec.at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }, [seen])

  const active = status === 'paid'

  return (
    <div className="bil">
      <div className="bil-top">
        <button type="button" className="ghost" onClick={() => go({ name: 'profile' })}>← Profil</button>
        <span className="bil-crumb">Abonnement</span>
      </div>

      <header className="bil-head">
        <div>
          <span className="bil-eyebrow">Accès à la plateforme</span>
          <h1>Abonnement</h1>
          <p className="muted small">État de ton accès tel qu’il est enregistré sur la plateforme.</p>
        </div>
      </header>

      <section className={`bil-state${active ? ' on' : ''}`}>
        <div>
          <span className="bil-state-l">{active ? 'Accès actif' : status ? `Statut : ${status}` : 'Statut indisponible'}</span>
          <b>{plan || (active ? 'Accès complet' : '—')}</b>
        </div>
        <ul className="bil-kv">
          <li><span>Depuis</span><em>{since || '—'}</em></li>
          <li><span>Échéance</span><em>{until || '—'}</em></li>
          <li><span>Dernière vérification</span><em>{lastCheck || '—'}</em></li>
        </ul>
      </section>

      <section className="bil-card">
        <div className="bil-card-h"><b>Ce que l’accès comprend</b></div>
        <ul className="bil-feat">
          {FEATURES.map(([t, d]) => (
            <li key={t}><b>{t}</b><span className="muted small">{d}</span></li>
          ))}
        </ul>
      </section>

      <section className="bil-card">
        <div className="bil-card-h"><b>Gestion</b></div>
        <p className="muted small">
          {active
            ? 'Ton accès est actif. Le renouvellement et la facturation se font auprès de l’administration de la faculté ; aucun paiement n’est effectué depuis cette page.'
            : 'Aucun accès actif n’est enregistré. Contacte l’administration pour ouvrir un accès ; aucun paiement n’est effectué depuis cette page.'}
        </p>
        <div className="bil-acts">
          {access && access.manage_url && (
            <button type="button" className="primary" onClick={() => window.open(access.manage_url, '_blank', 'noreferrer')}>Gérer mon accès</button>
          )}
          <button type="button" className="soft" onClick={() => go({ name: 'profile' })}>Retour au profil</button>
        </div>
      </section>
    </div>
  )
}
