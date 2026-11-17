import { useEffect, useState } from 'react';
import { getOrCreateOrg } from '../lib/org';
import { useAuth } from '../lib/auth';
import { listTasks, createTask, updateTaskStatus } from '../services/tasks';

export default function Tasks() {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const load = async (o: string) => { const { data } = await listTasks(o); setTasks(data ?? []); };
  useEffect(() => { if (!user) return; getOrCreateOrg(user.id).then(o => { setOrgId(o); if (o) load(o); }); }, [user]);
  const add = async (e: React.FormEvent) => { e.preventDefault(); if (!orgId || !title) return; await createTask(orgId, { title }); setTitle(''); load(orgId); };
  const toggle = async (t: any) => { const next = t.status === 'completed' ? 'todo' : 'completed'; await updateTaskStatus(t.id, next); if (orgId) load(orgId); };
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
        <form onSubmit={add} className="flex gap-2">
          <input className="border rounded-lg px-3 py-2 flex-1" placeholder="New task" value={title} onChange={e=>setTitle(e.target.value)} />
          <button className="bg-slate-900 text-white px-4 py-2 rounded-lg">Add</button>
        </form>
        <div className="bg-white rounded-xl border divide-y">
          {tasks.map(t => (
            <div key={t.id} className="p-4 flex justify-between items-center">
              <div className={t.status==='completed'?'line-through text-slate-400':''}>{t.title}</div>
              <button onClick={()=>toggle(t)} className="text-sm text-slate-600 border rounded px-2 py-1">{t.status}</button>
            </div>
          ))}
          {tasks.length === 0 && <div className="p-4 text-slate-500">No tasks.</div>}
        </div>
      </div>
    </div>
  );
}