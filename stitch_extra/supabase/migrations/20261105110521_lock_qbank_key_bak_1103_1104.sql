alter table public.qbank_key_bak_1103 enable row level security;
alter table public.qbank_key_bak_1104 enable row level security;
revoke all on public.qbank_key_bak_1103 from anon, authenticated;
revoke all on public.qbank_key_bak_1104 from anon, authenticated;
