/**
 * Copy documents from the private Supabase Storage bucket to Cloudflare R2
 * and rewrite their storage_path in Postgres. Safe to re-run: rows already
 * starting with `r2/` are skipped.
 *
 * Usage:
 *   node scripts/backfill-r2.mjs [--dry-run] [--delete-source]
 *
 * Requires (local .env.local works):
 *   SUPABASE_URL, SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY),
 *   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { AwsV4Signer } from 'aws4fetch';

// Node does not load .env.local automatically.
const envFile = path.resolve('.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

const required = [
  'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'R2_ACCOUNT_ID',
  'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY',
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY;
}

const dryRun = process.argv.includes('--dry-run');
const deleteSource = process.argv.includes('--delete-source');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function presignedPut(key, contentType) {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  const url = new URL(
    `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}/${encoded}`,
  );
  url.searchParams.set('X-Amz-Expires', '3600');
  const signer = new AwsV4Signer({
    method: 'PUT',
    url: url.toString(),
    headers: { 'content-type': contentType },
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
    signQuery: true,
  });
  const signed = await signer.sign();
  return { url: signed.url.toString(), headers: signed.headers };
}

const { data: rows, error } = await supabase
  .from('documents')
  .select('id, storage_path, name, mime_type')
  .not('storage_path', 'like', 'r2/%')
  .order('created_at', { ascending: true });

if (error) {
  console.error('Could not list documents:', error.message);
  process.exit(1);
}

console.log(`${rows.length} document(s) to migrate${dryRun ? ' (dry run)' : ''}.`);
let ok = 0;
let failed = 0;

for (const row of rows) {
  const source = row.storage_path;
  const key = `r2/${source}`;
  try {
    if (dryRun) {
      console.log(`[dry-run] ${source} -> ${key}`);
      ok += 1;
      continue;
    }

    const { data: blob, error: downloadError } = await supabase.storage.from('documents').download(source);
    if (downloadError || !blob) throw downloadError ?? new Error('No file returned');

    const contentType = row.mime_type || blob.type || 'application/octet-stream';
    const signed = await presignedPut(key, contentType);
    const uploaded = await fetch(signed.url, {
      method: 'PUT',
      headers: Object.fromEntries(signed.headers),
      body: Buffer.from(await blob.arrayBuffer()),
    });
    if (!uploaded.ok) throw new Error(`R2 returned ${uploaded.status}`);

    const { error: updateError } = await supabase
      .from('documents')
      .update({ storage_path: key })
      .eq('id', row.id);
    if (updateError) throw updateError;

    if (deleteSource) {
      await supabase.storage.from('documents').remove([source]);
    }
    console.log(`OK ${source} -> ${key}`);
    ok += 1;
  } catch (err) {
    console.error(`FAIL ${source}: ${err.message}`);
    failed += 1;
  }
}

console.log(`Done. ${ok} succeeded, ${failed} failed.`);
process.exit(failed ? 1 : 0);
