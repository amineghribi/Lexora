import { test, expect } from '@playwright/test'

const HARNESS = '/e2e.html?nav=1'
const SESSION = '/e2e.html?s=exam-session&nav=1'

test.describe('Parcours d’examen blanc', () => {
  test('démarrer, répondre, remettre, voir les résultats', async ({ page }) => {
    await page.goto(SESSION)

    // 1. session ouverte sur la première question, chronomètre actif
    await expect(page.getByText('1 / 3')).toBeVisible()
    await expect(page.getByText('180:00')).toBeVisible()

    // 2. répondre aux deux premières questions
    await page.getByRole('button', { name: 'Angioplastie primaire' }).click()
    await expect(page.getByText('1 répondue')).toBeVisible()
    await page.getByRole('button', { name: 'Suivant' }).click()
    await page.getByRole('button', { name: 'Troponine' }).click()
    await expect(page.getByText('2 répondues')).toBeVisible()

    // 3. remise avec confirmation
    await page.getByRole('button', { name: 'Terminer' }).click()
    await expect(page.getByRole('dialog')).toContainText('Terminer l’épreuve ?')
    await page.getByRole('button', { name: 'Remettre' }).click()

    // 4. résultats : note calculée, détail, pas de rang sans cohorte
    await expect(page.getByText('20 / 20')).toBeVisible()
    await expect(page.getByText('2 bonnes réponses sur 2 répondues')).toBeVisible()
    await expect(page.getByText('Rang')).toHaveCount(0)
    await expect(page.locator('.xr-list li.skip')).toHaveCount(1)
  })

  test('le brouillon est restauré après rechargement', async ({ page }) => {
    await page.goto(SESSION)
    await page.getByRole('button', { name: 'Angioplastie primaire' }).click()
    await expect(page.getByText('1 répondue')).toBeVisible()
    await page.reload()
    await expect(page.getByText('1 répondue')).toBeVisible()
  })

  test('le bouton Suivant est borné en fin d’épreuve', async ({ page }) => {
    await page.goto(SESSION)
    await page.getByRole('button', { name: 'Suivant' }).click()
    await page.getByRole('button', { name: 'Suivant' }).click()
    await expect(page.getByText('3 / 3')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Suivant' })).toBeDisabled()
  })
})

test.describe('Recherche', () => {
  test('saisir un terme, voir les résultats, ouvrir une question', async ({ page }) => {
    await page.goto(HARNESS)
    await page.getByRole('button', { name: 'aller-search' }).click()
    await expect(page.getByText('Cherche un mot-clé pour commencer')).toBeVisible()

    await page.getByLabel('Rechercher dans les questions').fill('coronarien')
    await expect(page.getByRole('listitem').filter({ hasText: 'Énoncé trouvé par la recherche' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ouvrir la question →' })).toBeVisible()
  })

  test('un terme trop court ne déclenche aucune recherche', async ({ page }) => {
    await page.goto(HARNESS)
    await page.getByRole('button', { name: 'aller-search' }).click()
    await page.getByLabel('Rechercher dans les questions').fill('c')
    await page.waitForTimeout(600)
    await expect(page.getByText('Cherche un mot-clé pour commencer')).toBeVisible()
    await expect(page.getByText('Énoncé trouvé par la recherche')).toHaveCount(0)
  })
})

test.describe('Modales', () => {
  test('poser une question : blocage puis publication', async ({ page }) => {
    await page.goto(HARNESS)
    await page.getByRole('button', { name: 'aller-ask' }).click()
    const publier = page.getByRole('button', { name: 'Publier' })
    await expect(publier).toBeDisabled()

    await page.getByLabel('Message').fill('Une question précise sur la stratégie de reperfusion.')
    await expect(publier).toBeEnabled()
    await publier.click()

    await expect(page.getByRole('button', { name: 'aller-exam-session' })).toBeVisible()
    const published = await page.evaluate(() => window.__published)
    expect(published.at(-1)).toEqual({ questionId: 'Q1', body: 'Une question précise sur la stratégie de reperfusion.' })
  })

  test('signaler une question : motif obligatoire puis envoi', async ({ page }) => {
    await page.goto(HARNESS)
    await page.getByRole('button', { name: 'aller-report' }).click()
    const envoyer = page.getByRole('button', { name: 'Signaler' })
    await expect(envoyer).toBeDisabled()

    await page.getByRole('button', { name: 'Erreur de correction' }).click()
    await expect(envoyer).toBeEnabled()
    await page.getByLabel('Précision').fill('la clé de réponse est fausse')
    await envoyer.click()

    const published = await page.evaluate(() => window.__published)
    expect(published.at(-1)).toMatchObject({ questionId: 'Q1', motif: 'Erreur de correction', note: 'la clé de réponse est fausse' })
  })
})

test.describe('Notifications et états', () => {
  test('le tiroir affiche une notification réelle et se ferme', async ({ page }) => {
    await page.goto(HARNESS)
    await page.getByRole('button', { name: 'aller-notifications' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Réponse à ta question')).toBeVisible()
    await page.getByRole('button', { name: 'Fermer' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('l’état d’erreur propose une action de reprise', async ({ page }) => {
    await page.goto(HARNESS)
    await page.getByRole('button', { name: 'aller-states' }).click()
    await expect(page.getByText('Erreur réseau')).toBeVisible()
    await page.getByRole('button', { name: 'Réessayer' }).click()
    await expect(page.getByText('1 / 3')).toBeVisible()
  })
})
