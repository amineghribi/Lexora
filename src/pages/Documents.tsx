import { useNavigate, useLocation } from 'react-router-dom';
import raw from '../stitch/documents.html?raw';
import StitchPage from '../components/StitchPage';
import { useAuth } from '../lib/auth';
import { getOrCreateOrg } from '../lib/org';
import { listDocuments, uploadDocument, getSignedUrl } from '../services/documents';
import { addLogoutLink, applyShell, emptyRow, esc, hydrateChrome, setRows, shellClick } from '../lib/stitch';

const html = addLogoutLink(raw);

function sizeLabel(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
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
    <td class="py-3 px-3"><span class="px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-label-sm">${esc(doc.category || 'Divers')}</span></td>
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

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.className = 'hidden';
    root.appendChild(fileInput);

    let orgId: string | null = null;
    let documents: any[] = [];

    const load = async () => {
      if (!user) return;
      orgId = await getOrCreateOrg(user.id);
      if (!orgId) return;
      const { data } = await listDocuments(orgId);
      documents = data ?? [];
      setRows(root, 'tbody', documents.length
        ? documents.map(documentRow).join('')
        : emptyRow(8, 'Aucun document pour le moment.'));
      root.querySelectorAll<HTMLElement>('[data-doc-total]').forEach((el) => {
        el.textContent = String(documents.length);
      });
      const listCount = root.querySelector<HTMLElement>('[data-list-count]');
      if (listCount) listCount.textContent = `${documents.length} document${documents.length === 1 ? '' : 's'}`;
    };

    root.onclick = async (event) => {
      const target = event.target as HTMLElement;

      if ((target.closest('button')?.textContent ?? '').includes('Importer des Documents')) {
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
            <p class="font-label-sm text-label-sm text-on-surface-variant mt-0.5">${esc(doc.category || 'Divers')} • ${esc(sizeLabel(doc.size_bytes))}</p></div>
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

    fileInput.onchange = async () => {
      if (!orgId || !user || !fileInput.files?.length) return;
      for (const file of Array.from(fileInput.files)) {
        const { error } = await uploadDocument(orgId, user.id, file);
        if (error) window.alert(error);
      }
      fileInput.value = '';
      await load();
    };

    void load();
  };

  return <StitchPage html={html} setup={setup} />;
}
