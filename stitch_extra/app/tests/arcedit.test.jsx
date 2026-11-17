import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

let rpcReply = { data: 'abc12345-0000-4000-8000-000000000000', error: null }
const rpc = vi.fn(() => Promise.resolve(rpcReply))
vi.mock('../src/session.js', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))

const { ArcCaseEditor } = await import('../src/arcedit.jsx')

const fillId = () => {
  fireEvent.change(screen.getByLabelText(/Titre du cas/i), { target: { value: 'Douleur thoracique aiguë' } })
  fireEvent.change(screen.getByLabelText(/Motif d’admission/i), { target: { value: 'douleur thoracique' } })
}
const addStep = (label, text) => {
  fireEvent.change(screen.getByLabelText(`Ajouter une étape ${label}`), { target: { value: text } })
  fireEvent.click(screen.getByLabelText(`Ajouter une étape ${label}`).parentElement.querySelector('button'))
}

describe('Éditeur de cas pas à pas', () => {
  beforeEach(() => { rpc.mockClear(); rpcReply = { data: 'abc12345-0000-4000-8000-000000000000', error: null } })

  it('bloque l’enregistrement sans titre, motif et étape', () => {
    render(<ArcCaseEditor caseId={null} />)
    expect(screen.getByText('Enregistrer en brouillon').disabled).toBe(true)
    fillId()
    expect(screen.getByText('Enregistrer en brouillon').disabled).toBe(true)
  })

  it('enregistre les étapes dans l’ordre des sections', async () => {
    render(<ArcCaseEditor caseId={null} />)
    fillId()
    addStep('Présentation', 'Homme de 58 ans, douleur constrictive')
    addStep('Diagnostic final', 'SCA ST+')
    fireEvent.click(screen.getByText('Enregistrer en brouillon'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    const [fn, args] = rpc.mock.calls[0]
    expect(fn).toBe('arc_case_save')
    expect(args.p_status).toBe('draft')
    expect(args.p_steps).toEqual([
      { kind: 'presentation', text: 'Homme de 58 ans, douleur constrictive' },
      { kind: 'diagnosis', text: 'SCA ST+' },
    ])
  })

  it('publie quand la validation est complète', async () => {
    render(<ArcCaseEditor caseId={null} />)
    fillId()
    addStep('Interrogatoire', 'Chercher un effort déclenchant')
    fireEvent.click(screen.getByText('Publier le cas'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(rpc.mock.calls[0][1].p_status).toBe('published')
  })

  it('réordonne et supprime une étape', async () => {
    render(<ArcCaseEditor caseId={null} />)
    fillId()
    addStep('Examens complémentaires', 'ECG')
    addStep('Examens complémentaires', 'Troponine')
    fireEvent.click(screen.getByLabelText('Monter Examens complémentaires 2'))
    fireEvent.click(screen.getByText('Publier le cas'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(rpc.mock.calls[0][1].p_steps).toEqual([
      { kind: 'investigation', text: 'Troponine' },
      { kind: 'investigation', text: 'ECG' },
    ])
  })

  it('affiche le refus serveur sans prétendre avoir enregistré', async () => {
    rpcReply = { data: null, error: { message: 'TEACHER_REQUIRED' } }
    render(<ArcCaseEditor caseId={null} />)
    fillId()
    addStep('Présentation', 'Cas test')
    fireEvent.click(screen.getByText('Publier le cas'))
    await waitFor(() => expect(screen.getByText('Compte enseignant requis')).toBeTruthy())
    expect(screen.queryByText('Cas enregistré')).toBeNull()
  })

  it('confirme l’enregistrement quand le serveur répond', async () => {
    render(<ArcCaseEditor caseId={null} />)
    fillId()
    addStep('Présentation', 'Cas test')
    fireEvent.click(screen.getByText('Publier le cas'))
    await waitFor(() => expect(screen.getByText('Cas enregistré')).toBeTruthy())
  })
})
