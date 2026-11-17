-- Banque de questions privée : aucun accès direct, tout passe par des fonctions RPC authentifiées avec quota.
-- Quota : 1000 questions distinctes par jour et par utilisateur (jour calculé à l'heure de Tunis).
create table if not exists public.qbank (
  id text primary key,
  sn int,
  p boolean not null default true,
  f text,
  fr_n int,
  fr_l int,
  hc boolean not null default false,
  tg text,
  tp text,
  sp text,
  ob text,
  cp0 text,
  cp1 int,
  pub jsonb not null,
  sec jsonb not null,
  search_text text not null default ''
);
create index if not exists qbank_sn_idx on public.qbank (sn);
alter table public.qbank enable row level security;
revoke all on table public.qbank from public, anon, authenticated;

create table if not exists public.question_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  qid text not null,
  primary key (user_id, day, qid)
);
alter table public.question_views enable row level security;
revoke all on table public.question_views from public, anon, authenticated;

create table if not exists public.user_answered (
  user_id uuid not null references auth.users(id) on delete cascade,
  qid text not null,
  first_at timestamptz not null default now(),
  primary key (user_id, qid)
);
alter table public.user_answered enable row level security;
revoke all on table public.user_answered from public, anon, authenticated;

-- Helpers internes (non exposés)
create or replace function public.qb_daily_limit() returns int
language sql immutable set search_path = '' as $$ select 1000 $$;

create or replace function public.qb_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Africa/Tunis')::date $$;

create or replace function public.qb_norm(t text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(string_agg(distinct ch, '' order by ch), '')
  from regexp_split_to_table(upper(coalesce(t, '')), '') as ch
  where ch ~ '^[A-E]$'
$$;

create or replace function public.qb_uid() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users where id = u and email_confirmed_at is not null) then
    raise exception 'EMAIL_NOT_CONFIRMED' using errcode = 'P0001';
  end if;
  return u;
end $$;

-- Enregistre les questions servies aujourd'hui et applique le quota (questions distinctes par jour)
create or replace function public.qb_serve(u uuid, ids text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare d date := public.qb_today(); cur int; newn int;
begin
  perform pg_advisory_xact_lock(hashtext(u::text));
  delete from public.question_views where user_id = u and day < d - 2;
  select count(*) into cur from public.question_views where user_id = u and day = d;
  select count(*) into newn from (select distinct x from unnest(ids) as x) s
   where exists (select 1 from public.qbank b where b.id = s.x)
     and not exists (select 1 from public.question_views v where v.user_id = u and v.day = d and v.qid = s.x);
  if cur + newn > public.qb_daily_limit() then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  insert into public.question_views (user_id, day, qid)
  select u, d, b.id from public.qbank b where b.id = any(ids)
  on conflict do nothing;
end $$;

revoke all on function public.qb_daily_limit() from public, anon, authenticated;
revoke all on function public.qb_today() from public, anon, authenticated;
revoke all on function public.qb_norm(text) from public, anon, authenticated;
revoke all on function public.qb_uid() from public, anon, authenticated;
revoke all on function public.qb_serve(uuid, text[]) from public, anon, authenticated;

-- 1) Questions par lot (sans réponse). p_reveal : inclut la correction seulement pour les questions déjà répondues.
create or replace function public.get_questions(p_ids text[], p_reveal boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.qb_uid();
begin
  if p_ids is null or cardinality(p_ids) = 0 then return '[]'::jsonb; end if;
  if cardinality(p_ids) > 150 then raise exception 'TOO_MANY' using errcode = 'P0001'; end if;
  perform public.qb_serve(u, p_ids);
  return coalesce((
    select jsonb_agg(
      case when p_reveal and exists (select 1 from public.user_answered a where a.user_id = u and a.qid = b.id)
           then b.pub || b.sec else b.pub end
      order by array_position(p_ids, b.id))
    from public.qbank b where b.id = any(p_ids)
  ), '[]'::jsonb);
end $$;

-- 2) Correction côté serveur : items = [{"i":"Q00001","c":"ACD"}]
create or replace function public.check_answers(p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.qb_uid(); d date := public.qb_today(); res jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 150 then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as t(i text, c text)
    where not exists (select 1 from public.question_views v where v.user_id = u and v.day >= d - 1 and v.qid = t.i)
  ) then
    raise exception 'NOT_SERVED' using errcode = 'P0001';
  end if;
  insert into public.user_answered (user_id, qid)
  select distinct u, b.id from jsonb_to_recordset(p_items) as t(i text, c text) join public.qbank b on b.id = t.i
  on conflict do nothing;
  select coalesce(jsonb_agg(jsonb_build_object('i', b.id, 'ok', public.qb_norm(t.c) = public.qb_norm(b.sec->>'c'), 'sec', b.sec)), '[]'::jsonb)
    into res
  from jsonb_to_recordset(p_items) as t(i text, c text) join public.qbank b on b.id = t.i;
  return res;
end $$;

