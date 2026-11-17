# Lexora R2 signer

Cloudflare Worker that issues short-lived presigned URLs for Cloudflare R2.
The R2 secret key never reaches the browser. Supabase remains the metadata
store and the source of truth for organisation membership.

## 1. Create the bucket

In Cloudflare: **R2 → Create bucket** → name it `documents`.

Add a CORS rule on the bucket (R2 → bucket → Settings → CORS):

- Allowed origins: your app origins (`http://localhost:5173`, `https://lexora.vercel.app`)
- Allowed methods: `GET`, `PUT`
- Allowed headers: `content-type`, `x-amz-*`

## 2. Create an R2 API token

**R2 → Manage R2 API tokens → Create API token** with *Object Read & Write*
on the `documents` bucket. Copy the Account ID, Access Key ID and Secret
Access Key.

## 3. Configure the Worker

Edit `worker/wrangler.toml`:

- `R2_ACCOUNT_ID` → your Cloudflare account ID
- `APP_ORIGIN` → comma-separated app origins (no trailing slash)

Set the secrets (never commit them):

```bash
npx wrangler secret put R2_ACCESS_KEY_ID --config worker/wrangler.toml
npx wrangler secret put R2_SECRET_ACCESS_KEY --config worker/wrangler.toml
```

Deploy:

```bash
npm run worker:deploy
```

For local testing: `npm run worker:dev`.

## 4. Point the app at the Worker

Add `R2_SIGNER_URL` (the Worker URL) to `.env.local` and to Vercel
(**Project → Settings → Environment Variables**, no `VITE_` prefix), then
redeploy the frontend. Vite injects it as `import.meta.env.VITE_R2_SIGNER_URL`.

Until this variable is set, the app keeps using the legacy private Supabase
Storage bucket.

## 5. Migrate existing files

```bash
node scripts/backfill-r2.mjs --dry-run
node scripts/backfill-r2.mjs
```

It needs `SUPABASE_SECRET_KEY` (service role) plus the R2 variables in
`.env.local`. Each object is copied to R2 and its `documents.storage_path`
is rewritten to `r2/<orgId>/<file>`. Add `--delete-source` to remove the
original from Supabase Storage after a successful copy.

## Security notes

- Every request carries the Supabase access token; the Worker validates it
  with `/auth/v1/user` and resolves the active organisation through RLS.
- Download keys are checked against the caller's organisation prefix.
- Presigned URLs expire after 15 min (upload) / 60 s (download).
