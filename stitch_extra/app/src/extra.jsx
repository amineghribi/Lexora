import React, { useEffect, useMemo, useState } from 'react'
import { useMeta, loadMeta, inDay, getQ, searchQuestions, loadWithAnswers, errorText } from './data.js'
import { dayKey, dueIds } from './store.js'
import { pct, expandCases } from './logic.js'

const SERIES_SIZE = 50
const WEAK = 60 // en dessous, la série est signalée « à refaire »
const playable = e => e.p && e.f !== 'x'
const weight = e => (e.fr ? e.fr[0] * (e.fr[1] || 1) : 1)

function useScope(index) {
  const sps = useMemo(() => [...new Set(index.series.map(s => s.sp))].sort(), [index])
  const spSn = useMemo(() => { const m = {}; for (const s of index.series) if (s.sn) (m[s.sp] = m[s.sp] || new Set()).add(s.sn); return m }, [index])
  const [sp, setSp] = useState('')
  const [sn, setSn] = useState('')
  const courses = useMemo(() => index.subjects.filter(s => !sp || (spSn[sp] && spSn[sp].has(s.no))), [index, sp, spSn])
  const scope = useMemo(() => (sn ? [Number(sn)] : courses.map(s => s.no)), [sn, courses])
  return { sps, sp, setSp, sn, setSn, courses, scope }
}

