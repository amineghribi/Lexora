import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase, setMe, USERNAME_RE } from './session.js'
import { SubscriptionCard } from './payment.jsx'
import { TrackChange, AccountTypePicker, signupChoiceOk } from './track.jsx'
import { ReferralCard, captureRefFromUrl, claimReferral, readStoredRef } from './referral.jsx'

const Ctx = createContext({ user: null, profile: null, ready: false, signOut: () => {}, refreshProfile: () => {} })
export const useAuth = () => useContext(Ctx)

const ERR = [
  [/invalid login credentials/i, 'Email ou mot de passe incorrect.'],
  [/email not confirmed/i, 'Confirme d’abord ton email (regarde aussi dans les spams).'],
  [/already registered|already been registered/i, 'Un compte existe déjà avec cet email. Connecte-toi ou réinitialise ton mot de passe.'],
  [/rate limit|too many|over_email_send_rate_limit|email rate/i, 'Trop de tentatives ou d’emails envoyés. Réessaie dans quelques minutes.'],
  [/password.*(short|least|weak)|weak password/i, 'Mot de passe trop faible : 8 caractères minimum.'],
  [/valid email|invalid email|email address.*invalid/i, 'Adresse email invalide.'],
  [/network|failed to fetch/i, 'Pas de connexion. Vérifie ton réseau.'],
]
export const CONSENT_VERSION = '2026-11-11'
const fr = m => { for (const [re, t] of ERR) if (re.test(m || '')) return t; return 'Une erreur est survenue : ' + (m || 'inconnue') }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [ready, setReady] = useState(false)
  const [modal, setModal] = useState(null) // 'login' | 'signup' | 'forgot' | 'recovery' | null

  const loadProfile = useCallback(async uid => {
    if (!uid) { setProfile(null); setMe(null); return }
    const { data } = await supabase.from('profiles').select('id,username').eq('id', uid).maybeSingle()
    if (data) { setProfile(data); setMe({ id: data.id, name: data.username }) } else { setProfile(null); setMe({ id: uid, name: '' }) }
  }, [])

  useEffect(() => {
    let live = true
    const invited = captureRefFromUrl() // lien d'invitation : ?ref=CODE
    supabase.auth.getSession().then(({ data }) => {
      if (!live) return
      const u = data.session ? data.session.user : null
      setUser(u); if (u) setMe({ id: u.id, name: '' })
      setReady(true)
      loadProfile(u && u.id)
      if (u) claimReferral(u); else if (invited) setModal('signup')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session ? session.user : null
      setUser(u)
      if (u) setMe({ id: u.id, name: '' }); else setMe(null)
      setTimeout(() => loadProfile(u && u.id), 0)
      if (u && event === 'SIGNED_IN') setTimeout(() => claimReferral(u), 0)
      if (event === 'PASSWORD_RECOVERY') setModal('recovery')
      if (event === 'SIGNED_IN') setModal(m => (m === 'login' || m === 'signup' ? null : m))
    })
    const open = e => setModal(e.detail || 'login')
    window.addEventListener('open-auth', open)
    return () => { live = false; sub.subscription.unsubscribe(); window.removeEventListener('open-auth', open) }
  }, [loadProfile])

  const signOut = async () => { try { localStorage.removeItem('qmeta-v1') } catch (e) { /* ignore */ } await supabase.auth.signOut(); setUser(null); setProfile(null); setMe(null) }
  const value = { user, profile, ready, signOut, refreshProfile: () => loadProfile(user && user.id) }
  return (
    <Ctx.Provider value={value}>
      {children}
      {modal && <AuthModal mode={modal} setMode={setModal} onClose={() => setModal(null)} />}
    </Ctx.Provider>
  )
}

