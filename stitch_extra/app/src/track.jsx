import React, { useState } from 'react'
import { chooseTrack, errorText, DataError } from './data.js'

export const FACULTIES = [['monastir', 'Monastir'], ['tunis', 'Tunis'], ['sousse', 'Sousse'], ['sfax', 'Sfax']]

// Filtre l'index selon l'espace de l'élève. Le serveur applique la même règle : ce filtre ne sert qu'à ne rien montrer d'inaccessible.
export function scopeIndex(index, scope) {
  if (!index || !scope || !scope.courses) return index
  const ok = new Set(scope.courses)
  const series = (index.series || []).filter(s => s.sn && ok.has(s.sn))
  const ids = new Set(); for (const s of series) for (const q of s.q || []) ids.add(q)
  const pre = {}; for (const k of Object.keys(index.pre || {})) if (ok.has(Number(k))) pre[k] = index.pre[k]
  return {
    ...index,
    subjects: (index.subjects || []).filter(s => ok.has(s.no)),
    series,
    pre,
    cases: (index.cases || []).filter(c => c.length && c.every(q => ids.has(q))),
  }
}

// Parcours DCEM proposés, dans l'ordre d'avancement (le serveur applique la même règle : on n'avance que dans cet ordre).
export const DCEM_TRACKS = [
  { k: 'dcem1', name: 'DCEM1', desc: 'Les cours du programme DCEM1 de ta faculté.' },
  { k: 'dcem2', name: 'DCEM2', desc: 'Les cours du programme DCEM2 de ta faculté.' },
  { k: 'dcem3s1', name: 'DCEM3 · semestre 1', desc: 'Les cours du programme DCEM3 S1 de ta faculté.' },
  { k: 'dcem3', name: 'DCEM3 · semestre 2 (révision)', desc: 'La sélection de révision DCEM3 (synthèse clinique, médecine aiguë), même liste pour toutes les facultés.' },
]
// Inscription : type de compte (étudiant par défaut), niveau, faculté. Le serveur (choose_track) applique les règles à la première connexion.
export const SIGNUP_LEVELS = [
  { k: 'dcem1', name: 'DCEM1' },
  { k: 'dcem2', name: 'DCEM2' },
  { k: 'dcem3s1', name: 'DCEM3 · S1' },
  { k: 'dcem3', name: 'DCEM3 · S2', sub: 'pack Résidanat' },
  { k: 'residanat', name: 'Résidanat' },
]
const FAC_CODES = { monastir: 'FMM', tunis: 'FMT', sousse: 'FMSo', sfax: 'FMSf' }
export const signupChoiceOk = (level, fac) => !!level && (level === 'residanat' || !!fac)
export function AccountTypePicker({ level, setLevel, fac, setFac }) {
  return (
    <fieldset className="fld" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend><b>Type de compte</b></legend>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="primary" aria-pressed="true">Étudiant</button>
        <button type="button" className="ghost" disabled title="Les comptes enseignants sont créés par l’équipe">Enseignant (sur invitation)</button>
      </div>
      <p style={{ margin: '12px 0 6px' }}><b>Ton niveau</b></p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {SIGNUP_LEVELS.map(l => <button key={l.k} type="button" className={level === l.k ? 'primary' : 'ghost'} aria-pressed={level === l.k} onClick={() => setLevel(l.k)}>{l.name}{l.sub ? <span className="small"> ({l.sub})</span> : null}</button>)}
      </div>
      {level && level !== 'residanat' && <>
        <p style={{ margin: '12px 0 6px' }}><b>Ta faculté</b></p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {FACULTIES.map(([k, n]) => <button key={k} type="button" className={fac === k ? 'primary' : 'ghost'} aria-pressed={fac === k} onClick={() => setFac(k)}>{FAC_CODES[k]} · {n}</button>)}
        </div>
      </>}
      <p className="muted small" style={{ marginTop: 8 }}>Ton niveau adapte les cours et les questions. Plus tard, tu pourras seulement passer au niveau suivant (Mon compte), et ta faculté ne change plus.</p>
    </fieldset>
  )
}
export const trackName = k => k === 'residanat' ? 'Résidanat' : (DCEM_TRACKS.find(t => t.k === k) || {}).name || k
export const facultyName = k => (FACULTIES.find(f => f[0] === k) || [])[1] || ''
const needsFaculty = k => k !== 'residanat' && k !== 'dcem3'

function FacultyPicker({ fac, setFac }) {
  return <>
    <p style={{ margin: '12px 0 6px' }}><b>Ta faculté</b></p>
    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
      {FACULTIES.map(([k, n]) => <button key={k} type="button" className={fac === k ? 'primary' : 'ghost'} aria-pressed={fac === k} onClick={() => setFac(k)}>{n}</button>)}
    </div>
  </>
}