-- 3) Métadonnées sans texte : [id, cours, jouable, drapeau, fréq., niveau de chute, a un lien de cours]
create or replace function public.question_meta() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.qb_uid();
begin
  return coalesce((select jsonb_agg(jsonb_build_array(id, sn, case when p then 1 else 0 end, f, fr_n, fr_l, case when hc then 1 else 0 end) order by id) from public.qbank), '[]'::jsonb);
end $$;

-- 4) Recherche plein texte côté serveur (30 résultats max, comptés dans le quota)
create or replace function public.search_questions(p_words text[], p_sns int[] default null, p_limit int default 30) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.qb_uid(); ids text[]; pats text[];
begin
  if p_words is null or cardinality(p_words) = 0 or cardinality(p_words) > 6 then return '[]'::jsonb; end if;
  select array_agg('%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%') into pats
    from unnest(p_words) as w where length(w) >= 2;
  if pats is null then return '[]'::jsonb; end if;
  select array_agg(id) into ids from (
    select b.id from public.qbank b
    where b.p and coalesce(b.f, '') <> 'x'
      and (p_sns is null or b.sn = any(p_sns))
      and b.search_text like all (pats)
    order by b.id
    limit least(greatest(coalesce(p_limit, 30), 1), 30)
  ) s;
  if ids is null then return '[]'::jsonb; end if;
  perform public.qb_serve(u, ids);
  return coalesce((select jsonb_agg(b.pub || b.sec order by array_position(ids, b.id)) from public.qbank b where b.id = any(ids)), '[]'::jsonb);
end $$;

-- 5) Carnet de pièges d'un cours (dédoublonné, compté dans le quota)
create or replace function public.notes_for_subject(p_sn int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.qb_uid(); ids text[];
begin
  select array_agg(id) into ids from (
    select distinct on (coalesce(b.sec->>'pg', '') || '|' || coalesce(b.sec->>'mn', '')) b.id
    from public.qbank b
    where b.sn = p_sn and (b.sec ? 'pg' or b.sec ? 'mn')
    order by coalesce(b.sec->>'pg', '') || '|' || coalesce(b.sec->>'mn', ''), b.fr_n desc nulls last, b.id
  ) s;
  if ids is null then return '[]'::jsonb; end if;
  if cardinality(ids) > 150 then ids := ids[1:150]; end if;
  perform public.qb_serve(u, ids);
  return coalesce((
    select jsonb_agg(jsonb_build_object('i', b.id, 'q', left(b.pub->>'q', 111), 'fr', b.pub->'fr', 'pg', b.sec->'pg', 'mn', b.sec->'mn', 'cs', b.sec->'cs') order by b.id)
    from public.qbank b where b.id = any(ids)
  ), '[]'::jsonb);
end $$;

-- 6) Questions semblables (identifiants seulement), même barème que l'ancien code client
create or replace function public.similar_questions(p_wrong text[], p_exclude text[] default '{}', p_max int default 20) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.qb_uid();
begin
  if p_wrong is null or cardinality(p_wrong) = 0 then return '[]'::jsonb; end if;
  if cardinality(p_wrong) > 150 then p_wrong := p_wrong[1:150]; end if;
  return coalesce((
    select jsonb_agg(id order by sc desc, id) from (
      select pr.id, sum(pr.s) as sc from (
        select e.id,
          (case when coalesce(w.ob, '') <> '' and e.ob = w.ob then 3 else 0 end)
          + (case when coalesce(w.tg, '') <> '' and e.tg = w.tg and e.tp = w.tp then 2
                  when coalesce(w.tg, '') <> '' and e.tg = w.tg then 1 else 0 end)
          + (case when w.cp0 is not null and e.cp0 = w.cp0 and e.cp1 is not null and w.cp1 is not null and abs(e.cp1 - w.cp1) <= 1 then 2 else 0 end) as s
        from public.qbank w
        join public.qbank e on e.sn = w.sn and e.p and coalesce(e.f, '') <> 'x'
        where w.id = any(p_wrong) and not (e.id = any(coalesce(p_exclude, '{}')))
      ) pr
      where pr.s >= 3
      group by pr.id
      order by sum(pr.s) desc, pr.id
      limit least(greatest(coalesce(p_max, 20), 0), 60)
    ) t
  ), '[]'::jsonb);
end $$;

revoke all on function public.get_questions(text[], boolean) from public, anon;
revoke all on function public.check_answers(jsonb) from public, anon;
revoke all on function public.question_meta() from public, anon;
revoke all on function public.search_questions(text[], int[], int) from public, anon;
revoke all on function public.notes_for_subject(int) from public, anon;
revoke all on function public.similar_questions(text[], text[], int) from public, anon;
grant execute on function public.get_questions(text[], boolean) to authenticated;
grant execute on function public.check_answers(jsonb) to authenticated;
grant execute on function public.question_meta() to authenticated;
grant execute on function public.search_questions(text[], int[], int) to authenticated;
grant execute on function public.notes_for_subject(int) to authenticated;
grant execute on function public.similar_questions(text[], text[], int) to authenticated;
