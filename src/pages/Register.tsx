import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * Registration uses the same Stitch visual language as the sign-in screen
 * (the Stitch export includes no registration screen of its own).
 */
export default function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const { error: message } = await signUp(email, password, fullName);
    if (message) setError(message);
    else {
      setNotice('Compte créé. Consultez votre messagerie pour vérifier votre adresse, puis connectez-vous.');
      setTimeout(() => navigate('/login'), 2200);
    }
  };

  const field =
    'w-full h-11 pl-10 pr-4 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md focus:bg-surface-container-lowest focus:shadow-md transition-all outline-none';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="w-full bg-surface-container-lowest/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-50">
        <div className="h-16 max-w-7xl mx-auto px-gutter-lg flex items-center justify-between">
          <Link to="/login" className="flex items-center gap-space-md">
            <div className="w-9 h-9 rounded-lg bg-primary-container flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-tertiary-fixed-dim text-[20px]">gavel</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-space-xs">
                <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight font-bold">LEXORA</span>
                <span className="font-label-sm text-label-sm text-tertiary-fixed-dim uppercase tracking-widest">LEGAL</span>
              </div>
              <span className="font-label-sm text-label-sm text-secondary -mt-0.5">Avocats &amp; Juridictions</span>
            </div>
          </Link>
          <span className="hidden md:flex items-center gap-space-sm px-space-md py-1 rounded-full bg-surface-container-low border border-outline-variant/30 text-secondary">
            <span className="material-symbols-outlined text-[16px] text-tertiary-fixed-dim">verified_user</span>
            <span className="font-label-sm text-label-sm">Connexion sécurisée</span>
          </span>
        </div>
      </header>

      <main className="w-full flex-1 flex items-center justify-center py-margin-lg px-gutter">
        <div className="flex flex-col w-full max-w-7xl mx-auto">
          <div className="w-full bg-surface-container-lowest rounded-xl shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
            <div className="lg:col-span-5 bg-inverse-surface text-inverse-on-surface p-space-xl lg:p-margin-lg flex flex-col justify-between relative overflow-hidden">
              <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-tertiary-fixed-dim/10 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-20 -right-20 w-72 h-72 rounded-full bg-secondary-fixed/10 blur-2xl pointer-events-none" />
              <div className="relative z-10 flex flex-col gap-space-lg">
                <div className="inline-flex items-center gap-space-xs px-space-md py-1 rounded-full bg-primary-container text-tertiary-fixed-dim self-start shadow-sm">
                  <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    workspace_premium
                  </span>
                  <span className="font-label-sm text-label-sm uppercase tracking-wider">Espace sécurisé</span>
                </div>
                <div className="flex flex-col gap-space-sm mt-space-sm">
                  <span className="font-label-sm text-label-sm uppercase tracking-widest text-tertiary-fixed-dim">Espace Cabinet</span>
                  <h2 className="font-headline-lg text-headline-lg tracking-tight text-white leading-snug">
                    Créez l’espace sécurisé de votre cabinet en quelques instants.
                  </h2>
                  <p className="font-body-md text-body-md text-surface-container-high/80 leading-relaxed mt-space-xs">
                    Clients, dossiers, audiences et pièces confidentielles réunis sous strict secret professionnel.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-space-sm mt-space-md">
                  {[
                    ['enhanced_encryption', 'Données protégées', 'Vos données restent dans l’espace privé de votre cabinet.'],
                    ['dns', 'Espace dédié', 'Chaque cabinet dispose de son propre espace isolé.'],
                    ['policy', 'Accès maîtrisé', 'Seuls les membres autorisés de votre cabinet y accèdent.'],
                  ].map(([icon, title, text]) => (
                    <div key={title} className="p-space-md rounded-lg bg-primary-container/60 shadow-sm flex items-start gap-space-md">
                      <div className="w-8 h-8 rounded-lg bg-inverse-surface flex items-center justify-center shrink-0 text-tertiary-fixed-dim">
                        <span className="material-symbols-outlined text-[18px]">{icon}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-headline-sm text-headline-sm text-white">{title}</span>
                        <span className="font-body-sm text-body-sm text-surface-container-high/70">{text}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative z-10 pt-space-lg flex items-center justify-between text-surface-container-high/70">
                <div className="flex items-center gap-space-xs font-tabular-mono text-tabular-mono text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>NODE: TUN-CENTRAL-01</span>
                </div>
                <div className="font-label-sm text-label-sm text-tertiary-fixed-dim flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">shield</span>
                  SESSION PROTÉGÉE
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 p-space-xl lg:p-margin-lg flex flex-col justify-between bg-surface-container-lowest">
              <div className="max-w-xl mx-auto w-full flex flex-col gap-space-md">
                <div className="flex flex-col gap-1 mt-space-xs">
                  <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Créer un cabinet</h1>
                  <p className="font-body-md text-body-md text-secondary">
                    Renseignez vos coordonnées professionnelles pour ouvrir votre espace LEXORA.
                  </p>
                </div>

                {error && (
                  <p className="text-body-sm text-error bg-error-container/40 rounded-lg px-space-md py-space-sm">{error}</p>
                )}
                {notice && (
                  <p className="text-body-sm text-on-secondary-container bg-secondary-container/60 rounded-lg px-space-md py-space-sm">{notice}</p>
                )}

                <form className="flex flex-col gap-space-md" onSubmit={submit}>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider" htmlFor="reg-name">
                      Nom complet du responsable
                    </label>
                    <div className="relative flex items-center">
                      <span className="material-symbols-outlined absolute left-3 text-secondary text-[20px] pointer-events-none">badge</span>
                      <input
                        id="reg-name"
                        className={field}
                        placeholder="Votre nom complet"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider" htmlFor="reg-email">
                      Email professionnel
                    </label>
                    <div className="relative flex items-center">
                      <span className="material-symbols-outlined absolute left-3 text-secondary text-[20px] pointer-events-none">mail</span>
                      <input
                        id="reg-email"
                        className={field}
                        type="email"
                        placeholder="nom.avocat@barreau.tn"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider" htmlFor="reg-password">
                      Mot de passe
                    </label>
                    <div className="relative flex items-center">
                      <span className="material-symbols-outlined absolute left-3 text-secondary text-[20px] pointer-events-none">lock</span>
                      <input
                        id="reg-password"
                        className={`${field} tracking-widest`}
                        type="password"
                        placeholder="12 caractères minimum"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={8}
                        required
                      />
                    </div>
                  </div>
                  <button
                    className="w-full h-11 rounded-lg bg-inverse-surface hover:bg-primary-container text-white font-headline-sm text-headline-sm flex items-center justify-center gap-space-sm shadow-md hover:shadow-lg transition-all active:scale-[0.99] group mt-space-xs"
                    type="submit"
                  >
                    <span className="material-symbols-outlined text-[18px] text-tertiary-fixed-dim">person_add</span>
                    <span>Créer mon cabinet</span>
                  </button>
                </form>

                <p className="text-center text-body-sm text-secondary pt-space-sm">
                  Vous avez déjà un cabinet ?{' '}
                  <Link className="text-on-surface font-semibold underline hover:text-primary" to="/login">
                    Se connecter
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full bg-surface-container-lowest/60 backdrop-blur-md border-t border-outline-variant/20 py-space-lg">
        <div className="max-w-7xl mx-auto px-gutter-lg text-center font-label-sm text-label-sm text-secondary">
          Espace de travail sécurisé
        </div>
      </footer>
    </div>
  );
}
