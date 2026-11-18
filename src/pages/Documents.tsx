import { useNavigate, useLocation } from 'react-router-dom';
import raw from '../stitch/documents.html?raw';
import StitchPage from '../components/StitchPage';
import { useAuth } from '../lib/auth';
import { getOrCreateOrg } from '../lib/org';
import { translate } from '../lib/translations';
import type { Lang } from '../lib/translations';
import { listDocuments, uploadDocument, getSignedUrl } from '../services/documents';
import { listFolders, createFolder, deleteFolder } from '../services/folders';
import { addLogoutLink, applyShell, emptyRow, esc, hydrateChrome, setRows, shellClick } from '../lib/stitch';

const html = addLogoutLink(raw);

const folderModal = `
<div id="lexora-add-folder" class="hidden fixed inset-0 z-[70] items-center justify-center bg-primary-container/40 backdrop-blur-sm">
  <form id="lexora-add-folder-form" class="w-full max-w-sm bg-surface-container-lowest rounded-xl shadow-2xl p-space-lg space-y-space-md">
    <div class="flex items-center justify-between">
      <h2 class="font-headline-md text-headline-md font-semibold text-on-surface">Créer un dossier</h2>
      <button type="button" data-action="close-add-folder" class="p-1 text-on-surface-variant hover:text-on-surface"><span class="material-symbols-outlined text-xl">close</span></button>
    </div>
    <input name="folder-name" required maxlength="120" placeholder="Nom du dossier" class="w-full h-11 px-space-md rounded-lg bg-surface-container-low text-on-surface outline-none focus:bg-surface-container" />
    <p id="lexora-add-folder-err" class="hidden text-body-sm text-error"></p>
    <div class="flex justify-end gap-space-sm pt-space-xs">
      <button type="button" data-action="close-add-folder" class="px-space-md h-9 rounded-lg bg-surface-container text-on-surface font-label-md">Annuler</button>
      <button type="submit" class="px-space-md h-9 rounded-lg bg-primary text-on-primary font-label-md font-semibold">Créer le dossier</button>
    </div>
  </form>
</div>`;

/** Translate a string outside React (used for native confirm/alert dialogs). */
function tr(text: string): string {
  let lang: Lang = 'fr';
  try {
    const saved = localStorage.getItem('lexora-lang');
    if (saved === 'fr' || saved === 'en' || saved === 'ar') lang = saved;
  } catch {
    /* storage may be unavailable */
  }
  return translate(text, lang);
}

