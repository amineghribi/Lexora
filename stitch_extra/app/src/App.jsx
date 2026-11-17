import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { loadIndex, loadQuestions, useMeta, inDay, getQ, checkAnswers, registerAnswers, choiceStats, errorText, needsLogin } from './data.js'
import { openAuth, supabase } from './session.js'
import { openPdf } from './pdf.js'
import { getAccess, getScope, getInterface, chooseTrack, canonOf } from './data.js'
import { TrackChooser, scopeIndex } from './track.jsx'
import { AccessBanner, PaywallGate, PRICE_MONTH, PRICE_SEMESTER } from './payment.jsx'
import { mergeState, pull, push, canonState } from './sync.js'
import { load, save, record, dueIds, dayKey, tomorrowKey, todayAttempts, sameSet, score, ptsOf } from './store.js'
// La visionneuse PDF (pdf.js, ~600 Ko) n'est chargée qu'à l'ouverture d'un aperçu de cours
const PagePreview = lazy(() => import('./PagePreview.jsx'))
import { ForumView, DiscussToggle } from './forum.jsx'
import StudyTime from './studytime.jsx'
import { AccountView, useAuth } from './auth.jsx'
import { Bell } from './notif.jsx'
import { SuggestButton } from './suggest.jsx'
import { GroupsView } from './groups.jsx'
import { PacksView } from './packs.jsx'
import { Dcem3Home } from './dcem3home.jsx'
import { ArcHub } from './arcplay.jsx'
import { LevelHome } from './level.jsx'
import { TeacherSpace } from './teacher.jsx'
import { weakParts, similarTo, tomorrowPlan, pct, LETTERS, expandCases } from './logic.js'
import { ExamBlanc, Priorities, SearchView } from './extra.jsx'
import { Shell, useObjective } from './shell.jsx'
import { Home } from './home.jsx'
import { ExamsPage } from './exams.jsx'
import { LibraryPage } from './library.jsx'
import { TrainPage } from './train.jsx'
import { TrainCreate } from './traincreate.jsx'
import { TrainSeries } from './trainseries.jsx'
import { QcmScreen } from './qcmcard.jsx'
import { CoursePage } from './coursepage.jsx'
import { VideosList } from './videoslist.jsx'
import { PreReadPage } from './preread.jsx'
import { Flashcards } from './flashcards.jsx'
import { LecturePlayer } from './lecture.jsx'
import { ProfilePage } from './profile.jsx'
import { SettingsPage, readPrefs, applyPrefs } from './settings.jsx'
import { ParrainagePage } from './parrainage.jsx'
import { SubscriptionPage } from './subscription.jsx'
import { ExamSession } from './examsession.jsx'
import { ExamResults } from './examresults.jsx'
import { SearchPage } from './searchpage.jsx'
import { AskModal } from './askmodal.jsx'
import { ReportModal } from './reportmodal.jsx'
import { NotificationsDrawer } from './notifications.jsx'
import { StateBlock } from './states.jsx'
import { AdminReports } from './adminreports.jsx'
import { AdminSuggestions } from './adminsuggestions.jsx'
import { AdminAccess } from './adminaccess.jsx'
import { Amphi } from './amphi.jsx'
import { AmphiProjection } from './amphiproject.jsx'
import { ForumPage } from './forumland.jsx'
import { HistoryPage } from './history.jsx'
import { ArcCase } from './arccase.jsx'
import { ProgressionView } from './progression.jsx'
import { ParcoursView } from './parcours.jsx'

const FAC = { FMT: 'Tunis', FMM: 'Monastir', FMS: 'Sousse', FMSF: 'Sfax' }
const facOf = ex => FAC[String(ex).replace(/\d+$/, '')] || ex
const sessOf = ex => { const m = String(ex).match(/(\d+)$/); return m ? ` (session ${m[1]})` : '' }
const examLabel = s => `${s.y} · ${facOf(s.ex)}${sessOf(s.ex)}`