// Premier choix de l'espace : Résidanat (tout) ou un parcours DCEM (la liste de ta faculté). Ensuite, l'élève peut seulement avancer (Mon compte).
export function TrackChooser({ onDone, onLater }) {
  const [track, setTrack] = useState('')
  const [fac, setFac] = useState('')
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    setBusy(true); setErr('')
    try { onDone(await chooseTrack(track, fac)) } catch (e) { setErr(e instanceof DataError ? errorText(e) : 'Enregistrement impossible, réessaie.'); setBusy(false) }
  }
  const dcem = track && track !== 'residanat'
  const can = track === 'residanat' || (dcem && (!needsFaculty(track) || fac) && sure)
  return (
    <div role="dialog" aria-modal="true" aria-label="Choisis ton espace" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.55)', padding: 16 }}>
      <section className="card" style={{ maxWidth: 460, width: '100%', maxHeight: '92vh', overflow: 'auto' }}>
        <h2 style={{ marginTop: 0 }}>Tu prépares quoi ?</h2>
        <p className="muted small">Ton choix adapte les questions, les fiches et les vidéos à ton espace.</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <button type="button" className={track === 'residanat' ? 'primary' : 'ghost'} aria-pressed={track === 'residanat'} onClick={() => { setTrack('residanat'); setSure(false) }} style={{ textAlign: 'left' }}>
            <b>Le résidanat</b><br /><span className="small">Toute la banque de questions, tous les cours.</span>
          </button>
          {DCEM_TRACKS.map(t => (
            <button key={t.k} type="button" className={track === t.k ? 'primary' : 'ghost'} aria-pressed={track === t.k} onClick={() => { setTrack(t.k); setSure(false) }} style={{ textAlign: 'left' }}>
              <b>{t.name}</b><br /><span className="small">{t.desc}</span>
            </button>
          ))}
        </div>
        {dcem && needsFaculty(track) && <FacultyPicker fac={fac} setFac={setFac} />}
        {dcem && <label className="small" style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} style={{ marginTop: 3 }} />
          <span>Je comprends que cet espace ne donne pas accès au reste de la banque, que je pourrai seulement passer au parcours suivant (depuis Mon compte), et que je ne pourrai pas revenir au Résidanat sans contacter l’équipe.</span>
        </label>}
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button type="button" className="primary" disabled={!can || busy} onClick={save}>{busy ? 'Enregistrement…' : 'Valider'}</button>
          {onLater && <button type="button" className="ghost" onClick={onLater}>Plus tard</button>}
        </div>
      </section>
    </div>
  )
}

// « Mon compte » : l'élève d'un parcours DCEM passe au parcours suivant (DCEM1 -> DCEM2 -> DCEM3 S1 -> DCEM3 S2). Pas de retour en arrière seul.
export function TrackChange({ scope, onChanged }) {
  const cur = scope && scope.track
  const idx = DCEM_TRACKS.findIndex(t => t.k === cur)
  const [target, setTarget] = useState('')
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')
  if (!scope || !scope.chosen || cur === 'residanat' || idx < 0) return null
  const next = DCEM_TRACKS.slice(idx + 1)
  const save = async () => {
    setBusy(true); setErr(''); setDone('')
    try { const s = await chooseTrack(target, scope.faculty); setDone(`Ton espace est maintenant : ${trackName(target)}.`); setTarget(''); setSure(false); onChanged && onChanged(s) } catch (e) { setErr(e instanceof DataError ? errorText(e) : 'Changement impossible, réessaie.') }
    setBusy(false)
  }
  return (
    <div className="card">
      <h3>Mon espace</h3>
      <p>{trackName(cur)}{scope.faculty ? ` · ${facultyName(scope.faculty)}` : ''}</p>
      {done && <p className="okmsg small" role="status">{done}</p>}
      {next.length ? <>
        <p className="muted small">Tu passes à l’année ou au semestre suivant ? Change ton espace pour retrouver les cours qui correspondent.</p>
        <div style={{ display: 'grid', gap: 8 }}>
          {next.map(t => <button key={t.k} type="button" className={target === t.k ? 'primary' : 'ghost'} aria-pressed={target === t.k} onClick={() => { setTarget(t.k); setSure(false); setErr('') }} style={{ textAlign: 'left' }}><b>{t.name}</b><br /><span className="small">{t.desc}</span></button>)}
        </div>
        {target && <label className="small" style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} style={{ marginTop: 3 }} />
          <span>Je comprends que je ne pourrai pas revenir à l’espace précédent seul(e), et que mon abonnement est lié à mon espace actuel : après le changement, je contacte l’équipe pour l’activer sur le nouvel espace.</span>
        </label>}
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row"><button type="button" className="primary" disabled={!target || !sure || busy} onClick={save}>{busy ? 'Enregistrement…' : 'Changer mon espace'}</button></div>
      </> : <p className="muted small">C’est le dernier espace DCEM. Pour passer au Résidanat, contacte l’équipe.</p>}
    </div>
  )
}
