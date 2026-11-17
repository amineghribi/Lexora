import React, { useMemo, useState } from 'react'
import { supabase } from './session.js'
import './arcedit.css'

/* 5.2 — Éditeur de cas clinique pas à pas.
   Écrit réellement dans arc_cases et arc_case_steps via `arc_case_save` (migration appliquée).
   Les sections suivent les `kind` autorisés par la contrainte de la table :
   presentation, history, exam, investigation, differential, diagnosis, questions.
   Aucune étape n'est inventée : chaque ligne écrite est saisie par l'enseignant. */

const SECTIONS = [
  ['presentation', 'Présentation', 'Motif d’admission et phrase d’ouverture du cas.'],
  ['history', 'Interrogatoire', 'Ce que l’étudiant doit chercher à l’anamnèse.'],
  ['exam', 'Examen clinique', 'Signes attendus à l’examen.'],
  ['investigation', 'Examens complémentaires', 'Examens à demander et résultats attendus.'],
  ['differential', 'Diagnostic différentiel', 'Hypothèses à discuter.'],
  ['diagnosis', 'Diagnostic final', 'Conclusion attendue.'],
  ['questions', 'Questions au patient', 'Questions posées au fil du cas.'],
]

const TRACKS = [['dcem3s1', 'DCEM3 S1'], ['dcem3', 'DCEM3'], ['dcem2', 'DCEM2'], ['dcem1', 'DCEM1']]

