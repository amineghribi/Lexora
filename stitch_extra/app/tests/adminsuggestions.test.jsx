import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const rows = [
  { id: 1, category: 'contenu', body: 'Ajouter un cours sur les vascularites', created_at: '2026-11-09T09:00:00Z', status: 'ouverte' },
  { id: 2, category: 'fonctionnalité', body: 'Pouvoir reprendre une série interrompue', created_at: '2026-11-12T09:00:00Z' },
  { id: 3, category: 'problème', body: 'Le chronomètre ne s’arrête pas', created_at: '2026-11-13T09:00:00Z' },
]

let reply = { data: rows, error: null }
vi.mock('../src/session.js', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => ({ limit: () => Promise.resolve(reply) }) }) }) },
}))

const { AdminSuggestions } = await import('../src/adminsuggestions.jsx')

describe('Console — boîte des suggestions', () => {
  beforeEach(() => { reply = { data: rows, error: null } })

  it('liste les suggestions réelles avec leur catégorie', async () => {
    render(<AdminSuggestions go={() => {}} />)
    await waitFor(() => expect(screen.getByText('Ajouter un cours sur les vascularites')).toBeTruthy())
    expect(screen.getByText('Pouvoir reprendre une série interrompue')).toBeTruthy()
    expect(screen.getByText(/3 suggestions reçues/)).toBeTruthy()
  })

  it('filtre par catégorie et met à jour le compteur', async () => {
    render(<AdminSuggestions go={() => {}} />)
    await waitFor(() => expect(screen.getByText('Le chronomètre ne s’arrête pas')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /problème/ }))
    expect(screen.queryByText('Ajouter un cours sur les vascularites')).toBeNull()
    expect(screen.getByText('Le chronomètre ne s’arrête pas')).toBeTruthy()
    expect(screen.getByRole('button', { name: /contenu 1/ })).toBeTruthy()
  })

  it('affiche un état vide sans inventer de suggestion', async () => {
    reply = { data: [], error: null }
    render(<AdminSuggestions go={() => {}} />)
    await waitFor(() => expect(screen.getByText('Aucune suggestion')).toBeTruthy())
  })

  it('explique l’impossibilité de lire au lieu d’afficher une page vide', async () => {
    reply = { data: null, error: { message: 'permission denied' } }
    render(<AdminSuggestions go={() => {}} />)
    await waitFor(() => expect(screen.getByText('Lecture impossible')).toBeTruthy())
    expect(screen.getByText(/permission denied/)).toBeTruthy()
  })
})
