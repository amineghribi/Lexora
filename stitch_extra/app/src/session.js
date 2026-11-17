// Client Supabase + utilisateur courant (cache synchrone lu par le forum et les groupes).
// L'URL et la clé « publishable » sont publiques par conception : la sécurité repose sur les règles RLS de la base.
import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://wraxarmiohrhrlzlpqyy.supabase.co'
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_8b4X9G1N23q_c5wpOLRgtg_NLqXHWmw'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

let cur = { id: '', name: '' }
export const me = () => cur
export const setMe = u => { cur = u && u.id ? { id: u.id, name: u.name || '' } : { id: '', name: '' } }

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/
export const openAuth = (mode = 'login') => window.dispatchEvent(new CustomEvent('open-auth', { detail: mode }))
// Appelle fn si l'utilisateur est connecté, sinon ouvre la fenêtre de connexion
export const needLogin = fn => (...a) => { if (!cur.id) { openAuth('login'); return Promise.resolve(null) } return fn(...a) }
