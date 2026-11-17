-- Date officielle du concours national : 2026-12-23 (J-37 au 2026-11-16).
-- Idempotent : met à jour la cible globale si elle existe déjà (cas d'un environnement où
-- 20261116121000_exam_objective.sql a été appliqué avec la date provisoire), la crée sinon.
--
-- Ce que cette migration ne fait pas :
--   - elle ne touche pas aux cibles par parcours/faculté (elles restent plus précises si l'équipe
--     en ajoute) ;
--   - elle ne réécrit pas `user_objectives.exam_date` : une date personnelle saisie par un élève
--     reste prioritaire sur la cible globale, par conception.
--
-- À appliquer après 20261116121000_exam_objective.sql.

do $do$
declare v_id uuid;
begin
  select id into v_id from public.exam_targets where track is null and faculty is null;

  if v_id is null then
    insert into public.exam_targets (track, faculty, label, exam_date, is_confirmed, source)
    values (null, null, 'Concours national de résidanat', date '2026-12-23', true,
            'Date officielle confirmée le 2026-11-16');
  else
    update public.exam_targets
       set label = 'Concours national de résidanat',
           exam_date = date '2026-12-23',
           is_confirmed = true,
           source = 'Date officielle confirmée le 2026-11-16',
           updated_at = now()
     where id = v_id;
  end if;
end $do$;

comment on table public.exam_targets is
  'Dates de concours par parcours/faculté (NULL = tous). Cible globale confirmée : 2026-12-23.';
