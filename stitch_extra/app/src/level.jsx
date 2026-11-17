import React, { useEffect, useState } from 'react'
import { getSpecialties, getQuestionsBySpecialty, errorText, DataError } from './data.js'
import { facultyName, trackName } from './track.jsx'

const PAGE = 30

// Interface C (DCEM1, DCEM2, DCEM3 S1) : on entre par la spécialité, pas par l'année d'examen.
// Les listes viennent de RPC filtrées par le serveur sur le parcours et la faculté de l'élève : rien d'inaccessible n'est proposé.
export function LevelHome({ scope, state, onStart, go }) {
  const [sps, setSps] = useState(null)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(null) // { sp, total, items, offset }
  const [busy, setBusy] = useState(false)
  const load = () => { setErr(''); getSpecialties().then(setSps).catch(e => setErr(e instanceof DataError ? errorText(e) : 'Chargement impossible, réessaie.')) }
  useEffect(load, [])
  const open = async sp => {
    setBusy(true); setErr('')
    try { const r = await getQuestionsBySpecialty(sp, PAGE, 0); setSel({ sp, total: r.total, items: r.items || [], offset: PAGE }) } catch (e) { setErr(e instanceof DataError ? errorText(e) : 'Chargement impossible, réessaie.') }
    setBusy(false)
  }
  const more = async () => {
    setBusy(true); setErr('')
    try { const r = await getQuestionsBySpecialty(sel.sp, PAGE, sel.offset); setSel(s => ({ ...s, items: [...s.items, ...(r.items || [])], offset: s.offset + PAGE })) } catch (e) { setErr(e instanceof DataError ? errorText(e) : 'Chargement impossible, réessaie.') }
    setBusy(false)
  }
  const start = (ids, title) => ids.length && onStart({ title, ids, mode: 'immediate', kind: 'custom' })
  const att = (state && state.attempts) || []

  if (sel) {
    const seen = (state && state.cards) || {}
    const fresh = sel.items.filter(e => !seen[e.i])
    return (
      <div>
        <div className="page-h">
          <button type="button" className="ghost" onClick={() => setSel(null)}>← Spécialités</button>
          <h1>{sel.sp}</h1>
          <p className="muted small">{sel.total.toLocaleString('fr')} question{sel.total > 1 ? 's' : ''} dans ton espace · {sel.items.length} chargée{sel.items.length > 1 ? 's' : ''}</p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="primary" disabled={!sel.items.length} onClick={() => start((fresh.length ? fresh : sel.items).slice(0, 20).map(e => e.i), `QCM — ${sel.sp}`)}>QCM : 20 questions{fresh.length ? ' (nouvelles d’abord)' : ''}</button>
          <button type="button" className="ghost" onClick={() => go({ name: 'arc', specialty: sel.sp })}>Cas cliniques ARC</button>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 8 }}>
          {sel.items.map(e => (
            <li key={e.i} className="card" style={{ margin: 0 }}>
              <span className="small muted">{e.tp || ''}</span>
              <div>{e.q}</div>
              <div className="row"><button type="button" className="ghost" onClick={() => start([e.i], `Question ${e.i}`)}>Répondre</button></div>
            </li>
          ))}
        </ul>
        {sel.items.length < sel.total && <div className="row" style={{ marginTop: 12 }}><button type="button" disabled={busy} onClick={more}>{busy ? 'Chargement…' : 'Voir plus'}</button></div>}
      </div>
    )
  }

  return (
    <div>
      <div className="page-h">
        <h1>{scope ? trackName(scope.track) : 'Mon espace'}{scope && scope.faculty ? ` · ${facultyName(scope.faculty)}` : ''}</h1>
        <p className="muted">Choisis une spécialité : QCM et cas cliniques de ton parcours.</p>
        <p className="muted small">{att.length.toLocaleString('fr')} réponses données</p>
      </div>
      {err && <p className="err" role="alert">{err} <button type="button" className="ghost" onClick={load}>Réessayer</button></p>}
      {!sps && !err && <p className="muted" role="status">Chargement…</p>}
      {sps && !sps.length && <p className="muted">Aucune spécialité disponible pour ton espace pour le moment.</p>}
      <div className="grid">
        {(sps || []).map(s => (
          <button key={s.sp} type="button" className="tile" disabled={busy} onClick={() => open(s.sp)}>
            <b>{s.sp}</b>
            <span className="muted small">{s.questions.toLocaleString('fr')} questions · {s.courses} cours</span>
          </button>
        ))}
      </div>
    </div>
  )
}
