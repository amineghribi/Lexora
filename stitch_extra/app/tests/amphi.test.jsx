import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

let replies = {}
const rpc = vi.fn((fn) => Promise.resolve(replies[fn] || { data: [], error: null }))
vi.mock('../src/session.js', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))

const { Amphi } = await import('../src/amphi.jsx')

describe('Mode amphi', () => {
  beforeEach(() => {
    rpc.mockClear()
    replies = {
      amphi_start: { data: [{ session_id: 's1', code: 'ABC123' }], error: null },
      amphi_join: { data: [{ session_id: 's1', step: 'history', status: 'open' }], error: null },
      amphi_vote: { data: null, error: null },
      amphi_advance: { data: null, error: null },
      amphi_results: { data: [{ choice: 'Douleur thoracique', votes: 12 }], error: null },
    }
  })

  it('propose d’ouvrir ou de rejoindre une séance', () => {
    render(<Amphi role="student" />)
    expect(screen.getByText('Ouvrir une séance')).toBeTruthy()
    expect(screen.getByText('Rejoindre la séance').disabled).toBe(true)
  })

  it('ouvre une séance et affiche le code', async () => {
    render(<Amphi role="teacher" />)
    fireEvent.click(screen.getByText('Ouvrir une séance'))
    await waitFor(() => expect(screen.getByText('Code ABC123')).toBeTruthy())
    expect(rpc.mock.calls[0][0]).toBe('amphi_start')
    expect(screen.getByRole('heading', { name: 'Interrogatoire' })).toBeTruthy()
  })

  it('rejoint une séance avec le code saisi', async () => {
    render(<Amphi role="student" />)
    fireEvent.change(screen.getByLabelText('Code de la séance'), { target: { value: 'abc123' } })
    fireEvent.click(screen.getByText('Rejoindre la séance'))
    await waitFor(() => expect(rpc.mock.calls.some(c => c[0] === 'amphi_join')).toBe(true))
    const joinCall = rpc.mock.calls.find(c => c[0] === 'amphi_join')
    expect(joinCall[1]).toEqual({ p_code: 'ABC123' })
  })

  it('signale un code inconnu sans simuler de séance', async () => {
    replies.amphi_join = { data: null, error: { message: 'SESSION_NOT_FOUND' } }
    render(<Amphi role="student" />)
    fireEvent.change(screen.getByLabelText('Code de la séance'), { target: { value: 'ZZZ999' } })
    fireEvent.click(screen.getByText('Rejoindre la séance'))
    await waitFor(() => expect(screen.getByText('Séance indisponible')).toBeTruthy())
    expect(screen.queryByText('Code ZZZ999')).toBeNull()
  })

  it('vote sur une proposition et affiche les résultats réels', async () => {
    render(<Amphi role="student" options={['Douleur thoracique', 'Dyspnée']} initial={{ sid: 's1', code: 'ABC123', step: 'history' }} />)
    fireEvent.click(screen.getByText('Douleur thoracique'))
    await waitFor(() => expect(rpc.mock.calls.some(c => c[0] === 'amphi_vote')).toBe(true))
    const voteCall = rpc.mock.calls.find(c => c[0] === 'amphi_vote')
    expect(voteCall[1]).toEqual({ p_session: 's1', p_step: 'history', p_choice: 'Douleur thoracique' })
  })

  it('réserve le pilotage des étapes à l’animateur', async () => {
    const { unmount } = render(<Amphi role="student" options={['A']} initial={{ sid: 's1', code: 'ABC123', step: 'history' }} />)
    expect(screen.queryByText('Étape suivante →')).toBeNull()
    unmount()
    render(<Amphi role="teacher" options={['A']} initial={{ sid: 's1', code: 'ABC123', step: 'history' }} />)
    fireEvent.click(screen.getByText('Étape suivante →'))
    await waitFor(() => expect(rpc.mock.calls.some(c => c[0] === 'amphi_advance')).toBe(true))
    expect(rpc.mock.calls.find(c => c[0] === 'amphi_advance')[1]).toEqual({ p_session: 's1', p_step: 'exam' })
  })

  it('affiche l’absence de vote sans inventer de résultat', () => {
    render(<Amphi role="student" initial={{ sid: 's1', code: 'ABC123', step: 'history', results: [] }} />)
    expect(screen.getByText('Aucun vote enregistré pour cette étape.')).toBeTruthy()
  })
})