function CourseToggle({ e }) {
  const [on, setOn] = useState(false)
  return (
    <div className="pvd">
      <button className="ghost" onClick={() => setOn(v => !v)}>{on ? 'Masquer le cours' : `Voir le cours (p.${e.cp[1] || '?'})`}</button>
      {on && <Suspense fallback={<p className="muted">Chargement de l'aperçu…</p>}><PagePreview cp={e.cp} answerTexts={e.c.split('').map(L => e.o[L]).filter(Boolean)} ctxTexts={[e.q, e.w || '', e.pg || '']} /></Suspense>}
    </div>
  )
}

function CourseLink({ cp, children }) {
  if (!cp || !cp[0]) return null
  return <a className="link" href="#" target="_blank" rel="noreferrer" onClick={e => openPdf(e, cp[0], cp[1])}>{children || `Cours p.${cp[1] || '?'}`}</a>
}

function Badge({ e }) {
  if (e.f === 'dis') return <span className="badge warn" title="La clé de réponse est incertaine">⚠ Réponse discutée : la clé peut être fausse</span>
  if (e.f === 'res') return <span className="badge info" title="Clé corrigée après relecture">Clé relue</span>
  return null
}

function DisNote({ e }) {
  if (!e || e.f !== 'dis') return null
  return <div className="dis-note" role="note"><b>Réponse discutée.</b> La clé officielle de cette question est contestée : elle peut contredire le cours ou être invérifiable. Ne l’apprends pas telle quelle : vérifie dans le cours (lien ci-dessous) et lis l’explication.</div>
}

/* ---------- Quiz ---------- */
const fmtPts = x => String(Math.round(x * 100) / 100).replace('.', ',')
const fmtNote = x => String(Math.round(x * 10) / 10).replace('.', ',')
function fmtT(s) { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
// temps actif : on cumule l'écart entre deux actions, plafonné (onglet laissé ouvert = pas de temps compté)
const IDLE_CAP = 120
function touchAct(a) { const n = Date.now(); a.total += Math.min(IDLE_CAP, Math.max(0, (n - a.last) / 1000)); a.last = n }
function Quiz({ index, title, ids, subjectHint, seriesId, mode, duration, state, setState, onFinish, onExit }) {
  const [qs, setQs] = useState(null)
  const t0 = useRef(Date.now())
  const act = useRef({ last: Date.now(), total: 0 })
  const [left, setLeft] = useState(duration ? duration * 60 : null)
  const [i, setI] = useState(0)
  const [sel, setSel] = useState([])
  const [checked, setChecked] = useState(false)
  const [stats, setStats] = useState(null) // { id, pct } : % d'élèves ayant coché chaque proposition
  const saved = useRef(new Map()) // index → { sel, checked, ok } : réponses données, pour pouvoir revenir en arrière
  const [confirmEnd, setConfirmEnd] = useState(false)
  const keys = useRef(null)
  const finishing = useRef(false)
  const [busy, setBusy] = useState(false)
  const [loadErr, setLoadErr] = useState(null)
  const [msg, setMsg] = useState('')
  const [finErr, setFinErr] = useState(null)
  useEffect(() => {
    const h = ev => {
      const k = keys.current; if (!k || !k.e || ev.ctrlKey || ev.metaKey || ev.altKey) return
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName)) return
      const L = ev.key.length === 1 ? ev.key.toUpperCase() : ''
      if (L && k.e.o[L] && !k.checked) { ev.preventDefault(); k.toggle(L) }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); k.go(k.i - 1) }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); k.go(k.i + 1) }
      else if (ev.key === 'Enter' && ev.target.tagName !== 'BUTTON') {
        ev.preventDefault()
        if (k.checked) k.next(); else if (k.sel.length) k.validate()
      }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])

  useEffect(() => {
    loadQuestions(ids).then(list => { setQs(list.filter(e => e.p && e.f !== 'x')); t0.current = Date.now(); act.current = { last: Date.now(), total: 0 } }).catch(er => { setLoadErr(er); setQs([]) })
  }, [])
  const finishNow = useRef(null)
  useEffect(() => {
    if (!duration) return
    const h = setInterval(() => {
      const l = duration * 60 - (Date.now() - t0.current) / 1000
      setLeft(l)
      if (l <= 0 && finishNow.current) finishNow.current()
    }, 1000)
    return () => clearInterval(h)
  }, [])

  if (loadErr) return (
    <div className="card">
      <p role="alert">{errorText(loadErr)}</p>
      <div className="row">
        {needsLogin(loadErr) && <button className="primary" onClick={() => openAuth('login')}>Se connecter</button>}
        <button onClick={onExit}>Retour</button>
      </div>
    </div>
  )
  if (!qs) return <div className="card">Chargement…</div>
  if (!qs.length) return <div className="card">Aucune question jouable. <button onClick={onExit}>Retour</button></div>
  const e = qs[i]
  const showCase = !!e.ct
  const toggle = L => { touchAct(act.current); if (!checked) setSel(s => (s.includes(L) ? s.filter(x => x !== L) : [...s, L])) }

  const validate = async () => {
    if (busy) return
    touchAct(act.current)
    if (mode === 'immediate') {
      setBusy(true); setMsg('')
      try {
        const res = await checkAnswers([{ id: e.i, chosen: sel }])
        const okNow = !!res.get(e.i)
        setState(record(state, e, sel, seriesId, okNow))
        saved.current.set(i, { sel, checked: true, ok: okNow, p: okNow ? 1 : score(sel, e.c) })
        setChecked(true)
        choiceStats(e.i).then(r => setStats(r ? { id: e.i, pct: r.pct, n: r.n } : null))
      } catch (er) { setMsg(errorText(er)) } finally { setBusy(false) }
    } else {
      saved.current.set(i, { sel, checked: false })
      // enregistrement discret côté serveur : la réponse compte même si l'élève ne termine pas la série
      registerAnswers([{ id: e.i, chosen: sel }]).catch(() => {})
      next()
    }
  }
  // mémorise la question affichée avant de la quitter (en mode examen, une sélection non validée compte comme réponse)
  const keep = () => {
    if (checked) return
    const old = saved.current.get(i)
    if (sel.length && mode !== 'immediate') saved.current.set(i, { sel, checked: false })
    else if (sel.length) saved.current.set(i, { sel, checked: false, draft: true })
    else if (old && old.draft) saved.current.delete(i)
  }
  const isAnswered = r => !!r && (r.checked || (mode !== 'immediate' && r.sel.length > 0))
  const examAnswers = () => [...saved.current.entries()].filter(([, r]) => mode !== 'immediate' && !r.checked && r.sel.length).map(([k, r]) => ({ id: qs[k].i, chosen: r.sel }))
  const recordPending = (items, res) => setState(s => items.reduce((acc, a) => { const q = getQ(a.id); return q ? record(acc, q, a.chosen, seriesId, !!res.get(a.id)) : acc }, s))
  const finish = async () => {
    if (finishing.current) return
    finishing.current = true
    keep()
    touchAct(act.current)
    const wall = (Date.now() - t0.current) / 1000
    // examen chronométré : durée réelle ; sinon temps actif (pas le temps d'onglet resté ouvert)
    const elapsed = duration ? wall : Math.round(act.current.total)
    const timedOut = !!duration && wall >= duration * 60 - 1
    const answered = examAnswers()
    const padded = qs.filter((q, k) => !isAnswered(saved.current.get(k))).map(q => ({ id: q.i, chosen: [] }))
    const items = [...answered, ...padded]
    let res = new Map()
    try {
      if (items.length) {
        res = await checkAnswers(items)
        recordPending(answered, res)
      }
    } catch (er) { finishing.current = 'err'; setFinErr(er); return }
    const results = qs.map((q, k) => {
      const r = saved.current.get(k)
      if (r && r.checked) return { id: q.i, chosen: r.sel, ok: r.ok, p: r.p }
      if (isAnswered(r)) { const ok = !!res.get(q.i); return { id: q.i, chosen: r.sel, ok, p: ok ? 1 : score(r.sel, getQ(q.i) && getQ(q.i).c) } }
      return { id: q.i, chosen: [], ok: false, p: 0 }
    })
    onFinish({ title, seriesId, results, elapsed, timedOut })
  }
  const quit = async () => {
    keep()
    const answered = examAnswers()
    if (answered.length) {
      try { const res = await checkAnswers(answered); recordPending(answered, res) }
      catch (er) {
        if (!window.confirm(`Tes réponses n’ont pas pu être enregistrées (${errorText(er)}). Quitter quand même ?`)) return
      }
    }
    onExit()
  }
  finishNow.current = () => { if (qs && qs.length) finish() }
  const unanswered = () => qs.reduce((n, q, k) => n + (isAnswered(k === i ? (checked ? { checked } : { sel, checked }) : saved.current.get(k)) ? 0 : 1), 0)
  const go = j => {
    if (j < 0 || j >= qs.length || j === i) return
    touchAct(act.current)
    keep()
    const r = saved.current.get(j)
    setI(j); setSel(r ? r.sel : []); setChecked(!!(r && r.checked)); setMsg(''); setConfirmEnd(false); setStats(null)
    if (r && r.checked && qs[j]) choiceStats(qs[j].i).then(x => setStats(x ? { id: qs[j].i, pct: x.pct, n: x.n } : null))
  }
  const tryFinish = () => { if (unanswered() > 0 && !confirmEnd) { setConfirmEnd(true); return } finish() }
  const next = () => {
    if (i + 1 >= qs.length) { tryFinish(); return }
    go(i + 1)
  }
  const firstOpen = () => { for (let k = 0; k < qs.length; k++) { if (!isAnswered(k === i ? (checked ? { checked } : { sel, checked }) : saved.current.get(k))) return k } return -1 }
  const optClass = L => {
    if (!checked) return sel.includes(L) ? 'opt sel' : 'opt'
    const good = e.c.includes(L), mine = sel.includes(L)
    return `opt ${good ? 'good' : mine ? 'bad' : ''} ${mine ? 'mine' : ''}`
  }
  const pts = checked ? score(sel, e.c) : 0
  const ok = checked && sameSet(sel, e.c)
  keys.current = { e, checked, sel, toggle, validate, next, go, i }
  if (finErr) return (
    <div className="card">
      <p role="alert">Impossible d’enregistrer tes réponses : {errorText(finErr)}</p>
      <div className="row"><button className="primary" onClick={() => { finishing.current = false; setFinErr(null); finish() }}>Réessayer</button></div>
    </div>
  )

  return (
    <div className="quiz">
      <div className="bar">
        <button className="ghost" onClick={quit} aria-label="Quitter la série">← Quitter</button>
        <strong title={title}>{title}</strong>
        {duration && left != null && <span className={`timer ${left < 300 ? 'low' : ''}`} role="timer" aria-label="Temps restant">⏱ {fmtT(left)}</span>}
        <span className="count" aria-label={`Question ${i + 1} sur ${qs.length}`}>{i + 1}/{qs.length}</span>
      </div>
      <div className="progress" role="progressbar" aria-valuemin="0" aria-valuemax={qs.length} aria-valuenow={qs.length - unanswered()}><div style={{ width: `${((qs.length - unanswered()) / qs.length) * 100}%` }} /></div>
      {showCase && <div className="case"><div className="case-t">Cas clinique</div>{e.ct}</div>}
      <div className="card">
        <div className="qtext">{e.q}</div>
        <div className="chips">
          {e.tg && <span className="chip">{e.tg}</span>}
          {e.fr && <span className={`chip fr${e.fr[1]}`} title={`Apparue dans ${e.fr[0]} examen(s), de ${e.fr[2]} à ${e.fr[3]}`}>Taux de chute : {['', 'Faible', 'Moyen', 'Élevé', 'Très élevé'][e.fr[1]]} ({e.fr[0]}×)</span>}
          {e.on > 1 && <span className="chip" title="Total d’apparitions des questions du même objectif">Objectif : {e.on}×</span>}
          <button className={`star ${state.favs && state.favs[e.i] ? 'on' : ''}`} aria-pressed={!!(state.favs && state.favs[e.i])} title="Ajouter aux favoris" onClick={() => setState(s => { const f = { ...(s.favs || {}) }; if (f[e.i]) delete f[e.i]; else f[e.i] = e.sn || 0; return { ...s, favs: f } })}>{state.favs && state.favs[e.i] ? '★ Favori' : '☆ Favori'}</button>
        </div>
        <Badge e={e} />
        <div className="opts" role="group" aria-label="Propositions (plusieurs réponses possibles)">
          {Object.entries(e.o).map(([L, t]) => {
            const good = checked && e.c.includes(L), mine = sel.includes(L)
            return (
              <button key={L} className={optClass(L)} onClick={() => toggle(L)} aria-pressed={mine} aria-disabled={checked}>
                <span className="L" aria-hidden="true">{L}</span><span className="T"><span className="sr">Proposition {L} : </span>{t}</span>
                {checked && stats && stats.id === e.i && stats.pct[L] != null && <span className="pc" title={`${stats.pct[L]} % des ${stats.n} élèves ayant répondu ont coché ${L}`}>{stats.pct[L]} %</span>}
                {checked && (good || mine) && <span className="mk">{good ? (mine ? '✓ Juste' : '✓ À cocher') : '✗ Faux'}</span>}
              </button>
            )
          })}
        </div>
        {!checked && <div className="actions"><button className="primary" disabled={!sel.length || busy} onClick={validate}>{busy ? 'Vérification…' : mode === 'immediate' ? 'Valider' : 'Valider et suivant'}</button><p className="hint">Clavier : touches A–E pour cocher, Entrée pour valider, flèches ← → pour changer de question.</p>{msg && <p className="hint" role="alert">{msg}</p>}</div>}
        {checked && (
          <div className={`fb ${ok ? 'ok' : pts > 0 ? 'part' : 'ko'}`} role="status" aria-live="polite">
            <div className="fb-h">{ok ? '✓ Bonne réponse' : pts > 0 ? `◐ Réponse partielle : ${sel.length} bonne${sel.length > 1 ? 's' : ''} réponse${sel.length > 1 ? 's' : ''} sur ${e.c.length} (${fmtPts(pts)} point) · Réponse attendue : ${e.c.split('').join(', ')}` : `✗ Réponse attendue : ${e.c.split('').join(', ')}`}</div>
            <DisNote e={e} />
            {e.w ? <p>{e.w}</p> : <p className="muted">Explication détaillée : bientôt.</p>}
            {e.cs && <div className="muted small">{e.cs}</div>}
            {e.cp && e.cp[0] && (
              <CourseToggle key={e.i} e={e} />
            )}
            {index && <DiscussToggle key={'d' + e.i} e={e} index={index} />}
            {e.pg && <div className="callout"><b>Piège</b>{e.pg}</div>}
            {e.mn && <div className="callout mn"><b>Mnémo</b>{e.mn}</div>}
            <div className="row">
              <ReportBtn e={e} setState={setState} />
              <button className="primary" onClick={next} autoFocus>{i + 1 >= qs.length ? 'Terminer' : 'Question suivante →'}</button>
            </div>
          </div>
        )}
      </div>
      <div className="qnav row">
        <button className="ghost" disabled={i === 0 || busy} onClick={() => go(i - 1)}>← Précédente</button>
        {!checked && <button className="ghost" disabled={busy} onClick={next}>{i + 1 >= qs.length ? 'Terminer la série' : mode !== 'immediate' && sel.length ? 'Suivante →' : 'Passer →'}</button>}
      </div>
      {confirmEnd && (
        <div className="card" role="alert">
          <p><b>Il reste {unanswered()} question{unanswered() > 1 ? 's' : ''} sans réponse.</b> {mode === 'immediate' ? 'Elles seront comptées comme fausses dans le résultat.' : 'Elles seront comptées comme fausses.'}</p>
          <div className="row">
            <button className="primary" onClick={() => { const k = firstOpen(); setConfirmEnd(false); if (k >= 0) go(k) }}>Revenir à la première sans réponse</button>
            <button className="ghost" onClick={finish}>Terminer quand même</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- Résultats ---------- */
// Signalement d'erreur : enregistré dans la base (relu par l'équipe) et gardé aussi dans la progression de l'élève
function ReportBtn({ e, setState }) {
  const [st, setSt] = useState('idle')
  useEffect(() => setSt('idle'), [e.i])
  const send = async () => {
    const n = (window.prompt('Qu’est-ce qui ne va pas dans cette question ? (clé, énoncé, explication…)') || '').trim()
    if (!n) return
    setSt('busy')
    try {
      const { error } = await supabase.rpc('report_question', { p_qid: e.i, p_note: n.slice(0, 500) })
      if (error) throw error
      setState(s => ({ ...s, reports: { ...s.reports, [e.i]: n } }))
      setSt('ok')
    } catch (err) { setSt(/TOO_MANY/.test(String(err && err.message)) ? 'many' : 'err') }
  }
  return (
    <>
      <button className="ghost" onClick={send} disabled={st === 'busy' || st === 'ok'}>{st === 'ok' ? '✓ Signalement envoyé' : 'Signaler une erreur'}</button>
      {st === 'err' && <span className="muted small" role="status">Envoi impossible, réessaie dans un instant.</span>}
      {st === 'many' && <span className="muted small" role="status">Trop de signalements aujourd’hui, reviens demain.</span>}
    </>
  )
}

function Results({ res, index, onStart, onHome, next, onNext }) {
  const [rows, setRows] = useState(null)
  const [similar, setSimilar] = useState([])
  useEffect(() => {
    const es = res.results.map(r => ({ ...r, e: getQ(r.id) })).filter(r => r.e)
    setRows(es)
    const wrong = es.filter(r => !r.ok).map(r => r.e)
    if (wrong.length) similarTo(wrong.map(e => e.i), es.map(r => r.id), 15).then(setSimilar)
  }, [])
  if (!rows) return null
  const pOf = r => (typeof r.p === 'number' ? r.p : r.ok ? 1 : 0)
  const good = rows.filter(r => pOf(r) === 1).length
  const partial = rows.filter(r => pOf(r) > 0 && pOf(r) < 1).length
  const total = rows.reduce((a, r) => a + pOf(r), 0)
  const rate = pct(total, rows.length)
  const note = rows.length ? (total / rows.length) * 20 : 0
  const wrong = rows.filter(r => pOf(r) < 1)
  const parts = weakParts(wrong.map(r => r.e))
  const remedialIds = [...wrong.map(r => r.id), ...similar]
  // la série lancée complète les cas cliniques : on annonce le nombre réel de questions
  const remedialFull = expandCases(remedialIds, index)
  const remedialAdded = remedialFull.length - remedialIds.length
  return (
    <div>
      <div className="card center">
        <h2>{res.title}</h2>
        <div className={`score ${rate >= 70 ? 'good' : rate >= 50 ? 'mid' : 'low'}`} aria-label={`Note ${fmtNote(note)} sur 20`}>{fmtNote(note)}<span className="score-d">/20</span></div>
        <p><b>Taux de réussite : {rate} %</b></p>
        <p className="muted">{good} entièrement juste{good > 1 ? 's' : ''}{partial ? ` · ${partial} partielle${partial > 1 ? 's' : ''}` : ''} · {rows.length - good - partial} fausse{rows.length - good - partial > 1 ? 's' : ''} sur {rows.length} questions{res.elapsed ? ` · ${fmtT(res.elapsed)}` : ''}{res.timedOut ? ' · temps écoulé' : ''}</p>
        <div className="qchips" aria-label="Résultat par question">{rows.map((r, k) => <span key={r.id} className={`qc ${pOf(r) === 1 ? 'ok' : pOf(r) > 0 ? 'part' : 'ko'}`} title={`Question ${k + 1} : ${pOf(r) === 1 ? 'juste' : pOf(r) > 0 ? `partielle (${fmtPts(pOf(r))} point)` : 'fausse'}`}>{k + 1}</span>)}</div>
      </div>
      {parts.length > 0 && (
        <div className="card">
          <h3>Parties du cours à revoir</h3>
          <ul className="parts">
            {parts.slice(0, 8).map((p, k) => (
              <li key={k}>
                <b>{p.section}</b> — {p.n} erreur{p.n > 1 ? 's' : ''}
                <div className="row">
                  {p.pages.slice(0, 5).map(pg => <a key={pg} className="link" href="#" target="_blank" rel="noreferrer" onClick={e => openPdf(e, p.key, pg)}>p.{pg}</a>)}
                </div>
                {p.obj[0] && <div className="muted small">{p.obj[0]}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {next && (
        <div className="card">
          <button className="primary" style={{ width: '100%', fontSize: 18, padding: '14px 16px' }} onClick={() => onNext(next)}>{next.episode != null ? `Épisode suivant (${next.episode}) →` : 'Retour au cours →'}</button>
        </div>
      )}
      {remedialIds.length > 0 && (
        <div className="card">
          <h3>Série de rattrapage</h3>
          <p>{wrong.length} questions ratées + {similar.length} questions semblables (même objectif ou même thème){remedialAdded > 0 ? ` + ${remedialAdded} pour compléter les cas cliniques` : ''}.</p>
          <button className="primary" onClick={() => onStart({ title: 'Rattrapage : ' + res.title, ids: remedialIds, mode: 'immediate', kind: 'remedial' })}>Lancer la série ({remedialFull.length})</button>
        </div>
      )}
      <button onClick={onHome}>Accueil</button>
    </div>
  )
}

/* ---------- Séries des 4 facultés ---------- */
function SeriesBrowser({ index, state, onStart, onBack }) {
  const [jr, setJr] = useState('')
  const [sp, setSp] = useState('')
  const [tp, setTp] = useState('')
  const [yr, setYr] = useState('')
  const [ex, setEx] = useState('')
  const [q, setQ] = useState('')
  const all = index.series.filter(s => !jr || s.j === jr)
  const sps = [...new Set(all.map(s => s.sp))].sort()
  const tps = [...new Set(all.filter(s => !sp || s.sp === sp).map(s => s.tp))].sort()
  const yrs = [...new Set(all.map(s => s.y))].sort()
  const exs = ['Tunis', 'Monastir', 'Sousse', 'Sfax']
  const list = all.filter(s => (!sp || s.sp === sp) && (!tp || s.tp === tp) && (!yr || String(s.y) === yr) && (!ex || facOf(s.ex) === ex) && (!q || s.tp.toLowerCase().includes(q.toLowerCase())))
  const done = useMemo(() => {
    const m = {}
    for (const a of state.attempts) if (a.s) (m[a.s] = m[a.s] || new Set()).add(a.q)
    return m
  }, [state.attempts])
  return (
    <div>
      <div className="page-h"><h1>Séries des 4 facultés</h1><p className="muted">{list.length} séries</p></div>
      <div className="filters">
        <label>Jour<select value={jr} onChange={e => { setJr(e.target.value); setSp(''); setTp('') }}><option value="">J1 et J2</option><option value="J1">J1</option><option value="J2">J2</option></select></label>
        <label>Spécialité<select value={sp} onChange={e => { setSp(e.target.value); setTp('') }}><option value="">Toutes</option>{sps.map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Thème<select value={tp} onChange={e => setTp(e.target.value)}><option value="">Tous</option>{tps.map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Année<select value={yr} onChange={e => setYr(e.target.value)}><option value="">Toutes</option>{yrs.map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Faculté<select value={ex} onChange={e => setEx(e.target.value)}><option value="">Les 4 facultés</option>{exs.map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Recherche<input type="search" placeholder="ex. diabète" value={q} onChange={e => setQ(e.target.value)} /></label>
      </div>
      <div className="grid">
        {list.slice(0, 200).map(s => {
          const d = done[s.id] ? done[s.id].size : 0
          return (
            <div className="card sc" key={s.id}>
              <div className="muted small">{s.sp} · {s.j}</div>
              <b>{s.tp}</b>
              <div>{examLabel(s)}</div>
              <div className="muted small">{s.q.length} questions{d ? ` · ${d} faites` : ''}</div>
              <div className="row">
                <button className="primary" onClick={() => onStart({ title: `${s.tp} — ${examLabel(s)}`, ids: s.q, subjectHint: s.sn || null, seriesId: s.id, mode: 'immediate', kind: 'series' })}>Commencer</button>
                <button className="ghost" onClick={() => onStart({ title: `${s.tp} — ${examLabel(s)}`, ids: s.q, subjectHint: s.sn || null, seriesId: s.id, mode: 'end', kind: 'series' })}>Mode examen</button>
              </div>
            </div>
          )
        })}
      </div>
      {list.length > 200 && <p className="muted">Affine les filtres pour voir les {list.length - 200} autres séries.</p>}
    </div>
  )
}

/* ---------- Avant le cours ---------- */
function PreRead({ index, onStart, onBack }) {
  const [sp, setSp] = useState('')
  const [q, setQ] = useState('')
  const sps = useMemo(() => [...new Set(index.series.map(s => s.sp))].sort(), [index])
  const spSn = useMemo(() => { const m = {}; for (const s of index.series) if (s.sn) (m[s.sp] = m[s.sp] || new Set()).add(s.sn); return m }, [index])
  const fold = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const subs = index.subjects.filter(s => (index.pre[s.no] || []).length >= 5 && (!sp || (spSn[sp] && spSn[sp].has(s.no))) && (!q.trim() || fold(s.name + ' ' + (s.title || '')).includes(fold(q.trim()))))
  return (
    <div>
      <div className="page-h"><h1>Avant de lire le cours</h1><p className="muted">{subs.length} sujets</p></div>
      <div className="filters">
        <label>Spécialité<select value={sp} onChange={e => setSp(e.target.value)}><option value="">Toutes</option>{sps.map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Recherche<input type="search" placeholder="ex. diabète" value={q} onChange={e => setQ(e.target.value)} /></label>
      </div>
      <p className="muted">Quelques questions générales (définitions, mécanismes, anatomie, épidémiologie) pour se mettre dans le sujet avant de lire le cours. Version brouillon : sélection automatique.</p>
      <div className="grid">
        {subs.map(s => (
          <div className="card sc" key={s.no}>
            <div className="muted small">Sujet {s.no}</div>
            <b>{s.name}</b>
            <div className="muted small">{index.pre[s.no].length} questions</div>
            <div className="row">
              <button className="primary" onClick={() => onStart({ title: `Avant le cours : ${s.name}`, ids: index.pre[s.no], subjectHint: s.no, mode: 'immediate', kind: 'pre' })}>Commencer</button>
              {s.course && <a className="link" href="#" target="_blank" rel="noreferrer" onClick={e => openPdf(e, s.course)}>Ouvrir le cours</a>}
            </div>
          </div>
        ))}
      </div>
      {!subs.length && <p className="muted">Aucun sujet ne correspond à ces filtres.</p>}
    </div>
  )
}

/* ---------- Révision du jour ---------- */
function Daily({ index, state, onStart, onBack }) {
  const today = todayAttempts(state)
  const wrongToday = [...new Set(today.filter(a => !a.ok).map(a => a.q))]
  const { rows: meta } = useMeta(null)
  const snOf = useMemo(() => new Map((meta || []).map(r => [r.i, r.sn])), [meta])
  // cours exclus de la révision (mémorisés sur cet appareil)
  const [ex, setEx] = useState(() => { try { return new Set((JSON.parse(localStorage.getItem('rev_excl') || '[]') || []).map(Number)) } catch { return new Set() } })
  useEffect(() => { try { localStorage.setItem('rev_excl', JSON.stringify([...ex])) } catch {} }, [ex])
  const [showEx, setShowEx] = useState(false)
  const [exFind, setExFind] = useState('')
  const [day, setDay] = useState(() => { try { const v = localStorage.getItem('rev_day'); return v === 'J1' || v === 'J2' ? v : '' } catch { return '' } })
  useEffect(() => { try { localStorage.setItem('rev_day', day) } catch {} }, [day])
  const filtering = ex.size > 0 || !!day
  const waiting = ex.size > 0 && !meta
  const keep = ids => ids.filter(i => (!ex.size || !meta || !ex.has(snOf.get(i))) && inDay(index, i, day))
  const dueAll = dueIds(state, dayKey())
  const dueNow = keep(dueAll)
  const dueTomorrow = keep(dueIds(state, tomorrowKey()))
  const wrongKept = keep(wrongToday)
  const dueBySn = useMemo(() => { const m = new Map(); if (meta) for (const i of dueAll) { const k = snOf.get(i); if (k != null) m.set(k, (m.get(k) || 0) + 1) } return m }, [dueAll.length, meta])
  const exVisible = index.subjects.filter(sj => !exFind.trim() || foldT(sj.name).includes(foldT(exFind.trim())))
  const toggleEx = no => setEx(o => { const x = new Set(o); x.has(no) ? x.delete(no) : x.add(no); return x })
  // nombre réel de questions jouées : les cas cliniques sont complétés au lancement
  const dueRun = dueNow.slice(0, 40)
  const dueFull = expandCases(dueRun, index)
  const [plan, setPlan] = useState(null)
  const planFull = plan ? expandCases(plan, index) : []
  useEffect(() => {
    if (waiting) return
    setPlan(null)
    // attend 600 ms : si l'élève coche plusieurs cours à la suite, un seul calcul serveur est lancé
    let live = true
    const t = setTimeout(() => { tomorrowPlan(state, wrongKept, dueTomorrow).then(r => { if (live) setPlan(keep(r)) }) }, 600)
    return () => { live = false; clearTimeout(t) }
  }, [ex, meta, day])
  return (
    <div>
      <div className="page-h"><h1>Révision</h1><p className="muted">{dayKey()}</p></div>
      <div className="stats">
        <div className="card center"><div className="score">{today.length}</div>questions aujourd’hui</div>
        <div className="card center"><div className="score">{pct(today.reduce((a, x) => a + ptsOf(x), 0), today.length)}%</div>réussite du jour</div>
        <div className="card center"><div className="score">{wrongToday.length}</div>à retravailler</div>
        <div className="card center"><div className="score">{dueNow.length}</div>à revoir maintenant</div>
      </div>
      <div className="card">
        <h3>Jour et cours à inclure</h3>
        <fieldset className="seg"><legend>Jour d’examen</legend>
          {[['', 'J1 + J2'], ['J1', 'J1'], ['J2', 'J2']].map(([v, t]) => <button key={v} aria-pressed={day === v} className={day === v ? 'on' : ''} onClick={() => setDay(v)}>{t}</button>)}
        </fieldset>
        <p className="muted">{filtering ? <>{day ? <b>{day} uniquement. </b> : null}{ex.size ? <><b>{ex.size}</b> cours exclu{ex.size > 1 ? 's' : ''} de la révision</> : null}{dueAll.length !== dueNow.length ? ` (${dueAll.length - dueNow.length} question${dueAll.length - dueNow.length > 1 ? 's' : ''} masquée${dueAll.length - dueNow.length > 1 ? 's' : ''})` : ''}.</> : 'Tous les cours sont inclus. Décoche ceux que tu ne veux pas réviser pour le moment.'}</p>
        <div className="row" style={{ marginTop: 0 }}>
          <button type="button" className="ghost" onClick={() => setShowEx(v => !v)} aria-expanded={showEx}>{showEx ? 'Masquer la liste' : 'Choisir les cours'}</button>
          {filtering && <button type="button" className="link" onClick={() => setEx(new Set())}>Tout réinclure</button>}
        </div>
        {showEx && (
          <>
            <div className="cs-find"><input type="search" placeholder="Rechercher un cours, ex. diabète" value={exFind} onChange={e => setExFind(e.target.value)} aria-label="Rechercher un cours" /></div>
            <div className="cs-box">
              <ul className="cs-list">
                {exVisible.map(sj => { const off = ex.has(sj.no); const c = dueBySn.get(sj.no) || 0; return (
                  <li key={sj.no}><label className={off ? 'zero' : 'on'}>
                    <input type="checkbox" checked={!off} onChange={() => toggleEx(sj.no)} />
                    <span>{sj.name}</span><small title="Questions à revoir maintenant">{c}</small>
                  </label></li>) })}
                {!exVisible.length && <li className="muted small" style={{ padding: 10 }}>Aucun cours ne correspond.</li>}
              </ul>
            </div>
          </>
        )}
      </div>
      <div className="card">
        <h3>À revoir maintenant</h3>
        <p className="muted">Questions dont l’échéance de révision espacée (1, 3, 7, 14, 30 jours) est atteinte.</p>
        <button className="primary" disabled={!dueNow.length || waiting} onClick={() => onStart({ title: 'Révision espacée', ids: dueRun, mode: 'immediate', kind: 'review' })}>Lancer ({dueFull.length})</button>
        {dueNow.length > 40 && <p className="muted small">40 questions par série sur {dueNow.length} à revoir{dueFull.length > dueRun.length ? ` (+${dueFull.length - dueRun.length} pour compléter les cas cliniques)` : ''}.</p>}
      </div>
      <div className="card">
        <h3>Série suggérée pour demain matin</h3>
        <p className="muted">Tes erreurs du jour, les questions à échéance demain et des questions semblables, avant de passer au sujet suivant.</p>
        {plan && !waiting ? <button className="primary" disabled={!plan.length} onClick={() => onStart({ title: 'Série de demain matin', ids: plan, mode: 'immediate', kind: 'tomorrow' })}>Lancer cette série ({planFull.length})</button> : 'Calcul…'}
      </div>
    </div>
  )
}

/* ---------- Icônes & navigation ---------- */
const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  series: 'M4 5h12a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3zM8 9h7M8 13h5',
  create: 'M12 5v14M5 12h14',
  daily: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l3 2',
  pre: 'M2 6c3-1.5 6-1.5 10 1 4-2.5 7-2.5 10-1v13c-3-1.5-6-1.5-10 1-4-2.5-7-2.5-10-1zM12 7v13',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  book: 'M4 4h10a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4zM8 8h6M8 12h4',
  exam: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 1.5M9 2h6',
  prio: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  notes: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  forum: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  groups: 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M14 15c3 0 8 1 8 5',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  dcem3: 'M4 5h16v14H4zM8 9h8M8 13h8M8 17h5',
  packs: 'M7 3h11a1 1 0 0 1 1 1v13M4 7h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM8 12h4M8 16h6',
  arc: 'M6 3v6a4 4 0 0 0 8 0V3M10 13v2a4 4 0 0 0 8 0v-1M18 11a2 2 0 1 0 0 4',
  tbank: 'M4 4h10a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4zM8 8h6M8 12h4',
  tnew: 'M12 5v14M5 12h14',
  study: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l3 2M10 2h4M19 5l1.5 1.5',
}
const Ico = ({ n, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[n]} /></svg>

// Interfaces : le serveur décide (my_interface). Chaque interface n'expose que ses écrans ; tout autre écran retombe sur l'accueil.
const TEACHER_VIEWS = ['home', 'tbank', 'tnew', 'account', 'amphi', 'amphi-project']
const viewAllowed = (iface, name) => iface === 'teacher' ? TEACHER_VIEWS.includes(name) : (iface === 'level' || iface === 'residanat') ? name !== 'dcem3' && name !== 'parcours' : true

/* ---------- Créer ma série ---------- */
const KINDS = {
  chute: { t: 'Taux de chute élevé', d: 'Les questions où les candidats échouent le plus, tirées des examens passés. Idéal pour renforcer les points qui font perdre des places.', icon: 'target' },
  typique: { t: 'Questions typiques du Résidanat', d: 'Questions revenues à plusieurs sessions, dont la réponse se trouve dans le cours (page du cours liée) et dont la clé est fiable.', icon: 'book' },
}
const LEVELS = [[4, 'Très élevé uniquement (niveau 4)'], [3, 'Élevé et très élevé (niveaux 3–4)'], [2, 'Moyen et plus (niveaux 2–4)']]
const playable = e => e.p && e.f !== 'x'
const hasCourse = e => e.hc
const okFor = (e, kind, lvl) => playable(e) && (kind === 'chute' ? e.fr && e.fr[1] >= lvl : hasCourse(e) && e.fr && e.fr[0] >= 2)
function buildSet(pool, kind, lvl, n) {
  let l = pool.filter(e => okFor(e, kind, lvl))
  l = l.map(e => ({ e, r: Math.random() }))
  l.sort((a, b) => kind === 'chute' ? (b.e.fr[1] - a.e.fr[1]) || (b.e.fr[0] - a.e.fr[0]) || a.r - b.r : (b.e.fr[0] - a.e.fr[0]) || (b.e.fr[1] - a.e.fr[1]) || a.r - b.r)
  return { total: l.length, picked: l.slice(0, n).map(x => x.e) }
}
const foldT = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function CreateSeries({ index, onStart }) {
  const sps = useMemo(() => [...new Set(index.series.map(s => s.sp))].sort(), [index])
  const spSn = useMemo(() => { const m = {}; for (const s of index.series) if (s.sn) (m[s.sp] = m[s.sp] || new Set()).add(s.sn); return m }, [index])
  const valid = useMemo(() => new Set(index.subjects.map(s => s.no)), [index])
  const spList = useMemo(() => sps.map(sp => ({ sp, ids: [...(spSn[sp] || [])].filter(x => valid.has(x)) })).filter(x => x.ids.length), [sps, spSn, valid])
  const [sel, setSel] = useState(() => new Set()) // vide = toutes les matières
  const [find, setFind] = useState('')
  const [kind, setKind] = useState('chute')
  const [lvl, setLvl] = useState(3)
  const [n, setN] = useState(20)
  const [mode, setMode] = useState('immediate')
  const [day, setDay] = useState('')
  const [showList, setShowList] = useState(false)
  const { rows: all, error: poolErr } = useMeta(null)
  const pool = useMemo(() => (all ? all.filter(r => (!sel.size || sel.has(r.sn)) && inDay(index, r.i, day)) : null), [all, sel, day, index])
  const res = useMemo(() => (pool ? buildSet(pool, kind, lvl, n) : null), [pool, kind, lvl, n])
  const counts = useMemo(() => (pool ? { chute: pool.filter(e => okFor(e, 'chute', lvl)).length, typique: pool.filter(e => okFor(e, 'typique', lvl)).length } : null), [pool, lvl])
  // nombre de questions disponibles par cours (selon le type et le niveau choisis)
  const perCourse = useMemo(() => { const m = new Map(); if (all) for (const e of all) if (okFor(e, kind, lvl) && inDay(index, e.i, day)) m.set(e.sn, (m.get(e.sn) || 0) + 1); return m }, [all, kind, lvl, day, index])
  const byNo = useMemo(() => new Map(index.subjects.map(s => [s.no, s])), [index])
  const visible = useMemo(() => index.subjects.filter(s => !find.trim() || foldT(s.name).includes(foldT(find.trim()))), [index, find])
  const toggleCourse = no => setSel(o => { const x = new Set(o); x.has(no) ? x.delete(no) : x.add(no); return x })
  const spState = ids => { const k = ids.filter(i => sel.has(i)).length; return k === 0 ? 'none' : k === ids.length ? 'all' : 'some' }
  const toggleSp = ids => setSel(o => { const x = new Set(o); if (ids.every(i => x.has(i))) ids.forEach(i => x.delete(i)); else ids.forEach(i => x.add(i)); return x })
  const addVisible = () => setSel(o => { const x = new Set(o); visible.forEach(s => x.add(s.no)); return x })
  const chosen = [...sel].map(no => byNo.get(no)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const selSps = spList.filter(x => spState(x.ids) === 'all').map(x => x.sp)
  const scopeName = !sel.size ? 'Toutes spécialités' : chosen.length === 1 ? chosen[0].name : selSps.length && selSps.length <= 2 && spList.filter(x => selSps.includes(x.sp)).reduce((a, x) => a + x.ids.length, 0) >= chosen.length ? selSps.join(' + ') : `${chosen.length} cours`
  const launch = () => {
    const r = buildSet(pool, kind, lvl, n)
    onStart({ title: `${KINDS[kind].t}${day ? ' ' + day : ''} — ${scopeName}`, ids: expandCases(r.picked.map(e => e.i), index, n), subjectHint: r.picked[0] ? r.picked[0].sn : null, mode, kind: 'custom' })
  }
  const setCustomN = v => { const x = Math.max(1, Math.min(200, Math.floor(Number(v) || 0))); setN(x || 1) }
  return (
    <div>
      <div className="page-h"><h1>Créer ma série</h1><p className="muted">Choisis une ou plusieurs spécialités, ou des cours précis, puis le type de questions. La série est générée à partir de la banque complète.</p></div>
      <section className="card" aria-labelledby="s1">
        <h2 id="s1" className="step"><span>1</span>Matière</h2>
        <div className="cs-lab">Spécialités <span className="muted small">(plusieurs possibles)</span></div>
        <div className="cs-chips" role="group" aria-label="Spécialités">
          {spList.map(({ sp, ids }) => { const s = spState(ids); const k = ids.filter(i => sel.has(i)).length; return (
            <button key={sp} type="button" className={`cs-chip ${s}`} aria-pressed={s === 'all'} onClick={() => toggleSp(ids)}>
              {s === 'all' ? '✓ ' : ''}{sp}<small>{s === 'some' ? `${k}/${ids.length}` : ids.length}</small>
            </button>) })}
        </div>
        <div className="cs-sel" aria-live="polite">
          {sel.size === 0
            ? <span className="muted small">Aucune sélection : la série utilise <b>toutes les matières</b>.</span>
            : <>
                <div className="cs-tags">
                  {chosen.slice(0, 12).map(s => <button key={s.no} type="button" className="cs-tag" onClick={() => toggleCourse(s.no)} aria-label={`Retirer ${s.name}`}>{s.name} <span aria-hidden="true">×</span></button>)}
                  {chosen.length > 12 && <span className="muted small">+ {chosen.length - 12} autres</span>}
                </div>
                <button type="button" className="link" onClick={() => setSel(new Set())}>Tout effacer ({sel.size})</button>
              </>}
        </div>
        <div className="cs-lab">Cours <span className="muted small">(coche autant de cours que tu veux, même de spécialités différentes)</span></div>
        <div className="cs-find">
          <input type="search" placeholder="Rechercher un cours, ex. diabète" value={find} onChange={e => { setFind(e.target.value); setShowList(true) }} onFocus={() => setShowList(true)} aria-label="Rechercher un cours" />
          <button type="button" className="ghost" onClick={() => setShowList(v => !v)} aria-expanded={showList}>{showList ? 'Masquer la liste' : `Afficher les ${index.subjects.length} cours`}</button>
        </div>
        {showList && (
          <div className="cs-box">
            <div className="cs-bar small">
              <span className="muted">{visible.length} cours{find.trim() ? ' trouvés' : ''}</span>
              <span><button type="button" className="link" onClick={addVisible}>Tout cocher{find.trim() ? ' (résultats)' : ''}</button> · <button type="button" className="link" onClick={() => setSel(new Set())}>Tout décocher</button></span>
            </div>
            <ul className="cs-list">
              {visible.map(s => { const on = sel.has(s.no); const c = perCourse.get(s.no) || 0; return (
                <li key={s.no}><label className={`${on ? 'on' : ''} ${c ? '' : 'zero'}`}>
                  <input type="checkbox" checked={on} onChange={() => toggleCourse(s.no)} />
                  <span>{s.name}</span><small>{c}</small>
                </label></li>) })}
              {!visible.length && <li className="muted small" style={{ padding: 10 }}>Aucun cours ne correspond.</li>}
            </ul>
          </div>
        )}
      </section>
      <section className="card" aria-labelledby="s2">
        <h2 id="s2" className="step"><span>2</span>Type de série</h2>
        <div className="kinds" role="radiogroup" aria-label="Type de série">
          {Object.entries(KINDS).map(([k, v]) => (
            <button key={k} role="radio" aria-checked={kind === k} className={`kind ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
              <Ico n={v.icon} size={26} /><b>{v.t}</b><span>{v.d}</span>
              <em>{counts ? `${counts[k].toLocaleString('fr')} questions disponibles` : 'Calcul…'}</em>
            </button>
          ))}
        </div>
        {kind === 'chute' && <div className="filters one"><label>Niveau de chute<select value={lvl} onChange={e => setLvl(Number(e.target.value))}>{LEVELS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label></div>}
      </section>
      <section className="card" aria-labelledby="s3">
        <h2 id="s3" className="step"><span>3</span>Réglages</h2>
        <fieldset className="seg"><legend>Nombre de questions</legend>
          {[10, 20, 30, 50, 100].map(v => <button key={v} aria-pressed={n === v} className={n === v ? 'on' : ''} onClick={() => setN(v)}>{v}</button>)}
          <label className="cs-n">autre <input type="number" min="1" max="200" inputMode="numeric" value={n} onChange={e => setCustomN(e.target.value)} aria-label="Nombre de questions personnalisé" /></label>
          {res && res.total > 0 && <button type="button" className="link" onClick={() => setN(Math.min(200, res.total))}>Max ({Math.min(200, res.total)})</button>}
        </fieldset>
        <fieldset className="seg"><legend>Jour d’examen</legend>
          {[['', 'J1 + J2'], ['J1', 'J1'], ['J2', 'J2']].map(([v, t]) => <button key={v} aria-pressed={day === v} className={day === v ? 'on' : ''} onClick={() => setDay(v)}>{t}</button>)}
        </fieldset>
        <fieldset className="seg"><legend>Mode</legend>
          <button aria-pressed={mode === 'immediate'} className={mode === 'immediate' ? 'on' : ''} onClick={() => setMode('immediate')}>Correction immédiate</button>
          <button aria-pressed={mode === 'end'} className={mode === 'end' ? 'on' : ''} onClick={() => setMode('end')}>Mode examen</button>
        </fieldset>
      </section>
      <div className="launch">
        <div>{res ? (res.total ? <><b>{Math.min(n, res.total)}</b> question{Math.min(n, res.total) > 1 ? 's' : ''} sur {res.total.toLocaleString('fr')} disponibles<div className="muted small">{scopeName}</div></> : 'Aucune question ne correspond à ces critères.') : poolErr ? errorText(poolErr) : 'Chargement des questions…'}</div>
        <button className="primary big" disabled={!res || !res.total} onClick={launch}>Lancer la série →</button>
      </div>
      {res && res.total > 0 && res.total < n && <p className="muted small">Moins de {n} questions disponibles pour ce choix : ajoute des cours ou baisse le niveau de chute.</p>}
    </div>
  )
}

/* ---------- App ---------- */
function LoginGate() {
  return (
    <main className="wrap narrow">
      <section className="card center">
        <h1>Résidanat QCM</h1>
        <div className="trial" role="note"><b>Commence ton essai gratuit de 7 jours maintenant</b><span>Crée un compte en 1 minute pour accéder aux questions. Ta progression est synchronisée entre tes appareils.</span></div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={() => openAuth('signup')}>Commencer mon essai gratuit</button>
          <button onClick={() => openAuth('login')}>Se connecter</button>
        </div>
        <p className="muted small">Après l’essai : {PRICE_MONTH} DT par mois ou {PRICE_SEMESTER} DT par semestre (Résidanat) ; DCEM3 : 50 DT jusqu’à juin, déduits ensuite du semestre Résidanat. Invite 3 amis et gagne 1 mois offert.</p>
        <p className="muted small"><a href="/conditions.html" target="_blank" rel="noopener">Conditions d’utilisation</a></p>
      </section>
    </main>
  )
}

export default function App() {
  const [state, setState] = useState(load)
  const [indexAll, setIndex] = useState(null)
  const [scope, setScope] = useState(null)
  const [iface, setIface] = useState(null)
  const [autoDone, setAutoDone] = useState(false)
  const autoTried = useRef(false)
  const [later, setLater] = useState(false)
  const index = useMemo(() => scopeIndex(indexAll, scope), [indexAll, scope])
  useEffect(() => { try { applyPrefs(readPrefs()) } catch {} }, [])
  const [view, setView] = useState({ name: 'home' })
  useEffect(() => { save(state) }, [state])
  // Progression liée au compte : fusion à la connexion, puis envoi différé à chaque changement
  const { user, profile, ready } = useAuth()
  // La table des copies de questions (canon_map) n'est plus lisible sans connexion : l'index se charge une fois connecté.
  useEffect(() => { if (!ready || !user) return; loadIndex().then(ix => { setState(s => canonState(s, canonOf)); setIndex(ix) }) }, [ready, user && user.id])
  const [access, setAccess] = useState(null)
  // Objectif et jours avant le concours : widget de la coquille + écran Progression (lecture seule, repli local)
  const objective = useObjective(user, state)
  const refreshAccess = async () => { const a = await getAccess(); setAccess(a); getInterface().then(setIface); return a }
  useEffect(() => {
    if (!user) { setAccess(null); setScope(null); setIface(null); return undefined }
    refreshAccess()
    getScope().then(setScope)
    getInterface().then(setIface)
    const h = () => refreshAccess()
    window.addEventListener('access-expired', h)
    return () => window.removeEventListener('access-expired', h)
  }, [user && user.id])
  // Choix fait à l'inscription (métadonnées du compte) : appliqué une seule fois par le serveur (mêmes règles que le sélecteur d'espace).
  const pre = user && user.user_metadata && user.user_metadata.track
  useEffect(() => {
    if (!user || !pre || autoTried.current || !scope || scope.chosen || !iface) return
    autoTried.current = true
    if (iface === 'teacher') { setAutoDone(true); return }
    chooseTrack(String(pre), user.user_metadata.faculty || null).then(s => { setScope(s); refreshAccess() }).catch(() => {}).finally(() => setAutoDone(true))
  }, [user && user.id, pre, scope, iface])
  const synced = useRef(null)
  const stateRef = useRef(state)
  stateRef.current = state
  useEffect(() => {
    if (!user) { synced.current = null; return undefined }
    let live = true
    pull(user.id).then(remote => {
      if (!live) return
      const merged = canonState(remote ? mergeState(stateRef.current, remote) : stateRef.current, canonOf)
      synced.current = user.id
      setState(merged)
      push(user.id, merged).catch(() => {})
    }).catch(() => {})
    return () => { live = false }
  }, [user && user.id])
  useEffect(() => {
    if (!user || synced.current !== user.id) return undefined
    const t = setTimeout(() => { push(user.id, state).catch(() => {}) }, 2500)
    return () => clearTimeout(t)
  }, [state, user && user.id])
  useEffect(() => { window.scrollTo(0, 0) }, [view.name])
  if (ready && !user) return <LoginGate />
  if (!index || !ready) return <div className="wrap"><div className="skeleton" role="status">Chargement de la banque de questions…</div></div>
  if (!user) return <LoginGate />
  if (access && access.status === 'expired') return <PaywallGate email={user.email} track={access.track} onRefresh={refreshAccess} onSignOut={() => supabase.auth.signOut()} />
  const home = () => setView({ name: 'home' })
  const start = cfg => {
    // les séries d'origine sont déjà dans l'ordre ; les autres sont complétées pour ne jamais séparer les questions d'un cas clinique
    const ids = cfg.kind === 'series' ? cfg.ids : cfg.kind === 'video' ? expandCases(cfg.ids, index, 15) : expandCases(cfg.ids, index)
    const duration = cfg.duration && cfg.ids.length ? Math.round(cfg.duration * ids.length / cfg.ids.length) : cfg.duration
    setView({ name: 'quiz', qk: Math.random(), ...cfg, ids, duration })
  }
  const focus = view.name === 'quiz'
  // Garde d'interface : un écran non prévu pour cette interface n'est jamais affiché (la base refuse de toute façon).
  const vn = iface && !viewAllowed(iface, view.name) && view.name !== 'quiz' && view.name !== 'results' ? 'home' : view.name
  const topActions = iface !== 'teacher' ? <><SuggestButton /><Bell go={setView} /></> : null
  return (
    <>
      {scope && !scope.chosen && !later && iface && iface !== 'teacher' && (!pre || autoDone) && <TrackChooser onDone={s => { setScope(s); refreshAccess() }} onLater={() => setLater(true)} />}
      <Shell view={view} go={setView} iface={iface} objective={objective} user={user} profile={profile} access={access} scope={scope} actions={topActions} focus={focus} dcem3={!!scope && scope.track === 'dcem3'}>
        <main className={focus ? 'wrap narrow' : 'wrap'}>
          {iface === 'teacher' && (vn === 'home' || vn === 'tbank' || vn === 'tnew') && <TeacherSpace page={vn} go={setView} />}
          {vn === 'home' && iface === 'level' && <LevelHome scope={scope} state={state} onStart={start} go={setView} />}
          {vn === 'home' && iface !== 'teacher' && iface !== 'level' && <Home index={index} state={state} setState={setState} go={setView} access={access} onStart={start} objective={objective} scope={scope} profile={profile} />}
          {vn === 'dcem3' && scope && scope.track === 'dcem3' && <Dcem3Home index={index} state={state} go={setView} onStart={start} faculty={scope.faculty} />}
          {vn === 'parcours' && scope && scope.track === 'dcem3' && <ParcoursView index={index} state={state} go={setView} onStart={start} />}
          {vn === 'progression' && <ProgressionView index={index} state={state} objective={objective} go={setView} onStart={start} />}
          {vn === 'library' && <LibraryPage index={index} go={setView} />}
          {vn === 'train' && <TrainPage index={index} state={state} go={setView} onStart={start} />}
          {vn === 'train-create' && <TrainCreate index={index} state={state} onStart={start} onBack={() => setView({ name: 'train' })} />}
          {vn === 'train-series' && <TrainSeries index={index} state={state} go={setView} onStart={start} />}
          {vn === 'qcm-screen' && <QcmScreen ids={view.ids} index={index} onExit={() => setView({ name: 'train-series' })} />}
          {vn === 'course' && <CoursePage index={index} go={setView} init={view} />}
          {vn === 'videos' && <VideosList index={index} go={setView} />}
          {vn === 'pre-requis' && <PreReadPage index={index} go={setView} onStart={start} />}
          {vn === 'flashcards' && <Flashcards index={index} go={setView} init={view} />}
          {vn === 'lecture' && <LecturePlayer index={index} go={setView} init={view} />}
          {vn === 'profile' && <ProfilePage state={state} profile={profile} scope={scope} access={access} objective={objective} go={setView} />}
          {vn === 'settings' && <SettingsPage go={setView} state={state} />}
          {vn === 'parrainage' && <ParrainagePage profile={profile} go={setView} />}
          {vn === 'abonnement' && <SubscriptionPage access={access} go={setView} />}
          {vn === 'exam-session' && <ExamSession init={view} go={setView} />}
          {vn === 'exam-results' && <ExamResults init={view} go={setView} />}
          {vn === 'search-page' && <SearchPage index={index} go={setView} onStart={start} />}
          {vn === 'ask' && <AskModal questionId={view.questionId} onClose={() => setView({ name: 'forum-home' })} onPublish={view.onPublish || (async () => { throw new Error('publication indisponible') })} />}
          {vn === 'report' && <ReportModal questionId={view.questionId} onClose={() => setView({ name: 'train' })} onSubmit={view.onSubmit || (async () => { throw new Error('signalement indisponible') })} />}
          {vn === 'notifications' && <NotificationsDrawer items={view.items || []} go={setView} onClose={() => setView({ name: 'home' })} />}
          {vn === 'moderation' && <AdminReports go={setView} />}
          {vn === 'suggestions' && <AdminSuggestions go={setView} />}
          {vn === 'access' && <AdminAccess go={setView} />}
          {vn === 'amphi' && <Amphi role={iface === 'teacher' ? 'teacher' : 'student'} go={setView} onProject={sid => setView({ name: 'amphi-project', session: sid })} />}
          {vn === 'amphi-project' && <AmphiProjection session={view.session} go={setView} />}
          {vn === 'states' && <div className="wrap"><StateBlock kind={view.kind || 'empty'} action="Réessayer" onAction={() => setView({ name: 'home' })} /></div>}
          {vn === 'forum-home' && <ForumPage index={index} go={setView} />}
          {vn === 'history' && <HistoryPage state={state} go={setView} />}
          {vn === 'arc-case' && <ArcCase caseId={view.caseId} go={setView} />}
          {vn === 'create' && <CreateSeries index={index} onStart={start} />}
          {vn === 'series' && <SeriesBrowser index={index} state={state} onStart={start} onBack={home} />}
          {vn === 'exam' && <ExamsPage index={index} state={state} onStart={start} />}
          {vn === 'arc' && <ArcHub go={setView} specialty={view.specialty} onStart={start} />}
          {vn === 'prio' && <Priorities index={index} state={state} onStart={start} />}
          {vn === 'search' && <SearchView index={index} state={state} setState={setState} onStart={start} />}
          {vn === 'forum' && <ForumView index={index} init={view.qid} onAnswer={(e, ch, ok) => setState(s => record(s, e, ch, 'forum', ok))} />}
          {vn === 'study' && <StudyTime index={index} study={state.study} onStudy={s => setState(st => (JSON.stringify(st.study) === JSON.stringify(s) ? st : { ...st, study: s }))} />}
          {vn === 'groups' && <GroupsView go={setView} init={view} />}
          {vn === 'packs' && <PacksView key={`${view.kind || 'p'}-${view.video ? `${view.video.course}-${view.video.episode}` : 'p'}`} go={setView} onStart={start} index={index} init={view} />}
          {vn === 'account' && <AccountView go={setView} access={access} scope={scope} onScope={s => { setScope(s); refreshAccess() }} iface={iface} />}
          {vn === 'pre' && <PreRead index={index} onStart={start} onBack={home} />}
          {vn === 'daily' && <Daily index={index} state={state} onStart={start} onBack={home} />}
          {view.name === 'quiz' && <Quiz key={view.qk} index={index} {...view} state={state} setState={setState} onExit={home} onFinish={r => { setState(s => ({ ...s, sessions: [...(s.sessions || []), { t: Date.now(), d: dayKey(), title: r.title, n: r.results.length, ok: r.results.filter(x => x.ok).length, pts: Math.round(r.results.reduce((a, x) => a + (typeof x.p === 'number' ? x.p : x.ok ? 1 : 0), 0) * 100) / 100, sec: Math.round(r.elapsed || 0), exam: !!r.timedOut || /Examen blanc/.test(r.title) }].slice(-200) })); setView({ name: 'results', res: r, next: view.next }) }} />}
          {view.name === 'results' && <Results res={view.res} index={index} onStart={start} onHome={home} next={view.next} onNext={n => setView({ name: 'packs', video: { course: n.course, episode: n.episode } })} />}
        </main>
      </Shell>
    </>
  )
}
