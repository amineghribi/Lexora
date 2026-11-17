import { useNavigate, useLocation } from 'react-router-dom';
import raw from '../stitch/dashboard.html?raw';
import StitchPage from '../components/StitchPage';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateOrg } from '../lib/org';
import { addLogoutLink, applyShell, esc, formatNumber, hydrateChrome, shellClick } from '../lib/stitch';
import { listCases } from '../services/cases';
import { listHearings } from '../services/hearings';
import { listTasks } from '../services/tasks';

const html = addLogoutLink(raw);
const EMPTY = '<p class="text-body-sm text-on-surface-variant py-space-lg text-center">Aucune donnée pour le moment.</p>';

function shortDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('fr-TN', { day: '2-digit', month: 'short' });
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const setup = (root: HTMLElement) => {
    const opts = { navigate, pathname, signOut };
    applyShell(root, opts);
    root.onclick = (event) => { shellClick(event, root, opts); };
    if (!user) return;

    void hydrateChrome(root, user);

    const name = (user.user_metadata?.full_name as string | undefined) || user.email?.split('@')[0] || 'Avocat';
    const greeting = root.querySelector<HTMLElement>('[data-greeting]');
    if (greeting) greeting.textContent = `Bonjour, ${name}`;

    void getOrCreateOrg(user.id).then(async (orgId) => {
      if (!orgId) return;

      const count = async (table: string, status?: string) => {
        let query = supabase.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', orgId);
        if (status) query = query.eq('status', status);
        const { count: value } = await query;
        return value ?? 0;
      };

      const [clients, openCases, closedCases, hearings, tasks, casesRes, hearingRes, taskRes, notifications, fees, payments] = await Promise.all([
        count('clients'),
        count('cases', 'open'),
        count('cases', 'closed'),
        count('hearings'),
        count('tasks'),
        listCases(orgId),
        listHearings(orgId),
        listTasks(orgId),
        supabase.from('notifications').select('title, message, created_at').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(5),
        supabase.from('case_fees').select('agreed_amount').eq('organization_id', orgId),
        supabase.from('payments').select('amount').eq('organization_id', orgId),
      ]);

      const kpis: Record<string, number> = {
        clients, openCases, closedCases, hearings, tasks,
      };
      root.querySelectorAll<HTMLElement>('[data-kpi]').forEach((el) => {
        el.textContent = formatNumber(kpis[el.dataset.kpi ?? ''] ?? 0);
      });

      const cases = casesRes.data ?? [];
      const now = Date.now();
      const upcoming = (hearingRes.data ?? [])
        .filter((item) => !item.hearing_date || new Date(item.hearing_date).getTime() >= now)
        .slice(0, 5);
      const pending = (taskRes.data ?? []).filter((item) => item.status !== 'done').slice(0, 5);

      const hearingsBox = root.querySelector<HTMLElement>('#lexora-dash-hearings');
      if (hearingsBox) {
        hearingsBox.innerHTML = upcoming.length
          ? upcoming.map((item) => `<div class="p-space-lg flex items-center justify-between gap-space-md">
              <div class="flex items-center gap-space-md min-w-0">
                <div class="w-12 h-12 rounded-lg bg-primary-container text-surface flex flex-col items-center justify-center shrink-0">
                  <span class="font-label-sm text-label-sm leading-none">${esc(shortDate(item.hearing_date))}</span>
                  <span class="font-headline-sm text-headline-sm font-bold leading-tight">${item.hearing_date ? esc(new Date(item.hearing_date).toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit' })) : '—'}</span>
                </div>
                <div class="min-w-0"><span class="font-headline-sm text-headline-sm font-semibold text-on-surface block truncate">${esc(item.court || 'Audience')}</span>
                <span class="font-label-sm text-label-sm text-on-surface-variant truncate">${esc(item.hearing_type || 'Audience')}</span></div>
              </div>
              <a class="font-label-sm text-label-sm text-secondary hover:text-primary font-medium shrink-0" href="/hearings">Voir</a>
            </div>`).join('')
          : EMPTY;
      }

      const tasksBox = root.querySelector<HTMLElement>('#lexora-dash-tasks');
      if (tasksBox) {
        tasksBox.innerHTML = pending.length
          ? pending.map((item) => `<div class="flex items-center justify-between p-space-md rounded-lg bg-surface-container-low/60">
              <div class="min-w-0"><p class="font-body-md text-body-md font-semibold text-on-surface truncate">${esc(item.title)}</p>
              ${item.due_date ? `<span class="font-label-sm text-label-sm text-on-surface-variant">${esc(shortDate(item.due_date))}</span>` : ''}</div>
              <span class="font-label-sm text-label-sm text-on-surface-variant shrink-0 ml-space-sm">À faire</span>
            </div>`).join('')
          : EMPTY;
      }

      const recentBox = root.querySelector<HTMLElement>('#lexora-dash-cases');
      if (recentBox) {
        recentBox.innerHTML = cases.length
          ? cases.slice(0, 5).map((item) => `<div class="flex items-start gap-space-sm pb-space-sm border-b border-surface-container last:border-0 last:pb-0">
              <div class="w-8 h-8 rounded-lg bg-primary-container text-on-primary flex items-center justify-center shrink-0 mt-0.5">
                <span class="material-symbols-outlined text-base">gavel</span></div>
              <div class="flex-1 min-w-0"><div class="flex items-center justify-between gap-space-sm">
                <span class="font-body-sm text-body-sm font-semibold text-on-surface truncate">${esc(item.title)}</span>
                <span class="font-label-sm text-label-sm text-on-surface-variant shrink-0">${esc(shortDate(item.created_at))}</span></div>
                <span class="font-label-sm text-label-sm text-on-surface-variant truncate">${esc(item.reference || '')} • ${esc(item.clients?.full_name || '')}</span>
              </div>
            </div>`).join('')
          : EMPTY;
      }

      const activityBox = root.querySelector<HTMLElement>('#lexora-dash-activity');
      if (activityBox) {
        const items = notifications.data ?? [];
        activityBox.innerHTML = items.length
          ? items.map((item) => `<div class="py-space-sm border-b border-surface-container last:border-0">
              <p class="font-body-sm text-body-sm text-on-surface">${esc(item.title || 'Notification')}</p>
              ${item.message ? `<p class="font-label-sm text-label-sm text-on-surface-variant truncate">${esc(item.message)}</p>` : ''}
              <span class="font-label-sm text-label-sm text-on-surface-variant">${esc(shortDate(item.created_at))}</span>
            </div>`).join('')
          : EMPTY;
      }

      const byStatus = new Map<string, number>();
      const byCategory = new Map<string, number>();
      const byMonth = new Map<string, number>();
      cases.forEach((item) => {
        const status = item.status || 'open';
        byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
        const category = item.legal_category || 'Autre';
        byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
        const month = item.created_at ? new Date(item.created_at).toLocaleDateString('fr-TN', { month: 'short' }) : '—';
        byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
      });
      const labels: Record<string, string> = { open: 'En cours', closed: 'Clôturé' };
      const describe = (map: Map<string, number>) => map.size
        ? Array.from(map, ([key, value]) => `${labels[key] || key}: ${value}`).join(' • ')
        : 'Aucune donnée pour le moment.';

      const analytics = root.querySelector<HTMLElement>('[data-analytics="status"]');
      if (analytics) analytics.textContent = describe(byStatus);
      const category = root.querySelector<HTMLElement>('[data-analytics="category"]');
      if (category) category.textContent = describe(byCategory);
      const monthly = root.querySelector<HTMLElement>('[data-analytics="monthly"]');
      if (monthly) monthly.textContent = describe(byMonth);

      const agreed = (fees.data ?? []).reduce((sum: number, item) => sum + Number(item.agreed_amount ?? 0), 0);
      const received = (payments.data ?? []).reduce((sum: number, item) => sum + Number(item.amount ?? 0), 0);
      const money = (value: number) => `${new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value)} TND`;
      const finance = root.querySelector<HTMLElement>('[data-analytics="finance"]');
      if (finance) {
        finance.textContent = agreed || received
          ? `Honoraires: ${money(agreed)} • Encaissé: ${money(received)} • Solde: ${money(Math.max(0, agreed - received))}`
          : 'Aucune donnée pour le moment.';
      }
    });
  };

  return <StitchPage html={html} setup={setup} />;
}