function AuthModal({ mode, setMode, onClose }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [uname, setUname] = useState('')
  const [agree, setAgree] = useState(false)
  const [level, setLevel] = useState('')
  const [fac, setFac] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [pend, setPend] = useState(null) // { email, pw } : compte créé mais email non confirmé
  const [chg, setChg] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [cool, setCool] = useState(0)
  const first = useRef(null)
  useEffect(() => { if (cool <= 0) return; const t = setTimeout(() => setCool(c => c - 1), 1000); return () => clearTimeout(t) }, [cool])
  useEffect(() => { first.current && first.current.focus() }, [mode])
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const to = m => { setMode(m); setErr(''); setInfo('') }

  async function submit(e) {
    e.preventDefault(); setErr(''); setInfo(''); setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
        if (error) { if (/email not confirmed/i.test(error.message || '')) { setPend({ email: email.trim(), pw }); setChg(false); setBusy(false); return } throw error }
        onClose()
      } else if (mode === 'signup') {
        const u = uname.trim().toLowerCase()
        if (!agree) throw new Error('Tu dois accepter la collecte de tes données et les conditions d’utilisation pour créer un compte.')
        if (!USERNAME_RE.test(u)) throw new Error('Pseudo : 3 à 20 caractères, lettres minuscules, chiffres ou _ uniquement.')
        if (pw.length < 8) throw new Error('Mot de passe trop faible : 8 caractères minimum.')
        if (!signupChoiceOk(level, fac)) throw new Error('Choisis ton niveau et, pour un niveau DCEM, ta faculté.')
        const { data: taken } = await supabase.from('profiles').select('id').eq('username', u).maybeSingle()
        if (taken) throw new Error('Ce pseudo est déjà pris.')
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { data: { username: u, consent_data: true, consent_at: new Date().toISOString(), consent_version: CONSENT_VERSION, account_type: 'student', track: level, ...(level !== 'residanat' ? { faculty: fac } : {}), ...(readStoredRef() ? { ref: readStoredRef() } : {}) }, emailRedirectTo: window.location.origin } })
        if (error) throw error
        if (data.session) onClose()
        else { setPend({ email: email.trim(), pw }); setChg(false); setCool(60) }
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
        if (error) throw error
        setInfo('Si un compte existe avec cet email, un lien de réinitialisation vient d’être envoyé.')
      } else if (mode === 'recovery') {
        if (pw.length < 8) throw new Error('Mot de passe trop faible : 8 caractères minimum.')
        const { error } = await supabase.auth.updateUser({ password: pw })
        if (error) throw error
        setInfo('Mot de passe mis à jour.'); setTimeout(onClose, 1200)
      }
    } catch (x) { setErr(x.message && /^(Pseudo|Mot de passe|Ce pseudo|Tu dois|Choisis)/.test(x.message) ? x.message : fr(x.message)) }
    setBusy(false)
  }

  async function resend() {
    setErr(''); setInfo(''); setBusy(true)
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: pend.email, options: { emailRedirectTo: window.location.origin } })
      if (error) throw error
      setInfo('Mail renvoyé. Vérifie tes spams.'); setCool(60)
    } catch (x) { setErr(fr(x.message)) }
    setBusy(false)
  }
  async function changeEmail(e) {
    e.preventDefault(); setErr(''); setInfo(''); setBusy(true)
    try {
      const { data, error } = await supabase.rpc('change_unconfirmed_email', { p_old: pend.email, p_pw: pend.pw, p_new: newEmail.trim() })
      if (error) throw error
      if (data === 'invalid_email') throw new Error('invalid email')
      if (data === 'taken') throw new Error('Cette adresse est déjà utilisée par un autre compte.')
      if (data === 'same') throw new Error('C’est déjà l’adresse enregistrée : utilise « Renvoyer le mail ».')
      if (data !== 'ok') throw new Error('Impossible de modifier l’adresse : ce compte est déjà confirmé ou le mot de passe est incorrect.')
      const ne = newEmail.trim().toLowerCase()
      const { error: e2 } = await supabase.auth.resend({ type: 'signup', email: ne, options: { emailRedirectTo: window.location.origin } })
      setPend({ email: ne, pw: pend.pw }); setChg(false); setNewEmail(''); setCool(60)
      if (e2) throw e2
      setInfo('Adresse modifiée. Un nouveau mail de confirmation vient d’être envoyé : vérifie tes spams.')
    } catch (x) { setErr(/^(Cette|C’est|Impossible)/.test(x.message || '') ? x.message : fr(x.message)) }
    setBusy(false)
  }

  if (pend) return (
    <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form className="modal card" role="dialog" aria-modal="true" aria-label="Confirme ton email" onSubmit={chg ? changeEmail : e => { e.preventDefault(); resend() }}>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 0 }}><h2 style={{ margin: 0 }}>Confirme ton email</h2><button type="button" className="ghost" onClick={onClose} aria-label="Fermer">✕</button></div>
        <p>Un mail de confirmation a été envoyé à <b>{pend.email}</b>.</p>
        <p className="okmsg" role="note"><b>Vérifie tes spams</b> (courrier indésirable, promotions), puis clique sur le lien et reviens te connecter.</p>
        {chg && <label className="fld">Nouvelle adresse email<input ref={first} type="email" autoComplete="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="ex. prenom@gmail.com" /></label>}
        {err && <p className="err" role="alert">{err}</p>}
        {info && <p className="okmsg" role="status">{info}</p>}
        <div className="row">
          {chg
            ? <><button className="primary" disabled={busy}>{busy ? '…' : 'Changer et renvoyer le mail'}</button><button type="button" className="ghost" onClick={() => { setChg(false); setErr('') }}>Annuler</button></>
            : <><button className="primary" disabled={busy || cool > 0}>{cool > 0 ? `Renvoyer le mail (${cool} s)` : 'Renvoyer le mail'}</button><button type="button" onClick={() => { setChg(true); setErr(''); setInfo('') }}>Mauvaise adresse ? Changer l’email</button></>}
        </div>
        <div className="row small"><button type="button" className="link" onClick={() => { setPend(null); to('login') }}>Retour à la connexion</button></div>
      </form>
    </div>
  )

  const title = { login: 'Connexion', signup: 'Créer un compte', forgot: 'Mot de passe oublié', recovery: 'Nouveau mot de passe' }[mode]
  return (
    <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form className="modal card" role="dialog" aria-modal="true" aria-label={title} onSubmit={submit}>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 0 }}><h2 style={{ margin: 0 }}>{title}</h2><button type="button" className="ghost" onClick={onClose} aria-label="Fermer">✕</button></div>
        {mode === 'signup' && readStoredRef() && <p className="okmsg small" role="note">Tu as été invité par un ami : ton inscription lui fera gagner du temps d’accès gratuit.</p>}
        {mode === 'signup' && <div className="trial" role="note"><b>Commence ton essai gratuit de 7 jours maintenant</b><span>Crée ton compte en 1 minute et accède à toute la banque de questions.</span></div>}
        {mode === 'login' && <p className="muted small">Connecte-toi pour publier dans le forum, suivre des questions et rejoindre des groupes d’étude. Tu peux réviser sans compte.</p>}
        {mode !== 'recovery' && <label className="fld">Email<input ref={first} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>}
        {mode === 'signup' && <label className="fld">Pseudo (visible par les autres)<input value={uname} onChange={e => setUname(e.target.value.toLowerCase())} autoComplete="username" maxLength={20} required placeholder="ex. dr_ala" /></label>}
        {mode !== 'forgot' && <label className="fld">{mode === 'recovery' ? 'Nouveau mot de passe' : 'Mot de passe'}<input ref={mode === 'recovery' ? first : undefined} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 8} value={pw} onChange={e => setPw(e.target.value)} /></label>}
        {mode === 'signup' && <AccountTypePicker level={level} setLevel={l => { setLevel(l); if (l === 'residanat') setFac('') }} fac={fac} setFac={setFac} />}
        {mode === 'signup' && (
          <label className="consent">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} required />
            <span>J’accepte que l’application <b>collecte et utilise mes données</b> (e-mail, pseudo) et <b>mes réponses aux questions</b> (résultats, progression, favoris, signalements, messages du forum et des groupes) pour faire fonctionner le service et suivre ma progression. J’accepte les <a href="/conditions.html" target="_blank" rel="noopener"><b>conditions d’utilisation</b></a> : <b>pas de robots, scripts, agents d’IA ni navigateurs automatisés, même sur mon propre compte</b>, et le contenu reste pour mon usage personnel.</span>
          </label>
        )}
        {err && <p className="err" role="alert">{err}</p>}
        {info && <p className="okmsg" role="status">{info}</p>}
        <div className="row"><button className="primary" disabled={busy || (mode === 'signup' && (!agree || !signupChoiceOk(level, fac)))}>{busy ? '…' : { login: 'Se connecter', signup: 'Commencer mon essai gratuit', forgot: 'Envoyer le lien', recovery: 'Enregistrer' }[mode]}</button></div>
        <div className="row small">
          {mode === 'login' && <><button type="button" className="link" onClick={() => to('signup')}>Créer un compte</button><button type="button" className="link" onClick={() => to('forgot')}>Mot de passe oublié ?</button></>}
          {mode === 'signup' && <button type="button" className="link" onClick={() => to('login')}>J’ai déjà un compte</button>}
          {mode === 'forgot' && <button type="button" className="link" onClick={() => to('login')}>Retour à la connexion</button>}
        </div>
      </form>
    </div>
  )
}

