// Cas écrits par les enseignants : validation, conversion, fusion dans le module.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { readBank, readImages, spanOf, validateSim, toSimCase, mergeSimCases, authoringCatalog, databankUsed, dbKey, fillDefaults, SOUNDS } from '../api/_simcase.js'
import { DATABANK } from '../api/_databank.js'
import { bankList, startCase, filterMotifs } from '../api/_arcfilter.js'

const html = readFileSync(new URL('../arc/index.html', import.meta.url), 'utf8')
const bank = readBank(html), imgs = readImages(html)
const motifs = spanOf(html, 'const MOTIFS = ').value
const dt = motifs.find(m => m.id === 'douleur-thoracique')
const qs = Object.keys(bank.q), gs = Object.keys(bank.g), xs = Object.keys(bank.x)
const sign = Object.keys(dt.signs)[0]
const good = () => ({
  diag: dt.hyp_choix[0], texte: 'Une femme de 45 ans consulte pour une douleur thoracique apparue ce matin au repos.',
  constantes: { PA: '120/80 mmHg', FC: '80/min', FR: '16/min', SpO2: '98 %', Température: '37 °C' },
  q: { [qs[0]]: { r: 'Comme un étau.', el: [sign], e: true }, [qs[1]]: { r: 'Derrière le sternum.' } },
  g: { [gs[1]]: { r: 'Conscient, pâle.', e: true } },
  x: { [xs[0]]: { r: 'Sans anomalie.', val: 'utile', com: 'À faire.', pending: true } },
  pieges: ['Ne pas attendre la troponine.'],
})

assert.equal(Object.keys(bank).length, 4)
let v = validateSim(good(), dt, bank, imgs); assert.ok(v.ok, v.error)
// conversion en cas du simulateur
const c = toSimCase('0123abcd-0000-0000-0000-000000000000', v.data, bank, true)
assert.equal(c.id, 'u-0123abcd'); assert.equal(c.diagnostic_final, dt.hyp_choix[0]); assert.equal(c.brouillon, true)
assert.equal(c.ess_q.length, 1); assert.deepEqual(c.ess_q[0].any, [qs[0]]); assert.equal(c.ess_g.length, 1); assert.equal(c.ess_x.length, 0)
assert.ok(c.gestes.g_const && /PA 120/.test(c.gestes.g_const.r), 'constantes générées')
assert.equal(c.examens[xs[0]].com, 'À faire.')
const inut = toSimCase('0123abcd-0', validateSim({ ...good(), x: { [xs[1]]: { r: 'Normal.', val: 'inutile' } } }, dt, bank, imgs).data, bank, false)
assert.ok(inut.examens[xs[1]].com && inut.examens[xs[1]].com !== 'undefined', 'commentaire par défaut des examens inutiles')
assert.ok(!('e' in c.questions[qs[0]]), 'drapeau « essentiel » retiré du cas servi')

// refus
const bad = (mut, code) => { const d = good(); mut(d); const r = validateSim(d, dt, bank, imgs); assert.ok(!r.ok && r.error === code, code + ' → ' + JSON.stringify(r)) }
bad(d => { d.diag = 'h_inconnu' }, 'BAD_DIAG')
bad(d => { d.texte = 'court' }, 'BAD_TEXTE')
bad(d => { d.q = { [qs[0]]: { r: 'ok' } } }, 'QUESTIONS_MIN')
bad(d => { d.q['q_inexistante'] = { r: 'x' } }, 'BAD_Q')
bad(d => { d.g['g_inexistant'] = { r: 'x' } }, 'BAD_G')
bad(d => { d.x[xs[1]] = { r: 'x', val: 'tres_utile' } }, 'BAD_VAL')
bad(d => { d.x[xs[1]] = { r: 'x', img: 'rx_inconnue' } }, 'BAD_IMG')
bad(d => { d.q[qs[0]].el = ['signe_inconnu'] }, 'BAD_SIGNS')
bad(d => { d.q[qs[0]].r = 'x'.repeat(601) }, 'BAD_Q')
bad(d => { d.pieges = new Array(7).fill('p') }, 'BAD_PIEGES')
bad(d => { d.constantes = 'x' }, 'BAD_CONSTANTES')
assert.ok(!validateSim(null, dt, bank, imgs).ok)
// un champ inconnu n'est jamais conservé
const extra = good(); extra.script = '<script>alert(1)</script>'; extra.q[qs[0]].x = '<b>'
assert.ok(!JSON.stringify(validateSim(extra, dt, bank, imgs).data).includes('script'))

// fusion : ajoutée au bon motif, indices stables, rien d'autre ne change
const rows = [{ id: '0123abcd-0000-0000-0000-000000000000', motif_id: 'douleur-thoracique', data: good(), draft: false },
  { id: '99999999-0000-0000-0000-000000000000', motif_id: 'douleur-thoracique', data: { diag: 'x' }, draft: false },
  { id: '88888888-0000-0000-0000-000000000000', motif_id: 'motif_inconnu', data: good(), draft: false }]
