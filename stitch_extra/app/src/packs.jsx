import React, { useEffect, useMemo, useState } from 'react'
import { supabase, openAuth } from './session.js'
import { useAuth } from './auth.jsx'
import { VideoPanel, useCourseVideos } from './videos.jsx'
import { PACK_KINDS } from './packsReady.js'
import { protect } from './protect.js'
import { YtSessions, hasYt } from './ytSessions.jsx'

// Contenus déjà en ligne (à mettre à jour quand un cours reçoit ses fiches ou ses vidéos)
const PACK_READY = { has: n => (PACK_KINDS[n] || []).length > 0 }
const VIDEO_READY = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 20, 21, 22, 25, 26, 30, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60])
const KINDS = [['fiche', 'Fiche'], ['resume', 'Résumé'], ['cartes', 'Cartes de révision'], ['concept', 'Cartes conceptuelles'], ['memo', 'Fiches mémo'], ['lecon', 'Leçon interactive'], ['video', 'Vidéos']]
export const hasKind = (n, k) => (k === 'video' ? VIDEO_READY.has(n) || hasYt(n) : (PACK_KINDS[n] || []).includes(k))
const readyCount = n => KINDS.filter(([k]) => hasKind(n, k)).length

const svgSafe = s => String(s || '').replace(/[^a-z0-9_]/gi, '').slice(0, 20)
const top = m => { let b = null, c = 0; for (const [k, v] of m) if (v > c) { b = k; c = v } return b }

