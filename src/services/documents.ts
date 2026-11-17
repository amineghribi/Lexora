import { supabase } from '../lib/supabase';

/** URL of the Cloudflare Worker that signs R2 uploads/downloads. */
const SIGNER_URL = (import.meta.env.VITE_R2_SIGNER_URL as string) || '';

export async function listDocuments(orgId: string) {
  const { data, error } = await supabase.from('documents').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
  return { data, error };
}

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function callSigner<T>(path: 'upload-url' | 'download-url', body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  if (!SIGNER_URL) return { data: null, error: 'Stockage R2 non configuré.' };
  const token = await accessToken();
  if (!token) return { data: null, error: 'Session expirée, veuillez vous reconnecter.' };

  let response: Response;
  try {
    response = await fetch(`${SIGNER_URL.replace(/\/$/, '')}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    return { data: null, error: 'Service de signature R2 inaccessible.' };
  }

  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) return { data: null, error: payload.error || 'Erreur du service de signature R2.' };
  return { data: payload, error: null };
}

interface SignedUpload {
  key: string;
  url: string;
  headers: Record<string, string>;
}

export async function uploadDocument(orgId: string, userId: string, file: File) {
  if (SIGNER_URL) {
    const { data: signed, error: signError } = await callSigner<SignedUpload>('upload-url', {
      name: file.name,
      size: file.size,
      contentType: file.type || 'application/octet-stream',
    });
    if (signError || !signed) return { data: null, error: signError ?? 'URL de téléversement indisponible.' };

    const uploaded = await fetch(signed.url, {
      method: 'PUT',
      headers: signed.headers,
      body: file,
    });
    if (!uploaded.ok) return { data: null, error: `Échec du téléversement R2 (${uploaded.status}).` };

    const { data, error } = await supabase.from('documents').insert({
      organization_id: orgId,
      name: file.name,
      storage_path: signed.key,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: userId,
    }).select().single();
    return { data, error: error?.message ?? null };
  }

  // Legacy path: private Supabase Storage bucket (used until R2 is deployed).
  const path = `${orgId}/${Date.now()}-${file.name}`;
  const { error: upErr } = await supabase.storage.from('documents').upload(path, file);
  if (upErr) return { data: null, error: upErr.message };
  const { data, error } = await supabase.from('documents').insert({
    organization_id: orgId, name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size, uploaded_by: userId,
  }).select().single();
  return { data, error: error?.message ?? null };
}

export async function getSignedUrl(path: string, provider = 'supabase') {
  if (provider === 'r2' || path.startsWith('r2/')) {
    const { data, error } = await callSigner<{ url: string }>('download-url', { key: path });
    return { url: data?.url ?? null, error };
  }
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 60);
  return { url: data?.signedUrl ?? null, error: error?.message ?? null };
}
