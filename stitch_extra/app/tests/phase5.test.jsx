import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExamSession } from '../src/examsession.jsx'
import { ExamResults } from '../src/examresults.jsx'
import { SearchPage } from '../src/searchpage.jsx'
import { AskModal } from '../src/askmodal.jsx'
import { ReportModal } from '../src/reportmodal.jsx'
import { NotificationsDrawer } from '../src/notifications.jsx'
import { StateBlock } from '../src/states.jsx'

const QS = [
  { id: 'Q1', stem: 'Énoncé un', options: ['Option A', 'Option B', 'Option C'], correct: 0, sp: 'Cardiologie' },
  { id: 'Q2', stem: 'Énoncé deux', options: ['Option A', 'Option B', 'Option C'], correct: 0, sp: 'Cardiologie' },
  { id: 'Q3', stem: 'Énoncé trois', options: ['Option A', 'Option B', 'Option C'], correct: 0, sp: 'Pneumologie' },
]
const index = { subjects: [], series: [{ sp: 'Cardiologie', sn: 1 }, { sp: 'Pneumologie', sn: 2 }], pre: {}, cases: [] }

/* ---------------- 2.6 Session d'examen ---------------- */
describe('ExamSession', () => {
  it('affiche la durée totale et la position dans l’épreuve', () => {
    render(<ExamSession init={{ ref: 'b', questions: QS, duration_minutes: 180 }} go={() => {}} />)
    expect(screen.getByText('180:00')).toBeTruthy()
    expect(screen.getByText('1 / 3')).toBeTruthy()
  })

  it('affiche un état explicite quand l’épreuve n’a aucune question', () => {
    render(<ExamSession init={{ ref: 'b', questions: [] }} go={() => {}} />)
    expect(screen.getByText('Aucune question chargée')).toBeTruthy()
    expect(screen.queryByText(/Question 1/)).toBeNull()
  })

  it('enregistre une réponse, met à jour le compteur et conserve le brouillon', () => {
    render(<ExamSession init={{ ref: 'epreuve-1', questions: QS }} go={() => {}} />)
    fireEvent.click(screen.getByText('Option B'))
    expect(screen.getByText('1 répondue')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('exam_draft:epreuve-1'))).toEqual({ Q1: 1 })
  })

  it('restaure le brouillon déjà enregistré pour la même épreuve', () => {
    localStorage.setItem('exam_draft:epreuve-2', JSON.stringify({ Q1: 2 }))
    render(<ExamSession init={{ ref: 'epreuve-2', questions: QS }} go={() => {}} />)
    expect(screen.getByText('1 répondue')).toBeTruthy()
  })

  it('demande confirmation avant la remise et transmet les réponses', () => {
    const go = vi.fn()
    render(<ExamSession init={{ ref: 'b', questions: QS }} go={go} />)
    fireEvent.click(screen.getByText('Option B'))
    fireEvent.click(screen.getByText('Terminer'))
    expect(screen.getByText('Terminer l’épreuve ?')).toBeTruthy()
    fireEvent.click(screen.getByText('Remettre'))
    expect(go).toHaveBeenCalledTimes(1)
    const arg = go.mock.calls[0][0]
    expect(arg.name).toBe('exam-results')
    expect(arg.answers).toEqual({ Q1: 1 })
    expect(arg.questions).toHaveLength(3)
  })

  it('bascule sur « Temps écoulé » quand la durée est nulle', () => {
    render(<ExamSession init={{ ref: 'b', questions: QS, duration_minutes: 0 }} go={() => {}} />)
    const dlg = screen.getByRole('dialog')
    expect(dlg.textContent).toContain('Temps écoulé')
  })

  it('désactive Précédent sur la première question et Suivant sur la dernière', () => {
    render(<ExamSession init={{ ref: 'b', questions: QS }} go={() => {}} />)
    expect(screen.getByText('Précédent').disabled).toBe(true)
    expect(screen.getByText('Suivant').disabled).toBe(false)
    fireEvent.click(screen.getByText('Suivant'))
    fireEvent.click(screen.getByText('Suivant'))
    expect(screen.getByText('Suivant').disabled).toBe(true)
    expect(screen.getByText('3 / 3')).toBeTruthy()
  })
})

