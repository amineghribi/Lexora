import { supabase } from '../lib/supabase';
export async function getFees(orgId: string, caseId: string) {
  const { data } = await supabase.from('case_fees').select('*').eq('organization_id', orgId).eq('case_id', caseId).maybeSingle();
  return data;
}
export async function setFee(orgId: string, caseId: string, amount: number) {
  const existing = await getFees(orgId, caseId);
  if (existing) return supabase.from('case_fees').update({ agreed_amount: amount }).eq('id', existing.id);
  return supabase.from('case_fees').insert({ organization_id: orgId, case_id: caseId, agreed_amount: amount });
}
export async function listPayments(orgId: string, caseId: string) {
  const { data } = await supabase.from('payments').select('*').eq('organization_id', orgId).eq('case_id', caseId).order('payment_date', { ascending: false });
  return data ?? [];
}
export async function addPayment(orgId: string, caseId: string, amount: number, method?: string) {
  return supabase.from('payments').insert({ organization_id: orgId, case_id: caseId, amount, method, payment_date: new Date().toISOString().slice(0,10) });
}