import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './session.js'
import { ArcView } from './arc.jsx'
import { useAuth } from './auth.jsx'

const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Préférences de l'enseignant sur cet appareil (patients déjà présentés, mode projecteur).
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v } catch (e) { return d } }
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { /* stockage indisponible : sans effet */ } }

// Banque des ARC (enseignant) : les patients de sa spécialité, avec le diagnostic caché derrière un bouton.
// Sert à choisir le bon cas avant de le projeter aux étudiants, puis à le résoudre ensemble.
export function ArcBank({ spec }) {
  const [motifs, setMotifs] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [shown, setShown] = useState({}) // diagnostics affichés : « motif:indice » → true
  const [open, setOpen] = useState(null) // { m, c } : patient ouvert dans le simulateur
  const { user } = useAuth()
  const uid = user ? user.id : 'x'
  const [done, setDone] = useState(() => load('arc-presented:' + uid, {})) // « motif:indice » → vrai
  const [proj, setProj] = useState(() => !!load('arc-projector:' + uid, false))
  const [sort, setSort] = useState('motif') // motif | new | diag
  const [hideDone, setHideDone] = useState(false)
  const mark = (k, v) => setDone(d => { const n = { ...d }; if (v) n[k] = 1; else delete n[k]; save('arc-presented:' + uid, n); return n })
  const setP = v => { setProj(v); save('arc-projector:' + uid, v) }
  useEffect(() => {
    let off = false
    setErr('')
    supabase.auth.getSession().then(({ data }) => {
      const tok = data && data.session && data.session.access_token
      if (!tok) throw new Error('x')
      return fetch('/api/arc-bank', { headers: { Authorization: `Bearer ${tok}` } })
    }).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json() })
      .then(j => { if (!off) setMotifs(j.motifs || []) })
      .catch(() => { if (!off) setErr('Chargement de la banque impossible, réessaie dans un instant.') })
    return () => { off = true }
  }, [])
  const key = (m, c) => (c.mid || m.id) + ':' + (c.cid || c.i)
  const rows = useMemo(() => {
    const n = norm(q).trim()
    const keep = (m, c) => (!n || norm(m.motif + ' ' + c.texte + ' ' + c.diag).includes(n)) && !(hideDone && done[m.id + ':' + (c.cid || c.i)])
    const base = (motifs || []).map(m => ({ ...m, cases: m.cases.filter(c => keep(m, c)) })).filter(m => m.cases.length)
    if (sort === 'diag') {
      // Liste à plat, par diagnostic (A → Z)
      const flat = base.flatMap(m => m.cases.map(c => ({ m, c }))).sort((a, b) => a.c.diag.localeCompare(b.c.diag, 'fr'))
      return [{ id: 'all', motif: 'Tous les patients, par diagnostic', cases: flat.map(x => ({ ...x.c, mid: x.m.id, mlabel: x.m.motif })) }]
    }
    if (sort === 'new') {
      // Non présentés d'abord, dans chaque motif
      return base.map(m => ({ ...m, cases: [...m.cases].sort((a, b) => (done[m.id + ':' + (a.cid || a.i)] ? 1 : 0) - (done[m.id + ':' + (b.cid || b.i)] ? 1 : 0) || a.i - b.i) }))
    }
    return base
  }, [motifs, q, sort, hideDone, done])
  if (open) {
    return (
      <div className="sim">
        <div className="row" style={{ marginBottom: 8 }}>
          <button type="button" className="ghost" onClick={() => setOpen(null)}>← Retour à la banque</button>
          <label className="small row" style={{ gap: 6, justifyContent: 'flex-start' }}><input type="checkbox" checked={proj} onChange={e => setP(e.target.checked)} /> Mode projecteur</label>
          <span className="muted small">Aucune tentative n’est enregistrée.</span>
        </div>
        <ArcView preview start={{ ...open, p: proj }} />
      </div>
    )
  }
  const total = (motifs || []).reduce((n, m) => n + m.cases.length, 0)
  return (
    <div className="sim">
      {err && <p className="err" role="alert">{err}</p>}
      {!motifs && !err && <p className="muted" role="status">Chargement…</p>}
      {motifs && !total && <p className="muted">Aucun patient dans {spec ? spec.label : 'ta spécialité'} pour le moment.</p>}
      {motifs && total > 0 && (
        <div className="row" style={{ marginBottom: 8 }}>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un motif, un symptôme, un diagnostic…" aria-label="Chercher dans la banque" style={{ flex: '1 1 260px' }} />
          <span className="muted small">{total} patients</span>
          <button type="button" className="ghost" onClick={() => setShown({})}>Masquer tous les diagnostics</button>
        </div>
      )}
      {motifs && total > 0 && (
        <div className="row" style={{ marginBottom: 8, justifyContent: 'flex-start', gap: 12 }}>
          <label className="small">Tri : <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Trier les patients">
            <option value="motif">Par motif</option>
            <option value="new">Non présentés d’abord</option>
            <option value="diag">Par diagnostic (A → Z)</option>
          </select></label>
          <label className="small row" style={{ gap: 6, justifyContent: 'flex-start' }}><input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} /> Masquer les déjà présentés</label>
          <label className="small row" style={{ gap: 6, justifyContent: 'flex-start' }}><input type="checkbox" checked={proj} onChange={e => setP(e.target.checked)} /> Mode projecteur</label>
          <span className="muted small">{Object.keys(done).length} déjà présentés</span>
        </div>
      )}
      {rows.map(m => (
        <section key={m.id} className="card">
          <b>{m.motif}</b>
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 10 }}>
            {m.cases.map(c => {
              const k = key(m, c), on = !!shown[k]
              return (
                <li key={k} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <p style={{ margin: '0 0 6px' }}><b>Patient {c.i + 1}{c.mlabel ? ' · ' + c.mlabel : ''}.</b> {done[k] && <span className="pill p">déjà présenté</span>} {c.draft && <span className="pill n">brouillon</span>} {c.texte}</p>
                  {on
                    ? <div className="card" style={{ margin: '0 0 8px' }}><b>Diagnostic : {c.diag}</b>{c.resume && <p className="muted small" style={{ margin: '4px 0 0' }}>{c.resume}</p>}</div>
                    : null}
                  <div className="row" style={{ gap: 6, justifyContent: 'flex-start' }}>
                    <button type="button" className="ghost" aria-pressed={on} onClick={() => setShown(s => ({ ...s, [k]: !s[k] }))}>{on ? 'Masquer le diagnostic' : 'Voir le diagnostic'}</button>
                    <button type="button" className="primary" onClick={() => { mark(k, true); setOpen({ m: c.mid || m.id, c: c.cid && /^u-/.test(c.cid) ? c.cid : c.i }) }}>Ouvrir le cas</button>
                    <button type="button" className="ghost" aria-pressed={!!done[k]} onClick={() => mark(k, !done[k])}>{done[k] ? 'Remettre à présenter' : 'Marquer comme présenté'}</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
