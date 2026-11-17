import React, { useEffect, useMemo, useState } from 'react'
import { getArcCase, arcSuggest, arcAsk, arcCaseRegions, arcMediaUrl, arcDifferential, arcDifferentialGrade, arcDiagnosis, arcDiagnosisGrade, arcTreatment, arcTreatmentGrade, arcDebrief, errorText, DataError } from './data.js'
import { EmptyState } from './shell.jsx'
import { DebriefPanels, DebriefPage } from './arcdebrief.jsx'
import './arccase.css'

/* ===== Écran ARC — dossier patient / présentation (maquette « Aux urgences ») =====
   Source unique : `arc_cases` + `arc_case_steps` via la RPC `get_arc_case(id)`.
   Ce que la RPC expose à l'élève : titre, motif, spécialité, niveau, et pour chaque étape son
   rang, son type et — pour la présentation — le texte. Aucune donnée inventée : les constantes
   vitales ne s'affichent que si la case les porte (`vitals`). */

const KIND_LABEL = {
  presentation: 'Présentation',
  history: 'Interrogatoire',
  exam: 'Examen clinique',
  investigation: 'Examens complémentaires',
  differential: 'Différentiel',
  diagnosis: 'Diagnostic',
  prescription: 'Ordonnance',
  bilan: 'Bilan',
}
const KIND_ORDER = ['presentation', 'history', 'exam', 'investigation', 'differential', 'diagnosis', 'prescription']
const VITALS = [
  ['pa', 'PA', 'mmHg'],
  ['fc', 'FC', '/min'],
  ['fr', 'FR', '/min'],
  ['spo2', 'SpO₂', '%'],
  ['temp', 'Température', '°C'],
]

/* Étape « Interrogatoire » : l'élève tape ses questions, la RPC `arc_ask` répond avec la réponse
   du patient (ou la réponse par défaut du cas), et `arc_suggest` propose les questions du dossier. */
function HistoryStep({ caseId, onCollect }) {
  const [msgs, setMsgs] = useState([])
  const [q, setQ] = useState('')
  const [sug, setSug] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) { setSug([]); return }
      arcSuggest(caseId, 'history', q.trim()).then(list => setSug(Array.isArray(list) ? list.slice(0, 6) : [])).catch(() => setSug([]))
    }, 220)
    return () => clearTimeout(t)
  }, [q, caseId])

  const ask = async text => {
    const t = String(text || '').trim()
    if (!t || busy) return
    setBusy(true); setSug([])
    setMsgs(m => [...m, { who: 'me', text: t }])
    setQ('')
    try {
      const r = await arcAsk(caseId, 'history', t)
      const answer = r && r.value ? r.value : 'Non.'
      setMsgs(m => [...m, { who: 'pt', text: answer, matched: !!(r && r.matched) }])
      onCollect && onCollect(t)
    } catch (e) {
      setMsgs(m => [...m, { who: 'pt', text: 'Réponse indisponible pour le moment.' }])
    } finally { setBusy(false) }
  }

  return (
    <div className="ac-chat">
      <div className="ac-log" aria-live="polite">
        {!msgs.length && (
          <p className="ac-hint">Pose tes questions au patient : antécédents, traitement, circonstances, douleur. Les questions du dossier apparaissent au fil de la frappe.</p>
        )}
        {msgs.map((m, i) => (
          <p key={i} className={`ac-msg ${m.who}`}>{m.text}</p>
        ))}
        {busy && <p className="ac-hint">Le patient répond…</p>}
      </div>

      {sug.length > 0 && (
        <ul className="ac-sug" aria-label="Questions du dossier">
          {sug.map(x => <li key={x.id}><button type="button" onClick={() => ask(x.label)}>{x.label}</button></li>)}
        </ul>
      )}

      <form className="ac-ask" onSubmit={e => { e.preventDefault(); ask(q) }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ex. depuis quand avez-vous mal ?" aria-label="Poser une question au patient" />
        <button type="submit" className="primary" disabled={!q.trim() || busy}>Demander</button>
      </form>
    </div>
  )
}

/* Étape « Examen clinique » : régions du corps fournies par le cas (`arc_case_regions`), constat
   par région obtenu par `arc_ask(kind='exam')`, et auscultation quand le cas porte un audio. */
