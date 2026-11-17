import { useNavigate, useLocation } from 'react-router-dom';
import StitchPage from '../components/StitchPage';
import { useAuth } from '../lib/auth';
import { getOrCreateOrg } from '../lib/org';
import { listTasks, createTask, updateTaskStatus } from '../services/tasks';
import { applyShell, esc, hydrateChrome, shellClick, withShell } from '../lib/stitch';

const mainContent = `
<div class="flex flex-col w-full gap-space-lg">
  <div class="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm">
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
      <div>
        <div class="flex items-center gap-space-xs mb-space-xs">
          <span class="px-space-xs py-0.5 rounded bg-surface-container-high text-on-surface-variant font-tabular-mono text-label-sm uppercase tracking-wider">Actes &amp; Diligences</span>
        </div>
        <h1 class="font-headline-xl text-headline-xl text-on-surface tracking-tight">Tâches &amp; Actes</h1>
        <p class="font-body-md text-body-md text-on-surface-variant mt-0.5">Suivi des diligences et échéances du cabinet.</p>
      </div>
      <form id="lexora-task-form" class="flex flex-wrap items-center gap-space-sm">
        <input name="title" required placeholder="Nouvelle tâche" class="h-10 px-space-md rounded-lg bg-surface-container-low text-on-surface outline-none focus:bg-surface-container min-w-[220px]" />
        <input name="due_date" type="date" class="h-10 px-space-md rounded-lg bg-surface-container-low text-on-surface outline-none" />
        <button type="submit" class="h-10 px-space-md rounded-lg bg-primary text-on-primary font-label-md font-semibold flex items-center gap-space-xs"><span class="material-symbols-outlined text-base">add</span>Ajouter</button>
      </form>
    </div>
  </div>
  <div class="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
    <div class="px-space-lg py-space-md bg-surface-container-low flex items-center justify-between">
      <span class="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">Diligences</span>
      <span id="lexora-task-count" class="font-tabular-mono text-label-sm text-on-surface-variant">0</span>
    </div>
    <div id="lexora-task-list" class="divide-y divide-surface-container"></div>
  </div>
</div>`;

const html = withShell(mainContent, 'Tâches & Actes');

export default function Tasks() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const setup = (root: HTMLElement) => {
    const opts = { navigate, pathname, signOut };
    applyShell(root, opts);
    void hydrateChrome(root, user);
    root.onclick = (event) => shellClick(event, root, opts);

    const list = root.querySelector<HTMLElement>('#lexora-task-list')!;
    const count = root.querySelector<HTMLElement>('#lexora-task-count')!;
    const form = root.querySelector<HTMLFormElement>('#lexora-task-form')!;
    let orgId: string | null = null;

    const load = async () => {
      if (!user) return;
      orgId = await getOrCreateOrg(user.id);
      if (!orgId) return;
      const { data } = await listTasks(orgId);
      const tasks = data ?? [];
      count.textContent = String(tasks.length);
      list.innerHTML = tasks.length
        ? tasks.map((task: any) => {
            const done = task.status === 'done';
            return `<div class="flex items-center gap-space-md px-space-lg py-space-sm hover:bg-surface-container-low/60 transition-colors">
              <button data-toggle-task="${esc(task.id)}" data-status="${done ? 'todo' : 'done'}" class="w-5 h-5 rounded border flex items-center justify-center ${done ? 'bg-primary text-on-primary border-primary' : 'border-outline text-transparent'}">
                <span class="material-symbols-outlined text-sm">check</span>
              </button>
              <div class="flex flex-col min-w-0 flex-1">
                <span class="font-body-md text-body-md ${done ? 'line-through text-on-surface-variant' : 'text-on-surface'} truncate">${esc(task.title)}</span>
                ${task.due_date ? `<span class="font-label-sm text-label-sm text-on-surface-variant">${esc(new Date(task.due_date).toLocaleDateString('fr-TN'))}</span>` : ''}
              </div>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full ${done ? 'bg-secondary-container/50 text-on-secondary-container' : 'bg-surface-container text-on-surface'} font-label-sm font-semibold">${done ? 'Terminée' : 'À faire'}</span>
            </div>`;
          }).join('')
        : '<p class="px-space-lg py-space-xl text-center text-body-md text-on-surface-variant">Aucune tâche pour le moment.</p>';
    };

    list.onclick = async (event) => {
      const target = event.target as HTMLElement;
      const toggle = target.closest<HTMLElement>('[data-toggle-task]');
      if (!toggle) return;
      await updateTaskStatus(toggle.dataset.toggleTask!, toggle.dataset.status!);
      await load();
    };

    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!orgId) return;
      const data = new FormData(form);
      const title = String(data.get('title') || '').trim();
      if (!title) return;
      const due = String(data.get('due_date') || '') || null;
      const { error } = await createTask(orgId, { title, due_date: due });
      if (!error) {
        form.reset();
        await load();
      }
    };

    void load();
  };

  return <StitchPage html={html} setup={setup} />;
}
