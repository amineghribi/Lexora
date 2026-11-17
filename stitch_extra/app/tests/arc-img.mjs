// Images de l'ARC servies à part : module allégé, images complètes à part, écouteur injecté.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { stripImages, imageMap } from '../api/_arcimg.js'
import { spanOf } from '../api/_simcase.js'

const html = readFileSync(new URL('../arc/index.html', import.meta.url), 'utf8')
const light = stripImages(html)
assert.ok(light.length < html.length - 1000000, 'le module servi perd plus de 1 Mo')
const img = spanOf(light, 'const IMG = ').value
const full = spanOf(html, 'const IMG = ').value
assert.deepEqual(Object.keys(img), Object.keys(full), 'mêmes clés')
for (const [k, v] of Object.entries(img)) { assert.equal(v.d, ''); assert.equal(v.a, full[k].a, 'légende conservée') }
assert.ok(light.includes('addEventListener("message"') && light.includes('e.source!==window.parent'), 'écouteur limité à la page parente')
assert.ok(!light.includes('data:image/jpeg;base64'), 'plus d\'image intégrée')
// le reste du module est identique
const cut = s => s.slice(0, s.indexOf('const IMG = '))
assert.equal(cut(light), cut(html))
// carte des images : data-URI d'images seulement
const map = imageMap(html)
assert.equal(Object.keys(map).length, Object.keys(full).length)
for (const d of Object.values(map)) assert.match(d, /^data:image\/(jpeg|png|webp);base64,/)
assert.equal(stripImages('<html>sans images</html>'), '<html>sans images</html>')
assert.equal(imageMap('<html></html>'), null)
console.log('arc-img OK')
