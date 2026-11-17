import { useEffect, useRef, useState } from 'react';
import { getOrCreateOrg } from '../lib/org';
import { useAuth } from '../lib/auth';
import { listDocuments, uploadDocument, getSignedUrl } from '../services/documents';

export default function Documents() {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = async (o: string) => { const { data } = await listDocuments(o); setDocs(data ?? []); };
  useEffect(() => { if (!user) return; getOrCreateOrg(user.id).then(o => { setOrgId(o); if (o) load(o); }); }, [user]);
  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !orgId || !user) return;
    setBusy(true); await uploadDocument(orgId, user.id, file); setBusy(false); load(orgId); if (fileRef.current) fileRef.current.value = '';
  };
  const download = async (path: string) => { const { url } = await getSignedUrl(path); if (url) window.open(url, '_blank'); };
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Documents</h1>
        <input ref={fileRef} type="file" onChange={onUpload} disabled={busy} className="border rounded-lg px-3 py-2" />
        {busy && <span className="text-sm text-slate-500">Uploading...</span>}
        <div className="bg-white rounded-xl border divide-y">
          {docs.map(d => (
            <div key={d.id} className="p-4 flex justify-between items-center">
              <div><div className="font-medium">{d.name}</div><div className="text-sm text-slate-500">{d.mime_type} — {d.size_bytes} bytes</div></div>
              <button onClick={()=>download(d.storage_path)} className="text-sm text-slate-600 border rounded px-2 py-1">Download</button>
            </div>
          ))}
          {docs.length === 0 && <div className="p-4 text-slate-500">No documents.</div>}
        </div>
      </div>
    </div>
  );
}