/* ---------------- 2.7 Résultats ---------------- */
describe('ExamResults', () => {
  it('calcule la note sur les réponses remises', () => {
    render(<ExamResults init={{ questions: QS, answers: { Q1: 0, Q2: 1, Q3: 0 } }} go={() => {}} />)
    expect(screen.getByText('13.3 / 20')).toBeTruthy()
    expect(screen.getByText(/2 bonnes réponses sur 3 répondues/)).toBeTruthy()
  })

  it('affiche — et un état vide quand aucune réponse n’a été remise', () => {
    render(<ExamResults init={{ questions: QS, answers: {} }} go={() => {}} />)
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText('Aucune réponse enregistrée pour cette épreuve.')).toBeTruthy()
  })

  it('n’affiche jamais de rang sans cohorte réelle', () => {
    render(<ExamResults init={{ questions: QS, answers: { Q1: 0 } }} go={() => {}} />)
    expect(screen.queryByText('Rang')).toBeNull()
  })

  it('affiche le rang seulement quand la cohorte est fournie', () => {
    render(<ExamResults init={{ questions: QS, answers: { Q1: 0 }, cohort: { rank: 12, size: 340 } }} go={() => {}} />)
    expect(screen.getByText('Rang')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('sur 340 candidats')).toBeTruthy()
  })

  it('classe les points faibles du plus faible au plus solide', () => {
    render(<ExamResults init={{ questions: QS, answers: { Q1: 1, Q2: 0, Q3: 0 } }} go={() => {}} />)
    const sps = screen.getAllByText(/Cardiologie|Pneumologie/).map(n => n.textContent)
    expect(sps[0]).toBe('Cardiologie')
    expect(sps[sps.length - 1]).toBe('Pneumologie')
  })

  it('marque les questions sans réponse dans le détail', () => {
    render(<ExamResults init={{ questions: QS, answers: { Q1: 0 } }} go={() => {}} />)
    expect(screen.getAllByText('sans réponse')).toHaveLength(2)
  })
})

/* ---------------- 2.8 Recherche ---------------- */
describe('SearchPage', () => {
  beforeEach(() => { global.fetch = vi.fn() })

  it('explique la recherche tant qu’aucune requête n’est lancée', () => {
    render(<SearchPage index={index} go={() => {}} onStart={() => {}} />)
    expect(screen.getByText('Cherche un mot-clé pour commencer')).toBeTruthy()
  })

  it('ne lance pas de requête sous deux caractères', async () => {
    render(<SearchPage index={index} go={() => {}} onStart={() => {}} />)
    fireEvent.change(screen.getByLabelText('Rechercher dans les questions'), { target: { value: 'a' } })
    await new Promise(r => setTimeout(r, 500))
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('affiche les résultats réels et ouvre la question', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => [{ id: 'Q9', sp: 'Cardiologie', stem: 'Énoncé trouvé', snippet: 'extrait' }] }))
    const onStart = vi.fn()
    render(<SearchPage index={index} go={() => {}} onStart={onStart} />)
    fireEvent.change(screen.getByLabelText('Rechercher dans les questions'), { target: { value: 'coronarien' } })
    await waitFor(() => expect(screen.getByText('Énoncé trouvé')).toBeTruthy())
    fireEvent.click(screen.getByText('Ouvrir la question →'))
    expect(onStart.mock.calls[0][0].ids).toEqual(['Q9'])
  })

  it('affiche un message d’erreur si la recherche échoue', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500 }))
    render(<SearchPage index={index} go={() => {}} onStart={() => {}} />)
    fireEvent.change(screen.getByLabelText('Rechercher dans les questions'), { target: { value: 'coronarien' } })
    await waitFor(() => expect(screen.getByText('Recherche indisponible pour le moment.')).toBeTruthy())
  })

  it('affiche l’état « aucun résultat »', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => [] }))
    render(<SearchPage index={index} go={() => {}} onStart={() => {}} />)
    fireEvent.change(screen.getByLabelText('Rechercher dans les questions'), { target: { value: 'zzz' } })
    await waitFor(() => expect(screen.getByText('Aucun résultat')).toBeTruthy())
  })
})

