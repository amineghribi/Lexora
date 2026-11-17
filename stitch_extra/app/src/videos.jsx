import React, { useEffect, useState } from 'react'
import { supabase } from './session.js'

const fmt = s => { const m = Math.floor((s || 0) / 60); return `${m} min` }

// Les vidéos hébergées en privé ont une adresse « r2:<chemin> » : le serveur signe un lien valable 1 h pour les comptes autorisés.
function useSrc(url) {
  const direct = !url || !url.startsWith('r2:')
  const [src, setSrc] = useState(direct ? url : '')
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (direct) { setSrc(url); setErr(''); return undefined }
    let off = false
    setSrc(''); setErr('')
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const tok = data && data.session && data.session.access_token
        const r = await fetch('/api/video?key=' + encodeURIComponent(url.slice(3)), { headers: { Authorization: 'Bearer ' + tok } })
        const j = await r.json().catch(() => ({}))
        if (off) return
        if (!r.ok || !j.url) throw new Error(j.error || 'http ' + r.status)
        setSrc(j.url)
      } catch (e) { if (!off) setErr('Vidéo momentanément indisponible. Réessaie dans un instant.') }
    })()
    return () => { off = true }
  }, [url, direct, tick])
  return { src, err, renew: () => setTick(t => t + 1) }
}

