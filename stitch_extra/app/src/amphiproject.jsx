import React, { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from './session.js'
import './amphiproject.css'

/* 5.3 — Variante PROJECTION du mode amphi (grand écran, lisible du fond de l'amphithéâtre).
   Même backend que le poste de travail (amphi_state / amphi_results / amphi_advance) :
   compteur de participants, votes et minuteur d'étape sont réels, jamais simulés. */

const STEPS = [
  ['history', 'Interrogatoire'],
  ['exam', 'Examen physique'],
  ['investigation', 'Examens complémentaires'],
  ['differential', 'Diagnostic différentiel'],
  ['prescription', 'Ordonnance thérapeutique'],
  ['diagnosis', 'Diagnostic final'],
  ['score', 'Bilan et score'],
]

const mmss = s => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.max(0, s) % 60).padStart(2, '0')}`

export function AmphiProjection({ session, options = [], go, demo, caseInfo }) {
  const [state, setState] = useState(demo && demo.state ? demo.state : null)
  const [res, setRes] = useState(demo && demo.results ? demo.results : [])
  const [now, setNow] = useState(Date.now())
  const [qr, setQr] = useState('')
  const [err, setErr] = useState(null)

  const code = state ? state.code : (demo && demo.state ? demo.state.code : '')
  const step = state ? state.step : 'history'
  const label = (STEPS.find(([k]) => k === step) || STEPS[0])[1]
  const idx = Math.max(0, STEPS.findIndex(([k]) => k === step))

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!code) return
    const link = (() => { try { return `${location.origin}/?amphi=${code}` } catch { return code } })()
    QRCode.toDataURL(link, { margin: 1, width: 320, color: { dark: '#0F4C5C', light: '#FFFFFF' } })
      .then(setQr).catch(() => setQr(''))
  }, [code])

  const refresh = () => {
    if (!session) return
    supabase.rpc('amphi_state', { p_session: session }).then(({ data, error }) => {
      if (error) { setErr(String(error.message || error)); return }
      const row = Array.isArray(data) ? data[0] : data
      if (row) setState(row)
    })
    supabase.rpc('amphi_results', { p_session: session, p_step: step }).then(({ data, error }) => {
      if (!error) setRes(data || [])
    })
  }

  useEffect(() => {
    if (demo) return undefined
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [session, step, demo])

  const next = async () => {
    if (!session || idx >= STEPS.length - 1) return
    try {
      const { error } = await supabase.rpc('amphi_advance', { p_session: session, p_step: STEPS[idx + 1][0] })
      if (error) throw error
      refresh()
    } catch (e) { setErr(String((e && e.message) || e)) }
  }

  const elapsed = state && state.step_started_at ? Math.floor((now - new Date(state.step_started_at).getTime()) / 1000) : 0
  const total = useMemo(() => res.reduce((n, r) => n + Number(r.votes || 0), 0), [res])
  const participants = state ? Number(state.participants || 0) : 0

  return (
    <div className="ap">
      <header className="ap-top">
        <div className="ap-step">
          <span className="ap-n">Étape {idx + 1} / {STEPS.length}</span>
          <h1>{label}</h1>
        </div>
        <div className="ap-metrics">
          <div className="ap-m"><b>{participants}</b><span>participants</span></div>
          <div className="ap-m"><b>{total}</b><span>votes</span></div>
          <div className="ap-m ap-timer"><b>{mmss(elapsed)}</b><span>sur cette étape</span></div>
        </div>
      </header>

      {err && <p className="ap-err" role="alert">{err}</p>}

      {caseInfo && (
        <section className="ap-dossier">
          <div className="ap-motif">
            <span className="ap-tag">{caseInfo.patient || 'Dossier clinique'}</span>
            <h2>{caseInfo.motif}</h2>
            {caseInfo.step && <span className="ap-prog">{caseInfo.step}</span>}
          </div>
          {!!(caseInfo.vitals || []).length && (
            <ul className="ap-vitals">
              {caseInfo.vitals.map(v => (
                <li key={v.label} className={v.alert ? 'alert' : ''}>
                  <span className="l">{v.label}</span>
                  <b>{v.value}<small>{v.unit || ''}</small></b>
                </li>
              ))}
            </ul>
          )}
          {caseInfo.history && <p className="ap-history">{caseInfo.history}</p>}
        </section>
      )}

      <div className="ap-body">
        <section className="ap-qr">
          <span className="ap-qr-l">Rejoindre la séance</span>
          {qr ? <img src={qr} alt={`QR code d’accès à la séance ${code}`} /> : <div className="ap-qr-ph" aria-hidden="true" />}
          <b className="ap-code">{code || '—'}</b>
          <span className="ap-hint">Scannez ou saisissez le code</span>
        </section>

        <section className="ap-results" aria-live="polite">
          <div className="ap-results-h">
            <b>Réponses de l’amphi</b>
            <span>{total} vote{total > 1 ? 's' : ''}</span>
          </div>
          {!res.length ? (
            <p className="ap-empty">Aucun vote pour l’instant — la salle se prononce.</p>
          ) : (
            <ul className="ap-bars">
              {res.map(r => {
                const pct = total ? Math.round((Number(r.votes) / total) * 100) : 0
                return (
                  <li key={r.choice}>
                    <span className="c">{r.choice}</span>
                    <span className="b"><i style={{ width: `${pct}%` }} /></span>
                    <span className="p">{pct} %</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <footer className="ap-foot">
        <span className="ap-dots" aria-hidden="true">
          {STEPS.map(([k], i) => <i key={k} className={i === idx ? 'on' : i < idx ? 'done' : ''} />)}
        </span>
        <div className="ap-ctrl">
          {session && <button type="button" className="ap-btn" onClick={next} disabled={idx >= STEPS.length - 1}>Étape suivante →</button>}
          {go && <button type="button" className="ap-btn ghost" onClick={() => go({ name: 'home' })}>Quitter la projection</button>}
        </div>
      </footer>
    </div>
  )
}
