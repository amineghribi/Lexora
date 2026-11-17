import React, { useEffect, useState } from 'react'
import { arcDebrief, errorText } from './data.js'
import './arcdebrief.css'

/* ===== Panneaux du débriefing ARC (maquette « score final ») =====
   Composant autonome, importé par l'écran ARC : radar des compétences, « regard du jury » et
   chronologie des décisions. Aucune donnée inventée : tout vient de `arc_debrief` (tentative du
   compte + explications du barème) ; les encarts du jury n'apparaissent que si le cas les déclare. */

export const COMP_LABEL = { history: 'Interrogatoire', exam: 'Examen', investigation: 'Examens', differential: 'Différentiel', diagnosis: 'Diagnostic' }
const KIND_LABEL = { presentation: 'Présentation', history: 'Interrogatoire', exam: 'Examen clinique', investigation: 'Examens complémentaires', differential: 'Différentiel', diagnosis: 'Diagnostic' }

function Radar({ items, max = 20 }) {
  const n = Math.max(3, items.length)
  const R = 72, cx = 0, cy = 0
  const pt = (i, r) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    return [(cx + Math.cos(a) * r).toFixed(1), (cy + Math.sin(a) * r).toFixed(1)]
  }
  const ring = f => items.map((_, i) => pt(i, R * f).join(',')).join(' ')
  const shape = items.map((it, i) => pt(i, R * Math.min(1, Math.max(0, it.value / max))).join(',')).join(' ')
  return (
    <svg className="db-radar" viewBox="-105 -105 210 210" role="img" aria-label="Compétences évaluées">
      {[0.34, 0.67, 1].map(f => <polygon key={f} points={ring(f)} fill="none" stroke="var(--line)" strokeWidth="1" />)}
      {items.map((_, i) => { const q = pt(i, R); return <line key={i} x1="0" y1="0" x2={q[0]} y2={q[1]} stroke="var(--line)" /> })}
      <polygon points={shape} fill="color-mix(in srgb, var(--acc) 20%, transparent)" stroke="var(--acc)" strokeWidth="2" />
      {items.map((it, i) => {
        const q = pt(i, R + 16)
        return <text key={i} x={q[0]} y={q[1]} fontSize="8.5" textAnchor="middle" dominantBaseline="middle" fill="var(--muted)">{it.label}</text>
      })}
    </svg>
  )
}

export function DebriefPanels({ attempt, steps }) {
  const comps = (attempt && attempt.detail && attempt.detail.components) || {}
  const rows = Object.entries(comps).map(([k, v]) => ({ label: COMP_LABEL[k] || k, value: Number(v) || 0 }))
  const jury = (steps || []).flatMap(s => {
    const j = s && s.jury
    if (!j) return []
    return Array.isArray(j) ? j : [j]
  }).filter(Boolean)

  return (
    <div className="db">
      {rows.length > 0 && (
        <section className="db-block">
          <span className="db-label">Compétences évaluées</span>
          <div className="db-radar-wrap">
            <Radar items={rows} />
            <ul className="db-comps">
              {rows.map(r => <li key={r.label}><span>{r.label}</span><b>{r.value.toFixed(2).replace('.', ',')}</b></li>)}
            </ul>
          </div>
        </section>
      )}

      {jury.length > 0 && (
        <section className="db-block">
          <span className="db-label">Le regard du jury</span>
          <ul className="db-jury">
            {jury.map((j, i) => (
              <li key={i} className={j.ok === false ? 'ko' : 'ok'}>
                <b>{j.title || (j.ok === false ? 'Point critique' : 'Sauvetage critique')}</b>
                {j.text && <p>{j.text}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(steps || []).length > 0 && (
        <section className="db-block">
          <span className="db-label">Chronologie des décisions</span>
          <div className="db-table-wrap">
            <table className="db-table">
              <thead><tr><th>#</th><th>Étape</th><th>Décision face au barème</th></tr></thead>
              <tbody>
                {steps.map(s => (
                  <tr key={s.rank}>
                    <td className="n">{s.rank}</td>
                    <td>{KIND_LABEL[s.kind] || s.kind}</td>
                    <td>{s.explanation || <span className="db-hint">Pas d’explication pour cette étape.</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}


/* Écran de bilan en page pleine (maquette « score final ») : bandeau deux colonnes cadran + radar,
   encarts du jury, puis table chronologique large. Aucune barre d'étapes, comme la maquette. */
export function DebriefPage({ caseId, go }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    arcDebrief(caseId).then(x => { if (live) setD(x || { attempt: null, steps: [] }) })
      .catch(e => { if (live) { setD({ attempt: null, steps: [] }); setErr(errorText(e)) } })
    return () => { live = false }
  }, [caseId])

  if (!d) return <p className="db-hint">Chargement du bilan…</p>

  if (!d.attempt) {
    return (
      <div className="dbp">
        <div className="dbp-top">
          <button type="button" className="ghost" onClick={() => go({ name: 'arc' })}>← Toutes les banques</button>
        </div>
        <div className="dbp-empty">
          <b>Aucun bilan enregistré pour ce cas</b>
          <p className="db-hint">Termine une tentative : la correction s’affichera ici, avec le barème étape par étape.</p>
          <button type="button" className="primary" onClick={() => go({ name: 'arc' })}>Revenir aux cas</button>
        </div>
      </div>
    )
  }

  const pct = Number(d.attempt.pct) || 0
  const comps = (d.attempt.detail && d.attempt.detail.components) || {}
  const rows = Object.entries(comps).map(([k, v]) => ({ label: COMP_LABEL[k] || k, value: Number(v) || 0 }))

  return (
    <div className="dbp">
      <div className="dbp-top">
        <button type="button" className="ghost" onClick={() => go({ name: 'arc' })}>← Toutes les banques</button>
        <span className="dbp-crumb">Débriefing · bilan du {new Date(d.attempt.at).toLocaleDateString('fr-FR')}</span>
      </div>

      <section className="dbp-hero">
        <div className="dbp-score">
          <div className={`dbp-dial ${pct >= 70 ? 'ok' : pct >= 40 ? 'mid' : 'ko'}`}>
            <b>{pct}</b><small>/ 100</small>
          </div>
          <div className="dbp-score-txt">
            <span className="db-label">Score final</span>
            <b>{pct >= 70 ? 'Mention très bien' : pct >= 40 ? 'Passable' : 'À retravailler'}</b>
            <span className="db-hint">Diagnostic final {d.attempt.dx_ok ? 'retenu' : 'non retenu'}</span>
          </div>
        </div>
        <div className="dbp-radar">
          <span className="db-label">Compétences évaluées</span>
          {rows.length > 0 ? <Radar items={rows} /> : <p className="db-hint">Pas de détail par composante.</p>}
        </div>
      </section>

      <DebriefPanels attempt={d.attempt} steps={d.steps} />
      {err && <p className="db-hint" role="alert">{err}</p>}
    </div>
  )
}
