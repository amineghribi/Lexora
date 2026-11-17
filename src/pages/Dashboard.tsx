import { useNavigate, useLocation } from 'react-router-dom';
import raw from '../stitch/dashboard.html?raw';
import StitchPage from '../components/StitchPage';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateOrg } from '../lib/org';
import { addLogoutLink, applyShell, esc, formatNumber, shellClick } from '../lib/stitch';

const html = addLogoutLink(raw);

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const setup = (root: HTMLElement) => {
    const opts = { navigate, pathname, signOut };
    applyShell(root, opts);
    root.onclick = (event) => {
      shellClick(event, root, opts);
    };

    if (!user) return;

    // Personalise the Stitch greeting.
    const greeting = root.querySelector<HTMLElement>('h1.font-headline-xl');
    const name = (user.user_metadata?.full_name as string | undefined) || user.email?.split('@')[0] || 'Avocat';
    if (greeting) greeting.textContent = `Bonjour, ${name}`;

    void getOrCreateOrg(user.id).then(async (orgId) => {
      if (!orgId) return;
      const count = async (table: string, status?: string) => {
        let query = supabase.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', orgId);
        if (status) query = query.eq('status', status);
        const { count: value } = await query;
        return value ?? 0;
      };
      const [clients, openCases, closedCases, hearings, tasks] = await Promise.all([
        count('clients'),
        count('cases', 'open'),
        count('cases', 'closed'),
        count('hearings'),
        count('tasks'),
      ]);

      const stats = root.querySelectorAll<HTMLElement>('span.font-headline-xl.text-headline-xl.font-bold');
      [clients, openCases, closedCases, hearings, tasks].forEach((value, index) => {
        if (stats[index]) stats[index].textContent = formatNumber(value);
      });

      // Replace the illustrative "critical deadlines" strip with a live count.
      const deadline = root.querySelector<HTMLElement>('[data-deadline-count]');
      if (deadline) deadline.textContent = esc(tasks);
    });
  };

  return <StitchPage html={html} setup={setup} />;
}
