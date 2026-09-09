-- STAGED AUTH GATEWAY IDENTITY MIGRATION ONLY. DO NOT APPLY TO PRODUCTION.
-- Generated from the final active definitions in migrations 0001 through 0010.
-- Browser and Worker operation names/signatures remain unchanged; only the SQL schema changes.

BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'dataclass_gateway_owner') THEN
    CREATE ROLE dataclass_gateway_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'dataclass_gateway') THEN
    CREATE ROLE dataclass_gateway LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
END
$roles$;
DO $owner_membership$
BEGIN
  EXECUTE pg_catalog.format('GRANT dataclass_gateway_owner TO %I', current_user);
END
$owner_membership$;
CREATE SCHEMA IF NOT EXISTS app_private AUTHORIZATION dataclass_gateway_owner;
CREATE SCHEMA IF NOT EXISTS app_gateway AUTHORIZATION dataclass_gateway_owner;
ALTER SCHEMA app_private OWNER TO dataclass_gateway_owner;
ALTER SCHEMA app_gateway OWNER TO dataclass_gateway_owner;
REVOKE ALL ON SCHEMA app_private, app_gateway FROM PUBLIC, anonymous, authenticated;
GRANT USAGE ON SCHEMA app_private, app_gateway TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_private.current_actor_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog
AS $function$
DECLARE
  actor_setting text;
BEGIN
  IF session_user <> 'dataclass_gateway' THEN
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
ALTER FUNCTION app_private.current_actor_id() OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_private.current_actor_id() FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_private.current_actor_id() TO dataclass_gateway;

GRANT USAGE ON SCHEMA public, neon_auth TO dataclass_gateway_owner;
GRANT SELECT ON public.profiles, public.user_roles, public.classes, public.class_members, public.class_invitations, public.class_teachers, public.modules, public.module_teachers, public.lessons, public.lesson_resources, public.assignments, public.assignment_resources, public.submissions, public.submission_files, public.submission_feedback TO dataclass_gateway_owner;
GRANT SELECT ON neon_auth."user" TO dataclass_gateway_owner;
GRANT INSERT, UPDATE ON public.profiles TO dataclass_gateway_owner;
GRANT INSERT ON public.user_roles TO dataclass_gateway_owner;
GRANT INSERT, UPDATE ON public.classes TO dataclass_gateway_owner;
GRANT INSERT, UPDATE ON public.class_members TO dataclass_gateway_owner;
GRANT INSERT, UPDATE ON public.class_invitations TO dataclass_gateway_owner;
GRANT INSERT, DELETE ON public.class_teachers TO dataclass_gateway_owner;
GRANT INSERT, UPDATE ON public.modules TO dataclass_gateway_owner;
GRANT INSERT, DELETE ON public.module_teachers TO dataclass_gateway_owner;
GRANT INSERT, UPDATE ON public.lessons TO dataclass_gateway_owner;
GRANT INSERT, UPDATE, DELETE ON public.lesson_resources TO dataclass_gateway_owner;
GRANT INSERT, UPDATE ON public.assignments TO dataclass_gateway_owner;
GRANT INSERT, UPDATE, DELETE ON public.assignment_resources TO dataclass_gateway_owner;
GRANT INSERT, UPDATE ON public.submissions TO dataclass_gateway_owner;
GRANT INSERT, UPDATE ON public.submission_files TO dataclass_gateway_owner;
GRANT INSERT, UPDATE ON public.submission_feedback TO dataclass_gateway_owner;

CREATE OR REPLACE FUNCTION app_private.is_class_owner(target_class_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.classes AS class_record
    WHERE class_record.id = target_class_id
      AND class_record.teacher_id = app_private.current_actor_id()
  );
