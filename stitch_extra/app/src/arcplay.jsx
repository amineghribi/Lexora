import React, { useEffect, useRef, useState } from 'react'
import { PageHead } from './shell.jsx'
import { supabase } from './session.js'
import './arcbank.css'
import { listArcCases, getArcCase, arcSuggest, arcAsk, submitArcAttempt, arcCheckCustom, arcMediaUrl, teacherBankQuestions, errorText, DataError } from './data.js'
import { ArcView } from './arc.jsx'
import IMAGES from './arcImages.json'

const eText = e => (e instanceof DataError ? errorText(e) : 'Opération impossible, réessaie.')
const KIND = {
  presentation: ['Présentation', ''],
  history: ['Interrogatoire', 'Tape une question (ex. « fièvre », « tabac »). Les suggestions viennent de ce que tu tapes.'],
  exam: ['Examen clinique', 'Tape la région ou le signe que tu examines (ex. « auscultation »).'],
  investigation: ['Examens complémentaires', 'Tape l’examen que tu demandes (ex. « radio thorax »).'],
  differential: ['Diagnostics différentiels', 'Liste tes hypothèses, avec ce qui plaide pour et contre.'],
  diagnosis: ['Diagnostic final', 'Ton diagnostic retenu.'],
  questions: ['Questions', 'Réponds aux questions liées au cas.'],
}
export const IMAGE_BY_KEY = new Map(IMAGES.map(x => [x.k, x]))
const list = f => Array.isArray(f) ? f : []

// Image de la banque ARC (bucket privé) : lien temporaire demandé à la volée, crédit toujours affiché sous l'image.
export function ArcImage({ k, caption }) {
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState(false)
  const info = IMAGE_BY_KEY.get(k)
  useEffect(() => { let on = true; arcMediaUrl(k).then(u => { if (on) setUrl(u) }).catch(() => { if (on) setErr(true) }); return () => { on = false } }, [k])
  return (
    <figure style={{ margin: '0 0 12px' }}>
      {url ? <img src={url} alt={caption || (info && info.s) || 'Image du cas'} style={{ maxWidth: '100%', borderRadius: 8 }} loading="lazy" /> : <p className="muted small" role="status">{err ? 'Image indisponible.' : 'Chargement de l’image…'}</p>}
      {(caption || (info && info.cr)) && <figcaption className="muted small">{caption}{caption && info && info.cr ? ' · ' : ''}{info && info.cr}</figcaption>}
    </figure>
  )
}
// Les images « apres_reponse » portent déjà la réponse dans l'image : on ne les montre qu'au résultat.
const mediaImages = (media, late) => list(media).filter(m => m.kind === 'image' && ((IMAGE_BY_KEY.get(m.r2_key) || {}).st === 'a') === late)

