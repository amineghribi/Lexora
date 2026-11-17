import { useNavigate, useLocation } from 'react-router-dom';
import StitchPage from '../components/StitchPage';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { applyShell, hydrateChrome, shellClick, withShell } from '../lib/stitch';

const mainContent = `
<div class="flex flex-col w-full gap-space-lg">
  <div class="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm">
    <h1 class="font-headline-xl text-headline-xl text-on-surface tracking-tight">Paramètres</h1>
    <p class="font-body-md text-body-md text-on-surface-variant mt-0.5">Préférences du cabinet et informations d’abonnement.</p>
  </div>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
    <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg">
      <div class="flex items-center gap-space-sm mb-space-md"><span class="material-symbols-outlined text-secondary">language</span><h2 class="font-headline-md text-headline-md text-on-surface">Langue de l’interface</h2></div>
      <div class="flex items-center p-space-xs rounded-lg bg-surface-container-low w-fit" id="lexora-lang-switch">
        <button data-lang="fr" class="px-space-md py-1 rounded font-label-md text-label-md font-semibold">Français</button>
        <button data-lang="ar" class="px-space-md py-1 rounded font-label-md text-label-md">العربية</button>
        <button data-lang="en" class="px-space-md py-1 rounded font-label-md text-label-md">English</button>
      </div>
    </div>
    <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg">
      <div class="flex items-center gap-space-sm mb-space-md"><span class="material-symbols-outlined text-secondary">workspace_premium</span><h2 class="font-headline-md text-headline-md text-on-surface">Abonnement</h2></div>
      <div class="flex flex-col gap-space-sm">
        <div class="p-space-md rounded-lg bg-surface-container-low flex items-center justify-between"><div><span class="font-body-md text-body-md font-semibold text-on-surface">Essai gratuit</span><p class="font-label-sm text-label-sm text-on-surface-variant">Accès complet — 14 jours</p></div><span class="px-2 py-0.5 rounded-full bg-secondary-container/50 text-on-secondary-container font-label-sm font-semibold">Actif</span></div>
        <div class="p-space-md rounded-lg bg-surface-container-low flex items-center justify-between"><div><span class="font-body-md text-body-md font-semibold text-on-surface">Solo / Professionnel / Business</span><p class="font-label-sm text-label-sm text-on-surface-variant">Facturation à activer</p></div><span class="material-symbols-outlined text-outline">lock</span></div>
      </div>
    </div>
  </div>
</div>`;

const html = withShell(mainContent, 'Paramètres');

export default function Settings() {
  const { setLang, lang } = useI18n();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const setup = (root: HTMLElement) => {
    const opts = { navigate, pathname, signOut };
    applyShell(root, opts);
    void hydrateChrome(root, user);
    root.onclick = (event) => shellClick(event, root, opts);
    const switcher = root.querySelector<HTMLElement>('#lexora-lang-switch')!;
    const paint = () => {
      switcher.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
        const active = button.dataset.lang === lang;
        button.classList.toggle('bg-surface-container-lowest', active);
        button.classList.toggle('text-on-surface', active);
        button.classList.toggle('shadow-sm', active);
        button.classList.toggle('font-semibold', active);
      });
    };
    switcher.onclick = (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-lang]');
      if (!button) return;
      setLang(button.dataset.lang!);
      paint();
    };
    paint();
  };

  return <StitchPage html={html} setup={setup} setupKey={lang} />;
}
