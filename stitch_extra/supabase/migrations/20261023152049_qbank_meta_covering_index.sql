create index if not exists qbank_meta_cover_idx on public.qbank (id) include (sn, p, f, fr_n, fr_l, hc);
analyze public.qbank;
