# Note de version — console d'accès et fonctions d'administration

**Date** : 17 novembre 2026 · **Portée** : base Supabase `wraxarmiohrhrlzlpqyy`, console
`Gestion des accès` de l'application.

## Corrections apportées

| Élément livré initialement | Réalité du schéma | Correction |
|---|---|---|
| `insert into public.access` | la table n'existe pas | lecture et écriture dans `access_grants` (84 lignes en production) |
| `profiles.role = 'admin'` | `profiles` n'a pas de colonne `role` | garde sur `account_roles(user_id, role)` |
| plan `'Accès complet'` | contrainte `plan ∈ (month, semester, custom, founder, dcem3)` | plan validé et transmis par l'appelant |
| périmètre `'all'` | contrainte `scope ∈ (residanat, dcem1, dcem2, dcem3s1, dcem3)` | périmètre validé et transmis par l'appelant |
| `role = 'admin'` impossible | `account_roles_role_check` n'autorisait que `'teacher'` | contrainte élargie à `('teacher','admin')` |

Compléments appliqués aux écrans : la boîte des suggestions filtre sur `category` (colonne réelle)
et construit ses onglets depuis les valeurs présentes ; la console d'accès déduit l'état d'un
compte de `ends_at` (actif, échéance passée, sans accès) et envoie `plan` et `scope`.

## Fonction RPC

```sql
public.admin_set_access(
  p_user  uuid,
  p_status text,                    -- 'paid' | 'closed'
  p_until timestamptz default null, -- requis si 'paid'
  p_plan  text default 'month',     -- month | semester | custom | founder | dcem3
  p_scope text default 'residanat'  -- residanat | dcem1 | dcem2 | dcem3s1 | dcem3
) returns jsonb
```

- `'paid'` insère un octroi dans `access_grants` (`starts_at = now()`, `credited = false`).
- `'closed'` ramène à `now()` l'échéance des octrois encore ouverts du compte et retourne leur nombre.
- Codes d'erreur : `ADMIN_REQUIRED` (42501), `BAD_STATUS`, `BAD_UNTIL`, `BAD_PLAN`, `BAD_SCOPE` (22023).

**Sécurité** : `security definer`, `search_path = public` figé, exécution révoquée à `public` et
`anon`, accordée à `authenticated` uniquement. La garde exige
`exists(select 1 from account_roles where user_id = auth.uid() and role = 'admin')`.

## Ajouter un administrateur

```sql
-- 1. nommer l'admin (username à confirmer côté candidat)
insert into public.account_roles (user_id, role, granted_at)
select p.id, 'admin', now()
  from public.profiles p
 where p.username = 'NOM_DU_COMPTE'
on conflict (user_id) do update set role = 'admin';

-- 2. vérifier
select p.username, r.role from public.account_roles r
  join public.profiles p on p.id = r.user_id;
```

Retirer un droit : `update public.account_roles set role = 'teacher' where user_id = '…';`
Le compte doit se reconnecter pour que son jeton porte le nouveau rôle.

**État actuel : aucun compte admin.** La console affichera donc « aucun compte ne porte le rôle
admin » et refusera les écritures tant que l'étape 1 n'est pas faite.

## Vérifications effectuées

Appel sans jeton → `ADMIN_REQUIRED` ; appel avec un compte `teacher` → `ADMIN_REQUIRED` ; rôle
`admin` simulé dans une transaction annulée → écriture acceptée (`+1` octroi) puis rollback.
État final : 84 octrois, 1 rôle `teacher`, 0 admin — aucune donnée de production modifiée.
