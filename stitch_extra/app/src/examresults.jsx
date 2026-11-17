import React, { useMemo } from 'react'
import './phase5.css'

/* 2.7 — Résultats de l'examen blanc.
   Score et points faibles calculés sur les réponses remises. Le rang n'est affiché que si une
   cohorte est fournie (`cohort`) : sans cohorte réelle, la ligne est omise — jamais inventée. */

export function ExamResults({ init, go }) {
  const questions = (init && init.questions) || []
  const answers = (init && init.answers) || {}
  const cohort = init && init.cohort ? init.cohort : null

  const rows = useMemo(() => questions.map(q => ({
    id: q.id,
    stem: q.stem,
    sp: q.sp || '—',
    picked: answers[q.id],
    good: q.correct,
    ok: answers[q.id] === q.correct,
  })), [questions, answers])

  const answered = rows.filter(r => r.picked != null)
  const good = answered.filter(r => r.ok).length
  const note = answered.length ? Math.round((good / answered.length) * 20 * 10) / 10 : null
  const bySp = useMemo(() => {
    const m = new Map()
    for (const r of answered) {
      const e = m.get(r.sp) || { n: 0, ok: 0 }
      e.n += 1; if (r.ok) e.ok += 1
      m.set(r.sp, e)
    }
    return [...m].map(([sp, e]) => ({ sp, n: e.n, pct: Math.round((e.ok / e.n) * 100) })).sort((a, b) => a.pct - b.pct)
  }, [answered])

  return (
    <div className="xr">
      <div className="xr-top">
        <button type="button" className="ghost" onClick={() => go({ name: 'exam' })}>← Examens blancs</button>
        <span className="xr-crumb">Résultats</span>
      </div>

      <section className="xr-score">
        <div>
          <span className="xr-l">Note de l’épreuve</span>
          <b>{note == null ? '—' : `${note} / 20`}</b>
          <span className="muted small">{good} bonnes réponses sur {answered.length} répondues{questions.length ? ` · ${questions.length - answered.length} sans réponse` : ''}</span>
        </div>
        {cohort && (
          <div className="xr-rank">
            <span className="xr-l">Rang</span>
            <b>{cohort.rank || '—'}</b>
            <span className="muted small">sur {cohort.size || '—'} candidats</span>
          </div>
        )}
      </section>

      <section className="xr-card">
        <div className="xr-card-h"><b>Points faibles</b><span className="muted small">du plus faible au plus solide</span></div>
        {!bySp.length ? <p className="muted small">Aucune réponse enregistrée pour cette épreuve.</p> : (
          <ul className="xr-sp">
            {bySp.map(s => (
              <li key={s.sp}>
                <span className="n">{s.sp}</span>
                <span className="bar"><i style={{ width: `${s.pct}%` }} className={s.pct < 50 ? 'weak' : s.pct >= 75 ? 'good' : ''} /></span>
                <span className="p">{s.pct} %</span>
                <span className="muted small">{s.n} q.</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="xr-card">
        <div className="xr-card-h"><b>Détail</b><span className="muted small">{rows.length} question{rows.length > 1 ? 's' : ''}</span></div>
        <ul className="xr-list">
          {rows.map((r, k) => (
            <li key={r.id} className={r.ok ? 'ok' : r.picked == null ? 'skip' : 'ko'}>
              <span className="k">{k + 1}</span>
              <span className="s">{r.stem}</span>
              <span className="v">{r.picked == null ? 'sans réponse' : r.ok ? 'juste' : 'faux'}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
