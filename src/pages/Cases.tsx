import { useNavigate, useLocation } from 'react-router-dom';
import raw from '../stitch/cases.html?raw';
import StitchPage from '../components/StitchPage';
import { useAuth } from '../lib/auth';
import { getOrCreateOrg } from '../lib/org';
import { listCases, createCase, deleteCase } from '../services/cases';
import { listClients } from '../services/clients';
import { addLogoutLink, applyShell, emptyRow, esc, formatNumber, hydrateChrome, setRows, shellClick } from '../lib/stitch';

const html = addLogoutLink(raw);

const addModal = `
<div id="lexora-add-case" class="hidden fixed inset-0 z-[60] items-center justify-center bg-primary-container/40 backdrop-blur-sm">
  <form id="lexora-add-case-form" class="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-2xl p-space-lg space-y-space-md">
    <div class="flex items-center justify-between">
      <h2 class="font-headline-md text-headline-md font-semibold text-on-surface">Nouveau dossier</h2>
      <button type="button" data-action="close-add-case" class="p-1 text-on-surface-variant hover:text-on-surface"><span class="material-symbols-outlined text-xl">close</span></button>
    </div>
    <input name="title" required placeholder="Intitulé de l'affaire" class="w-full h-11 px-space-md rounded-lg bg-surface-container-low text-on-surface outline-none focus:bg-surface-container" />
    <select name="client_id" required class="w-full h-11 px-space-md rounded-lg bg-surface-container-low text-on-surface outline-none">
      <option value="">Sélectionner un client</option>
    </select>
    <input name="legal_category" placeholder="Matière juridique" class="w-full h-11 px-space-md rounded-lg bg-surface-container-low text-on-surface outline-none focus:bg-surface-container" />
    <input name="court" placeholder="Juridiction" class="w-full h-11 px-space-md rounded-lg bg-surface-container-low text-on-surface outline-none focus:bg-surface-container" />
    <p id="lexora-add-case-err" class="hidden text-body-sm text-error"></p>
    <div class="flex justify-end gap-space-sm pt-space-xs">
      <button type="button" data-action="close-add-case" class="px-space-md h-9 rounded-lg bg-surface-container text-on-surface font-label-md">Annuler</button>
      <button type="submit" class="px-space-md h-9 rounded-lg bg-primary text-on-primary font-label-md font-semibold">Créer le dossier</button>
    </div>
  </form>
</div>`;

function caseRow(caseItem: any): string {
  const status = caseItem.status || 'open';
  const statusLabel = status === 'open' ? 'En cours' : status === 'closed' ? 'Clôturé' : status;
  const statusClass = status === 'open'
    ? 'bg-secondary-container/50 text-on-secondary-container'
    : 'bg-surface-container text-on-surface';
  return `<tr class="hover:bg-surface-container-low/50 transition-colors group" data-case-row="${esc(caseItem.id)}">
    <td class="w-10 px-space-md py-space-sm text-center"><input class="w-4 h-4 rounded text-primary focus:ring-0 cursor-pointer" type="checkbox" /></td>
    <td class="px-space-md py-space-sm whitespace-nowrap"><div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-sm text-on-tertiary-container">gavel</span><span class="font-tabular-mono text-tabular-mono font-bold text-on-surface">${esc(caseItem.reference || '')}</span></div><span class="font-label-sm text-label-sm text-on-surface-variant block">${esc(caseItem.legal_category || 'Dossier')}</span></td>
    <td class="px-space-md py-space-sm"><div class="font-headline-sm text-headline-sm text-on-surface font-semibold group-hover:text-primary transition-colors leading-tight">${esc(caseItem.title)}</div></td>
    <td class="px-space-md py-space-sm"><div class="font-body-md text-body-md font-medium text-on-surface">${esc(caseItem.clients?.full_name || '—')}</div><span class="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-container text-on-surface font-label-sm font-semibold">Client</span></td>
    <td class="px-space-md py-space-sm"><span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary-container/50 text-on-secondary-container font-label-sm font-medium">${esc(caseItem.legal_category || 'Général')}</span></td>
    <td class="px-space-md py-space-sm"><div class="font-body-sm text-body-sm font-semibold text-on-surface">${esc(caseItem.court || '—')}</div></td>
    <td class="px-space-md py-space-sm"><span class="font-body-sm text-body-sm text-on-surface">${esc(caseItem.responsible || '—')}</span></td>
    <td class="px-space-md py-space-sm"><span class="font-label-sm text-label-sm text-on-surface-variant">${caseItem.next_hearing ? esc(new Date(caseItem.next_hearing).toLocaleDateString('fr-TN')) : '—'}</span></td>
    <td class="px-space-md py-space-sm text-center"><span class="inline-flex items-center px-2 py-0.5 rounded-full ${statusClass} font-label-sm font-semibold">${esc(statusLabel)}</span></td>
    <td class="px-space-md py-space-sm text-right"><button type="button" data-delete-case="${esc(caseItem.id)}" class="p-1.5 text-on-surface-variant hover:text-error hover:bg-surface-container rounded"><span class="material-symbols-outlined text-lg">delete</span></button></td>
  </tr>`;
}

