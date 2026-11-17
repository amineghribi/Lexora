import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeacherBank } from '../src/teachbank.jsx'

const cases = [
  { id: 'c1', title: 'SCA ST+ chez un patient de 58 ans', motif_id: 'douleur_thoracique', status: 'published', updated_at: '2026-11-14T10:00:00Z' },
  { id: 'c2', title: 'Dyspnée aiguë avec orthopnée', motif_id: 'dyspnee', status: 'draft', updated_at: '2026-11-12T10:00:00Z' },
  { id: 'c3', title: 'Palpitations avec malaise', motif_id: 'palpitations', status: 'archived', updated_at: '2026-10-30T10:00:00Z' },
]

describe('Banque des patients (enseignant)', () => {
  it('liste les cas réels avec compteurs par état', () => {
    render(<TeacherBank cases={cases} spec={{ label: 'Cardiologie' }} err={null} onPreview={() => {}} />)
    expect(screen.getByText('SCA ST+ chez un patient de 58 ans')).toBeTruthy()
    expect(screen.getByText(/3 cas · 1 publié · 1 brouillon/)).toBeTruthy()
  })

  it('filtre par état', () => {
    render(<TeacherBank cases={cases} spec={null} err={null} onPreview={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Brouillons 1/ }))
    expect(screen.getByText('Dyspnée aiguë avec orthopnée')).toBeTruthy()
    expect(screen.queryByText('SCA ST+ chez un patient de 58 ans')).toBeNull()
  })

  it('recherche par titre ou par motif', () => {
    render(<TeacherBank cases={cases} spec={null} err={null} onPreview={() => {}} />)
    const input = screen.getByLabelText('Rechercher un cas')
    fireEvent.change(input, { target: { value: 'palpitations' } })
    expect(screen.getByText('Palpitations avec malaise')).toBeTruthy()
    expect(screen.queryByText('Dyspnée aiguë avec orthopnée')).toBeNull()
  })

  it('ouvre l’aperçu élève du cas choisi', () => {
    const onPreview = vi.fn()
    render(<TeacherBank cases={cases} spec={null} err={null} onPreview={onPreview} />)
    fireEvent.click(screen.getAllByText('Aperçu élève →')[0])
    expect(onPreview).toHaveBeenCalledWith('c1', 'douleur_thoracique')
  })

  it('distingue « aucun cas » de « aucun résultat »', () => {
    const { rerender } = render(<TeacherBank cases={[]} spec={null} err={null} onPreview={() => {}} />)
    expect(screen.getByText('Aucun cas enregistré')).toBeTruthy()
    rerender(<TeacherBank cases={cases} spec={null} err={null} onPreview={() => {}} />)
    fireEvent.change(screen.getByLabelText('Rechercher un cas'), { target: { value: 'zzz' } })
    expect(screen.getByText('Aucun cas dans ce filtre')).toBeTruthy()
  })

  it('affiche l’erreur de chargement au lieu d’une liste vide trompeuse', () => {
    render(<TeacherBank cases={null} spec={null} err="Chargement de tes cas impossible, réessaie." onPreview={() => {}} />)
    expect(screen.getByText('Chargement impossible')).toBeTruthy()
    expect(screen.getByText(/Chargement de tes cas impossible/)).toBeTruthy()
  })
})
