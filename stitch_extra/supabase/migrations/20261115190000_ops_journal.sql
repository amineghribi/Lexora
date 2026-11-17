-- Chantier 7 : journal inter-sessions (qui a fait quoi, décisions, points ouverts).
-- Schéma `ops` hors API publique : ni anon ni authenticated n'y ont accès, RLS activée.
-- Les sessions y lisent et écrivent via execute_sql (rôle postgres). Voir docs/JOURNAL.md.
create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

create table if not exists ops.journal (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  session    text not null check (length(session) between 1 and 40),
  kind       text not null check (kind in ('done','decision','warning','todo','handoff')),
  area       text not null check (length(area) between 1 and 40),
  summary    text not null check (length(summary) between 1 and 600),
  refs       text check (refs is null or length(refs) <= 200),
  closed_at  timestamptz
);
create index if not exists journal_open_idx on ops.journal (closed_at, id desc);
alter table ops.journal enable row level security;
revoke all on ops.journal from public, anon, authenticated;
revoke all on all sequences in schema ops from public, anon, authenticated;
comment on table ops.journal is 'Journal inter-sessions. Oriente, ne prouve rien : vérifier dans le dépôt ou la base avant d''agir. Jamais de secret.';
