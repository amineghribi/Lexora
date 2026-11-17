create index if not exists qbank_canon_diff_idx on public.qbank (id, canon) where canon <> id;
analyze public.qbank;