// Étape « Questions » : questions écrites par l'enseignant (corrigées par le serveur) et lien vers les QCM de la banque.
function CustomQ({ caseId, q }) {
  const [sel, setSel] = useState([])
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const letters = Object.keys(q.o || {}).filter(l => String(q.o[l] || '').trim()).sort()
  const toggle = l => setSel(q.multi ? (sel.includes(l) ? sel.filter(x => x !== l) : [...sel, l]) : [l])
  const check = async () => {
    setBusy(true); setErr('')
    try { setRes(await arcCheckCustom(caseId, q.id, sel)) } catch (e) { setErr(eText(e)) }
    setBusy(false)
  }
  return (
    <div className="card" style={{ margin: '0 0 8px', padding: 10 }}>
      <p style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}><b>{q.q}</b>{q.multi ? <span className="muted small"> (plusieurs réponses possibles)</span> : null}</p>
      {letters.map(l => (
        <label key={l} style={{ display: 'block', margin: '4px 0' }}>
          <input type={q.multi ? 'checkbox' : 'radio'} name={'q-' + q.id} disabled={!!res} checked={sel.includes(l)} onChange={() => toggle(l)} /> <b>{l}.</b> {q.o[l]}
        </label>
      ))}
      {!res && <button type="button" className="primary" disabled={busy || !sel.length} onClick={check}>Vérifier</button>}
      {err && <p className="err" role="alert">{err}</p>}
      {res && <div role="status"><p style={{ margin: '8px 0 0' }}><b>{res.ok ? 'Correct.' : 'Incorrect.'}</b> Bonne réponse : {list(res.correct).join(', ')}</p>{res.explanation && <p className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{res.explanation}</p>}</div>}
    </div>
  )
}
function BankPreview({ ids }) {
  const [items, setItems] = useState(null)
  useEffect(() => { teacherBankQuestions(null, 20, 0, ids).then(r => setItems(r.items || [])).catch(() => setItems([])) }, [ids.join(',')])
  if (!items) return <p className="muted small" role="status">Chargement…</p>
  return <ul className="small" style={{ paddingLeft: 18 }}>{items.map(x => <li key={x.i} style={{ marginBottom: 6 }}>{x.q}</li>)}</ul>
}
function QuestionsStep({ caseId, s, onStart, title, preview }) {
  const bank = list(s.bank), custom = list(s.custom)
  return (
    <div>
      <p className="muted small">{KIND.questions[1]}</p>
      {custom.map(q => <CustomQ key={q.id} caseId={caseId} q={q} />)}
      {bank.length > 0 && (preview
        ? <div><p className="small"><b>{bank.length} question{bank.length > 1 ? 's' : ''} de la banque</b> (aperçu enseignant : énoncés seulement)</p><BankPreview ids={bank} /></div>
        : <div className="card" style={{ margin: 0, padding: 10 }}>
            <p style={{ margin: '0 0 8px' }}><b>{bank.length} QCM de la banque</b> sur ce cas. Ils s’ouvrent dans le mode QCM : reviens ensuite reprendre le cas.</p>
            <button type="button" className="primary" disabled={!onStart} onClick={() => onStart({ title: (title || 'Cas clinique') + ' : QCM', ids: bank, mode: 'immediate', kind: 'custom' })}>Faire ces QCM</button>
          </div>)}
    </div>
  )
}

// Étape de recherche (interrogatoire, examen, examens complémentaires) : texte libre, suggestions, réponse par défaut si hors sujet.
function AskStep({ caseId, kind, log, setLog }) {
  const [q, setQ] = useState('')
  const [sug, setSug] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const seq = useRef(0)
  useEffect(() => {
    const n = ++seq.current
    if (q.trim().length < 2) { setSug([]); return undefined }
    const t = setTimeout(() => { arcSuggest(caseId, kind, q).then(r => { if (n === seq.current) setSug(r || []) }).catch(() => {}) }, 250)
    return () => clearTimeout(t)
  }, [q])
  const ask = async text => {
    const t = text.trim(); if (!t || busy) return
    setBusy(true); setErr('')
    try {
      const r = await arcAsk(caseId, kind, t)
      setLog(l => [...l, { q: t, a: r.value, id: r.matched ? r.id : null }])
      setQ(''); setSug([])
    } catch (e) { setErr(eText(e)) }
    setBusy(false)
  }
  return (
    <div>
      <p className="muted small">{KIND[kind][1]}</p>
      <form className="row" onSubmit={e => { e.preventDefault(); ask(q) }} style={{ gap: 8 }}>
        <input value={q} onChange={e => setQ(e.target.value)} maxLength={200} aria-label={KIND[kind][0]} autoComplete="off" style={{ flex: 1, minWidth: 0 }} />
        <button type="submit" className="primary" disabled={busy || !q.trim()}>Demander</button>
      </form>
      {sug.length > 0 && <div className="chips" style={{ marginTop: 8 }}>{sug.map(s => <button key={s.id} type="button" className="chip" onClick={() => ask(s.label)}>{s.label}</button>)}</div>}
      {err && <p className="err" role="alert">{err}</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 6 }}>
        {log.map((x, i) => <li key={i} className="card" style={{ margin: 0, padding: 10 }}><b>{x.q}</b><div>{x.a}</div></li>)}
      </ul>
    </div>
  )
}

