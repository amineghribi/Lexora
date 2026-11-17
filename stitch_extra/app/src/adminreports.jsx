import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './session.js'
import './adminreports.css'

/* Console de modération — signalements docimologiques.
   Le signalement existe côté candidat (modale « Signaler cette question ») mais personne ne
   pouvait les consulter : c'est le manque fonctionnel que cet écran comble.
   Lecture seule : aucune écriture en base, le triage nécessite une migration non appliquée. */

const TYPES = [['all', 'Tous'], ['question', 'Questions'], ['comment', 'Commentaires'], ['post', 'Fils']]

export function AdminReports({ go }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  const [type, setType] = useState('all')
  const [busy, setBusy] = useState(false)

  const load = () => {
    setBusy(true); setErr(null)
    supabase.from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) { setErr(error.message); setRows([]) } else setRows(data || [])
        setBusy(false)
      })
  }
  useEffect(load, [])

  const list = useMemo(() => (rows || []).filter(r => type === 'all' || r.target_type === type), [rows, type])
  const counts = useMemo(() => {
    const m = new Map()
    for (const r of rows || []) m.set(r.target_type || 'autre', (m.get(r.target_type || 'autre') || 0) + 1)
    return m
  }, [rows])

  return (
    <div className="ar">
      <header className="ar-head">
        <div>
          <span className="ar-eyebrow">Modération pédagogique</span>
          <h1>Signalements docimologiques</h1>
          <p className="muted small">
            {rows === null ? 'Chargement…' : `${rows.length} signalement${rows.length > 1 ? 's' : ''} reçu${rows.length > 1 ? 's' : ''} · lecture seule`}
          </p>
        </div>
        <div className="ar-actions">
          <button type="button" className="soft" onClick={load} disabled={busy}>{busy ? 'Actualisation…' : 'Actualiser'}</button>
          <button type="button" className="ghost" onClick={() => go({ name: 'home' })}>← Accueil</button>
        </div>
      </header>

      <nav className="ar-tabs" aria-label="Type de signalement">
        {TYPES.map(([k, l]) => (
          <button key={k} type="button" className={type === k ? 'on' : ''} onClick={() => setType(k)}>
            {l}{k !== 'all' && counts.get(k) ? ` ${counts.get(k)}` : ''}
          </button>
        ))}
      </nav>

      {err && (
        <div className="ar-err">
          <b>Lecture impossible</b>
          <p className="muted small">
            La table des signalements n’est pas accessible à ce compte ({err}). Les signalements
            envoyés par les candidats restent enregistrés ; leur traitement demande un accès modérateur.
          </p>
        </div>
      )}

      {!err && rows !== null && !list.length && (
        <div className="ar-empty">
          <b>Aucun signalement</b>
          <p className="muted small">Rien à traiter pour ce filtre.</p>
        </div>
      )}

      {!!list.length && (
        <ul className="ar-list">
          {list.map(r => (
            <li key={r.id}>
              <div className="ar-row">
                <span className="ar-type">{r.target_type || 'autre'}</span>
                <b>{r.reason || 'motif non précisé'}</b>
                <span className="ar-date">{r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</span>
              </div>
              <div className="ar-meta">
                <span>cible : {r.target_id || '—'}</span>
                {r.status && <span>statut : {r.status}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="ar-note">
        Le triage (marquer traité, répondre au candidat) n’est pas disponible : il nécessite la
        migration de modération, livrée mais non appliquée.
      </p>
    </div>
  )
}
