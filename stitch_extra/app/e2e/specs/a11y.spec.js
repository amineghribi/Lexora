import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'

/* Audit WCAG de tous les écrans, aux étapes clés des parcours.
   Sept écrans de la phase 5 (session, résultats, recherche, modales, notifications, états)
   + les écrans applicatifs (accueil, entraînement, ARC, examens, packs, cours, vidéos,
   pré-requis, flashcards, lecteur, forum, progression, historique, compte).
   Un seul rapport : a11y-report.md / a11y-report.json. */

const HARNESS = '/e2e.html?nav=1'
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const findings = []

async function audit(page, screen, step) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  findings.push({
    screen, step,
    violations: r.violations.map(v => ({
      id: v.id, impact: v.impact, help: v.help,
      nodes: v.nodes.length,
      targets: v.nodes.slice(0, 3).map(n => n.target.join(' ')),
      details: v.nodes.slice(0, 2).map(n => (n.failureSummary || '').replace(/\n/g, ' ')),
    })),
    passes: r.passes.length,
    incomplete: r.incomplete.length,
  })
  return r
}

const open = async (page, name) => {
  await page.goto(HARNESS)
  if (name !== 'home') {
    await page.getByRole('button', { name: `aller-${name}`, exact: true }).click()
  }
  await page.waitForTimeout(250)
}

test.describe('Écrans applicatifs', () => {
  test('Accueil', async ({ page }) => {
    await open(page, 'home')
    await expect(page.locator('.wrap')).toBeVisible()
    await audit(page, 'Accueil', 'tableau de bord')
  })

  test('S’entraîner', async ({ page }) => {
    await open(page, 'train')
    await audit(page, 'S’entraîner', 'liste des modes')
  })

  test('ARC — banque de cas', async ({ page }) => {
    await open(page, 'arc')
    await audit(page, 'ARC — banque de cas', 'entrée')
  })

  test('Examens blancs', async ({ page }) => {
    await open(page, 'exams')
    await audit(page, 'Examens blancs', 'consignes')
  })

  test('Packs de révision', async ({ page }) => {
    await open(page, 'library')
    await audit(page, 'Packs de révision', 'liste')
  })

  test('Page d’un cours', async ({ page }) => {
    await open(page, 'course')
    await audit(page, 'Page d’un cours', 'sommaire')
  })

  test('Cours vidéo — liste', async ({ page }) => {
    await open(page, 'videos')
    await audit(page, 'Cours vidéo (liste)', 'liste')
  })

  test('Pré-requis', async ({ page }) => {
    await open(page, 'pre-requis')
    await audit(page, 'Pré-requis', 'liste des sujets')
    await page.getByRole('button', { name: /Cardiologie/ }).first().click()
    await page.waitForTimeout(200)
    await audit(page, 'Pré-requis', 'filtre spécialité')
  })

  test('Flashcards', async ({ page }) => {
    await open(page, 'flashcards')
    await audit(page, 'Flashcards', 'état sans cartes')
  })

  test('Lecteur vidéo', async ({ page }) => {
    await open(page, 'lecture')
    await audit(page, 'Lecteur vidéo', 'lecteur')
    await page.getByRole('button', { name: /Mes prises de notes/ }).click()
    await page.waitForTimeout(150)
    await audit(page, 'Lecteur vidéo', 'onglet notes')
  })

  test('Forum', async ({ page }) => {
    await open(page, 'forum')
    await audit(page, 'Forum', 'liste des fils')
  })

  test('Ma Progression', async ({ page }) => {
    await open(page, 'progression')
    await audit(page, 'Ma Progression', 'période par défaut')
    await page.getByRole('tab', { name: /Mois en cours/ }).click()
    await page.waitForTimeout(250)
    await audit(page, 'Ma Progression', 'mois en cours')
  })

  test('Historique', async ({ page }) => {
    await open(page, 'history')
    await audit(page, 'Historique', 'liste')
  })

  test('Profil candidat', async ({ page }) => {
    await open(page, 'profile')
    await audit(page, 'Profil candidat', 'profil')
  })

  test('Réglages', async ({ page }) => {
    await open(page, 'settings')
    await audit(page, 'Réglages', 'préférences')
    await page.getByRole('button', { name: 'Compact' }).click()
    await page.waitForTimeout(150)
    await audit(page, 'Réglages', 'densité compacte')
  })

  test('Parrainage', async ({ page }) => {
    await open(page, 'parrainage')
    await audit(page, 'Parrainage', 'code et invitations')
  })

  test('Console de modération', async ({ page }) => {
    await open(page, 'moderation')
    await audit(page, 'Console de modération', 'signalements')
  })

  test('Console des suggestions', async ({ page }) => {
    await open(page, 'suggestions')
    await audit(page, 'Console des suggestions', 'boîte de réception')
  })

  test('Console des accès', async ({ page }) => {
    await open(page, 'access')
    await audit(page, 'Console des accès', 'liste des comptes')
  })

  test('Banque des patients (enseignant)', async ({ page }) => {
    await open(page, 'teachbank')
    await audit(page, 'Banque des patients', 'liste des cas')
  })

  test('Éditeur de cas (enseignant)', async ({ page }) => {
    await open(page, 'arcedit')
    await audit(page, 'Éditeur de cas', 'formulaire vide')
    await page.getByLabel(/Titre du cas/i).fill('Douleur thoracique aiguë')
    await page.getByLabel(/Motif d’admission/i).fill('douleur thoracique')
    await audit(page, 'Éditeur de cas', 'titre et motif saisis')
  })

  test('Mode amphi', async ({ page }) => {
    await open(page, 'amphi')
    await audit(page, 'Mode amphi', 'séance en cours')
  })

  test('Projection amphi', async ({ page }) => {
    await open(page, 'amphi-projection')
    await audit(page, 'Projection amphi', 'grand écran')
  })

  test('Abonnement', async ({ page }) => {
    await open(page, 'abonnement')
    await audit(page, 'Abonnement', 'état de l’accès')
  })
})

