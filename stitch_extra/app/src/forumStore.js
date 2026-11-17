// Forum branché sur Supabase (tables posts, comments, post_votes, comment_votes, follows, notifications, reports).
// Même interface qu'avant (listPosts, createPost, addComment, vote, remove, score, me) : forum.jsx change peu.
import { supabase, me } from './session.js'
export { me }

// Une question = un identifiant canonique (voir data.js). Les discussions sont rangées sur l'identifiant canonique ;
// les requêtes incluent aussi d'éventuelles anciennes copies par sécurité.
import { canonOf, twinsOf, loadCanon } from './data.js'
export const twins = async qid => { await loadCanon(); return twinsOf(qid) }

export const score = o => (typeof o.score === 'number' ? o.score : 0)

const SEED_NAME = 'Groupe Facebook'
const name = (row, seed) => (row.profiles && row.profiles.username) || (seed ? SEED_NAME : 'Compte supprimé')

async function myVotes() {
  const id = me().id
  if (!id) return { p: {}, c: {} }
  const [a, b] = await Promise.all([
    supabase.from('post_votes').select('post_id,value'),
    supabase.from('comment_votes').select('comment_id,value'),
  ])
  const p = {}, c = {}
  for (const r of a.data || []) p[r.post_id] = r.value
  for (const r of b.data || []) c[r.comment_id] = r.value
  return { p, c }
}

const SELECT = 'id,qid,title,body,score,seed,created_at,author_id,profiles!posts_author_id_fkey(username),comments(id,post_id,parent_id,body,score,seed,created_at,author_id,profiles!comments_author_id_fkey(username))'

export async function listPosts(qid) {
  let q = supabase.from('posts').select(SELECT).order('created_at', { ascending: false }).limit(300)
  if (qid) q = q.in('qid', await twins(qid))
  const [{ data, error }, mv] = await Promise.all([q, myVotes()])
  if (error) { console.warn(error.message); return [] }
  const id = me().id
  return (data || []).map(p => ({
    id: p.id, qid: p.qid, title: p.title, body: p.body, score: p.score, seed: p.seed, ctx: {},
    author: name(p, p.seed), uid: p.author_id || '', t: Date.parse(p.created_at),
    votes: id && mv.p[p.id] ? { [id]: mv.p[p.id] } : {},
    comments: (p.comments || []).map(c => ({
      id: c.id, parentId: c.parent_id, body: c.body, score: c.score, seed: c.seed,
      author: name(c, c.seed), uid: c.author_id || '', t: Date.parse(c.created_at),
      votes: id && mv.c[c.id] ? { [id]: mv.c[c.id] } : {},
    })),
  }))
}

export async function countByQ(qid) {
  const { count } = await supabase.from('posts').select('id', { count: 'exact', head: true }).in('qid', await twins(qid))
  return count || 0
}

export async function createPost({ qid, title, body }) {
  const id = me().id
  if (!id) throw new Error('AUTH')
  const { data, error } = await supabase.from('posts').insert({ qid: canonOf(qid), title: title.trim(), body: body.trim(), author_id: id }).select('id').single()
  if (error) throw error
  return data
}

export async function addComment(postId, parentId, body) {
  const id = me().id
  if (!id) throw new Error('AUTH')
  const { error } = await supabase.from('comments').insert({ post_id: postId, parent_id: parentId || null, body: body.trim(), author_id: id })
  if (error) throw error
}

export async function vote(postId, commentId, dir) {
  const id = me().id
  if (!id) throw new Error('AUTH')
  const tbl = commentId ? 'comment_votes' : 'post_votes', col = commentId ? 'comment_id' : 'post_id', tid = commentId || postId
  const { data } = await supabase.from(tbl).select('value').eq(col, tid).eq('user_id', id).maybeSingle()
  if (data && data.value === dir) await supabase.from(tbl).delete().eq(col, tid).eq('user_id', id)
  else await supabase.from(tbl).upsert({ user_id: id, [col]: tid, value: dir })
}

export async function remove(postId, commentId) {
  if (commentId) await supabase.from('comments').delete().eq('id', commentId)
  else await supabase.from('posts').delete().eq('id', postId)
}

export async function report(type, targetId, reason = '') {
  if (!me().id) throw new Error('AUTH')
  const { error } = await supabase.from('reports').insert({ target_type: type, target_id: targetId, reason: reason.slice(0, 500) })
  if (error) throw error
}

// ----- Suivre une question (notifications quand quelqu'un pose une question ou répond) -----
export async function isFollowing(qid) {
  if (!me().id) return false
  const { data } = await supabase.from('follows').select('qid').in('qid', await twins(qid)).limit(1)
  return !!(data && data.length)
}
export async function setFollow(qid, on) {
  const id = me().id
  if (!id) throw new Error('AUTH')
  if (on) await supabase.from('follows').upsert({ user_id: id, qid: canonOf(qid) })
  else await supabase.from('follows').delete().eq('user_id', id).in('qid', await twins(qid))
}

// ----- Notifications -----
export async function listNotifications() {
  if (!me().id) return []
  const { data } = await supabase.from('notifications').select('id,kind,qid,post_id,group_id,body,read,created_at,profiles!actor_id(username)').order('created_at', { ascending: false }).limit(40)
  return (data || []).map(n => ({ ...n, actor: (n.profiles && n.profiles.username) || '', t: Date.parse(n.created_at) }))
}
export async function markAllRead() {
  const id = me().id
  if (id) await supabase.from('notifications').update({ read: true }).eq('user_id', id).eq('read', false)
}
export async function clearNotifications() {
  const id = me().id
  if (id) await supabase.from('notifications').delete().eq('user_id', id)
}
// Temps réel : appelle cb à chaque nouvelle notification. Retourne une fonction pour se désabonner.
export function subscribeNotifications(cb) {
  const id = me().id
  if (!id) return () => {}
  const ch = supabase.channel('notif-' + id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${id}` }, p => cb(p.new))
    .subscribe()
  return () => { supabase.removeChannel(ch) }
}
