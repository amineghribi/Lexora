import { supabase } from '../lib/supabase';

export async function listClients(orgId: string) {
  const { data, error } = await supabase.from('clients').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
  return { data, error };
}

export async function createClient(orgId: string, payload: { full_name: string; client_type?: string; phone?: string; email?: string; cin_or_reg?: string; address?: string; notes?: string }) {
  const ref = 'CL-' + Date.now().toString(36).toUpperCase();
  const { data, error } = await supabase.from('clients').insert({ organization_id: orgId, reference: ref, ...payload }).select().single();
  return { data, error };
}