import { useNavigate, useLocation } from 'react-router-dom';
import raw from '../stitch/clients.html?raw';
import StitchPage from '../components/StitchPage';
import { useAuth } from '../lib/auth';
import { getOrCreateOrg } from '../lib/org';
import { listClients, createClient, deleteClient } from '../services/clients';
import { addLogoutLink, applyShell, emptyRow, esc, hydrateChrome, setRows, shellClick } from '../lib/stitch';

const html = addLogoutLink(raw);

const addModal = `
<div id="lexora-add-client" class="hidden fixed inset-0 z-[60] items-center justify-center bg-primary-container/40 backdrop-blur-sm">
  <form id="lexora-add-client-form" class="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-2xl p-space-lg space-y-space-md">
    <div class="flex items-center justify-between">
      <h2 class="font-headline-md text-headline-md font-semibold text-on-surface">Nouveau Client</h2>
      <button type="button" data-action="close-add-client" class="p-1 text-on-surface-variant hover:text-on-surface"><span class="material-symbols-outlined text-xl">close</span></button>
    </div>
    <input name="full_name" required placeholder="Nom ou raison sociale" class="w-full h-11 px-space-md rounded-lg bg-surface-container-low text-on-surface outline-none focus:bg-surface-container" />
    <input name="email" type="email" placeholder="Email professionnel" class="w-full h-11 px-space-md rounded-lg bg-surface-container-low text-on-surface outline-none focus:bg-surface-container" />
    <input name="phone" placeholder="Téléphone" class="w-full h-11 px-space-md rounded-lg bg-surface-container-low text-on-surface outline-none focus:bg-surface-container" />
    <input name="cin_or_reg" placeholder="Matricule / CIN" class="w-full h-11 px-space-md rounded-lg bg-surface-container-low text-on-surface outline-none focus:bg-surface-container" />
    <p id="lexora-add-client-err" class="hidden text-body-sm text-error"></p>
    <div class="flex justify-end gap-space-sm pt-space-xs">
      <button type="button" data-action="close-add-client" class="px-space-md h-9 rounded-lg bg-surface-container text-on-surface font-label-md">Annuler</button>
      <button type="submit" class="px-space-md h-9 rounded-lg bg-primary text-on-primary font-label-md font-semibold">Enregistrer</button>
    </div>
  </form>
</div>`;

