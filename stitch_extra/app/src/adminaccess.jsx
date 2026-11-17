import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './session.js'
import './adminreports.css'

/* Console — gestion des accès étudiants.
   Lecture réelle de la table `access` ; les ouvertures/fermetures passent par la RPC
   `admin_set_access`, livrée dans une migration NON APPLIQUÉE. Tant qu'elle ne l'est pas,
   l'écran affiche l'erreur exacte au lieu de simuler un changement d'accès. */

const TABS = [['all', 'Tous'], ['paid', 'Actifs'], ['expired', 'Échéance passée'], ['none', 'Sans accès']]
const isExpired = a => {
  const v = a.ends_at || a.until || a.expires_at
  return v ? new Date(v).getTime() < Date.now() : true
}
const stateOf = a => (a && a.ends_at ? (isExpired(a) ? 'expired' : 'paid') : 'none')
const who = a => a.username || a.full_name || (a.user_id ? `${String(a.user_id).slice(0, 8)}…` : '—')
const dateFR = v => (v ? new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

export function AdminAccess({ go }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(null)
  const [action, setAction] = useState(null)

  const load = () => {
    setBusy(true); setErr(null)
    supabase.from('access_grants')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (error) { setErr(error.message); setRows([]) } else setRows(data || [])
        setBusy(false)
      })
  }
  useEffect(load, [])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (rows || []).filter(a => {
      const st = stateOf(a)
      const okTab = tab === 'all' ? true : tab === 'paid' ? st === 'paid' : tab === 'expired' ? st === 'expired' : st === 'none'
      const okQ = !needle || who(a).toLowerCase().includes(needle)
      return okTab && okQ
    })
  }, [rows, tab, q])

  const counts = useMemo(() => {
    const m = { all: 0, paid: 0, expired: 0, none: 0 }
    for (const a of rows || []) { m.all += 1; m[stateOf(a)] += 1 }
    return m
  }, [rows])

  const run = async () => {
    if (!action) return
    setBusy(true); setErr(null)
    try {
      const { error } = await supabase.rpc('admin_set_access', {
        p_user: action.user_id,
        p_status: action.status,
        p_until: action.until || null,
        p_plan: 'month',
        p_scope: action.scope || 'residanat',
      })
      if (error) throw error
      setAction(null); setPending(null); load()
    } catch (e) {
      setErr(`Action refusée : ${String((e && e.message) || e)}`)
      setBusy(false)
    }
  }

  const ask = (row, status) => {
    const until = status === 'paid' ? new Date(Date.now() + 30 * 86400000).toISOString() : null
    setPending(row)
    setAction({ user_id: row.user_id || row.id, status, until, scope: row.scope || 'residanat' })
  }

  return (
    <div className="ar">
      <header className="ar-head">
        <div>
          <span className="ar-eyebrow">Administration</span>
          <h1>Gestion des accès</h1>
          <p className="muted small">
            {rows === null ? 'Chargement…' : `${counts.all} compte${counts.all > 1 ? 's' : ''} · ${counts.paid} actif${counts.paid > 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="ar-actions">
          <button type="button" className="soft" onClick={load} disabled={busy}>{busy ? 'Actualisation…' : 'Actualiser'}</button>
          <button type="button" className="ghost" onClick={() => go({ name: 'home' })}>← Accueil</button>
        </div>
      </header>

      <div className="ar-filters">
        <nav className="ar-tabs" aria-label="État d’accès">
          {TABS.map(([k, l]) => (
            <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {l}{counts[k] ? ` ${counts[k]}` : ''}
            </button>
          ))}
        </nav>
        <label className="ar-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un candidat" aria-label="Rechercher un candidat" />
        </label>
      </div>

      {err && (
        <div className="ar-err">
          <b>Action impossible</b>
          <p className="muted small">{err}</p>
        </div>
      )}

      {rows !== null && !list.length && !err && (
        <div className="ar-empty">
          <b>Aucun compte</b>
          <p className="muted small">Aucun candidat ne correspond à ce filtre.</p>
        </div>
      )}

      {!!list.length && (
        <ul className="ar-list">
          {list.map(a => {
            const st = stateOf(a)
            return (
              <li key={a.id || a.user_id} className={st === 'paid' ? 'ok' : ''}>
                <div className="ar-row ar-row-acc">
                  <span className="ar-type">{st === 'paid' ? 'actif' : st === 'expired' ? 'échu' : 'sans accès'}</span>
                  <b>{who(a)}</b>
                  <span className="ar-date">échéance {dateFR(a.ends_at || a.until)}</span>
                </div>
                <div className="ar-meta">
                  {a.plan && <span>offre : {a.plan}</span>}
                  {a.scope && <span>périmètre : {a.scope}</span>}
                  <span className="ar-acts">
                    <button type="button" className="link" onClick={() => ask(a, 'paid')}>Ouvrir 30 jours</button>
                    <button type="button" className="link" onClick={() => ask(a, 'closed')}>Fermer l’accès</button>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="ar-note">
        Les changements passent par la fonction `admin_set_access`. La migration correspondante est
        livrée mais non appliquée : tant qu’elle ne l’est pas, toute action est refusée et le motif
        s’affiche ici.
      </p>

      {action && pending && (
        <div className="ar-confirm" role="dialog" aria-modal="true" aria-label="Confirmer le changement d’accès">
          <div>
            <b>{action.status === 'paid' ? 'Ouvrir l’accès 30 jours ?' : 'Fermer l’accès ?'}</b>
            <p className="muted small">
              {who(pending)} — {action.status === 'paid'
                ? `nouvelle échéance : ${dateFR(action.until)}`
                : 'l’accès sera révoqué immédiatement.'}
            </p>
            <div className="ar-confirm-a">
              <button type="button" className="soft" onClick={() => { setAction(null); setPending(null) }}>Annuler</button>
              <button type="button" className="primary" onClick={run} disabled={busy}>{busy ? 'Envoi…' : 'Confirmer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