$function$;
ALTER FUNCTION app_private.is_class_owner(target_class_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_private.is_class_owner(target_class_id uuid) FROM PUBLIC, anonymous, authenticated, dataclass_gateway;

CREATE OR REPLACE FUNCTION app_private.is_class_teacher(target_class_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_teachers AS class_teacher
    WHERE class_teacher.class_id = target_class_id
      AND class_teacher.teacher_id = app_private.current_actor_id()
  );
$function$;
ALTER FUNCTION app_private.is_class_teacher(target_class_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_private.is_class_teacher(target_class_id uuid) FROM PUBLIC, anonymous, authenticated, dataclass_gateway;

CREATE OR REPLACE FUNCTION app_private.is_class_member(target_class_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_members AS class_member
    WHERE class_member.class_id = target_class_id
      AND class_member.student_id = app_private.current_actor_id()
      AND class_member.status IN ('active', 'completed')
  );
$function$;
ALTER FUNCTION app_private.is_class_member(target_class_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_private.is_class_member(target_class_id uuid) FROM PUBLIC, anonymous, authenticated, dataclass_gateway;

CREATE OR REPLACE FUNCTION app_private.is_module_instructor(target_module_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.module_teachers AS module_teacher
    WHERE module_teacher.module_id = target_module_id
      AND module_teacher.teacher_id = app_private.current_actor_id()
  );
$function$;
ALTER FUNCTION app_private.is_module_instructor(target_module_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_private.is_module_instructor(target_module_id uuid) FROM PUBLIC, anonymous, authenticated, dataclass_gateway;

CREATE OR REPLACE FUNCTION app_private.can_manage_module(target_module_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.modules AS module_record
    WHERE module_record.id = target_module_id
      AND (
        app_private.is_class_owner(module_record.class_id)
        OR app_private.is_module_instructor(module_record.id)
      )
  );
$function$;
ALTER FUNCTION app_private.can_manage_module(target_module_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_private.can_manage_module(target_module_id uuid) FROM PUBLIC, anonymous, authenticated, dataclass_gateway;

CREATE OR REPLACE FUNCTION app_private.can_read_module(target_module_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.modules AS module_record
    WHERE module_record.id = target_module_id
      AND (
        app_private.is_class_teacher(module_record.class_id)
        OR (
          app_private.is_class_member(module_record.class_id)
          AND module_record.status IN ('active', 'completed')
        )
      )
  );
$function$;
ALTER FUNCTION app_private.can_read_module(target_module_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_private.can_read_module(target_module_id uuid) FROM PUBLIC, anonymous, authenticated, dataclass_gateway;

CREATE OR REPLACE FUNCTION app_private.can_read_lesson(target_lesson_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.lessons AS lesson
    JOIN public.modules AS module_record ON module_record.id = lesson.module_id
    WHERE lesson.id = target_lesson_id
      AND (
        app_private.is_class_teacher(module_record.class_id)
        OR (
          app_private.is_class_member(module_record.class_id)
          AND module_record.status IN ('active', 'completed')
          AND lesson.status = 'published'
        )
      )
  );
$function$;
ALTER FUNCTION app_private.can_read_lesson(target_lesson_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_private.can_read_lesson(target_lesson_id uuid) FROM PUBLIC, anonymous, authenticated, dataclass_gateway;

CREATE OR REPLACE FUNCTION app_private.can_manage_assignment(target_assignment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignments AS assignment
    JOIN public.classes AS class_record ON class_record.id = assignment.class_id
    LEFT JOIN public.lessons AS lesson ON lesson.id = assignment.lesson_id
    WHERE assignment.id = target_assignment_id
      AND app_private.current_actor_id() IS NOT NULL
      AND (
        class_record.teacher_id = app_private.current_actor_id()
        OR (lesson.id IS NOT NULL AND app_private.can_manage_module(lesson.module_id))
      )
  );
$function$;
ALTER FUNCTION app_private.can_manage_assignment(target_assignment_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_private.can_manage_assignment(target_assignment_id uuid) FROM PUBLIC, anonymous, authenticated, dataclass_gateway;

CREATE OR REPLACE FUNCTION app_private.youtube_video_identity(input_url text)
 RETURNS TABLE(video_id text, canonical_url text)
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  normalized_url text := btrim(input_url);
  url_match text[];
  query_match text[];
  query_string text;
  extracted_id text;
BEGIN
  IF normalized_url IS NULL OR normalized_url = '' THEN
    RAISE EXCEPTION 'A YouTube video URL is required' USING ERRCODE = '22023';
  END IF;

  IF normalized_url ~* '^https://(www\.|m\.)?youtube\.com/watch\?[^#]+(#.*)?$' THEN
    query_string := split_part(split_part(normalized_url, '?', 2), '#', 1);
    query_match := regexp_match(query_string, '(^|&)v=([A-Za-z0-9_-]{11})(&|$)', 'i');
    IF query_match IS NOT NULL THEN
      extracted_id := query_match[2];
    END IF;
  ELSE
    url_match := regexp_match(
      normalized_url,
      '^https://youtu\.be/([A-Za-z0-9_-]{11})([?&#].*)?$',
      'i'
    );
    IF url_match IS NOT NULL THEN
      extracted_id := url_match[1];
    ELSE
      url_match := regexp_match(
        normalized_url,
        '^https://(www\.|m\.)?youtube\.com/shorts/([A-Za-z0-9_-]{11})([?&#].*)?$',
        'i'
      );
      IF url_match IS NOT NULL THEN
        extracted_id := url_match[2];
      END IF;
    END IF;
  END IF;

  IF extracted_id IS NULL THEN
    RAISE EXCEPTION 'Enter a valid YouTube video URL' USING ERRCODE = '22023';
  END IF;

  video_id := extracted_id;
  canonical_url := 'https://www.youtube.com/watch?v=' || extracted_id;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION app_private.youtube_video_identity(input_url text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_private.youtube_video_identity(input_url text) FROM PUBLIC, anonymous, authenticated, dataclass_gateway;

CREATE OR REPLACE FUNCTION app_private.private_file_extension(file_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT lower(substring(file_name FROM '\.([^.]+)$'));
$function$;
ALTER FUNCTION app_private.private_file_extension(file_name text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_private.private_file_extension(file_name text) FROM PUBLIC, anonymous, authenticated, dataclass_gateway;

CREATE OR REPLACE FUNCTION app_private.is_supported_private_file_kind(file_kind text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT lower(btrim(file_kind)) IN (
    'xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'pdf', 'pbix', 'pbit',
    'sql', 'ipynb', 'py', 'txt', 'json', 'parquet', 'zip', 'docx', 'pptx'
  );
$function$;
ALTER FUNCTION app_private.is_supported_private_file_kind(file_kind text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_private.is_supported_private_file_kind(file_kind text) FROM PUBLIC, anonymous, authenticated, dataclass_gateway;

CREATE OR REPLACE FUNCTION app_private.safe_private_file_name(file_name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  normalized text := btrim(file_name);
BEGIN
  IF normalized = '' OR char_length(normalized) > 180
     OR normalized ~ '[/\\]' OR normalized ~ '[[:cntrl:]]'
     OR position('..' IN normalized) > 0 OR left(normalized, 1) = '.' THEN
    RAISE EXCEPTION 'File name is invalid' USING ERRCODE = '22023';
  END IF;
  RETURN regexp_replace(normalized, '[^A-Za-z0-9._-]+', '_', 'g');
END;
$function$;
ALTER FUNCTION app_private.safe_private_file_name(file_name text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_private.safe_private_file_name(file_name text) FROM PUBLIC, anonymous, authenticated, dataclass_gateway;

-- The nine legacy policy predicates are mapped here as audited migration contracts.
-- They cannot be installed for the capability owner: their SECURITY DEFINER helper calls
-- would re-enter RLS under a non-table-owner and recurse. The nonrecursive capability policies
-- below preserve the legacy definer execution model while every function retains its actor guard.
DROP POLICY IF EXISTS app_gateway_profiles_read_own ON public.profiles;
-- profiles.profiles_read_own: USING ((SELECT app_private.current_actor_id()) = id)
DROP POLICY IF EXISTS app_gateway_user_roles_read_own ON public.user_roles;
-- user_roles.user_roles_read_own: USING ((SELECT app_private.current_actor_id()) = user_id)
DROP POLICY IF EXISTS app_gateway_classes_read_authorized ON public.classes;
-- classes.classes_read_authorized: USING (app_private.is_class_teacher(id) OR app_private.is_class_member(id))
DROP POLICY IF EXISTS app_gateway_class_members_read_authorized ON public.class_members;
-- class_members.class_members_read_authorized: USING (student_id = (SELECT app_private.current_actor_id()) OR app_private.is_class_teacher(class_id))
DROP POLICY IF EXISTS app_gateway_class_invitations_read_owner ON public.class_invitations;
-- class_invitations.class_invitations_read_owner: USING (app_private.is_class_owner(class_id))
DROP POLICY IF EXISTS app_gateway_class_teachers_read_authorized ON public.class_teachers;
-- class_teachers.class_teachers_read_authorized: USING (app_private.is_class_teacher(class_id) OR app_private.is_class_member(class_id))
DROP POLICY IF EXISTS app_gateway_modules_read_authorized ON public.modules;
-- modules.modules_read_authorized: USING (app_private.can_read_module(id))
DROP POLICY IF EXISTS app_gateway_lessons_read_authorized ON public.lessons;
-- lessons.lessons_read_authorized: USING (app_private.can_read_lesson(id))
DROP POLICY IF EXISTS app_gateway_module_teachers_read_authorized ON public.module_teachers;
-- module_teachers.module_teachers_read_authorized: USING (app_private.can_read_module(module_id))

-- Capability policies preserve existing SECURITY DEFINER behavior. The LOGIN has no table privileges;
-- every exposed function retains its original actor authorization and the capability owner is not a table owner.
DROP POLICY IF EXISTS app_gateway_capability_profiles ON public.profiles;
CREATE POLICY app_gateway_capability_profiles ON public.profiles FOR ALL TO dataclass_gateway_owner USING (session_user = 'dataclass_gateway') WITH CHECK (session_user = 'dataclass_gateway');
DROP POLICY IF EXISTS app_gateway_capability_user_roles ON public.user_roles;
CREATE POLICY app_gateway_capability_user_roles ON public.user_roles FOR ALL TO dataclass_gateway_owner USING (session_user = 'dataclass_gateway') WITH CHECK (session_user = 'dataclass_gateway');
DROP POLICY IF EXISTS app_gateway_capability_classes ON public.classes;
CREATE POLICY app_gateway_capability_classes ON public.classes FOR ALL TO dataclass_gateway_owner USING (session_user = 'dataclass_gateway') WITH CHECK (session_user = 'dataclass_gateway');
DROP POLICY IF EXISTS app_gateway_capability_class_members ON public.class_members;
CREATE POLICY app_gateway_capability_class_members ON public.class_members FOR ALL TO dataclass_gateway_owner USING (session_user = 'dataclass_gateway') WITH CHECK (session_user = 'dataclass_gateway');
DROP POLICY IF EXISTS app_gateway_capability_class_invitations ON public.class_invitations;
CREATE POLICY app_gateway_capability_class_invitations ON public.class_invitations FOR ALL TO dataclass_gateway_owner USING (session_user = 'dataclass_gateway') WITH CHECK (session_user = 'dataclass_gateway');
DROP POLICY IF EXISTS app_gateway_capability_class_teachers ON public.class_teachers;
CREATE POLICY app_gateway_capability_class_teachers ON public.class_teachers FOR ALL TO dataclass_gateway_owner USING (session_user = 'dataclass_gateway') WITH CHECK (session_user = 'dataclass_gateway');
DROP POLICY IF EXISTS app_gateway_capability_modules ON public.modules;
CREATE POLICY app_gateway_capability_modules ON public.modules FOR ALL TO dataclass_gateway_owner USING (session_user = 'dataclass_gateway') WITH CHECK (session_user = 'dataclass_gateway');
DROP POLICY IF EXISTS app_gateway_capability_module_teachers ON public.module_teachers;
CREATE POLICY app_gateway_capability_module_teachers ON public.module_teachers FOR ALL TO dataclass_gateway_owner USING (session_user = 'dataclass_gateway') WITH CHECK (session_user = 'dataclass_gateway');
DROP POLICY IF EXISTS app_gateway_capability_lessons ON public.lessons;
CREATE POLICY app_gateway_capability_lessons ON public.lessons FOR ALL TO dataclass_gateway_owner USING (session_user = 'dataclass_gateway') WITH CHECK (session_user = 'dataclass_gateway');
DROP POLICY IF EXISTS app_gateway_capability_lesson_resources ON public.lesson_resources;
CREATE POLICY app_gateway_capability_lesson_resources ON public.lesson_resources FOR ALL TO dataclass_gateway_owner USING (session_user = 'dataclass_gateway') WITH CHECK (session_user = 'dataclass_gateway');
DROP POLICY IF EXISTS app_gateway_capability_assignments ON public.assignments;
CREATE POLICY app_gateway_capability_assignments ON public.assignments FOR ALL TO dataclass_gateway_owner USING (session_user = 'dataclass_gateway') WITH CHECK (session_user = 'dataclass_gateway');
DROP POLICY IF EXISTS app_gateway_capability_assignment_resources ON public.assignment_resources;
CREATE POLICY app_gateway_capability_assignment_resources ON public.assignment_resources FOR ALL TO dataclass_gateway_owner USING (session_user = 'dataclass_gateway') WITH CHECK (session_user = 'dataclass_gateway');
DROP POLICY IF EXISTS app_gateway_capability_submissions ON public.submissions;
CREATE POLICY app_gateway_capability_submissions ON public.submissions FOR ALL TO dataclass_gateway_owner USING (session_user = 'dataclass_gateway') WITH CHECK (session_user = 'dataclass_gateway');
DROP POLICY IF EXISTS app_gateway_capability_submission_files ON public.submission_files;
CREATE POLICY app_gateway_capability_submission_files ON public.submission_files FOR ALL TO dataclass_gateway_owner USING (session_user = 'dataclass_gateway') WITH CHECK (session_user = 'dataclass_gateway');
DROP POLICY IF EXISTS app_gateway_capability_submission_feedback ON public.submission_feedback;
CREATE POLICY app_gateway_capability_submission_feedback ON public.submission_feedback FOR ALL TO dataclass_gateway_owner USING (session_user = 'dataclass_gateway') WITH CHECK (session_user = 'dataclass_gateway');

CREATE OR REPLACE FUNCTION app_gateway.list_my_teacher_classes()
 RETURNS TABLE(id uuid, name text, description text, status text, teacher_role text, student_count bigint, instructor_count bigint, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT class_record.id, class_record.name, class_record.description,
    class_record.status, class_teacher.role,
    (SELECT count(*) FROM public.class_members AS member
      WHERE member.class_id = class_record.id AND member.status IN ('active', 'completed')),
    (SELECT count(*) FROM public.class_teachers AS teacher
      WHERE teacher.class_id = class_record.id),
    class_record.created_at, class_record.updated_at
  FROM public.classes AS class_record
  JOIN public.class_teachers AS class_teacher
    ON class_teacher.class_id = class_record.id
  WHERE class_teacher.teacher_id = app_private.current_actor_id()
  ORDER BY class_record.updated_at DESC;
$function$;
ALTER FUNCTION app_gateway.list_my_teacher_classes() OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.list_my_teacher_classes() FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.list_my_teacher_classes() TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.list_my_student_classes()
 RETURNS TABLE(id uuid, name text, description text, status text, owner_name text, student_count bigint, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT class_record.id, class_record.name, class_record.description,
    class_record.status, owner_profile.full_name,
    (SELECT count(*) FROM public.class_members AS other_member
      WHERE other_member.class_id = class_record.id
        AND other_member.status IN ('active', 'completed')),
    class_record.created_at, class_record.updated_at
  FROM public.class_members AS membership
  JOIN public.classes AS class_record ON class_record.id = membership.class_id
  JOIN public.profiles AS owner_profile ON owner_profile.id = class_record.teacher_id
  WHERE membership.student_id = app_private.current_actor_id()
    AND membership.status IN ('active', 'completed')
  ORDER BY class_record.updated_at DESC;
$function$;
ALTER FUNCTION app_gateway.list_my_student_classes() OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.list_my_student_classes() FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.list_my_student_classes() TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_class_overview(target_class_id uuid)
 RETURNS TABLE(id uuid, name text, description text, status text, owner_id uuid, owner_name text, owner_email text, current_access text, student_count bigint, instructor_count bigint, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT (
    app_private.is_class_teacher(target_class_id)
    OR app_private.is_class_member(target_class_id)
  ) THEN
    RAISE EXCEPTION 'Class not found or access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT class_record.id, class_record.name, class_record.description,
    class_record.status, owner_profile.id, owner_profile.full_name,
    owner_profile.email,
    CASE
      WHEN class_record.teacher_id = app_private.current_actor_id() THEN 'owner'
      WHEN app_private.is_class_teacher(class_record.id) THEN 'instructor'
      ELSE 'student'
    END,
    (SELECT count(*) FROM public.class_members AS member
      WHERE member.class_id = class_record.id AND member.status IN ('active', 'completed')),
    (SELECT count(*) FROM public.class_teachers AS teacher
      WHERE teacher.class_id = class_record.id),
    class_record.created_at, class_record.updated_at
  FROM public.classes AS class_record
  JOIN public.profiles AS owner_profile ON owner_profile.id = class_record.teacher_id
  WHERE class_record.id = target_class_id;
END;
$function$;
ALTER FUNCTION app_gateway.get_class_overview(target_class_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_class_overview(target_class_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_class_overview(target_class_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_class_students(target_class_id uuid)
 RETURNS TABLE(membership_id uuid, student_id uuid, full_name text, email text, membership_status text, joined_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT app_private.is_class_teacher(target_class_id) THEN
    RAISE EXCEPTION 'Teacher access is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT member.id, member.student_id, profile.full_name, profile.email,
    member.status, member.joined_at
  FROM public.class_members AS member
  JOIN public.profiles AS profile ON profile.id = member.student_id
  WHERE member.class_id = target_class_id
    AND member.status <> 'removed'
  ORDER BY profile.full_name, profile.email;
END;
$function$;
ALTER FUNCTION app_gateway.get_class_students(target_class_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_class_students(target_class_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_class_students(target_class_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_class_invitations(target_class_id uuid)
 RETURNS TABLE(id uuid, email text, status text, created_at timestamp with time zone, accepted_at timestamp with time zone, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT app_private.is_class_owner(target_class_id) THEN
    RAISE EXCEPTION 'Only the class owner may view invitations'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT invitation.id, invitation.email, invitation.status,
    invitation.created_at, invitation.accepted_at, invitation.expires_at
  FROM public.class_invitations AS invitation
  WHERE invitation.class_id = target_class_id
  ORDER BY invitation.created_at DESC;
END;
$function$;
ALTER FUNCTION app_gateway.get_class_invitations(target_class_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_class_invitations(target_class_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_class_invitations(target_class_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_class_instructors(target_class_id uuid)
 RETURNS TABLE(relationship_id uuid, teacher_id uuid, full_name text, email text, avatar_url text, teacher_role text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT (
    app_private.is_class_teacher(target_class_id)
    OR app_private.is_class_member(target_class_id)
  ) THEN
    RAISE EXCEPTION 'Class not found or access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT class_teacher.id, class_teacher.teacher_id, profile.full_name,
    CASE WHEN app_private.is_class_teacher(target_class_id) THEN profile.email ELSE NULL END,
    profile.avatar_url, class_teacher.role,
    class_teacher.created_at
  FROM public.class_teachers AS class_teacher
  JOIN public.profiles AS profile ON profile.id = class_teacher.teacher_id
  WHERE class_teacher.class_id = target_class_id
  ORDER BY CASE class_teacher.role WHEN 'owner' THEN 0 ELSE 1 END,
    profile.full_name;
END;
$function$;
ALTER FUNCTION app_gateway.get_class_instructors(target_class_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_class_instructors(target_class_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_class_instructors(target_class_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_my_student_class_overview(target_class_id uuid)
 RETURNS TABLE(id uuid, name text, description text, status text, owner_id uuid, owner_name text, owner_email text, current_access text, student_count bigint, instructor_count bigint, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT app_private.is_class_member(target_class_id) THEN
    RAISE EXCEPTION 'Class not found or membership required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT class_record.id, class_record.name, class_record.description,
    class_record.status, owner_profile.id, owner_profile.full_name,
    NULL::text, 'student'::text,
    (SELECT count(*) FROM public.class_members AS member
      WHERE member.class_id = class_record.id AND member.status IN ('active', 'completed')),
    (SELECT count(*) FROM public.class_teachers AS teacher
      WHERE teacher.class_id = class_record.id),
    class_record.created_at, class_record.updated_at
  FROM public.classes AS class_record
  JOIN public.profiles AS owner_profile ON owner_profile.id = class_record.teacher_id
  WHERE class_record.id = target_class_id;
END;
$function$;
ALTER FUNCTION app_gateway.get_my_student_class_overview(target_class_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_my_student_class_overview(target_class_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_my_student_class_overview(target_class_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_my_student_class_instructors(target_class_id uuid)
 RETURNS TABLE(relationship_id uuid, teacher_id uuid, full_name text, email text, avatar_url text, teacher_role text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT app_private.is_class_member(target_class_id) THEN
    RAISE EXCEPTION 'Class not found or membership required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT class_teacher.id, class_teacher.teacher_id, profile.full_name,
    NULL::text, profile.avatar_url, class_teacher.role, class_teacher.created_at
  FROM public.class_teachers AS class_teacher
  JOIN public.profiles AS profile ON profile.id = class_teacher.teacher_id
  WHERE class_teacher.class_id = target_class_id
  ORDER BY CASE class_teacher.role WHEN 'owner' THEN 0 ELSE 1 END,
    profile.full_name;
END;
$function$;
ALTER FUNCTION app_gateway.get_my_student_class_instructors(target_class_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_my_student_class_instructors(target_class_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_my_student_class_instructors(target_class_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.list_teacher_class_modules(target_class_id uuid)
 RETURNS TABLE(id uuid, class_id uuid, title text, description text, module_position integer, status text, lifecycle_status text, lesson_count bigint, published_lesson_count bigint, instructor_names text[], can_manage boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT app_private.is_class_teacher(target_class_id) THEN
    RAISE EXCEPTION 'Teacher access is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT module_record.id, module_record.class_id, module_record.title,
    module_record.description, module_record.position, module_record.status,
    module_record.lifecycle_status,
    (SELECT count(*) FROM public.lessons AS lesson WHERE lesson.module_id = module_record.id),
    (SELECT count(*) FROM public.lessons AS lesson
      WHERE lesson.module_id = module_record.id AND lesson.status = 'published'),
    COALESCE((
      SELECT array_agg(profile.full_name ORDER BY profile.full_name)
      FROM public.module_teachers AS module_teacher
      JOIN public.profiles AS profile ON profile.id = module_teacher.teacher_id
      WHERE module_teacher.module_id = module_record.id
    ), ARRAY[]::text[]),
    app_private.can_manage_module(module_record.id),
    module_record.created_at, module_record.updated_at
  FROM public.modules AS module_record
  WHERE module_record.class_id = target_class_id
  ORDER BY module_record.position, module_record.created_at;
END;
$function$;
ALTER FUNCTION app_gateway.list_teacher_class_modules(target_class_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.list_teacher_class_modules(target_class_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.list_teacher_class_modules(target_class_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_teacher_module(target_module_id uuid)
 RETURNS TABLE(id uuid, class_id uuid, class_name text, title text, description text, module_position integer, status text, lifecycle_status text, lesson_count bigint, published_lesson_count bigint, instructor_names text[], current_access text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_class_id uuid;
BEGIN
  SELECT module_record.class_id INTO target_class_id
  FROM public.modules AS module_record WHERE module_record.id = target_module_id;

  IF target_class_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.is_class_teacher(target_class_id) THEN
    RAISE EXCEPTION 'Module not found or teacher access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT module_record.id, module_record.class_id, class_record.name,
    module_record.title, module_record.description, module_record.position,
    module_record.status, module_record.lifecycle_status,
    (SELECT count(*) FROM public.lessons AS lesson WHERE lesson.module_id = module_record.id),
    (SELECT count(*) FROM public.lessons AS lesson
      WHERE lesson.module_id = module_record.id AND lesson.status = 'published'),
    COALESCE((
      SELECT array_agg(profile.full_name ORDER BY profile.full_name)
      FROM public.module_teachers AS module_teacher
      JOIN public.profiles AS profile ON profile.id = module_teacher.teacher_id
      WHERE module_teacher.module_id = module_record.id
    ), ARRAY[]::text[]),
    CASE
      WHEN app_private.is_class_owner(module_record.class_id) THEN 'owner'
      WHEN app_private.is_module_instructor(module_record.id) THEN 'module_instructor'
      ELSE 'viewer'
    END,
    module_record.created_at, module_record.updated_at
  FROM public.modules AS module_record
  JOIN public.classes AS class_record ON class_record.id = module_record.class_id
  WHERE module_record.id = target_module_id;
END;
$function$;
ALTER FUNCTION app_gateway.get_teacher_module(target_module_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_teacher_module(target_module_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_teacher_module(target_module_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.list_module_instructor_options(target_module_id uuid)
 RETURNS TABLE(teacher_id uuid, full_name text, class_role text, assigned boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_class_id uuid;
BEGIN
  SELECT module_record.class_id INTO target_class_id
  FROM public.modules AS module_record
  WHERE module_record.id = target_module_id;
  IF target_class_id IS NULL OR app_private.current_actor_id() IS NULL OR NOT app_private.is_class_owner(target_class_id) THEN
    RAISE EXCEPTION 'Only the class owner may manage module instructors'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT class_teacher.teacher_id, profile.full_name, class_teacher.role,
    EXISTS (
      SELECT 1 FROM public.module_teachers AS module_teacher
      WHERE module_teacher.module_id = target_module_id
        AND module_teacher.teacher_id = class_teacher.teacher_id
    )
  FROM public.class_teachers AS class_teacher
  JOIN public.profiles AS profile ON profile.id = class_teacher.teacher_id
  JOIN public.user_roles AS user_role
    ON user_role.user_id = class_teacher.teacher_id AND user_role.role = 'teacher'
  WHERE class_teacher.class_id = target_class_id
  ORDER BY CASE class_teacher.role WHEN 'owner' THEN 0 ELSE 1 END, profile.full_name;
END;
$function$;
ALTER FUNCTION app_gateway.list_module_instructor_options(target_module_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.list_module_instructor_options(target_module_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.list_module_instructor_options(target_module_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.list_teacher_module_lessons(target_module_id uuid)
 RETURNS TABLE(id uuid, module_id uuid, title text, description text, lesson_date date, lesson_position integer, status text, published_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_class_id uuid;
BEGIN
  SELECT module_record.class_id INTO target_class_id
  FROM public.modules AS module_record
  WHERE module_record.id = target_module_id;
  IF target_class_id IS NULL OR app_private.current_actor_id() IS NULL OR NOT app_private.is_class_teacher(target_class_id) THEN
    RAISE EXCEPTION 'Module not found or teacher access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT lesson.id, lesson.module_id, lesson.title, lesson.description,
    lesson.lesson_date, lesson.position, lesson.status, lesson.published_at,
    lesson.created_at, lesson.updated_at
  FROM public.lessons AS lesson
  WHERE lesson.module_id = target_module_id
  ORDER BY lesson.position, lesson.created_at;
END;
$function$;
ALTER FUNCTION app_gateway.list_teacher_module_lessons(target_module_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.list_teacher_module_lessons(target_module_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.list_teacher_module_lessons(target_module_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_teacher_lesson(target_lesson_id uuid)
 RETURNS TABLE(id uuid, module_id uuid, class_id uuid, class_name text, module_title text, title text, description text, lesson_date date, lesson_position integer, status text, published_at timestamp with time zone, current_access text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_class_id uuid;
BEGIN
  SELECT module_record.class_id INTO target_class_id
  FROM public.lessons AS lesson
  JOIN public.modules AS module_record ON module_record.id = lesson.module_id
  WHERE lesson.id = target_lesson_id;

  IF target_class_id IS NULL OR app_private.current_actor_id() IS NULL OR NOT app_private.is_class_teacher(target_class_id) THEN
    RAISE EXCEPTION 'Lesson not found or teacher access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT lesson.id, lesson.module_id, module_record.class_id, class_record.name,
    module_record.title, lesson.title, lesson.description, lesson.lesson_date,
    lesson.position, lesson.status, lesson.published_at,
    CASE
      WHEN app_private.is_class_owner(module_record.class_id) THEN 'owner'
      WHEN app_private.is_module_instructor(module_record.id) THEN 'module_instructor'
      ELSE 'viewer'
    END,
    lesson.created_at, lesson.updated_at
  FROM public.lessons AS lesson
  JOIN public.modules AS module_record ON module_record.id = lesson.module_id
  JOIN public.classes AS class_record ON class_record.id = module_record.class_id
  WHERE lesson.id = target_lesson_id;
END;
$function$;
ALTER FUNCTION app_gateway.get_teacher_lesson(target_lesson_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_teacher_lesson(target_lesson_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_teacher_lesson(target_lesson_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.list_student_class_modules(target_class_id uuid)
 RETURNS TABLE(id uuid, class_id uuid, title text, description text, module_position integer, status text, lifecycle_status text, published_lesson_count bigint, instructor_names text[], created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT app_private.is_class_member(target_class_id) THEN
    RAISE EXCEPTION 'Class membership is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT module_record.id, module_record.class_id, module_record.title,
    module_record.description, module_record.position, module_record.status,
    module_record.lifecycle_status,
    (SELECT count(*) FROM public.lessons AS lesson
      WHERE lesson.module_id = module_record.id AND lesson.status = 'published'),
    COALESCE((
      SELECT array_agg(profile.full_name ORDER BY profile.full_name)
      FROM public.module_teachers AS module_teacher
      JOIN public.profiles AS profile ON profile.id = module_teacher.teacher_id
      WHERE module_teacher.module_id = module_record.id
    ), ARRAY[]::text[]),
    module_record.created_at, module_record.updated_at
  FROM public.modules AS module_record
  WHERE module_record.class_id = target_class_id
    AND module_record.status IN ('active', 'completed')
  ORDER BY module_record.position, module_record.created_at;
END;
$function$;
ALTER FUNCTION app_gateway.list_student_class_modules(target_class_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.list_student_class_modules(target_class_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.list_student_class_modules(target_class_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_student_module(target_module_id uuid)
 RETURNS TABLE(id uuid, class_id uuid, class_name text, title text, description text, module_position integer, status text, lifecycle_status text, instructor_names text[], created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_class_id uuid;
  target_status text;
BEGIN
  SELECT module_record.class_id, module_record.status
  INTO target_class_id, target_status
  FROM public.modules AS module_record WHERE module_record.id = target_module_id;

  IF target_class_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.is_class_member(target_class_id)
     OR target_status NOT IN ('active', 'completed') THEN
    RAISE EXCEPTION 'Module not found or membership required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT module_record.id, module_record.class_id, class_record.name,
    module_record.title, module_record.description, module_record.position,
    module_record.status, module_record.lifecycle_status,
    COALESCE((
      SELECT array_agg(profile.full_name ORDER BY profile.full_name)
      FROM public.module_teachers AS module_teacher
      JOIN public.profiles AS profile ON profile.id = module_teacher.teacher_id
      WHERE module_teacher.module_id = module_record.id
    ), ARRAY[]::text[]),
    module_record.created_at, module_record.updated_at
  FROM public.modules AS module_record
  JOIN public.classes AS class_record ON class_record.id = module_record.class_id
  WHERE module_record.id = target_module_id;
END;
$function$;
ALTER FUNCTION app_gateway.get_student_module(target_module_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_student_module(target_module_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_student_module(target_module_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.list_student_module_lessons(target_module_id uuid)
 RETURNS TABLE(id uuid, module_id uuid, title text, description text, lesson_date date, lesson_position integer, status text, published_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_class_id uuid;
  target_status text;
BEGIN
  SELECT module_record.class_id, module_record.status
  INTO target_class_id, target_status
  FROM public.modules AS module_record
  WHERE module_record.id = target_module_id;

  IF target_class_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.is_class_member(target_class_id)
     OR target_status NOT IN ('active', 'completed') THEN
    RAISE EXCEPTION 'Module not found or membership required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT lesson.id, lesson.module_id, lesson.title, lesson.description,
    lesson.lesson_date, lesson.position, lesson.status, lesson.published_at,
    lesson.created_at, lesson.updated_at
  FROM public.lessons AS lesson
  WHERE lesson.module_id = target_module_id AND lesson.status = 'published'
  ORDER BY lesson.position, lesson.created_at;
END;
$function$;
ALTER FUNCTION app_gateway.list_student_module_lessons(target_module_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.list_student_module_lessons(target_module_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.list_student_module_lessons(target_module_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_student_lesson(target_lesson_id uuid)
 RETURNS TABLE(id uuid, module_id uuid, class_id uuid, class_name text, module_title text, title text, description text, lesson_date date, lesson_position integer, status text, published_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_class_id uuid;
  module_status text;
  target_lesson_status text;
BEGIN
  SELECT module_record.class_id, module_record.status, lesson.status
  INTO target_class_id, module_status, target_lesson_status
  FROM public.lessons AS lesson
  JOIN public.modules AS module_record ON module_record.id = lesson.module_id
  WHERE lesson.id = target_lesson_id;

  IF target_class_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.is_class_member(target_class_id)
     OR module_status NOT IN ('active', 'completed')
     OR target_lesson_status <> 'published' THEN
    RAISE EXCEPTION 'Lesson not found or membership required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT lesson.id, lesson.module_id, module_record.class_id, class_record.name,
    module_record.title, lesson.title, lesson.description, lesson.lesson_date,
    lesson.position, lesson.status, lesson.published_at, lesson.created_at,
    lesson.updated_at
  FROM public.lessons AS lesson
  JOIN public.modules AS module_record ON module_record.id = lesson.module_id
  JOIN public.classes AS class_record ON class_record.id = module_record.class_id
  WHERE lesson.id = target_lesson_id;
END;
$function$;
ALTER FUNCTION app_gateway.get_student_lesson(target_lesson_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_student_lesson(target_lesson_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_student_lesson(target_lesson_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_teacher_lesson_video(target_lesson_id uuid)
 RETURNS TABLE(video_provider text, video_id text, video_url text, video_duration_seconds integer, can_manage boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_module_id uuid;
  target_class_id uuid;
BEGIN
  SELECT lesson.module_id, module_record.class_id
  INTO target_module_id, target_class_id
  FROM public.lessons AS lesson
  JOIN public.modules AS module_record ON module_record.id = lesson.module_id
  WHERE lesson.id = target_lesson_id;

  IF target_module_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.is_class_teacher(target_class_id) THEN
    RAISE EXCEPTION 'Lesson not found or teacher access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT lesson.video_provider,
    CASE
      WHEN lesson.video_provider = 'youtube'
        THEN substring(lesson.video_url FROM 'v=([A-Za-z0-9_-]{11})$')
      ELSE NULL
    END,
    lesson.video_url,
    lesson.video_duration_seconds,
    app_private.can_manage_module(target_module_id)
  FROM public.lessons AS lesson
  WHERE lesson.id = target_lesson_id;
END;
$function$;
ALTER FUNCTION app_gateway.get_teacher_lesson_video(target_lesson_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_teacher_lesson_video(target_lesson_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_teacher_lesson_video(target_lesson_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_student_lesson_video(target_lesson_id uuid)
 RETURNS TABLE(video_provider text, video_id text, video_duration_seconds integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_class_id uuid;
  target_module_status text;
  target_lesson_status text;
BEGIN
  SELECT module_record.class_id, module_record.status, lesson.status
  INTO target_class_id, target_module_status, target_lesson_status
  FROM public.lessons AS lesson
  JOIN public.modules AS module_record ON module_record.id = lesson.module_id
  WHERE lesson.id = target_lesson_id;

  IF target_class_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.is_class_member(target_class_id)
     OR target_module_status NOT IN ('active', 'completed')
     OR target_lesson_status <> 'published' THEN
    RAISE EXCEPTION 'Lesson recording not found or membership required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT lesson.video_provider,
    CASE
      WHEN lesson.video_provider = 'youtube'
        THEN substring(lesson.video_url FROM 'v=([A-Za-z0-9_-]{11})$')
      ELSE NULL
    END,
    lesson.video_duration_seconds
  FROM public.lessons AS lesson
  WHERE lesson.id = target_lesson_id;
END;
$function$;
ALTER FUNCTION app_gateway.get_student_lesson_video(target_lesson_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_student_lesson_video(target_lesson_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_student_lesson_video(target_lesson_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.list_teacher_lesson_resources(target_lesson_id uuid)
 RETURNS TABLE(id uuid, title text, resource_kind text, file_name text, file_size_bytes bigint, mime_type text, resource_position integer, uploaded_at timestamp with time zone, can_manage boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_module_id uuid;
  target_class_id uuid;
BEGIN
  SELECT lesson.module_id, module_record.class_id
  INTO target_module_id, target_class_id
  FROM public.lessons AS lesson
  JOIN public.modules AS module_record ON module_record.id = lesson.module_id
  WHERE lesson.id = target_lesson_id;

  IF target_module_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.is_class_teacher(target_class_id) THEN
    RAISE EXCEPTION 'Lesson not found or teacher access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT resource.id, resource.title, resource.resource_kind,
    resource.file_name, resource.file_size_bytes, resource.mime_type,
    resource.position, resource.uploaded_at,
    app_private.can_manage_module(target_module_id)
  FROM public.lesson_resources AS resource
  WHERE resource.lesson_id = target_lesson_id
    AND resource.storage_provider = 'b2'
    AND resource.upload_status = 'ready'
  ORDER BY resource.position, resource.created_at;
END;
$function$;
ALTER FUNCTION app_gateway.list_teacher_lesson_resources(target_lesson_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.list_teacher_lesson_resources(target_lesson_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.list_teacher_lesson_resources(target_lesson_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.list_student_lesson_resources(target_lesson_id uuid)
 RETURNS TABLE(id uuid, title text, resource_kind text, file_name text, file_size_bytes bigint, mime_type text, resource_position integer, uploaded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_class_id uuid;
  target_module_status text;
  target_lesson_status text;
BEGIN
  SELECT module_record.class_id, module_record.status, lesson.status
  INTO target_class_id, target_module_status, target_lesson_status
  FROM public.lessons AS lesson
  JOIN public.modules AS module_record ON module_record.id = lesson.module_id
  WHERE lesson.id = target_lesson_id;

  IF target_class_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.is_class_member(target_class_id)
     OR target_module_status NOT IN ('active', 'completed')
     OR target_lesson_status <> 'published' THEN
    RAISE EXCEPTION 'Lesson resources not found or membership required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT resource.id, resource.title, resource.resource_kind,
    resource.file_name, resource.file_size_bytes, resource.mime_type,
    resource.position, resource.uploaded_at
  FROM public.lesson_resources AS resource
  WHERE resource.lesson_id = target_lesson_id
    AND resource.storage_provider = 'b2'
    AND resource.upload_status = 'ready'
  ORDER BY resource.position, resource.created_at;
END;
$function$;
ALTER FUNCTION app_gateway.list_student_lesson_resources(target_lesson_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.list_student_lesson_resources(target_lesson_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.list_student_lesson_resources(target_lesson_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.list_teacher_assignments()
 RETURNS TABLE(assignment_id uuid, class_id uuid, class_name text, lesson_id uuid, lesson_title text, title text, description text, status text, due_at timestamp with time zone, allow_late_submission boolean, published_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, total_students bigint, submitted_count bigint, reviewed_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT assignment.id, assignment.class_id, class_record.name,
    assignment.lesson_id, lesson.title, assignment.title, assignment.description,
    assignment.status, assignment.due_at, assignment.allow_late_submission,
    assignment.published_at, assignment.created_at, assignment.updated_at,
    count(DISTINCT member.student_id) FILTER (WHERE member.status = 'active'),
    count(DISTINCT submission.student_id) FILTER (
      WHERE submission.status IN ('submitted', 'late', 'revision_requested', 'resubmitted', 'reviewed')
    ),
    count(DISTINCT submission.student_id) FILTER (WHERE submission.status = 'reviewed')
  FROM public.assignments AS assignment
  JOIN public.classes AS class_record ON class_record.id = assignment.class_id
  LEFT JOIN public.lessons AS lesson ON lesson.id = assignment.lesson_id
  LEFT JOIN public.class_members AS member ON member.class_id = assignment.class_id
  LEFT JOIN public.submissions AS submission
    ON submission.assignment_id = assignment.id
   AND submission.student_id = member.student_id
   AND submission.status <> 'draft'
  WHERE app_private.current_actor_id() IS NOT NULL AND app_private.can_manage_assignment(assignment.id)
  GROUP BY assignment.id, class_record.name, lesson.title
  ORDER BY assignment.created_at DESC;
$function$;
ALTER FUNCTION app_gateway.list_teacher_assignments() OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.list_teacher_assignments() FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.list_teacher_assignments() TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.list_student_assignments()
 RETURNS TABLE(assignment_id uuid, class_id uuid, class_name text, lesson_id uuid, lesson_title text, title text, description text, status text, due_at timestamp with time zone, allow_late_submission boolean, published_at timestamp with time zone, submission_id uuid, submission_status text, submitted_at timestamp with time zone, reviewed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT assignment.id, assignment.class_id, class_record.name,
    assignment.lesson_id, lesson.title, assignment.title, assignment.description,
    assignment.status, assignment.due_at, assignment.allow_late_submission,
    assignment.published_at, submission.id, submission.status,
    submission.submitted_at, submission.reviewed_at
  FROM public.assignments AS assignment
  JOIN public.classes AS class_record ON class_record.id = assignment.class_id
  JOIN public.class_members AS member
    ON member.class_id = assignment.class_id
   AND member.student_id = app_private.current_actor_id()
   AND member.status = 'active'
  LEFT JOIN public.lessons AS lesson ON lesson.id = assignment.lesson_id
  LEFT JOIN public.submissions AS submission
    ON submission.assignment_id = assignment.id AND submission.student_id = app_private.current_actor_id()
  WHERE app_private.current_actor_id() IS NOT NULL AND assignment.status = 'published'
  ORDER BY assignment.due_at NULLS LAST, assignment.created_at DESC;
$function$;
ALTER FUNCTION app_gateway.list_student_assignments() OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.list_student_assignments() FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.list_student_assignments() TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_teacher_assignment(target_assignment_id uuid)
 RETURNS TABLE(assignment_id uuid, class_id uuid, class_name text, lesson_id uuid, lesson_title text, title text, description text, status text, due_at timestamp with time zone, allow_late_submission boolean, published_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, total_students bigint, submitted_count bigint, late_count bigint, revision_requested_count bigint, reviewed_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT assignment.id, assignment.class_id, class_record.name,
    assignment.lesson_id, lesson.title, assignment.title, assignment.description,
    assignment.status, assignment.due_at, assignment.allow_late_submission,
    assignment.published_at, assignment.created_at, assignment.updated_at,
    count(DISTINCT member.student_id) FILTER (WHERE member.status = 'active'),
    count(DISTINCT submission.student_id) FILTER (
      WHERE submission.status IN ('submitted', 'late', 'revision_requested', 'resubmitted', 'reviewed')
    ),
    count(DISTINCT submission.student_id) FILTER (WHERE submission.was_late),
    count(DISTINCT submission.student_id) FILTER (WHERE submission.status = 'revision_requested'),
    count(DISTINCT submission.student_id) FILTER (WHERE submission.status = 'reviewed')
  FROM public.assignments AS assignment
  JOIN public.classes AS class_record ON class_record.id = assignment.class_id
  LEFT JOIN public.lessons AS lesson ON lesson.id = assignment.lesson_id
  LEFT JOIN public.class_members AS member ON member.class_id = assignment.class_id
  LEFT JOIN public.submissions AS submission
    ON submission.assignment_id = assignment.id
   AND submission.student_id = member.student_id
   AND submission.status <> 'draft'
  WHERE assignment.id = target_assignment_id
    AND app_private.current_actor_id() IS NOT NULL
    AND app_private.can_manage_assignment(assignment.id)
  GROUP BY assignment.id, class_record.name, lesson.title;
$function$;
ALTER FUNCTION app_gateway.get_teacher_assignment(target_assignment_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_teacher_assignment(target_assignment_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_teacher_assignment(target_assignment_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_student_assignment(target_assignment_id uuid)
 RETURNS TABLE(assignment_id uuid, class_id uuid, class_name text, lesson_id uuid, lesson_title text, title text, description text, status text, due_at timestamp with time zone, allow_late_submission boolean, published_at timestamp with time zone, submission_id uuid, submission_status text, submitted_at timestamp with time zone, reviewed_at timestamp with time zone, feedback_message text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT assignment.id, assignment.class_id, class_record.name,
    assignment.lesson_id, lesson.title, assignment.title, assignment.description,
    assignment.status, assignment.due_at, assignment.allow_late_submission,
    assignment.published_at, submission.id, submission.status,
    submission.submitted_at, submission.reviewed_at, feedback.message
  FROM public.assignments AS assignment
  JOIN public.classes AS class_record ON class_record.id = assignment.class_id
  JOIN public.class_members AS member
    ON member.class_id = assignment.class_id
   AND member.student_id = app_private.current_actor_id()
   AND member.status = 'active'
  LEFT JOIN public.lessons AS lesson ON lesson.id = assignment.lesson_id
  LEFT JOIN public.submissions AS submission
    ON submission.assignment_id = assignment.id AND submission.student_id = app_private.current_actor_id()
  LEFT JOIN public.submission_feedback AS feedback ON feedback.submission_id = submission.id
  WHERE assignment.id = target_assignment_id
    AND assignment.status = 'published'
    AND app_private.current_actor_id() IS NOT NULL;
$function$;
ALTER FUNCTION app_gateway.get_student_assignment(target_assignment_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_student_assignment(target_assignment_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_student_assignment(target_assignment_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.list_assignment_roster(target_assignment_id uuid)
 RETURNS TABLE(student_id uuid, full_name text, email text, submission_id uuid, submission_status text, submitted_at timestamp with time zone, reviewed_at timestamp with time zone, was_late boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT app_private.can_manage_assignment(target_assignment_id) THEN
    RAISE EXCEPTION 'Assignment not found or roster access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT profile.id, profile.full_name, profile.email, submission.id,
    submission.status, submission.submitted_at, submission.reviewed_at,
    COALESCE(submission.was_late, false)
  FROM public.assignments AS assignment
  JOIN public.class_members AS member
    ON member.class_id = assignment.class_id AND member.status = 'active'
  JOIN public.profiles AS profile ON profile.id = member.student_id
  LEFT JOIN public.submissions AS submission
    ON submission.assignment_id = assignment.id
   AND submission.student_id = member.student_id
   AND submission.status <> 'draft'
  WHERE assignment.id = target_assignment_id
  ORDER BY profile.full_name, profile.email;
END;
$function$;
ALTER FUNCTION app_gateway.list_assignment_roster(target_assignment_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.list_assignment_roster(target_assignment_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.list_assignment_roster(target_assignment_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.list_assignment_lesson_options(target_class_id uuid)
 RETURNS TABLE(lesson_id uuid, lesson_title text, module_title text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT lesson.id, lesson.title, module_record.title
  FROM public.lessons AS lesson
  JOIN public.modules AS module_record ON module_record.id = lesson.module_id
  WHERE module_record.class_id = target_class_id
    AND app_private.current_actor_id() IS NOT NULL
    AND app_private.can_manage_module(module_record.id)
    AND lesson.status <> 'archived'
  ORDER BY module_record.position, lesson.position;
$function$;
ALTER FUNCTION app_gateway.list_assignment_lesson_options(target_class_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.list_assignment_lesson_options(target_class_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.list_assignment_lesson_options(target_class_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.list_teacher_assignment_resources(target_assignment_id uuid)
 RETURNS TABLE(id uuid, title text, resource_kind text, file_name text, file_size_bytes bigint, mime_type text, resource_position integer, uploaded_at timestamp with time zone, can_manage boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT app_private.can_manage_assignment(target_assignment_id) THEN
    RAISE EXCEPTION 'Assignment not found or resource access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT resource.id, resource.title, resource.resource_kind,
    resource.file_name, resource.file_size_bytes, resource.mime_type,
    resource.position, resource.uploaded_at, true
  FROM public.assignment_resources AS resource
  WHERE resource.assignment_id = target_assignment_id
    AND resource.storage_provider = 'b2' AND resource.upload_status = 'ready'
  ORDER BY resource.position, resource.created_at;
END;
$function$;
ALTER FUNCTION app_gateway.list_teacher_assignment_resources(target_assignment_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.list_teacher_assignment_resources(target_assignment_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.list_teacher_assignment_resources(target_assignment_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.list_student_assignment_resources(target_assignment_id uuid)
 RETURNS TABLE(id uuid, title text, resource_kind text, file_name text, file_size_bytes bigint, mime_type text, resource_position integer, uploaded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE target_class_id uuid;
BEGIN
  SELECT assignment.class_id INTO target_class_id
  FROM public.assignments AS assignment
  WHERE assignment.id = target_assignment_id AND assignment.status = 'published';
  IF target_class_id IS NULL OR app_private.current_actor_id() IS NULL OR NOT app_private.is_class_member(target_class_id) THEN
    RAISE EXCEPTION 'Assignment resources not found or membership required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT resource.id, resource.title, resource.resource_kind,
    resource.file_name, resource.file_size_bytes, resource.mime_type,
    resource.position, resource.uploaded_at
  FROM public.assignment_resources AS resource
  WHERE resource.assignment_id = target_assignment_id
    AND resource.storage_provider = 'b2' AND resource.upload_status = 'ready'
  ORDER BY resource.position, resource.created_at;
END;
$function$;
ALTER FUNCTION app_gateway.list_student_assignment_resources(target_assignment_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.list_student_assignment_resources(target_assignment_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.list_student_assignment_resources(target_assignment_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_submission_detail(target_submission_id uuid)
 RETURNS TABLE(submission_id uuid, assignment_id uuid, assignment_title text, student_id uuid, student_name text, student_email text, student_avatar_url text, submission_status text, submitted_at timestamp with time zone, reviewed_at timestamp with time zone, feedback_message text, can_review boolean, was_late boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_assignment_id uuid;
  owner_student_id uuid;
  current_status text;
BEGIN
  SELECT submission.assignment_id, submission.student_id, submission.status
  INTO target_assignment_id, owner_student_id, current_status
  FROM public.submissions AS submission
  WHERE submission.id = target_submission_id;

  IF app_private.current_actor_id() IS NULL OR target_assignment_id IS NULL OR NOT (
    owner_student_id = app_private.current_actor_id()
    OR (current_status <> 'draft' AND app_private.can_manage_assignment(target_assignment_id))
  ) THEN
    RAISE EXCEPTION 'Submission not found or access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    submission.id,
    assignment.id,
    assignment.title,
    profile.id,
    profile.full_name,
    profile.email,
    profile.avatar_url,
    submission.status,
    submission.submitted_at,
    submission.reviewed_at,
    feedback.message,
    app_private.can_manage_assignment(assignment.id),
    submission.was_late
  FROM public.submissions AS submission
  JOIN public.assignments AS assignment ON assignment.id = submission.assignment_id
  JOIN public.profiles AS profile ON profile.id = submission.student_id
  LEFT JOIN public.submission_feedback AS feedback ON feedback.submission_id = submission.id
  WHERE submission.id = target_submission_id;
END;
$function$;
ALTER FUNCTION app_gateway.get_submission_detail(target_submission_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_submission_detail(target_submission_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_submission_detail(target_submission_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.list_submission_files(target_submission_id uuid)
 RETURNS TABLE(id uuid, file_name text, resource_kind text, file_size_bytes bigint, mime_type text, file_version integer, uploaded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE target_assignment_id uuid; owner_student_id uuid; current_status text;
BEGIN
  SELECT submission.assignment_id, submission.student_id, submission.status
  INTO target_assignment_id, owner_student_id, current_status
  FROM public.submissions AS submission
  WHERE submission.id = target_submission_id;
  IF app_private.current_actor_id() IS NULL OR target_assignment_id IS NULL OR NOT (
    owner_student_id = app_private.current_actor_id()
    OR (current_status <> 'draft' AND app_private.can_manage_assignment(target_assignment_id))
  ) THEN
    RAISE EXCEPTION 'Submission files not found or access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT file.id, file.file_name, file.resource_kind,
    file.file_size_bytes, file.mime_type, file.version, file.uploaded_at
  FROM public.submission_files AS file
  WHERE file.submission_id = target_submission_id AND file.upload_status = 'ready'
  ORDER BY file.version, file.uploaded_at, file.file_name;
END;
$function$;
ALTER FUNCTION app_gateway.list_submission_files(target_submission_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.list_submission_files(target_submission_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.list_submission_files(target_submission_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.bootstrap_current_user()
 RETURNS TABLE(id uuid, full_name text, email text, avatar_url text, roles text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  current_user_id uuid := app_private.current_actor_id();
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
$function$;
ALTER FUNCTION app_gateway.bootstrap_current_user() OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.bootstrap_current_user() FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.bootstrap_current_user() TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.claim_my_class_invitations()
 RETURNS TABLE(claimed_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  current_user_id uuid := app_private.current_actor_id();
  current_email text;
  claimed integer := 0;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(auth_user.email)) INTO current_email
  FROM neon_auth."user" AS auth_user
  WHERE auth_user.id = current_user_id;

  IF current_email IS NULL OR current_email = '' THEN
    RAISE EXCEPTION 'Authenticated user email is unavailable'
      USING ERRCODE = '42501';
  END IF;

  WITH claimable AS (
    SELECT invitation.id, invitation.class_id
    FROM public.class_invitations AS invitation
    JOIN public.classes AS class_record ON class_record.id = invitation.class_id
    WHERE invitation.email = current_email
      AND invitation.status = 'pending'
      AND (invitation.expires_at IS NULL OR invitation.expires_at > now())
      AND class_record.teacher_id <> current_user_id
    FOR UPDATE OF invitation
  ), inserted_members AS (
    INSERT INTO public.class_members (class_id, student_id, status)
    SELECT claimable.class_id, current_user_id, 'active'
    FROM claimable
    ON CONFLICT (class_id, student_id) DO UPDATE
      SET status = CASE
        WHEN public.class_members.status = 'removed' THEN 'active'
        ELSE public.class_members.status
      END
    RETURNING class_id
  ), accepted AS (
    UPDATE public.class_invitations AS invitation
    SET status = 'accepted', accepted_at = now()
    FROM claimable
    WHERE invitation.id = claimable.id
    RETURNING invitation.id
  )
  SELECT count(*)::integer INTO claimed FROM accepted;

  RETURN QUERY SELECT claimed;
END;
$function$;
ALTER FUNCTION app_gateway.claim_my_class_invitations() OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.claim_my_class_invitations() FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.claim_my_class_invitations() TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.update_owned_class(target_class_id uuid, class_name text, class_description text DEFAULT NULL::text, class_status text DEFAULT 'active'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  normalized_name text := btrim(class_name);
  normalized_description text := NULLIF(btrim(class_description), '');
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT app_private.is_class_owner(target_class_id) THEN
    RAISE EXCEPTION 'Only the class owner may update this class'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_name IS NULL OR normalized_name = '' OR char_length(normalized_name) > 160 THEN
    RAISE EXCEPTION 'Class name must be between 1 and 160 characters'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_description IS NOT NULL AND char_length(normalized_description) > 2000 THEN
    RAISE EXCEPTION 'Class description must not exceed 2000 characters'
      USING ERRCODE = '22023';
  END IF;

  IF class_status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'Class status must be active or archived'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.classes
  SET name = normalized_name,
      description = normalized_description,
      status = class_status
  WHERE id = target_class_id;
END;
$function$;
ALTER FUNCTION app_gateway.update_owned_class(target_class_id uuid, class_name text, class_description text, class_status text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.update_owned_class(target_class_id uuid, class_name text, class_description text, class_status text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.update_owned_class(target_class_id uuid, class_name text, class_description text, class_status text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.create_class_invitations(target_class_id uuid, invitation_emails text[])
 RETURNS TABLE(email text, outcome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  current_user_id uuid := app_private.current_actor_id();
  owner_email text;
  candidate text;
  normalized_email text;
BEGIN
  IF current_user_id IS NULL OR NOT app_private.is_class_owner(target_class_id) THEN
    RAISE EXCEPTION 'Only the class owner may invite students'
      USING ERRCODE = '42501';
  END IF;

  SELECT profile.email INTO owner_email
  FROM public.profiles AS profile
  WHERE profile.id = current_user_id;

  FOREACH candidate IN ARRAY invitation_emails LOOP
    normalized_email := lower(btrim(candidate));

    IF normalized_email = '' OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
      email := normalized_email;
      outcome := 'invalid';
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF normalized_email = owner_email THEN
      email := normalized_email;
      outcome := 'owner';
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.class_members AS member
      JOIN public.profiles AS profile ON profile.id = member.student_id
      WHERE member.class_id = target_class_id
        AND member.status IN ('active', 'completed')
        AND profile.email = normalized_email
    ) THEN
      email := normalized_email;
      outcome := 'member';
      RETURN NEXT;
      CONTINUE;
    END IF;

    INSERT INTO public.class_invitations (class_id, email, invited_by)
    VALUES (target_class_id, normalized_email, current_user_id)
    ON CONFLICT DO NOTHING;

    email := normalized_email;
    outcome := CASE WHEN FOUND THEN 'created' ELSE 'pending' END;
    RETURN NEXT;
  END LOOP;
END;
$function$;
ALTER FUNCTION app_gateway.create_class_invitations(target_class_id uuid, invitation_emails text[]) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.create_class_invitations(target_class_id uuid, invitation_emails text[]) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.create_class_invitations(target_class_id uuid, invitation_emails text[]) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.revoke_class_invitation(target_invitation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  invitation_class_id uuid;
BEGIN
  SELECT invitation.class_id INTO invitation_class_id
  FROM public.class_invitations AS invitation
  WHERE invitation.id = target_invitation_id
    AND invitation.status = 'pending';

  IF invitation_class_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.is_class_owner(invitation_class_id) THEN
    RAISE EXCEPTION 'Pending invitation not found or access denied'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.class_invitations
  SET status = 'revoked'
  WHERE id = target_invitation_id AND status = 'pending';
END;
$function$;
ALTER FUNCTION app_gateway.revoke_class_invitation(target_invitation_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.revoke_class_invitation(target_invitation_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.revoke_class_invitation(target_invitation_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.add_class_instructor_by_email(target_class_id uuid, teacher_email text)
 RETURNS TABLE(outcome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  current_user_id uuid := app_private.current_actor_id();
  normalized_email text := lower(btrim(teacher_email));
  target_teacher_id uuid;
BEGIN
  IF current_user_id IS NULL OR NOT app_private.is_class_owner(target_class_id) THEN
    RAISE EXCEPTION 'Only the class owner may add instructors'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_email = '' OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid teacher email address' USING ERRCODE = '22023';
  END IF;

  SELECT profile.id INTO target_teacher_id
  FROM public.profiles AS profile
  JOIN public.user_roles AS user_role
    ON user_role.user_id = profile.id AND user_role.role = 'teacher'
  WHERE profile.email = normalized_email;

  IF target_teacher_id IS NULL THEN
    outcome := 'not_found';
    RETURN NEXT;
    RETURN;
  END IF;

  IF target_teacher_id = current_user_id THEN
    outcome := 'owner';
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.class_teachers (class_id, teacher_id, role)
  VALUES (target_class_id, target_teacher_id, 'instructor')
  ON CONFLICT (class_id, teacher_id) DO NOTHING;

  outcome := CASE WHEN FOUND THEN 'created' ELSE 'exists' END;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION app_gateway.add_class_instructor_by_email(target_class_id uuid, teacher_email text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.add_class_instructor_by_email(target_class_id uuid, teacher_email text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.add_class_instructor_by_email(target_class_id uuid, teacher_email text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.remove_class_instructor(target_class_id uuid, target_teacher_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT app_private.is_class_owner(target_class_id) THEN
    RAISE EXCEPTION 'Only the class owner may remove instructors'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.class_teachers
  WHERE class_id = target_class_id
    AND teacher_id = target_teacher_id
    AND role = 'instructor';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instructor not found' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;
ALTER FUNCTION app_gateway.remove_class_instructor(target_class_id uuid, target_teacher_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.remove_class_instructor(target_class_id uuid, target_teacher_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.remove_class_instructor(target_class_id uuid, target_teacher_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.update_module(target_module_id uuid, module_title text, module_description text DEFAULT NULL::text, module_status text DEFAULT 'active'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  normalized_title text := btrim(module_title);
  normalized_description text := NULLIF(btrim(module_description), '');
  module_class_id uuid;
  current_status text;
  current_lifecycle_status text;
  owner_access boolean;
BEGIN
  SELECT class_id, status, lifecycle_status
  INTO module_class_id, current_status, current_lifecycle_status
  FROM public.modules
  WHERE id = target_module_id
  FOR UPDATE;

  IF module_class_id IS NULL OR app_private.current_actor_id() IS NULL OR NOT app_private.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Module not found or edit access denied' USING ERRCODE = '42501';
  END IF;

  owner_access := app_private.is_class_owner(module_class_id);

  IF normalized_title IS NULL OR normalized_title = '' OR char_length(normalized_title) > 160 THEN
    RAISE EXCEPTION 'Module title must be between 1 and 160 characters' USING ERRCODE = '22023';
  END IF;

  IF normalized_description IS NOT NULL AND char_length(normalized_description) > 2000 THEN
    RAISE EXCEPTION 'Module description must not exceed 2000 characters' USING ERRCODE = '22023';
  END IF;

  IF module_status NOT IN ('active', 'completed', 'archived') THEN
    RAISE EXCEPTION 'Module status must be active, completed, or archived' USING ERRCODE = '22023';
  END IF;

  IF NOT owner_access AND module_status <> current_status THEN
    RAISE EXCEPTION 'Only the class owner may change module status' USING ERRCODE = '42501';
  END IF;

  IF NOT owner_access AND current_status = 'archived' THEN
    RAISE EXCEPTION 'Archived modules may only be edited by the class owner' USING ERRCODE = '42501';
  END IF;

  IF current_lifecycle_status = 'active'
     AND module_status = 'archived'
     AND current_status <> 'archived' THEN
    RAISE EXCEPTION 'Change the module teaching status before archiving it.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.modules
  SET title = normalized_title,
      description = normalized_description,
      status = module_status,
      updated_at = now()
  WHERE id = target_module_id;
END;
$function$;
ALTER FUNCTION app_gateway.update_module(target_module_id uuid, module_title text, module_description text, module_status text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.update_module(target_module_id uuid, module_title text, module_description text, module_status text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.update_module(target_module_id uuid, module_title text, module_description text, module_status text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.set_module_lifecycle(target_module_id uuid, requested_lifecycle_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_class_id uuid;
  target_availability_status text;
BEGIN
  SELECT module_record.class_id, module_record.status
  INTO target_class_id, target_availability_status
  FROM public.modules AS module_record
  WHERE module_record.id = target_module_id;

  IF target_class_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.is_class_owner(target_class_id) THEN
    RAISE EXCEPTION 'Only the class owner may change module lifecycle' USING ERRCODE = '42501';
  END IF;

  IF requested_lifecycle_status NOT IN ('upcoming', 'active', 'completed') THEN
    RAISE EXCEPTION 'Module lifecycle must be upcoming, active, or completed' USING ERRCODE = '22023';
  END IF;

  IF requested_lifecycle_status = 'active' THEN
    IF target_availability_status NOT IN ('active', 'completed') THEN
      RAISE EXCEPTION 'Make the module available before setting it as current.' USING ERRCODE = '23514';
    END IF;

    LOCK TABLE public.modules IN SHARE ROW EXCLUSIVE MODE;

    IF EXISTS (
      SELECT 1
      FROM public.modules AS other_module
      WHERE other_module.class_id = target_class_id
        AND other_module.lifecycle_status = 'active'
        AND other_module.id <> target_module_id
    ) THEN
      RAISE EXCEPTION 'Another module is already active for this class.' USING ERRCODE = '23505';
    END IF;
  END IF;

  UPDATE public.modules
  SET lifecycle_status = requested_lifecycle_status,
      updated_at = now()
  WHERE id = target_module_id;
END;
$function$;
ALTER FUNCTION app_gateway.set_module_lifecycle(target_module_id uuid, requested_lifecycle_status text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.set_module_lifecycle(target_module_id uuid, requested_lifecycle_status text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.set_module_lifecycle(target_module_id uuid, requested_lifecycle_status text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.assign_module_instructor(target_module_id uuid, target_teacher_id uuid)
 RETURNS TABLE(outcome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_class_id uuid;
BEGIN
  SELECT class_id INTO target_class_id
  FROM public.modules
  WHERE id = target_module_id;

  IF target_class_id IS NULL OR app_private.current_actor_id() IS NULL OR NOT app_private.is_class_owner(target_class_id) THEN
    RAISE EXCEPTION 'Only the class owner may assign module instructors'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.class_teachers AS class_teacher
    JOIN public.user_roles AS user_role
      ON user_role.user_id = class_teacher.teacher_id
      AND user_role.role = 'teacher'
    WHERE class_teacher.class_id = target_class_id
      AND class_teacher.teacher_id = target_teacher_id
  ) THEN
    RAISE EXCEPTION 'Teacher must already participate in this class'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.module_teachers (module_id, teacher_id)
  VALUES (target_module_id, target_teacher_id)
  ON CONFLICT (module_id, teacher_id) DO NOTHING;

  outcome := CASE WHEN FOUND THEN 'created' ELSE 'exists' END;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION app_gateway.assign_module_instructor(target_module_id uuid, target_teacher_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.assign_module_instructor(target_module_id uuid, target_teacher_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.assign_module_instructor(target_module_id uuid, target_teacher_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.remove_module_instructor(target_module_id uuid, target_teacher_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_class_id uuid;
BEGIN
  SELECT class_id INTO target_class_id
  FROM public.modules
  WHERE id = target_module_id;

  IF target_class_id IS NULL OR app_private.current_actor_id() IS NULL OR NOT app_private.is_class_owner(target_class_id) THEN
    RAISE EXCEPTION 'Only the class owner may remove module instructors'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.module_teachers
  WHERE module_id = target_module_id AND teacher_id = target_teacher_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Module instructor not found' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;
ALTER FUNCTION app_gateway.remove_module_instructor(target_module_id uuid, target_teacher_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.remove_module_instructor(target_module_id uuid, target_teacher_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.remove_module_instructor(target_module_id uuid, target_teacher_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.update_lesson(target_lesson_id uuid, lesson_title text, lesson_description text DEFAULT NULL::text, target_lesson_date date DEFAULT NULL::date, lesson_status text DEFAULT 'draft'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  normalized_title text := btrim(lesson_title);
  normalized_description text := NULLIF(btrim(lesson_description), '');
  target_module_id uuid;
BEGIN
  SELECT module_id INTO target_module_id
  FROM public.lessons
  WHERE id = target_lesson_id
  FOR UPDATE;

  IF target_module_id IS NULL OR app_private.current_actor_id() IS NULL OR NOT app_private.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Lesson not found or edit access denied'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_title IS NULL OR normalized_title = '' OR char_length(normalized_title) > 160 THEN
    RAISE EXCEPTION 'Lesson title must be between 1 and 160 characters'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_description IS NOT NULL AND char_length(normalized_description) > 4000 THEN
    RAISE EXCEPTION 'Lesson description must not exceed 4000 characters'
      USING ERRCODE = '22023';
  END IF;

  IF lesson_status NOT IN ('draft', 'published', 'archived') THEN
    RAISE EXCEPTION 'Lesson status must be draft, published, or archived'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.lessons
  SET title = normalized_title,
      description = normalized_description,
      lesson_date = target_lesson_date,
      status = lesson_status,
      published_at = CASE
        WHEN lesson_status = 'published' THEN COALESCE(published_at, now())
        WHEN lesson_status = 'draft' THEN NULL
        ELSE published_at
      END
  WHERE id = target_lesson_id;
END;
$function$;
ALTER FUNCTION app_gateway.update_lesson(target_lesson_id uuid, lesson_title text, lesson_description text, target_lesson_date date, lesson_status text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.update_lesson(target_lesson_id uuid, lesson_title text, lesson_description text, target_lesson_date date, lesson_status text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.update_lesson(target_lesson_id uuid, lesson_title text, lesson_description text, target_lesson_date date, lesson_status text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.set_lesson_youtube_video(target_lesson_id uuid, youtube_url text)
 RETURNS TABLE(video_id text, canonical_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_module_id uuid;
  normalized_video_id text;
  normalized_url text;
BEGIN
  SELECT lesson.module_id INTO target_module_id
  FROM public.lessons AS lesson
  WHERE lesson.id = target_lesson_id;

  IF target_module_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Lesson not found or recording access denied'
      USING ERRCODE = '42501';
  END IF;

  SELECT identity.video_id, identity.canonical_url
  INTO normalized_video_id, normalized_url
  FROM app_private.youtube_video_identity(youtube_url) AS identity;

  UPDATE public.lessons
  SET video_provider = 'youtube',
      video_url = normalized_url,
      video_duration_seconds = NULL
  WHERE id = target_lesson_id;

  video_id := normalized_video_id;
  canonical_url := normalized_url;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION app_gateway.set_lesson_youtube_video(target_lesson_id uuid, youtube_url text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.set_lesson_youtube_video(target_lesson_id uuid, youtube_url text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.set_lesson_youtube_video(target_lesson_id uuid, youtube_url text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.remove_lesson_video(target_lesson_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_module_id uuid;
BEGIN
  SELECT lesson.module_id INTO target_module_id
  FROM public.lessons AS lesson
  WHERE lesson.id = target_lesson_id;

  IF target_module_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Lesson not found or recording access denied'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.lessons
  SET video_provider = NULL,
      video_url = NULL,
      video_duration_seconds = NULL
  WHERE id = target_lesson_id;
END;
$function$;
ALTER FUNCTION app_gateway.remove_lesson_video(target_lesson_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.remove_lesson_video(target_lesson_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.remove_lesson_video(target_lesson_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.update_assignment(target_assignment_id uuid, assignment_title text, assignment_description text, assignment_due_at timestamp with time zone, assignment_allow_late boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE normalized_title text := btrim(assignment_title);
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT app_private.can_manage_assignment(target_assignment_id) THEN
    RAISE EXCEPTION 'Assignment not found or edit access denied' USING ERRCODE = '42501';
  END IF;
  IF normalized_title IS NULL OR normalized_title = '' OR char_length(normalized_title) > 160 THEN
    RAISE EXCEPTION 'Assignment title must be between 1 and 160 characters' USING ERRCODE = '22023';
  END IF;
  IF assignment_description IS NOT NULL AND char_length(assignment_description) > 10000 THEN
    RAISE EXCEPTION 'Assignment description is too long' USING ERRCODE = '22023';
  END IF;
  UPDATE public.assignments
  SET title = normalized_title,
      description = NULLIF(btrim(assignment_description), ''),
      due_at = assignment_due_at,
      allow_late_submission = COALESCE(assignment_allow_late, true)
  WHERE id = target_assignment_id;
END;
$function$;
ALTER FUNCTION app_gateway.update_assignment(target_assignment_id uuid, assignment_title text, assignment_description text, assignment_due_at timestamp with time zone, assignment_allow_late boolean) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.update_assignment(target_assignment_id uuid, assignment_title text, assignment_description text, assignment_due_at timestamp with time zone, assignment_allow_late boolean) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.update_assignment(target_assignment_id uuid, assignment_title text, assignment_description text, assignment_due_at timestamp with time zone, assignment_allow_late boolean) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.set_assignment_status(target_assignment_id uuid, next_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE normalized_status text := lower(btrim(next_status));
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT app_private.can_manage_assignment(target_assignment_id) THEN
    RAISE EXCEPTION 'Assignment not found or status access denied' USING ERRCODE = '42501';
  END IF;
  IF normalized_status NOT IN ('draft', 'published', 'closed', 'archived') THEN
    RAISE EXCEPTION 'Assignment status is invalid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.assignments
  SET status = normalized_status,
      published_at = CASE WHEN normalized_status = 'published' THEN COALESCE(published_at, now()) ELSE published_at END
  WHERE id = target_assignment_id;
END;
$function$;
ALTER FUNCTION app_gateway.set_assignment_status(target_assignment_id uuid, next_status text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.set_assignment_status(target_assignment_id uuid, next_status text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.set_assignment_status(target_assignment_id uuid, next_status text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.submit_my_assignment(target_assignment_id uuid)
 RETURNS TABLE(submission_id uuid, submission_status text, submitted_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  assignment_record public.assignments%ROWTYPE;
  submission_record public.submissions%ROWTYPE;
  ready_count integer;
  pending_count integer;
  next_status text;
  submitted_time timestamptz := now();
BEGIN
  SELECT * INTO assignment_record FROM public.assignments
  WHERE id = target_assignment_id AND status = 'published';
  SELECT * INTO submission_record FROM public.submissions
  WHERE assignment_id = target_assignment_id AND student_id = app_private.current_actor_id()
  FOR UPDATE;
  IF app_private.current_actor_id() IS NULL OR assignment_record.id IS NULL OR submission_record.id IS NULL
     OR NOT app_private.is_class_member(assignment_record.class_id)
     OR submission_record.status NOT IN ('draft', 'revision_requested')
     OR submission_record.draft_version IS NULL THEN
    RAISE EXCEPTION 'Submission not found or submit access denied' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) FILTER (WHERE file.upload_status = 'ready'),
    count(*) FILTER (WHERE file.upload_status = 'pending')
  INTO ready_count, pending_count
  FROM public.submission_files AS file
  WHERE file.submission_id = submission_record.id
    AND file.version = submission_record.draft_version;
  IF ready_count = 0 OR pending_count > 0 THEN
    RAISE EXCEPTION 'All selected files must finish uploading before submission' USING ERRCODE = '22023';
  END IF;

  IF submission_record.status = 'revision_requested' THEN
    next_status := 'resubmitted';
  ELSIF assignment_record.due_at IS NOT NULL AND submitted_time > assignment_record.due_at THEN
    IF NOT assignment_record.allow_late_submission THEN
      RAISE EXCEPTION 'The submission deadline has passed' USING ERRCODE = '22023';
    END IF;
    next_status := 'late';
  ELSE
    next_status := 'submitted';
  END IF;
  UPDATE public.submissions
  SET status = next_status, submitted_at = submitted_time,
      reviewed_at = NULL, draft_version = NULL,
      was_late = was_late OR next_status = 'late'
  WHERE id = submission_record.id;
  RETURN QUERY SELECT submission_record.id, next_status, submitted_time;
END;
$function$;
ALTER FUNCTION app_gateway.submit_my_assignment(target_assignment_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.submit_my_assignment(target_assignment_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.submit_my_assignment(target_assignment_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.create_class(class_name text, class_description text DEFAULT NULL::text)
 RETURNS TABLE(class_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  current_user_id uuid := app_private.current_actor_id();
  new_class_id uuid;
  normalized_name text := btrim(class_name);
  normalized_description text := NULLIF(btrim(class_description), '');
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;

  IF normalized_name IS NULL OR normalized_name = '' OR char_length(normalized_name) > 160 THEN
    RAISE EXCEPTION 'Class name must be between 1 and 160 characters'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_description IS NOT NULL AND char_length(normalized_description) > 2000 THEN
    RAISE EXCEPTION 'Class description must not exceed 2000 characters'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = current_user_id AND role = 'teacher'
  ) THEN
    RAISE EXCEPTION 'A teacher role is required to create a class'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.classes (name, description, teacher_id, status)
  VALUES (normalized_name, normalized_description, current_user_id, 'active')
  RETURNING id INTO new_class_id;

  INSERT INTO public.class_teachers (class_id, teacher_id, role)
  VALUES (new_class_id, current_user_id, 'owner');

  RETURN QUERY SELECT new_class_id;
END;
$function$;
ALTER FUNCTION app_gateway.create_class(class_name text, class_description text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.create_class(class_name text, class_description text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.create_class(class_name text, class_description text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.create_module(target_class_id uuid, module_title text, module_description text DEFAULT NULL::text)
 RETURNS TABLE(module_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  normalized_title text := btrim(module_title);
  normalized_description text := NULLIF(btrim(module_description), '');
  next_position integer;
  new_module_id uuid;
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT app_private.is_class_owner(target_class_id) THEN
    RAISE EXCEPTION 'Only the class owner may create modules'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_title IS NULL OR normalized_title = '' OR char_length(normalized_title) > 160 THEN
    RAISE EXCEPTION 'Module title must be between 1 and 160 characters'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_description IS NOT NULL AND char_length(normalized_description) > 2000 THEN
    RAISE EXCEPTION 'Module description must not exceed 2000 characters'
      USING ERRCODE = '22023';
  END IF;

  LOCK TABLE public.modules IN SHARE ROW EXCLUSIVE MODE;
  SELECT COALESCE(max(position) + 1, 0) INTO next_position
  FROM public.modules
  WHERE class_id = target_class_id;

  INSERT INTO public.modules (class_id, title, description, position, status)
  VALUES (target_class_id, normalized_title, normalized_description, next_position, 'active')
  RETURNING id INTO new_module_id;

  RETURN QUERY SELECT new_module_id;
END;
$function$;
ALTER FUNCTION app_gateway.create_module(target_class_id uuid, module_title text, module_description text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.create_module(target_class_id uuid, module_title text, module_description text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.create_module(target_class_id uuid, module_title text, module_description text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.reorder_module(target_module_id uuid, move_direction text)
 RETURNS TABLE(new_position integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_class_id uuid;
  current_position integer;
  neighbor_id uuid;
  neighbor_position integer;
  temporary_position integer;
BEGIN
  IF move_direction NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'Move direction must be up or down' USING ERRCODE = '22023';
  END IF;

  LOCK TABLE public.modules IN SHARE ROW EXCLUSIVE MODE;

  SELECT class_id, position INTO target_class_id, current_position
  FROM public.modules
  WHERE id = target_module_id;

  IF target_class_id IS NULL OR app_private.current_actor_id() IS NULL OR NOT app_private.is_class_owner(target_class_id) THEN
    RAISE EXCEPTION 'Only the class owner may reorder modules'
      USING ERRCODE = '42501';
  END IF;

  IF move_direction = 'up' THEN
    SELECT id, position INTO neighbor_id, neighbor_position
    FROM public.modules
    WHERE class_id = target_class_id AND position < current_position
    ORDER BY position DESC LIMIT 1;
  ELSE
    SELECT id, position INTO neighbor_id, neighbor_position
    FROM public.modules
    WHERE class_id = target_class_id AND position > current_position
    ORDER BY position ASC LIMIT 1;
  END IF;

  IF neighbor_id IS NOT NULL THEN
    SELECT COALESCE(max(position), -1) + 1 INTO temporary_position
    FROM public.modules
    WHERE class_id = target_class_id;

    UPDATE public.modules SET position = temporary_position WHERE id = target_module_id;
    UPDATE public.modules SET position = current_position WHERE id = neighbor_id;
    UPDATE public.modules SET position = neighbor_position WHERE id = target_module_id;
    current_position := neighbor_position;
  END IF;

  RETURN QUERY SELECT current_position;
END;
$function$;
ALTER FUNCTION app_gateway.reorder_module(target_module_id uuid, move_direction text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.reorder_module(target_module_id uuid, move_direction text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.reorder_module(target_module_id uuid, move_direction text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.create_lesson(target_module_id uuid, lesson_title text, lesson_description text DEFAULT NULL::text, target_lesson_date date DEFAULT NULL::date)
 RETURNS TABLE(lesson_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  normalized_title text := btrim(lesson_title);
  normalized_description text := NULLIF(btrim(lesson_description), '');
  next_position integer;
  new_lesson_id uuid;
  module_status text;
BEGIN
  SELECT status INTO module_status FROM public.modules WHERE id = target_module_id;

  IF module_status IS NULL OR app_private.current_actor_id() IS NULL OR NOT app_private.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Module not found or lesson access denied'
      USING ERRCODE = '42501';
  END IF;

  IF module_status = 'archived' THEN
    RAISE EXCEPTION 'Lessons cannot be added to an archived module'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_title IS NULL OR normalized_title = '' OR char_length(normalized_title) > 160 THEN
    RAISE EXCEPTION 'Lesson title must be between 1 and 160 characters'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_description IS NOT NULL AND char_length(normalized_description) > 4000 THEN
    RAISE EXCEPTION 'Lesson description must not exceed 4000 characters'
      USING ERRCODE = '22023';
  END IF;

  LOCK TABLE public.lessons IN SHARE ROW EXCLUSIVE MODE;
  SELECT COALESCE(max(position) + 1, 0) INTO next_position
  FROM public.lessons
  WHERE module_id = target_module_id;

  INSERT INTO public.lessons (
    module_id, title, description, lesson_date, position, status
  )
  VALUES (
    target_module_id, normalized_title, normalized_description,
    target_lesson_date, next_position, 'draft'
  )
  RETURNING id INTO new_lesson_id;

  RETURN QUERY SELECT new_lesson_id;
END;
$function$;
ALTER FUNCTION app_gateway.create_lesson(target_module_id uuid, lesson_title text, lesson_description text, target_lesson_date date) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.create_lesson(target_module_id uuid, lesson_title text, lesson_description text, target_lesson_date date) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.create_lesson(target_module_id uuid, lesson_title text, lesson_description text, target_lesson_date date) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.reorder_lesson(target_lesson_id uuid, move_direction text)
 RETURNS TABLE(new_position integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_module_id uuid;
  current_position integer;
  neighbor_id uuid;
  neighbor_position integer;
  temporary_position integer;
BEGIN
  IF move_direction NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'Move direction must be up or down' USING ERRCODE = '22023';
  END IF;

  LOCK TABLE public.lessons IN SHARE ROW EXCLUSIVE MODE;

  SELECT module_id, position INTO target_module_id, current_position
  FROM public.lessons
  WHERE id = target_lesson_id;

  IF target_module_id IS NULL OR app_private.current_actor_id() IS NULL OR NOT app_private.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Lesson not found or reorder access denied'
      USING ERRCODE = '42501';
  END IF;

  IF move_direction = 'up' THEN
    SELECT id, position INTO neighbor_id, neighbor_position
    FROM public.lessons
    WHERE module_id = target_module_id AND position < current_position
    ORDER BY position DESC LIMIT 1;
  ELSE
    SELECT id, position INTO neighbor_id, neighbor_position
    FROM public.lessons
    WHERE module_id = target_module_id AND position > current_position
    ORDER BY position ASC LIMIT 1;
  END IF;

  IF neighbor_id IS NOT NULL THEN
    SELECT COALESCE(max(position), -1) + 1 INTO temporary_position
    FROM public.lessons
    WHERE module_id = target_module_id;

    UPDATE public.lessons SET position = temporary_position WHERE id = target_lesson_id;
    UPDATE public.lessons SET position = current_position WHERE id = neighbor_id;
    UPDATE public.lessons SET position = neighbor_position WHERE id = target_lesson_id;
    current_position := neighbor_position;
  END IF;

  RETURN QUERY SELECT current_position;
END;
$function$;
ALTER FUNCTION app_gateway.reorder_lesson(target_lesson_id uuid, move_direction text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.reorder_lesson(target_lesson_id uuid, move_direction text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.reorder_lesson(target_lesson_id uuid, move_direction text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.create_assignment(target_class_id uuid, target_lesson_id uuid, assignment_title text, assignment_description text, assignment_due_at timestamp with time zone, assignment_allow_late boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  current_user_id uuid := app_private.current_actor_id();
  normalized_title text := btrim(assignment_title);
  lesson_module_id uuid;
  new_assignment_id uuid := gen_random_uuid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF normalized_title IS NULL OR normalized_title = '' OR char_length(normalized_title) > 160 THEN
    RAISE EXCEPTION 'Assignment title must be between 1 and 160 characters' USING ERRCODE = '22023';
  END IF;
  IF assignment_description IS NOT NULL AND char_length(assignment_description) > 10000 THEN
    RAISE EXCEPTION 'Assignment description is too long' USING ERRCODE = '22023';
  END IF;

  IF target_lesson_id IS NULL THEN
    IF NOT app_private.is_class_owner(target_class_id) THEN
      RAISE EXCEPTION 'Only the class owner may create a class-level assignment' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT lesson.module_id INTO lesson_module_id
    FROM public.lessons AS lesson
    JOIN public.modules AS module_record ON module_record.id = lesson.module_id
    WHERE lesson.id = target_lesson_id AND module_record.class_id = target_class_id;
    IF lesson_module_id IS NULL OR NOT app_private.can_manage_module(lesson_module_id) THEN
      RAISE EXCEPTION 'Lesson not found or assignment access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.assignments (
    id, class_id, lesson_id, title, description, status, due_at,
    allow_late_submission, created_by
  ) VALUES (
    new_assignment_id, target_class_id, target_lesson_id, normalized_title,
    NULLIF(btrim(assignment_description), ''), 'draft', assignment_due_at,
    COALESCE(assignment_allow_late, true), current_user_id
  );
  RETURN new_assignment_id;
END;
$function$;
ALTER FUNCTION app_gateway.create_assignment(target_class_id uuid, target_lesson_id uuid, assignment_title text, assignment_description text, assignment_due_at timestamp with time zone, assignment_allow_late boolean) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.create_assignment(target_class_id uuid, target_lesson_id uuid, assignment_title text, assignment_description text, assignment_due_at timestamp with time zone, assignment_allow_late boolean) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.create_assignment(target_class_id uuid, target_lesson_id uuid, assignment_title text, assignment_description text, assignment_due_at timestamp with time zone, assignment_allow_late boolean) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.review_submission(target_submission_id uuid, review_action text, feedback_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_assignment_id uuid;
  current_status text;
  normalized_action text := lower(btrim(review_action));
  normalized_message text := NULLIF(btrim(feedback_message), '');
BEGIN
  SELECT assignment_id, status INTO target_assignment_id, current_status
  FROM public.submissions WHERE id = target_submission_id FOR UPDATE;
  IF app_private.current_actor_id() IS NULL OR target_assignment_id IS NULL
     OR NOT app_private.can_manage_assignment(target_assignment_id) THEN
    RAISE EXCEPTION 'Submission not found or review access denied' USING ERRCODE = '42501';
  END IF;
  IF current_status NOT IN ('submitted', 'late', 'resubmitted') THEN
    RAISE EXCEPTION 'This submission is not ready for review' USING ERRCODE = '22023';
  END IF;
  IF normalized_action NOT IN ('reviewed', 'revision_requested') THEN
    RAISE EXCEPTION 'Review action is invalid' USING ERRCODE = '22023';
  END IF;
  IF normalized_action = 'revision_requested' AND normalized_message IS NULL THEN
    RAISE EXCEPTION 'Feedback is required when requesting revision' USING ERRCODE = '22023';
  END IF;
  IF normalized_message IS NOT NULL AND char_length(normalized_message) > 5000 THEN
    RAISE EXCEPTION 'Feedback is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_message IS NOT NULL THEN
    INSERT INTO public.submission_feedback (submission_id, teacher_id, message)
    VALUES (target_submission_id, app_private.current_actor_id(), normalized_message)
    ON CONFLICT (submission_id) DO UPDATE
      SET teacher_id = EXCLUDED.teacher_id, message = EXCLUDED.message, updated_at = now();
  END IF;

  UPDATE public.submissions
  SET status = normalized_action,
      reviewed_at = CASE WHEN normalized_action = 'reviewed' THEN now() ELSE NULL END,
      draft_version = NULL
  WHERE id = target_submission_id;
END;
$function$;
ALTER FUNCTION app_gateway.review_submission(target_submission_id uuid, review_action text, feedback_message text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.review_submission(target_submission_id uuid, review_action text, feedback_message text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.review_submission(target_submission_id uuid, review_action text, feedback_message text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_lesson_resource_upload_state(target_resource_id uuid)
 RETURNS TABLE(resource_id uuid, storage_path text, file_name text, file_size_bytes bigint, mime_type text, upload_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_module_id uuid;
BEGIN
  SELECT lesson.module_id INTO target_module_id
  FROM public.lesson_resources AS resource
  JOIN public.lessons AS lesson ON lesson.id = resource.lesson_id
  WHERE resource.id = target_resource_id
    AND resource.storage_provider = 'b2';

  IF target_module_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Resource not found or finalize access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT resource.id, resource.storage_path, resource.file_name,
    resource.file_size_bytes, resource.mime_type, resource.upload_status
  FROM public.lesson_resources AS resource
  WHERE resource.id = target_resource_id;
END;
$function$;
ALTER FUNCTION app_gateway.get_lesson_resource_upload_state(target_resource_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_lesson_resource_upload_state(target_resource_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_lesson_resource_upload_state(target_resource_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.authorize_lesson_resource_download(target_resource_id uuid)
 RETURNS TABLE(resource_id uuid, storage_path text, file_name text, file_size_bytes bigint, mime_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_class_id uuid;
  target_module_status text;
  target_lesson_status text;
  teacher_allowed boolean;
  student_allowed boolean;
BEGIN
  SELECT module_record.class_id, module_record.status, lesson.status
  INTO target_class_id, target_module_status, target_lesson_status
  FROM public.lesson_resources AS resource
  JOIN public.lessons AS lesson ON lesson.id = resource.lesson_id
  JOIN public.modules AS module_record ON module_record.id = lesson.module_id
  WHERE resource.id = target_resource_id
    AND resource.storage_provider = 'b2'
    AND resource.upload_status = 'ready';

  teacher_allowed := target_class_id IS NOT NULL
    AND app_private.is_class_teacher(target_class_id);
  student_allowed := target_class_id IS NOT NULL
    AND app_private.is_class_member(target_class_id)
    AND target_module_status IN ('active', 'completed')
    AND target_lesson_status = 'published';

  IF app_private.current_actor_id() IS NULL OR NOT (teacher_allowed OR student_allowed) THEN
    RAISE EXCEPTION 'Resource not found or download access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT resource.id, resource.storage_path, resource.file_name,
    resource.file_size_bytes, resource.mime_type
  FROM public.lesson_resources AS resource
  WHERE resource.id = target_resource_id;
END;
$function$;
ALTER FUNCTION app_gateway.authorize_lesson_resource_download(target_resource_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.authorize_lesson_resource_download(target_resource_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.authorize_lesson_resource_download(target_resource_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.authorize_lesson_resource_delete(target_resource_id uuid)
 RETURNS TABLE(resource_id uuid, storage_path text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_module_id uuid;
BEGIN
  SELECT lesson.module_id INTO target_module_id
  FROM public.lesson_resources AS resource
  JOIN public.lessons AS lesson ON lesson.id = resource.lesson_id
  WHERE resource.id = target_resource_id
    AND resource.storage_provider = 'b2';

  IF target_module_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Resource not found or delete access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT resource.id, resource.storage_path
  FROM public.lesson_resources AS resource
  WHERE resource.id = target_resource_id;
END;
$function$;
ALTER FUNCTION app_gateway.authorize_lesson_resource_delete(target_resource_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.authorize_lesson_resource_delete(target_resource_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.authorize_lesson_resource_delete(target_resource_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_assignment_resource_upload_state(target_resource_id uuid)
 RETURNS TABLE(resource_id uuid, storage_path text, file_name text, file_size_bytes bigint, mime_type text, upload_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE target_assignment_id uuid;
BEGIN
  SELECT resource.assignment_id INTO target_assignment_id
  FROM public.assignment_resources AS resource
  WHERE resource.id = target_resource_id AND resource.storage_provider = 'b2';
  IF target_assignment_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.can_manage_assignment(target_assignment_id) THEN
    RAISE EXCEPTION 'Resource not found or finalize access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT resource.id, resource.storage_path, resource.file_name,
    resource.file_size_bytes, resource.mime_type, resource.upload_status
  FROM public.assignment_resources AS resource WHERE resource.id = target_resource_id;
END;
$function$;
ALTER FUNCTION app_gateway.get_assignment_resource_upload_state(target_resource_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_assignment_resource_upload_state(target_resource_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_assignment_resource_upload_state(target_resource_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.authorize_assignment_resource_download(target_resource_id uuid)
 RETURNS TABLE(resource_id uuid, storage_path text, file_name text, file_size_bytes bigint, mime_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE target_assignment_id uuid; target_class_id uuid; target_status text;
BEGIN
  SELECT resource.assignment_id, assignment.class_id, assignment.status
  INTO target_assignment_id, target_class_id, target_status
  FROM public.assignment_resources AS resource
  JOIN public.assignments AS assignment ON assignment.id = resource.assignment_id
  WHERE resource.id = target_resource_id
    AND resource.storage_provider = 'b2' AND resource.upload_status = 'ready';
  IF app_private.current_actor_id() IS NULL OR target_assignment_id IS NULL OR NOT (
    app_private.can_manage_assignment(target_assignment_id)
    OR (target_status = 'published' AND app_private.is_class_member(target_class_id))
  ) THEN
    RAISE EXCEPTION 'Resource not found or download access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT resource.id, resource.storage_path, resource.file_name,
    resource.file_size_bytes, resource.mime_type
  FROM public.assignment_resources AS resource WHERE resource.id = target_resource_id;
END;
$function$;
ALTER FUNCTION app_gateway.authorize_assignment_resource_download(target_resource_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.authorize_assignment_resource_download(target_resource_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.authorize_assignment_resource_download(target_resource_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.authorize_assignment_resource_delete(target_resource_id uuid)
 RETURNS TABLE(resource_id uuid, storage_path text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE target_assignment_id uuid;
BEGIN
  SELECT assignment_id INTO target_assignment_id
  FROM public.assignment_resources WHERE id = target_resource_id AND storage_provider = 'b2';
  IF target_assignment_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.can_manage_assignment(target_assignment_id) THEN
    RAISE EXCEPTION 'Resource not found or delete access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT id, assignment_resources.storage_path
  FROM public.assignment_resources WHERE id = target_resource_id;
END;
$function$;
ALTER FUNCTION app_gateway.authorize_assignment_resource_delete(target_resource_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.authorize_assignment_resource_delete(target_resource_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.authorize_assignment_resource_delete(target_resource_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.get_submission_file_upload_state(target_file_id uuid)
 RETURNS TABLE(file_id uuid, storage_path text, file_name text, file_size_bytes bigint, mime_type text, upload_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.submission_files AS file
    JOIN public.submissions AS submission ON submission.id = file.submission_id
    WHERE file.id = target_file_id AND submission.student_id = app_private.current_actor_id()
      AND submission.status IN ('draft', 'revision_requested')
      AND submission.draft_version = file.version
  ) THEN
    RAISE EXCEPTION 'Submission file not found or finalize access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT file.id, file.storage_path, file.file_name,
    file.file_size_bytes, file.mime_type, file.upload_status
  FROM public.submission_files AS file WHERE file.id = target_file_id;
END;
$function$;
ALTER FUNCTION app_gateway.get_submission_file_upload_state(target_file_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.get_submission_file_upload_state(target_file_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.get_submission_file_upload_state(target_file_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.authorize_submission_file_download(target_file_id uuid)
 RETURNS TABLE(file_id uuid, storage_path text, file_name text, file_size_bytes bigint, mime_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE target_assignment_id uuid; owner_student_id uuid; current_status text;
BEGIN
  SELECT submission.assignment_id, submission.student_id, submission.status
  INTO target_assignment_id, owner_student_id, current_status
  FROM public.submission_files AS file
  JOIN public.submissions AS submission ON submission.id = file.submission_id
  WHERE file.id = target_file_id AND file.upload_status = 'ready';
  IF app_private.current_actor_id() IS NULL OR target_assignment_id IS NULL OR NOT (
    owner_student_id = app_private.current_actor_id()
    OR (current_status <> 'draft' AND app_private.can_manage_assignment(target_assignment_id))
  ) THEN
    RAISE EXCEPTION 'Submission file not found or download access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT file.id, file.storage_path, file.file_name,
    file.file_size_bytes, file.mime_type
  FROM public.submission_files AS file WHERE file.id = target_file_id;
END;
$function$;
ALTER FUNCTION app_gateway.authorize_submission_file_download(target_file_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.authorize_submission_file_download(target_file_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.authorize_submission_file_download(target_file_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.prepare_lesson_resource_upload(target_lesson_id uuid, original_file_name text, expected_file_size_bytes bigint, content_type text, resource_kind text, resource_title text DEFAULT NULL::text)
 RETURNS TABLE(resource_id uuid, storage_path text, file_name text, file_size_bytes bigint, mime_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_module_id uuid;
  normalized_file_name text := btrim(original_file_name);
  normalized_mime_type text := lower(btrim(content_type));
  normalized_resource_kind text := lower(btrim(resource_kind));
  normalized_title text := NULLIF(btrim(resource_title), '');
  file_extension text;
  safe_file_name text;
  new_resource_id uuid := gen_random_uuid();
  new_storage_path text;
  next_position integer;
BEGIN
  SELECT lesson.module_id INTO target_module_id
  FROM public.lessons AS lesson
  WHERE lesson.id = target_lesson_id;

  IF target_module_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Lesson not found or resource upload access denied'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_file_name IS NULL OR normalized_file_name = ''
     OR char_length(normalized_file_name) > 180
     OR normalized_file_name ~ '[/\\]'
     OR normalized_file_name ~ '[[:cntrl:]]'
     OR position('..' IN normalized_file_name) > 0
     OR left(normalized_file_name, 1) = '.' THEN
    RAISE EXCEPTION 'File name is invalid' USING ERRCODE = '22023';
  END IF;

  file_extension := lower(substring(normalized_file_name FROM '\.([^.]+)$'));
  IF file_extension IS NULL OR file_extension NOT IN (
    'xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'pdf', 'pbix', 'pbit',
    'sql', 'ipynb', 'py', 'txt', 'json', 'parquet', 'zip', 'docx', 'pptx'
  ) THEN
    RAISE EXCEPTION 'This file type is not supported' USING ERRCODE = '22023';
  END IF;

  IF normalized_resource_kind IS NULL
     OR normalized_resource_kind <> file_extension THEN
    RAISE EXCEPTION 'Resource kind must match the file extension'
      USING ERRCODE = '22023';
  END IF;

  IF expected_file_size_bytes IS NULL OR expected_file_size_bytes <= 0
     OR expected_file_size_bytes > 524288000 THEN
    RAISE EXCEPTION 'File size must be between 1 byte and 500 MiB'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_mime_type IS NULL OR normalized_mime_type = ''
     OR char_length(normalized_mime_type) > 255
     OR normalized_mime_type ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Content type is invalid' USING ERRCODE = '22023';
  END IF;

  IF normalized_title IS NULL THEN
    normalized_title := normalized_file_name;
  ELSIF char_length(normalized_title) > 160 THEN
    RAISE EXCEPTION 'Resource title must not exceed 160 characters'
      USING ERRCODE = '22023';
  END IF;

  safe_file_name := regexp_replace(normalized_file_name, '[^A-Za-z0-9._-]+', '_', 'g');
  IF safe_file_name IS NULL OR safe_file_name = '' THEN
    safe_file_name := new_resource_id::text || '.' || file_extension;
  END IF;

  new_storage_path := 'lessons/' || target_lesson_id::text
    || '/resources/' || new_resource_id::text || '/' || safe_file_name;

  LOCK TABLE public.lesson_resources IN SHARE ROW EXCLUSIVE MODE;
  SELECT COALESCE(max(resource.position) + 1, 0) INTO next_position
  FROM public.lesson_resources AS resource
  WHERE resource.lesson_id = target_lesson_id;

  INSERT INTO public.lesson_resources (
    id, lesson_id, title, resource_kind, storage_path, external_url,
    file_name, file_size_bytes, mime_type, position, storage_provider,
    upload_status, uploaded_at, storage_etag
  ) VALUES (
    new_resource_id, target_lesson_id, normalized_title,
    normalized_resource_kind, new_storage_path, NULL, normalized_file_name,
    expected_file_size_bytes, normalized_mime_type, next_position, 'b2',
    'pending', NULL, NULL
  );

  RETURN QUERY SELECT new_resource_id, new_storage_path, normalized_file_name,
    expected_file_size_bytes, normalized_mime_type;
END;
$function$;
ALTER FUNCTION app_gateway.prepare_lesson_resource_upload(target_lesson_id uuid, original_file_name text, expected_file_size_bytes bigint, content_type text, resource_kind text, resource_title text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.prepare_lesson_resource_upload(target_lesson_id uuid, original_file_name text, expected_file_size_bytes bigint, content_type text, resource_kind text, resource_title text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.prepare_lesson_resource_upload(target_lesson_id uuid, original_file_name text, expected_file_size_bytes bigint, content_type text, resource_kind text, resource_title text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.finalize_lesson_resource_upload(target_resource_id uuid, verified_file_size_bytes bigint, verified_storage_etag text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_module_id uuid;
  expected_size bigint;
  current_status text;
  normalized_etag text := NULLIF(btrim(verified_storage_etag), '');
BEGIN
  SELECT lesson.module_id, resource.file_size_bytes, resource.upload_status
  INTO target_module_id, expected_size, current_status
  FROM public.lesson_resources AS resource
  JOIN public.lessons AS lesson ON lesson.id = resource.lesson_id
  WHERE resource.id = target_resource_id
    AND resource.storage_provider = 'b2'
  FOR UPDATE OF resource;

  IF target_module_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Resource not found or finalize access denied'
      USING ERRCODE = '42501';
  END IF;

  IF verified_file_size_bytes IS NULL OR verified_file_size_bytes <> expected_size THEN
    RAISE EXCEPTION 'Uploaded object size does not match the resource metadata'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_etag IS NOT NULL AND char_length(normalized_etag) > 256 THEN
    RAISE EXCEPTION 'Storage ETag is invalid' USING ERRCODE = '22023';
  END IF;

  IF current_status NOT IN ('pending', 'ready') THEN
    RAISE EXCEPTION 'Resource upload state is invalid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.lesson_resources
  SET upload_status = 'ready',
      uploaded_at = COALESCE(uploaded_at, now()),
      storage_etag = normalized_etag
  WHERE id = target_resource_id;
END;
$function$;
ALTER FUNCTION app_gateway.finalize_lesson_resource_upload(target_resource_id uuid, verified_file_size_bytes bigint, verified_storage_etag text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.finalize_lesson_resource_upload(target_resource_id uuid, verified_file_size_bytes bigint, verified_storage_etag text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.finalize_lesson_resource_upload(target_resource_id uuid, verified_file_size_bytes bigint, verified_storage_etag text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.delete_lesson_resource_metadata(target_resource_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_module_id uuid;
BEGIN
  SELECT lesson.module_id INTO target_module_id
  FROM public.lesson_resources AS resource
  JOIN public.lessons AS lesson ON lesson.id = resource.lesson_id
  WHERE resource.id = target_resource_id
    AND resource.storage_provider = 'b2'
  FOR UPDATE OF resource;

  IF target_module_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Resource not found or delete access denied'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.lesson_resources WHERE id = target_resource_id;
END;
$function$;
ALTER FUNCTION app_gateway.delete_lesson_resource_metadata(target_resource_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.delete_lesson_resource_metadata(target_resource_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.delete_lesson_resource_metadata(target_resource_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.prepare_assignment_resource_upload(target_assignment_id uuid, original_file_name text, expected_file_size_bytes bigint, content_type text, resource_kind text, resource_title text DEFAULT NULL::text)
 RETURNS TABLE(resource_id uuid, storage_path text, file_name text, file_size_bytes bigint, mime_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  normalized_file_name text := btrim(original_file_name);
  normalized_mime_type text := lower(btrim(content_type));
  normalized_kind text := lower(btrim(resource_kind));
  normalized_title text := NULLIF(btrim(resource_title), '');
  extension text;
  safe_name text;
  new_resource_id uuid := gen_random_uuid();
  new_storage_path text;
  next_position integer;
BEGIN
  IF app_private.current_actor_id() IS NULL OR NOT app_private.can_manage_assignment(target_assignment_id) THEN
    RAISE EXCEPTION 'Assignment not found or resource upload access denied' USING ERRCODE = '42501';
  END IF;
  safe_name := app_private.safe_private_file_name(normalized_file_name);
  extension := app_private.private_file_extension(normalized_file_name);
  IF NOT app_private.is_supported_private_file_kind(extension) OR normalized_kind <> extension THEN
    RAISE EXCEPTION 'This file type is not supported' USING ERRCODE = '22023';
  END IF;
  IF expected_file_size_bytes IS NULL OR expected_file_size_bytes <= 0
     OR expected_file_size_bytes > 524288000 THEN
    RAISE EXCEPTION 'File size must be between 1 byte and 500 MiB' USING ERRCODE = '22023';
  END IF;
  IF normalized_mime_type IS NULL OR normalized_mime_type = ''
     OR char_length(normalized_mime_type) > 255 OR normalized_mime_type ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Content type is invalid' USING ERRCODE = '22023';
  END IF;
  IF normalized_title IS NULL THEN normalized_title := normalized_file_name; END IF;
  IF char_length(normalized_title) > 160 THEN
    RAISE EXCEPTION 'Resource title must not exceed 160 characters' USING ERRCODE = '22023';
  END IF;
  new_storage_path := 'assignments/' || target_assignment_id::text
    || '/resources/' || new_resource_id::text || '/' || safe_name;

  LOCK TABLE public.assignment_resources IN SHARE ROW EXCLUSIVE MODE;
  SELECT COALESCE(max(resource.position) + 1, 0) INTO next_position
  FROM public.assignment_resources AS resource
  WHERE resource.assignment_id = target_assignment_id;

  INSERT INTO public.assignment_resources (
    id, assignment_id, title, resource_kind, storage_path, external_url,
    file_name, file_size_bytes, mime_type, position, storage_provider,
    upload_status, uploaded_at, storage_etag
  ) VALUES (
    new_resource_id, target_assignment_id, normalized_title, normalized_kind,
    new_storage_path, NULL, normalized_file_name, expected_file_size_bytes,
    normalized_mime_type, next_position, 'b2', 'pending', NULL, NULL
  );
  RETURN QUERY SELECT new_resource_id, new_storage_path, normalized_file_name,
    expected_file_size_bytes, normalized_mime_type;
END;
$function$;
ALTER FUNCTION app_gateway.prepare_assignment_resource_upload(target_assignment_id uuid, original_file_name text, expected_file_size_bytes bigint, content_type text, resource_kind text, resource_title text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.prepare_assignment_resource_upload(target_assignment_id uuid, original_file_name text, expected_file_size_bytes bigint, content_type text, resource_kind text, resource_title text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.prepare_assignment_resource_upload(target_assignment_id uuid, original_file_name text, expected_file_size_bytes bigint, content_type text, resource_kind text, resource_title text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.finalize_assignment_resource_upload(target_resource_id uuid, verified_file_size_bytes bigint, verified_storage_etag text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_assignment_id uuid;
  expected_size bigint;
  normalized_etag text := NULLIF(btrim(verified_storage_etag), '');
BEGIN
  SELECT resource.assignment_id, resource.file_size_bytes
  INTO target_assignment_id, expected_size
  FROM public.assignment_resources AS resource
  WHERE resource.id = target_resource_id AND resource.storage_provider = 'b2'
  FOR UPDATE;
  IF target_assignment_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.can_manage_assignment(target_assignment_id) THEN
    RAISE EXCEPTION 'Resource not found or finalize access denied' USING ERRCODE = '42501';
  END IF;
  IF verified_file_size_bytes IS NULL OR verified_file_size_bytes <> expected_size THEN
    RAISE EXCEPTION 'Uploaded object size does not match the resource metadata' USING ERRCODE = '22023';
  END IF;
  IF normalized_etag IS NOT NULL AND char_length(normalized_etag) > 256 THEN
    RAISE EXCEPTION 'Storage ETag is invalid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.assignment_resources
  SET upload_status = 'ready', uploaded_at = COALESCE(uploaded_at, now()),
      storage_etag = normalized_etag
  WHERE id = target_resource_id;
END;
$function$;
ALTER FUNCTION app_gateway.finalize_assignment_resource_upload(target_resource_id uuid, verified_file_size_bytes bigint, verified_storage_etag text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.finalize_assignment_resource_upload(target_resource_id uuid, verified_file_size_bytes bigint, verified_storage_etag text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.finalize_assignment_resource_upload(target_resource_id uuid, verified_file_size_bytes bigint, verified_storage_etag text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.delete_assignment_resource_metadata(target_resource_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE target_assignment_id uuid;
BEGIN
  SELECT assignment_id INTO target_assignment_id
  FROM public.assignment_resources WHERE id = target_resource_id FOR UPDATE;
  IF target_assignment_id IS NULL OR app_private.current_actor_id() IS NULL
     OR NOT app_private.can_manage_assignment(target_assignment_id) THEN
    RAISE EXCEPTION 'Resource not found or delete access denied' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.assignment_resources WHERE id = target_resource_id;
END;
$function$;
ALTER FUNCTION app_gateway.delete_assignment_resource_metadata(target_resource_id uuid) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.delete_assignment_resource_metadata(target_resource_id uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.delete_assignment_resource_metadata(target_resource_id uuid) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.prepare_submission_file_upload(target_assignment_id uuid, original_file_name text, expected_file_size_bytes bigint, content_type text, resource_kind text)
 RETURNS TABLE(file_id uuid, submission_id uuid, file_version integer, storage_path text, file_name text, file_size_bytes bigint, mime_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  current_user_id uuid := app_private.current_actor_id();
  assignment_record public.assignments%ROWTYPE;
  submission_record public.submissions%ROWTYPE;
  normalized_file_name text := btrim(original_file_name);
  normalized_mime_type text := lower(btrim(content_type));
  normalized_kind text := lower(btrim(resource_kind));
  extension text;
  safe_name text;
  new_file_id uuid := gen_random_uuid();
  target_version integer;
  new_storage_path text;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO assignment_record FROM public.assignments
  WHERE id = target_assignment_id AND status = 'published';
  IF assignment_record.id IS NULL OR NOT app_private.is_class_member(assignment_record.class_id) THEN
    RAISE EXCEPTION 'Assignment not found or submission access denied' USING ERRCODE = '42501';
  END IF;

  safe_name := app_private.safe_private_file_name(normalized_file_name);
  extension := app_private.private_file_extension(normalized_file_name);
  IF NOT app_private.is_supported_private_file_kind(extension) OR normalized_kind <> extension THEN
    RAISE EXCEPTION 'This file type is not supported' USING ERRCODE = '22023';
  END IF;
  IF expected_file_size_bytes IS NULL OR expected_file_size_bytes <= 0
     OR expected_file_size_bytes > 524288000 THEN
    RAISE EXCEPTION 'File size must be between 1 byte and 500 MiB' USING ERRCODE = '22023';
  END IF;
  IF normalized_mime_type IS NULL OR normalized_mime_type = ''
     OR char_length(normalized_mime_type) > 255 OR normalized_mime_type ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Content type is invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.submissions (assignment_id, student_id, status)
  VALUES (target_assignment_id, current_user_id, 'draft')
  ON CONFLICT (assignment_id, student_id) DO NOTHING;

  SELECT * INTO submission_record FROM public.submissions
  WHERE assignment_id = target_assignment_id AND student_id = current_user_id
  FOR UPDATE;

  IF submission_record.status NOT IN ('draft', 'revision_requested') THEN
    RAISE EXCEPTION 'This submission is not accepting files' USING ERRCODE = '22023';
  END IF;
  IF submission_record.status = 'draft'
     AND assignment_record.due_at IS NOT NULL AND now() > assignment_record.due_at
     AND NOT assignment_record.allow_late_submission THEN
    RAISE EXCEPTION 'The submission deadline has passed' USING ERRCODE = '22023';
  END IF;

  IF submission_record.draft_version IS NULL THEN
    IF submission_record.status = 'draft' THEN
      target_version := 1;
    ELSE
      SELECT COALESCE(max(file.version), 0) + 1 INTO target_version
      FROM public.submission_files AS file
      WHERE file.submission_id = submission_record.id AND file.upload_status = 'ready';
    END IF;
    UPDATE public.submissions SET draft_version = target_version WHERE id = submission_record.id;
  ELSE
    target_version := submission_record.draft_version;
  END IF;

  new_storage_path := 'submissions/' || submission_record.id::text
    || '/v' || target_version::text || '/' || new_file_id::text || '/' || safe_name;
  INSERT INTO public.submission_files (
    id, submission_id, storage_path, file_name, file_size_bytes, mime_type,
    version, uploaded_at, resource_kind, storage_provider, upload_status, storage_etag
  ) VALUES (
    new_file_id, submission_record.id, new_storage_path, normalized_file_name,
    expected_file_size_bytes, normalized_mime_type, target_version, NULL,
    normalized_kind, 'b2', 'pending', NULL
  );
  RETURN QUERY SELECT new_file_id, submission_record.id, target_version,
    new_storage_path, normalized_file_name, expected_file_size_bytes, normalized_mime_type;
END;
$function$;
ALTER FUNCTION app_gateway.prepare_submission_file_upload(target_assignment_id uuid, original_file_name text, expected_file_size_bytes bigint, content_type text, resource_kind text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.prepare_submission_file_upload(target_assignment_id uuid, original_file_name text, expected_file_size_bytes bigint, content_type text, resource_kind text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.prepare_submission_file_upload(target_assignment_id uuid, original_file_name text, expected_file_size_bytes bigint, content_type text, resource_kind text) TO dataclass_gateway;

CREATE OR REPLACE FUNCTION app_gateway.finalize_submission_file_upload(target_file_id uuid, verified_file_size_bytes bigint, verified_storage_etag text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  expected_size bigint;
  allowed boolean;
  normalized_etag text := NULLIF(btrim(verified_storage_etag), '');
BEGIN
  SELECT file.file_size_bytes,
    submission.student_id = app_private.current_actor_id()
      AND submission.status IN ('draft', 'revision_requested')
      AND submission.draft_version = file.version
  INTO expected_size, allowed
  FROM public.submission_files AS file
  JOIN public.submissions AS submission ON submission.id = file.submission_id
  WHERE file.id = target_file_id
  FOR UPDATE OF file;
  IF app_private.current_actor_id() IS NULL OR expected_size IS NULL OR NOT COALESCE(allowed, false) THEN
    RAISE EXCEPTION 'Submission file not found or finalize access denied' USING ERRCODE = '42501';
  END IF;
  IF verified_file_size_bytes IS NULL OR verified_file_size_bytes <> expected_size THEN
    RAISE EXCEPTION 'Uploaded object size does not match the file metadata' USING ERRCODE = '22023';
  END IF;
  IF normalized_etag IS NOT NULL AND char_length(normalized_etag) > 256 THEN
    RAISE EXCEPTION 'Storage ETag is invalid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.submission_files
  SET upload_status = 'ready', uploaded_at = COALESCE(uploaded_at, now()),
      storage_etag = normalized_etag
  WHERE id = target_file_id;
END;
$function$;
ALTER FUNCTION app_gateway.finalize_submission_file_upload(target_file_id uuid, verified_file_size_bytes bigint, verified_storage_etag text) OWNER TO dataclass_gateway_owner;
REVOKE ALL ON FUNCTION app_gateway.finalize_submission_file_upload(target_file_id uuid, verified_file_size_bytes bigint, verified_storage_etag text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION app_gateway.finalize_submission_file_upload(target_file_id uuid, verified_file_size_bytes bigint, verified_storage_etag text) TO dataclass_gateway;

REVOKE ALL ON ALL TABLES IN SCHEMA public, neon_auth FROM dataclass_gateway;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM dataclass_gateway;
REVOKE CREATE ON SCHEMA public FROM dataclass_gateway;
DO $database_grants$
BEGIN
  EXECUTE pg_catalog.format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE pg_catalog.format('REVOKE ALL ON DATABASE %I FROM dataclass_gateway', current_database());
  EXECUTE pg_catalog.format('GRANT CONNECT ON DATABASE %I TO dataclass_gateway', current_database());
END
$database_grants$;
DO $assertions$
DECLARE
  migrated_functions integer;
  identity_leaks integer;
BEGIN
  SELECT count(*) INTO migrated_functions
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('app_private', 'app_gateway') AND p.proname <> 'current_actor_id';
  IF migrated_functions <> 83 THEN
    RAISE EXCEPTION 'Expected 83 migrated application functions, found %', migrated_functions;
  END IF;
  SELECT count(*) INTO identity_leaks
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('app_private', 'app_gateway') AND p.prokind = 'f'
    AND (pg_catalog.pg_get_functiondef(p.oid) ~ 'auth\.uid\(\)'
      OR pg_catalog.pg_get_functiondef(p.oid) ~ 'auth\.user_id\(\)');
  IF identity_leaks <> 0 THEN
    RAISE EXCEPTION 'Extension identity remains in staged functions';
  END IF;
  IF has_database_privilege('dataclass_gateway', current_database(), 'TEMP')
    OR has_schema_privilege('dataclass_gateway', 'public', 'CREATE')
    OR has_table_privilege('dataclass_gateway', 'public.classes', 'SELECT')
    OR pg_catalog.pg_has_role('dataclass_gateway', 'dataclass_gateway_owner', 'MEMBER')
  THEN
    RAISE EXCEPTION 'Gateway LOGIN is not least privileged';
  END IF;
END
$assertions$;
DO $drop_owner_membership$
BEGIN
  EXECUTE pg_catalog.format('REVOKE dataclass_gateway_owner FROM %I', current_user);
END
$drop_owner_membership$;

COMMIT;
