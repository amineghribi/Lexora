import { useEffect, useState } from 'react';
import { getOrCreateOrg } from '../lib/org';
import { useAuth } from '../lib/auth';
import { listCases, createCase } from '../services/cases';
import { listClients } from '../services/clients';

export default function Cases() {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [cases, setCases] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const load = async (o: string) => { const { data } = await listCases(o); setCases(data ?? []); const { data: cl } = await listClients(o); setClients(cl ?? []); };
  useEffect(() => { if (!user) return; getOrCreateOrg(user.id).then(o => { setOrgId(o); if (o) load(o); }); }, [user]);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); if (!orgId || !title || !clientId) return;
    await createCase(orgId, { client_id: clientId, title }); setTitle(''); load(orgId);
  };
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Cases</h1>
        <form onSubmit={add} className="flex gap-2">
          <input className="border rounded-lg px-3 py-2 flex-1" placeholder="Case title" value={title} onChange={e=>setTitle(e.target.value)} />
          <select className="border rounded-lg px-3 py-2" value={clientId} onChange={e=>setClientId(e.target.value)}>
            <option value="">Select client</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
          <button className="bg-slate-900 text-white px-4 py-2 rounded-lg">Add</button>
        </form>
        <div className="bg-white rounded-xl border divide-y">
          {cases.map(c => (
            <div key={c.id} className="p-4 flex justify-between">
              <div><div className="font-medium">{c.title}</div><div className="text-sm text-slate-500">{c.reference} — {c.clients?.full_name}</div></div>
              <div className="text-sm text-slate-500">{c.status}</div>
            </div>
          ))}
          {cases.length === 0 && <div className="p-4 text-slate-500">No cases yet.</div>}
        </div>
      </div>
    </div>
  );
}