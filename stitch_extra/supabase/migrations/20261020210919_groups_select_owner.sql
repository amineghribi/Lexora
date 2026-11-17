alter policy "see my groups" on public.study_groups using (owner_id = (select auth.uid()) or public.is_group_invited(id));