function ExamStep({ caseId, media, onCollect }) {
  const [regions, setRegions] = useState([])
  const [seen, setSeen] = useState([])
  const [q, setQ] = useState('')
  const [sug, setSug] = useState([])
  const [busy, setBusy] = useState(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [audioName, setAudioName] = useState('')
  const [audioErr, setAudioErr] = useState('')

  useEffect(() => {
    let live = true
    arcCaseRegions(caseId).then(list => { if (live) setRegions(Array.isArray(list) ? list : []) }).catch(() => { if (live) setRegions([]) })
    return () => { live = false }
  }, [caseId])

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) { setSug([]); return }
      arcSuggest(caseId, 'exam', q.trim()).then(l => setSug(Array.isArray(l) ? l.slice(0, 6) : [])).catch(() => setSug([]))
    }, 220)
    return () => clearTimeout(t)
  }, [q, caseId])

  const audios = (media || []).filter(m => m.kind === 'audio')

  const look = async label => {
    const t = String(label || '').trim()
    if (!t || busy) return
    setBusy(t); setSug([]); setQ('')
    try {
      const r = await arcAsk(caseId, 'exam', t)
      setSeen(prev => [...prev.filter(x => x.region !== t), { region: t, text: (r && r.value) || 'Examen normal.', matched: !!(r && r.matched) }])
      onCollect && onCollect(t)
    } catch (e) {
      setSeen(prev => [...prev, { region: t, text: 'Constat indisponible pour le moment.' }])
    } finally { setBusy(null) }
  }

  const play = async m => {
    setAudioErr('')
    try { const u = await arcMediaUrl(m.r2_key); setAudioUrl(u); setAudioName(m.caption || 'Auscultation') }
    catch (e) { setAudioErr(errorText(e)) }
  }

  return (
    <div className="ac-exam">
      <div className="ac-block">
        <span className="ac-label">Régions à examiner</span>
        {regions.length === 0
          ? <p className="ac-hint">Ce cas ne déclare pas encore de régions : tape directement un geste (« auscultation cardiaque »).</p>
          : (
            <ul className="ac-regions">
              {regions.map(r => (
                <li key={r.id}>
                  <button type="button" className={`ac-region${seen.some(x => x.region === r.label) ? ' done' : ''}`}
                    disabled={busy === r.label} onClick={() => look(r.label)}>
                    {r.label}{seen.some(x => x.region === r.label) ? ' ✓' : ''}
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>

      {seen.length > 0 && (
        <div className="ac-block">
          <span className="ac-label">Constats</span>
          <ul className="ac-findings">
            {seen.map(x => (
              <li key={x.region}><b>{x.region}</b><p>{x.text}</p></li>
            ))}
          </ul>
        </div>
      )}

      {audios.length > 0 && (
        <div className="ac-block">
          <span className="ac-label">Auscultation</span>
          <div className="ac-audio">
            {audios.map(m => (
              <button key={m.id} type="button" className="soft" onClick={() => play(m)}>▶ Écouter {m.caption || 'l’auscultation'}</button>
            ))}
            {audioUrl && <audio controls autoPlay src={audioUrl} aria-label={audioName} />}
            {audioErr && <p className="ac-hint" role="alert">{audioErr}</p>}
          </div>
        </div>
      )}

      {sug.length > 0 && (
        <ul className="ac-sug" aria-label="Gestes du dossier">
          {sug.map(x => <li key={x.id}><button type="button" onClick={() => look(x.label)}>{x.label}</button></li>)}
        </ul>
      )}

      <form className="ac-ask" onSubmit={e => { e.preventDefault(); look(q) }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ex. auscultation pulmonaire" aria-label="Décrire un geste clinique" />
        <button type="submit" className="primary" disabled={!q.trim() || !!busy}>Examiner</button>
      </form>
    </div>
  )
}

/* Étape « Examens complémentaires / DMI » : prescription par saisie (suggestions du dossier),
   résultats texte par examen demandé, et onglet imagerie/ECG alimenté par les médias du cas. */
function InvestigationStep({ caseId, media, onCollect }) {
  const [ordered, setOrdered] = useState([])
  const [q, setQ] = useState('')
  const [sug, setSug] = useState([])
  const [busy, setBusy] = useState(null)
  const [tab, setTab] = useState('results')
  const [imgUrl, setImgUrl] = useState('')
  const [imgLabel, setImgLabel] = useState('')
  const [imgErr, setImgErr] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) { setSug([]); return }
      arcSuggest(caseId, 'investigation', q.trim()).then(l => setSug(Array.isArray(l) ? l.slice(0, 6) : [])).catch(() => setSug([]))
    }, 220)
    return () => clearTimeout(t)
  }, [q, caseId])

  const images = (media || []).filter(m => m.kind === 'image' || m.kind === 'pdf')

  const order = async label => {
    const t = String(label || '').trim()
    if (!t || busy) return
    setBusy(t); setSug([]); setQ('')
    try {
      const r = await arcAsk(caseId, 'investigation', t)
      setOrdered(prev => [...prev.filter(x => x.label !== t), { label: t, text: (r && r.value) || 'Résultat normal.', matched: !!(r && r.matched) }])
      onCollect && onCollect(t)
    } catch (e) {
      setOrdered(prev => [...prev, { label: t, text: 'Résultat indisponible pour le moment.' }])
    } finally { setBusy(null) }
  }

  const openImage = async m => {
    setImgErr('')
    try { const u = await arcMediaUrl(m.r2_key); setImgUrl(u); setImgLabel(m.caption || 'Imagerie') }
    catch (e) { setImgErr(errorText(e)) }
  }

  return (
    <div className="ac-inv">
      <div className="ac-block">
        <span className="ac-label">Prescription</span>
        <form className="ac-ask" onSubmit={e => { e.preventDefault(); order(q) }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ex. troponine, ECG, gazométrie" aria-label="Prescrire un examen" />
          <button type="submit" className="primary" disabled={!q.trim() || !!busy}>Prescrire</button>
        </form>
        {sug.length > 0 && (
          <ul className="ac-sug" aria-label="Examens du dossier">
            {sug.map(x => <li key={x.id}><button type="button" onClick={() => order(x.label)}>{x.label}</button></li>)}
          </ul>
        )}
        {ordered.length > 0 && (
          <ul className="ac-chips">
            {ordered.map(x => <li key={x.label}>{x.label}</li>)}
          </ul>
        )}
      </div>

      <div className="ac-tabs2" role="tablist" aria-label="Résultats">
        <button type="button" role="tab" aria-selected={tab === 'results'} className={tab === 'results' ? 'on' : ''} onClick={() => setTab('results')}>
          Biologie & résultats ({ordered.length})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'imaging'} className={tab === 'imaging' ? 'on' : ''} onClick={() => setTab('imaging')}>
          Imagerie & ECG ({images.length})
        </button>
      </div>

      {tab === 'results' ? (
        ordered.length === 0
          ? <p className="ac-hint">Aucun examen prescrit pour l’instant. Les examens du dossier apparaissent au fil de la frappe.</p>
          : (
            <ul className="ac-results">
              {ordered.map(x => (
                <li key={x.label}><b>{x.label}</b><p>{x.text}</p></li>
              ))}
            </ul>
          )
      ) : (
        <div className="ac-block">
          {images.length === 0
            ? <p className="ac-hint">Ce cas ne contient pas encore d’imagerie.</p>
            : (
              <ul className="ac-thumbs">
                {images.map(m => (
                  <li key={m.id}><button type="button" onClick={() => openImage(m)}>🖼 {m.caption || 'Ouvrir l’image'}</button></li>
                ))}
              </ul>
            )}
          {imgUrl && <figure className="ac-img"><img src={imgUrl} alt={imgLabel} /><figcaption>{imgLabel}</figcaption></figure>}
          {imgErr && <p className="ac-hint" role="alert">{imgErr}</p>}
        </div>
      )}
    </div>
  )
}