function sizeLabel(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function folderName(doc: any): string {
  return doc.document_categories?.name || 'Divers';
}

function documentRow(doc: any): string {
  const isPdf = (doc.mime_type || '').includes('pdf') || (doc.name || '').toLowerCase().endsWith('.pdf');
  return `<tr class="hover:bg-surface-container-low/70 transition-colors cursor-pointer" data-document-row="${esc(doc.id)}">
    <td class="pl-4 pr-2 py-3"><input class="w-4 h-4 rounded text-primary focus:ring-0 cursor-pointer" type="checkbox" /></td>
    <td class="py-3 px-3"><div class="flex items-start gap-2.5">
      <span class="material-symbols-outlined ${isPdf ? 'text-error' : 'text-secondary'} text-2xl shrink-0 mt-0.5">${isPdf ? 'picture_as_pdf' : 'description'}</span>
      <div class="flex flex-col min-w-0"><span class="font-medium text-on-surface truncate hover:underline">${esc(doc.name)}</span>
      <div class="flex items-center gap-1.5 mt-0.5"><span class="font-tabular-mono text-label-sm text-on-surface-variant">${esc(doc.id.slice(0, 8).toUpperCase())}</span></div></div>
    </div></td>
    <td class="py-3 px-3"><span class="px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-label-sm">${esc(folderName(doc))}</span></td>
    <td class="py-3 px-3"><div class="flex flex-col min-w-0"><span class="font-medium truncate">${esc(doc.case_title || '—')}</span></div></td>
    <td class="py-3 px-3"><div class="flex flex-col min-w-0"><span class="font-tabular-mono text-label-sm text-on-surface">${esc(doc.created_at ? new Date(doc.created_at).toLocaleString('fr-TN') : '—')}</span></div></td>
    <td class="py-3 px-3 text-right font-tabular-mono text-label-sm text-on-surface-variant">${esc(sizeLabel(doc.size_bytes))}</td>
    <td class="py-3 px-3 text-center"><span class="px-1.5 py-0.5 rounded bg-surface-container text-primary font-tabular-mono text-label-sm font-bold">v1</span></td>
    <td class="pr-4 pl-2 py-3 text-right"><button type="button" data-download="${esc(doc.storage_path)}" data-provider="${esc(doc.storage_path?.startsWith('r2/') ? 'r2' : 'supabase')}" class="p-1 hover:bg-surface-container rounded text-primary transition-colors" title="Télécharger"><span class="material-symbols-outlined text-lg">download</span></button></td>
  </tr>`;
}

export default function Documents() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const setup = (root: HTMLElement) => {
    const opts = { navigate, pathname, signOut };
    applyShell(root, opts);
    void hydrateChrome(root, user);
    // StrictMode re-runs setup in dev; never inject the modal twice.
    if (!root.querySelector('#lexora-add-folder')) root.insertAdjacentHTML('beforeend', folderModal);

    const modal = root.querySelector<HTMLElement>('#lexora-add-folder')!;
    const form = root.querySelector<HTMLFormElement>('#lexora-add-folder-form')!;
    const nameInput = form.querySelector<HTMLInputElement>('input[name="folder-name"]')!;
    const errorBox = root.querySelector<HTMLElement>('#lexora-add-folder-err')!;
    const folderList = root.querySelector<HTMLElement>('[data-folder-list]')!;
    const allFolder = root.querySelector<HTMLElement>('[data-folder="all"]')!;

    let fileInput = root.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.multiple = true;
      fileInput.className = 'hidden';
      root.appendChild(fileInput);
    }

    let orgId: string | null = null;
    let documents: any[] = [];
    let folders: any[] = [];
    let activeFolder: string | null = null;

    const openModal = () => {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      nameInput.value = '';
      errorBox.classList.add('hidden');
      nameInput.focus();
    };
    const closeModal = () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    };

    const folderRow = (folder: any): string => {
      const count = documents.filter((doc) => doc.category_id === folder.id).length;
      const active = activeFolder === folder.id;
      return `<div data-folder-id="${esc(folder.id)}" class="group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${active ? 'bg-secondary-container/60 text-on-secondary-container' : 'text-on-surface hover:bg-surface-container-low'}">
        <div class="flex items-center gap-2 min-w-0">
          <span class="material-symbols-outlined text-lg ${active ? 'text-on-secondary-container' : 'text-on-surface-variant group-hover:text-primary'}">folder</span>
          <span class="font-body-sm text-body-sm font-medium truncate">${esc(folder.name)}</span>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <span class="font-tabular-mono text-label-sm px-1.5 py-0.5 rounded bg-surface-container">${count}</span>
          <button type="button" data-delete-folder="${esc(folder.id)}" title="Supprimer" class="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-error transition-opacity"><span class="material-symbols-outlined text-sm">delete</span></button>
        </div>
      </div>`;
    };

    const renderFolders = () => {
      folderList.innerHTML = folders.length ? folders.map(folderRow).join('') : '';
      allFolder.classList.toggle('bg-primary', activeFolder === null);
      allFolder.classList.toggle('text-on-primary', activeFolder === null);
    };

    const renderDocuments = () => {
      const visible = activeFolder ? documents.filter((doc) => doc.category_id === activeFolder) : documents;
      setRows(root, 'tbody', visible.length
        ? visible.map(documentRow).join('')
        : emptyRow(8, 'Aucun document pour le moment.'));
      root.querySelectorAll<HTMLElement>('[data-doc-total]').forEach((el) => {
        el.textContent = String(documents.length);
      });
      const listCount = root.querySelector<HTMLElement>('[data-list-count]');
      if (listCount) listCount.textContent = `${visible.length} document${visible.length === 1 ? '' : 's'}`;
    };

    const load = async () => {
      if (!user) return;
      orgId = await getOrCreateOrg(user.id);
      if (!orgId) return;
      const [{ data: docs }, { data: cats }] = await Promise.all([listDocuments(orgId), listFolders(orgId)]);
      documents = docs ?? [];
      folders = cats ?? [];
      if (activeFolder && !folders.some((folder) => folder.id === activeFolder)) activeFolder = null;
      renderFolders();
      renderDocuments();
    };

    root.onclick = async (event) => {
      const target = event.target as HTMLElement;

      if (target.closest('[data-action="new-folder"]')) {
        event.preventDefault();
        openModal();
        return;
      }
      if (target.closest('[data-action="close-add-folder"]')) {
        event.preventDefault();
        closeModal();
        return;
      }

      const deleteButton = target.closest<HTMLElement>('[data-delete-folder]');
      if (deleteButton) {
        event.preventDefault();
        event.stopPropagation();
        if (!window.confirm(tr('Supprimer ce dossier ?'))) return;
        const { error } = await deleteFolder(deleteButton.dataset.deleteFolder!);
        if (error) {
          window.alert(error);
          return;
        }
        if (activeFolder === deleteButton.dataset.deleteFolder) activeFolder = null;
        await load();
        return;
      }

      const folder = target.closest<HTMLElement>('[data-folder-id]');
      if (folder) {
        event.preventDefault();
        activeFolder = activeFolder === folder.dataset.folderId ? null : folder.dataset.folderId!;
        renderFolders();
        renderDocuments();
        return;
      }

      if (target.closest('[data-folder="all"]')) {
        event.preventDefault();
        activeFolder = null;
        renderFolders();
        renderDocuments();
        return;
      }

      if (target.closest('[data-action="import-documents"]')) {
        event.preventDefault();
        fileInput.click();
        return;
      }

      const row = target.closest<HTMLElement>('[data-document-row]');
      if (row && !target.closest('button, input')) {
        const doc = documents.find((item) => item.id === row.dataset.documentRow);
        const preview = root.querySelector<HTMLElement>('#lexora-doc-preview');
        if (doc && preview) {
          preview.innerHTML = `<div class="flex flex-col gap-space-sm text-left">
            <div class="w-12 h-12 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center"><span class="material-symbols-outlined text-2xl">description</span></div>
            <div><p class="font-body-md text-body-md font-semibold text-on-surface break-all">${esc(doc.name)}</p>
            <p class="font-label-sm text-label-sm text-on-surface-variant mt-0.5">${esc(folderName(doc))} • ${esc(sizeLabel(doc.size_bytes))}</p></div>
            <div class="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-surface-container-low text-label-sm font-label-sm">
              <div><span class="text-on-surface-variant block">Dossier</span><span class="font-medium text-on-surface">${esc(doc.case_title || '—')}</span></div>
              <div><span class="text-on-surface-variant block">Ajouté le</span><span class="font-medium text-on-surface">${esc(doc.created_at ? new Date(doc.created_at).toLocaleDateString('fr-TN') : '—')}</span></div>
            </div>
          </div>`;
        }
        return;
      }

      const download = target.closest<HTMLElement>('[data-download]');
      if (download) {
        event.preventDefault();
        const { url, error } = await getSignedUrl(download.dataset.download!, download.dataset.provider);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        else if (error) window.alert(error);
        return;
      }

      shellClick(event, root, opts);
    };

    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!orgId) return;
      const name = nameInput.value.trim();
      if (!name) return;
      const { error } = await createFolder(orgId, name);
      if (error) {
        errorBox.textContent = error.message;
        errorBox.classList.remove('hidden');
        return;
      }
      closeModal();
      await load();
    };

    fileInput.onchange = async () => {
      if (!orgId || !user || !fileInput.files?.length) return;
      for (const file of Array.from(fileInput.files)) {
        const { error } = await uploadDocument(orgId, user.id, file, activeFolder);
        if (error) window.alert(error);
      }
      fileInput.value = '';
      await load();
    };

    void load();
  };

  return <StitchPage html={html} setup={setup} />;
}
