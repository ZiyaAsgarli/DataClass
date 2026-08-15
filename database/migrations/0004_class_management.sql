BEGIN;

-- RLS helpers are SECURITY DEFINER to avoid policy recursion across the
-- classes, class_members, and class_teachers relationship tables.
CREATE OR REPLACE FUNCTION public.is_class_owner(target_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classes AS class_record
    WHERE class_record.id = target_class_id
      AND class_record.teacher_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_class_teacher(target_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_teachers AS class_teacher
    WHERE class_teacher.class_id = target_class_id
      AND class_teacher.teacher_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_class_member(target_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_members AS class_member
    WHERE class_member.class_id = target_class_id
      AND class_member.student_id = auth.uid()
      AND class_member.status IN ('active', 'completed')
  );
$$;

REVOKE ALL ON FUNCTION public.is_class_owner(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.is_class_teacher(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.is_class_member(uuid) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.is_class_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_class_teacher(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_class_member(uuid) TO authenticated;

CREATE POLICY classes_read_authorized
  ON public.classes
  FOR SELECT
  TO authenticated
  USING (
    public.is_class_teacher(id)
    OR public.is_class_member(id)
  );

CREATE POLICY class_members_read_authorized
  ON public.class_members
  FOR SELECT
  TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.is_class_teacher(class_id)
  );

CREATE POLICY class_invitations_read_owner
  ON public.class_invitations
  FOR SELECT
  TO authenticated
  USING (public.is_class_owner(class_id));

CREATE POLICY class_teachers_read_authorized
  ON public.class_teachers
  FOR SELECT
  TO authenticated
  USING (
    public.is_class_teacher(class_id)
    OR public.is_class_member(class_id)
  );

GRANT SELECT ON public.classes, public.class_members,
  public.class_invitations, public.class_teachers TO authenticated;
REVOKE ALL ON public.classes, public.class_members,
  public.class_invitations, public.class_teachers FROM anonymous;

CREATE OR REPLACE FUNCTION public.create_class(
  class_name text,
  class_description text DEFAULT NULL
)
RETURNS TABLE (class_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  current_user_id uuid := auth.uid();
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
$$;

CREATE OR REPLACE FUNCTION public.update_owned_class(
  target_class_id uuid,
  class_name text,
  class_description text DEFAULT NULL,
  class_status text DEFAULT 'active'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  normalized_name text := btrim(class_name);
  normalized_description text := NULLIF(btrim(class_description), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_class_owner(target_class_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.create_class_invitations(
  target_class_id uuid,
  invitation_emails text[]
)
RETURNS TABLE (email text, outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  owner_email text;
  candidate text;
  normalized_email text;
BEGIN
  IF current_user_id IS NULL OR NOT public.is_class_owner(target_class_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.revoke_class_invitation(target_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  invitation_class_id uuid;
BEGIN
  SELECT invitation.class_id INTO invitation_class_id
  FROM public.class_invitations AS invitation
  WHERE invitation.id = target_invitation_id
    AND invitation.status = 'pending';

  IF invitation_class_id IS NULL OR auth.uid() IS NULL
     OR NOT public.is_class_owner(invitation_class_id) THEN
    RAISE EXCEPTION 'Pending invitation not found or access denied'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.class_invitations
  SET status = 'revoked'
  WHERE id = target_invitation_id AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_my_class_invitations()
RETURNS TABLE (claimed_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  current_user_id uuid := auth.uid();
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
$$;

CREATE OR REPLACE FUNCTION public.add_class_instructor_by_email(
  target_class_id uuid,
  teacher_email text
)
RETURNS TABLE (outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  normalized_email text := lower(btrim(teacher_email));
  target_teacher_id uuid;
BEGIN
  IF current_user_id IS NULL OR NOT public.is_class_owner(target_class_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.remove_class_instructor(
  target_class_id uuid,
  target_teacher_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_class_owner(target_class_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.list_my_teacher_classes()
RETURNS TABLE (
  id uuid, name text, description text, status text,
  teacher_role text, student_count bigint, instructor_count bigint,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
  WHERE class_teacher.teacher_id = auth.uid()
  ORDER BY class_record.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_my_student_classes()
RETURNS TABLE (
  id uuid, name text, description text, status text,
  owner_name text, student_count bigint, created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT class_record.id, class_record.name, class_record.description,
    class_record.status, owner_profile.full_name,
    (SELECT count(*) FROM public.class_members AS other_member
      WHERE other_member.class_id = class_record.id
        AND other_member.status IN ('active', 'completed')),
    class_record.created_at, class_record.updated_at
  FROM public.class_members AS membership
  JOIN public.classes AS class_record ON class_record.id = membership.class_id
  JOIN public.profiles AS owner_profile ON owner_profile.id = class_record.teacher_id
  WHERE membership.student_id = auth.uid()
    AND membership.status IN ('active', 'completed')
  ORDER BY class_record.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_class_overview(target_class_id uuid)
RETURNS TABLE (
  id uuid, name text, description text, status text,
  owner_id uuid, owner_name text, owner_email text,
  current_access text, student_count bigint, instructor_count bigint,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_class_teacher(target_class_id)
    OR public.is_class_member(target_class_id)
  ) THEN
    RAISE EXCEPTION 'Class not found or access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT class_record.id, class_record.name, class_record.description,
    class_record.status, owner_profile.id, owner_profile.full_name,
    owner_profile.email,
    CASE
      WHEN class_record.teacher_id = auth.uid() THEN 'owner'
      WHEN public.is_class_teacher(class_record.id) THEN 'instructor'
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
$$;

CREATE OR REPLACE FUNCTION public.get_class_students(target_class_id uuid)
RETURNS TABLE (
  membership_id uuid, student_id uuid, full_name text, email text,
  membership_status text, joined_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_class_teacher(target_class_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.get_class_invitations(target_class_id uuid)
RETURNS TABLE (
  id uuid, email text, status text, created_at timestamptz,
  accepted_at timestamptz, expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_class_owner(target_class_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.get_class_instructors(target_class_id uuid)
RETURNS TABLE (
  relationship_id uuid, teacher_id uuid, full_name text, email text,
  avatar_url text, teacher_role text, created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_class_teacher(target_class_id)
    OR public.is_class_member(target_class_id)
  ) THEN
    RAISE EXCEPTION 'Class not found or access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT class_teacher.id, class_teacher.teacher_id, profile.full_name,
    CASE WHEN public.is_class_teacher(target_class_id) THEN profile.email ELSE NULL END,
    profile.avatar_url, class_teacher.role,
    class_teacher.created_at
  FROM public.class_teachers AS class_teacher
  JOIN public.profiles AS profile ON profile.id = class_teacher.teacher_id
  WHERE class_teacher.class_id = target_class_id
  ORDER BY CASE class_teacher.role WHEN 'owner' THEN 0 ELSE 1 END,
    profile.full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_student_class_overview(target_class_id uuid)
RETURNS TABLE (
  id uuid, name text, description text, status text,
  owner_id uuid, owner_name text, owner_email text,
  current_access text, student_count bigint, instructor_count bigint,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_class_member(target_class_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.get_my_student_class_instructors(target_class_id uuid)
RETURNS TABLE (
  relationship_id uuid, teacher_id uuid, full_name text, email text,
  avatar_url text, teacher_role text, created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_class_member(target_class_id) THEN
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
$$;

REVOKE ALL ON FUNCTION public.create_class(text, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.update_owned_class(uuid, text, text, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.create_class_invitations(uuid, text[]) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.revoke_class_invitation(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.claim_my_class_invitations() FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.add_class_instructor_by_email(uuid, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.remove_class_instructor(uuid, uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_my_teacher_classes() FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_my_student_classes() FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_class_overview(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_class_students(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_class_invitations(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_class_instructors(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_my_student_class_overview(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_my_student_class_instructors(uuid) FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.create_class(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_owned_class(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_class_invitations(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_class_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_my_class_invitations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_class_instructor_by_email(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_class_instructor(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_teacher_classes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_student_classes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_class_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_class_students(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_class_invitations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_class_instructors(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_student_class_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_student_class_instructors(uuid) TO authenticated;

COMMIT;
