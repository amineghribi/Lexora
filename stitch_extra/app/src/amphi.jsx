import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './session.js'
import './amphi.css'

/* 5.3 — Mode amphi : séance en direct dans l'amphithéâtre.
   Sept étapes, alignées sur les maquettes : interrogatoire, examen physique, examens
   complémentaires, différentiel, ordonnance, diagnostic, bilan.
   Backend réel : amphi_start / amphi_join / amphi_vote / amphi_advance / amphi_results.
   Aucun résultat n'est simulé : les barres affichent les votes enregistrés. */

const STEPS = [
  ['history', 'Interrogatoire', 'Anamnèse'],
  ['exam', 'Examen physique', 'Auscultation'],
  ['investigation', 'Examens complémentaires', 'Imagerie et biologie'],
  ['differential', 'Diagnostic différentiel', 'Hypothèses'],
  ['prescription', 'Ordonnance thérapeutique', 'Prescription'],
  ['diagnosis', 'Diagnostic final', 'Conclusion'],
  ['score', 'Bilan et score', 'Synthèse'],
]

export function Amphi({ role = 'teacher', options = [], go, initial, onProject }) {
  const [code, setCode] = useState('')
  const [sid, setSid] = useState(initial ? initial.sid : null)
  const [step, setStep] = useState(initial ? initial.step : 'history')
  const [choice, setChoice] = useState('')
  const [res, setRes] = useState(initial && initial.results ? initial.results : [])
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState(initial ? initial.code : null)

  const isTeacher = role === 'teacher'

  const start = async () => {
    setBusy(true); setErr(null)
    try {
      const { data, error } = await supabase.rpc('amphi_start', { p_case: null })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      setSid(row.session_id); setOpened(row.code); setStep('history')
    } catch (e) { setErr(String((e && e.message) || e)) } finally { setBusy(false) }
  }

  const join = async () => {
    setBusy(true); setErr(null)
    try {
      const { data, error } = await supabase.rpc('amphi_join', { p_code: code.trim() })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      setSid(row.session_id); setStep(row.step || 'history')
    } catch (e) { setErr(String((e && e.message) || e)) } finally { setBusy(false) }
  }

  const vote = async value => {
    const v = (value || choice).trim()
    if (!v || !sid) return
    setBusy(true); setErr(null)
    try {
      const { error } = await supabase.rpc('amphi_vote', { p_session: sid, p_step: step, p_choice: v })
      if (error) throw error
      setChoice(v)
      loadResults()
    } catch (e) { setErr(String((e && e.message) || e)) } finally { setBusy(false) }
  }

  const advance = async nextStep => {
    if (!sid || !isTeacher) return
    setBusy(true); setErr(null)
    try {
      const { error } = await supabase.rpc('amphi_advance', { p_session: sid, p_step: nextStep })
      if (error) throw error
      setStep(nextStep); loadResults()
    } catch (e) { setErr(String((e && e.message) || e)) } finally { setBusy(false) }
  }

  const loadResults = () => {
    if (!sid || (initial && initial.results)) return
    supabase.rpc('amphi_results', { p_session: sid, p_step: step }).then(({ data, error }) => {
      if (!error) setRes(data || [])
    })
  }

  useEffect(() => { loadResults() }, [sid, step])
  useEffect(() => {
    if (!sid) return undefined
    const t = setInterval(loadResults, 4000)
    return () => clearInterval(t)
  }, [sid, step])

  const total = useMemo(() => res.reduce((n, r) => n + Number(r.votes || 0), 0), [res])
  const current = STEPS.find(([k]) => k === step) || STEPS[0]

  return (
    <div className="am">
      <header className="am-head">
        <div>
          <span className="am-eyebrow">Mode amphi · séance en direct</span>
          <h1>{sid ? current[1] : 'Ouvrir ou rejoindre une séance'}</h1>
          <p className="muted small">
            {sid ? `${current[2]} · ${total} vote${total > 1 ? 's' : ''} sur cette étape` : 'L’enseignant projette, les candidats votent depuis leur appareil.'}
          </p>
        </div>
        {sid && (
          <span className="am-head-acts">
            <span className="am-code">Code {opened || code.toUpperCase()}</span>
            {onProject && <button type="button" className="soft" onClick={() => onProject(sid)}>Projeter</button>}
          </span>
        )}
      </header>

      {err && (
        <div className="am-err" role="alert">
          <b>{/TEACHER_REQUIRED/.test(err) ? 'Compte enseignant requis' : /SESSION_/.test(err) ? 'Séance indisponible' : 'Action impossible'}</b>
          <p className="muted small">{err}</p>
        </div>
      )}

      {!sid && (
        <div className="am-setup">
          <section className="am-card">
            <b>Animer une séance</b>
            <p className="muted small">Ouvre une salle, projette le code, fais voter l’amphi.</p>
            <button type="button" className="primary" onClick={start} disabled={busy}>{busy ? 'Ouverture…' : 'Ouvrir une séance'}</button>
          </section>
          <section className="am-card">
            <b>Rejoindre</b>
            <form onSubmit={e => { e.preventDefault(); join() }}>
              <label className="am-fld">Code de la séance
                <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="EX. 969626" />
              </label>
              <button type="submit" className="soft" disabled={!code.trim() || busy}>Rejoindre la séance</button>
            </form>
          </section>
        </div>
      )}

      {sid && (
        <>
          <nav className="am-tabs" aria-label="Étapes de la séance">
            {STEPS.map(([k, label], i) => (
              <button key={k} type="button" className={k === step ? 'on' : ''}
                onClick={() => (isTeacher ? advance(k) : setStep(k))}>
                <span className="n">{i + 1}</span>{label}
              </button>
            ))}
          </nav>

          <div className="am-body">
            <section className="am-card am-vote">
              <div className="am-card-h"><b>Voter — {current[1]}</b>{total > 0 && <span className="muted small">{total} vote{total > 1 ? 's' : ''}</span>}</div>
              {options.length ? (
                <ul className="am-opts">
                  {options.map(o => (
                    <li key={o}>
                      <button type="button" className={choice === o ? 'on' : ''} onClick={() => vote(o)}>{o}</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <form className="am-free" onSubmit={e => { e.preventDefault(); vote() }}>
                  <input value={choice} onChange={e => setChoice(e.target.value)} placeholder="Ta réponse pour cette étape" aria-label="Ta réponse" />
                  <button type="submit" className="primary" disabled={!choice.trim() || busy}>Voter</button>
                </form>
              )}
            </section>

            <section className="am-card am-res">
              <div className="am-card-h"><b>Résultats en direct</b><span className="muted small">actualisés toutes les 4 s</span></div>
              {!res.length ? <p className="muted small">Aucun vote enregistré pour cette étape.</p> : (
                <ul className="am-bars">
                  {res.map(r => {
                    const pct = total ? Math.round((Number(r.votes) / total) * 100) : 0
                    return (
                      <li key={r.choice}>
                        <span className="c">{r.choice}</span>
                        <span className="b"><i style={{ width: `${pct}%` }} /></span>
                        <span className="v">{r.votes}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>

          {isTeacher && (
            <div className="am-foot">
              <button type="button" className="soft" disabled={busy || STEPS.findIndex(([k]) => k === step) === 0}
                onClick={() => { const i = STEPS.findIndex(([k]) => k === step); if (i > 0) advance(STEPS[i - 1][0]) }}>← Étape précédente</button>
              <button type="button" className="primary" disabled={busy || STEPS.findIndex(([k]) => k === step) === STEPS.length - 1}
                onClick={() => { const i = STEPS.findIndex(([k]) => k === step); if (i < STEPS.length - 1) advance(STEPS[i + 1][0]) }}>Étape suivante →</button>
              {go && <button type="button" className="ghost" onClick={() => go({ name: 'home' })}>Terminer la séance</button>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
