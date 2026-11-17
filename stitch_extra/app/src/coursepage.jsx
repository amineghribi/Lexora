import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './session.js'
import { PACK_KINDS } from './packsReady.js'
import { hasKind } from './packs.jsx'
import './coursepage.css'

/* ===== Page d'un cours (maquette « page d'un cours ») =====
   En-tête du cours, onglets de contenus disponibles et lancement vers les contenus existants.
   Les onglets ne s'affichent que pour les contenus réellement publiés (PACK_KINDS / hasKind) :
   aucun onglet vide n'est proposé. */

const TABS = [
  ['fiche', 'Fiche'],
  ['resume', 'Résumé'],
  ['cartes', 'Cartes'],
  ['concept', 'Cartes conceptuelles'],
  ['memo', 'Mémo'],
  ['lecon', 'Leçon'],
  ['video', 'Vidéo'],
]

const clean = s => String(s || '').replace(/\s{2,}.*$/, '').trim()

export function CoursePage({ index, go, init }) {
  const no = init && Number.isInteger(init.course) ? init.course : null
  const subject = useMemo(() => (index && index.subjects ? index.subjects.find(s => s.no === no) : null), [index, no])
  const sp = useMemo(() => {
    const s = (index && index.series || []).find(x => x.sn === no)
    return s ? s.sp : ''
  }, [index, no])

  const [kind, setKind] = useState(null)
  const [html, setHtml] = useState('')
  const [cst, setCst] = useState('idle')

  useEffect(() => {
    if (!no || !kind) return undefined
    let off = false
    setCst('busy'); setHtml('')
    supabase.auth.getSession().then(({ data }) => {
      const tok = data && data.session && data.session.access_token
      if (!tok) { const e = new Error('auth'); e.auth = true; throw e }
      return fetch(`/api/pack?course=${no}&kind=${kind}`, { headers: { Authorization: `Bearer ${tok}` } })
    }).then(r => {
      if (r.status === 403) { const e = new Error('paid'); e.paid = true; throw e }
      if (!r.ok) throw new Error('http ' + r.status)
      return r.text()
    }).then(t => { if (!off) { setHtml(t); setCst('ok') } })
      .catch(e => {
        if (off) return
        setCst(e && e.paid ? 'paid' : e && e.auth ? 'auth' : 'err')
      })
    return () => { off = true }
  }, [no, kind])

  const available = useMemo(() => {
    const kinds = new Set(PACK_KINDS[no] || [])
    return [
      ...KIND_ORDER.filter(k => kinds.has(k)),
      ...(hasKind(no, 'video') ? ['video'] : []),
    ]
  }, [no])

  useEffect(() => { setKind(available[0] || null) }, [available.join('|')])

  if (!no || !subject) {
    return (
      <div className="cp">
        <div className="cp-top"><button type="button" className="ghost" onClick={() => go({ name: 'library' })}>← Packs</button></div>
        <div className="cp-card"><b>Cours introuvable</b><p className="muted small">Choisis un cours dans la liste des packs.</p>
          <button type="button" className="primary" onClick={() => go({ name: 'library' })}>Voir les packs</button></div>
      </div>
    )
  }

  return (
    <div className="cp">
      <div className="cp-top">
        <button type="button" className="ghost" onClick={() => go({ name: 'library' })}>← Packs</button>
        <span className="cp-crumb">{sp ? `${sp} · ` : ''}Cours {no}</span>
      </div>

      <header className="cp-head">
        <div>
          <span className="cp-eyebrow">Cours {no}{sp ? ` · ${sp}` : ''}</span>
          <h1>{clean(subject.name)}</h1>
          <p className="muted small">
            {typeof subject.n === 'number' ? `${subject.n.toLocaleString('fr')} questions au programme` : 'Cours du programme'}
            {available.length ? ` · ${available.length} contenu${available.length > 1 ? 's' : ''} disponible${available.length > 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <div className="cp-actions">
          <button type="button" className="soft" onClick={() => go({ name: 'qcm-screen', ids: (index.series.find(s => s.sn === no) || {}).q })}>QCM du cours</button>
          <button type="button" className="primary" onClick={() => go({ name: 'packs', course: no })}>Ouvrir le cours →</button>
        </div>
      </header>

      <div className="cp-split">
      <aside className="cp-rail" aria-label="Sommaire du cours">
        <b className="cp-rail-h">Sommaire</b>
        <ol className="cp-rail-l">
          {TABS.map(([k, label]) => {
            const on = available.includes(k)
            return (
              <li key={k} className={on ? (k === kind ? 'on sel' : 'on') : ''}>
                <span>{label}</span>
                <em>{on ? 'disponible' : 'à venir'}</em>
                {on && <button type="button" className="link" onClick={() => setKind(k)}>{k === kind ? 'Affiché' : 'Afficher'}</button>}
              </li>
            )
          })}
        </ol>
      </aside>
      <div className="cp-main">
      <nav className="cp-tabs" aria-label="Contenus du cours">
        {TABS.filter(([k]) => available.includes(k)).map(([k, label], i) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={k === kind ? 'on' : ''}>{label}</button>
        ))}
        {!available.length && <span className="muted small">Aucun contenu publié pour ce cours pour l’instant.</span>}
      </nav>

      <section className="cp-card">
        <div className="cp-card-h">
          <b>{kind ? TABS.find(([k]) => k === kind)[1] : 'Contenu'}</b>
          {cst === 'ok' && <span className="muted small">support officiel du cours</span>}
        </div>
        {cst === 'busy' && <p className="muted small">Chargement du support…</p>}
        {cst === 'auth' && <p className="muted small">Connecte-toi pour ouvrir le support de ce cours.</p>}
        {cst === 'paid' && <p className="muted small">Ce support demande un accès complet.</p>}
        {cst === 'err' && <p className="muted small">Le support n’a pas pu être chargé.</p>}
        {cst === 'ok' && (
          <iframe className="cp-frame" title={`Support du cours ${no}`} sandbox="allow-same-origin"
            srcDoc={html} />
        )}
        {!kind && <p className="muted small">Aucun support publié pour ce cours.</p>}
      </section>

      <section className="cp-card">
        <div className="cp-card-h">
          <b>Contenus disponibles</b>
          <span className="muted small">{available.length} / {TABS.length}</span>
        </div>
        <ul className="cp-kinds">
          {TABS.map(([k, label]) => {
            const on = available.includes(k)
            return (
              <li key={k} className={on ? 'on' : ''}>
                <span className="nm">{label}</span>
                <span className="st">{on ? 'Disponible' : 'À venir'}</span>
                {on && <button type="button" className="link" onClick={() => go({ name: 'packs', course: no, kind: k })}>Ouvrir →</button>}
              </li>
            )
          })}
        </ul>
      </section>
      </div>
      </div>
    </div>
  )
}

const KIND_ORDER = ['fiche', 'resume', 'cartes', 'concept', 'memo', 'lecon']
