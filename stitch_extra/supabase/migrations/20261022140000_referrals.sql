-- Parrainage : 3 amis inscrits via ton lien ET actifs (au moins 5 questions répondues) = 1 mois d'accès offert (30 jours).
-- Maximum 1 mois offert par compte (3 amis). Un ami ne peut être parrainé qu'une fois, et seulement dans les 7 jours qui suivent son inscription.
-- La récompense est une ligne de access_grants (plan 'custom', note 'parrainage') : elle s'ajoute à la fin de l'accès en cours (essai ou abonnement).
-- Additif : ne supprime aucune donnée. À exécuter UNE fois.

create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9]{8}$')
);
alter table public.referral_codes enable row level security;
revoke all on table public.referral_codes from public, anon, authenticated;

create table if not exists public.referrals (
  id bigint generated always as identity primary key,
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  reward_grant_id bigint references public.access_grants(id) on delete set null,
  check (referrer_id <> referred_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);
alter table public.referrals enable row level security;
revoke all on table public.referrals from public, anon, authenticated;

-- Réglages
create or replace function public.referral_needed() returns int language sql immutable set search_path = '' as $$ select 3 $$;      -- amis actifs par mois offert
create or replace function public.referral_max_rewards() returns int language sql immutable set search_path = '' as $$ select 1 $$;  -- mois offerts maximum par compte
create or replace function public.referral_min_answers() returns int language sql immutable set search_path = '' as $$ select 5 $$; -- questions répondues pour qu'un ami compte
revoke all on function public.referral_needed(), public.referral_max_rewards(), public.referral_min_answers() from public, anon, authenticated;

-- Code de parrainage de l'utilisateur (créé à la demande)
create or replace function public.referral_code_for(u uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare c text; i int := 0;
begin
  select code into c from public.referral_codes where user_id = u;
  if c is not null then return c; end if;
  loop
    c := substr(md5(random()::text || clock_timestamp()::text || u::text), 1, 8);
    begin
      insert into public.referral_codes (user_id, code) values (u, c);
      return c;
    exception when unique_violation then
      select code into c from public.referral_codes where user_id = u;
      if c is not null then return c; end if;
      i := i + 1;
      if i > 10 then raise exception 'Impossible de générer un code'; end if;
    end;
  end loop;
end $$;
revoke all on function public.referral_code_for(uuid) from public, anon, authenticated;

-- Récompense : par tranche de 3 amis qualifiés non encore récompensés -> 30 jours offerts
create or replace function public.referral_reward(p_referrer uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ids bigint[]; s timestamptz; e timestamptz; gid bigint; trial_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('referral:' || p_referrer::text));
  loop
    exit when (select count(distinct reward_grant_id) from public.referrals where referrer_id = p_referrer and reward_grant_id is not null) >= public.referral_max_rewards();
    select array_agg(id) into ids from (
      select id from public.referrals
      where referrer_id = p_referrer and qualified_at is not null and reward_grant_id is null
      order by qualified_at, id limit public.referral_needed()
    ) t;
    exit when ids is null or array_length(ids, 1) < public.referral_needed();
    select created_at + interval '7 days' into trial_end from auth.users where id = p_referrer;
    s := greatest(now(), coalesce((select max(ends_at) from public.access_grants where user_id = p_referrer and ends_at > now()), now()), coalesce(trial_end, now()));
    e := s + interval '30 days';
    insert into public.access_grants (user_id, plan, starts_at, ends_at, amount_dt, note)
      values (p_referrer, 'custom', s, e, null, 'parrainage : 3 amis actifs') returning id into gid;
    update public.referrals set reward_grant_id = gid where id = any(ids);
  end loop;
end $$;
revoke all on function public.referral_reward(uuid) from public, anon, authenticated;

-- Un ami devient « actif » quand il a répondu à assez de questions distinctes (le compte doit donc avoir un e-mail confirmé)
create or replace function public.referral_on_answer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.referrals%rowtype;
begin
  select * into r from public.referrals where referred_id = new.user_id and qualified_at is null;
  if not found then return new; end if;
  if (select count(*) from public.user_answered where user_id = new.user_id) >= public.referral_min_answers() then
    update public.referrals set qualified_at = now() where id = r.id and qualified_at is null;
    perform public.referral_reward(r.referrer_id);
  end if;
  return new;
end $$;
revoke all on function public.referral_on_answer() from public, anon, authenticated;
drop trigger if exists referral_on_answer_trg on public.user_answered;
create trigger referral_on_answer_trg after insert on public.user_answered for each row execute function public.referral_on_answer();

-- L'ami rattache son compte à celui qui l'a invité (code passé dans le lien, mémorisé à l'inscription)
create or replace function public.claim_referral(p_code text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); c text; ref uuid; created timestamptz; meta text;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if exists (select 1 from public.referrals where referred_id = u) then return jsonb_build_object('status', 'already'); end if;
  select created_at, raw_user_meta_data->>'ref' into created, meta from auth.users where id = u;
  if created is null or created + interval '7 days' < now() then return jsonb_build_object('status', 'too_late'); end if;
  c := lower(trim(coalesce(nullif(trim(p_code), ''), meta, '')));
  if c !~ '^[a-z0-9]{8}$' then return jsonb_build_object('status', 'invalid'); end if;
  select user_id into ref from public.referral_codes where code = c;
  if ref is null then return jsonb_build_object('status', 'invalid'); end if;
  if ref = u then return jsonb_build_object('status', 'self'); end if;
  insert into public.referrals (referrer_id, referred_id) values (ref, u) on conflict (referred_id) do nothing;
  -- déjà assez actif ? (compte qui a répondu avant d'avoir réclamé)
  if (select count(*) from public.user_answered where user_id = u) >= public.referral_min_answers() then
    update public.referrals set qualified_at = now() where referred_id = u and qualified_at is null;
    perform public.referral_reward(ref);
  end if;
  return jsonb_build_object('status', 'ok');
end $$;
revoke all on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- État du parrainage de l'élève connecté
create or replace function public.my_referral() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); code text; friends jsonb; qn int; rw int; unrewarded int;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  code := public.referral_code_for(u);
  select coalesce(jsonb_agg(jsonb_build_object('username', coalesce(p.username, 'ami'), 'active', r.qualified_at is not null, 'at', r.created_at) order by r.created_at), '[]'::jsonb)
    into friends from public.referrals r left join public.profiles p on p.id = r.referred_id where r.referrer_id = u;
  select count(*) into qn from public.referrals where referrer_id = u and qualified_at is not null;
  select count(distinct reward_grant_id) into rw from public.referrals where referrer_id = u and reward_grant_id is not null;
  select count(*) into unrewarded from public.referrals where referrer_id = u and qualified_at is not null and reward_grant_id is null;
  return jsonb_build_object(
    'code', code,
    'needed', public.referral_needed(),
    'min_answers', public.referral_min_answers(),
    'max_rewards', public.referral_max_rewards(),
    'rewards', rw,
    'active_total', qn,
    'progress', case when rw >= public.referral_max_rewards() then public.referral_needed() else unrewarded end,
    'friends', friends
  );
end $$;
revoke all on function public.my_referral() from public, anon;
grant execute on function public.my_referral() to authenticated;
