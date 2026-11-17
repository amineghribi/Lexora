import React, { useEffect, useMemo, useState } from 'react'
import './phase5.css'

/* 2.6 — Session d'examen plein écran.
   Chronomètre réel, navigation question par question, brouillon conservé par épreuve.
   Aucune correction n'est révélée avant la remise : c'est une épreuve blanche. */

const KEY = ref => `exam_draft:${ref}`
const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export function ExamSession({ init, go }) {
  const ref = (init && (init.ref || init.title)) || 'blanc'
  const questions = (init && Array.isArray(init.questions)) ? init.questions : []
  const mins = init && Number.isFinite(init.duration_minutes) ? init.duration_minutes : 180
  const total = Math.round(mins * 60)
  const [left, setLeft] = useState(total)
  const [i, setI] = useState(0)
  const [ans, setAns] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY(ref)) || '{}') || {} } catch { return {} }
  })
  const [ask, setAsk] = useState(false)

  useEffect(() => { try { localStorage.setItem(KEY(ref), JSON.stringify(ans)) } catch {} }, [ans, ref])
  useEffect(() => {
    const t = setInterval(() => setLeft(s => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { if (left === 0) setAsk(true) }, [left])

  const done = Object.keys(ans).length
  const q = questions[i]
  const pick = k => setAns(a => ({ ...a, [q.id]: k }))

  return (
    <div className="xs">
      <header className="xs-bar">
        <span className="xs-badge">Épreuve blanche</span>
        <span className="xs-t">{mmss(left)}</span>
        <span className="xs-pos">{questions.length ? `${i + 1} / ${questions.length}` : '—'}</span>
        <span className="xs-done">{done} répondue{done > 1 ? 's' : ''}</span>
        <button type="button" className="primary xs-end" onClick={() => setAsk(true)}>Terminer</button>
      </header>

      {!questions.length ? (
        <div className="xs-empty">
          <b>Aucune question chargée</b>
          <p>Cette épreuve n’a pas encore de questions. Rien ne peut être corrigé.</p>
          <button type="button" className="soft" onClick={() => go({ name: 'exam' })}>Retour aux examens blancs</button>
        </div>
      ) : (
        <>
          <main className="xs-q">
            <span className="xs-n">Question {i + 1}</span>
            <h1>{q.stem}</h1>
            <ul className="xs-opts">
              {(q.options || []).map((o, k) => (
                <li key={k}>
                  <button type="button" className={ans[q.id] === k ? 'on' : ''} onClick={() => pick(k)}>
                    <span className="l">{String.fromCharCode(65 + k)}</span>{o}
                  </button>
                </li>
              ))}
            </ul>
          </main>

          <nav className="xs-nav">
            <button type="button" className="soft" disabled={i === 0} onClick={() => setI(n => n - 1)}>Précédent</button>
            <ol className="xs-dots">
              {questions.map((x, k) => (
                <li key={x.id}><button type="button" className={`${k === i ? 'cur' : ''}${ans[x.id] != null ? ' ok' : ''}`} onClick={() => setI(k)}>{k + 1}</button></li>
              ))}
            </ol>
            <button type="button" className="primary" disabled={i >= questions.length - 1} onClick={() => setI(n => n + 1)}>Suivant</button>
          </nav>
        </>
      )}

      {ask && (
        <div className="xs-modal" role="dialog" aria-modal="true">
          <div>
            <b>{left === 0 ? 'Temps écoulé' : 'Terminer l’épreuve ?'}</b>
            <p>{done} question{done > 1 ? 's' : ''} répondue{done > 1 ? 's' : ''} sur {questions.length || '—'}. Après remise, les réponses sont définitives.</p>
            <div className="xs-modal-a">
              <button type="button" className="soft" onClick={() => setAsk(false)}>Continuer l’épreuve</button>
              <button type="button" className="primary" onClick={() => go({ name: 'exam-results', ref, answers: ans, questions })}>Remettre</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