// Lecteur : pas de bouton de téléchargement, pas de menu contextuel, pas d'image dans l'image.
// Filigrane au pseudo de l'élève : un coin fixe + une marque qui change de place toutes les 12 s (impossible à recadrer).
// (Une capture d'écran reste possible : aucun site ne peut l'empêcher.)
function Player({ url, name, course, episode, onEnded, onLogged }) {
  // Compteur : une ligne « play » par vidéo lancée (premier démarrage de ce lecteur), une ligne « end » quand elle va jusqu'au bout.
  const sent = React.useRef({})
  const log = kind => {
    if (sent.current[kind]) return
    sent.current[kind] = true
    if (onLogged) onLogged(kind)
    try { supabase.from('video_plays').insert({ course, episode: episode == null ? null : episode, kind }).then(() => {}, () => {}) } catch (e) { /* sans effet sur la lecture */ }
  }
  const { src, err, renew } = useSrc(url)
  const [pos, setPos] = useState({ top: '4%', left: '60%' })
  const [retried, setRetried] = useState(false)
  useEffect(() => {
    const t = setInterval(() => setPos({ top: (6 + Math.random() * 76).toFixed(1) + '%', left: (4 + Math.random() * 56).toFixed(1) + '%' }), 12000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { setRetried(false); sent.current = {} }, [url])
  const mark = { position: 'absolute', pointerEvents: 'none', color: 'rgba(255,255,255,.5)', fontSize: 12, textShadow: '0 1px 2px #000', whiteSpace: 'nowrap', userSelect: 'none' }
  return (
    <div style={{ position: 'relative', background: '#000', borderRadius: 'var(--r)', overflow: 'hidden' }} onContextMenu={e => e.preventDefault()}>
      {err ? <p className="muted small" style={{ padding: 16, color: '#fff', margin: 0 }} role="alert">{err}</p>
        : !src ? <p className="muted small" style={{ padding: 16, color: '#fff', margin: 0 }} role="status">Chargement de la vidéo…</p>
          : <video key={src} src={src} controls controlsList="nodownload noplaybackrate" disablePictureInPicture disableRemotePlayback playsInline preload="metadata"
            style={{ width: '100%', maxHeight: '70vh', display: 'block' }} onContextMenu={e => e.preventDefault()} onPlay={() => log('play')} onEnded={() => { log('end'); if (onEnded) onEnded() }}
            onError={() => { if (url && url.startsWith('r2:') && !retried) { setRetried(true); renew() } }} />}
      <span aria-hidden="true" style={{ ...mark, top: 8, right: 10 }}>{name} · Résidanat QCM</span>
      <span aria-hidden="true" style={{ ...mark, top: pos.top, left: pos.left, transition: 'top 1s, left 1s', fontSize: 13, color: 'rgba(255,255,255,.38)' }}>{name}</span>
    </div>
  )
}

// Vidéos d'un cours : une par épisode, avec une série de QCM de la banque qui couvre l'épisode.
export function VideoPanel({ course, name, list, onStart, autoOpen }) {
  const eps = list.filter(v => v.course === course)
  const [cur, setCur] = useState(null)
  const [ended, setEnded] = useState(null)
  // Compteur personnel : nombre de lectures et de fins par épisode (clé 0 = version intégrale)
  const [counts, setCounts] = useState({})
  useEffect(() => {
    let off = false
    setCounts({})
    try {
      supabase.rpc('my_video_counts', { p_course: course }).then(({ data, error }) => {
        if (off || error || !Array.isArray(data)) return
        const m = {}
        for (const r of data) m[r.episode == null ? 0 : r.episode] = { plays: Number(r.plays) || 0, ends: Number(r.ends) || 0 }
        setCounts(m)
      }, () => {})
    } catch (e) { /* le compteur est facultatif */ }
    return () => { off = true }
  }, [course])
  const bump = (k, kind) => setCounts(c => { const o = c[k] || { plays: 0, ends: 0 }; return { ...c, [k]: kind === 'end' ? { ...o, ends: o.ends + 1 } : { ...o, plays: o.plays + 1 } } })
  useEffect(() => { setCur(autoOpen == null ? null : autoOpen); setEnded(null) }, [course, autoOpen])
  const sel = cur == null ? null : eps.find(v => (v.episode == null ? 0 : v.episode) === cur)
  const ordered = [...eps].sort((a, b) => (a.episode == null ? 99 : a.episode) - (b.episode == null ? 99 : b.episode))
  const numbered = ordered.filter(v => v.episode != null)
  const startEp = v => {
    const i = numbered.findIndex(x => x.episode === v.episode)
    const nx = numbered[i + 1]
    onStart({ title: `${v.course_title} — épisode ${v.episode} : QCM`, ids: v.qids, mode: 'immediate', kind: 'video', next: { course: v.course, episode: nx ? nx.episode : null } })
  }
  return (
    <div>
      <div style={{ display: 'grid', gap: 8 }}>
        {ordered.map(v => {
          const k = v.episode == null ? 0 : v.episode
          return (
            <div key={k} className="card" style={{ margin: 0, borderColor: cur === k ? 'var(--accent, currentColor)' : undefined }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span style={{ minWidth: 0 }}><b>{v.episode == null ? 'Version intégrale' : `Épisode ${v.episode}`}</b> {v.duration_s > 0 && <span className="muted small">· {fmt(v.duration_s)}</span>}
                  {(counts[k] && counts[k].plays > 0) && <span className="muted small" data-testid="video-count"> · Vu {counts[k].plays} fois{counts[k].ends > 0 ? ' · ✓ terminé' + (counts[k].ends > 1 ? ' ' + counts[k].ends + ' fois' : '') : ''}</span>}
                  <br /><span className="muted small">{v.title}</span></span>
                <span style={{ display: 'inline-flex', gap: 8 }}>
                  <button className={cur === k ? 'ghost' : 'primary'} onClick={() => { setEnded(null); setCur(cur === k ? null : k) }}>{cur === k ? 'Fermer' : 'Regarder'}</button>
                  {v.qids && v.qids.length > 0 && <button className="ghost" onClick={() => startEp(v)}>QCM ({v.qids.length})</button>}
                </span>
              </div>
              {sel && cur === k && <div style={{ marginTop: 10 }}><Player url={sel.url} name={name} course={sel.course} episode={sel.episode} onEnded={() => setEnded(k)} onLogged={kind => bump(k, kind)} />
                {ended === k && v.episode != null && v.qids && v.qids.length > 0 && (
                  <div className="card" style={{ marginTop: 8 }}>
                    <b>Épisode terminé.</b> <span className="muted small">Teste-toi maintenant sur cet épisode uniquement.</span>
                    <div style={{ marginTop: 8 }}><button className="primary" onClick={() => startEp(v)}>Lancer la série ({v.qids.length} QCM)</button></div>
                  </div>
                )}</div>}
            </div>
          )
        })}
      </div>
      <p className="muted small">Les QCM proposés sont choisis automatiquement d’après le contenu de l’épisode ; ils couvrent le sujet sans suivre exactement le plan de la vidéo.</p>
    </div>
  )
}

export function useCourseVideos(enabled) {
  const [st, setSt] = useState('idle')
  const [list, setList] = useState([])
  useEffect(() => {
    if (!enabled) return undefined
    let off = false
    setSt('busy')
    supabase.rpc('get_course_videos').then(({ data, error }) => {
      if (off) return
      if (error) { setSt(/PAID_ONLY/.test(String(error.message)) ? 'paid' : 'err'); return }
      setList(Array.isArray(data) ? data : []); setSt('ok')
    })
    return () => { off = true }
  }, [enabled])
  return { st, list }
}
