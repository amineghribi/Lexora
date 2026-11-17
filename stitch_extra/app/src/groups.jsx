import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, me, USERNAME_RE } from './session.js'
import { useAuth } from './auth.jsx'
import { loadQuestions, getQ, useQuestion, errorText, canonOf } from './data.js'

const ago = t => { const s = (Date.now() - t) / 1000; if (s < 60) return 'à l’instant'; if (s < 3600) return `il y a ${Math.floor(s / 60)} min`; if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`; return `il y a ${Math.floor(s / 86400)} j` }
const normQ = id => { const m = String(id || '').trim().toUpperCase().match(/^Q?([\w-]+)$/); return m ? canonOf('Q' + m[1].replace(/^Q/, '')) : '' }

export function GroupsView({ go, init }) {
  const { user, ready } = useAuth()
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState((init && init.gid) || null)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const { data } = await supabase.from('group_members').select('group_id,status,role,study_groups(id,name,owner_id)').eq('user_id', me().id)
    setRows((data || []).filter(r => r.study_groups))
  }, [])
  useEffect(() => { if (user) load() }, [user, load])
  useEffect(() => { if (init && init.gid) setOpen(init.gid) }, [init && init.gid])

  if (!ready) return <p className="muted">Chargement…</p>
  if (!user) return (
    <section>
      <div className="page-h"><h1>Groupes d’étude</h1><p className="muted">Crée un groupe, invite tes amis avec leur pseudo et partagez vos notes question par question.</p></div>
      <div className="card"><button className="primary" onClick={() => window.dispatchEvent(new CustomEvent('open-auth', { detail: 'login' }))}>Se connecter pour continuer</button></div>
    </section>
  )
  if (!rows) return <p className="muted">Chargement…</p>
  const invites = rows.filter(r => r.status === 'invited'), mine = rows.filter(r => r.status === 'member')
  const cur = open && mine.find(r => r.group_id === open)

  const create = async () => {
    setErr('')
    const n = name.trim()
    if (n.length < 2) return setErr('Donne un nom d’au moins 2 caractères.')
    const { data, error } = await supabase.from('study_groups').insert({ name: n, owner_id: me().id }).select('id').single()
    if (error) return setErr('Impossible de créer le groupe.')
    setName(''); await load(); setOpen(data.id)
  }
  const answer = async (gid, ok) => {
    if (ok) await supabase.from('group_members').update({ status: 'member' }).eq('group_id', gid).eq('user_id', me().id)
    else await supabase.from('group_members').delete().eq('group_id', gid).eq('user_id', me().id)
    await load(); if (ok) setOpen(gid)
  }

  if (cur) return <GroupDetail g={cur.study_groups} role={cur.role} initQ={init && init.qid} onBack={() => { setOpen(null); load() }} />
  return (
    <section>
      <div className="page-h"><h1>Groupes d’étude</h1><p className="muted">Invite tes amis avec leur pseudo et partagez vos notes sur les questions.</p></div>
      {invites.length > 0 && (
        <div className="card st-late"><h3>Invitations ({invites.length})</h3>
          <ul className="st-list">{invites.map(r => <li key={r.group_id}><b>{r.study_groups.name}</b><span><button className="primary" onClick={() => answer(r.group_id, true)}>Accepter</button> <button className="ghost" onClick={() => answer(r.group_id, false)}>Refuser</button></span></li>)}</ul>
        </div>
      )}
      <div className="card">
        <h3>Mes groupes</h3>
        {mine.length ? <ul className="st-list">{mine.map(r => <li key={r.group_id}><button className="link" onClick={() => setOpen(r.group_id)}><b>{r.study_groups.name}</b></button><span className="muted small">{r.role === 'owner' ? 'Créateur' : 'Membre'}</span></li>)}</ul> : <p className="muted">Tu n’es dans aucun groupe pour l’instant.</p>}
      </div>
      <div className="card">
        <h3>Créer un groupe</h3>
        <div className="row" style={{ marginTop: 0 }}><input aria-label="Nom du groupe" value={name} maxLength={60} placeholder="ex. Révision cardio J1" onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} style={{ flex: 1, minWidth: 180 }} /><button className="primary" onClick={create}>Créer</button></div>
        {err && <p className="err" role="alert">{err}</p>}
      </div>
    </section>
  )
}

function GroupDetail({ g, role, initQ, onBack }) {
  const [members, setMembers] = useState([])
  const [notes, setNotes] = useState(null)
  const [uname, setUname] = useState('')
  const [msg, setMsg] = useState('')
  const [qid, setQid] = useState(initQ || '')
  const [body, setBody] = useState('')
  const [filter, setFilter] = useState('')
  const [ready, setReady] = useState(0)
  const owner = role === 'owner'

  const loadMembers = useCallback(async () => {
    const { data } = await supabase.from('group_members').select('user_id,status,role,profiles!user_id(username)').eq('group_id', g.id)
    setMembers(data || [])
  }, [g.id])
  const loadNotes = useCallback(async () => {
    const { data } = await supabase.from('group_notes').select('id,qid,body,created_at,author_id,profiles!author_id(username)').eq('group_id', g.id).order('created_at', { ascending: false }).limit(300)
    setNotes(data || [])
  }, [g.id])
  useEffect(() => {
    loadMembers(); loadNotes()
    const ch = supabase.channel('gn-' + g.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_notes', filter: `group_id=eq.${g.id}` }, () => loadNotes())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [g.id, loadMembers, loadNotes])

  const invite = async () => {
    setMsg('')
    const u = uname.trim().toLowerCase().replace(/^@/, '')
    if (!USERNAME_RE.test(u)) return setMsg('Pseudo invalide.')
    const { data: p } = await supabase.from('profiles').select('id,username').eq('username', u).maybeSingle()
    if (!p) return setMsg('Aucun étudiant avec ce pseudo.')
    if (p.id === me().id) return setMsg('C’est ton propre pseudo.')
    const { error } = await supabase.from('group_members').insert({ group_id: g.id, user_id: p.id, status: 'invited', role: 'member', invited_by: me().id })
    if (error) return setMsg(error.code === '23505' ? `${u} est déjà invité ou membre.` : 'Invitation impossible.')
    setUname(''); setMsg(`Invitation envoyée à ${u}.`); loadMembers()
  }
  const addNote = async () => {
    const q = normQ(qid), b = body.trim()
    if (!q) return setMsg('Identifiant de question introuvable.')
    if (!b) return
    try { const l = await loadQuestions([q]); if (!l.length) return setMsg('Identifiant de question introuvable.') } catch (er) { return setMsg(errorText(er)) }
    const { error } = await supabase.from('group_notes').insert({ group_id: g.id, qid: q, body: b, author_id: me().id })
    if (error) return setMsg('Impossible d’ajouter la note.')
    setBody(''); setMsg(''); loadNotes()
  }
  const delNote = async id => { await supabase.from('group_notes').delete().eq('id', id); loadNotes() }
  const kick = async uid => { await supabase.from('group_members').delete().eq('group_id', g.id).eq('user_id', uid); loadMembers() }
  const leave = async () => { if (!window.confirm('Quitter ce groupe ?')) return; await supabase.from('group_members').delete().eq('group_id', g.id).eq('user_id', me().id); onBack() }
  const del = async () => { if (!window.confirm('Supprimer le groupe et toutes ses notes ?')) return; await supabase.from('study_groups').delete().eq('id', g.id); onBack() }

  const { q } = useQuestion(normQ(qid))
  const shown = useMemo(() => (notes || []).filter(n => !filter.trim() || n.qid === normQ(filter)), [notes, filter])
  useEffect(() => {
    if (!notes || !notes.length) return undefined
    let live = true
    loadQuestions([...new Set(notes.map(n => n.qid))].slice(0, 60)).catch(() => {}).finally(() => { if (live) setReady(x => x + 1) })
    return () => { live = false }
  }, [notes])
  return (
    <section>
      <button className="ghost" onClick={onBack}>← Mes groupes</button>
      <div className="page-h"><h1>{g.name}</h1><p className="muted">{members.filter(m => m.status === 'member').length} membre(s)</p></div>
      <div className="card">
        <h3>Membres</h3>
        <ul className="st-list">{members.map(m => <li key={m.user_id}><span><b>{(m.profiles && m.profiles.username) || '—'}</b>{m.role === 'owner' ? ' · créateur' : ''}{m.status === 'invited' ? ' · invitation en attente' : ''}</span>{owner && m.role !== 'owner' && <button className="ghost st-mini" aria-label="Retirer" onClick={() => kick(m.user_id)}>✕</button>}</li>)}</ul>
        <div className="row"><input aria-label="Pseudo de l’ami" value={uname} placeholder="Pseudo de ton ami" onChange={e => setUname(e.target.value)} onKeyDown={e => e.key === 'Enter' && invite()} style={{ flex: 1, minWidth: 160 }} /><button onClick={invite}>Inviter</button></div>
        <div className="row small">{owner ? <button className="link" onClick={del}>Supprimer le groupe</button> : <button className="link" onClick={leave}>Quitter le groupe</button>}</div>
      </div>
      <div className="card">
        <h3>Partager une note sur une question</h3>
        <label className="fld">Identifiant de la question<input value={qid} onChange={e => setQid(e.target.value)} placeholder="ex. Q06135" /></label>
        {q && <div className="qprev"><div>{q.q}</div></div>}
        <label className="fld">Ta note<textarea rows={3} value={body} maxLength={2000} onChange={e => setBody(e.target.value)} placeholder="Explication, page du cours, piège, moyen mnémotechnique…" /></label>
        <div className="row"><button className="primary" disabled={!body.trim() || !qid.trim()} onClick={addNote}>Partager avec le groupe</button></div>
        {msg && <p className="muted small" role="status">{msg}</p>}
      </div>
      <div className="row"><b>Notes du groupe</b><input aria-label="Filtrer par question" value={filter} placeholder="Filtrer par question (Q…)" onChange={e => setFilter(e.target.value)} style={{ maxWidth: 220 }} /></div>
      {!notes ? <p className="muted">Chargement…</p> : shown.length ? shown.map(n => {
        const e = ready ? getQ(n.qid) : null
        return (
          <article key={n.id} className="card">
            <div className="muted small"><span className="bd id">{n.qid}</span> <b>{(n.profiles && n.profiles.username) || '—'}</b> · {ago(Date.parse(n.created_at))}</div>
            {e && <p className="muted small" style={{ margin: '6px 0' }}>{e.q}</p>}
            <p className="pbody" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</p>
            {(n.author_id === me().id || owner) && <button className="link small" onClick={() => delNote(n.id)}>Supprimer</button>}
          </article>
        )
      }) : <p className="muted">Aucune note pour l’instant. Partage la première.</p>}
    </section>
  )
}