const merged = mergeSimCases(html, rows)
const mm = spanOf(merged, 'const MOTIFS = ').value
const base = dt.cases.length
assert.equal(mm.find(m => m.id === 'douleur-thoracique').cases.length, base + 1, 'seul le cas valide est ajouté')
assert.equal(mm.find(m => m.id === 'douleur-thoracique').cases[base].id, 'u-0123abcd')
assert.equal(mm.length, motifs.length)
assert.equal(mergeSimCases(html, []), html); assert.equal(mergeSimCases(html, null), html)
assert.equal(mergeSimCases(html, [rows[1], rows[2]]), html, 'aucun cas valide : module inchangé')
// la banque voit le cas ; l'ouverture directe par identifiant marche ; le filtre de spécialité s'applique après la fusion
const bank2 = bankList(filterMotifs(merged, ['cardiologie']), ['cardiologie'])
const last = bank2[0].cases[base]
assert.equal(last.cid, 'u-0123abcd'); assert.ok(last.diag)
assert.ok(startCase(filterMotifs(merged, ['cardiologie']), 'douleur-thoracique', 'u-0123abcd').includes(`S.ci=${base};`))
assert.ok(startCase(filterMotifs(merged, ['cardiologie']), 'douleur-thoracique', 'u-zzzzzzzz') === filterMotifs(merged, ['cardiologie']))
// catalogue
const cat = authoringCatalog(html, ['cardiologie'])
assert.equal(cat.motifs.length, 1); assert.ok(cat.q.length > 100 && cat.g.length > 50 && cat.x.length > 50 && cat.img.length > 5)
assert.equal(authoringCatalog(html, []).motifs.length, 0)
console.log('sim-case OK')

// ---- Banque d'images (R2) ----
const manifest = JSON.parse(readFileSync(new URL('../../studio/arc/databank/manifest.json', import.meta.url), 'utf8'))
const okStat = new Set(['utilisable', 'apres_reponse', 'reserve'])
assert.equal(DATABANK.length, manifest.fichiers.filter(f => okStat.has(f.statut)).length, 'DATABANK à jour avec le manifeste')
assert.ok(DATABANK.every(i => /^arc\/img\/(abdo|ecg|thorax)\/[A-Za-z0-9_]{1,80}\.webp$/.test(dbKey(i.id))), 'clés acceptées par /api/arc-media')
assert.ok(!DATABANK.some(i => i.statut === 'restreint' || i.statut === 'a_verifier'))
const dbImg = DATABANK.find(i => i.cat === 'ecg').id
const withImg = () => { const d = good(); d.x = { x_ecg: { r: 'Rythme sinusal.', val: 'indispensable', img: dbImg } }; return d }
assert.ok(validateSim(withImg(), dt, bank, imgs).ok, 'image de la banque acceptée')
bad(d => { d.x = { x_ecg: { r: 'x', img: 'ecg_inventee' } } }, 'BAD_IMG')
assert.equal(dbKey('ecg_inventee'), null)
const imgRow = { id: 'abcdef12-0000-0000-0000-000000000000', motif_id: 'douleur-thoracique', data: withImg() }
const used = databankUsed([imgRow, { ...imgRow, motif_id: 'inconnu' }], html)
assert.deepEqual(used, { [dbImg]: dbKey(dbImg) })
const mergedI = mergeSimCases(html, [imgRow])
const IMGm = spanOf(mergedI, 'const IMG = ').value
assert.ok(IMGm[dbImg] && IMGm[dbImg].d === '' && IMGm[dbImg].a && IMGm[dbImg].c, 'légende et crédit déclarés, sans contenu')
const catI = authoringCatalog(html, ['cardiologie'])
assert.equal(catI.img.length, DATABANK.length); assert.ok(catI.img.some(i => i.cat === 'ecg') && catI.img.some(i => i.cat === 'thorax') && catI.img.some(i => i.cat === 'abdo'))

