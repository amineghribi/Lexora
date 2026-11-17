// Abonnement : tarifs, instructions de paiement Flouci, page d'accès terminé, bandeau d'essai.
// L'accès est contrôlé côté serveur (essai de 7 jours, puis activation manuelle après vérification du paiement).
import React, { useState } from 'react'
import { ReferralCard } from './referral.jsx'

export const FLOUCI_NUMBER = '27953855'
export const PRICE_MONTH = 29
export const PRICE_SEMESTER = 140
export const PRICE_DCEM3 = 50
export const PRICE_SEMESTER_AFTER_DCEM3 = PRICE_SEMESTER - PRICE_DCEM3

const fmtDate = (iso, minusSecond) => {
  const t = Date.parse(iso)
  if (!t) return ''
  return new Date(minusSecond ? t - 1000 : t).toLocaleDateString('fr-FR', { timeZone: 'Africa/Tunis', day: 'numeric', month: 'long', year: 'numeric' })
}
export const daysLeft = (endIso, nowIso) => Math.max(0, Math.ceil((Date.parse(endIso) - (Date.parse(nowIso) || Date.now())) / 86400000))

function Copy({ text, label }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800) } catch (e) { /* copie non disponible */ }
  }
  return <button type="button" className="ghost pay-copy" onClick={copy} aria-label={label}>{done ? '✓ Copié' : 'Copier'}</button>
}

export function Prices({ track }) {
  if (track === 'dcem3') {
    return (
      <div className="pay-prices">
        <div className="pay-plan"><b>{PRICE_DCEM3} DT</b><span>jusqu’au 30 juin</span><small>Accès complet DCEM3 : synthèse clinique</small></div>
        <div className="pay-plan"><b>{PRICE_SEMESTER_AFTER_DCEM3} DT</b><span>Résidanat ensuite</span><small>Tes {PRICE_DCEM3} DT sont déduits du semestre Résidanat ({PRICE_SEMESTER} DT) si tu continues avec nous.</small></div>
      </div>
    )
  }
  return (
    <div className="pay-prices">
      <div className="pay-plan"><b>{PRICE_MONTH} DT</b><span>par mois</span></div>
      <div className="pay-plan"><b>{PRICE_SEMESTER} DT</b><span>par semestre</span><small>S1 : 1er janvier → 30 juin<br />S2 : 1er juillet → 31 décembre</small></div>
    </div>
  )
}

export function PayInstructions({ email, track }) {
  return (
    <div className="pay">
      <Prices track={track} />
      <ol className="pay-steps">
        <li>
          Envoie le montant par <b>Flouci</b> au numéro :
          <div className="pay-num"><strong>{FLOUCI_NUMBER}</strong><Copy text={FLOUCI_NUMBER} label="Copier le numéro Flouci" /></div>
        </li>
        <li>
          Dans le <b>message joint au paiement</b>, écris ton e-mail :
          <div className="pay-num"><strong className="pay-mail">{email || 'ton e-mail'}</strong>{email && <Copy text={email} label="Copier mon e-mail" />}</div>
        </li>
        <li>Ton accès est activé après vérification de ton paiement, <b>dans moins de 24 h</b>.</li>
      </ol>
    </div>
  )
}

// Page affichée à la place de l'application quand l'essai est terminé et qu'aucun abonnement n'est actif
export function PaywallGate({ email, track, onRefresh, onSignOut }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const check = async () => {
    setBusy(true); setMsg('')
    const st = await onRefresh()
    setBusy(false)
    if (st && st.status === 'expired') setMsg('Ton paiement n’est pas encore activé. La vérification prend moins de 24 h.')
  }
  return (
    <main className="wrap narrow">
      <section className="card">
        <h1>Ton essai gratuit est terminé</h1>
        <p>Abonne-toi pour continuer à accéder à toutes les questions. Ta progression est conservée.</p>
        <PayInstructions email={email} track={track} />
        <div className="row">
          <button className="primary" onClick={check} disabled={busy}>{busy ? 'Vérification…' : 'J’ai payé : vérifier mon accès'}</button>
          <button className="ghost" onClick={onSignOut}>Se déconnecter</button>
        </div>
        {msg && <p className="muted small" role="status">{msg}</p>}
      </section>
      <ReferralCard />
    </main>
  )
}

// Bandeau en haut de l'accueil : jours d'essai restants, ou abonnement proche de la fin
export function AccessBanner({ access, onOpen }) {
  if (!access) return null
  if (access.status === 'trial') {
    const n = daysLeft(access.trial_ends_at, access.now)
    return (
      <div className="trial banner" role="note">
        <b>Essai gratuit : il te reste {n} jour{n > 1 ? 's' : ''}</b>
        <span>Jusqu’au {fmtDate(access.trial_ends_at)}. <button type="button" className="link" onClick={onOpen}>Voir les tarifs et s’abonner</button> · <button type="button" className="link" onClick={onOpen}>Invite 3 amis = 1 mois offert</button></span>
      </div>
    )
  }
  if (access.status === 'paid' && access.paid_until) {
    const n = daysLeft(access.paid_until, access.now)
    if (n > 5) return null
    return (
      <div className="trial banner" role="note">
        <b>Ton abonnement se termine dans {n} jour{n > 1 ? 's' : ''}</b>
        <span>Jusqu’au {fmtDate(access.paid_until, true)}. <button type="button" className="link" onClick={onOpen}>Renouveler</button></span>
      </div>
    )
  }
  return null
}

// Carte « Abonnement » de la page Mon compte
export function SubscriptionCard({ access, email }) {
  let status = 'Chargement…'
  if (access) {
    if (access.status === 'paid') status = `Abonnement actif jusqu’au ${fmtDate(access.paid_until, true)}.`
    else if (access.status === 'trial') { const n = daysLeft(access.trial_ends_at, access.now); status = `Essai gratuit : il te reste ${n} jour${n > 1 ? 's' : ''} (jusqu’au ${fmtDate(access.trial_ends_at)}).` }
    else status = 'Ton essai gratuit est terminé.'
  }
  return (
    <div className="card">
      <h3>Abonnement</h3>
      <p>{status}</p>
      <PayInstructions email={email} track={access && access.track} />
    </div>
  )
}
