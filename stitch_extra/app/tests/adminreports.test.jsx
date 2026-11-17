import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const rows = [
  { id: 1, target_type: 'question', target_id: 'Q228-14', reason: 'Erreur de correction', created_at: '2026-11-10T10:00:00Z', status: 'ouvert' },
  { id: 2, target_type: 'comment', target_id: 'C-9', reason: 'Propos hors charte', created_at: '2026-11-11T10:00:00Z' },
]

let reply = { data: rows, error: null }
vi.mock('../src/session.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => ({ limit: () => Promise.resolve(reply) }) }),
    }),
  },
}))

const { AdminReports } = await import('../src/adminreports.jsx')

describe('Console de modération', () => {
  beforeEach(() => { reply = { data: rows, error: null } })

  it('liste les signalements réels et leurs motifs', async () => {
    render(<AdminReports go={() => {}} />)
    await waitFor(() => expect(screen.getByText('Erreur de correction')).toBeTruthy())
    expect(screen.getByText('Propos hors charte')).toBeTruthy()
    expect(screen.getByText(/2 signalements reçus/)).toBeTruthy()
  })

  it('filtre par type de cible', async () => {
    render(<AdminReports go={() => {}} />)
    await waitFor(() => expect(screen.getByText('Erreur de correction')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Commentaires/ }))
    expect(screen.queryByText('Erreur de correction')).toBeNull()
    expect(screen.getByText('Propos hors charte')).toBeTruthy()
  })

  it('affiche un état vide sans inventer de signalement', async () => {
    reply = { data: [], error: null }
    render(<AdminReports go={() => {}} />)
    await waitFor(() => expect(screen.getByText('Aucun signalement')).toBeTruthy())
  })

  it('explique l’impossibilité de lire plutôt que de mentir', async () => {
    reply = { data: null, error: { message: 'permission denied' } }
    render(<AdminReports go={() => {}} />)
    await waitFor(() => expect(screen.getByText('Lecture impossible')).toBeTruthy())
    expect(screen.getByText(/permission denied/)).toBeTruthy()
  })
})
