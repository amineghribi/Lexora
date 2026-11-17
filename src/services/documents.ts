import { supabase } from '../lib/supabase';

export async function listDocuments(orgId: string) {
  const { data, error } = await supabase.from('documents').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
  return { data, error };
}

export async function uploadDocument(orgId: string, userId: string, file: File) {
  const path = `${orgId}/${Date.now()}-${file.name}`;
  const { error: upErr } = await supabase.storage.from('documents').upload(path, file);
  if (upErr) return { error: upErr.message };
  const { data, error } = await supabase.from('documents').insert({
    organization_id: orgId, name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size, uploaded_by: userId,
  }).select().single();
  return { data, error: error?.message ?? null };
}

export async function getSignedUrl(path: string) {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 60);
  return { url: data?.signedUrl ?? null, error: error?.message ?? null };
}