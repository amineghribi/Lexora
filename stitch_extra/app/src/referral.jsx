// Parrainage : 3 amis inscrits via ton lien et actifs (5 questions répondues) = 1 mois d'accès offert.
// Le serveur décide de tout (tables referrals / referral_codes, fonctions claim_referral et my_referral) : ici, seulement l'affichage.
import React, { useCallback, useEffect, useState } from 'react'
import { supabase } from './session.js'

const REF_KEY = 'ref-code'
const REF_RE = /^[a-z0-9]{8}$/
export const readStoredRef = () => { try { const c = localStorage.getItem(REF_KEY); return c && REF_RE.test(c) ? c : '' } catch (e) { return '' } }
const storeRef = c => { try { localStorage.setItem(REF_KEY, c) } catch (e) { /* stockage indisponible */ } }
const clearRef = () => { try { localStorage.removeItem(REF_KEY) } catch (e) { /* stockage indisponible */ } }

// Lit ?ref=CODE dans l'adresse, le mémorise et nettoie l'adresse. Renvoie le code s'il est valide.
export function captureRefFromUrl() {
  try {
    const u = new URL(window.location.href)
    const raw = u.searchParams.get('ref')
    if (raw == null) return ''
    u.searchParams.delete('ref')
    window.history.replaceState({}, '', u.pathname + u.search + u.hash)
    const c = raw.trim().toLowerCase()
    if (REF_RE.test(c)) { storeRef(c); return c }
  } catch (e) { /* adresse illisible */ }
  return ''
}

// Rattache le compte (créé dans les 7 jours) à celui qui l'a invité. Une seule tentative par compte et par session.
const tried = new Set()
export async function claimReferral(user) {
  if (!user || tried.has(user.id)) return
  const code = readStoredRef()
  const young = Date.now() - Date.parse(user.created_at) < 7 * 86400000
  const flag = 'ref-claimed-' + user.id
  let done = false
  try { done = !!localStorage.getItem(flag) } catch (e) { /* ignore */ }
  if (!code && (!young || done)) return
  tried.add(user.id)
  const { data, error } = await supabase.rpc('claim_referral', { p_code: code || null })
  if (!error && data && data.status) { clearRef(); try { localStorage.setItem(flag, '1') } catch (e) { /* ignore */ } }
}

const linkOf = code => `${window.location.origin}/?ref=${code}`
const shareText = link => `Rejoins-moi sur Résidanat QCM : plus de 42 000 questions avec correction liée au cours, pour préparer le Résidanat. Crée ton compte avec mon lien : ${link}`

export function ReferralCard() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_referral')
    if (error) setErr('Impossible de charger le parrainage pour le moment.')
    else { setD(data); setErr('') }
  }, [])
  useEffect(() => { load() }, [load])
  if (err) return <div className="card"><h3>Invite 3 amis, gagne 1 mois gratuit</h3><p className="muted small" role="alert">{err}</p></div>
  if (!d) return <div className="card"><h3>Invite 3 amis, gagne 1 mois gratuit</h3><p className="muted small">Chargement…</p></div>
  const link = linkOf(d.code)
  const full = d.rewards >= d.max_rewards
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch (e) { /* copie indisponible */ } }
  const share = async () => { try { await navigator.share({ title: 'Résidanat QCM', text: shareText(link), url: link }) } catch (e) { /* partage annulé */ } }
  return (
    <div className="card ref">
      <h3>Invite {d.needed} amis, gagne 1 mois gratuit</h3>
      <p className="muted small">Envoie ton lien à tes amis. Chaque ami qui crée son compte avec ton lien et répond à <b>{d.min_answers} questions</b> compte comme « actif ». Dès que <b>{d.needed} amis</b> sont actifs, ton accès est prolongé de <b>30 jours</b>{d.max_rewards > 1 ? <> (jusqu’à {d.max_rewards} mois offerts)</> : <> (offre limitée à 1 mois par compte)</>}.</p>
      <div className="ref-prog" role="img" aria-label={`${d.progress} ami${d.progress > 1 ? 's' : ''} actif${d.progress > 1 ? 's' : ''} sur ${d.needed}`}>
        {Array.from({ length: d.needed }).map((_, i) => <span key={i} className={i < d.progress ? 'on' : ''}>{i < d.progress ? '✓' : i + 1}</span>)}
        <b>{full ? `${d.rewards} mois offert${d.rewards > 1 ? 's' : ''} gagné${d.rewards > 1 ? 's' : ''} (maximum atteint)` : `${d.progress} / ${d.needed} amis actifs`}</b>
      </div>
      {d.rewards > 0 && !full && <p className="okmsg small">Déjà gagné : {d.rewards} mois offert{d.rewards > 1 ? 's' : ''}.</p>}
      {!full && (
        <>
          <div className="ref-link">
            <input readOnly value={link} onFocus={e => e.target.select()} aria-label="Ton lien d’invitation" />
            <button type="button" className="primary" onClick={copy}>{copied ? '✓ Copié' : 'Copier le lien'}</button>
          </div>
          <div className="row">
            <a className="ref-wa" href={`https://wa.me/?text=${encodeURIComponent(shareText(link))}`} target="_blank" rel="noopener noreferrer">Envoyer sur WhatsApp</a>
            {typeof navigator !== 'undefined' && navigator.share && <button type="button" className="ghost" onClick={share}>Partager…</button>}
          </div>
        </>
      )}
      {d.friends.length > 0 && (
        <div className="ref-friends">
          <div className="muted small">Tes amis invités ({d.friends.length})</div>
          <ul>
            {d.friends.map((f, i) => (
              <li key={i}><b>{f.username}</b>{f.active ? <span className="ref-st ok">✓ Actif</span> : <span className="ref-st">En attente : doit répondre à {d.min_answers} questions</span>}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
