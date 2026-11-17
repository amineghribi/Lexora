import React, { useEffect, useState } from 'react'
import { supabase } from './session.js'
import { ArcView } from './arc.jsx'
import { ArcBank } from './arcbank.jsx'
import { SimEditor } from './simauthor.jsx'

const STATUS = { published: 'publié', draft: 'brouillon' }
const caseKey = id => 'u-' + String(id).replace(/-/g, '').slice(0, 8)

// Interface enseignant : « Mes cas », « Banque des ARC » (patients du simulateur + cas des enseignants), « Nouveau cas ».
// Un enseignant a une seule spécialité ; le serveur n'accepte que celle-là. Ses cas s'écrivent dans le format du simulateur
// et apparaissent dans l'ARC comme les autres patients (aux élèves seulement une fois publiés).
import { TeacherBank } from './teachbank.jsx'
import { ArcCaseEditor } from './arcedit.jsx'

export function TeacherSpace({ page, go }) {
  const [cases, setCases] = useState(null)
  const [specs, setSpecs] = useState(null)
  const [mode, setMode] = useState(null) // { t: 'edit' | 'play', id, motif }
  const [err, setErr] = useState('')
  const load = () => {
    setErr('')
    supabase.rpc('sim_cases_mine').then(({ data, error }) => { if (error) throw error; setCases(data || []) }).catch(() => setErr('Chargement de tes cas impossible, réessaie.'))
    supabase.rpc('my_teacher_specialties').then(({ data, error }) => { if (error) throw error; setSpecs(data || []) }).catch(() => setErr('Chargement de ta spécialité impossible, réessaie.'))
  }
  useEffect(() => { setMode(null); load() }, [page])
  const spec = specs && specs[0] ? specs[0] : null
  if (mode && mode.t === 'play') {
    return (
      <div>
        <div className="row" style={{ marginBottom: 8 }}>
          <button type="button" className="ghost" onClick={() => { setMode(null); if (page === 'tnew') go({ name: 'home' }) }}>← Retour à mes cas</button>
          <span className="muted small">Aucune tentative n’est enregistrée.</span>
        </div>
        <ArcView preview start={{ m: mode.motif, c: caseKey(mode.id) }} />
      </div>
    )
  }
  const preview = (id, motif) => setMode({ t: 'play', id, motif })
  if (mode && mode.t === 'edit') return <ArcCaseEditor caseId={mode.id} onDone={() => { setMode(null); load() }} onCancel={() => setMode(null)} />
  if (page === 'tnew') {
    if (!specs && !err) return <p className="muted" role="status">Chargement…</p>
    if (!spec) return <div className="card"><p role="alert">{err || 'Aucune spécialité ne t’est attribuée : contacte l’équipe.'}</p></div>
    return <ArcCaseEditor caseId={null} onDone={() => go({ name: 'home' })} onCancel={() => go({ name: 'home' })} />
  }
  const head = (title, sub) => <div className="page-h"><h1>{title}</h1><p className="muted">{sub}</p>{spec && <p className="small">Ta spécialité : <b>{spec.label}</b></p>}</div>
  if (page === 'tbank') {
    return (
      <div>
        {head('Banque des ARC', 'Les patients de ta spécialité, avec leur diagnostic : choisis le bon cas avant de le projeter à tes étudiants, puis résolvez-le ensemble.')}
        {err && <p className="err" role="alert">{err}</p>}
        <ArcBank spec={spec} />
      </div>
    )
  }
  const duplicate = async c => {
    setErr('')
    try {
      const { data } = await supabase.auth.getSession()
      const tok = data && data.session && data.session.access_token
      if (!tok) throw new Error('x')
      const r = await fetch('/api/arc-author', { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: (c.title + ' (copie)').slice(0, 120), motif: c.motif_id, data: c.data }) })
      if (!r.ok) throw new Error('http')
      load()
    } catch (e) { setErr('Duplication impossible, réessaie.') }
  }
  const setStatus = (c, status) => supabase.rpc('sim_case_status', { p_id: c.id, p_status: status }).then(({ error }) => { if (error) setErr('Opération impossible, réessaie.'); load() })
  return (
    <TeacherBank
      cases={cases}
      spec={spec}
      err={err}
      onPreview={(id, motif) => setMode({ t: 'play', id, motif })}
      onEdit={id => setMode({ t: 'edit', id })}
    />
  )
}
