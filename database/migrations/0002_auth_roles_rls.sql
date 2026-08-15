BEGIN;

CREATE OR REPLACE FUNCTION public.bootstrap_current_user()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  avatar_url text,
  roles text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  auth_name text;
  auth_email text;
  auth_avatar_url text;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    NULLIF(btrim(auth_user.name), ''),
    lower(btrim(auth_user.email)),
    NULLIF(btrim(auth_user.image), '')
  INTO auth_name, auth_email, auth_avatar_url
  FROM neon_auth."user" AS auth_user
  WHERE auth_user.id = current_user_id;

  IF NOT FOUND OR auth_email IS NULL OR auth_email = '' THEN
    RAISE EXCEPTION 'Authenticated user identity is unavailable'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.profiles AS profile (
    id,
    full_name,
    email,
    avatar_url
  )
  VALUES (
    current_user_id,
    COALESCE(auth_name, NULLIF(split_part(auth_email, '@', 1), ''), 'Student'),
    auth_email,
    auth_avatar_url
  )
  ON CONFLICT ON CONSTRAINT profiles_pkey DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    avatar_url = EXCLUDED.avatar_url
  WHERE
    profile.full_name IS DISTINCT FROM EXCLUDED.full_name
    OR profile.email IS DISTINCT FROM EXCLUDED.email
    OR profile.avatar_url IS DISTINCT FROM EXCLUDED.avatar_url;

  INSERT INTO public.user_roles (user_id, role)
  SELECT current_user_id, 'student'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_roles AS existing_role
    WHERE existing_role.user_id = current_user_id
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN QUERY
  SELECT
    profile.id,
    profile.full_name,
    profile.email,
    profile.avatar_url,
    COALESCE(
      array_agg(user_role.role ORDER BY user_role.role)
        FILTER (WHERE user_role.role IS NOT NULL),
      ARRAY[]::text[]
    ) AS roles
  FROM public.profiles AS profile
  LEFT JOIN public.user_roles AS user_role
    ON user_role.user_id = profile.id
  WHERE profile.id = current_user_id
  GROUP BY profile.id, profile.full_name, profile.email, profile.avatar_url;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_current_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_current_user() FROM anonymous;
GRANT EXECUTE ON FUNCTION public.bootstrap_current_user() TO authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.profiles, public.user_roles TO authenticated;

REVOKE ALL ON public.profiles, public.user_roles FROM anonymous;

CREATE POLICY profiles_read_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY user_roles_read_own
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

COMMIT;
