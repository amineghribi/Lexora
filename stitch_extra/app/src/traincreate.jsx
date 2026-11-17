import React, { useMemo, useState } from 'react'
import { useMeta } from './data.js'
import { expandCases } from './logic.js'
import './traincreate.css'

/* ===== Créer ma série — mise en page de la maquette « créer ma série » =====
   Itération 1 : structure et contrôles (spécialités, volume, niveau, typologie) + barre de
   lancement. Les compteurs viennent de l'index réel ; le tirage réutilise la logique existante
   (`expandCases`) et part vers le même `onStart` que l'écran historique. */

const VOLUMES = [10, 25, 50, 75, 100]
const LEVELS = [['all', 'Toutes'], ['concours', 'Concours'], ['hard', 'Difficile']]
const TYPES = [
  ['errors', 'Questions déjà ratées', 'Priorité aux items non assimilés'],
  ['favs', 'Questions marquées', 'Mises de côté pour relecture'],
  ['new', 'Questions jamais vues', 'Découverte de nouveaux items'],
  ['memory', 'Mémoire', 'Répétition espacée programmée'],
]

export function TrainCreate({ index, state, onStart, onBack }) {
  const { rows: pool } = useMeta(null)
  const [sel, setSel] = useState(() => new Set())
  const [n, setN] = useState(40)
  const [level, setLevel] = useState('all')
  const [type, setType] = useState('errors')

  const specs = useMemo(() => {
    const m = new Map()
    for (const s of index.series || []) {
      if (!s.sp) continue
      const cur = m.get(s.sp) || { sp: s.sp, ids: new Set(), series: 0 }
      cur.series += 1
      for (const q of s.q || []) cur.ids.add(q)
      m.set(s.sp, cur)
    }
    return [...m.values()].map(x => ({ sp: x.sp, series: x.series, n: x.ids.size, ids: [...x.ids] })).sort((a, b) => b.n - a.n)
  }, [index.series])

  const toggle = sp => setSel(prev => { const s = new Set(prev); s.has(sp) ? s.delete(sp) : s.add(sp); return s })
  const allOn = sel.size === 0 || sel.size === specs.length

  const launch = () => {
    if (!pool) return
    const scope = sel.size ? specs.filter(s => sel.has(s.sp)).flatMap(s => s.ids) : specs.flatMap(s => s.ids)
    const allowed = new Set(scope)
    const seen = (state && state.cards) || {}
    let rows = pool.filter(e => e.p && e.f !== 'x' && allowed.has(e.i))
    if (type === 'new') rows = rows.filter(e => !seen[e.i])
    if (level === 'concours') rows = rows.filter(e => e.fr && e.fr[0] >= 2)
    if (level === 'hard') rows = rows.filter(e => e.fr && e.fr[1] >= 3)
    rows = rows.map(e => ({ e, r: Math.random() })).sort((a, b) => ((b.e.fr && b.e.fr[0]) || 0) - ((a.e.fr && a.e.fr[0]) || 0) || a.r - b.r)
    const ids = expandCases(rows.slice(0, n).map(x => x.e.i), index, n)
    if (!ids.length) return
    const label = sel.size === 0 ? 'Toutes spécialités' : [...sel].length <= 2 ? [...sel].join(' + ') : `${sel.size} spécialités`
    onStart({ title: `Série sur mesure — ${label}`, ids, subjectHint: null, mode: 'immediate', kind: 'custom' })
  }

  const scopeLabel = sel.size === 0 ? 'Toutes spécialités' : sel.size <= 2 ? [...sel].join(', ') : `${sel.size} spécialités`

  return (
    <div className="tc">
      <div className="tc-top">
        {onBack && <button type="button" className="ghost" onClick={onBack}>← S’entraîner</button>}
        <span className="tc-crumb">Session sur mesure</span>
      </div>

      <header className="tc-head">
        <div>
          <span className="tc-eyebrow">Ciblage intelligent</span>
          <h1>Créer ma série</h1>
          <p className="muted">Configure tes révisions selon tes lacunes, puis lance la série.</p>
        </div>
      </header>

      <section className="tc-block">
        <div className="tc-block-h">
          <h2>1. Spécialités</h2>
          <button type="button" className="link" onClick={() => setSel(new Set())}>Tout sélectionner</button>
        </div>
        <ul className="tc-specs">
          {specs.map(s => {
            const on = sel.has(s.sp)
            return (
              <li key={s.sp}>
                <button type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => toggle(s.sp)}>
                  <span className="nm">{s.sp}</span>
                  <span className="ct">{s.n}</span>
                  {on && <span className="ck" aria-hidden="true">✓</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="tc-block">
        <div className="tc-block-h"><h2>2. Volume de questions</h2><b className="tc-val">{n} QCM</b></div>
        <div className="tc-seg">
          {VOLUMES.map(v => <button key={v} type="button" aria-pressed={n === v} className={n === v ? 'on' : ''} onClick={() => setN(v)}>{v}</button>)}
          <label className="tc-custom">autre <input type="number" min="5" max="200" value={n} onChange={e => setN(Math.max(5, Math.min(200, Number(e.target.value) || 5)))} aria-label="Nombre de questions" /></label>
        </div>
      </section>

      <section className="tc-block">
        <div className="tc-block-h"><h2>3. Niveau d’exigence</h2></div>
        <div className="tc-seg">
          {LEVELS.map(([k, label]) => <button key={k} type="button" aria-pressed={level === k} className={level === k ? 'on' : ''} onClick={() => setLevel(k)}>{label}</button>)}
        </div>
      </section>

      <section className="tc-block">
        <div className="tc-block-h"><h2>4. Typologie & historique</h2></div>
        <ul className="tc-types">
          {TYPES.map(([k, label, desc]) => (
            <li key={k}>
              <button type="button" className={type === k ? 'on' : ''} aria-pressed={type === k} onClick={() => setType(k)}>
                <b>{label}</b><span>{desc}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="tc-launch">
        <span className="tc-sum"><b>{n} questions</b> · {scopeLabel}</span>
        <button type="button" className="primary" onClick={launch} disabled={!pool}>Lancer la série ({n} QCM) →</button>
      </div>
    </div>
  )
}
