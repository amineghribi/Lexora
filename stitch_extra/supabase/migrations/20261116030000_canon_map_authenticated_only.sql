-- canon_map n'est plus appelable sans connexion (elle donnait la table copie -> question canonique à n'importe qui).
-- L'application charge désormais l'index après la connexion (App.jsx). À appliquer APRÈS le déploiement de ce changement.
revoke execute on function public.canon_map() from public, anon;
grant execute on function public.canon_map() to authenticated;
