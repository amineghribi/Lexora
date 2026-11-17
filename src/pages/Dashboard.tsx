import { useEffect, useState } from 'react';
import { getOrCreateOrg } from '../lib/org';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
  const { user, signOut } = useAuth();
  // orgId managed implicitly via getOrCreateOrg
  const [stats, setStats] = useState({ clients: 0, cases: 0, tasks: 0, hearings: 0 });
  useEffect(() => {
    if (!user) return;
    getOrCreateOrg(user.id).then(async o => {
      if (!o) return;
      const [c, ca, t, h] = await Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('organization_id', o),
        supabase.from('cases').select('id', { count: 'exact', head: true }).eq('organization_id', o),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('organization_id', o),
        supabase.from('hearings').select('id', { count: 'exact', head: true }).eq('organization_id', o),
      ]);
      setStats({ clients: c.count ?? 0, cases: ca.count ?? 0, tasks: t.count ?? 0, hearings: h.count ?? 0 });
    });
  }, [user]);
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <button onClick={signOut} className="text-sm border rounded-lg px-3 py-2">Sign out</button>
        </div>
        <p className="text-slate-600">Welcome, {user?.email}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(stats).map(([k, v]) => (
            <div key={k} className="bg-white rounded-xl border p-4">
              <div className="text-sm text-slate-500 capitalize">{k}</div>
              <div className="text-2xl font-semibold text-slate-900">{v}</div>
            </div>
          ))}
        </div>
        <nav className="flex gap-3 text-sm">
          <a href="/clients" className="underline">Clients</a>
          <a href="/cases" className="underline">Cases</a>
          <a href="/tasks" className="underline">Tasks</a>
          <a href="/hearings" className="underline">Hearings</a>
          <a href="/documents" className="underline">Documents</a>
          <a href="/financial" className="underline">Financial</a>
        </nav>
      </div>
    </div>
  );
}