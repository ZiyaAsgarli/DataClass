-- ISOLATED POC FIXTURE ONLY. DO NOT APPLY TO PRODUCTION.
-- This file proves application-owned, transaction-local actor context for one
-- read-only operation. It does not alter auth.uid() or pg_session_jwt.

BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'dataclass_gateway_poc_owner') THEN
    CREATE ROLE dataclass_gateway_poc_owner
      NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'dataclass_gateway_poc') THEN
    CREATE ROLE dataclass_gateway_poc
      LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$roles$;

DO $owner_membership$
BEGIN
  EXECUTE pg_catalog.format(
    'GRANT dataclass_gateway_poc_owner TO %I',
    current_user
  );
END
$owner_membership$;

CREATE SCHEMA app_private AUTHORIZATION dataclass_gateway_poc_owner;
CREATE SCHEMA app_poc AUTHORIZATION dataclass_gateway_poc_owner;

REVOKE ALL ON SCHEMA app_private, app_poc FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE USAGE ON SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private, app_poc TO dataclass_gateway_poc;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL
);

CREATE TABLE public.classes (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  description text,
  status text NOT NULL CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.class_members (
  class_id uuid NOT NULL REFERENCES public.classes(id),
  student_id uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL CHECK (status IN ('active', 'completed', 'removed')),
  PRIMARY KEY (class_id, student_id)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_members FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.profiles, public.classes, public.class_members FROM PUBLIC;

CREATE FUNCTION app_private.current_actor_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog
AS $function$
DECLARE
  actor_setting text;
BEGIN
  IF session_user <> 'dataclass_gateway_poc' THEN
    RETURN NULL;
  END IF;

  actor_setting := current_setting('app.verified_actor_id', true);
  IF actor_setting IS NULL OR btrim(actor_setting) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN actor_setting::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
END
$function$;

ALTER FUNCTION app_private.current_actor_id() OWNER TO dataclass_gateway_poc_owner;
REVOKE ALL ON FUNCTION app_private.current_actor_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.current_actor_id() TO dataclass_gateway_poc;

GRANT USAGE ON SCHEMA public TO dataclass_gateway_poc_owner;
GRANT SELECT ON public.classes, public.class_members, public.profiles
  TO dataclass_gateway_poc_owner;

CREATE POLICY app_poc_owner_read_classes
  ON public.classes
  FOR SELECT
  TO dataclass_gateway_poc_owner
  USING (true);

CREATE POLICY app_poc_owner_read_class_members
  ON public.class_members
  FOR SELECT
  TO dataclass_gateway_poc_owner
  USING (true);

CREATE POLICY app_poc_owner_read_profiles
  ON public.profiles
  FOR SELECT
  TO dataclass_gateway_poc_owner
  USING (true);

CREATE FUNCTION app_poc.list_my_student_classes()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  status text,
  owner_name text,
  student_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    class_record.id,
    class_record.name,
    class_record.description,
    class_record.status,
    owner_profile.full_name,
    (
      SELECT count(*)
      FROM public.class_members AS other_member
      WHERE other_member.class_id = class_record.id
        AND other_member.status IN ('active', 'completed')
    ),
    class_record.created_at,
    class_record.updated_at
  FROM public.class_members AS membership
  JOIN public.classes AS class_record ON class_record.id = membership.class_id
  JOIN public.profiles AS owner_profile ON owner_profile.id = class_record.teacher_id
  WHERE membership.student_id = app_private.current_actor_id()
    AND membership.status IN ('active', 'completed')
  ORDER BY class_record.updated_at DESC;
$function$;

ALTER FUNCTION app_poc.list_my_student_classes() OWNER TO dataclass_gateway_poc_owner;
REVOKE ALL ON FUNCTION app_poc.list_my_student_classes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_poc.list_my_student_classes() TO dataclass_gateway_poc;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM dataclass_gateway_poc;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM dataclass_gateway_poc;

DO $database_grant$
BEGIN
  EXECUTE pg_catalog.format(
    'REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC',
    current_database()
  );
  EXECUTE pg_catalog.format(
    'REVOKE ALL ON DATABASE %I FROM dataclass_gateway_poc',
    current_database()
  );
  EXECUTE pg_catalog.format(
    'GRANT CONNECT ON DATABASE %I TO dataclass_gateway_poc',
    current_database()
  );
END
$database_grant$;

DO $least_privilege_assertions$
BEGIN
  IF has_database_privilege('dataclass_gateway_poc', current_database(), 'TEMP')
    OR has_schema_privilege('dataclass_gateway_poc', 'public', 'CREATE')
    OR has_schema_privilege('dataclass_gateway_poc', 'public', 'USAGE')
    OR has_table_privilege('dataclass_gateway_poc', 'public.classes', 'SELECT')
  THEN
    RAISE EXCEPTION 'PoC backend login is not least-privileged';
  END IF;
END
$least_privilege_assertions$;

DO $drop_owner_membership$
BEGIN
  EXECUTE pg_catalog.format(
    'REVOKE dataclass_gateway_poc_owner FROM %I',
    current_user
  );
END
$drop_owner_membership$;

COMMIT;
