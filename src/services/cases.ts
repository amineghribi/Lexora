import { supabase } from '../lib/supabase';

export async function listCases(orgId: string) {
  const { data, error } = await supabase.from('cases').select('*, clients(full_name)').eq('organization_id', orgId).order('created_at', { ascending: false });
  return { data, error };
}

export async function createCase(orgId: string, payload: { client_id: string; title: string; legal_category?: string; court?: string; description?: string }) {
  const ref = 'CS-' + Date.now().toString(36).toUpperCase();
  const { data, error } = await supabase.from('cases').insert({ organization_id: orgId, reference: ref, status: 'open', ...payload }).select().single();
  return { data, error };
}