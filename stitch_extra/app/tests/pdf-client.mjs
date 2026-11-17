// Test de src/pdf.js avec supabase, fetch et window simulés (aucun réseau). Usage : node tests/pdf-client.mjs (depuis app/)
import fs from 'node:fs'
let token = 'a.b'
globalThis.__sb = { auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } }
let src = fs.readFileSync(new URL('../src/pdf.js', import.meta.url), 'utf8').replace("import { supabase } from './session.js'", 'const supabase = globalThis.__sb')
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))
let bad = 0; const eq = (n, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('ECHEC', n, JSON.stringify(a), '!=', JSON.stringify(b)) } else console.log('ok', n) }
const R = (status, body) => ({ status, ok: status < 300, json: async () => body })
let api = R(200, { url: 'https://r2.example/bkt/courses/14.pdf?sig=1' }), r2 = R(206, {}), calls = []
let lastAuth = null
globalThis.fetch = async (u, o) => { calls.push(String(u)); if (String(u).startsWith('/api/pdf')) lastAuth = o.headers.Authorization; if (String(u).startsWith('/api/pdf')) { if (api instanceof Error) throw api; return api } if (r2 instanceof Error) throw r2; return r2 }
const code = async k => { try { await mod.signedPdfUrl(k); return 'ok' } catch (e) { return e.code } }
const reset = () => { calls = []; mod.__c && 0 }
let n = 0; const key = () => 'k' + (++n) // clé neuve = pas de cache
token = null; eq('sans session -> LOGIN', await code(key()), 'LOGIN'); token = 'a.b'
api = R(401, {}); eq('401 -> LOGIN', await code(key()), 'LOGIN')
api = R(403, {}); eq('403 -> BLOCKED', await code(key()), 'BLOCKED')
api = R(429, {}); eq('429 -> LIMIT', await code(key()), 'LIMIT')
api = R(503, {}); eq('503 -> FALLBACK', await code(key()), 'FALLBACK')
api = new Error('net'); eq('réseau -> FALLBACK', await code(key()), 'FALLBACK')
api = R(200, {}); eq('sans url -> FALLBACK', await code(key()), 'FALLBACK')
api = R(200, { url: 'https://r2.example/x?sig' }); r2 = R(404, {}); eq('R2 404 -> FALLBACK', await code(key()), 'FALLBACK')
r2 = new TypeError('CORS'); eq('CORS refusé -> FALLBACK', await code(key()), 'FALLBACK')
r2 = R(206, {}); calls = []; const k = key()
eq('succès', await mod.signedPdfUrl(k), 'https://r2.example/x?sig'); await mod.signedPdfUrl(k)
eq('mise en cache : 1 appel API + 1 contrôle R2', calls.length, 2)
eq('jeton envoyé à /api/pdf', lastAuth, 'Bearer a.b')
// plus de repli statique : pdfDocUrl lève l'erreur
eq('plus de repli statique exporté', [mod.staticUrl, mod.STATIC_FALLBACK], [undefined, undefined])
api = R(503, {}); let e0; try { await mod.pdfDocUrl(key()) } catch (e) { e0 = e.code } eq('pdfDocUrl 503 lève FALLBACK', e0, 'FALLBACK')
api = R(429, {}); let e1; try { await mod.pdfDocUrl(key()) } catch (e) { e1 = e.code } eq('pdfDocUrl 429 lève LIMIT', e1, 'LIMIT')
// openPdf
let opened, loc = [], closed = 0, alerts = []
const win = { opener: 1, location: { replace: u => loc.push(u) }, close: () => closed++ }
globalThis.window = { open: (...a) => (opened = a, win), alert: m => alerts.push(m) }
const ev = (o = {}) => ({ preventDefault() { this.p = true }, ...o })
api = R(200, { url: 'https://r2.example/y?sig' }); r2 = R(206, {}); let e = ev(); mod.openPdf(e, key(), 7); await new Promise(r => setTimeout(r, 20))
eq('ouvre une fenêtre vide tout de suite', opened, ['', '_blank']); eq('preventDefault', e.p, true); eq('opener coupé', win.opener, null)
eq('url signée + #page', loc[0], 'https://r2.example/y?sig#page=7')
loc = []; closed = 0; alerts = []; api = R(503, {}); mod.openPdf(ev(), 'f1', 3); await new Promise(r => setTimeout(r, 20)); eq('panne route : pas de navigation', loc.length, 0); eq('panne route : fenêtre fermée', closed, 1); eq('panne route : message', alerts[0], mod.PDF_MESSAGES.FALLBACK)
loc = []; closed = 0; alerts = []; api = R(200, { url: 'https://r2.example/z?sig' }); r2 = R(403, {}); mod.openPdf(ev(), 'f2', 3); await new Promise(r => setTimeout(r, 20)); eq('R2 refuse : pas de navigation', loc.length, 0); eq('R2 refuse : message', alerts[0], mod.PDF_MESSAGES.FALLBACK); r2 = R(206, {}); closed = 0; alerts = []
loc = []; api = R(429, {}); mod.openPdf(ev(), key()); await new Promise(r => setTimeout(r, 20)); eq('429 : fenêtre fermée', closed, 1); eq('429 : message', alerts[0], mod.PDF_MESSAGES.LIMIT); eq('429 : pas de navigation', loc.length, 0)
api = R(200, { url: 'https://r2.example/w?sig' }); e = ev({ ctrlKey: true }); opened = null; mod.openPdf(e, key(), 1); await new Promise(r => setTimeout(r, 20)); eq('ctrl+clic : traité par l’application (href=#)', [opened, e.p], [['', '_blank'], true])
globalThis.window.open = () => null; alerts = []; mod.openPdf(ev(), key()); eq('fenêtre bloquée : message', alerts[0], mod.PDF_MESSAGES.POPUP)
console.log(bad ? 'ECHECS: ' + bad : 'TOUT OK'); process.exit(bad ? 1 : 0)
