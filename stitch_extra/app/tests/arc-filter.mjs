// Le filtre de l'ARC enseignant : garde seulement les motifs de la spécialité, laisse le reste du module intact.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { filterMotifs, bankList, startCase, projector, MOTIF_SPECIALTY } from '../api/_arcfilter.js'

const html = readFileSync(new URL('../arc/index.html', import.meta.url), 'utf8')
const ids = html => { const i = html.indexOf('const MOTIFS = ') + 15; const m = JSON.parse(html.slice(i, html.indexOf('];\n', i) + 1) || '[]'); return m.map(x => x.id) }
const all = ids(html)
assert.equal(all.length, 12, 'le module a 12 motifs')
assert.deepEqual([...all].sort(), Object.keys(MOTIF_SPECIALTY).sort(), 'chaque motif a une spécialité')

const card = filterMotifs(html, ['cardiologie'])
assert.ok(card, 'filtre cardiologie')
assert.deepEqual(ids(card), ['douleur-thoracique'])
assert.ok(card.length < html.length)
// tout ce qui est avant et après les motifs est identique
const a = html.indexOf('const MOTIFS = '), b = card.indexOf('const MOTIFS = ')
assert.equal(card.slice(0, b), html.slice(0, a))
const tail = s => s.slice(s.indexOf('];\n', s.indexOf('const MOTIFS = ')) )
assert.equal(tail(card), tail(html))

assert.deepEqual(ids(filterMotifs(html, ['neurologie-neurochirurgie'])).sort(), ['cephalee', 'coma_confusion'])
assert.deepEqual(ids(filterMotifs(html, [])), [], 'aucune spécialité : aucun motif')
assert.deepEqual(ids(filterMotifs(html, ['inconnue'])), [])
assert.equal(filterMotifs('<html>sans motifs</html>', ['cardiologie']), null)

// Banque des ARC : un patient par ligne, avec son diagnostic
const bank = bankList(html, ['cardiologie'])
assert.equal(bank.length, 1)
assert.equal(bank[0].id, 'douleur-thoracique')
assert.ok(bank[0].cases.length > 3)
for (const c of bank[0].cases) { assert.ok(c.texte && c.diag, 'texte et diagnostic présents'); assert.equal(typeof c.constantes, 'object') }
assert.deepEqual(bankList(html, []), [])
assert.equal(bankList('<html></html>', ['cardiologie']), null)

// Ouverture directe d'un patient : script ajouté seulement pour un motif et un indice valides
const only = filterMotifs(html, ['cardiologie'])
const go = startCase(only, 'douleur-thoracique', '2')
assert.ok(go.includes('S.ci=2;') && go.length > only.length)
assert.ok(startCase(only, 'dyspnee', '0') === only, 'motif hors spécialité : inchangé')
assert.ok(startCase(only, 'douleur-thoracique', '9999') === only)
assert.ok(startCase(only, 'douleur-thoracique', '-1') === only)
assert.ok(startCase(only, 'x"});alert(1);//', '0') === only, 'identifiant non valide : inchangé')
assert.ok(startCase(only, 'douleur-thoracique', null) === only)
const pj = projector(only)
assert.ok(pj.includes('id="projector"') && pj.length > only.length && pj.indexOf('id="projector"') > pj.indexOf('.dos-btn{'))
assert.ok(!html.includes('id="projector"'), 'le module des élèves reste intact')
console.log('arc-filter OK')
