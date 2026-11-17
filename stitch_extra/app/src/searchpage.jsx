import React, { useCallback, useEffect, useMemo, useState } from 'react'
import './phase5.css'

/* 2.8 — Recherche.
   Interroge `search_questions` (RPC existante) et n'affiche que des résultats réels.
   Tant qu'aucune requête n'est lancée, l'écran explique la recherche au lieu de montrer du vide. */

export function SearchPage({ index, go, onStart }) {
  const [q, setQ] = useState('')
  const [sp, setSp] = useState('')
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const sps = useMemo(() => [...new Set((index.series || []).map(s => s.sp))].sort(), [index.series])

  const run = useCallback(async term => {
    const t = term.trim()
    if (t.length < 2) { setRows(null); return }
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`/rest/v1/rpc/search_questions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: t, limit_n: 40 }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      setRows(Array.isArray(d) ? d : [])
    } catch (e) { setErr('Recherche indisponible pour le moment.'); setRows([]) } finally { setBusy(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { if (q.trim().length >= 2) run(q) }, 350)
    return () => clearTimeout(t)
  }, [q, run])

  const shown = (rows || []).filter(r => !sp || r.sn === sp || r.sp === sp)

  return (
    <div className="sr">
      <header className="sr-head">
        <span className="sr-eyebrow">Banque de questions</span>
        <h1>Recherche</h1>
        <p className="muted small">Énoncés, propositions et explications des questions publiées.</p>
      </header>

      <div className="sr-bar">
        <label className="sr-input">
          <span aria-hidden="true">⌕</span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="ex. syndrome coronarien aigu" aria-label="Rechercher dans les questions" />
        </label>
        <div className="sr-tabs">
          <button type="button" className={sp === '' ? 'on' : ''} onClick={() => setSp('')}>Toutes</button>
          {sps.slice(0, 7).map(name => (
            <button key={name} type="button" className={sp === name ? 'on' : ''} onClick={() => setSp(name)}>{name}</button>
          ))}
        </div>
      </div>

      {err && <p className="sr-err">{err}</p>}
      {busy && <p className="muted small">Recherche en cours…</p>}
      {!err && !busy && rows === null && (
        <div className="sr-hint">
          <b>Cherche un mot-clé pour commencer</b>
          <p className="muted small">La recherche porte sur le texte des questions et de leurs corrections.</p>
        </div>
      )}
      {!err && !busy && rows !== null && !shown.length && (
        <div className="sr-hint"><b>Aucun résultat</b><p className="muted small">Essaie un terme plus court ou retire le filtre de spécialité.</p></div>
      )}

      {!!shown.length && (
        <ul className="sr-list">
          {shown.map(r => (
            <li key={r.id || r.q}>
              <span className="sp">{r.sp || '—'}</span>
              <b>{r.stem || r.text || '—'}</b>
              {r.snippet && <p className="muted small">{r.snippet}</p>}
              <button type="button" className="link" onClick={() => onStart && onStart({ title: 'Recherche', ids: [r.id || r.q], mode: 'immediate' })}>Ouvrir la question →</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
