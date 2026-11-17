-- 1) Signalements d'erreur dans une question (bouton « Signaler une erreur » de la correction).
create table if not exists public.question_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  qid text not null,
  note text not null check (char_length(note) between 3 and 500),
  status text not null default 'new' check (status in ('new','done','rejected')),
  created_at timestamptz not null default now()
);
create index if not exists question_reports_status_idx on public.question_reports (status, created_at desc);
alter table public.question_reports enable row level security;
revoke all on table public.question_reports from public, anon, authenticated;

create or replace function public.report_question(p_qid text, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); q text := trim(coalesce(p_qid, '')); n text := trim(coalesce(p_note, ''));
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if q !~ '^Q[0-9]{5}$' or not exists (select 1 from public.qbank b where b.id = q) then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  if char_length(n) < 3 then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  if (select count(*) from public.question_reports where user_id = u and created_at > now() - interval '1 day') >= 20 then
    raise exception 'TOO_MANY' using errcode = 'P0001';
  end if;
  insert into public.question_reports (user_id, qid, note) values (u, coalesce((select canon from public.qbank where id = q), q), left(n, 500));
  return jsonb_build_object('status', 'ok');
end $$;
revoke all on function public.report_question(text, text) from public, anon;
grant execute on function public.report_question(text, text) to authenticated;

-- 2) Annonces de l'équipe dans la cloche
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['new_post','reply','group_invite','group_join','group_note','announce']));
