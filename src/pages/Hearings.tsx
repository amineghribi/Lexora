import { useEffect, useState } from 'react';
import { getOrCreateOrg } from '../lib/org';
import { useAuth } from '../lib/auth';
import { listHearings, createHearing } from '../services/hearings';

export default function Hearings() {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [date, setDate] = useState('');
  const [court, setCourt] = useState('');
  const load = async (o: string) => { const { data } = await listHearings(o); setItems(data ?? []); };
  useEffect(() => { if (!user) return; getOrCreateOrg(user.id).then(o => { setOrgId(o); if (o) load(o); }); }, [user]);
  const add = async (e: React.FormEvent) => { e.preventDefault(); if (!orgId || !date) return; await createHearing(orgId, { hearing_date: date, court }); setDate(''); setCourt(''); load(orgId); };
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Hearings</h1>
        <form onSubmit={add} className="flex gap-2">
          <input type="date" className="border rounded-lg px-3 py-2" value={date} onChange={e=>setDate(e.target.value)} />
          <input className="border rounded-lg px-3 py-2 flex-1" placeholder="Court" value={court} onChange={e=>setCourt(e.target.value)} />
          <button className="bg-slate-900 text-white px-4 py-2 rounded-lg">Add</button>
        </form>
        <div className="bg-white rounded-xl border divide-y">
          {items.map(h => (
            <div key={h.id} className="p-4 flex justify-between">
              <div><div className="font-medium">{h.hearing_date}</div><div className="text-sm text-slate-500">{h.court} — {h.hearing_type}</div></div>
              <div className="text-sm text-slate-500">{h.status}</div>
            </div>
          ))}
          {items.length === 0 && <div className="p-4 text-slate-500">No hearings.</div>}
        </div>
      </div>
    </div>
  );
}