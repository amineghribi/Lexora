import { useEffect, useState } from 'react';
import { getOrCreateOrg } from '../lib/org';
import { useAuth } from '../lib/auth';
import { listCases } from '../services/cases';
import * as F from '../services/financial';

export default function Financial() {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [cases, setCases] = useState<any[]>([]);
  const [caseId, setCaseId] = useState('');
  const [fee, setFee] = useState<number>(0);
  const [payments, setPayments] = useState<any[]>([]);
  const [payAmt, setPayAmt] = useState('');
  useEffect(() => { if (!user) return; getOrCreateOrg(user.id).then(o => { setOrgId(o); if (o) listCases(o).then(({ data }) => setCases(data ?? [])); }); }, [user]);
  useEffect(() => { if (!orgId || !caseId) return; (async () => { const f = await F.getFees(orgId, caseId); setFee(f?.agreed_amount ?? 0); setPayments(await F.listPayments(orgId, caseId)); })(); }, [orgId, caseId]);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = fee - totalPaid;
  const saveFee = async () => { if (!orgId || !caseId) return; await F.setFee(orgId, caseId, fee); };
  const addPay = async (e: React.FormEvent) => { e.preventDefault(); if (!orgId || !caseId || !payAmt) return; await F.addPayment(orgId, caseId, Number(payAmt)); setPayAmt(''); const ps = await F.listPayments(orgId, caseId); setPayments(ps); };
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Financial (TND)</h1>
        <select className="border rounded-lg px-3 py-2" value={caseId} onChange={e=>setCaseId(e.target.value)}>
          <option value="">Select case</option>
          {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        {caseId && (
          <>
            <div className="bg-white rounded-xl border p-4 space-y-2">
              <div className="flex gap-2 items-center">
                <label className="text-sm">Agreed fee:</label>
                <input type="number" className="border rounded-lg px-3 py-2" value={fee} onChange={e=>setFee(Number(e.target.value))} />
                <button onClick={saveFee} className="bg-slate-900 text-white px-3 py-2 rounded-lg text-sm">Save</button>
              </div>
              <div className="text-sm">Total paid: {totalPaid.toFixed(3)} TND</div>
              <div className="text-sm font-semibold">Balance: {balance.toFixed(3)} TND</div>
            </div>
            <form onSubmit={addPay} className="flex gap-2">
              <input type="number" className="border rounded-lg px-3 py-2" placeholder="Payment amount" value={payAmt} onChange={e=>setPayAmt(e.target.value)} />
              <button className="bg-slate-900 text-white px-4 py-2 rounded-lg">Record payment</button>
            </form>
            <div className="bg-white rounded-xl border divide-y">
              {payments.map(p => <div key={p.id} className="p-4 flex justify-between"><span>{p.payment_date}</span><span>{Number(p.amount).toFixed(3)} TND — {p.method}</span></div>)}
              {payments.length===0 && <div className="p-4 text-slate-500">No payments.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}