create table if not exists public.qbank_merge_log (
  id text primary key,
  grp text not null,
  k text,
  sn int,
  f_before text,
  canon text,
  reason text not null,
  comment text,
  created_at timestamptz not null default now()
);
alter table public.qbank_merge_log enable row level security;
revoke all on public.qbank_merge_log from anon, authenticated;

with n as (
  select id, sn, f, public.qb_norm(sec->>'c') k,
    translate(regexp_replace(translate(lower(coalesce(pub->>'q','') || '|' || coalesce((select string_agg(value, '|' order by key) from jsonb_each_text(coalesce(pub->'o','{}'::jsonb))),'')),
      'àâäáãçéèêëíìîïñóòôöõúùûüýÿœæ', 'aaaaaceeeeiiiinooooouuuuyyoa'), '[^a-z0-9]+', '', 'g'), 'l1', 'ii') t
  from public.qbank),
g as (select md5(t) h from n group by md5(t), t having length(t) >= 60 and count(*) > 1 and (count(distinct k) > 1 or count(distinct sn) > 1))
insert into public.qbank_merge_log (id, grp, k, sn, f_before, reason)
select n.id, md5(n.t), n.k, n.sn, n.f,
  case when (select count(distinct k) from n n2 where md5(n2.t) = md5(n.t)) > 1 then 'key_conflict' else 'subject_conflict' end
from n where md5(n.t) in (select h from g)
on conflict (id) do nothing;
