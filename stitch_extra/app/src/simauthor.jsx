import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './session.js'

const VITALS = ['PA', 'FC', 'FR', 'SpO2', 'Température']
const VAL = {
  indispensable: 'Indispensable', utile_sans_attendre: 'Utile, sans attendre le résultat', utile_sans_retarder: 'Utile, sans retarder la prise en charge', utile: 'Utile',
  non_systematique: 'Non systématique', inutile: 'Inutile', neutre: 'Neutre',
}
const ERR = {
  AUTH_REQUIRED: 'Reconnecte-toi.', TEACHER_ONLY: 'Réservé aux enseignants.', BAD_TITLE: 'Donne un titre au cas (2 à 120 caractères).', BAD_MOTIF: 'Motif inconnu.',
  BAD_DIAG: 'Choisis le diagnostic final.', BAD_TEXTE: 'La présentation du patient est trop courte (30 caractères au moins) ou trop longue.',
  BAD_CONSTANTES: 'Une constante est trop longue.', QUESTIONS_MIN: 'Ajoute au moins 2 questions de l’interrogatoire avec la réponse du patient.',
  BAD_Q: 'Une réponse de l’interrogatoire est vide ou trop longue (600 caractères au plus).', BAD_G: 'Une réponse d’examen physique est vide ou trop longue.',
  BAD_X: 'Une réponse d’examen complémentaire est vide ou trop longue.', BAD_SIGNS: 'Un signe lié n’existe pas pour ce motif.', BAD_VAL: 'Utilité d’un examen invalide.',
  BAD_COM: 'Un commentaire est trop long (300 caractères au plus).', BAD_IMG: 'Image inconnue.', BAD_PIEGES: 'Pièges : 6 au plus, 300 caractères chacun.',
  BAD_EXPL: 'L’explication du diagnostic est trop longue (600 caractères au plus).',
  BAD_SND: 'Ce son ne correspond pas à ce geste.',
  BAD_ORDO: 'Traitement : choisis au moins un traitement essentiel ; un même traitement ne peut figurer que dans une seule liste.',
  NOT_YOUR_SPECIALTY: 'Ce motif n’est pas de ta spécialité.', NOT_FOUND: 'Cas introuvable ou archivé.', NOT_TEACHER: 'Réservé aux enseignants.', BAD_DATA: 'Cas invalide.',
}
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const token = () => supabase.auth.getSession().then(({ data }) => { const t = data && data.session && data.session.access_token; if (!t) throw new Error('AUTH_REQUIRED'); return t })

// Ajoute un élément de la banque : recherche + liste déroulante regroupée par catégorie.
function AddItem({ items, used, label, onAdd }) {
  const [q, setQ] = useState('')
  const [pick, setPick] = useState('')
  const list = useMemo(() => items.filter(i => !used[i.id] && (!q.trim() || norm(i.lib + ' ' + i.cat).includes(norm(q)))), [items, used, q])
  const groups = useMemo(() => { const m = new Map(); for (const i of list) { if (!m.has(i.cat)) m.set(i.cat, []); m.get(i.cat).push(i) } return [...m] }, [list])
  return (
    <div className="row" style={{ gap: 6, justifyContent: 'flex-start' }}>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={`Chercher dans la banque (${label})…`} aria-label={`Chercher ${label}`} style={{ flex: '1 1 200px' }} />
      <select value={pick} onChange={e => setPick(e.target.value)} aria-label={`Choisir ${label}`} style={{ flex: '2 1 280px', maxWidth: '100%' }}>
        <option value="">— {list.length} disponibles —</option>
        {groups.map(([cat, xs]) => <optgroup key={cat} label={cat}>{xs.map(i => <option key={i.id} value={i.id}>{i.lib}</option>)}</optgroup>)}
      </select>
      <button type="button" className="ghost" disabled={!pick} onClick={() => { onAdd(pick); setPick('') }}>Ajouter</button>
    </div>
  )
}

