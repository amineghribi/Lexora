import React, { useEffect, useMemo, useState } from 'react'
import './billing.css'

/* ===== 4.3 Parrainage =====
   Structure et libellés du programme : maquette Stitch « parrainage » (3 étapes, plafond de
   3 filleuls validés, 1 récompense par compte). Les COMPTEURS sont réels : ils viennent des
   invitations enregistrées sur l'appareil, jamais d'un chiffre d'exemple. La campagne
   commerciale ne s'affiche que si elle est fournie par les données (`campaign`). */

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function referralCode(seed) {
  let h = 2166136261
  const s = String(seed || 'candidat')
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  let out = ''
  for (let i = 0; i < 6; i++) { out += ALPHA[(h >>> (i * 5)) & 31]; h = Math.imul(h, 16777619) }
  return out
}

const KEY = 'ref_invites'
const CAP = 3
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }
const mask = e => {
  const [u, d] = String(e || '').split('@')
  if (!u) return '—'
  return `@${u.slice(0, 1)}${u.length > 2 ? '…' : ''}${u.slice(-1)}${d ? ` · ${d}` : ''}`
}
const dt = t => new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })

const STEPS = [
  'Ton filleul s’inscrit avec ton code.',
  'Il répond à ses 5 premières questions.',
  'Tu reçois un mois d’accès offert.',
]

export function ParrainagePage({ profile, go, init }) {
  const code = useMemo(() => referralCode((profile && (profile.username || profile.id)) || 'candidat'), [profile])
  const [invites, setInvites] = useState(load)
  const [email, setEmail] = useState('')
  const [copied, setCopied] = useState(false)
  const campaign = (init && init.campaign) || null

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(invites)) } catch {} }, [invites])

  const link = useMemo(() => { try { return `${location.origin}/?ref=${code}` } catch { return `?ref=${code}` } }, [code])
  const validated = invites.filter(i => i.status === 'validé').length
  const pending = invites.length - validated
  const pct = Math.min(100, Math.round((validated / CAP) * 100))

  const add = e => {
    e.preventDefault()
    const v = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) || invites.some(i => i.email === v)) { setEmail(''); return }
    setInvites(l => [{ email: v, at: Date.now(), status: 'en attente' }, ...l])
    setEmail('')
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch {}
  }

  return (
    <div className="bil">
      <header className="bil-head">
        <div>
          <span className="bil-eyebrow">Programme confraternel · Résidanat Tunisie</span>
          <h1>Parrainage</h1>
          <p className="muted small">Invite un confrère, gagne un mois d’accès.</p>
        </div>
        <button type="button" className="soft" onClick={() => go({ name: 'profile' })}>Profil</button>
      </header>

      <section className="bil-card">
        <div className="bil-card-h">
          <b className="bil-lbl">Votre code de parrainage</b>
          <span className="bil-pill">Actif</span>
        </div>
        <div className="bil-codebox">
          <b>{code}</b>
          <button type="button" className="bil-mini" onClick={copy}>{copied ? 'Copié' : 'Copier'}</button>
        </div>
        <button type="button" className="primary bil-wide" onClick={copy}>{copied ? 'Lien copié' : 'Partager le lien'}</button>
        <code className="bil-link">{link}</code>
      </section>

      <section className="bil-card">
        <div className="bil-card-h">
          <b>Filleuls validés {validated} / {CAP}</b>
          <span className="bil-pct">{pct} %</span>
        </div>
        <p className="muted small">{pending} inscription{pending > 1 ? 's' : ''} en attente</p>
        <div className="bil-prog" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Filleuls validés"><span style={{ width: `${pct}%` }} /></div>
      </section>

      <section className="bil-card">
        <div className="bil-card-h"><b>Comment ça marche</b></div>
        <ol className="bil-steps">
          {STEPS.map((s, i) => <li key={i}><span className="n">{i + 1}</span><span>{s}</span></li>)}
        </ol>
        <p className="bil-foot">1 récompense maximum par compte · {CAP} filleuls validés suffisent.</p>
      </section>

      <section className="bil-card">
        <div className="bil-card-h">
          <b>Vos filleuls</b>
          <span className="muted small">Total {invites.length}</span>
        </div>
        <form className="bil-form" onSubmit={add}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="adresse e-mail du confrère" aria-label="Adresse e-mail" />
          <button type="submit" className="soft" disabled={!email.trim()}>Ajouter</button>
        </form>
        {!invites.length
          ? <p className="muted small">Aucune invitation enregistrée pour l’instant.</p>
          : (
            <ul className="bil-list">
              {invites.map(i => (
                <li key={i.email}>
                  <span className="av" aria-hidden="true">{i.email.slice(0, 1).toUpperCase()}</span>
                  <span className="m">{mask(i.email)}</span>
                  <span className={`s ${i.status === 'validé' ? 'ok' : ''}`}>{i.status}</span>
                  <span className="d">{dt(i.at)}</span>
                  <button type="button" className="link" onClick={() => setInvites(l => l.filter(x => x.email !== i.email))}>Retirer</button>
                </li>
              ))}
            </ul>
          )}
      </section>

      {campaign && (campaign.title || campaign.text) && (
        <aside className="bil-banner">
          <span className="bil-gift" aria-hidden="true">🎁</span>
          <div>
            <b>{campaign.title || 'Campagne spéciale'}</b>
            {campaign.text && <p>{campaign.text}</p>}
          </div>
        </aside>
      )}
    </div>
  )
}
