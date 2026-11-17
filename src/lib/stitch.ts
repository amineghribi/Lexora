import type { NavigateFunction } from 'react-router-dom';
import dashboardRaw from '../stitch/dashboard.html?raw';

/** Stitch sidebar `data-path` values mapped to our React routes. */
export const PATH_MAP: Record<string, string> = {
  dashboard: '/',
  clients: '/clients',
  cases: '/cases',
  calendar: '/hearings',
  tasks: '/tasks',
  documents: '/documents',
  payments: '/financial',
  reports: '/financial',
  team: '/settings',
  settings: '/settings',
};

const ACTIVE_CLASSES = [
  'bg-surface-container-lowest',
  'text-primary',
  'font-semibold',
  'shadow-[0_1px_8px_rgba(0,0,0,0.04)]',
  'rounded-lg',
];

/** Escape a value before injecting it into an HTML string. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  } as Record<string, string>)[ch]);
}

/** The Stitch screens have no sign-out control; add one that matches the sidebar. */
export function addLogoutLink(html: string): string {
  const link =
    '<a data-action="logout" href="#" class="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-primary-fixed-dim font-body-md text-body-md hover:bg-surface-container-high/10 hover:text-surface transition-all">' +
    '<span class="material-symbols-outlined text-xl shrink-0">logout</span>' +
    '<span class="truncate">Déconnexion</span></a>';
  return html.replace(
    '</nav><div class="p-space-lg bg-primary-container/80',
    link + '</nav><div class="p-space-lg bg-primary-container/80',
  );
}

export interface ShellOpts {
  navigate: NavigateFunction;
  pathname: string;
  signOut: () => Promise<void>;
}

/** Rewrite Stitch chrome (nav hrefs, active item, breadcrumb) after mount. */
export function applyShell(root: HTMLElement, opts: ShellOpts): void {
  root.querySelectorAll<HTMLAnchorElement>('nav a[data-path]').forEach((a) => {
    const path = PATH_MAP[a.dataset.path ?? ''] ?? '/';
    a.setAttribute('href', path);
    if (path === opts.pathname) {
      a.classList.remove('text-primary-fixed-dim');
      ACTIVE_CLASSES.forEach((c) => a.classList.add(c));
    }
  });
}

/**
 * Delegated click handler shared by every Stitch screen.
 * Returns true when the click was handled.
 */
export function shellClick(e: MouseEvent, root: HTMLElement, opts: ShellOpts): boolean {
  const target = e.target as HTMLElement;

  const nav = target.closest<HTMLAnchorElement>('nav a[data-path]');
  if (nav) {
    e.preventDefault();
    opts.navigate(PATH_MAP[nav.dataset.path ?? ''] ?? '/');
    return true;
  }

  if (target.closest('[data-action="logout"]')) {
    e.preventDefault();
    void opts.signOut().then(() => opts.navigate('/login'));
    return true;
  }

  if (target.closest('#quick-add-btn')) {
    root.querySelector('#quick-add-dropdown')?.classList.toggle('hidden');
    return true;
  }

  if (target.closest('#exportDropdownBtn')) {
    root.querySelector('#exportMenu, #exportDropdownMenu')?.classList.toggle('hidden');
    return true;
  }

  const quick = target.closest<HTMLAnchorElement>('#quick-add-dropdown a');
  if (quick) {
    e.preventDefault();
    const text = quick.textContent ?? '';
    const path = text.includes('Dossier')
      ? '/cases'
      : text.includes('Audience')
        ? '/hearings'
        : text.includes('Client')
          ? '/clients'
          : '/financial';
    opts.navigate(path);
    return true;
  }

  return false;
}

/**
 * Reuse the Stitch dashboard chrome (sidebar + header + footer) for screens
 * that were not part of the Stitch export (Tasks, Financial, Settings).
 */
export function withShell(mainContent: string, breadcrumb: string): string {
  const start = dashboardRaw.indexOf('<main');
  const end = dashboardRaw.indexOf('</main>') + '</main>'.length;
  const html =
    dashboardRaw.slice(0, start) +
    '<main class="relative pt-16 bg-background flex-1 w-full px-gutter-lg py-space-xl">' +
    mainContent +
    '</main>' +
    dashboardRaw.slice(end);
  return addLogoutLink(
    html.replace(
      '<span class="font-semibold text-on-surface">Tableau de bord</span>',
      `<span class="font-semibold text-on-surface">${esc(breadcrumb)}</span>`,
    ),
  );
}

/** Fill a tbody with rows, replacing all Stitch sample rows. */
export function setRows(root: HTMLElement, selector: string, rows: string): void {
  const tbody = root.querySelector(selector);
  if (tbody) tbody.innerHTML = rows;
}

/** A visually consistent empty state row. */
export function emptyRow(columns: number, label: string): string {
  return `<tr><td colspan="${columns}" class="py-10 px-space-lg text-center text-body-md text-on-surface-variant">${esc(label)}</td></tr>`;
}

/** Small helper for the count labels used on the dashboard. */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-TN').format(n);
}
