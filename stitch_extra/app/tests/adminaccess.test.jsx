import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const future = new Date(Date.now() + 20 * 86400000).toISOString()
const past = new Date(Date.now() - 5 * 86400000).toISOString()
const rows = [
  { id: 1, user_id: 'u-1111-aaaa', username: 'nada_mn', plan: 'month', scope: 'residanat', ends_at: future, created_at: '2026-09-01T00:00:00Z' },
  { id: 2, user_id: 'u-2222-bbbb', username: 'nadouch1', plan: 'month', scope: 'residanat', ends_at: past, created_at: '2026-08-01T00:00:00Z' },
  { id: 3, user_id: 'u-3333-cccc', username: 'frik', plan: 'month', scope: 'residanat', created_at: '2026-07-01T00:00:00Z' },
]

let reply = { data: rows, error: null }
let rpcReply = { error: null }
const rpc = vi.fn(() => Promise.resolve(rpcReply))
vi.mock('../src/session.js', () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => ({ limit: () => Promise.resolve(reply) }) }) }),
    rpc: (...a) => rpc(...a),
  },
}))

const { AdminAccess } = await import('../src/adminaccess.jsx')

describe('Console — gestion des accès', () => {
  beforeEach(() => { reply = { data: rows, error: null }; rpcReply = { error: null }; rpc.mockClear() })

  it('liste les comptes et compte les accès actifs et échus', async () => {
    render(<AdminAccess go={() => {}} />)
    await waitFor(() => expect(screen.getByText('nada_mn')).toBeTruthy())
    expect(screen.getByText(/3 comptes · 1 actif/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Échéance passée 1/ })).toBeTruthy()
  })

  it('filtre par état : échéance passée', async () => {
    render(<AdminAccess go={() => {}} />)
    await waitFor(() => expect(screen.getByText('nadouch1')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Échéance passée/ }))
    expect(screen.getByText('nadouch1')).toBeTruthy()
    expect(screen.queryByText('nada_mn')).toBeNull()
  })

  it('recherche par nom de candidat', async () => {
    render(<AdminAccess go={() => {}} />)
    await waitFor(() => expect(screen.getByText('frik')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Rechercher un candidat'), { target: { value: 'nad' } })
    expect(screen.getByText('nada_mn')).toBeTruthy()
    expect(screen.queryByText('frik')).toBeNull()
  })

  it('n’écrit rien avant confirmation', async () => {
    render(<AdminAccess go={() => {}} />)
    await waitFor(() => expect(screen.getByText('frik')).toBeTruthy())
    fireEvent.click(screen.getAllByText('Ouvrir 30 jours')[2])
    expect(screen.getByRole('dialog').textContent).toContain('Ouvrir l’accès 30 jours ?')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('appelle admin_set_access avec le compte et le statut confirmés', async () => {
    render(<AdminAccess go={() => {}} />)
    await waitFor(() => expect(screen.getByText('frik')).toBeTruthy())
    fireEvent.click(screen.getAllByText('Fermer l’accès')[2])
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    const [fn, args] = rpc.mock.calls[0]
    expect(fn).toBe('admin_set_access')
    expect(args.p_user).toBe('u-3333-cccc')
    expect(args.p_status).toBe('closed')
    expect(args.p_until).toBeNull()
    expect(args.p_plan).toBe('month')
    expect(args.p_scope).toBe('residanat')
  })

  it('affiche le refus du serveur au lieu de simuler un succès', async () => {
    rpcReply = { error: { message: 'ADMIN_REQUIRED' } }
    render(<AdminAccess go={() => {}} />)
    await waitFor(() => expect(screen.getByText('frik')).toBeTruthy())
    fireEvent.click(screen.getAllByText('Ouvrir 30 jours')[2])
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(screen.getByText('Action impossible')).toBeTruthy())
    expect(screen.getByText(/ADMIN_REQUIRED/)).toBeTruthy()
  })

  it('affiche un état vide sans inventer de compte', async () => {
    reply = { data: [], error: null }
    render(<AdminAccess go={() => {}} />)
    await waitFor(() => expect(screen.getByText('Aucun compte')).toBeTruthy())
  })
})