test.describe('Écrans phase 5', () => {
  test('Session d’examen (départ, réponse, confirmation)', async ({ page }) => {
    await open(page, 'exam-session')
    await audit(page, 'Session d’examen', 'départ')
    await page.getByRole('button', { name: 'Angioplastie primaire' }).click()
    await audit(page, 'Session d’examen', 'après réponse')
    await page.getByRole('button', { name: 'Terminer' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await audit(page, 'Session d’examen', 'confirmation de remise')
  })

  test('Résultats', async ({ page }) => {
    await open(page, 'exam-session')
    await page.getByRole('button', { name: 'Angioplastie primaire' }).click()
    await page.getByRole('button', { name: 'Terminer' }).click()
    await page.getByRole('button', { name: 'Remettre' }).click()
    await expect(page.locator('.xr-score b').first()).toContainText('/ 20')
    await audit(page, 'Résultats de l’examen blanc', 'résultats affichés')
  })

  test('Recherche (vide puis résultats)', async ({ page }) => {
    await open(page, 'search')
    await audit(page, 'Recherche', 'état initial')
    await page.getByLabel('Rechercher dans les questions').fill('coronarien')
    await expect(page.getByRole('listitem').filter({ hasText: 'Énoncé trouvé' })).toBeVisible()
    await audit(page, 'Recherche', 'avec résultats')
  })

  test('Modale poser une question', async ({ page }) => {
    await open(page, 'ask')
    await expect(page.getByRole('dialog')).toBeVisible()
    await audit(page, 'Modale « poser une question »', 'ouverte')
    await page.getByLabel('Message').fill('Question de test sur la reperfusion.')
    await audit(page, 'Modale « poser une question »', 'message saisi')
  })

  test('Modale signaler une question', async ({ page }) => {
    await open(page, 'report')
    await expect(page.getByRole('dialog')).toBeVisible()
    await audit(page, 'Modale « signaler cette question »', 'ouverte')
    await page.getByRole('button', { name: 'Doublon' }).click()
    await audit(page, 'Modale « signaler cette question »', 'motif choisi')
  })

  test('Tiroir de notifications', async ({ page }) => {
    await open(page, 'notifications')
    await expect(page.getByRole('dialog')).toBeVisible()
    await audit(page, 'Tiroir Notifications', 'ouvert')
  })

  test('États d’interface', async ({ page }) => {
    await open(page, 'states')
    await expect(page.getByText('Erreur réseau')).toBeVisible()
    await audit(page, 'États d’interface', 'erreur réseau')
  })

  test.afterAll(async () => {
    const dir = process.cwd()
    fs.writeFileSync(path.join(dir, 'a11y-report.json'), JSON.stringify(findings, null, 2))
    const byRule = new Map()
    for (const f of findings) for (const v of f.violations) {
      const e = byRule.get(v.id) || { id: v.id, impact: v.impact, help: v.help, nodes: 0, screens: new Set() }
      e.nodes += v.nodes
      e.screens.add(`${f.screen} (${f.step})`)
      byRule.set(v.id, e)
    }
    const rows = [...byRule.values()].sort((a, b) => b.nodes - a.nodes)
    const screens = [...new Set(findings.map(f => f.screen))]
    const lines = [
      '# Rapport d’accessibilité — application complète',
      '',
      `Audits : ${findings.length} · écrans : ${screens.length} · règles : WCAG 2.0/2.1 A+AA`,
      `Violations : ${rows.reduce((n, r) => n + r.nodes, 0)} occurrences sur ${rows.length} règle(s)`,
      '',
      '## Écrans audités',
      '',
      screens.map(s => `- ${s}`).join('\n'),
      '',
      '## Violations par règle',
      '',
      rows.length ? '| Règle | Impact | Occurrences | Écrans concernés |' : '_Aucune violation._',
      rows.length ? '|---|---|---|---|' : '',
      ...rows.map(r => `| ${r.id} | ${r.impact} | ${r.nodes} | ${[...r.screens].join(' ; ')} |`),
      '',
      '## Détail par audit',
      '',
      ...findings.flatMap(f => [
        `### ${f.screen} — ${f.step}`,
        f.violations.length
          ? f.violations.map(v => `- **${v.id}** (${v.impact}) : ${v.help} — ${v.nodes} nœud(s) : \`${v.targets.join('`, `')}\``).join('\n')
          : '- aucune violation',
        '',
      ]),
    ]
    fs.writeFileSync(path.join(dir, 'a11y-report.md'), lines.join('\n'))
    console.log(`\nA11Y: ${findings.length} audits · ${screens.length} écrans · ${rows.length} règle(s) · ${rows.reduce((n, r) => n + r.nodes, 0)} occurrence(s)`)
  })
})