export function ArcCaseEditor({ caseId = null, onDone, onCancel }) {
  const [f, setF] = useState({ title: '', motif: '', specialty: '', track: 'dcem3s1', level: '' })
  const [steps, setSteps] = useState({})
  const [status, setStatus] = useState('draft')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [saved, setSaved] = useState(null)

  const setField = (k, v) => setF(o => ({ ...o, [k]: v }))
  const addStep = (kind, text) => {
    if (!text.trim()) return
    setSteps(o => ({ ...o, [kind]: [...(o[kind] || []), text.trim()] }))
  }
  const dropStep = (kind, i) => setSteps(o => ({ ...o, [kind]: (o[kind] || []).filter((_, k) => k !== i) }))
  const move = (kind, i, dir) => setSteps(o => {
    const a = [...(o[kind] || [])]
    const j = i + dir
    if (j < 0 || j >= a.length) return o
    ;[a[i], a[j]] = [a[j], a[i]]
    return { ...o, [kind]: a }
  })

  const total = useMemo(() => Object.values(steps).reduce((n, a) => n + a.length, 0), [steps])
  const ready = f.title.trim().length >= 2 && f.motif.trim().length >= 2 && total > 0

  const payload = () => {
    const out = []
    for (const [kind] of SECTIONS) for (const text of (steps[kind] || [])) out.push({ kind, text })
    return out
  }

  const save = async nextStatus => {
    if (!ready || busy) return
    setBusy(true); setErr(null)
    try {
      const { data, error } = await supabase.rpc('arc_case_save', {
        p_id: caseId,
        p_title: f.title.trim(),
        p_motif: f.motif.trim(),
        p_specialty: f.specialty.trim() || 'general',
        p_track: f.track,
        p_level: f.level.trim() || null,
        p_status: nextStatus || status,
        p_steps: payload(),
      })
      if (error) throw error
      setSaved(data)
      setStatus(nextStatus || status)
    } catch (e) {
      setErr(String((e && e.message) || e))
    } finally { setBusy(false) }
  }

  return (
    <div className="ae">
      <header className="ae-head">
        <div>
          <span className="ae-eyebrow">Éditeur de cas · ARC</span>
          <h1>{caseId ? 'Modifier le cas' : 'Nouveau cas clinique'}</h1>
          <p className="muted small">
            {total} étape{total > 1 ? 's' : ''} saisie{total > 1 ? 's' : ''} · l’enregistrement écrit dans arc_cases et arc_case_steps
          </p>
        </div>
        {onCancel && <button type="button" className="ghost" onClick={onCancel}>← Retour</button>}
      </header>

      {err && (
        <div className="ae-err" role="alert">
          <b>{/TEACHER_REQUIRED/.test(err) ? 'Compte enseignant requis' : 'Enregistrement refusé'}</b>
          <p className="muted small">{err}</p>
        </div>
      )}
      {saved && (
        <div className="ae-ok" role="status">
          <b>Cas enregistré</b>
          <p className="muted small">Référence {String(saved).slice(0, 8)}… · statut {status}. {onDone && <button type="button" className="link" onClick={onDone}>Retour à la banque →</button>}</p>
        </div>
      )}

      <section className="ae-card">
        <div className="ae-card-h"><b>Motif et identité du cas</b></div>
        <div className="ae-grid">
          <label>Titre du cas<input value={f.title} onChange={e => setField('title', e.target.value)} maxLength={200} placeholder="ex. Douleur thoracique chez un homme de 58 ans" /></label>
          <label>Motif d’admission<input value={f.motif} onChange={e => setField('motif', e.target.value)} maxLength={120} placeholder="ex. douleur thoracique" /></label>
          <label>Spécialité<input value={f.specialty} onChange={e => setField('specialty', e.target.value)} placeholder="ex. cardiologie" /></label>
          <label>Niveau
            <select value={f.track} onChange={e => setField('track', e.target.value)}>
              {TRACKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label>Repère pédagogique<input value={f.level} onChange={e => setField('level', e.target.value)} placeholder="ex. L2 — module cardio" /></label>
        </div>
      </section>

      <section className="ae-card">
        <div className="ae-card-h"><b>Matrice des étapes</b><span className="muted small">{SECTIONS.length} sections</span></div>
        <div className="ae-secs">
          {SECTIONS.map(([kind, label, hint]) => (
            <StepSection key={kind} kind={kind} label={label} hint={hint}
              items={steps[kind] || []} onAdd={addStep} onDrop={dropStep} onMove={move} />
          ))}
        </div>
      </section>

      <section className="ae-card">
        <div className="ae-card-h">
          <b>Validation</b>
          <span className="muted small">{ready ? 'Prêt à enregistrer' : 'Titre, motif et au moins une étape requis'}</span>
        </div>
        <div className="ae-acts">
          <button type="button" className="soft" disabled={!ready || busy} onClick={() => save('draft')}>Enregistrer en brouillon</button>
          <button type="button" className="primary" disabled={!ready || busy} onClick={() => save('published')}>
            {busy ? 'Enregistrement…' : 'Publier le cas'}
          </button>
        </div>
        <p className="ae-note">
          Le schéma autorise sept types d’étape et n’en prévoit aucun pour les traitements : une
          prescription se décrit aujourd’hui dans « Examens complémentaires » ou « Diagnostic final ».
        </p>
      </section>
    </div>
  )
}

function StepSection({ kind, label, hint, items, onAdd, onDrop, onMove }) {
  const [txt, setTxt] = useState('')
  return (
    <div className="ae-sec">
      <div className="ae-sec-h">
        <b>{label}</b>
        <span className="muted small">{items.length}</span>
      </div>
      <p className="muted small ae-hint">{hint}</p>
      {!!items.length && (
        <ol className="ae-steps">
          {items.map((t, i) => (
            <li key={`${kind}-${i}`}>
              <span className="ae-t">{t}</span>
              <span className="ae-mini">
                <button type="button" onClick={() => onMove(kind, i, -1)} aria-label={`Monter ${label} ${i + 1}`}>↑</button>
                <button type="button" onClick={() => onMove(kind, i, 1)} aria-label={`Descendre ${label} ${i + 1}`}>↓</button>
                <button type="button" onClick={() => onDrop(kind, i)} aria-label={`Supprimer ${label} ${i + 1}`}>✕</button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <form className="ae-add" onSubmit={e => { e.preventDefault(); onAdd(kind, txt); setTxt('') }}>
        <input value={txt} onChange={e => setTxt(e.target.value)} placeholder={`Ajouter — ${label.toLowerCase()}`} aria-label={`Ajouter une étape ${label}`} />
        <button type="submit" className="soft" disabled={!txt.trim()}>Ajouter</button>
      </form>
    </div>
  )
}
