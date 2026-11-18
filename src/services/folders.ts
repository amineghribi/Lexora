import { supabase } from '../lib/supabase';

/** Document folders are stored as per-organization categories (RLS protected). */
export async function listFolders(orgId: string) {
  const { data, error } = await supabase
    .from('document_categories')
    .select('id, name')
    .eq('organization_id', orgId)
    .order('name');
  return { data, error };
}

export async function createFolder(orgId: string, name: string) {
  const { data, error } = await supabase
    .from('document_categories')
    .insert({ organization_id: orgId, name })
    .select()
    .single();
  return { data, error };
}

export async function deleteFolder(id: string) {
  const { error } = await supabase.from('document_categories').delete().eq('id', id);
  return { error: error?.message ?? null };
}