function Differential({ items, setItems }) {
  const set = (i, v) => setItems(items.map((x, j) => j === i ? v : x))
  return (
    <div>
      <p className="muted small">{KIND.differential[1]}</p>
      {items.map((d, i) => (
        <div key={i} className="row" style={{ gap: 8, marginBottom: 6 }}>
          <input value={d} onChange={e => set(i, e.target.value)} maxLength={120} aria-label={`Hypothèse ${i + 1}`} style={{ flex: 1, minWidth: 0 }} />
          <button type="button" className="ghost" aria-label="Retirer" onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="ghost" disabled={items.length >= 8} onClick={() => setItems([...items, ''])}>+ Ajouter une hypothèse</button>
    </div>
  )
}

function Result({ r, onBack, media }) {
  const comps = r.components && typeof r.components === 'object' ? Object.entries(r.components) : []
  const NAMES = { history: 'Interrogatoire', exam: 'Examen', investigation: 'Examens compl.', differential: 'Différentiels', diagnosis: 'Diagnostic' }
  const fb = list(r.feedback).filter(x => x && ((x.missed && x.missed.length) || x.explanation || (x.kind === 'diagnosis' && x.accepted && x.accepted.length)))
  const missedText = (k, m) => k === 'differential' ? m.map(e => e.dx).join(', ') : m.join(', ')
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{r.pct} %</h2>
      <p>{r.dx_ok === true ? 'Diagnostic correct.' : r.dx_ok === false ? 'Diagnostic à revoir.' : ''}{r.preview ? ' (aperçu enseignant : non enregistré)' : ''}</p>
      {comps.length > 0 && <ul>{comps.map(([k, v]) => <li key={k}>{NAMES[k] || k} : {Math.round(Number(v) * 100)} %</li>)}</ul>}
      {fb.map((x, i) => (
        <div key={i} style={{ marginTop: 8 }}>
          <b>{(KIND[x.kind] || [x.kind])[0]}</b>
          {x.missed && x.missed.length > 0 && <div className="small">À ne pas oublier : {missedText(x.kind, x.missed)}</div>}
          {x.kind === 'diagnosis' && x.accepted && x.accepted.length > 0 && <div className="small">Diagnostic attendu : {x.accepted.join(' / ')}</div>}
          {x.explanation && <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{x.explanation}</div>}
        </div>
      ))}
      {mediaImages(media, true).length > 0 && <div style={{ marginTop: 12 }}>{mediaImages(media, true).map(m => <ArcImage key={m.r2_key} k={m.r2_key} caption={m.caption} />)}</div>}
      <div className="row" style={{ marginTop: 12 }}><button type="button" className="primary" onClick={onBack}>Retour aux cas</button></div>
    </div>
  )
}

// L'auteur reçoit ses étapes complètes (payload, clés) ; l'élève seulement le texte. Le lecteur n'a besoin que de la vue élève :
// on ramène l'étape de l'auteur à cette vue (texte de présentation, questions sans les bonnes réponses).
function playable(c) {
  return { ...c, steps: list(c.steps).map(s => {
    if (!s.payload) return s
    const p = s.payload || {}
    if (s.kind === 'presentation') return { rank: s.rank, kind: s.kind, text: p.text }
    if (s.kind === 'questions') return { rank: s.rank, kind: s.kind, bank: list(p.bank), custom: list(p.custom).map(q => ({ id: q.id, q: q.q, o: q.o, multi: list(q.correct).length > 1 })) }
    return { rank: s.rank, kind: s.kind }
  }) }
}
export function CasePlayer({ id, onExit, onStart, preview }) {
  const [c, setC] = useState(null)
  const [err, setErr] = useState('')
  const [i, setI] = useState(0)
  const [logs, setLogs] = useState({ history: [], exam: [], investigation: [] })
  const [dx, setDx] = useState([''])
  const [final, setFinal] = useState('')
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { getArcCase(id).then(x => setC(playable(x))).catch(e => setErr(eText(e))) }, [id])
  if (err) return <div className="card"><p role="alert">{err}</p><button type="button" onClick={onExit}>Retour</button></div>
  if (!c) return <div className="card"><p className="muted" role="status">Chargement…</p></div>
  if (res) return <Result r={res} onBack={onExit} media={c.media} />
  const steps = c.steps || []
  const s = steps[i]
  if (!s) return <div className="card"><p>Ce cas n’a pas d’étapes.</p><button type="button" onClick={onExit}>Retour</button></div>
  const last = i === steps.length - 1
  const ids = k => logs[k].filter(x => x.id).map(x => x.id)
  const setLog = k => f => setLogs(l => ({ ...l, [k]: f(l[k]) }))
  const submit = async () => {
    setBusy(true); setErr('')
    try {
      setRes(await submitArcAttempt(id, { history: ids('history'), exam: ids('exam'), investigation: ids('investigation'), differential: dx.map(x => x.trim()).filter(Boolean), diagnosis: final.trim() }))
    } catch (e) { setErr(eText(e)) }
    setBusy(false)
  }
  const next = () => last ? submit() : setI(i + 1)
  const needs = s.kind === 'diagnosis' ? !final.trim() : s.kind === 'differential' ? !dx.some(x => x.trim()) : false
  return (
    <div>
      <div className="page-h">
        <button type="button" className="ghost" onClick={onExit}>← Cas</button>
        <h1>{c.title}</h1>
        <p className="muted small">{c.specialty} · {c.motif} · étape {i + 1}/{steps.length} : {(KIND[s.kind] || [s.kind])[0]}</p>
      </div>
      <div className="card">
        {s.kind === 'presentation' && <div><p style={{ whiteSpace: 'pre-wrap' }}>{s.text}</p>{mediaImages(c.media, false).map(m => <ArcImage key={m.r2_key} k={m.r2_key} caption={m.caption} />)}</div>}
        {s.kind === 'questions' && <QuestionsStep caseId={id} s={s} onStart={onStart} title={c.title} preview={preview} />}
        {['history', 'exam', 'investigation'].includes(s.kind) && <AskStep key={s.kind} caseId={id} kind={s.kind} log={logs[s.kind]} setLog={setLog(s.kind)} />}
        {s.kind === 'differential' && <Differential items={dx} setItems={setDx} />}
        {s.kind === 'diagnosis' && <div><p className="muted small">{KIND.diagnosis[1]}</p><input value={final} onChange={e => setFinal(e.target.value)} maxLength={200} aria-label="Diagnostic final" style={{ width: '100%' }} /></div>}
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          {i > 0 && <button type="button" className="ghost" onClick={() => setI(i - 1)}>Précédent</button>}
          <button type="button" className="primary" disabled={busy || needs} onClick={next}>{last ? (busy ? 'Envoi…' : 'Terminer') : 'Continuer'}</button>
        </div>
      </div>
    </div>
  )
}

// ARC : cas cliniques servis par le serveur (spécialité > symptôme > cas). Tant qu'aucun cas n'existe, on garde l'ancien module.
/* Entrée ARC quand la base ne sert aucun cas publié : même cadre que le reste de l'application,
   le simulateur reste accessible en un clic. Rien n'est inventé : pas de faux compteurs. */
function ArcEntry({ go, onOpen }) {
  return (
    <div className="arc-bank">
      <div className="arc-hero">
        <div className="arc-hero-txt">
          <span className="arc-eyebrow">ARC — Raisonnement clinique</span>
          <h1>Raisonnement clinique</h1>
          <p>Un patient virtuel au service d’accueil, puis les étapes du dossier : interrogatoire, examen, examens complémentaires, diagnostic différentiel, prise en charge et débriefing. Chaque tentative est notée et conservée.</p>
          <span className="arc-session"><i aria-hidden="true" />Simulateur prêt · session {new Date().getFullYear()}</span>
        </div>
        <div className="arc-kpis" role="list" aria-label="Indicateurs ARC">
          <div className="arc-kpi" role="listitem"><span className="k">Moyenne globale</span><b>—</b><span>aucune tentative</span></div>
          <div className="arc-kpi" role="listitem"><span className="k">Cas résolus</span><b>0</b><span>sur ce compte</span></div>
          <div className="arc-kpi" role="listitem"><span className="k">Meilleur score</span><b>—</b><span>record personnel</span></div>
        </div>
      </div>

      <div className="arc-grid">
        <article className="arc-card2">
          <header><span className="arc-ico" aria-hidden="true">✚</span><span className="arc-tag">Simulateur</span></header>
          <h3>Ouvrir un cas clinique</h3>
          <p className="arc-sum">Le dossier patient complet : constantes, interrogatoire, examen, examens par paliers, ordonnance et bilan.</p>
          <div className="arc-cardfoot"><span>Aucun cas publié en base</span><span className="score">—</span></div>
          <button type="button" className="primary arc-cta" onClick={onOpen}>Démarrer une simulation →</button>
        </article>
        <article className="arc-card2">
          <header><span className="arc-ico" aria-hidden="true">▣</span><span className="arc-tag">Mes bilans</span></header>
          <h3>Historique des tentatives</h3>
          <p className="arc-sum">Retrouve les dossiers déjà travaillés, leur score et les points à revoir.</p>
          <div className="arc-cardfoot"><span>Tentatives conservées</span><span className="score">—</span></div>
          <button type="button" className="soft arc-cta" onClick={() => go({ name: 'history' })}>Voir mon historique →</button>
        </article>
      </div>
    </div>
  )
}

export function ArcHub({ go, specialty, onStart }) {
  const [cases, setCases] = useState(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(null)
  const [legacy, setLegacy] = useState(false)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('all')
  const [tries, setTries] = useState(null)
  // Tentatives du compte : lues une fois, avant tout retour anticipé (règle des hooks).
  useEffect(() => {
    let live = true
    supabase.from('arc_attempts').select('motif,pct').limit(500)
      .then(({ data }) => { if (live && data) setTries(data) })
    return () => { live = false }
  }, [])
  useEffect(() => { listArcCases(null).then(setCases).catch(e => setErr(e instanceof DataError && e.code === 'ARC_ACCESS' ? 'ARC_ACCESS' : eText(e))) }, [])
  if (err === 'ARC_ACCESS') return (
    <div className="card"><b>Réservé aux comptes abonnés.</b>
      <p className="muted">L’ARC (apprentissage par raisonnement clinique) fait partie de l’abonnement.</p>
      <div className="row"><button className="primary" onClick={() => go({ name: 'account' })}>Voir mon abonnement</button></div>
    </div>
  )
  if (err) return <div className="card"><p role="alert">{err}</p></div>
  if (!cases) return <div className="card"><p className="muted" role="status">Chargement…</p></div>
  if (!cases.length) return <ArcEntry go={go} onOpen={() => setLegacy(true)} />
  if (legacy) return <div><div className="row" style={{ margin: '0 0 8px' }}><button type="button" className="ghost" onClick={() => setLegacy(false)}>← Retour aux cas</button></div><ArcView go={go} /></div>
  if (open) return <CasePlayer id={open} onExit={() => setOpen(null)} onStart={onStart} />
  const shown = specialty ? cases.filter(c => c.specialty === specialty) : cases
  const best = new Map()
  const tried = new Set()
  for (const t of tries || []) {
    if (!t || !t.motif) continue
    tried.add(t.motif)
    const v = Number(t.pct) || 0
    if (!best.has(t.motif) || v > best.get(t.motif)) best.set(t.motif, v)
  }
  const avg = tries && tries.length ? Math.round(tries.reduce((a, t) => a + (Number(t.pct) || 0), 0) / tries.length) : null
  const groups = new Map()
  for (const c of shown) {
    const k = c.motif || 'Autres motifs'
    const g = groups.get(k) || { motif: k, sp: c.specialty || '', cases: [] }
    g.cases.push(c)
    groups.set(k, g)
  }
  const specs = [...new Set(shown.map(c => c.specialty).filter(Boolean))]
  const tabs = [['all', `Tous les motifs (${groups.size})`], ...specs.slice(0, 3).map(sp => [sp, sp]), ['todo', 'Cas non résolus']]
  const needle = q.trim().toLowerCase()
  const list = [...groups.values()].filter(g => {
    if (tab === 'todo' && tried.has(g.motif)) return false
    if (tab !== 'all' && tab !== 'todo' && g.sp !== tab) return false
    if (needle && !`${g.motif} ${g.sp} ${g.cases.map(c => c.title).join(' ')}`.toLowerCase().includes(needle)) return false
    return true
  })

  return (
    <div className="arc-bank">
      <div className="arc-hero">
        <div className="arc-hero-txt">
          <span className="arc-eyebrow">ARC — Raisonnement clinique</span>
          <h1>Banque de cas cliniques : choisissez un motif d’admission</h1>
          <p>Interroge, examine, demande les examens complémentaires, puis conclus. Chaque tentative est notée et conservée.</p>
          <span className="arc-session"><i aria-hidden="true" />Simulateur prêt · session {new Date().getFullYear()}</span>
        </div>
        <div className="arc-kpis" role="list" aria-label="Indicateurs ARC">
          <div className="arc-kpi" role="listitem">
            <span className="k">Moyenne globale</span>
            <b>{avg === null ? '—' : `${avg} %`}</b>
            <span>{tries ? tries.length : 0} tentative{(tries ? tries.length : 0) > 1 ? 's' : ''}</span>
          </div>
          <div className="arc-kpi" role="listitem">
            <span className="k">Cas résolus</span>
            <b>{tried.size} / {cases.length}</b>
            <span>motifs travaillés</span>
          </div>
          <div className="arc-kpi" role="listitem">
            <span className="k">Meilleur score</span>
            <b>{best.size ? `${Math.max(...best.values())} %` : '—'}</b>
            <span>record personnel</span>
          </div>
        </div>
      </div>

      <div className="arc-filters">
        <label className="arc-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un motif ou un cas" aria-label="Rechercher un motif" />
        </label>
        <div className="arc-tabs" role="tablist" aria-label="Filtres">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`arc-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        <div className="arc-filter-actions">
          {specialty && <button type="button" className="ghost" onClick={() => go({ name: 'arc' })}>Toutes les spécialités</button>}
          <button type="button" className="ghost" onClick={() => setLegacy(true)}>Simulateur historique</button>
        </div>
      </div>

      {!list.length && <p className="muted">Aucun motif ne correspond à ce filtre.</p>}
      <div className="arc-grid">
        {list.map(g => (
          <article key={g.motif} className="arc-card2">
            <header>
              <span className="arc-ico" aria-hidden="true">✚</span>
              {best.has(g.motif)
                ? <span className="arc-tag">Meilleur : {best.get(g.motif)} %</span>
                : <span className="arc-tag hot">Non commencé</span>}
            </header>
            <div className="arc-subtags">
              <span className="arc-tag sp">{g.sp || 'ARC'}</span>
              <span className="arc-tag">{tried.has(g.motif) ? 'Reprise' : 'Nouveau'}</span>
            </div>
            <h3>{g.motif}</h3>
            <p className="arc-sum">{g.cases.map(c => c.title).slice(0, 2).join(' · ')}</p>
            <div className="arc-cardfoot">
              <span>{g.cases.length} patient{g.cases.length > 1 ? 's' : ''} disponible{g.cases.length > 1 ? 's' : ''}</span>
              <span className="score">{best.has(g.motif) ? `Meilleur : ${best.get(g.motif)} %` : '—'}</span>
            </div>
            <button type="button" className="primary arc-cta" onClick={() => go({ name: 'arc-case', caseId: g.cases[0].id })}>Sélectionner ce motif →</button>
          </article>
        ))}
      </div>
    </div>
  )
}
