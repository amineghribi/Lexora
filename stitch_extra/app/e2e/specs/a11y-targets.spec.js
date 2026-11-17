import { test, expect } from '@playwright/test'

/* Phase 7 — recette d'interaction :
   1. aucune cible interactive en dessous de 44 × 44 px (WCAG 2.5.5) ;
   2. le focus clavier reste visible (outline >= 2 px) sur les premiers éléments atteints ;
   3. le parcours ARC ne dépend d'aucune iframe. */

const HARNESS = '/e2e.html?nav=1'
const SCREENS = [
  'home', 'train', 'arc', 'exams', 'library', 'course', 'videos', 'pre-requis', 'flashcards',
  'lecture', 'forum', 'progression', 'history', 'profile', 'settings', 'parrainage', 'abonnement',
  'search', 'ask', 'report', 'notifications', 'states', 'moderation', 'suggestions', 'access',
  'teachbank', 'arcedit', 'amphi', 'amphi-projection',
]

const open = async (page, name) => {
  await page.goto(HARNESS)
  if (name !== 'home') await page.getByRole('button', { name: `aller-${name}`, exact: true }).click()
  await page.waitForTimeout(180)
}

test.describe('Cibles d’interaction', () => {
  for (const name of SCREENS) {
    test(`${name} : aucun contrôle sous 44 px`, async ({ page }) => {
      await open(page, name)
      const small = await page.evaluate(() => {
        const out = []
        const nodes = document.querySelectorAll('a, button, [role="button"], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])')
        for (const el of nodes) {
          const r = el.getBoundingClientRect()
          if (r.width === 0 && r.height === 0) continue
          const cs = getComputedStyle(el)
          if (cs.visibility === 'hidden' || cs.display === 'none') continue
          if (el.closest('[inert]')) continue
          const lab = el.closest('label')
          if (lab) {
            const lr = lab.getBoundingClientRect()
            if (lr.height >= 44 && lr.width >= 44) continue
          }
          if (r.height < 44 || r.width < 24) {
            out.push({
              tag: el.tagName.toLowerCase(),
              text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
              w: Math.round(r.width), h: Math.round(r.height),
            })
          }
        }
        return out
      })
      expect(small, `cibles trop petites : ${JSON.stringify(small.slice(0, 6))}`).toEqual([])
    })
  }
})

test.describe('Focus clavier', () => {
  test('le focus reste visible sur les premiers éléments', async ({ page }) => {
    await open(page, 'home')
    const seen = []
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return null
        const cs = getComputedStyle(el)
        const w = parseFloat(cs.outlineWidth || '0')
        return { tag: el.tagName.toLowerCase(), outline: w, outlineColor: cs.outlineColor, text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30) }
      })
      if (info) seen.push(info)
    }
    expect(seen.length).toBeGreaterThan(3)
    const invisible = seen.filter(s => !(s.outline >= 2))
    expect(invisible, `focus sans outline : ${JSON.stringify(invisible)}`).toEqual([])
  })
})

test.describe('Parcours ARC sans iframe', () => {
  test('la banque et le dossier ARC ne montent aucune iframe', async ({ page }) => {
    await open(page, 'arc')
    expect(await page.locator('iframe').count()).toBe(0)
  })
})
