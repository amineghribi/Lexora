import { AwsV4Signer } from 'aws4fetch';

/**
 * Lexora R2 signer.
 *
 * The browser never sees the R2 secret key. It sends the Supabase access
 * token, we verify the session and the active organisation, then return a
 * short-lived presigned URL for a single object.
 */
interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_BUCKET: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  APP_ORIGIN: string;
}

const R2_PREFIX = 'r2/';
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const UPLOAD_TTL = 15 * 60;
const DOWNLOAD_TTL = 60;

type Headers = Record<string, string>;

function withCors(headers: Headers, cors: Headers): Headers {
  return { ...headers, ...cors };
}

function json(body: unknown, cors: Headers, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCors({ 'content-type': 'application/json' }, cors),
  });
}

function corsFor(request: Request, env: Env): Headers | null {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = env.APP_ORIGIN.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (!text || text.length > 8192) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function bearer(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() || null : null;
}

/** Validate the token with Supabase and return the user id. */
async function supabaseUser(token: string, env: Env): Promise<string | null> {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
    },
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: string };
  return user.id ?? null;
}

/** The user token is sent through so Supabase RLS limits the result. */
async function activeOrgId(token: string, userId: string, env: Env): Promise<string | null> {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/organization_members`);
  url.searchParams.set('select', 'organization_id');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('status', 'eq.active');
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
    },
  });
  if (!response.ok) return null;
  const rows = await response.json() as Array<{ organization_id?: string }>;
  return rows[0]?.organization_id ?? null;
}

function safeFileName(name: unknown): string {
  const value = typeof name === 'string' ? name : 'document';
  const cleaned = value
    .normalize('NFKD')
    .replace(/[\\/\u0000-\u001F\u007F]/g, '_')
    .replace(/\.\./g, '_')
    .trim();
  return (cleaned || 'document').slice(-180);
}

/** Database paths for R2 objects are prefixed so we can keep Supabase Storage for legacy rows. */
function objectKey(orgId: string, name: unknown): string {
  return `${R2_PREFIX}${orgId}/${Date.now()}-${safeFileName(name)}`;
}

function validateDownloadKey(key: string, orgId: string): boolean {
  if (!key.startsWith(R2_PREFIX)) return false;
  const inner = key.slice(R2_PREFIX.length);
  if (!inner.startsWith(`${orgId}/`)) return false;
  if (inner.includes('..') || inner.includes('\u0000')) return false;
  return true;
}

function endpoint(env: Env, key: string): URL {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${encoded}`);
}

async function presign(
  env: Env,
  key: string,
  method: 'PUT' | 'GET',
  contentType: string | undefined,
  ttl: number,
): Promise<{ url: string; headers: Headers }> {
  const url = endpoint(env, key);
  url.searchParams.set('X-Amz-Expires', String(ttl));

  const headers: Headers = {};
  if (method === 'PUT' && contentType) headers['content-type'] = contentType;

  const signer = new AwsV4Signer({
    method,
    url: url.toString(),
    headers,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
    signQuery: true,
  });
  const signed = await signer.sign();
  return { url: signed.url.toString(), headers };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsFor(request, env);
    if (!cors) return new Response('Forbidden', { status: 403 });

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, cors, 405);
    }

    try {
      const token = bearer(request);
      if (!token) return json({ error: 'Session manquante' }, cors, 401);

      const userId = await supabaseUser(token, env);
      if (!userId) return json({ error: 'Session invalide' }, cors, 401);

      const orgId = await activeOrgId(token, userId, env);
      if (!orgId) return json({ error: 'Aucune organisation active' }, cors, 403);

      const body = await readBody(request);
      if (!body) return json({ error: 'Requête invalide' }, cors, 400);

      const path = new URL(request.url).pathname;

      if (path === '/upload-url') {
        const size = Number(body.size ?? 0);
        if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) {
          return json({ error: 'Taille de fichier invalide (max 50 Mo)' }, cors, 400);
        }
        const contentType = typeof body.contentType === 'string'
          ? body.contentType.slice(0, 120)
          : 'application/octet-stream';
        const key = objectKey(orgId, body.name);
        const signed = await presign(env, key, 'PUT', contentType, UPLOAD_TTL);
        return json({ key, ...signed }, cors);
      }

      if (path === '/download-url') {
        const key = typeof body.key === 'string' ? body.key : '';
        if (!validateDownloadKey(key, orgId)) {
          return json({ error: 'Accès refusé' }, cors, 403);
        }
        const signed = await presign(env, key, 'GET', undefined, DOWNLOAD_TTL);
        return json({ url: signed.url }, cors);
      }

      return json({ error: 'Not found' }, cors, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      return json({ error: message }, cors, 500);
    }
  },
};
