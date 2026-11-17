import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

let replies = {}
const rpc = vi.fn(fn => Promise.resolve(replies[fn] || { data: [], error: null }))
vi.mock('../src/session.js', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))
vi.mock('qrcode', () => ({ default: { toDataURL: () => Promise.resolve('data:image/png;base64,AAA') } }))

const { AmphiProjection } = await import('../src/amphiproject.jsx')

const demo = {
  state: { code: '969626', step: 'history', status: 'open', step_started_at: new Date(Date.now() - 96000).toISOString(), participants: 28, votes: 28 },
  results: [
    { choice: 'Douleur thoracique', votes: 18 },
    { choice: 'Dyspnée', votes: 7 },
  ],
}

const caseInfo = {
  patient: 'Patient #ARC · M. Slim B., 58 ans',
  motif: 'Douleur rétrosternale aiguë constrictive',
  step: 'Étape 1/5 : Interrogatoire',
  vitals: [{ label: 'Pression artérielle', value: '155/95', unit: 'mmHg', alert: true }],
  history: 'Début à 06h30, douleur 9/10.',
}

describe('Projection amphi', () => {
  beforeEach(() => { rpc.mockClear() })

  it('affiche le code, les participants et le nombre de votes', () => {
    render(<AmphiProjection session="s1" demo={demo} />)
    expect(screen.getByText('969626')).toBeTruthy()
    expect(screen.getByText('28')).toBeTruthy()
    expect(screen.getByText('participants')).toBeTruthy()
  })

  it('affiche un minuteur d’étape au format mm:ss', () => {
    render(<AmphiProjection session="s1" demo={demo} />)
    expect(screen.getByText(/01:3[0-9]/)).toBeTruthy()
    expect(screen.getByText('sur cette étape')).toBeTruthy()
  })

  it('affiche le QR d’accès et son texte alternatif', async () => {
    render(<AmphiProjection session="s1" demo={demo} />)
    await waitFor(() => expect(screen.getByAltText('QR code d’accès à la séance 969626')).toBeTruthy())
  })

  it('rend les résultats avec leurs pourcentages', () => {
    render(<AmphiProjection session="s1" demo={demo} />)
    expect(screen.getByText('Douleur thoracique')).toBeTruthy()
    expect(screen.getByText('72 %')).toBeTruthy()
    expect(screen.getByText('28 %')).toBeTruthy()
  })

  it('projette le dossier clinique quand il est fourni', () => {
    render(<AmphiProjection session="s1" demo={demo} caseInfo={caseInfo} />)
    expect(screen.getByText('Douleur rétrosternale aiguë constrictive')).toBeTruthy()
    expect(screen.getByText('155/95')).toBeTruthy()
    expect(screen.getByText(/Début à 06h30/)).toBeTruthy()
  })

  it('annonce l’absence de vote sans inventer de résultats', () => {
    render(<AmphiProjection session="s1" demo={{ state: demo.state, results: [] }} />)
    expect(screen.getByText(/Aucun vote pour l’instant/)).toBeTruthy()
  })

  it('avance d’étape via le backend quand une séance est fournie', async () => {
    replies.amphi_advance = { data: null, error: null }
    render(<AmphiProjection session="s1" demo={demo} />)
    fireEvent.click(screen.getByText('Étape suivante →'))
    await waitFor(() => expect(rpc.mock.calls.some(c => c[0] === 'amphi_advance')).toBe(true))
    expect(rpc.mock.calls.find(c => c[0] === 'amphi_advance')[1]).toEqual({ p_session: 's1', p_step: 'exam' })
  })
})
