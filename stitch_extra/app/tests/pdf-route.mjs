// Test de /api/pdf avec fetch simulé (aucun appel réseau). Usage : node tests/pdf-route.mjs (depuis app/)
process.env.R2_ACCOUNT_ID = 'acct'; process.env.R2_BUCKET = 'bkt'; process.env.R2_ACCESS_KEY_ID = 'id'; process.env.R2_SECRET_ACCESS_KEY = 'sec'
const { default: handler } = await import('../api/pdf.js')
let rpc = { status: 200, body: '"ok"' }, calls = []
globalThis.fetch = async (u, o) => { calls.push({ u, o }); return { status: rpc.status, ok: rpc.status < 300, text: async () => rpc.body, json: async () => JSON.parse(rpc.body) } }
const call = async (url, auth) => { const res = { h: {}, setHeader(k, v) { this.h[k] = v }, end(b) { this.b = b } }; await handler({ url, headers: auth ? { authorization: auth } : {} }, res); return { code: res.statusCode, body: JSON.parse(res.b), h: res.h } }
let bad = 0; const eq = (n, a, b) => { if (a !== b) { bad++; console.log('ECHEC', n, a, '!=', b) } else console.log('ok', n) }
let r = await call('/api/pdf?course=14', 'Bearer abc.def'); eq('200', r.code, 200); eq('url R2', /^https:\/\/acct\.r2\.cloudflarestorage\.com\/bkt\/courses\/14\.pdf\?/.test(r.body.url), true); eq('expires', r.body.expires_in, 3600); eq('no-store', r.h['Cache-Control'], 'private, no-store')
eq('rpc appelée avec le jeton', calls[0].o.headers.Authorization, 'Bearer abc.def'); eq('rpc p_course', JSON.parse(calls[0].o.body).p_course, '14')
r = await call('/api/pdf?course=71_1', 'Bearer a.b'); eq('71_1', r.code, 200)
for (const c of ['', '../x', '1000', 'abc', '14.pdf', '1_12']) { calls = []; r = await call('/api/pdf?course=' + encodeURIComponent(c), 'Bearer a.b'); eq('400 ' + c, r.code, 400); eq('pas de rpc ' + c, calls.length, 0) }
r = await call('/api/pdf?course=14'); eq('401 sans jeton', r.code, 401)
r = await call('/api/pdf?course=14', 'Basic x'); eq('401 mauvais schéma', r.code, 401)
rpc = { status: 200, body: '"denied"' }; r = await call('/api/pdf?course=14', 'Bearer a.b'); eq('429 quota', r.code, 429); eq('pas de url', r.body.url, undefined)
rpc = { status: 401, body: '{}' }; r = await call('/api/pdf?course=14', 'Bearer a.b'); eq('401 jeton invalide', r.code, 401)
rpc = { status: 400, body: '{"message":"ACCOUNT_BLOCKED"}' }; r = await call('/api/pdf?course=14', 'Bearer a.b'); eq('403 bloqué', r.code, 403)
rpc = { status: 500, body: '{}' }; r = await call('/api/pdf?course=14', 'Bearer a.b'); eq('502 amont', r.code, 502)
delete process.env.R2_BUCKET; rpc = { status: 200, body: '"ok"' }; r = await call('/api/pdf?course=14', 'Bearer a.b'); eq('503 non configuré', r.code, 503)
console.log(bad ? 'ECHECS: ' + bad : 'TOUT OK'); process.exit(bad ? 1 : 0)
