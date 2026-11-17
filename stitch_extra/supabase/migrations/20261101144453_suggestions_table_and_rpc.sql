create table if not exists public.suggestions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'autre',
  body text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);
alter table public.suggestions enable row level security;
revoke all on public.suggestions from anon, authenticated;

create or replace function public.send_suggestion(p_cat text, p_body text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare u uuid := auth.uid(); b text := trim(coalesce(p_body, '')); c text := lower(trim(coalesce(p_cat, '')));
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if char_length(b) < 5 then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  if c not in ('questions','fonctionnalite','bug','cours','autre') then c := 'autre'; end if;
  if (select count(*) from public.suggestions where user_id = u and created_at > now() - interval '1 day') >= 5 then
    raise exception 'TOO_MANY' using errcode = 'P0001';
  end if;
  insert into public.suggestions (user_id, category, body) values (u, c, left(b, 1000));
  return jsonb_build_object('status', 'ok');
end $$;
revoke all on function public.send_suggestion(text, text) from public, anon;
grant execute on function public.send_suggestion(text, text) to authenticated;
