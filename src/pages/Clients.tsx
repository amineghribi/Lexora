import { useEffect, useState } from 'react';
import { getOrCreateOrg } from '../lib/org';
import { useAuth } from '../lib/auth';
import { listClients, createClient } from '../services/clients';

export default function Clients() {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [name, setName] = useState('');
  const load = async (o: string) => { const { data } = await listClients(o); setClients(data ?? []); };
  useEffect(() => { if (!user) return; getOrCreateOrg(user.id).then(o => { setOrgId(o); if (o) load(o); }); }, [user]);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); if (!orgId || !name) return;
    await createClient(orgId, { full_name: name }); setName(''); load(orgId);
  };
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Clients</h1>
        <form onSubmit={add} className="flex gap-2">
          <input className="border rounded-lg px-3 py-2 flex-1" placeholder="New client name" value={name} onChange={e=>setName(e.target.value)} />
          <button className="bg-slate-900 text-white px-4 py-2 rounded-lg">Add</button>
        </form>
        <div className="bg-white rounded-xl border divide-y">
          {clients.map(c => (
            <div key={c.id} className="p-4 flex justify-between">
              <div><div className="font-medium">{c.full_name}</div><div className="text-sm text-slate-500">{c.reference}</div></div>
              <div className="text-sm text-slate-500">{c.phone}</div>
            </div>
          ))}
          {clients.length === 0 && <div className="p-4 text-slate-500">No clients yet.</div>}
        </div>
      </div>
    </div>
  );
}