// ---- Traitement et différentiel ----
const ts = Object.keys(bank.t)
assert.ok(ts.length > 50 && catI.t.length === ts.length)
const m0 = catI.motifs[0]
assert.ok(m0.signs.every(s => Array.isArray(s.pour) && Array.isArray(s.contre)), 'pour / contre exposés')
assert.ok(m0.hyps.some(h => h.ordo && h.ordo.ess.length), 'ordonnance par défaut exposée'); assert.ok(m0.hyps.every(h => h.ordo === null || Array.isArray(h.ordo.ess)))
const withOrdo = o => { const d = good(); d.ordo = o; return d }
v = validateSim(withOrdo({ ess: [ts[0]], ok: [ts[1]], non: { [ts[2]]: 'Contre-indiqué.' } }), dt, bank, imgs); assert.ok(v.ok, v.error)
const co = toSimCase('0123abcd-0', v.data, bank, false)
assert.deepEqual(co.ordo.ess, [{ lib: bank.t[ts[0]].lib, any: [ts[0]] }]); assert.deepEqual(co.ordo.ok, [ts[1]]); assert.deepEqual(co.ordo.non, { [ts[2]]: 'Contre-indiqué.' }); assert.deepEqual(co.ordo.aval, [])
assert.equal(toSimCase('0123abcd-0', validateSim(good(), dt, bank, imgs).data, bank, false).ordo, undefined, 'sans ordo : celle du diagnostic')
for (const [o, why] of [[{ ess: [], ok: [] }, 'aucun essentiel'], [{ ess: ['t_inconnu'] }, 'traitement inconnu'], [{ ess: [ts[0]], ok: [ts[0]] }, 'doublon entre listes'], [{ ess: [ts[0]], non: { [ts[1]]: '' } }, 'message vide'], [{ ess: ts.slice(0, 9) }, 'trop d’essentiels'], ['x', 'forme']]) {
  const r = validateSim(withOrdo(o), dt, bank, imgs); assert.ok(!r.ok && r.error === 'BAD_ORDO', why + ' → ' + JSON.stringify(r))
}
console.log('banque d’images + traitement OK')

// ---- Sons de l'auscultation et résultats par défaut ----
const sd = (g) => { const d = good(); d.g = g; return d }
v = validateSim(sd({ g_asc: { r: 'Frottement.', snd: 'rub2' }, g_asp: { r: 'Crépitants.', snd: 'crackles' } }), dt, bank, imgs); assert.ok(v.ok, v.error)
let cs = toSimCase('0123abcd-0', v.data, bank, false)
assert.equal(cs.gestes.g_asc.snd, 'rub2'); assert.equal(cs.gestes.g_asp.snd, 'crackles')
cs = toSimCase('0123abcd-0', validateSim(sd({ g_asc: { r: 'Souffle systolique 2/6.' } }), dt, bank, imgs).data, bank, false)
assert.strictEqual(cs.gestes.g_asc.snd, null, 'sans son choisi : muet, pas « bruits du cœur normaux »')
for (const g of [{ g_asc: { r: 'x', snd: 'wheeze' } }, { g_asp: { r: 'x', snd: 'rub2' } }, { g_asc: { r: 'x', snd: 'inconnu' } }, { g_eg: { r: 'x', snd: 'normal' } }]) {
  const r = validateSim(sd(g), dt, bank, imgs); assert.ok(!r.ok && r.error === 'BAD_SND', JSON.stringify(g))
}
assert.ok(catI.snd.g_asc.length === 4 && catI.snd.g_asp.length === 2)
const sndModule = spanOf(html, 'const SND = ').value
assert.ok(Object.values(SOUNDS).flat().every(([k]) => typeof sndModule[k] === 'string' && sndModule[k].length > 1000), 'chaque son proposé existe dans le module')
const filled = fillDefaults(html), bf = readBank(filled)
assert.ok(Object.values(bf.x).every(x => x.def), 'plus aucun examen sans résultat par défaut')
assert.equal(bf.x.x_bu.def, 'Sans anomalie.'); assert.equal(bf.x.x_ecg.def, bank.x.x_ecg.def, 'les défauts existants ne changent pas')
assert.equal(fillDefaults(filled), filled, 'idempotent')
console.log('sons + défauts OK')

// ---- Explication du diagnostic propre au cas ----
const ex = e => { const d = good(); d.expl = e; return d }
v = validateSim(ex('  Dans ce cas, le BBG complet est un équivalent de sus-décalage.  '), dt, bank, imgs); assert.ok(v.ok, v.error)
assert.equal(v.data.expl, 'Dans ce cas, le BBG complet est un équivalent de sus-décalage.')
assert.equal(toSimCase('0123abcd-0', v.data, bank, false).resume, v.data.expl)
assert.equal(toSimCase('0123abcd-0', validateSim(good(), dt, bank, imgs).data, bank, false).resume, undefined, 'sans explication : celle du motif')
assert.equal(validateSim(ex(''), dt, bank, imgs).ok, true); assert.ok(!('expl' in validateSim(ex(''), dt, bank, imgs).data))
assert.ok(!validateSim(ex('x'.repeat(601)), dt, bank, imgs).ok && validateSim(ex('x'.repeat(601)), dt, bank, imgs).error === 'BAD_EXPL')
assert.ok(html.includes('function resumeOf(h)') && !/esc\(hy\.resume\)|esc\(rh\.resume\)/.test(html), 'le module utilise l’explication du cas')
console.log('explication OK')