function ScopePicker({ sc, allowAll = true }) {
  return (
    <div className="filters">
      <label>Spécialité<select value={sc.sp} onChange={e => { sc.setSp(e.target.value); sc.setSn('') }}><option value="">Toutes les spécialités</option>{sc.sps.map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Cours<select value={sc.sn} onChange={e => sc.setSn(e.target.value)}>{allowAll && <option value="">Tous les cours ({sc.courses.length})</option>}{!allowAll && <option value="">Choisir un cours…</option>}{sc.courses.map(s => <option key={s.no} value={s.no}>{s.name}</option>)}</select></label>
    </div>
  )
}

/* ---------- Examen blanc ---------- */
// Tirage pondéré sans remise (Efraimidis-Spirakis) : poids = fréquence × niveau de chute
function weightedPick(list, n) {
  return list.map(e => ({ e, k: Math.pow(Math.random(), 1 / weight(e)) })).sort((a, b) => b.k - a.k).slice(0, n).map(x => x.e)
}

/* Sélecteur multiple : spécialités (chips) + cours (liste cochable). Sélection vide = tout. */
function MultiScope({ index, sel, setSel }) {
  const [find, setFind] = useState('')
  const [show, setShow] = useState(false)
  const valid = useMemo(() => new Set(index.subjects.map(s => s.no)), [index])
  const spList = useMemo(() => {
    const m = {}
    for (const s of index.series) if (s.sn && valid.has(s.sn)) (m[s.sp] = m[s.sp] || new Set()).add(s.sn)
    return Object.keys(m).sort().map(sp => ({ sp, ids: [...m[sp]] }))
  }, [index, valid])
  const byNo = useMemo(() => new Map(index.subjects.map(s => [s.no, s])), [index])
  const fold = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const visible = index.subjects.filter(s => !find.trim() || fold(s.name).includes(fold(find.trim())))
  const toggle = no => setSel(o => { const x = new Set(o); x.has(no) ? x.delete(no) : x.add(no); return x })
  const spState = ids => { const k = ids.filter(i => sel.has(i)).length; return k === 0 ? 'none' : k === ids.length ? 'all' : 'some' }
  const toggleSp = ids => setSel(o => { const x = new Set(o); if (ids.every(i => x.has(i))) ids.forEach(i => x.delete(i)); else ids.forEach(i => x.add(i)); return x })
  const chosen = [...sel].map(no => byNo.get(no)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  return (
    <>
      <div className="cs-lab">Spécialités <span className="muted small">(plusieurs possibles)</span></div>
      <div className="cs-chips" role="group" aria-label="Spécialités">
        {spList.map(({ sp, ids }) => { const st = spState(ids); const k = ids.filter(i => sel.has(i)).length; return (
          <button key={sp} type="button" className={`cs-chip ${st}`} aria-pressed={st === 'all'} onClick={() => toggleSp(ids)}>{st === 'all' ? '✓ ' : ''}{sp}<small>{st === 'some' ? `${k}/${ids.length}` : ids.length}</small></button>) })}
      </div>
      <div className="cs-sel" aria-live="polite">
        {sel.size === 0
          ? <span className="muted small">Aucune sélection : l’examen utilise <b>toutes les matières</b>.</span>
          : <>
              <div className="cs-tags">
                {chosen.slice(0, 12).map(s => <button key={s.no} type="button" className="cs-tag" onClick={() => toggle(s.no)} aria-label={`Retirer ${s.name}`}>{s.name} <span aria-hidden="true">×</span></button>)}
                {chosen.length > 12 && <span className="muted small">+ {chosen.length - 12} autres</span>}
              </div>
              <button type="button" className="link" onClick={() => setSel(new Set())}>Tout effacer ({sel.size})</button>
            </>}
      </div>
      <div className="cs-lab">Cours <span className="muted small">(autant que tu veux, même de spécialités différentes)</span></div>
      <div className="cs-find">
        <input type="search" placeholder="Rechercher un cours, ex. diabète" value={find} onChange={e => { setFind(e.target.value); setShow(true) }} onFocus={() => setShow(true)} aria-label="Rechercher un cours" />
        <button type="button" className="ghost" onClick={() => setShow(v => !v)} aria-expanded={show}>{show ? 'Masquer la liste' : `Afficher les ${index.subjects.length} cours`}</button>
      </div>
      {show && (
        <div className="cs-box">
          <div className="cs-bar small">
            <span className="muted">{visible.length} cours{find.trim() ? ' trouvés' : ''}</span>
            <span><button type="button" className="link" onClick={() => setSel(o => { const x = new Set(o); visible.forEach(s => x.add(s.no)); return x })}>Tout cocher{find.trim() ? ' (résultats)' : ''}</button> · <button type="button" className="link" onClick={() => setSel(new Set())}>Tout décocher</button></span>
          </div>
          <ul className="cs-list">
            {visible.map(s => <li key={s.no}><label className={sel.has(s.no) ? 'on' : ''}><input type="checkbox" checked={sel.has(s.no)} onChange={() => toggle(s.no)} /><span>{s.name}</span></label></li>)}
            {!visible.length && <li className="muted small" style={{ padding: 10 }}>Aucun cours ne correspond.</li>}
          </ul>
        </div>
      )}
    </>
  )
}
export function ExamBlanc({ index, state, onStart, initialMode }) {
  const [sel, setSel] = useState(() => new Set())
  const [n, setN] = useState(60)
  const [minPer, setMinPer] = useState(1.2)
  const [day, setDay] = useState('')
  const [corr, setCorr] = useState(initialMode || 'immediate')
  const [timed, setTimed] = useState(true)
  const { rows: raw, error: poolErr } = useMeta(null)
  const pool = useMemo(() => (raw ? raw.filter(e => playable(e) && (!sel.size || sel.has(e.sn)) && inDay(index, e.i, day)) : null), [raw, sel, day, index])
  const duration = timed ? Math.round(n * minPer) : null
  const scopeName = !sel.size ? 'Toutes spécialités' : sel.size === 1 ? ((index.subjects.find(s => s.no === [...sel][0]) || {}).name || '1 cours') : `${sel.size} cours`
  const launch = () => {
    const picked = weightedPick(pool, n)
    // regroupe les cas cliniques consécutifs : tri stable par cas
    onStart({ title: `Examen blanc${day ? ' ' + day : ''} — ${scopeName}`, ids: expandCases(picked.map(e => e.i), index, n), mode: corr, duration, kind: 'exam' })
  }
  const hist = (state.sessions || []).filter(s => s.exam).slice(-8).reverse()
  return (
    <div>
      <div className="page-h"><h1>Examen blanc</h1><p className="muted">Série avec ou sans chronomètre, avec correction directement après chaque réponse (par défaut) ou à la fin. Les questions fréquentes aux examens passés et à fort taux de chute sont tirées en priorité.</p></div>
      <section className="card">
        <h2 className="step"><span>1</span>Périmètre</h2>
        <MultiScope index={index} sel={sel} setSel={setSel} />
      </section>
      <section className="card">
        <h2 className="step"><span>2</span>Réglages</h2>
        <fieldset className="seg"><legend>Nombre de questions</legend>
          {[30, 60, 100, 120].map(v => <button key={v} aria-pressed={n === v} className={n === v ? 'on' : ''} onClick={() => setN(v)}>{v}</button>)}
          <label className="cs-n">autre <input type="number" min="1" max="200" inputMode="numeric" value={n} onChange={e => setN(Math.max(1, Math.min(200, Math.floor(Number(e.target.value) || 1))))} aria-label="Nombre de questions personnalisé" /></label>
        </fieldset>
        <fieldset className="seg"><legend>Jour d’examen</legend>
          {[['', 'J1 + J2'], ['J1', 'J1'], ['J2', 'J2']].map(([v, t]) => <button key={v} aria-pressed={day === v} className={day === v ? 'on' : ''} onClick={() => setDay(v)}>{t}</button>)}
        </fieldset>
        <fieldset className="seg"><legend>Correction</legend>
          {[['immediate', 'Directe (après chaque réponse)'], ['end', 'À la fin']].map(([v, t]) => <button key={v} aria-pressed={corr === v} className={corr === v ? 'on' : ''} onClick={() => setCorr(v)}>{t}</button>)}
        </fieldset>
        <fieldset className="seg"><legend>Chronomètre</legend>
          {[[true, 'Avec chronomètre'], [false, 'Sans chronomètre']].map(([v, t]) => <button key={String(v)} aria-pressed={timed === v} className={timed === v ? 'on' : ''} onClick={() => setTimed(v)}>{t}</button>)}
        </fieldset>
        {timed && <fieldset className="seg"><legend>Rythme</legend>
          {[[1, '1 min / question'], [1.2, '1 min 12 s'], [1.5, '1 min 30 s']].map(([v, t]) => <button key={v} aria-pressed={minPer === v} className={minPer === v ? 'on' : ''} onClick={() => setMinPer(v)}>{t}</button>)}
        </fieldset>}
        {timed ? <p className="muted">Durée totale : <b>{duration} min</b>. À la fin du temps, les questions restantes comptent comme fausses.</p> : <p className="muted">Sans limite de temps : prends le temps qu’il te faut.</p>}
      </section>
      <div className="launch">
        <div>{pool ? <><b>{Math.min(n, pool.length)}</b> questions tirées parmi {pool.length.toLocaleString('fr')}</> : poolErr ? errorText(poolErr) : 'Chargement…'}</div>
        <button className="primary big" disabled={!pool || !pool.length} onClick={launch}>Démarrer{timed ? ` ⏱ ${duration} min` : ''}</button>
      </div>
      {hist.length > 0 && (
        <div className="card">
          <h3>Derniers examens blancs</h3>
          <table className="tbl"><tbody>
            {hist.map((s, k) => <tr key={k}><td>{s.d}</td><td>{s.title.replace('Examen blanc — ', '')}</td><td><b>{String(Math.round(((typeof s.pts === 'number' ? s.pts : s.ok) / s.n) * 200) / 10).replace('.', ',')}/20</b></td><td>{pct(typeof s.pts === 'number' ? s.pts : s.ok, s.n)}%</td><td>{Math.floor(s.sec / 60)} min</td></tr>)}
          </tbody></table>
        </div>
      )}
    </div>
  )
}

/* ---------- Priorités ---------- */
const COUNTS = [10, 20, 30, 50, 100]
const SORTS = [['prio', 'Priorité (points à gagner)'], ['weak', 'Plus faible réussite'], ['new', 'Moins travaillés'], ['az', 'Ordre alphabétique']]
const STATES = [['', 'Tous'], ['new', 'Jamais travaillés'], ['seen', 'Commencés'], ['redo', 'À refaire']]
const PAGE = 15
const levelOf = p => (p >= 0.66 ? ['high', 'Haute'] : p >= 0.33 ? ['mid', 'Moyenne'] : ['low', 'Basse'])
const fold = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function Priorities({ index, state, onStart }) {
  const [all, setAll] = useState(null)
  const [allErr, setAllErr] = useState(null)
  useEffect(() => { loadMeta().then(setAll).catch(setAllErr) }, [])
  const rows = useMemo(() => {
    if (!all) return null
    const by = new Map()
    for (const e of all) {
      if (!playable(e) || !e.sn) continue
      const g = by.get(e.sn) || { sn: e.sn, qs: [], loss: 0, total: 0, seen: 0, wrong: 0 }
      const c = state.cards[e.i]
      const w = weight(e)
      const pf = c ? c.wrong / c.seen : 0.6 // inconnu : 60 % de risque
      g.qs.push(e); g.total += w; g.loss += w * pf
      if (c) { g.seen++; g.wrong += c.wrong > 0 ? 1 : 0 }
      by.set(e.sn, g)
    }
    const maxLoss = Math.max(1, ...[...by.values()].map(g => g.loss))
    return [...by.values()].map(g => ({ ...g, prio: g.loss / maxLoss, name: (index.subjects.find(s => s.no === g.sn) || {}).name || `Cours ${g.sn}` })).sort((a, b) => b.loss - a.loss)
  }, [all, state.cards])
  const [sp, setSp] = useState('')
  const [q, setQ] = useState('')
  const [st, setSt] = useState('')
  const [sort, setSort] = useState('prio')
  const [open, setOpen] = useState(() => new Set())
  const [limit, setLimit] = useState(PAGE)
  const [count, setCount] = useState(() => { try { const n = Number(localStorage.getItem('prio-count')); return COUNTS.includes(n) ? n : 30 } catch (e) { return 30 } })
  const pick = n => { setCount(n); try { localStorage.setItem('prio-count', String(n)) } catch (e) { /* ignore */ } }
  const sps = useMemo(() => [...new Set(index.series.map(s => s.sp))].sort(), [index])
  const spSn = useMemo(() => { const m = {}; for (const s of index.series) if (s.sn) (m[s.sp] = m[s.sp] || new Set()).add(s.sn); return m }, [index])
  const lastOk = useMemo(() => { const m = new Map(); for (const a of state.attempts || []) { const o = m.get(a.q); if (!o || a.t >= o.t) m.set(a.q, { t: a.t, ok: a.ok }) } return m }, [state.attempts])
  // Séries de 50 par cours : découpage fixe (par identifiant), progression et réussite de chaque série
  const info = useMemo(() => {
    const m = new Map()
    if (!rows) return m
    for (const g of rows) {
      const ids = g.qs.map(e => e.i).sort()
      const ser = []
      for (let k = 0; k * SERIES_SIZE < ids.length; k++) {
        const part = ids.slice(k * SERIES_SIZE, (k + 1) * SERIES_SIZE)
        let done = 0, ok = 0
        for (const i of part) { const r = lastOk.get(i); if (r) { done++; if (r.ok) ok++ } }
        const rate = done ? Math.round((ok / done) * 100) : null
        ser.push({ k: k + 1, ids: part, done, ok, rate, weak: done >= Math.min(10, part.length) && rate < WEAK })
      }
      const weak = ser.filter(x => x.weak).sort((a, b) => a.rate - b.rate)
      const fin = ser.filter(x => x.done >= x.ids.length).length
      // « Continuer » : d'abord une série entamée, sinon la première jamais ouverte
      const next = ser.find(x => x.done > 0 && x.done < x.ids.length) || ser.find(x => x.done === 0) || null
      m.set(g.sn, { ser, weak, fin, next })
    }
    return m
  }, [rows, lastOk])
  if (allErr) return <div className="card" role="alert">{errorText(allErr)}</div>
  if (!rows) return <div className="card">Calcul des priorités sur toute la banque…</div>

  const rate = g => (g.seen ? (g.seen - g.wrong) / g.seen : null)
  const inSp = g => !sp || (spSn[sp] && spSn[sp].has(g.sn))
  const filtered = rows.filter(g => inSp(g) && (!q.trim() || fold(g.name).includes(fold(q.trim()))) && (!st || (st === 'new' ? g.seen === 0 : st === 'seen' ? g.seen > 0 : (info.get(g.sn).weak.length > 0))))
  const cmp = {
    prio: (a, b) => b.loss - a.loss,
    weak: (a, b) => (rate(a) == null) - (rate(b) == null) || (rate(a) ?? 1) - (rate(b) ?? 1) || b.loss - a.loss,
    new: (a, b) => a.seen / a.qs.length - b.seen / b.qs.length || b.loss - a.loss,
    az: (a, b) => a.name.localeCompare(b.name, 'fr'),
  }[sort]
  const shown = filtered.slice().sort(cmp)
  const rank = new Map(rows.map((g, i) => [g.sn, i + 1]))
  const filtering = !!(q.trim() || st || sp)
  const top = rows.filter(inSp).slice(0, 3)

  const tot = rows.reduce((a, g) => ({ qs: a.qs + g.qs.length, seen: a.seen + g.seen, wrong: a.wrong + g.wrong, redo: a.redo + info.get(g.sn).weak.length }), { qs: 0, seen: 0, wrong: 0, redo: 0 })
  const startSeries = (g, s) => onStart({ title: `${g.name} — Série ${s.k}/${info.get(g.sn).ser.length}`, ids: s.ids, subjectHint: g.sn, seriesId: `prio-${g.sn}-${s.k}`, mode: 'immediate', kind: 'priority' })
  const start = g => {
    const due = new Set(dueIds(state, dayKey()))
    const sc = g.qs.map(e => ({ e, s: (due.has(e.i) ? 1000 : 0) + (state.cards[e.i] && state.cards[e.i].wrong ? 500 : 0) + (state.cards[e.i] ? 0 : weight(e)) + Math.random() })).sort((a, b) => b.s - a.s)
    onStart({ title: `Priorité — ${g.name}`, ids: expandCases(sc.map(x => x.e.i), index, count), subjectHint: g.sn, mode: 'immediate', kind: 'priority' })
  }
  const toggle = sn => setOpen(o => { const n = new Set(o); n.has(sn) ? n.delete(sn) : n.add(sn); return n })
  const reset = () => { setSp(''); setQ(''); setSt(''); setLimit(PAGE) }

  const Stats = g => (
    <span className="muted small">{g.seen}/{g.qs.length} vues · {g.seen ? `${pct(g.seen - g.wrong, g.seen)} % réussies` : 'jamais travaillé'}</span>
  )

  return (
    <div className="pr">
      <div className="page-h">
        <h1>Priorités de révision</h1>
        <p className="muted">Les cours où tu perds le plus de points, classés par rentabilité : fréquence aux examens × taux de chute × risque d’erreur (tes erreurs, ou 60 % si tu n’as pas encore vu la question).</p>
      </div>

      <div className="pr-stats" aria-label="Résumé">
        <div><b>{rows.length}</b><span>cours</span></div>
        <div><b>{tot.seen}<small>/{tot.qs}</small></b><span>questions vues</span></div>
        <div><b>{tot.seen ? `${pct(tot.seen - tot.wrong, tot.seen)} %` : '—'}</b><span>réussite globale</span></div>
        <div className={tot.redo ? 'warn' : ''}><b>{tot.redo}</b><span>séries à refaire</span></div>
      </div>

      {!filtering && sort === 'prio' && top.length > 0 && (
        <section className="pr-top" aria-label="Par où commencer">
          <h2>Commence ici</h2>
          <div className="pr-top-g">
            {top.map((g, i) => (
              <div key={g.sn} className="pr-topc">
                <span className="pr-rank">{i + 1}</span>
                <b>{g.name}</b>
                {Stats(g)}
                <button className="primary" onClick={() => start(g)}>Réviser {Math.min(count, g.qs.length)} questions</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="pr-tools card">
        <div className="filters">
          <label>Spécialité<select value={sp} onChange={e => { setSp(e.target.value); setLimit(PAGE) }}><option value="">Toutes</option>{sps.map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Trier par<select value={sort} onChange={e => setSort(e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Recherche<input type="search" placeholder="ex. diabète" value={q} onChange={e => { setQ(e.target.value); setLimit(PAGE) }} /></label>
        </div>
        <div className="pr-line" role="group" aria-label="Filtrer par état">
          {STATES.map(([v, l]) => <button key={v} type="button" className={`pchip ${st === v ? 'on' : ''}`} aria-pressed={st === v} onClick={() => { setSt(v); setLimit(PAGE) }}>{l}</button>)}
        </div>
        <div className="pr-line" role="group" aria-label="Nombre de questions par révision">
          <span className="muted small">Questions par révision</span>
          <div className="seg2">{COUNTS.map(n => <button key={n} type="button" className={count === n ? 'on' : ''} aria-pressed={count === n} onClick={() => pick(n)}>{n}</button>)}</div>
        </div>
      </div>

      <div className="pr-count muted small" aria-live="polite">{shown.length} cours{filtering ? ' correspondent' : ''}{filtering && <> · <button type="button" className="link" onClick={reset}>Tout afficher</button></>}</div>

      {!shown.length && <div className="card"><p className="muted">Aucun cours ne correspond à ces filtres.</p><button className="ghost" onClick={reset}>Réinitialiser les filtres</button></div>}

      <ol className="pr-list">
        {shown.slice(0, limit).map(g => {
          const inf = info.get(g.sn)
          const [lv, lvl] = levelOf(g.prio)
          const isOpen = open.has(g.sn)
          const w0 = inf.weak[0]
          return (
            <li key={g.sn} className={`pr-row ${lv}`}>
              <div className="pr-head">
                <span className="pr-rank" title="Rang de priorité">{rank.get(g.sn)}</span>
                <div className="pr-title">
                  <b>{g.name}</b>
                  <span className={`lvl ${lv}`}>{lvl}</span>
                </div>
                {Stats(g)}
              </div>
              <div className="pr-bars">
                <div className="bar2" role="img" aria-label={`Priorité ${Math.round(g.prio * 100)} %`}><div className={lv} style={{ width: `${Math.max(3, Math.round(g.prio * 100))}%` }} /></div>
                <span className="small muted">Priorité {Math.round(g.prio * 100)} %</span>
              </div>
              <div className="pr-act">
                <button className="primary" onClick={() => start(g)}>Réviser {Math.min(count, g.qs.length)} questions</button>
                {w0
                  ? <button className="ghost" onClick={() => startSeries(g, w0)}>Refaire S{w0.k} ({w0.rate} %)</button>
                  : inf.next && <button className="ghost" onClick={() => startSeries(g, inf.next)}>{inf.next.done ? 'Continuer' : 'Commencer'} S{inf.next.k}</button>}
                <button className="ghost pr-tg" aria-expanded={isOpen} onClick={() => toggle(g.sn)}>{inf.ser.length} séries · {inf.fin} finie{inf.fin > 1 ? 's' : ''}{inf.weak.length ? ` · ${inf.weak.length} à refaire` : ''} <span aria-hidden="true">{isOpen ? '▴' : '▾'}</span></button>
              </div>
              {isOpen && (
                <div className="pser">
                  <div className="ptiles">
                    {inf.ser.map(x => (
                      <button key={x.k} type="button" className={`ptile ${x.rate == null ? 'none' : x.weak ? 'weak' : x.rate >= 80 ? 'good' : 'mid'}`}
                        title={`Série ${x.k} : ${x.ids.length} questions · ${x.done} faites${x.rate == null ? '' : ` · ${x.rate} % de réussite`}`}
                        aria-label={`Série ${x.k}, ${x.ids.length} questions, ${x.done} faites${x.rate == null ? '' : `, ${x.rate} pour cent de réussite`}`}
                        onClick={() => startSeries(g, x)}>
                        <b>S{x.k}</b><span>{x.rate == null ? '—' : `${x.rate}%`}</span><small>{x.done}/{x.ids.length}</small>
                      </button>
                    ))}
                  </div>
                  <div className="plegend small muted"><i className="none" />pas commencée <i className="weak" />à refaire (&lt; {WEAK} %) <i className="mid" />{WEAK}–79 % <i className="good" />≥ 80 %</div>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {shown.length > limit && <div className="center"><button className="ghost" onClick={() => setLimit(l => l + PAGE)}>Afficher {Math.min(PAGE, shown.length - limit)} cours de plus ({shown.length - limit} restants)</button></div>}
    </div>
  )
}

/* ---------- Recherche et favoris ---------- */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
export function SearchView({ index, state, setState, onStart }) {
  const sc = useScope(index)
  const [q, setQ] = useState('')
  const [favs, setFavs] = useState(null)
  const [favErr, setFavErr] = useState(null)
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [searchErr, setSearchErr] = useState(null)
  const favKey = Object.keys(state.favs || {}).sort().join(',')
  const scopeKey = sc.sn ? [Number(sc.sn)].join(',') : (sc.sp ? sc.scope.join(',') : '')
  // recherche côté serveur, après une courte pause de frappe (30 résultats au plus)
  useEffect(() => {
    const t = norm(q).trim()
    setSearchErr(null)
    if (t.length < 3) { setRes(null); setBusy(false); return undefined }
    let live = true
    setBusy(true)
    const h = setTimeout(() => {
      searchQuestions(t.split(/\s+/).slice(0, 6), scopeKey ? scopeKey.split(',').map(Number) : null)
        .then(l => { if (live) { setRes(l); setBusy(false) } })
        .catch(er => { if (live) { setRes(null); setBusy(false); setSearchErr(er) } })
    }, 600)
    return () => { live = false; clearTimeout(h) }
  }, [q, scopeKey])
  useEffect(() => {
    let live = true
    const ids = Object.keys(state.favs || {})
    setFavErr(null)
    if (!ids.length) { setFavs([]); return undefined }
    loadWithAnswers(ids).then(l => { if (live) setFavs(l) }).catch(er => { if (live) { setFavs([]); setFavErr(er) } })
    return () => { live = false }
  }, [favKey])
  const toggle = e => setState(s => { const f = { ...(s.favs || {}) }; if (f[e.i]) delete f[e.i]; else f[e.i] = e.sn || 0; return { ...s, favs: f } })
  const Item = ({ e }) => (
    <details className="det">
      <summary>{e.q.slice(0, 120)}</summary>
      {Object.entries(e.o).map(([L, t]) => <div key={L} className={`line ${e.c && e.c.includes(L) ? 'good' : ''}`}><b>{L}</b> {t}</div>)}
      {e.w && <p className="muted">{e.w}</p>}
      <button className={`star ${state.favs && state.favs[e.i] ? 'on' : ''}`} onClick={() => toggle(e)}>{state.favs && state.favs[e.i] ? '★ Favori' : '☆ Favori'}</button>
    </details>
  )
  return (
    <div>
      <div className="page-h"><h1>Recherche et favoris</h1><p className="muted">Recherche dans les énoncés, propositions et explications (sans accents ni majuscules).</p></div>
      <ScopePicker sc={sc} />
      <div className="filters one"><label>Recherche<input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="ex. struvite, colique néphrétique" autoFocus /></label></div>
      {busy && <div className="card">Recherche…</div>}
      {searchErr && <div className="card" role="alert">{errorText(searchErr)}</div>}
      {res && !busy && (
        <div className="card">
          <h3>{res.length} résultat{res.length > 1 ? 's' : ''}{res.length >= 30 ? ' (30 premiers résultats : précise ta recherche)' : ''}</h3>
          {res.length > 0 && <button className="primary" onClick={() => onStart({ title: `Recherche : ${q}`, ids: res.slice(0, 40).map(e => e.i), mode: 'immediate', kind: 'search' })}>Lancer ces questions ({Math.min(res.length, 40)})</button>}
          {res.slice(0, 60).map(e => <Item key={e.i} e={e} />)}
        </div>
      )}
      <div className="card">
        <h3>Favoris ({favs ? favs.length : '…'})</h3>
        {favErr && <p className="muted" role="alert">{errorText(favErr)}</p>}
        {favs && !favs.length && !favErr && <p className="muted">Marque une question avec ☆ Favori pendant une série.</p>}
        {favs && favs.length > 0 && <button className="primary" onClick={() => onStart({ title: 'Mes favoris', ids: favs.map(e => e.i), mode: 'immediate', kind: 'favs' })}>Réviser mes favoris ({favs.length})</button>}
        {favs && favs.map(e => <Item key={e.i} e={e} />)}
      </div>
    </div>
  )
}

export function exportReports(state) {
  const out = Object.entries(state.reports || {}).map(([id, note]) => { const e = getQ(id); return { id, note, question: e ? e.q : null, cle: e ? e.c : null } })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }))
  a.download = `signalements-${dayKey()}.json`
  a.click()
}