export default function Cases() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname, search: routeSearch } = useLocation();

  const setup = (root: HTMLElement) => {
    const opts = { navigate, pathname, signOut };
    applyShell(root, opts);
    void hydrateChrome(root, user);
    root.insertAdjacentHTML('beforeend', addModal);

    const modal = root.querySelector<HTMLElement>('#lexora-add-case')!;
    const form = root.querySelector<HTMLFormElement>('#lexora-add-case-form')!;
    const clientSelect = form.querySelector<HTMLSelectElement>('select[name="client_id"]')!;
    const errorBox = root.querySelector<HTMLElement>('#lexora-add-case-err')!;
    let orgId: string | null = null;

    const openModal = () => {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    };
    const closeModal = () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    };

    const load = async () => {
      if (!user) return;
      orgId = await getOrCreateOrg(user.id);
      if (!orgId) return;
      const [{ data: cases }, { data: clients }] = await Promise.all([listCases(orgId), listClients(orgId)]);
      setRows(root, 'tbody', cases?.length
        ? cases.map(caseRow).join('')
        : emptyRow(10, 'Aucun dossier pour le moment.'));
      const listCount = root.querySelector<HTMLElement>('[data-list-count]');
      if (listCount) listCount.textContent = `${cases?.length ?? 0} dossier${cases?.length === 1 ? '' : 's'}`;
      const all = cases ?? [];
      const totals: Record<string, number> = {
        all: all.length,
        open: all.filter((c) => c.status === 'open').length,
        closed: all.filter((c) => c.status === 'closed').length,
        other: all.filter((c) => c.status !== 'open' && c.status !== 'closed').length,
      };
      root.querySelectorAll<HTMLElement>('[data-case-kpi]').forEach((el) => {
        el.textContent = formatNumber(totals[el.dataset.caseKpi ?? ''] ?? 0);
      });
      clientSelect.innerHTML =
        '<option value="">Sélectionner un client</option>' +
        (clients ?? []).map((c: any) => `<option value="${esc(c.id)}">${esc(c.full_name)}</option>`).join('');
    };

    const search = root.querySelector<HTMLInputElement>('#caseSearchInput');
    if (search) {
      search.oninput = () => {
        const needle = search.value.toLowerCase();
        root.querySelectorAll<HTMLElement>('[data-case-row]').forEach((element) => {
          element.classList.toggle('hidden', !element.textContent?.toLowerCase().includes(needle));
        });
      };
    }

    root.onclick = async (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-action="new-case"]')) {
        event.preventDefault();
        openModal();
        return;
      }
      if (target.closest('[data-action="close-add-case"]')) {
        closeModal();
        return;
      }
      const del = target.closest<HTMLElement>('[data-delete-case]');
      if (del) {
        event.preventDefault();
        if (!window.confirm('Supprimer ce dossier ?')) return;
        await deleteCase(del.dataset.deleteCase!);
        await load();
        return;
      }
      shellClick(event, root, opts);
    };

    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!orgId) return;
      errorBox.classList.add('hidden');
      const data = new FormData(form);
      const { error } = await createCase(orgId, {
        client_id: String(data.get('client_id') || ''),
        title: String(data.get('title') || '').trim(),
        legal_category: String(data.get('legal_category') || ''),
        court: String(data.get('court') || ''),
      });
      if (error) {
        errorBox.textContent = error.message;
        errorBox.classList.remove('hidden');
        return;
      }
      form.reset();
      closeModal();
      await load();
    };

    void load().then(() => {
      if (new URLSearchParams(routeSearch).get('new') === '1') openModal();
    });
  };

  return <StitchPage html={html} setup={setup} />;
}