// Lien d'une réponse avec les signes du motif (utilisés dans le raisonnement différentiel).
function Signs({ el, signs, onChange }) {
  const byId = useMemo(() => Object.fromEntries(signs.map(s => [s.id, s.t])), [signs])
  return (
    <div className="row" style={{ gap: 6, justifyContent: 'flex-start' }}>
      {(el || []).map(id => <button key={id} type="button" className="ghost small" title="Retirer ce signe" onClick={() => onChange(el.filter(x => x !== id))}>{(byId[id] || id).slice(0, 60)} ✕</button>)}
      <select value="" onChange={e => e.target.value && onChange([...(el || []), e.target.value])} aria-label="Lier à un signe du motif" style={{ maxWidth: 260 }}>
        <option value="">+ Signe du motif (optionnel)</option>
        {signs.filter(s => !(el || []).includes(s.id)).map(s => <option key={s.id} value={s.id}>{s.t.slice(0, 90)}</option>)}
      </select>
    </div>
  )
}

// Catégorie d'images de la banque qui correspond à un examen (les autres examens voient toute la banque).
const EXAM_CAT = { x_ecg: 'ecg', x_holter: 'ecg', x_rx: 'thorax', x_ct_thx: 'thorax', x_ct_angio: 'thorax', x_asp: 'abdo', x_echo_abd: 'abdo', x_ct_abd: 'abdo', x_ausp: 'abdo', x_uroscan: 'abdo' }
const CAT_LABEL = { ecg: 'ECG', thorax: 'Radiographie de thorax', abdo: 'Abdomen : échographie, scanner, ASP' }
const STATUT = { apres_reponse: ' (la réponse est dessinée sur l’image)', reserve: ' (qualité limitée)' }

// Choix d'une image dans la banque, classée par examen : un ECG propose les ECG, une radio de thorax les radios.
function ImagePick({ value, onChange, examId, images }) {
  const own = EXAM_CAT[examId]
  const [all, setAll] = useState(false)
  const [src, setSrc] = useState(null)
  const [pv, setPv] = useState('')
  const shown = own && !all ? images.filter(i => i.cat === own) : images
  const groups = useMemo(() => { const m = new Map(); for (const i of shown) { if (!m.has(i.cat)) m.set(i.cat, []); m.get(i.cat).push(i) } return [...m] }, [shown])
  const cur = images.find(i => i.id === value)
  useEffect(() => { setSrc(null); setPv('') }, [value])
  const view = async () => {
    setPv('Chargement…')
    try {
      const t = await token()
      const r = await fetch('/api/arc-media?key=' + encodeURIComponent(`arc/img/${cur.cat}/${cur.id}.webp`), { headers: { Authorization: `Bearer ${t}` } })
      if (!r.ok) throw new Error('http')
      setSrc((await r.json()).url); setPv('')
    } catch (e) { setPv('Aperçu indisponible pour le moment.') }
  }
  return (
    <div style={{ width: '100%' }}>
      <div className="row" style={{ gap: 8, justifyContent: 'flex-start' }}>
        <label className="small">Image : <select value={value || ''} onChange={e => onChange(e.target.value)} style={{ maxWidth: 420 }}>
          <option value="">aucune</option>
          {value && !cur && <option value={value}>Image intégrée ({value})</option>}
          {groups.map(([c, xs]) => <optgroup key={c} label={`${CAT_LABEL[c] || c} (${xs.length})`}>{xs.map(i => <option key={i.id} value={i.id}>{(i.sujet + (STATUT[i.statut] || '')).slice(0, 90)}</option>)}</optgroup>)}
        </select></label>
        {own && <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> Voir toute la banque</label>}
        {cur && <button type="button" className="ghost small" onClick={view}>Voir l’image</button>}
      </div>
      {pv && <p className="muted small" role="status" style={{ margin: '4px 0 0' }}>{pv}</p>}
      {cur && src && (
        <figure style={{ margin: '8px 0 0' }}>
          <img src={src} alt={cur.desc} style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 8 }} />
          <figcaption className="muted small">{cur.desc} · {cur.credit}</figcaption>
        </figure>
      )}
    </div>
  )
}

