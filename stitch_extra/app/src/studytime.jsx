import React, { useEffect, useMemo, useRef, useState } from 'react'
import { dayKey } from './store.js'
import { mergeStudy } from './sync.js'

// Page « Study time » : minuteur Pomodoro, suivi du temps d'étude, planificateur.
// Séances, planning, réglages et examen sont synchronisés avec le compte (clé « study » de la progression) ;
// le minuteur en cours reste local à l'appareil (localStorage).
const pick = d => ({ sessions: d.sessions, plan: d.plan, settings: d.settings, exam: d.exam, at: d.at || 0 })
const sameJson = (x, y) => JSON.stringify(x) === JSON.stringify(y)
const KEY = 'residanat-studytime.v1'
const DEF_S = { focus: 25, short: 5, long: 15, every: 4, auto: false, sound: true, goal: 120 }
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3)
const z = n => String(n).padStart(2, '0')
const fmt = s => `${z(Math.floor(s / 60))}:${z(s % 60)}`
const hm = m => (m >= 60 ? `${Math.floor(m / 60)} h ${z(m % 60)}` : `${m} min`)
const parseDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (k, n) => { const d = parseDay(k); d.setDate(d.getDate() + n); return dayKey(d) }
const dayName = k => parseDay(k).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
const monday = k => { const d = parseDay(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(d) }
const LABEL = { focus: 'Concentration', short: 'Pause courte', long: 'Pause longue' }

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY))
    if (s && s.v === 1) return { settings: DEF_S, sessions: [], plan: [], exam: '', timer: null, ...s, settings: { ...DEF_S, ...(s.settings || {}) } }
  } catch (e) { /* ignore */ }
  return { v: 1, settings: DEF_S, sessions: [], plan: [], exam: '', timer: null }
}

let ctx
function beep(on) {
  if (!on) return
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    ;[0, 0.25, 0.5].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination)
      g.gain.setValueAtTime(0.15, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2)
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22)
    })
  } catch (e) { /* audio indisponible */ }
}
function notify(title, body) {
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body }) } catch (e) { /* ignore */ }
}

