import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './session.js'
import './adminreports.css'

/* Console — boîte des suggestions.
   Les candidats envoient des suggestions via la RPC `send_suggestion` : elles atterrissaient dans
   la table `suggestions` sans qu'aucun écran ne les lise. Même gabarit que les signalements :
   liste, filtres par catégorie, états vide et erreur, lecture seule assumée. */


export function AdminSuggestions({ go }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  const [cat, setCat] = useState('all')
  const [busy, setBusy] = useState(false)

  const load = () => {
    setBusy(true); setErr(null)
    supabase.from('suggestions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) { setErr(error.message); setRows([]) } else setRows(data || [])
        setBusy(false)
      })
  }
  useEffect(load, [])

  const cats = useMemo(() => [...new Set((rows || []).map(r => r.category || 'autre'))].sort(), [rows])
  const list = useMemo(() => (rows || []).filter(r => cat === 'all' || (r.category || 'autre') === cat), [rows, cat])
  const counts = useMemo(() => {
    const m = new Map()
    for (const r of rows || []) { const k = r.category || 'autre'; m.set(k, (m.get(k) || 0) + 1) }
    return m
  }, [rows])

  return (
    <div className="ar">
      <header className="ar-head">
        <div>
          <span className="ar-eyebrow">Modération pédagogique</span>
          <h1>Boîte des suggestions</h1>
          <p className="muted small">
            {rows === null ? 'Chargement…' : `${rows.length} suggestion${rows.length > 1 ? 's' : ''} reçue${rows.length > 1 ? 's' : ''} · lecture seule`}
          </p>
        </div>
        <div className="ar-actions">
          <button type="button" className="soft" onClick={load} disabled={busy}>{busy ? 'Actualisation…' : 'Actualiser'}</button>
          <button type="button" className="ghost" onClick={() => go({ name: 'home' })}>← Accueil</button>
        </div>
      </header>

      <nav className="ar-tabs" aria-label="Catégorie de suggestion">
        <button type="button" className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>
          Toutes{counts.size ? ` ${rows.length}` : ''}
        </button>
        {cats.map(k => (
          <button key={k} type="button" className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>
            {k}{counts.get(k) ? ` ${counts.get(k)}` : ''}
          </button>
        ))}
      </nav>

      {err && (
        <div className="ar-err">
          <b>Lecture impossible</b>
          <p className="muted small">
            La table des suggestions n’est pas accessible à ce compte ({err}). Les messages envoyés
            par les candidats restent enregistrés ; leur lecture demande un accès équipe.
          </p>
        </div>
      )}

      {!err && rows !== null && !list.length && (
        <div className="ar-empty">
          <b>Aucune suggestion</b>
          <p className="muted small">Rien à lire pour cette catégorie.</p>
        </div>
      )}

      {!!list.length && (
        <ul className="ar-list">
          {list.map(r => (
            <li key={r.id}>
              <div className="ar-row">
                <span className="ar-type">{r.category || 'autre'}</span>
                <b>{r.body || 'message vide'}</b>
                <span className="ar-date">{r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</span>
              </div>
              <div className="ar-meta">
                {r.user_id && <span>auteur : {String(r.user_id).slice(0, 8)}…</span>}
                {r.status && <span>statut : {r.status}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="ar-note">
        Le traitement (répondre au candidat, classer sans suite) n’est pas disponible : il demande
        une migration de modération, livrée mais non appliquée.
      </p>
    </div>
  )
}
