import { supabase } from '../lib/supabase';
export async function listHearings(orgId: string) {
  const { data, error } = await supabase.from('hearings').select('*').eq('organization_id', orgId).order('hearing_date', { ascending: true });
  return { data, error };
}
export async function createHearing(orgId: string, payload: { hearing_date: string; court?: string; hearing_type?: string; notes?: string }) {
  const { data, error } = await supabase.from('hearings').insert({ organization_id: orgId, status: 'scheduled', ...payload }).select().single();
  return { data, error };
}