// Champ numérique qu'on peut vider pendant la saisie ; la valeur est validée en quittant le champ
function NumField({ label, value, min, max, onCommit }) {
  const [txt, setTxt] = useState(String(value))
  useEffect(() => { setTxt(String(value)) }, [value])
  const commit = () => {
    const v = Math.min(max, Math.max(min, Math.round(Number(txt)) || min))
    setTxt(String(v)); if (v !== value) onCommit(v)
  }
  return <label className="st-f">{label}<input type="number" inputMode="numeric" min={min} max={max} value={txt} onChange={e => setTxt(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} /></label>
}
const PRESETS = [
  { n: 'Classique', focus: 25, short: 5, long: 15, every: 4 },
  { n: 'Long', focus: 50, short: 10, long: 20, every: 3 },
  { n: 'Intensif', focus: 90, short: 15, long: 30, every: 2 },
]

export default function StudyTime({ index, study, onStudy }) {
  const [D, setD] = useState(() => { const l = load(); return study ? { ...l, ...mergeStudy(pick(l), study) } : l })
  // compte → page : fusion quand la progression distante arrive ou change
  useEffect(() => {
    if (!study) return
    setD(d => { const m = mergeStudy(pick(d), study); return sameJson(m, pick(d)) ? d : { ...d, ...m } })
  }, [study])
  // page → compte
  useEffect(() => { if (onStudy) onStudy(pick(D)) }, [D.sessions, D.plan, D.settings, D.exam, D.at])
  const [now, setNow] = useState(Date.now())
  const timerRef = useRef(null)
  const S = D.settings
  const dur = m => (m === 'focus' ? S.focus : m === 'short' ? S.short : S.long) * 60

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(D)) } catch (e) { /* quota */ } }, [D])

  // minuteur : { mode, running, endAt, left, cycle, planId, label }
  const T = D.timer || { mode: 'focus', running: false, endAt: null, left: S.focus * 60, cycle: 0, planId: '', label: '' }
  const left = T.running ? Math.max(0, Math.ceil((T.endAt - now) / 1000)) : T.left
  const setT = f => setD(d => ({ ...d, timer: f(d.timer || T) }))

  function complete(d, auto) {
    const t = d.timer, s = d.settings
    let sessions = d.sessions, plan = d.plan, cycle = t.cycle
    if (t.mode === 'focus') {
      sessions = [...sessions, { id: uid(), t: Date.now(), d: dayKey(), min: s.focus, label: t.label || '', planId: t.planId || '' }].slice(-500)
      if (t.planId) plan = plan.map(p => (p.id === t.planId ? { ...p, done: (p.done || 0) + 1 } : p))
      cycle += 1
    }
    const next = t.mode === 'focus' ? (cycle % s.every === 0 ? 'long' : 'short') : 'focus'
    const secs = (next === 'focus' ? s.focus : next === 'short' ? s.short : s.long) * 60
    return { ...d, sessions, plan, timer: { ...t, mode: next, cycle, left: secs, running: !!auto, endAt: auto ? Date.now() + secs * 1000 : null } }
  }

  // tick
  useEffect(() => {
    if (!T.running) return undefined
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [T.running])
  useEffect(() => {
    if (T.running && T.endAt - now <= 0) {
      // onglet fermé longtemps : on n'enregistre pas la séance
      const stale = now - T.endAt > 5 * 60 * 1000
      beep(S.sound && !stale)
      if (!stale) notify(T.mode === 'focus' ? 'Pomodoro terminé' : 'Pause terminée', T.mode === 'focus' ? 'Prends une pause.' : 'On reprend.')
      setD(d => (stale ? { ...d, timer: { ...d.timer, running: false, endAt: null, left: dur(d.timer.mode) } } : complete(d, S.auto)))
    }
  }, [now, T.running, T.endAt])
  useEffect(() => {
    document.title = T.running ? `${fmt(left)} · ${LABEL[T.mode]}` : 'Résidanat QCM'
    return () => { document.title = 'Résidanat QCM' }
  }, [left, T.running, T.mode])

  const start = () => {
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission() } catch (e) { /* ignore */ }
    setT(t => ({ ...t, running: true, endAt: Date.now() + t.left * 1000 })); setNow(Date.now())
  }
  const pause = () => setT(t => ({ ...t, running: false, left: Math.max(1, Math.ceil((t.endAt - Date.now()) / 1000)), endAt: null }))
  const reset = () => setT(t => ({ ...t, running: false, endAt: null, left: dur(t.mode) }))
  const skip = () => setD(d => { const t = d.timer || T; const next = t.mode === 'focus' ? 'short' : 'focus'; return { ...d, timer: { ...t, mode: next, running: false, endAt: null, left: dur(next) } } })
  const switchMode = m => setT(t => ({ ...t, mode: m, running: false, endAt: null, left: dur(m) }))
  const finishEarly = () => setD(d => {
    const t = d.timer || T, el = Math.round((dur('focus') - (t.running ? Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000)) : t.left)) / 60)
    if (t.mode !== 'focus' || el < 1) return d
    const plan = t.planId ? d.plan.map(p => (p.id === t.planId ? { ...p, done: (p.done || 0) + el / d.settings.focus } : p)) : d.plan
    return { ...d, sessions: [...d.sessions, { id: uid(), t: Date.now(), d: dayKey(), min: el, label: t.label || '', planId: t.planId || '' }], plan, timer: { ...t, running: false, endAt: null, left: dur('focus') } }
  })
  const setSet = (k, v) => setD(d => {
    const settings = { ...d.settings, [k]: v }, t = d.timer
    const reLeft = t && !t.running && k === { focus: 'focus', short: 'short', long: 'long' }[t.mode]
    return { ...d, settings, at: Date.now(), timer: reLeft ? { ...t, left: v * 60 } : t }
  })

  const applyPreset = p => setD(d => {
    const settings = { ...d.settings, focus: p.focus, short: p.short, long: p.long, every: p.every }, t = d.timer
    const m = t ? t.mode : 'focus'
    return { ...d, settings, at: Date.now(), timer: t && !t.running ? { ...t, left: settings[m] * 60 } : t }
  })

  const total = dur(T.mode)
  const pct = Math.min(100, Math.max(0, ((total - left) / total) * 100))

  // ----- suivi -----
  const today = dayKey()
  const byDay = useMemo(() => { const m = {}; for (const s of D.sessions) m[s.d] = (m[s.d] || 0) + s.min; return m }, [D.sessions])
  const week = [...Array(7)].map((_, i) => { const k = addDays(today, i - 6); return { k, m: byDay[k] || 0 } })
  const wmax = Math.max(S.goal, ...week.map(x => x.m), 1)
  const tMin = byDay[today] || 0
  const streak = (() => { let n = 0, k = byDay[today] ? today : addDays(today, -1); while (byDay[k]) { n++; k = addDays(k, -1) } return n })()
  const wTotal = week.reduce((a, x) => a + x.m, 0)
  const byLabel = useMemo(() => { const m = {}; for (const s of D.sessions.filter(x => x.d >= addDays(today, -6))) { const l = s.label || 'Sans sujet'; m[l] = (m[l] || 0) + s.min } return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6) }, [D.sessions])
  const todaySessions = D.sessions.filter(s => s.d === today).slice().reverse()
  const [man, setMan] = useState({ min: 25, label: '' })

  // ----- planificateur -----
  const [wk, setWk] = useState(0)
  const [form, setForm] = useState({ date: today, subject: '', topic: '', est: 2 })
  const subjects = (index && index.subjects ? index.subjects : []).map(s => s.name).filter(Boolean)
  const start0 = addDays(monday(today), wk * 7)
  const days = [...Array(7)].map((_, i) => addDays(start0, i))
  const overdue = D.plan.filter(p => p.date < today && !p.checked && (p.done || 0) < p.est)
  const addPlan = () => {
    if (!form.subject.trim() && !form.topic.trim()) return
    setD(d => ({ ...d, plan: [...d.plan, { id: uid(), date: form.date || today, subject: form.subject.trim(), topic: form.topic.trim(), est: Math.max(1, Number(form.est) || 1), done: 0, checked: false }] }))
    setForm(f => ({ ...f, topic: '' }))
  }
  const upd = (id, patch) => setD(d => ({ ...d, plan: d.plan.map(p => (p.id === id ? { ...p, ...patch } : p)) }))
  const del = id => setD(d => ({ ...d, plan: d.plan.filter(p => p.id !== id) }))
  const work = p => { setT(t => ({ ...t, planId: p.id, label: [p.subject, p.topic].filter(Boolean).join(' – ') })); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const daysToExam = D.exam ? Math.ceil((parseDay(D.exam) - parseDay(today)) / 86400000) : null
  const remaining = D.plan.filter(p => !p.checked).reduce((a, p) => a + Math.max(0, p.est - (p.done || 0)), 0)

  const planItem = p => {
    const dn = Math.min(p.est, Math.round((p.done || 0) * 10) / 10), ok = p.checked || (p.done || 0) >= p.est
    return (
      <li key={p.id} className={`st-item ${ok ? 'ok' : ''} ${T.planId === p.id ? 'cur' : ''}`}>
        <label className="st-chk"><input type="checkbox" checked={ok} onChange={e => upd(p.id, { checked: e.target.checked, done: e.target.checked ? Math.max(p.done || 0, p.est) : Math.min(p.done || 0, p.est - 1) })} /><span className="sr">Terminé</span></label>
        <div className="st-it"><b>{p.subject || p.topic}</b>{p.subject && p.topic ? <span className="muted small"> · {p.topic}</span> : null}<div className="muted small">{dn}/{p.est} pomodoro{p.est > 1 ? 's' : ''} · {p.est * S.focus} min</div></div>
        <button className="ghost st-mini" onClick={() => work(p)} aria-label="Travailler dessus">▶</button>
        <button className="ghost st-mini" onClick={() => del(p.id)} aria-label="Supprimer">✕</button>
      </li>
    )
  }

  return (
    <div className="st">
      <div className="page-h"><h1>Study time</h1><p className="muted">Pomodoro, suivi de ton temps d’étude et planning de révision.</p></div>

      <section className="card st-timer" aria-label="Minuteur Pomodoro">
        <div className="seg" role="group" aria-label="Mode">
          {['focus', 'short', 'long'].map(m => <button key={m} className={T.mode === m ? 'on' : ''} aria-pressed={T.mode === m} onClick={() => switchMode(m)}>{LABEL[m]}</button>)}
        </div>
        <div className="st-clock" role="timer" aria-live="off">{fmt(left)}</div>
        <div className="st-bar" aria-hidden="true"><i style={{ width: pct + '%' }} /></div>
        <p className="center muted small">Séance {(T.cycle % S.every) + (T.mode === 'focus' ? 1 : 0)} sur {S.every} avant la pause longue</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {T.running ? <button className="primary" onClick={pause}>Pause</button> : <button className="primary" onClick={start}>{left < dur(T.mode) ? 'Reprendre' : 'Démarrer'}</button>}
          <button onClick={reset}>Réinitialiser</button>
          <button onClick={skip}>Passer</button>
          {T.mode === 'focus' && left < dur('focus') && <button onClick={finishEarly}>Terminer et enregistrer</button>}
        </div>
        <div className="row">
          <label className="st-f" style={{ flex: 1 }}>Je travaille sur
            <input list="st-plans" value={T.label} placeholder="Sujet ou chapitre (facultatif)" onChange={e => setT(t => ({ ...t, label: e.target.value, planId: '' }))} />
          </label>
          <datalist id="st-plans">{[...new Set([...D.plan.filter(p => !p.checked).map(p => [p.subject, p.topic].filter(Boolean).join(' – ')), ...subjects.slice(0, 80)])].map(x => <option key={x} value={x} />)}</datalist>
        </div>
        {T.planId && <p className="muted small">Lié au planning : chaque pomodoro terminé compte dans l’objectif.</p>}
        <details className="st-set" open><summary>Personnaliser : durée de séance et de pause</summary>
          <div className="row st-presets" role="group" aria-label="Préréglages">
            {PRESETS.map(p => { const on = S.focus === p.focus && S.short === p.short && S.long === p.long && S.every === p.every; return <button key={p.n} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => applyPreset(p)}>{p.n} · {p.focus}/{p.short}</button> })}
          </div>
          <div className="st-grid">
            {[['focus', 'Durée de séance (min)', 1, 180], ['short', 'Pause courte (min)', 1, 60], ['long', 'Pause longue (min)', 1, 90], ['every', 'Séances avant pause longue', 2, 8], ['goal', 'Objectif du jour (min)', 15, 720]].map(([k, l, a, b]) => (
              <NumField key={k} label={l} value={S[k]} min={a} max={b} onCommit={v => setSet(k, v)} />
            ))}
          </div>
          <label className="st-chk2"><input type="checkbox" checked={S.auto} onChange={e => setSet('auto', e.target.checked)} /> Enchaîner automatiquement les séances et les pauses</label>
          <label className="st-chk2"><input type="checkbox" checked={S.sound} onChange={e => setSet('sound', e.target.checked)} /> Son à la fin</label>
          {T.running && <p className="muted small">Les nouvelles durées s’appliquent à la prochaine séance ou pause.</p>}
        </details>
      </section>

      <h2>Suivi</h2>
      <div className="stats">
        <div className="card"><div className="muted small">Aujourd’hui</div><div className="num st-n">{hm(tMin)}</div><div className="st-bar sm" aria-hidden="true"><i style={{ width: Math.min(100, (tMin / S.goal) * 100) + '%' }} /></div><div className="muted small">objectif {hm(S.goal)}{tMin >= S.goal ? ' · atteint' : ''}</div></div>
        <div className="card"><div className="muted small">7 derniers jours</div><div className="num st-n">{hm(wTotal)}</div><div className="muted small">moy. {hm(Math.round(wTotal / 7))} / jour</div></div>
        <div className="card"><div className="muted small">Série en cours</div><div className="num st-n">{streak} jour{streak > 1 ? 's' : ''}</div><div className="muted small">jours d’étude de suite</div></div>
      </div>
      <section className="card" aria-label="Temps d’étude sur 7 jours">
        <h3>Temps d’étude par jour</h3>
        <div className="st-chart" role="img" aria-label={`Minutes d’étude: ${week.map(x => `${dayName(x.k)} ${x.m}`).join(', ')}`}>
          {week.map(x => <div key={x.k} className="st-col"><div className="st-v">{x.m || ''}</div><div className="st-b" style={{ height: Math.max(2, (x.m / wmax) * 100) + '%' }} data-today={x.k === today} /><div className="st-d">{parseDay(x.k).toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 3)}</div></div>)}
        </div>
        {byLabel.length > 0 && <><h3 style={{ marginTop: 14 }}>Par sujet (7 jours)</h3><ul className="st-list">{byLabel.map(([l, m]) => <li key={l}><span>{l}</span><b>{hm(m)}</b></li>)}</ul></>}
      </section>
      <section className="card">
        <h3>Séances d’aujourd’hui</h3>
        {todaySessions.length ? <ul className="st-list">{todaySessions.map(s => <li key={s.id}><span>{new Date(s.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {s.label || 'Sans sujet'}</span><span><b>{s.min} min</b> <button className="ghost st-mini" aria-label="Supprimer la séance" onClick={() => setD(d => ({ ...d, sessions: d.sessions.filter(x => x.id !== s.id) }))}>✕</button></span></li>)}</ul> : <p className="muted">Aucune séance enregistrée aujourd’hui.</p>}
        <div className="row">
          <input aria-label="Sujet" list="st-plans" placeholder="Ajouter une séance déjà faite : sujet" value={man.label} onChange={e => setMan(m => ({ ...m, label: e.target.value }))} style={{ flex: 1, minWidth: 160 }} />
          <input aria-label="Minutes" type="number" min="1" max="600" value={man.min} onChange={e => setMan(m => ({ ...m, min: e.target.value }))} style={{ width: 80 }} />
          <button onClick={() => { const min = Math.min(600, Math.max(1, Number(man.min) || 0)); setD(d => ({ ...d, sessions: [...d.sessions, { id: uid(), t: Date.now(), d: dayKey(), min, label: man.label.trim(), planId: '' }] })); setMan(m => ({ ...m, label: '' })) }}>Ajouter</button>
        </div>
      </section>

      <h2>Planificateur</h2>
      <section className="card">
        <div className="row" style={{ marginTop: 0 }}>
          <label className="st-f">Date de l’examen
            <input type="date" value={D.exam} onChange={e => setD(d => ({ ...d, exam: e.target.value, at: Date.now() }))} />
          </label>
          {daysToExam !== null && <div><b className="num st-n">{daysToExam >= 0 ? `J-${daysToExam}` : 'passé'}</b>{daysToExam > 0 && remaining > 0 ? <div className="muted small">{remaining} pomodoros prévus restants · ~{Math.ceil(remaining / daysToExam)} par jour si tu les étales jusqu’à l’examen</div> : null}</div>}
        </div>
      </section>
      <section className="card">
        <h3>Ajouter une tâche d’étude</h3>
        <div className="st-grid">
          <label className="st-f">Jour<input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></label>
          <label className="st-f">Matière<input list="st-subj" value={form.subject} placeholder="ex. Cardiologie" onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} /></label>
          <label className="st-f">Chapitre / objectif<input value={form.topic} placeholder="ex. Douleur thoracique + 40 QCM" onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addPlan() }} /></label>
          <label className="st-f">Pomodoros<input type="number" min="1" max="16" value={form.est} onChange={e => setForm(f => ({ ...f, est: e.target.value }))} /></label>
        </div>
        <datalist id="st-subj">{subjects.map(x => <option key={x} value={x} />)}</datalist>
        <div className="row"><button className="primary" onClick={addPlan}>Ajouter au planning</button></div>
      </section>
      {overdue.length > 0 && (
        <section className="card st-late"><h3>En retard ({overdue.length})</h3>
          <ul className="st-plan">{overdue.map(planItem)}</ul>
          <div className="row"><button onClick={() => setD(d => ({ ...d, plan: d.plan.map(p => (overdue.some(o => o.id === p.id) ? { ...p, date: today } : p)) }))}>Tout reporter à aujourd’hui</button></div>
        </section>
      )}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="ghost" onClick={() => setWk(w => w - 1)}>← Semaine précédente</button>
        <b>{dayName(days[0])} → {dayName(days[6])}</b>
        <button className="ghost" onClick={() => setWk(w => w + 1)}>Semaine suivante →</button>
      </div>
      <div className="grid st-week">
        {days.map(k => {
          const it = D.plan.filter(p => p.date === k)
          const est = it.reduce((a, p) => a + p.est, 0), dn = it.reduce((a, p) => a + Math.min(p.est, p.done || 0), 0)
          return (
            <section key={k} className={`card ${k === today ? 'st-today' : ''}`}>
              <div className="row" style={{ margin: 0, justifyContent: 'space-between' }}><b>{dayName(k)}{k === today ? ' · aujourd’hui' : ''}</b><span className="muted small">{est ? `${Math.round(dn * 10) / 10}/${est}` : ''}</span></div>
              {it.length ? <ul className="st-plan">{it.map(planItem)}</ul> : <p className="muted small">Rien de prévu.</p>}
            </section>
          )
        })}
      </div>
    </div>
  )
}