function clientRow(client: any): string {
  const initials = String(client.full_name || '?')
    .split(/\s+/)
    .map((word: string) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const type = client.client_type || 'Particulier';
  return `<tr class="hover:bg-surface-container-low/70 transition-colors group cursor-pointer" data-client-row="${esc(client.id)}">
    <td class="py-3 px-4 text-center"><input class="row-checkbox w-4 h-4 rounded text-primary focus:ring-0 cursor-pointer" type="checkbox" /></td>
    <td class="py-3 px-4"><div class="flex items-center gap-space-sm">
      <div class="w-9 h-9 rounded-lg bg-surface-container-highest text-on-surface font-semibold flex items-center justify-center shrink-0">${esc(initials)}</div>
      <div class="flex flex-col min-w-0">
        <span class="font-headline-sm text-headline-sm font-semibold text-on-surface truncate group-hover:text-primary">${esc(client.full_name)}</span>
        <div class="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant"><span>${esc(type)}</span>${client.cin_or_reg ? `<span class="font-tabular-mono font-medium">${esc(client.cin_or_reg)}</span>` : ''}</div>
      </div>
    </div></td>
    <td class="py-3 px-3 font-tabular-mono font-semibold text-on-surface-variant">${esc(client.reference || '')}</td>
    <td class="py-3 px-3"><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container/50 text-on-secondary-container font-label-sm text-label-sm font-medium">${esc(type)}</span></td>
    <td class="py-3 px-4"><div class="flex flex-col"><span class="font-tabular-mono text-on-surface">${esc(client.phone || '—')}</span><span class="text-on-surface-variant truncate">${esc(client.email || '')}</span></div></td>
    <td class="py-3 px-4"><span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-container font-label-sm text-label-sm font-medium text-on-surface"><span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>0 dossier</span></td>
    <td class="py-3 px-4"><span class="font-label-sm text-label-sm text-on-surface-variant">${esc(client.created_at ? new Date(client.created_at).toLocaleDateString('fr-TN') : '—')}</span></td>
    <td class="py-3 px-3"><span class="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-label-sm text-label-sm font-semibold">Actif</span></td>
    <td class="py-3 px-4 text-right"><button type="button" data-delete-client="${esc(client.id)}" class="p-1.5 text-on-surface-variant hover:text-error hover:bg-surface-container rounded"><span class="material-symbols-outlined text-lg">delete</span></button></td>
  </tr>`;
}

export default function Clients() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname, search: routeSearch } = useLocation();

  const setup = (root: HTMLElement) => {
    const opts = { navigate, pathname, signOut };
    applyShell(root, opts);
    void hydrateChrome(root, user);
    root.insertAdjacentHTML('beforeend', addModal);

    const modal = root.querySelector<HTMLElement>('#lexora-add-client')!;
    const form = root.querySelector<HTMLFormElement>('#lexora-add-client-form')!;
    const errorBox = root.querySelector<HTMLElement>('#lexora-add-client-err')!;
    const drawer = root.querySelector<HTMLElement>('#clientDrawer');
    const overlay = root.querySelector<HTMLElement>('#drawerOverlay');
    let orgId: string | null = null;
    let rows: any[] = [];

    const openModal = () => {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    };
    const closeModal = () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    };
    const closeDrawer = () => {
      drawer?.classList.add('translate-x-full');
      overlay?.classList.add('hidden');
    };
    overlay?.addEventListener('click', closeDrawer);

    const render = (list: any[]) => {
      rows = list;
      setRows(root, 'tbody', list.length ? list.map(clientRow).join('') : emptyRow(9, 'Aucun client pour le moment.'));
      const count = root.querySelector<HTMLElement>('[data-list-count]');
      if (count) count.textContent = `${list.length} client${list.length === 1 ? '' : 's'}`;
    };

    const load = async () => {
      if (!user) return;
      orgId = await getOrCreateOrg(user.id);
      if (!orgId) return;
      const { data } = await listClients(orgId);
      render(data ?? []);
    };

    root.onclick = async (event) => {
      const target = event.target as HTMLElement;

      if (target.closest('[data-action="new-client"]')) {
        event.preventDefault();
        openModal();
        return;
      }
      if (target.closest('[data-action="close-add-client"]')) {
        closeModal();
        return;
      }
      if (target.closest('button')?.closest('#clientDrawer') && (target.closest('button')?.textContent ?? '').includes('Fermer')) {
        closeDrawer();
        return;
      }
      const del = target.closest<HTMLElement>('[data-delete-client]');
      if (del) {
        event.preventDefault();
        if (!window.confirm('Supprimer ce client ?')) return;
        await deleteClient(del.dataset.deleteClient!);
        await load();
        return;
      }

      const row = target.closest<HTMLElement>('[data-client-row]');
      if (row && !target.closest('button, input')) {
        const client = rows.find((c) => c.id === row.dataset.clientRow);
        if (client && drawer) {
          const name = drawer.querySelector<HTMLElement>('#drawerClientName');
          const ref = drawer.querySelector<HTMLElement>('#drawerClientRef');
          const type = drawer.querySelector<HTMLElement>('#drawerClientForm');
          const mf = drawer.querySelector<HTMLElement>('#drawerClientMF');
          if (name) name.textContent = client.full_name;
          if (ref) ref.textContent = client.reference || '';
          if (type) type.textContent = client.client_type || 'Particulier';
          if (mf) mf.textContent = client.cin_or_reg || '—';
          drawer.classList.remove('translate-x-full');
          overlay?.classList.remove('hidden');
        }
        return;
      }

      shellClick(event, root, opts);
    };

    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!orgId) return;
      errorBox.classList.add('hidden');
      const data = new FormData(form);
      const { error } = await createClient(orgId, {
        full_name: String(data.get('full_name') || '').trim(),
        email: String(data.get('email') || ''),
        phone: String(data.get('phone') || ''),
        cin_or_reg: String(data.get('cin_or_reg') || ''),
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

    const search = root.querySelector<HTMLInputElement>('#clientSearchInput');
    if (search) {
      search.oninput = () => {
        const needle = search.value.toLowerCase();
        root.querySelectorAll<HTMLElement>('[data-client-row]').forEach((element) => {
          element.classList.toggle('hidden', !element.textContent?.toLowerCase().includes(needle));
        });
      };
    }

    void load().then(() => {
      if (new URLSearchParams(routeSearch).get('new') === '1') openModal();
    });
  };

  return <StitchPage html={html} setup={setup} />;
}