export function AccountView({ go, access, scope, onScope, iface }) {
  const teacher = iface === 'teacher'
  const { user, profile, ready, signOut, refreshProfile } = useAuth()
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  useEffect(() => { if (profile) setName(profile.username) }, [profile])
  if (!ready) return <p className="muted">Chargement…</p>
  if (!user) return (
    <section>
      <div className="page-h"><h1>Mon compte</h1><p className="muted">Crée un compte gratuit pour publier dans le forum, suivre des questions, recevoir des notifications et étudier en groupe.</p></div>
      <div className="card"><div className="row" style={{ marginTop: 0 }}><button className="primary" onClick={() => window.dispatchEvent(new CustomEvent('open-auth', { detail: 'signup' }))}>Créer un compte</button><button onClick={() => window.dispatchEvent(new CustomEvent('open-auth', { detail: 'login' }))}>Se connecter</button></div></div>
    </section>
  )
  const save = async () => {
    setMsg('')
    const u = name.trim().toLowerCase()
    if (!USERNAME_RE.test(u)) return setMsg('Pseudo : 3 à 20 caractères, lettres minuscules, chiffres ou _.')
    const { error } = await supabase.from('profiles').update({ username: u }).eq('id', user.id)
    if (error) return setMsg(error.code === '23505' ? 'Ce pseudo est déjà pris.' : 'Impossible de changer le pseudo.')
    setMsg('Pseudo mis à jour.'); refreshProfile()
  }
  return (
    <section>
      <div className="page-h"><h1>Mon compte</h1><p className="muted">{user.email}</p></div>
      <div className="card">
        <label className="fld">Pseudo (les amis t’ajoutent avec ce nom)<input value={name} maxLength={20} onChange={e => setName(e.target.value.toLowerCase())} /></label>
        <div className="row"><button className="primary" onClick={save} disabled={!profile || name === profile.username}>Enregistrer</button></div>
        {msg && <p className="muted small" role="status">{msg}</p>}
      </div>
      <div className="card">
        <h3>Notifications</h3>
        <p className="muted small">La cloche en haut de l’écran affiche les réponses, les nouvelles questions sur les QCM que tu suis et les invitations de groupe. Pour les recevoir aussi comme alerte du navigateur quand l’application est ouverte :</p>
        {perm === 'unsupported' ? <p className="muted small">Non disponible sur ce navigateur.</p> : perm === 'granted' ? <p className="okmsg small">Alertes du navigateur activées.</p> : perm === 'denied' ? <p className="muted small">Bloquées dans les réglages du navigateur.</p> : <button onClick={async () => setPerm(await Notification.requestPermission())}>Activer les alertes du navigateur</button>}
      </div>
      {teacher && <div className="card"><b>Compte enseignant</b><p className="muted small" style={{ marginBottom: 0 }}>Gratuit : aucun abonnement ni essai.</p></div>}
      {!teacher && <TrackChange scope={scope} onChanged={onScope} />}
      {!teacher && <ReferralCard />}
      {!teacher && <SubscriptionCard access={access} email={user.email} />}
      <div className="row">{!teacher && <button onClick={() => go({ name: 'groups' })}>Mes groupes d’étude</button>}<button className="ghost" onClick={signOut}>Se déconnecter</button></div>
      <p className="muted small"><a href="/conditions.html" target="_blank" rel="noopener">Conditions d’utilisation</a></p>
    </section>
  )
}