/* ---------------- Modale « poser une question » ---------------- */
describe('AskModal', () => {
  it('bloque la publication sous 20 caractères', () => {
    render(<AskModal questionId="Q1" onClose={() => {}} onPublish={async () => {}} />)
    const btn = screen.getByText('Publier')
    expect(btn.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'trop court' } })
    expect(screen.getByText('Publier').disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'x'.repeat(20) } })
    expect(screen.getByText('Publier').disabled).toBe(false)
  })

  it('publie le message nettoyé puis ferme', async () => {
    const onPublish = vi.fn(async () => {}), onClose = vi.fn()
    render(<AskModal questionId="Q1" onClose={onClose} onPublish={onPublish} />)
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '  Une question précise sur l’item 228.  ' } })
    fireEvent.click(screen.getByText('Publier'))
    await waitFor(() => expect(onPublish).toHaveBeenCalled())
    expect(onPublish.mock.calls[0][0]).toEqual({ questionId: 'Q1', body: 'Une question précise sur l’item 228.' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('garde la modale ouverte et signale l’échec de publication', async () => {
    const onClose = vi.fn()
    render(<AskModal questionId="Q1" onClose={onClose} onPublish={async () => { throw new Error('boom') }} />)
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'x'.repeat(25) } })
    fireEvent.click(screen.getByText('Publier'))
    await waitFor(() => expect(screen.getByText('La publication a échoué. Réessaie dans un instant.')).toBeTruthy())
    expect(onClose).not.toHaveBeenCalled()
  })
})

/* ---------------- Modale « signaler » ---------------- */
describe('ReportModal', () => {
  it('exige un motif avant d’envoyer', () => {
    render(<ReportModal questionId="Q1" onSubmit={async () => {}} onClose={() => {}} />)
    expect(screen.getByText('Signaler').disabled).toBe(true)
    fireEvent.click(screen.getByText('Erreur de correction'))
    expect(screen.getByText('Signaler').disabled).toBe(false)
    expect(screen.getByText('Motif : Erreur de correction')).toBeTruthy()
  })

  it('transmet le motif et la précision nettoyée', async () => {
    const onSubmit = vi.fn(async () => {})
    render(<ReportModal questionId="Q1" onSubmit={onSubmit} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Énoncé ambigu'))
    fireEvent.change(screen.getByLabelText('Précision'), { target: { value: '  voir item 228  ' } })
    fireEvent.click(screen.getByText('Signaler'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual({ questionId: 'Q1', motif: 'Énoncé ambigu', note: 'voir item 228' })
  })

  it('signale l’échec d’enregistrement', async () => {
    render(<ReportModal questionId="Q1" onSubmit={async () => { throw new Error('boom') }} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Doublon'))
    fireEvent.click(screen.getByText('Signaler'))
    await waitFor(() => expect(screen.getByText('Le signalement n’a pas pu être enregistré.')).toBeTruthy())
  })
})

/* ---------------- Notifications ---------------- */
describe('NotificationsDrawer', () => {
  it('affiche l’état vide sans inventer de message', () => {
    render(<NotificationsDrawer items={[]} onClose={() => {}} go={() => {}} />)
    expect(screen.getByText('Aucun message')).toBeTruthy()
  })

  it('affiche les notifications réelles et ouvre leur cible', () => {
    const go = vi.fn()
    render(<NotificationsDrawer
      items={[{ id: 1, type: 'réponse', title: 'Réponse du modérateur', text: 'détail', at: Date.now(), read: false, target: { name: 'forum-home' } }]}
      onClose={() => {}} go={go} />)
    expect(screen.getByText('Réponse du modérateur')).toBeTruthy()
    fireEvent.click(screen.getByText('Ouvrir →'))
    expect(go).toHaveBeenCalledWith({ name: 'forum-home' })
  })

  it('ne marque comme non lue que la notification non lue', () => {
    const { container } = render(<NotificationsDrawer
      items={[{ id: 1, title: 'lue', read: true }, { id: 2, title: 'non lue', read: false }]}
      onClose={() => {}} go={() => {}} />)
    expect(container.querySelectorAll('.nt-l li.unread')).toHaveLength(1)
  })
})

/* ---------------- États ---------------- */
describe('StateBlock', () => {
  const cases = [
    ['loading', 'Chargement…'],
    ['offline', 'Hors ligne'],
    ['error', 'Erreur réseau'],
    ['notfound', 'Page introuvable'],
    ['empty', 'Rien à afficher'],
  ]
  cases.forEach(([kind, title]) => {
    it(`rend l’état ${kind}`, () => {
      render(<StateBlock kind={kind} />)
      expect(screen.getByText(title)).toBeTruthy()
    })
  })

  it('accepte un titre personnalisé et déclenche l’action', () => {
    const onAction = vi.fn()
    render(<StateBlock kind="error" title="Échec du chargement" action="Réessayer" onAction={onAction} />)
    expect(screen.getByText('Échec du chargement')).toBeTruthy()
    fireEvent.click(screen.getByText('Réessayer'))
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})
