import React, { useEffect, useMemo, useState } from 'react'
import { loadQuestions, getQ, useQuestion, errorText, canonOf, checkAnswers } from './data.js'
import * as F from './forumStore.js'
import { openAuth } from './session.js'
import { openPdf } from './pdf.js'

// Actions réservées aux comptes : ouvre la connexion si besoin, ignore les erreurs réseau
const guard = fn => async (...a) => { if (!F.me().id) { openAuth('login'); return false } try { await fn(...a); return true } catch (e) { if (e && e.message !== 'AUTH') console.warn(e.message || e); return false } }

const ago = t => { const s = (Date.now() - t) / 1000; if (s < 60) return 'à l’instant'; if (s < 3600) return `il y a ${Math.floor(s / 60)} min`; if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`; return `il y a ${Math.floor(s / 86400)} j` }
const norm = id => { const m = String(id || '').trim().toUpperCase().match(/^Q?([\w-]+)$/); return m ? canonOf('Q' + m[1].replace(/^Q/, '')) : '' }

// qid -> infos de contexte (J1/J2, spécialité, cours, année, faculté)
function useCtx(index) {
  return useMemo(() => {
    const m = new Map()
    for (const s of index.series) for (const q of s.q) if (!m.has(q)) m.set(q, { j: s.j, sp: s.sp, tp: s.tp, y: s.y, ex: s.ex })
    const names = {}
    for (const s of index.subjects) names[s.no] = s.name
    return qid => {
      const c = m.get(qid) || {}
      const e = getQ(qid)
      return { j: c.j || '', sp: c.sp || (e && e.sp) || '', tp: c.tp || '', y: c.y || '', ex: c.ex || '', cours: e ? (names[e.sn] || '') : '' }
    }
  }, [index])
}

function Badges({ ctx, qid }) {
  return (
    <div className="badges">
      <span className="bd id">{qid}</span>
      {ctx.j && <span className={`bd j ${ctx.j}`}>{ctx.j}</span>}
      {ctx.sp && <span className="bd">{ctx.sp}</span>}
      {ctx.cours && <span className="bd">{ctx.cours}</span>}
      {ctx.y && <span className="bd dim">{ctx.y} {ctx.ex}</span>}
    </div>
  )
}

function Vote({ o, onVote }) {
  const mine = (o.votes || {})[F.me().id] || 0
  return (
    <div className="vote">
      <button className={mine === 1 ? 'on' : ''} onClick={() => onVote(1)} aria-label="Voter pour">▲</button>
      <b>{F.score(o)}</b>
      <button className={mine === -1 ? 'on dn' : ''} onClick={() => onVote(-1)} aria-label="Voter contre">▼</button>
    </div>
  )
}

function Reply({ onSend, onCancel, ph }) {
  const [t, setT] = useState('')
  return (
    <div className="reply">
      <textarea value={t} onChange={e => setT(e.target.value)} placeholder={ph || 'Ta réponse…'} rows={3} />
      <div className="row">{onCancel && <button className="ghost" onClick={onCancel}>Annuler</button>}<button className="primary" disabled={t.trim().length < 1} onClick={async () => { const r = await onSend(t); if (r !== false) setT('') }}>Publier</button></div>
    </div>
  )
}

function Comment({ c, all, post, reload, depth }) {
  const [open, setOpen] = useState(false)
  const [rep, setRep] = useState(false)
  const kids = all.filter(x => x.parentId === c.id).sort((a, b) => F.score(b) - F.score(a) || a.t - b.t)
  const mine = c.uid === F.me().id
  return (
    <div className="cm" style={{ marginLeft: depth ? 14 : 0 }}>
      <Vote o={c} onVote={guard(async d => { await F.vote(post.id, c.id, d); reload() })} />
      <div className="cm-b">
        <div className="muted small"><b>{c.author}</b> · {ago(c.t)}</div>
        <p>{c.body}</p>
        <div className="row small">
          <button className="link" onClick={() => setOpen(v => !v)}>Répondre</button>
          {mine && <button className="link" onClick={async () => { await F.remove(post.id, c.id); reload() }}>Supprimer</button>}
          {!mine && <button className="link" onClick={guard(async () => { await F.report('comment', c.id); setRep(true) })}>{rep ? 'Signalé' : 'Signaler'}</button>}
        </div>
        {open && <Reply onCancel={() => setOpen(false)} onSend={guard(async t => { await F.addComment(post.id, c.id, t); setOpen(false); reload() })} />}
        {kids.map(k => <Comment key={k.id} c={k} all={all} post={post} reload={reload} depth={Math.min(depth + 1, 4)} />)}
      </div>
    </div>
  )
}

function Post({ p, ctx, full, reload, onOpen, hideQ, onAnswer }) {
  const [, tick] = useState(0)
  const [seen, setSeen] = useState(false)
  useEffect(() => { if (!hideQ) loadQuestions([p.qid]).then(() => tick(1)).catch(() => {}) }, [hideQ, p.qid])
  const qq = hideQ ? null : getQ(p.qid)
  const roots = p.comments.filter(c => !c.parentId).sort((a, b) => F.score(b) - F.score(a) || a.t - b.t)
  const mine = p.uid === F.me().id
  return (
    <article className="post">
      <Vote o={p} onVote={guard(async d => { await F.vote(p.id, null, d); reload() })} />
      <div className="post-b">
        <Badges ctx={ctx} qid={p.qid} />
        {qq && (full ? <QTry q={qq} onAnswer={onAnswer} onDone={() => setSeen(true)} /> : <div className="qprev qprev-s">{qq.ct && <div className="case"><div className="case-t">Cas clinique</div>{qq.ct.length > 220 ? qq.ct.slice(0, 220) + '…' : qq.ct}</div>}<div>{qq.q.length > 200 ? qq.q.slice(0, 200) + '…' : qq.q}</div></div>)}
        <h3 onClick={onOpen} style={{ cursor: onOpen ? 'pointer' : 'default' }}>{p.title}</h3>
        <div className="muted small">par <b>{p.author}</b> · {ago(p.t)} · {p.comments.length} réponse{p.comments.length > 1 ? 's' : ''}</div>
        {(full || p.body.length < 220) ? <p className="pbody">{p.body}</p> : <p className="pbody">{p.body.slice(0, 220)}…</p>}
        {full && (
          <>
            {qq && !seen && !mine && (
              <div className="qtry-gate">
                <p className="muted small">Réponds d’abord au QCM ci-dessus pour voir la discussion, ou</p>
                <button type="button" className="link small" onClick={() => setSeen(true)}>voir la discussion sans répondre</button>
              </div>
            )}
          </>
        )}
        {full && (!qq || seen || mine) && (
          <>
            {mine && <button className="link small" onClick={async () => { await F.remove(p.id); reload(true) }}>Supprimer le post</button>}
            {!mine && <button className="link small" onClick={guard(async () => { await F.report('post', p.id); window.alert('Merci, le message a été signalé.') })}>Signaler</button>}
            <Reply ph="Écris ta réponse…" onSend={guard(async t => { await F.addComment(p.id, null, t); reload() })} />
            <div className="cms">{roots.length ? roots.map(c => <Comment key={c.id} c={c} all={p.comments} post={p} reload={reload} depth={0} />) : <p className="muted">Aucune réponse pour l’instant.</p>}</div>
          </>
        )}
      </div>
    </article>
  )
}

// Mini-QCM : l'élève répond avant de lire la discussion et voit tout de suite le résultat
function QTry({ q, onDone, onAnswer }) {
  const [sel, setSel] = useState([])
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { setSel([]); setRes(null); setErr('') }, [q.i])
  const toggle = L => !res && setSel(s => s.includes(L) ? s.filter(x => x !== L) : [...s, L].sort())
  const submit = async () => {
    if (!F.me().id) { openAuth('login'); return }
    if (!sel.length || busy) return
    setBusy(true); setErr('')
    try {
      const m = await checkAnswers([{ id: q.i, chosen: sel }])
      const ok = !!m.get(q.i)
      const e = getQ(q.i) || {}
      setRes({ ok, c: String(e.c || '').split('').filter(Boolean), w: e.w, cs: e.cs, pg: e.pg, mn: e.mn, cp: e.cp, dis: e.f === 'dis' })
      onAnswer && onAnswer(getQ(q.i) || q, sel, ok)
      onDone && onDone(ok)
    } catch (e) { setErr(errorText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="qprev qtry">
      {q.ct && <div className="case"><div className="case-t">Cas clinique</div>{q.ct}</div>}
      <div>{q.q}</div>
      <div className="qtry-o">
        {Object.entries(q.o || {}).map(([L, t]) => {
          const good = res && res.c.includes(L), bad = res && sel.includes(L) && !good
          return (
            <button key={L} type="button" className={`opt ${sel.includes(L) ? 'sel mine' : ''} ${good ? 'good' : ''} ${bad ? 'bad' : ''}`} onClick={() => toggle(L)} aria-pressed={sel.includes(L)}>
              <span className="L">{L}</span><span className="T">{t}</span>
              {res && <span className="mk">{good ? (sel.includes(L) ? '✓' : 'attendue') : bad ? '✗' : ''}</span>}
            </button>
          )
        })}
      </div>
      {!res && <button type="button" disabled={!sel.length || busy} onClick={submit}>{busy ? '…' : 'Valider ma réponse'}</button>}
      {res && <p className={res.ok ? 'qtry-ok' : 'qtry-ko'}><b>{res.ok ? 'Bonne réponse !' : 'Réponse incorrecte.'}</b> {res.c.length ? `Réponse attendue : ${res.c.join(', ')}.` : ''}</p>}
      {res && (
        <div className="qtry-exp">
          {res.dis && <div className="dis-note" role="note"><b>Réponse discutée.</b> La clé officielle est contestée : vérifie dans le cours.</div>}
          {res.w ? <p>{res.w}</p> : <p className="muted">Explication détaillée : bientôt.</p>}
          {res.cs && <div className="muted small">{res.cs}</div>}
          {res.cp && res.cp[0] && <a className="link" href="#" target="_blank" rel="noreferrer" onClick={e => openPdf(e, res.cp[0], res.cp[1])}>Cours p.{res.cp[1] || '?'}</a>}
          {res.pg && <div className="callout"><b>Piège</b>{res.pg}</div>}
          {res.mn && <div className="callout mn"><b>Mnémo</b>{res.mn}</div>}
        </div>
      )}
      {err && <p className="muted small">{err}</p>}
    </div>
  )
}

function QPreview({ q }) {
  if (!q) return null
  return (
    <div className="qprev">
      {q.ct && <div className="case"><div className="case-t">Cas clinique</div>{q.ct}</div>}
      <div>{q.q}</div>
      <ol type="A">{Object.entries(q.o || {}).map(([L, t]) => <li key={L}>{t}</li>)}</ol>
    </div>
  )
}

function NewPost({ index, ctxOf, init, onDone, onCancel }) {
  const [id, setId] = useState(init || '')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const qid = norm(id)
  const { q, loading: qLoading, error: qErr } = useQuestion(qid)
  const ok = q && title.trim().length > 0 && body.trim().length > 0
  return (
    <div className="card newpost">
      <h3>Poser une question</h3>
      <label>Identifiant de la question<input value={id} onChange={e => setId(e.target.value)} placeholder="ex. Q06135" /></label>
      {qid && !q && !qLoading && <p className="muted small">{qErr ? errorText(qErr) : 'Identifiant introuvable.'}</p>}
      {q && <><Badges ctx={ctxOf(qid)} qid={qid} /><QPreview q={q} /></>}
      <label>Titre<input value={title} onChange={e => setTitle(e.target.value)} maxLength={140} placeholder="Ta question en une phrase" /></label>
      <label>Détails<textarea value={body} onChange={e => setBody(e.target.value)} rows={4} placeholder="Ce que tu n’as pas compris, ce que dit ton cours…" /></label>
      {!F.me().id && <p className="muted small">Connecte-toi pour publier. <button className="link" onClick={() => openAuth('login')}>Se connecter</button></p>}
      <div className="row"><button className="ghost" onClick={onCancel}>Annuler</button>
        <button className="primary" disabled={!ok || busy} onClick={guard(async () => { setBusy(true); try { await F.createPost({ qid, title, body }); onDone(qid) } finally { setBusy(false) } })}>Publier</button></div>
    </div>
  )
}

// Fil de discussion d'une seule question (utilisable aussi dans le quiz)
export function Thread({ qid, index, ctxOf, compact }) {
  const [posts, setPosts] = useState(null)
  const [open, setOpen] = useState(null)
  const [newp, setNewp] = useState(false)
  const [fol, setFol] = useState(false)
  const reload = async back => { if (back === true) setOpen(null); setPosts(await F.listPosts(qid)) }
  useEffect(() => { reload() }, [qid])
  useEffect(() => { F.isFollowing(qid).then(setFol) }, [qid])
  if (!posts) return <p className="muted">Chargement…</p>
  if (newp) return <NewPost index={index} ctxOf={ctxOf} init={qid} onCancel={() => setNewp(false)} onDone={() => { setNewp(false); reload() }} />
  const sorted = [...posts].sort((a, b) => F.score(b) - F.score(a) || b.t - a.t)
  const cur = open && posts.find(p => p.id === open)
  return (
    <div className="forum">
      {!cur && <div className="row"><b>{posts.length} discussion{posts.length > 1 ? 's' : ''} sur {qid}</b><span><button className={fol ? 'on' : ''} aria-pressed={fol} title="Être notifié des nouvelles questions et réponses sur ce QCM" onClick={guard(async () => { await F.setFollow(qid, !fol); setFol(!fol) })}>{fol ? '🔔 Suivie' : '🔔 Suivre'}</button> <button className="primary glow" onClick={() => setNewp(true)}>Poser une question</button></span></div>}
      {cur ? <><button className="ghost" onClick={() => setOpen(null)}>← Toutes les discussions</button><Post p={cur} ctx={ctxOf(cur.qid)} full hideQ reload={reload} /></>
        : sorted.length ? sorted.map(p => <Post key={p.id} p={p} ctx={ctxOf(p.qid)} hideQ reload={reload} onOpen={() => setOpen(p.id)} />) : <p className="muted">Personne n’a encore posé de question sur celle-ci.</p>}
    </div>
  )
}

export function ForumView({ index, init, onAnswer }) {
  const ctxOf = useCtx(index)
  const [ready, setReady] = useState(false)
  const [qid, setQid] = useState(init ? norm(init) : '')
  const [input, setInput] = useState(init || '')
  const [posts, setPosts] = useState([])
  const [sort, setSort] = useState('top')
  const [fj, setFj] = useState('')
  const [fsp, setFsp] = useState('')
  const [open, setOpen] = useState(null)
  const [newp, setNewp] = useState(false)
  const reload = async back => { if (back === true) setOpen(null); setPosts(await F.listPosts()) }
  useEffect(() => { reload() }, [])
  useEffect(() => {
    if (!posts.length) return undefined
    let live = true
    loadQuestions([...new Set(posts.map(p => p.qid))].slice(0, 60)).catch(() => {}).finally(() => { if (live) setReady(true) })
    return () => { live = false }
  }, [posts.length])
  const sps = useMemo(() => [...new Set(index.series.map(s => s.sp))].sort(), [index])
  const feed = useMemo(() => {
    let l = posts.map(p => ({ p, c: ready ? ctxOf(p.qid) : (p.ctx || {}) }))
    if (fj) l = l.filter(x => x.c.j === fj)
    if (fsp) l = l.filter(x => x.c.sp === fsp)
    l.sort((a, b) => sort === 'new' ? b.p.t - a.p.t : F.score(b.p) - F.score(a.p) || b.p.t - a.p.t)
    return l
  }, [posts, sort, fj, fsp, ready])
  const cur = open && posts.find(p => p.id === open)
  const { q, loading: qLoading, error: qErr } = useQuestion(qid)
  return (
    <section>
      <h2>Forum des questions</h2>
      <p className="muted">Cherche un identifiant de question pour voir toutes les discussions, ou pose ta propre question aux autres étudiants.</p>
      <div className="card">
        <div className="row"><input value={input} onChange={e => setInput(e.target.value)} placeholder="Identifiant de la question (ex. Q06135)" onKeyDown={e => e.key === 'Enter' && setQid(norm(input))} />
          <button className="primary" disabled={!input.trim()} onClick={() => setQid(norm(input))}>Chercher</button>
          {qid && <button className="ghost" onClick={() => { setQid(''); setInput('') }}>Effacer</button>}</div>
        {qid && !qLoading && !q && <p className="muted">{qErr ? errorText(qErr) : 'Identifiant introuvable.'}</p>}
        {q && <><Badges ctx={ctxOf(qid)} qid={qid} /><QTry key={qid} q={q} onAnswer={onAnswer} /></>}
      </div>
      {qid && q ? <Thread key={qid} qid={qid} index={index} ctxOf={ctxOf} /> : newp ? (
        <NewPost index={index} ctxOf={ctxOf} onCancel={() => setNewp(false)} onDone={() => { setNewp(false); reload() }} />
      ) : cur ? (
        <><button className="ghost" onClick={() => setOpen(null)}>← Retour au fil</button><Post p={cur} ctx={ctxOf(cur.qid)} full reload={reload} onAnswer={onAnswer} /></>
      ) : (
        <>
          <div className="row filters">
            <button className="primary glow" onClick={() => setNewp(true)}>Poser une question</button>
            <select value={sort} onChange={e => setSort(e.target.value)}><option value="top">Populaires</option><option value="new">Récentes</option></select>
            <select value={fj} onChange={e => setFj(e.target.value)}><option value="">J1 + J2</option><option>J1</option><option>J2</option></select>
            <select value={fsp} onChange={e => setFsp(e.target.value)}><option value="">Toutes les spécialités</option>{sps.map(s => <option key={s}>{s}</option>)}</select>
          </div>
          {feed.length ? feed.map(({ p, c }) => <Post key={p.id} p={p} ctx={c} reload={reload} onOpen={() => setOpen(p.id)} />) : <p className="muted">Aucune discussion pour l’instant. Pose la première question.</p>}
        </>
      )}
    </section>
  )
}

// Bouton « Discussion » à insérer dans le quiz : charge le fil de la question à la demande
export function DiscussToggle({ e, index }) {
  const [on, setOn] = useState(false)
  const [n, setN] = useState(null)
  const ctxOf = useCtx(index)
  useEffect(() => { F.countByQ(e.i).then(setN) }, [e.i, on])
  return (
    <div className="pvd">
      <button className="disc-btn glow" aria-expanded={on} onClick={() => setOn(v => !v)}>{on ? 'Masquer la discussion' : <><span aria-hidden="true">💬</span> {n ? `${n} discussion${n > 1 ? 's' : ''} sur cette question` : 'Tu ne comprends pas ? Pose ta question'}<small>{e.i}</small></>}</button>
      {on && <Thread qid={e.i} index={index} ctxOf={ctxOf} />}
    </div>
  )
}
