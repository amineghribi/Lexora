import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './session.js'
import { useAuth } from './auth.jsx'
import { protect } from './protect.js'

// Le module (≈ 2,7 Mo) est gardé en mémoire pour la session : le second affichage est immédiat, et le survol de l'onglet ARC le précharge.
// Jamais en cache pour un aperçu enseignant (ses cas changent) ni pour un patient précis.
const memo = new Map()
const fetchArc = (uid, url, fresh) => {
  const key = uid + '|' + url
  if (!fresh && memo.has(key)) return memo.get(key)
  const p = supabase.auth.getSession().then(({ data }) => {
    const tok = data && data.session && data.session.access_token
    if (!tok) throw new Error('x')
    return fetch(url, { headers: { Authorization: `Bearer ${tok}` } })
  }).then(r => { if (r.status === 403) { const e = new Error('paid'); e.paid = true; throw e } if (!r.ok) throw new Error('http ' + r.status); return r.text() })
  if (url === '/api/arc') { memo.set(key, p); p.catch(() => memo.delete(key)) }
  return p
}
// Images du simulateur (≈ 1,4 Mo) : servies à part et transmises à l'iframe quand elles sont prêtes.
const imgMemo = new Map()
const fetchImages = uid => {
  if (imgMemo.has(uid)) return imgMemo.get(uid)
  const p = supabase.auth.getSession().then(({ data }) => {
    const tok = data && data.session && data.session.access_token
    if (!tok) throw new Error('x')
    return fetch('/api/arc?img=1', { headers: { Authorization: `Bearer ${tok}` } })
  }).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json() })
  imgMemo.set(uid, p); p.catch(() => imgMemo.delete(uid))
  return p
}
// Images de la banque (stockage R2) utilisées par les cas des enseignants : la page demande un lien court par image, la télécharge
// et la transmet à l'iframe (qui n'a ni jeton ni accès réseau). Un échec sur une image n'empêche pas les autres.
const bankMemo = new Map()
const dataUrl = key => {
  if (bankMemo.has(key)) return bankMemo.get(key)
  const p = supabase.auth.getSession().then(({ data }) => {
    const tok = data && data.session && data.session.access_token
    if (!tok) throw new Error('x')
    return fetch('/api/arc-media?key=' + encodeURIComponent(key), { headers: { Authorization: `Bearer ${tok}` } })
  }).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json() })
    .then(j => fetch(j.url)).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer() })
    .then(buf => new Promise((ok, ko) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = ko; f.readAsDataURL(new Blob([buf], { type: 'image/webp' })) }))
  bankMemo.set(key, p); p.catch(() => bankMemo.delete(key))
  return p
}
const sendBankImages = getWin => supabase.auth.getSession().then(({ data }) => {
  const tok = data && data.session && data.session.access_token
  if (!tok) return null
  return fetch('/api/arc?img=r2', { headers: { Authorization: `Bearer ${tok}` } }).then(r => (r.ok ? r.json() : {}))
}).then(used => Promise.all(Object.entries(used || {}).map(([id, key]) => dataUrl(key).then(d => { const w = getWin(); if (w) w.postMessage({ arc: 'img', img: { [id]: d } }, '*') }).catch(() => {}))))
export const prefetchArc = uid => { if (uid) { fetchArc(uid, '/api/arc', false).catch(() => {}); fetchImages(uid).catch(() => {}) } }

// ARC : apprentissage par raisonnement clinique. Réservé aux comptes abonnés :
// le module est servi par /api/arc (contrôle de l'abonnement côté serveur), jamais comme fichier public.
export function ArcView({ go, preview, start }) {
  const { user } = useAuth()
  const [st, setSt] = useState('busy')
  const [html, setHtml] = useState('')
  const [tick, setTick] = useState(0)
  const [ready, setReady] = useState(false)
  const frame = useRef(null)
  // Le module tourne dans un iframe sandbox (origine opaque) : il ne peut pas lire la session.
  // Il envoie son bilan par postMessage ; on ne l'accepte que de cet iframe, avec des valeurs bornées.
  useEffect(() => {
    if (!user) return undefined
    const onMsg = ev => {
      const f = frame.current, d = ev.data
      if (!f || ev.source !== f.contentWindow || !d || d.arc !== 'attempt') return
      const pct = Math.round(Number(d.pct))
      if (!(pct >= 0 && pct <= 100) || typeof d.motif !== 'string' || typeof d.caseId !== 'string') return
      const detail = {}
      Object.keys(d.detail || {}).slice(0, 20).forEach(k => { const v = Number(d.detail[k]); if (Number.isFinite(v)) detail[String(k).slice(0, 12)] = v })
      if (preview) return // aperçu enseignant : aucune tentative enregistrée
      supabase.from('arc_attempts').insert({ motif: d.motif.slice(0, 64), case_id: d.caseId.slice(0, 64), pct, dx_ok: !!d.dxOk, detail }).then(() => {}, () => {})
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [user && user.id, preview])
  useEffect(() => {
    if (!user) return undefined
    let off = false
    setSt('busy'); setHtml(''); setReady(false)
    fetchArc(user.id, start ? `/api/arc?m=${encodeURIComponent(start.m)}&c=${encodeURIComponent(start.c)}${start.p ? '&p=1' : ''}` : '/api/arc', preview || tick > 0)
      .then(t => { if (!off) { setHtml(protect(t)); setSt('ok'); fetchImages(user.id).catch(() => {}) } })
      .catch(e => { if (!off) setSt(e && e.paid ? 'paid' : 'err') })
    return () => { off = true }
  }, [user && user.id, tick, start && start.m, start && start.c, start && start.p])
  if (!user) return <div className="card"><h2 style={{ marginTop: 0 }}>ARC : raisonnement clinique</h2><p className="muted">Connecte-toi pour accéder à l’ARC.</p></div>
  if (st === 'busy') return <div className="card"><p className="muted" role="status">Chargement…</p></div>
  if (st === 'paid') return (
    <div className="card"><b>Réservé aux comptes abonnés.</b>
      <p className="muted">L’ARC (apprentissage par raisonnement clinique) fait partie de l’abonnement.</p>
      <div className="row">
        {go && <button className="primary" onClick={() => go({ name: 'account' })}>Voir mon abonnement</button>}
        <button type="button" onClick={() => setTick(x => x + 1)}>J’ai déjà payé : actualiser</button>
      </div>
    </div>
  )
  if (st === 'err') return <div className="card"><p className="muted" role="alert">Chargement impossible pour le moment, réessaie dans un instant.</p></div>
  return (
    <div className="arc-frame">
      <iframe ref={frame} title="ARC : raisonnement clinique" sandbox="allow-scripts" srcDoc={html} onLoad={() => { setReady(true); fetchImages(user.id).then(map => { const w = frame.current && frame.current.contentWindow; if (w) w.postMessage({ arc: 'img', img: map }, '*') }).catch(() => {}); sendBankImages(() => frame.current && frame.current.contentWindow).catch(() => {}) }} style={{ visibility: ready ? 'visible' : 'hidden' }} />
      {!ready && <div className="arc-loading" role="status"><span className="spin" aria-hidden="true" />Préparation du simulateur…</div>}
    </div>
  )
}
