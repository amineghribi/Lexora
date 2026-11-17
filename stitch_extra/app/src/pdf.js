// Ouverture des cours PDF : lien R2 signé obtenu auprès de /api/pdf (compte connecté, quota par compte).
// Les PDF ne sont plus dans le dépôt : il n'y a pas de repli statique. Une panne côté route ou R2 affiche un message.
import { supabase } from './session.js'

const TTL_MS = 50 * 60 * 1000 // le lien dure 1 h : on le garde 50 min
const cache = new Map()

const fail = code => Object.assign(new Error(code), { code })
export const PDF_MESSAGES = {
  LOGIN: 'Connecte-toi pour ouvrir le cours.',
  LIMIT: 'Tu as ouvert beaucoup de cours en peu de temps. Réessaie dans quelques minutes.',
  BLOCKED: 'Ce compte est bloqué.',
  FALLBACK: 'Impossible d’ouvrir le cours pour le moment. Réessaie plus tard.',
  POPUP: 'Ton navigateur a bloqué l’ouverture du cours. Autorise les fenêtres pour ce site, puis réessaie.',
}

// Renvoie l'adresse signée d'un cours, ou lève une erreur dont le code est LOGIN, LIMIT, BLOCKED ou FALLBACK.
export async function signedPdfUrl(key) {
  const c = cache.get(key)
  if (c && Date.now() - c.at < TTL_MS) return c.url
  const { data } = await supabase.auth.getSession()
  const tok = data && data.session && data.session.access_token
  if (!tok) throw fail('LOGIN')
  let r
  try { r = await fetch(`/api/pdf?course=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${tok}` } }) } catch (e) { throw fail('FALLBACK') }
  if (r.status === 401) throw fail('LOGIN')
  if (r.status === 403) throw fail('BLOCKED')
  if (r.status === 429) throw fail('LIMIT')
  if (!r.ok) throw fail('FALLBACK')
  let url
  try { url = (await r.json()).url } catch (e) { throw fail('FALLBACK') }
  if (!url) throw fail('FALLBACK')
  // Lecture d'un octet : vérifie que le fichier existe dans R2 et que le CORS autorise le site (pdfjs en a besoin).
  try {
    const p = await fetch(url, { headers: { Range: 'bytes=0-0' } })
    if (p.status !== 206 && p.status !== 200) throw fail('FALLBACK')
  } catch (e) { throw fail('FALLBACK') }
  cache.set(key, { url, at: Date.now() })
  return url
}

// Adresse utilisable par pdfjs (la même que signedPdfUrl, mise en cache 50 min).
export const pdfDocUrl = signedPdfUrl

// Gestionnaire de clic des liens « Cours p.N » : ouvre une fenêtre tout de suite (contre le bloqueur), puis y charge le PDF.
// Le href des liens est « # » : aucune adresse publique n'existe plus, tous les clics (y compris ctrl+clic) passent par ici.
export function openPdf(e, key, page) {
  if (e && e.preventDefault) e.preventDefault()
  const w = window.open('', '_blank')
  if (w) { try { w.opener = null } catch (x) { /* ignore */ } }
  const go = url => { if (w) w.location.replace(url + (page ? `#page=${page}` : '')) }
  const stop = code => { if (w) w.close(); window.alert(PDF_MESSAGES[code] || PDF_MESSAGES.FALLBACK) }
  if (!w) { stop('POPUP'); return }
  signedPdfUrl(key).then(go).catch(err => stop(err.code))
}