function Section({ title, hint, kind, items, rows, setRows, cat, vals, motif }) {
  const byId = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items])
  const set = (id, patch) => setRows({ ...rows, [id]: { ...rows[id], ...patch } })
  const ids = Object.keys(rows)
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>{title} <span className="muted small">· {ids.length}</span></h2>
      <p className="muted small" style={{ marginTop: 0 }}>{hint}</p>
      <AddItem items={items} used={rows} label={kind === 'q' ? 'questions' : kind === 'g' ? 'gestes' : 'examens'} onAdd={id => setRows({ ...rows, [id]: { r: '', el: [], e: false, ...(kind === 'x' ? { val: 'utile' } : {}) } })} />
      <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 10 }}>
        {ids.map(id => {
          const a = rows[id]
          return (
            <li key={id} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <b>{byId[id] ? byId[id].lib : id}</b>
                <button type="button" className="ghost small" onClick={() => { const n = { ...rows }; delete n[id]; setRows(n) }}>Retirer</button>
              </div>
              <textarea rows={2} value={a.r} onChange={e => set(id, { r: e.target.value })} maxLength={600} placeholder={kind === 'q' ? 'Réponse du patient…' : kind === 'g' ? 'Ce que l’examen retrouve…' : 'Résultat de l’examen…'} aria-label="Réponse" style={{ width: '100%' }} />
              <div className="row" style={{ gap: 12, justifyContent: 'flex-start', marginTop: 4 }}>
                <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={!!a.e} onChange={e => set(id, { e: e.target.checked })} /> Essentiel (l’élève perd des points s’il l’oublie)</label>
                {kind === 'g' && cat.snd[id] && (
                  <label className="small">Son à écouter : <select value={a.snd || ''} onChange={e => set(id, { snd: e.target.value })} style={{ maxWidth: 360 }}>
                    <option value="">aucun (seulement ton texte)</option>
                    {cat.snd[id].map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                  </select></label>
                )}
                {kind === 'x' && (
                  <>
                    <label className="small">Utilité : <select value={a.val || 'utile'} onChange={e => set(id, { val: e.target.value })}>{vals.map(v => <option key={v} value={v}>{VAL[v] || v}</option>)}</select></label>
                    <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={!!a.pending} onChange={e => set(id, { pending: e.target.checked })} /> Résultat pas encore disponible</label>
                  </>
                )}
              </div>
              {kind === 'x' && <div style={{ marginTop: 6 }}><ImagePick value={a.img} onChange={img => set(id, { img })} examId={id} images={cat.img} /></div>}
              {kind === 'x' && <input value={a.com || ''} onChange={e => set(id, { com: e.target.value })} maxLength={300} placeholder="Commentaire pour l’élève après sa réponse (optionnel)" aria-label="Commentaire" style={{ width: '100%', marginTop: 4 }} />}
              <div style={{ marginTop: 4 }}><Signs el={a.el} signs={motif.signs} onChange={el => set(id, { el })} /></div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// Diagnostic différentiel : le simulateur fixe pour/contre par motif. On montre ce que donnent les signes liés aux réponses du cas.
function Differential({ motif, d }) {
  const linked = useMemo(() => {
    const ids = new Set()
    for (const k of ['q', 'g', 'x']) for (const a of Object.values(d[k] || {})) for (const e of a.el || []) ids.add(e)
    return motif.signs.filter(s => ids.has(s.id))
  }, [motif, d])
  const lib = id => (motif.hyps.find(h => h.id === id) || { lib: id }).lib
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Diagnostic différentiel</h2>
      <p className="muted small" style={{ marginTop: 0 }}>L’élève choisit 3 à 5 hypothèses, puis classe chaque signe trouvé : pour, contre ou neutre. Ces classements sont ceux du motif « {motif.motif} » ; ils dépendent des signes que tu lies à tes réponses (bouton « + Signe du motif »).</p>
      {!linked.length ? <p className="muted small">Aucun signe lié pour l’instant : l’élève n’aura rien à classer. Lie au moins quelques signes aux réponses ci-dessus.</p> : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {linked.map(s => (
            <li key={s.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 6 }}>
              <b className="small">{s.t}</b>
              <div className="small muted">Pour : {s.pour.length ? s.pour.map(lib).join(' ; ') : 'aucune hypothèse'}</div>
              <div className="small muted">Contre : {s.contre.length ? s.contre.map(lib).join(' ; ') : 'aucune hypothèse'}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Diagnostic retenu : celui que l'élève doit poser à la fin.
function Diagnosis({ motif, d, setD }) {
  const h = motif.hyps.find(x => x.id === d.diag)
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Diagnostic retenu</h2>
      <label>Diagnostic à poser : <select value={d.diag} onChange={e => setD({ ...d, diag: e.target.value, ordo: undefined })}><option value="">— choisir —</option>{motif.hyps.map(x => <option key={x.id} value={x.id}>{x.lib}</option>)}</select></label>
      <label className="small" style={{ display: 'block', marginTop: 8 }}>Explication pour ce cas (optionnel)<br />
        <textarea rows={3} value={d.expl || ''} onChange={e => setD({ ...d, expl: e.target.value })} maxLength={600} placeholder="Pourquoi ce diagnostic dans ce cas précis : elle remplace l’explication générale du motif, affichée à l’élève après sa réponse." style={{ width: '100%' }} />
      </label>
      {h && h.resume && <p className="muted small" style={{ marginBottom: 0 }}>{d.expl ? 'Explication générale du motif (remplacée par la tienne) : ' : 'Explication affichée à l’élève : '}{h.resume}</p>}
    </section>
  )
}

// Traitement : l'ordonnance par défaut du diagnostic, ou une ordonnance écrite pour ce cas.
function Treatment({ motif, d, setD, cat }) {
  const h = motif.hyps.find(x => x.id === d.diag)
  const o = d.ordo
  const byId = useMemo(() => Object.fromEntries(cat.t.map(t => [t.id, t])), [cat])
  const used = o ? { ...Object.fromEntries([...o.ess, ...o.ok].map(i => [i, 1])), ...Object.fromEntries(Object.keys(o.non).map(i => [i, 1])) } : {}
  const lib = i => (byId[i] ? byId[i].lib : i)
  const setO = patch => setD({ ...d, ordo: { ...o, ...patch } })
  const list = (title, hint, ids, onRemove, extra) => (
    <div style={{ marginTop: 10 }}>
      <b>{title} <span className="muted small">· {ids.length}</span></b>
      <p className="muted small" style={{ margin: '2px 0 6px' }}>{hint}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 6px', display: 'grid', gap: 4 }}>
        {ids.map(i => <li key={i} className="row" style={{ gap: 8, justifyContent: 'space-between' }}><span>{lib(i)}</span><button type="button" className="ghost small" onClick={() => onRemove(i)}>Retirer</button>{extra && extra(i)}</li>)}
      </ul>
    </div>
  )
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Traitement</h2>
      <p className="muted small" style={{ marginTop: 0 }}>L’élève rédige une ordonnance, notée sur les traitements essentiels. Par défaut, c’est l’ordonnance du simulateur pour le diagnostic retenu.</p>
      <div className="row" style={{ gap: 14, justifyContent: 'flex-start' }}>
        <label className="small row" style={{ gap: 6 }}><input type="radio" name="ordo" checked={!o} onChange={() => setD({ ...d, ordo: undefined })} /> Ordonnance par défaut du diagnostic</label>
        <label className="small row" style={{ gap: 6 }}><input type="radio" name="ordo" checked={!!o} onChange={() => setD({ ...d, ordo: { ess: [], ok: [], non: {} } })} /> Ordonnance propre à ce cas</label>
      </div>
      {!o && (h && h.ordo ? (
        <div className="small" style={{ marginTop: 8 }}>
          <div><b>Essentiel :</b> {h.ordo.ess.join(' ; ') || '—'}</div>
          <div><b>Acceptable :</b> {h.ordo.ok.join(' ; ') || '—'}</div>
          {h.ordo.non.length > 0 && <div><b>À éviter :</b> {h.ordo.non.join(' ; ')}</div>}
        </div>
      ) : <p className="muted small">Choisis d’abord le diagnostic retenu pour voir son ordonnance.</p>)}
      {o && (
        <>
          {list('Essentiel', 'L’élève perd des points s’il l’oublie.', o.ess, i => setO({ ess: o.ess.filter(x => x !== i) }))}
          {list('Acceptable', 'Pas de point en plus ni en moins : une prescription raisonnable.', o.ok, i => setO({ ok: o.ok.filter(x => x !== i) }))}
          {list('À éviter', 'Contre-indiqué ou inutile dans ce cas ; le message explique pourquoi.', Object.keys(o.non), i => { const n = { ...o.non }; delete n[i]; setO({ non: n }) },
            i => <input value={o.non[i]} onChange={e => setO({ non: { ...o.non, [i]: e.target.value } })} maxLength={300} placeholder="Pourquoi l’éviter ?" aria-label={`Pourquoi éviter ${lib(i)}`} style={{ flex: '1 1 100%' }} />)}
          <div className="small" style={{ margin: '10px 0 4px' }}><b>Ajouter un traitement à :</b></div>
          {[['Essentiel', i => setO({ ess: [...o.ess, i] })], ['Acceptable', i => setO({ ok: [...o.ok, i] })], ['À éviter', i => setO({ non: { ...o.non, [i]: '' } })]].map(([t, add]) => (
            <div key={t} style={{ marginBottom: 6 }}><span className="small muted">{t}</span><AddItem items={cat.t} used={used} label="traitements" onAdd={add} /></div>
          ))}
        </>
      )}
    </section>
  )
}

// Éditeur de cas au format du simulateur : le cas écrit apparaît ensuite dans l'ARC comme les autres patients.
export function SimEditor({ id, onExit, onPreview }) {
  const [cat, setCat] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [motifId, setMotifId] = useState('')
  const [d, setD] = useState({ diag: '', texte: '', constantes: {}, q: {}, g: {}, x: {}, pieges: [] })
  const base = useRef(null) // état au chargement : sert à savoir s'il y a des modifications non enregistrées
  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const t = await token()
        const r = await fetch('/api/arc-author', { headers: { Authorization: `Bearer ${t}` } })
        if (!r.ok) throw new Error('http')
        const c = await r.json()
        let mine = null
        if (id) {
          const { data, error } = await supabase.rpc('sim_cases_mine')
          if (error) throw error
          mine = (data || []).find(x => x.id === id)
          if (!mine) throw new Error('NOT_FOUND')
        }
        if (off) return
        setCat(c)
        if (mine) { const dd = { diag: '', texte: '', constantes: {}, q: {}, g: {}, x: {}, pieges: [], ...mine.data }; setTitle(mine.title); setMotifId(mine.motif_id); setD(dd); base.current = JSON.stringify([mine.title, mine.motif_id, dd]) }
        else if (c.motifs[0]) { setMotifId(c.motifs[0].id); base.current = JSON.stringify(['', c.motifs[0].id, { diag: '', texte: '', constantes: {}, q: {}, g: {}, x: {}, pieges: [] }]) }
      } catch (e) { if (!off) setErr(e && e.message === 'NOT_FOUND' ? ERR.NOT_FOUND : 'Chargement impossible, réessaie dans un instant.') }
    })()
    return () => { off = true }
  }, [id])
  const motif = cat && cat.motifs.find(m => m.id === motifId)
  const dirty = base.current !== null && JSON.stringify([title, motifId, d]) !== base.current
  useEffect(() => {
    if (!dirty) return undefined
    const h = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])
  const leave = () => { if (!dirty || window.confirm('Quitter sans enregistrer ? Tes modifications seront perdues.')) onExit() }
  const save = async (andPreview) => {
    setErr(''); setBusy(true)
    try {
      const t = await token()
      const clean = o => Object.fromEntries(Object.entries(o).map(([k, a]) => [k, { ...a, el: a.el || [] }]))
      const body = { id: id || undefined, title, motif: motifId, data: { ...d, q: clean(d.q), g: clean(d.g), x: clean(d.x), pieges: (d.pieges || []).filter(p => p.trim()) } }
      const r = await fetch('/api/arc-author', { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(ERR[j.error] || 'Enregistrement impossible, réessaie.'); return }
      base.current = JSON.stringify([title, motifId, d])
      if (andPreview && onPreview && j.id) onPreview(j.id, motifId); else onExit()
    } catch (e) { setErr('Enregistrement impossible, réessaie.') } finally { setBusy(false) }
  }
  if (!cat) return <div className="card">{err ? <p className="err" role="alert">{err}</p> : <p className="muted" role="status">Chargement…</p>}<button type="button" className="ghost" onClick={onExit}>Retour</button></div>
  if (!motif) return <div className="card"><p role="alert">Aucun motif du simulateur n’existe pour ta spécialité : contacte l’équipe.</p><button type="button" className="ghost" onClick={onExit}>Retour</button></div>
  const setV = (k, v) => setD(x => ({ ...x, constantes: { ...x.constantes, [k]: v } }))
  const pieges = d.pieges || []
  return (
    <div className="sim">
      <div className="page-h"><h1>{id ? 'Modifier le cas' : 'Nouveau cas'}</h1><p className="muted">Tu écris un patient comme ceux du simulateur : l’élève l’interroge, l’examine, prescrit, puis conclut. Le cas reste un brouillon jusqu’à ce que tu le publies dans « Mes cas ».</p></div>
      <section className="card">
        <label>Titre (visible par toi seulement)<br /><input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} style={{ width: '100%' }} placeholder="ex. Homme de 58 ans, douleur thoracique de repos" /></label>
        <div className="row" style={{ gap: 12, justifyContent: 'flex-start' }}>
          <label>Motif : <select value={motifId} onChange={e => setD(x => ({ ...x, diag: '', ordo: undefined })) || setMotifId(e.target.value)} disabled={!!id}>{cat.motifs.map(m => <option key={m.id} value={m.id}>{m.motif}</option>)}</select></label>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Le diagnostic à poser et le traitement se choisissent à la fin du cas.</p>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Aux urgences</h2>
        <textarea rows={3} value={d.texte} onChange={e => setD({ ...d, texte: e.target.value })} maxLength={1500} placeholder="Qui est le patient, pourquoi il vient, ce que l’on voit en arrivant (sans donner le diagnostic)…" aria-label="Présentation" style={{ width: '100%' }} />
        <div className="row" style={{ gap: 8, justifyContent: 'flex-start' }}>
          {VITALS.map(k => <label key={k} className="small">{k}<br /><input value={d.constantes[k] || ''} onChange={e => setV(k, e.target.value)} maxLength={60} style={{ width: 140 }} /></label>)}
        </div>
      </section>
      <Section title="Interrogatoire" hint="Choisis les questions dans la banque et écris la réponse du patient. Une question de la banque non ajoutée reçoit une réponse négative." kind="q" items={cat.q} rows={d.q} setRows={q => setD(x => ({ ...x, q }))} cat={cat} vals={motif.vals} motif={motif} />
      <Section title="Examen physique" hint="Les gestes que l’élève peut faire et ce qu’ils retrouvent. Un geste que tu n’ajoutes pas est rendu normal. Les constantes ci-dessus sont ajoutées automatiquement. Pour l’auscultation, tu peux choisir un son de la banque : l’élève l’écoute puis dit ce qu’il entend." kind="g" items={cat.g} rows={d.g} setRows={g => setD(x => ({ ...x, g }))} cat={cat} vals={motif.vals} motif={motif} />
      <Section title="Examens complémentaires" hint="Les examens de la banque, leur résultat et leur utilité dans ce cas. Un examen que tu n’ajoutes pas est rendu normal (« Sans anomalie » ou équivalent)." kind="x" items={cat.x} rows={d.x} setRows={x2 => setD(x => ({ ...x, x: x2 }))} cat={cat} vals={motif.vals} motif={motif} />
      <Differential motif={motif} d={d} />
      <Diagnosis motif={motif} d={d} setD={setD} />
      <Treatment motif={motif} d={d} setD={setD} cat={cat} />
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Pièges à éviter</h2>
        {pieges.map((p, i) => (
          <div key={i} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <input value={p} onChange={e => setD({ ...d, pieges: pieges.map((x, j) => j === i ? e.target.value : x) })} maxLength={300} style={{ flex: 1 }} aria-label={`Piège ${i + 1}`} />
            <button type="button" className="ghost small" onClick={() => setD({ ...d, pieges: pieges.filter((_, j) => j !== i) })}>Retirer</button>
          </div>
        ))}
        <div><button type="button" className="ghost" disabled={pieges.length >= 6} onClick={() => setD({ ...d, pieges: [...pieges, ''] })}>Ajouter un piège</button></div>
      </section>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
        <button type="button" className="primary" disabled={busy} onClick={() => save(false)}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        {onPreview && <button type="button" className="ghost" disabled={busy} onClick={() => save(true)}>Enregistrer et voir l’aperçu</button>}
        <button type="button" className="ghost" disabled={busy} onClick={leave}>Annuler</button>
      </div>
    </div>
  )
}
