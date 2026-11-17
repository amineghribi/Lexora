import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from './auth.jsx'
import * as F from './forumStore.js'

const ago = t => { const s = (Date.now() - t) / 1000; if (s < 60) return 'à l’instant'; if (s < 3600) return `il y a ${Math.floor(s / 60)} min`; if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`; return `il y a ${Math.floor(s / 86400)} j` }
// Annonce avec titre propre : le corps commence par « ## Titre » puis un saut de ligne. Sans cela, l'en-tête historique du forum s'affiche.
const splitAnnounce = body => { const m = /^##\s*(.+?)\n([\s\S]*)$/.exec(body || ''); return m ? { title: m[1], text: m[2] } : { title: '', text: body || '' } }
const TXT = {
  new_post: n => `${n.actor || 'Quelqu’un'} a posé une question sur ${n.qid}`,
  reply: n => `${n.actor || 'Quelqu’un'} a répondu sur ${n.qid}`,
  group_invite: n => `${n.actor || 'Quelqu’un'} t’invite dans le groupe « ${n.body} »`,
  group_join: n => `${n.actor || 'Quelqu’un'} a rejoint « ${n.body} »`,
  announce: n => splitAnnounce(n.body).title || '💬 Nouveau : le forum des questions',
  group_note: n => `${n.actor || 'Quelqu’un'} a partagé une note sur ${n.qid}`,
}

export function Bell({ go }) {
  const { user } = useAuth()
  const [list, setList] = useState([])
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const load = useCallback(async () => setList(await F.listNotifications()), [])

  useEffect(() => {
    if (!user) { setList([]); return undefined }
    load()
    const off = F.subscribeNotifications(n => {
      load()
      try { if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') new Notification('Résidanat QCM', { body: (TXT[n.kind] ? TXT[n.kind]({ ...n, actor: '' }) : 'Nouvelle notification') }) } catch (e) { /* ignore */ }
    })
    const t = setInterval(load, 60000) // filet de sécurité si le temps réel est coupé
    return () => { off(); clearInterval(t) }
  }, [user, load])
  useEffect(() => {
    if (!open) return undefined
    const h = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [open])

  if (!user) return null
  const unread = list.filter(n => !n.read).length
  const openIt = async n => {
    setOpen(false)
    if (n.kind === 'new_post' || n.kind === 'reply') go({ name: 'forum', qid: n.qid })
    else if (n.kind === 'announce') go({ name: splitAnnounce(n.body).title ? 'series' : 'forum' })
    else go({ name: 'groups', gid: n.group_id, qid: n.qid })
    if (!n.read) { await F.markAllRead(); load() }
  }
  return (
    <div className="bell" ref={box}>
      <button className="ghost bell-b" onClick={() => { setOpen(o => !o); if (!open) load() }} aria-label={`Notifications${unread ? `, ${unread} non lues` : ''}`} aria-expanded={open}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 0 0 4 0" /></svg>
        {unread > 0 && <span className="bell-n">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-pop card" role="menu">
          <div className="row" style={{ margin: 0, justifyContent: 'space-between' }}><b>Notifications</b>
            <span><button className="link small" onClick={async () => { await F.markAllRead(); load() }}>Tout lu</button> <button className="link small" onClick={async () => { await F.clearNotifications(); load() }}>Vider</button></span></div>
          {list.length ? <ul className="bell-l">{list.map(n => (
            <li key={n.id}><button className={`bell-i ${n.read ? '' : 'unread'}`} onClick={() => openIt(n)}>
              <span>{(TXT[n.kind] || (() => 'Notification'))(n)}</span>
              {n.kind !== 'group_invite' && n.kind !== 'group_join' && n.body && <em>{n.kind === 'announce' ? splitAnnounce(n.body).text : n.body}</em>}
              <small className="muted">{ago(n.t)}</small>
            </button></li>))}</ul>
            : <p className="muted small">Rien pour l’instant. Suis une question avec la cloche de son fil de discussion pour être prévenu des réponses.</p>}
        </div>
      )}
    </div>
  )
}