/* Étape « Diagnostic différentiel » : matrice pour / neutre / contre par hypothèse, lignes tirées
   des éléments réellement recueillis dans les étapes précédentes. La correction ne s'affiche que
   si le cas porte une matrice de référence (`arc_differential_grade`). */
const VERDICTS = [['P', 'Pour'], ['N', 'Neutre'], ['C', 'Contre']]

function DifferentialStep({ caseId, collected }) {
  const [hyp, setHyp] = useState(null)
  const [cells, setCells] = useState({})
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    arcDifferential(caseId)
      .then(d => { if (live) setHyp(d && Array.isArray(d.hypotheses) ? d.hypotheses : []) })
      .catch(e => { if (live) { setHyp([]); setErr(e instanceof DataError && e.code === 'ARC_ACCESS' ? 'ARC_ACCESS' : errorText(e)) } })
    return () => { live = false }
  }, [caseId])

  const key = (h, item) => `${h}||${item}`
  const cycle = (h, item) => {
    const k = key(h, item)
    const cur = cells[k] || 'N'
    const next = cur === 'N' ? 'P' : cur === 'P' ? 'C' : 'N'
    setCells(c => ({ ...c, [k]: next }))
    setRes(null)
  }

  const grade = async () => {
    if (busy) return
    setBusy(true)
    try {
      const payload = []
      for (const [k, v] of Object.entries(cells)) {
        const [h, item] = k.split('||')
        payload.push({ dx: h, item, v })
      }
      setRes(await arcDifferentialGrade(caseId, payload))
    } catch (e) { setErr(errorText(e)) } finally { setBusy(false) }
  }

  if (hyp === null) return <p className="ac-hint">Chargement des hypothèses…</p>
  if (!hyp.length) return <p className="ac-hint">Ce cas ne déclare pas d’hypothèses différentielles.</p>

  return (
    <div className="ac-diff">
      {collected.length === 0 ? (
        <p className="ac-hint">Aucun élément recueilli : passe d’abord par l’interrogatoire, l’examen et les examens complémentaires. Les lignes de la matrice se remplissent avec ce que tu as trouvé.</p>
      ) : (
        <div className="ac-matrix-wrap">
          <table className="ac-matrix">
            <thead>
              <tr>
                <th>Élément recueilli</th>
                {hyp.map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {collected.map(c => (
                <tr key={c.label}>
                  <th scope="row">{c.label}<small>{c.kind === 'history' ? 'interrogatoire' : c.kind === 'exam' ? 'examen' : 'complémentaire'}</small></th>
                  {hyp.map(h => {
                    const v = cells[key(h, c.label)] || 'N'
                    return (
                      <td key={h}>
                        <button type="button" className={`ac-cell v${v}`} onClick={() => cycle(h, c.label)}
                          aria-label={`${h} — ${c.label} : ${v === 'P' ? 'pour' : v === 'C' ? 'contre' : 'neutre'}`}>
                          {v === 'P' ? '＋' : v === 'C' ? '−' : '·'}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="ac-legend">
        {VERDICTS.map(([k, label]) => <span key={k} className={`ac-cell v${k}`} aria-hidden="true">{k === 'P' ? '＋' : k === 'C' ? '−' : '·'}</span>)}
        <span className="ac-hint">Pour · Neutre · Contre — cliquer une case la fait tourner.</span>
      </div>

      <div className="ac-diff-actions">
        <button type="button" className="primary" onClick={grade} disabled={busy || !Object.keys(cells).length}>Corriger ma matrice</button>
      </div>

      {res && (res.graded
        ? <p className="ac-result-line">Correction : <b>{res.correct}/{res.total}</b> cases justes ({res.pct} %).</p>
        : <p className="ac-hint">Ce cas ne fournit pas de matrice de référence : ta matrice reste enregistrée localement, sans note.</p>)}
      {err && err !== 'ARC_ACCESS' && <p className="ac-hint" role="alert">{err}</p>}
    </div>
  )
}

/* Étape « Diagnostic final » : scores de risque déclarés par le cas, formulation retenue et
   justification structurée en piliers. La correction vient du serveur (`arc_diagnosis_grade`),
   qui ne renvoie la formulation attendue qu'en cas d'échec. */
function DiagnosisStep({ caseId }) {
  const [info, setInfo] = useState(null)
  const [text, setText] = useState('')
  const [pillars, setPillars] = useState(['', '', '', ''])
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    arcDiagnosis(caseId)
      .then(d => { if (live) setInfo(d || { scores: [], pillars: [], has_step: false }) })
      .catch(e => { if (live) { setInfo({ scores: [], pillars: [], has_step: false }); setErr(errorText(e)) } })
    return () => { live = false }
  }, [caseId])

  const labels = (info && Array.isArray(info.pillars) && info.pillars.length ? info.pillars : ['Clinique', 'ECG', 'Biologie', 'Risque']).slice(0, 4)

  const submit = async e => {
    e.preventDefault()
    if (busy || text.trim().length < 3) return
    setBusy(true); setErr('')
    try { setRes(await arcDiagnosisGrade(caseId, text.trim(), pillars)) }
    catch (er) { setErr(errorText(er)) } finally { setBusy(false) }
  }

  if (!info) return <p className="ac-hint">Chargement…</p>

  return (
    <div className="ac-diag">
      {Array.isArray(info.scores) && info.scores.length > 0 && (
        <div className="ac-block">
          <span className="ac-label">Scores de risque</span>
          <ul className="ac-scores">
            {info.scores.map((s, i) => (
              <li key={i}><span>{s.label || s.name}</span><b>{s.value ?? s.score}</b>{s.note && <small>{s.note}</small>}</li>
            ))}
          </ul>
        </div>
      )}

      <form className="ac-diag-form" onSubmit={submit}>
        <div className="ac-block">
          <span className="ac-label">Formulation retenue</span>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={2}
            placeholder="Ex. Syndrome coronarien aigu avec sus-décalage persistant du segment ST, topographie antérieure étendue" />
        </div>

        <div className="ac-block">
          <span className="ac-label">Justification structurée</span>
          <ul className="ac-pillars">
            {labels.map((lab, i) => (
              <li key={lab}>
                <span>{lab}</span>
                <textarea rows={2} value={pillars[i]} onChange={e => { const n = [...pillars]; n[i] = e.target.value; setPillars(n) }}
                  placeholder={`Argument ${lab.toLowerCase()}`} aria-label={`Justification ${lab}`} />
              </li>
            ))}
          </ul>
        </div>

        <div className="ac-diag-actions">
          <button type="submit" className="primary" disabled={busy || text.trim().length < 3}>Valider le diagnostic</button>
        </div>
      </form>

      {res && (
        <div className={`ac-verdict ${res.accepted ? 'ok' : 'ko'}`} role="status">
          <b>{res.accepted ? 'Diagnostic retenu' : 'Diagnostic non retenu'}</b>
          {!res.accepted && Array.isArray(res.expected) && res.expected.length > 0 && (
            <p>Formulation attendue : {res.expected.join(' · ')}</p>
          )}
          <p className="ac-hint">Justification : {res.pillars_filled} pilier(s) renseigné(s) sur {res.pillars_total}.</p>
        </div>
      )}
      {err && <p className="ac-hint" role="alert">{err}</p>}
    </div>
  )
}

/* Étape « Ordonnance / thérapeutique » : prescription par classes depuis le catalogue du cas,
   doses et voix d'administration affichées, correction serveur des items retenus, et liaison
   salle de cathétérisme quand le cas la déclare. */
function TreatmentStep({ caseId }) {
  const [data, setData] = useState(null)
  const [sel, setSel] = useState([])
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    arcTreatment(caseId)
      .then(d => { if (live) setData(d || { catalogue: [], cathlab: null }) })
      .catch(e => { if (live) { setData({ catalogue: [], cathlab: null }); setErr(errorText(e)) } })
    return () => { live = false }
  }, [caseId])

  const groups = useMemo(() => {
    const cat = (data && Array.isArray(data.catalogue)) ? data.catalogue : []
    const map = new Map()
    for (const it of cat) {
      if (it && Array.isArray(it.items)) { map.set(it.class || 'Traitements', it.items); continue }
      const cls = (it && (it.class || it.classe)) || 'Traitements'
      if (!map.has(cls)) map.set(cls, [])
      map.get(cls).push(it)
    }
    return [...map.entries()]
  }, [data])

  const toggle = id => {
    setRes(null)
    setSel(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const submit = async e => {
    e.preventDefault()
    if (busy || !sel.length) return
    setBusy(true); setErr('')
    try { setRes(await arcTreatmentGrade(caseId, sel)) }
    catch (er) { setErr(errorText(er)) } finally { setBusy(false) }
  }

  if (!data) return <p className="ac-hint">Chargement de l’ordonnance…</p>
  if (!groups.length) return <p className="ac-hint">Ce cas ne déclare pas encore d’ordonnance type.</p>

  const cath = data.cathlab && typeof data.cathlab === 'object' ? data.cathlab : null

  return (
    <form className="ac-rx" onSubmit={submit}>
      {groups.map(([cls, items]) => (
        <fieldset key={cls} className="ac-rx-class">
          <legend>{cls}</legend>
          <ul>
            {items.map(it => {
              const on = sel.includes(it.id)
              return (
                <li key={it.id}>
                  <label className={on ? 'on' : ''}>
                    <input type="checkbox" checked={on} onChange={() => toggle(it.id)} />
                    <span className="lbl">{it.label}</span>
                    {it.dose && <span className="dose">{it.dose}</span>}
                    {it.route && <span className="route">{it.route}</span>}
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>
      ))}

      {cath && (
        <div className="ac-cath">
          <span className="ac-label">Liaison salle de cathétérisme</span>
          <ul>
            {cath.site && <li>Site d’abord : <b>{cath.site}</b></li>}
            {cath.team && <li>Équipe : <b>{cath.team}</b></li>}
            {cath.status && <li>Statut : <b>{cath.status}</b></li>}
          </ul>
        </div>
      )}

      <div className="ac-diag-actions">
        <button type="submit" className="primary" disabled={busy || !sel.length}>Valider l’ordonnance ({sel.length})</button>
      </div>

      {res && (res.graded ? (
        <div className={`ac-verdict ${res.pct >= 80 ? 'ok' : 'ko'}`} role="status">
          <b>{res.correct}/{res.total} traitements attendus prescrits ({res.pct} %)</b>
          {Array.isArray(res.missing) && res.missing.length > 0 && <p>Manquants : {res.missing.join(' · ')}</p>}
          {Array.isArray(res.extra) && res.extra.length > 0 && <p className="ac-hint">En trop : {res.extra.join(' · ')}</p>}
        </div>
      ) : <p className="ac-hint">Ce cas ne fournit pas d’ordonnance de référence : ta prescription reste locale, sans note.</p>)}
      {err && <p className="ac-hint" role="alert">{err}</p>}
    </form>
  )
}

/* Étape « Débriefing / bilan » : score final du dernier passage, points sauvegardés par composante,
   et chronologie des étapes face au barème (explications servies par `arc_debrief`). */
const COMP_LABEL = { history: 'Interrogatoire', exam: 'Examen', investigation: 'Examens', differential: 'Différentiel', diagnosis: 'Diagnostic' }

function DebriefStep({ caseId, go }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    arcDebrief(caseId).then(x => { if (live) setD(x || { attempt: null, steps: [] }) })
      .catch(e => { if (live) { setD({ attempt: null, steps: [] }); setErr(errorText(e)) } })
    return () => { live = false }
  }, [caseId])

  if (!d) return <p className="ac-hint">Chargement du bilan…</p>
  if (!d.attempt) {
    return (
      <div className="ac-debrief">
        <p className="ac-hint">Aucun bilan enregistré pour ce cas : termine une tentative, la correction s’affichera ici.</p>
        <button type="button" className="soft" onClick={() => go({ name: 'history' })}>Voir mon historique →</button>
      </div>
    )
  }

  const pct = Number(d.attempt.pct) || 0
  return (
    <div className="ac-debrief">
      <div className="ac-score-end">
        <div className={`ac-dial ${pct >= 70 ? 'ok' : pct >= 40 ? 'mid' : 'ko'}`}>
          <b>{pct}</b><small>/100</small>
        </div>
        <div className="ac-score-txt">
          <b>{pct >= 70 ? 'Mention très bien' : pct >= 40 ? 'Passable' : 'À retravailler'}</b>
          <span className="ac-hint">Diagnostic final {d.attempt.dx_ok ? 'retenu' : 'non retenu'} · bilan du {new Date(d.attempt.at).toLocaleDateString('fr-FR')}</span>
        </div>
      </div>
      <DebriefPanels attempt={d.attempt} steps={d.steps} />
      {err && <p className="ac-hint" role="alert">{err}</p>}
    </div>
  )
}

export function ArcCase({ caseId, go }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [step, setStep] = useState('presentation')
  const [collected, setCollected] = useState([])
  const collect = (kind, label) => setCollected(c => (c.some(x => x.label === label) ? c : [...c, { kind, label }]))

  useEffect(() => {
    let live = true
    getArcCase(caseId).then(d => { if (live) setData(d) })
      .catch(e => { if (live) setErr(e instanceof DataError && e.code === 'ARC_ACCESS' ? 'ARC_ACCESS' : errorText(e)) })
    return () => { live = false }
  }, [caseId])

  const steps = useMemo(() => (data && Array.isArray(data.steps) ? data.steps : []), [data])
  const present = useMemo(() => steps.find(s => s.kind === 'presentation') || null, [steps])
  const kinds = useMemo(() => {
    const fromCase = KIND_ORDER.filter(k => k !== 'prescription' && steps.some(s => s.kind === k))
    return steps.some(s => s.kind === 'diagnosis') ? [...fromCase, 'prescription', 'bilan'] : fromCase
  }, [steps])
  const vitals = (data && data.vitals) || (present && present.vitals) || null

  if (err === 'ARC_ACCESS') {
    return (
      <EmptyState icon="arc" title="ARC réservé aux abonnés"
        text="Le raisonnement clinique fait partie de l’abonnement."
        primary={{ label: 'Voir mon abonnement', onClick: () => go({ name: 'account' }) }} />
    )
  }
  if (err) return <div className="card"><p role="alert">{err}</p></div>
  if (!data) return <div className="card" role="status">Chargement du dossier…</div>

  if (step === 'bilan') return <DebriefPage caseId={data.id || caseId} go={go} />

  return (
    <div className="ac">
      <div className="ac-top">
        <button type="button" className="ghost ac-back" onClick={() => go({ name: 'arc' })}>← Toutes les banques</button>
        <span className="ac-crumb">{data.specialty}{data.motif ? ` · ${data.motif}` : ''}</span>
        <span className="ac-badge">{data.level || 'ARC'}</span>
      </div>

      <nav className="ac-tabs" aria-label="Étapes du cas">
        {kinds.map((k, i) => (
          <button key={k} type="button" className={`ac-tab${step === k ? ' on' : ''}`}
            aria-current={step === k ? 'step' : undefined} onClick={() => setStep(k)}>
            <span className="n">{i + 1}</span>{KIND_LABEL[k]}
          </button>
        ))}
      </nav>

      <section className="ac-card">
        <header className="ac-head">
          <div>
            <span className="ac-eyebrow">Dossier patient</span>
            <h1>{data.title || data.motif || 'Cas clinique'}</h1>
          </div>
          <span className="ac-session">ARC · {new Date().getFullYear()}</span>
        </header>

        {vitals && (
          <ul className="ac-vitals" aria-label="Constantes vitales">
            {VITALS.filter(([k]) => vitals[k] !== undefined && vitals[k] !== null).map(([k, label, unit]) => (
              <li key={k}><span>{label}</span><b>{String(vitals[k])}<small>{unit}</small></b></li>
            ))}
          </ul>
        )}

        {step === 'bilan' ? (
          <div className="ac-body"><DebriefStep caseId={data.id || caseId} go={go} /></div>
        ) : step === 'prescription' ? (
          <div className="ac-body"><TreatmentStep caseId={data.id || caseId} /></div>
        ) : step === 'diagnosis' ? (
          <div className="ac-body"><DiagnosisStep caseId={data.id || caseId} /></div>
        ) : step === 'differential' ? (
          <div className="ac-body"><DifferentialStep caseId={data.id || caseId} collected={collected} /></div>
        ) : step === 'investigation' ? (
          <div className="ac-body"><InvestigationStep caseId={data.id || caseId} media={data.media} onCollect={label => collect('investigation', label)} /></div>
        ) : step === 'exam' ? (
          <div className="ac-body"><ExamStep caseId={data.id || caseId} media={data.media} onCollect={label => collect('exam', label)} /></div>
        ) : step === 'history' ? (
          <div className="ac-body"><HistoryStep caseId={data.id || caseId} onCollect={label => collect('history', label)} /></div>
        ) : step === 'presentation' ? (
          <div className="ac-body">
            {present && present.text
              ? <p className="ac-text">{present.text}</p>
              : <p className="muted">La présentation de ce cas n’est pas encore renseignée.</p>}
            {kinds.length > 1 && (
              <button type="button" className="primary ac-cta" onClick={() => setStep(kinds[1])}>
                Commencer {KIND_LABEL[kinds[1]].toLowerCase()} →
              </button>
            )}
          </div>
        ) : (
          <div className="ac-body">
            <EmptyState icon="arc" title={`${KIND_LABEL[step]} — écran en cours de portage`}
              text="Cette étape sera reprise dans le lot suivant du portage Stitch, avec ses données réelles."
              primary={{ label: 'Revenir à la présentation', onClick: () => setStep('presentation') }} />
          </div>
        )}
      </section>
    </div>
  )
}
