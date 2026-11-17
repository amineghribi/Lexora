import React, { useEffect, useMemo, useRef, useState } from 'react'
import { loadQuestions, checkAnswers } from './data.js'
import { QcmFeedback } from './qcmfeedback.jsx'
import './qcmcard.css'

/* ===== QCM en cours de réponse (maquette « qcm en cours de réponse ») =====
   Chrome de la maquette : compteur QCM n/N, barre de progression, chronomètre par item, pastille
   de score, options A–E avec états sélectionné / juste / faux, et barre d'action en bas.
   Les questions et la correction viennent du chemin existant (`loadQuestions`, `checkAnswers`). */

const LETTERS = ['A', 'B', 'C', 'D', 'E']
const PER_ITEM = 90 // secondes, cadence de la maquette

export function QcmScreen({ ids, index, onExit }) {
  const list = useMemo(() => {
    const raw = Array.isArray(ids) && ids.length ? ids : (index && index.series && index.series[0] && index.series[0].q) || []
    return [...new Set(raw)].slice(0, 50)
  }, [ids, index])

  const [qs, setQs] = useState(null)
  const [i, setI] = useState(0)
  const [sel, setSel] = useState([])
  const [state, setState] = useState({ checked: false, ok: null })
  const [score, setScore] = useState(0)
  const [answered, setAnswered] = useState(0)
  const [left, setLeft] = useState(PER_ITEM)
  const [err, setErr] = useState('')
  const busy = useRef(false)

  useEffect(() => {
    loadQuestions(list).then(rows => setQs(rows.filter(Boolean))).catch(e => setErr('Impossible de charger les questions.'))
  }, [list.join(',')])

  const q = qs && qs[i]

  useEffect(() => {
    setSel([]); setState({ checked: false, ok: null }); setLeft(PER_ITEM)
  }, [i])

  useEffect(() => {
    if (!q || state.checked) return undefined
    const t = setInterval(() => setLeft(l => (l > 0 ? l - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [q, state.checked, i])

  const toggle = L => {
    if (!q || state.checked) return
    setSel(prev => (prev.includes(L) ? prev.filter(x => x !== L) : [...prev, L]))
  }

  const validate = async () => {
    if (!q || !sel.length || busy.current) return
    busy.current = true
    try {
      const res = await checkAnswers([{ id: q.i, chosen: sel }])
      const ok = !!res.get(q.i)
      setState({ checked: true, ok })
      setAnswered(a => a + 1)
      if (ok) setScore(s => s + 1)
    } catch (e) { setErr('Correction indisponible pour le moment.') } finally { busy.current = false }
  }

  const options = useMemo(() => {
    if (!q) return []
    const o = q.o || {}
    const keys = Object.keys(o).filter(k => LETTERS.includes(k)).sort()
    const out = keys.length ? keys : LETTERS.filter(k => q[k])
    return out.map(L => ({ L, text: o[L] || q[L] }))
  }, [q])

  const pct = qs && qs.length ? Math.round(((i + 1) / qs.length) * 100) : 0
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')

  if (err) return <div className="card"><p role="alert">{err}</p><button onClick={onExit}>Retour</button></div>
  if (!qs) return <div className="card" role="status">Chargement des questions…</div>
  if (!q) return <div className="card">Aucune question jouable. <button onClick={onExit}>Retour</button></div>

  return (
    <div className="qc">
      <div className="qc-bar">
        <span className="qc-count">QCM <b>{i + 1}</b> / {qs.length}</span>
        <span className={`qc-timer${left <= 10 ? ' low' : ''}`} aria-label={`Temps restant ${mm} min ${ss} s`}>⏱ {mm}:{ss}</span>
        <span className="qc-score">Score <b>{score}</b>/{answered}</span>
        <button type="button" className="ghost qc-quit" onClick={onExit}>Quitter</button>
      </div>
      <div className="qc-progress" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"><i style={{ width: `${pct}%` }} /></div>

      <section className="qc-card">
        {q.ct && <div className="qc-case">{q.ct}</div>}
        <h1 className="qc-q">{q.q}</h1>

        <ul className="qc-opts">
          {options.map(({ L, text }) => {
            const on = sel.includes(L)
            const good = state.checked && q.c && String(q.c).includes(L)
            const bad = state.checked && on && !good
            return (
              <li key={L}>
                <button type="button" className={`qc-opt${on ? ' on' : ''}${good ? ' good' : ''}${bad ? ' bad' : ''}`}
                  aria-pressed={on} disabled={state.checked} onClick={() => toggle(L)}>
                  <span className="L">{L}</span>
                  <span className="T">{text}</span>
                  {good && <span className="mk" aria-hidden="true">✓</span>}
                  {bad && <span className="mk" aria-hidden="true">✕</span>}
                </button>
              </li>
            )
          })}
        </ul>

        {state.checked && <QcmFeedback q={q} ok={state.ok} sel={sel} />}
      </section>

      <div className="qc-actions">
        {!state.checked
          ? <button type="button" className="primary" disabled={!sel.length} onClick={validate}>Valider la réponse</button>
          : i + 1 < qs.length
            ? <button type="button" className="primary" onClick={() => setI(i + 1)}>Question suivante →</button>
            : <button type="button" className="primary" onClick={onExit}>Terminer la série</button>}
      </div>
    </div>
  )
}