function Stars({ value, onPick, busy }) {
  return (
    <span role="radiogroup" aria-label="Ta note" style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i} sur 5`} className="ghost" disabled={busy}
          onClick={() => onPick(i)} style={{ minWidth: 40, minHeight: 40, fontSize: 22, padding: 0, lineHeight: 1, color: i <= (value || 0) ? 'var(--warn, #b7791f)' : 'var(--muted)' }}>
          {i <= (value || 0) ? '★' : '☆'}
        </button>
      ))}
    </span>
  )
}

const Soon = ({ what }) => (
  <div className="card" style={{ textAlign: 'center', padding: '28px 16px' }}>
    <div style={{ fontSize: 34, lineHeight: 1 }} aria-hidden="true">⏳</div>
    <b style={{ display: 'block', marginTop: 8 }}>Sera disponible dans quelques jours</b>
    <p className="muted" style={{ margin: '6px 0 0' }}>{what} de ce cours est en préparation.</p>
  </div>
)

const Chip = ({ on, children }) => (
  <span className="small" style={{ padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line)', background: on ? 'color-mix(in srgb,var(--acc) 14%,var(--card))' : 'transparent', color: on ? 'var(--fg)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{children}</span>
)

function Crumbs({ items }) {
  return (
    <nav aria-label="Fil d’Ariane" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '4px 0 12px' }}>
      {items.map(([label, fn], i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="muted" aria-hidden="true">›</span>}
          {fn ? <button type="button" className="ghost" style={{ padding: '4px 10px', minHeight: 32 }} onClick={fn}>{label}</button> : <b>{label}</b>}
        </React.Fragment>
      ))}
    </nav>
  )
}

// Fiches, cartes, schémas, mémos, leçons et vidéos : Jour (J1/J2) → spécialité → cours → contenu
export function PacksView({ go, onStart, index, init }) {
  const iv = init && init.video && Number.isInteger(init.video.course) ? init.video : null
  const ic = !iv && init && Number.isInteger(init.course) ? init.course : null
  const { user, profile } = useAuth()
  const saved = (() => { try { return JSON.parse(localStorage.getItem('packs_nav') || '{}') } catch { return {} } })()
  const [day, setDay] = useState(saved.day === 'J1' || saved.day === 'J2' ? saved.day : '')
  const [sp, setSp] = useState(saved.sp || '')
  const [course, setCourse] = useState(iv ? iv.course : ic ? ic : Number.isInteger(saved.course) ? saved.course : 0)
  const [kind, setKind] = useState(iv ? 'video' : init && init.kind && KINDS.some(([k]) => k === init.kind) ? init.kind : 'fiche')
  const [html, setHtml] = useState('')
  const [st, setSt] = useState('idle')
  const [errMsg, setErrMsg] = useState('')
  const [rt, setRt] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => { try { localStorage.setItem('packs_nav', JSON.stringify({ day, sp, course })) } catch { /* ignore */ } }, [day, sp, course])

  // Jour et spécialité de chaque cours, déduits des séries d'origine
  const courses = useMemo(() => {
    const dayAll = new Map()
    for (const s of index.series) dayAll.set(s.j, (dayAll.get(s.j) || 0) + 1)
    const dflt = top(dayAll) || 'J1'
    const by = new Map()
    for (const s of index.series) {
      if (!s.sn || /^Examens blancs/.test(s.sp || '')) continue
      const e = by.get(s.sn) || { sp: new Map(), j: new Map() }
      const one = String(s.sp || '').split(',')[0].trim()
      if (one) e.sp.set(one, (e.sp.get(one) || 0) + (s.sp.includes(',') ? 1 : 3))
      e.j.set(s.j, (e.j.get(s.j) || 0) + 1)
      by.set(s.sn, e)
    }
    return index.subjects.map(s => {
      const e = by.get(s.no)
      return { no: s.no, name: s.name, sp: (e && top(e.sp)) || 'Autres', j: (e && top(e.j)) || dflt }
    })
  }, [index])
  const inDay = useMemo(() => courses.filter(c => c.j === day), [courses, day])
  const sps = useMemo(() => {
    const m = new Map()
    inDay.forEach(c => { const e = m.get(c.sp) || { n: 0, ready: 0 }; e.n++; if (readyCount(c.no)) e.ready++; m.set(c.sp, e) })
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'))
  }, [inDay])
  const list = useMemo(() => inDay.filter(c => c.sp === sp && (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name, 'fr')), [inDay, sp, q])
  const cur = courses.find(c => c.no === course)
  // arrivée depuis « Épisode suivant » : ouvre directement le cours et l'épisode demandés
  useEffect(() => { if (iv || ic) { const c = courses.find(x => x.no === (iv ? iv.course : ic)); if (c) { setDay(c.j); setSp(c.sp) } } }, [])
  useEffect(() => { if (course && !cur) setCourse(0) }, [cur, course])

  const isVideo = kind === 'video'
  const vids = useCourseVideos(!!user && !!cur && isVideo && VIDEO_READY.has(course))

  const loadRatings = async () => { const { data } = await supabase.rpc('course_pack_ratings_summary'); if (Array.isArray(data)) setRt(data) }
  useEffect(() => { if (user && cur) loadRatings() }, [user && user.id, !!cur])

  useEffect(() => {
    if (!user || !cur || isVideo || !hasKind(course, kind)) return undefined
    let off = false
    setSt('busy'); setHtml(''); setErrMsg('')
    supabase.auth.getSession().then(({ data }) => {
      const tok = data && data.session && data.session.access_token
      if (!tok) throw new Error('x')
      return fetch(`/api/pack?course=${course}&kind=${kind}`, { headers: { Authorization: `Bearer ${tok}` } })
    }).then(r => { if (r.status === 403) { const e = new Error('paid'); e.paid = true; throw e } if (!r.ok) throw new Error('http ' + r.status); return r.text() }).then(t => {
      if (off) return
      const name = svgSafe(profile && profile.username) || 'élève'
      setHtml(protect(t.split('aperçu · alaan').join(`${name} · Résidanat QCM`))); setSt('ok')
    }).catch(e => { if (!off) { setErrMsg(e && e.paid ? '' : String((e && e.message) || '')); setSt(e && e.paid ? 'paid' : 'err') } })
    return () => { off = true }
  }, [course, kind, user && user.id, profile && profile.username, !!cur])

  const rate = async s => {
    setBusy(true); setMsg('')
    try {
      const { error } = await supabase.rpc('rate_course_pack', { p_course: course, p_kind: kind, p_stars: s })
      if (error) throw error
      await loadRatings(); setMsg('Merci pour ta note !')
    } catch (e) { setMsg(/TOO_MANY/.test(String(e && e.message)) ? 'Trop de notes aujourd’hui, reviens demain.' : 'Note impossible pour le moment.') }
    setBusy(false)
  }
  const rcur = useMemo(() => rt.find(r => r.course === course && r.kind === kind) || {}, [rt, course, kind])

  if (!user) return (
    <div className="card"><h2 style={{ marginTop: 0 }}>Fiches et vidéos de cours</h2>
      <p className="muted">Connecte-toi pour ouvrir les fiches, cartes, schémas, mémos, leçons interactives et vidéos des cours.</p>
      <div className="row"><button className="primary" onClick={() => openAuth('login')}>Se connecter</button></div></div>
  )

  const paidCard = what => (
    <div className="card"><b>Réservé aux comptes abonnés.</b>
      <p className="muted">{what} font partie de l’abonnement.</p>
      {go && <div className="row"><button className="primary" onClick={() => go({ name: 'account' })}>Voir mon abonnement</button></div>}
    </div>
  )
  const reset = () => { setDay(''); setSp(''); setCourse(0); setQ('') }
  const toDay = () => { setSp(''); setCourse(0); setQ('') }
  const toSp = () => { setCourse(0) }

  // Étape 1 : J1 ou J2
  if (!day) {
    const stat = j => { const l = courses.filter(c => c.j === j); return { n: l.length, r: l.filter(c => readyCount(c.no)).length } }
    return (
      <div>
        <div className="page-h"><h1>Fiches et vidéos de cours</h1><p className="muted">Choisis ton jour d’examen, puis la spécialité, puis le cours.</p></div>
        <div className="grid" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          {['J1', 'J2'].map(j => { const s = stat(j); return (
            <button key={j} className="tile" onClick={() => setDay(j)}>
              <b style={{ fontSize: 26 }}>{j}</b>
              <span>{s.n} cours</span>
              <span>{s.r ? `${s.r} avec fiches ou vidéos` : 'Bientôt disponible'}</span>
            </button>) })}
        </div>
      </div>
    )
  }
  // Étape 2 : spécialité
  if (!sp) {
    return (
      <div>
        <Crumbs items={[['Fiches et vidéos', reset], [day]]} />
        <div className="page-h"><h1>{day} · Spécialités</h1><p className="muted">{sps.length} spécialités</p></div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
          {sps.map(([name, e]) => (
            <button key={name} className="tile" onClick={() => { setSp(name); setQ('') }}>
              <b>{name}</b>
              <span>{e.n} cours</span>
              <span>{e.ready ? `${e.ready} prêt${e.ready > 1 ? 's' : ''}` : 'Bientôt disponible'}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }
  // Étape 3 : cours
  if (!cur) {
    return (
      <div>
        <Crumbs items={[['Fiches et vidéos', reset], [day, toDay], [sp]]} />
        <div className="page-h"><h1>{sp}</h1><p className="muted">{day} · {inDay.filter(c => c.sp === sp).length} cours</p></div>
        {inDay.filter(c => c.sp === sp).length > 8 && <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un cours…" aria-label="Chercher un cours" style={{ marginBottom: 12, width: '100%' }} />}
        <div style={{ display: 'grid', gap: 8 }}>
          {list.map(c => { const n = readyCount(c.no); return (
            <button key={c.no} className="tile" style={{ padding: 12 }} onClick={() => { setCourse(c.no); setKind(hasKind(c.no, 'fiche') ? 'fiche' : hasKind(c.no, 'video') ? 'video' : 'fiche') }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <b style={{ fontSize: 16 }}>{c.name}</b>
                {n ? <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                  {PACK_READY.has(c.no) && <Chip on>Fiches</Chip>}
                  {VIDEO_READY.has(c.no) && <Chip on>Vidéos de balayage</Chip>}
                  {hasYt(c.no) && <Chip on>Séances YouTube</Chip>}
                </span> : <Chip>Bientôt disponible</Chip>}
              </div>
            </button>) })}
          {!list.length && <p className="muted">Aucun cours trouvé.</p>}
        </div>
      </div>
    )
  }
  // Étape 4 : contenus du cours
  const ready = hasKind(course, kind)
  return (
    <div>
      <Crumbs items={[['Fiches et vidéos', reset], [day, toDay], [sp, toSp], [cur.name]]} />
      <h2 style={{ margin: '0 0 10px' }}>{cur.name}</h2>
      <fieldset className="seg"><legend>Contenu</legend>
        {KINDS.map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)} style={hasKind(course, k) ? undefined : { opacity: .6 }}>{l}{hasKind(course, k) ? '' : ' ⏳'}</button>)}
      </fieldset>
      {!ready && <Soon what={KINDS.find(k => k[0] === kind)[1]} />}
      {ready && !isVideo && (
        <>
          <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
            <span><b>{rcur.n ? `${rcur.avg} / 5` : 'Pas encore de note'}</b>{rcur.n ? <span className="muted small"> · {rcur.n} avis</span> : null}</span>
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="muted small">{rcur.mine ? 'Ta note' : 'Note cette page'}</span>
              <Stars value={rcur.mine} onPick={rate} busy={busy} />
            </span>
            {msg && <span className="muted small" role="status" style={{ flexBasis: '100%' }}>{msg}</span>}
          </div>
          {st === 'busy' && <p className="muted">Chargement…</p>}
          {st === 'paid' && paidCard('Les fiches, cartes, schémas, mémos et leçons interactives')}
          {st === 'err' && <p className="err" role="alert">Page indisponible, réessaie dans un instant.{errMsg ? <span className="muted small"> ({errMsg})</span> : null}</p>}
          {st === 'ok' && <iframe key={`${course}-${kind}`} title={`${cur.name} · ${kind}`} sandbox="allow-scripts" srcDoc={html}
            style={{ width: '100%', height: '78vh', minHeight: 480, border: '1px solid var(--line)', borderRadius: 'var(--r)', background: '#fff' }} />}
        </>
      )}
      {ready && isVideo && (
        <>
          {VIDEO_READY.has(course) && <>
            <h3 style={{ margin: '0 0 4px' }}>Vidéos de balayage</h3>
            {(() => { const freeView = vids.st === 'ok' && vids.list.some(v => v.course === course) && vids.list.filter(v => v.course === course).every(v => v.episode === 1); return (
              <p className="muted small" style={{ margin: '0 0 8px' }}>{freeView ? 'L’épisode 1 est offert, avec ses QCM. Les autres épisodes et la version intégrale sont réservés aux comptes abonnés.' : 'Nos vidéos de cours, réservées aux comptes abonnés.'}</p>
            ) })()}
            {vids.st === 'busy' && <p className="muted">Chargement…</p>}
            {vids.st === 'err' && <p className="err" role="alert">Vidéos indisponibles, réessaie dans un instant.</p>}
            {vids.st === 'paid' && paidCard('Les vidéos de balayage')}
            {vids.st === 'ok' && <VideoPanel course={course} name={svgSafe(profile && profile.username) || 'élève'} list={vids.list} onStart={onStart} autoOpen={iv ? iv.episode : undefined} />}
            {vids.st === 'ok' && vids.list.some(v => v.course === course) && vids.list.filter(v => v.course === course).every(v => v.episode === 1) && paidCard('Les épisodes suivants et la version intégrale')}
          </>}
          <YtSessions course={course} />
        </>
      )}
      <p className="muted small">Support de révision construit à partir des cours et des QCM ; pages indicatives, à confronter au cours. Ce n’est pas un avis médical.</p>
    </div>
  )
}
