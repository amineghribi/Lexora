import { useNavigate, useLocation } from 'react-router-dom';
import raw from '../stitch/hearings.html?raw';
import StitchPage from '../components/StitchPage';
import { useAuth } from '../lib/auth';
import { getOrCreateOrg } from '../lib/org';
import { listHearings, createHearing } from '../services/hearings';
import { addLogoutLink, applyShell, esc, hydrateChrome, shellClick } from '../lib/stitch';

const html = addLogoutLink(raw);

function hearingRow(item: any): string {
  const date = item.hearing_date ? new Date(item.hearing_date) : null;
  return `<div class="flex items-center gap-space-md p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors">
    <div class="w-11 h-11 rounded-lg bg-secondary-container/60 text-on-secondary-container flex flex-col items-center justify-center shrink-0">
      <span class="font-label-sm text-label-sm font-bold leading-none">${date ? esc(String(date.getDate()).padStart(2, '0')) : '—'}</span>
      <span class="font-label-sm text-label-sm leading-none mt-0.5">${date ? esc(date.toLocaleDateString('fr-TN', { month: 'short' })) : ''}</span>
    </div>
    <div class="flex flex-col min-w-0 flex-1">
      <span class="font-headline-sm text-headline-sm text-on-surface truncate">${esc(item.court || 'Audience')}</span>
      <span class="font-label-sm text-label-sm text-on-surface-variant truncate">${esc(item.hearing_type || 'Audience')}${item.notes ? ' • ' + esc(item.notes) : ''}</span>
    </div>
    <span class="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-label-sm font-semibold">${esc(item.status || 'scheduled')}</span>
  </div>`;
}

export default function Hearings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  const setup = (root: HTMLElement) => {
    const opts = { navigate, pathname, signOut };
    applyShell(root, opts);
    void hydrateChrome(root, user);

    const quickForm = root.querySelector<HTMLElement>('#quick-add-form');

    // Stitch calendar tabs: keep the selected pill in sync.
    root.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((button) => {
      button.onclick = () => {
        root.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((other) => {
          other.classList.remove('bg-surface-container-lowest', 'text-on-surface', 'shadow-sm', 'font-semibold');
          other.classList.add('text-on-surface-variant');
        });
        button.classList.add('bg-surface-container-lowest', 'text-on-surface', 'shadow-sm', 'font-semibold');
        button.classList.remove('text-on-surface-variant');
      };
    });

    const list = root.querySelector<HTMLElement>('#lexora-hearing-list')!;
    const upcoming = root.querySelector<HTMLElement>('#lexora-hearing-upcoming')!;
    const reminders = root.querySelector<HTMLElement>('#lexora-hearing-reminders')!;
    const empty = '<p class="text-body-sm text-on-surface-variant py-space-lg text-center">Aucune audience enregistrée.</p>';

    let orgId: string | null = null;
    const load = async () => {
      if (!user) return;
      orgId = await getOrCreateOrg(user.id);
      if (!orgId) return;
      const { data } = await listHearings(orgId);
      const items = data ?? [];
      const rows = items.length ? items.map(hearingRow).join('') : empty;
      list.innerHTML = rows;
      upcoming.innerHTML = rows;
      reminders.innerHTML = '<p class="text-body-sm text-on-surface-variant">Aucun délai enregistré.</p>';
      if (new URLSearchParams(search).get('new') === '1') quickForm?.classList.remove('hidden');
    };

    const form = quickForm?.querySelector<HTMLFormElement>('form');
    if (form) {
      form.onsubmit = async (event) => {
        event.preventDefault();
        if (!orgId) return;
        const inputs = form.querySelectorAll<HTMLInputElement>('input');
        const selects = form.querySelectorAll<HTMLSelectElement>('select');
        const dateInput = Array.from(inputs).find((input) => input.type === 'date');
        const timeInput = Array.from(inputs).find((input) => input.type === 'time');
        const courtInput = Array.from(inputs).find((input) => (input.placeholder ?? '').startsWith('ex: Audience'));
        const notesInput = Array.from(inputs).find((input) => (input.placeholder ?? '').startsWith('Ex:'));
        const date = dateInput?.value;
        if (!date) return;
        const time = timeInput?.value || '09:00';
        const { error } = await createHearing(orgId, {
          hearing_date: `${date}T${time}:00`,
          court: courtInput?.value || '',
          hearing_type: selects[0]?.value || 'Audience',
          notes: notesInput?.value || '',
        });
        if (!error) {
          form.reset();
          quickForm?.classList.add('hidden');
          await load();
        }
      };
    }

    root.onclick = (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-action="new-hearing"]')) {
        event.preventDefault();
        quickForm?.classList.toggle('hidden');
        return;
      }
      shellClick(event, root, opts);
    };
    void load();
  };

  return <StitchPage html={html} setup={setup} />;
}
