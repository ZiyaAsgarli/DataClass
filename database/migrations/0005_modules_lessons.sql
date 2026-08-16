BEGIN;

CREATE OR REPLACE FUNCTION public.is_module_instructor(target_module_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.module_teachers AS module_teacher
    WHERE module_teacher.module_id = target_module_id
      AND module_teacher.teacher_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_module(target_module_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.modules AS module_record
    WHERE module_record.id = target_module_id
      AND (
        public.is_class_owner(module_record.class_id)
        OR public.is_module_instructor(module_record.id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_module(target_module_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.modules AS module_record
    WHERE module_record.id = target_module_id
      AND (
        public.is_class_teacher(module_record.class_id)
        OR (
          public.is_class_member(module_record.class_id)
          AND module_record.status IN ('active', 'completed')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_lesson(target_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lessons AS lesson
    JOIN public.modules AS module_record ON module_record.id = lesson.module_id
    WHERE lesson.id = target_lesson_id
      AND (
        public.is_class_teacher(module_record.class_id)
        OR (
          public.is_class_member(module_record.class_id)
          AND module_record.status IN ('active', 'completed')
          AND lesson.status = 'published'
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_module_instructor(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.can_manage_module(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.can_read_module(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.can_read_lesson(uuid) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.is_module_instructor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_module(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_module(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_lesson(uuid) TO authenticated;

CREATE POLICY modules_read_authorized
  ON public.modules
  FOR SELECT
  TO authenticated
  USING (public.can_read_module(id));

CREATE POLICY lessons_read_authorized
  ON public.lessons
  FOR SELECT
  TO authenticated
  USING (public.can_read_lesson(id));

CREATE POLICY module_teachers_read_authorized
  ON public.module_teachers
  FOR SELECT
  TO authenticated
  USING (public.can_read_module(module_id));

GRANT SELECT ON public.modules, public.lessons, public.module_teachers TO authenticated;
REVOKE ALL ON public.modules, public.lessons, public.module_teachers FROM anonymous;

CREATE OR REPLACE FUNCTION public.create_module(
  target_class_id uuid,
  module_title text,
  module_description text DEFAULT NULL
)
RETURNS TABLE (module_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  normalized_title text := btrim(module_title);
  normalized_description text := NULLIF(btrim(module_description), '');
  next_position integer;
  new_module_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_class_owner(target_class_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.update_module(
  target_module_id uuid,
  module_title text,
  module_description text DEFAULT NULL,
  module_status text DEFAULT 'active'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  normalized_title text := btrim(module_title);
  normalized_description text := NULLIF(btrim(module_description), '');
  module_class_id uuid;
  current_status text;
  owner_access boolean;
BEGIN
  SELECT class_id, status INTO module_class_id, current_status
  FROM public.modules
  WHERE id = target_module_id
  FOR UPDATE;

  IF module_class_id IS NULL OR auth.uid() IS NULL OR NOT public.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Module not found or edit access denied'
      USING ERRCODE = '42501';
  END IF;

  owner_access := public.is_class_owner(module_class_id);

  IF normalized_title IS NULL OR normalized_title = '' OR char_length(normalized_title) > 160 THEN
    RAISE EXCEPTION 'Module title must be between 1 and 160 characters'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_description IS NOT NULL AND char_length(normalized_description) > 2000 THEN
    RAISE EXCEPTION 'Module description must not exceed 2000 characters'
      USING ERRCODE = '22023';
  END IF;

  IF module_status NOT IN ('active', 'completed', 'archived') THEN
    RAISE EXCEPTION 'Module status must be active, completed, or archived'
      USING ERRCODE = '22023';
  END IF;

  IF NOT owner_access AND module_status <> current_status THEN
    RAISE EXCEPTION 'Only the class owner may change module status'
      USING ERRCODE = '42501';
  END IF;

  IF NOT owner_access AND current_status = 'archived' THEN
    RAISE EXCEPTION 'Archived modules may only be edited by the class owner'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.modules
  SET title = normalized_title,
      description = normalized_description,
      status = module_status
  WHERE id = target_module_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_module(
  target_module_id uuid,
  move_direction text
)
RETURNS TABLE (new_position integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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

  IF target_class_id IS NULL OR auth.uid() IS NULL OR NOT public.is_class_owner(target_class_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.assign_module_instructor(
  target_module_id uuid,
  target_teacher_id uuid
)
RETURNS TABLE (outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_class_id uuid;
BEGIN
  SELECT class_id INTO target_class_id
  FROM public.modules
  WHERE id = target_module_id;

  IF target_class_id IS NULL OR auth.uid() IS NULL OR NOT public.is_class_owner(target_class_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.remove_module_instructor(
  target_module_id uuid,
  target_teacher_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_class_id uuid;
BEGIN
  SELECT class_id INTO target_class_id
  FROM public.modules
  WHERE id = target_module_id;

  IF target_class_id IS NULL OR auth.uid() IS NULL OR NOT public.is_class_owner(target_class_id) THEN
    RAISE EXCEPTION 'Only the class owner may remove module instructors'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.module_teachers
  WHERE module_id = target_module_id AND teacher_id = target_teacher_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Module instructor not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_lesson(
  target_module_id uuid,
  lesson_title text,
  lesson_description text DEFAULT NULL,
  target_lesson_date date DEFAULT NULL
)
RETURNS TABLE (lesson_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  normalized_title text := btrim(lesson_title);
  normalized_description text := NULLIF(btrim(lesson_description), '');
  next_position integer;
  new_lesson_id uuid;
  module_status text;
BEGIN
  SELECT status INTO module_status FROM public.modules WHERE id = target_module_id;

  IF module_status IS NULL OR auth.uid() IS NULL OR NOT public.can_manage_module(target_module_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.update_lesson(
  target_lesson_id uuid,
  lesson_title text,
  lesson_description text DEFAULT NULL,
  target_lesson_date date DEFAULT NULL,
  lesson_status text DEFAULT 'draft'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  normalized_title text := btrim(lesson_title);
  normalized_description text := NULLIF(btrim(lesson_description), '');
  target_module_id uuid;
BEGIN
  SELECT module_id INTO target_module_id
  FROM public.lessons
  WHERE id = target_lesson_id
  FOR UPDATE;

  IF target_module_id IS NULL OR auth.uid() IS NULL OR NOT public.can_manage_module(target_module_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.reorder_lesson(
  target_lesson_id uuid,
  move_direction text
)
RETURNS TABLE (new_position integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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

  IF target_module_id IS NULL OR auth.uid() IS NULL OR NOT public.can_manage_module(target_module_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.list_teacher_class_modules(target_class_id uuid)
RETURNS TABLE (
  id uuid, class_id uuid, title text, description text, module_position integer,
  status text, lesson_count bigint, published_lesson_count bigint,
  instructor_names text[], can_manage boolean, created_at timestamptz,
  updated_at timestamptz
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
  SELECT module_record.id, module_record.class_id, module_record.title,
    module_record.description, module_record.position, module_record.status,
    (SELECT count(*) FROM public.lessons AS lesson
      WHERE lesson.module_id = module_record.id),
    (SELECT count(*) FROM public.lessons AS lesson
      WHERE lesson.module_id = module_record.id AND lesson.status = 'published'),
    COALESCE((
      SELECT array_agg(profile.full_name ORDER BY profile.full_name)
      FROM public.module_teachers AS module_teacher
      JOIN public.profiles AS profile ON profile.id = module_teacher.teacher_id
      WHERE module_teacher.module_id = module_record.id
    ), ARRAY[]::text[]),
    public.can_manage_module(module_record.id),
    module_record.created_at, module_record.updated_at
  FROM public.modules AS module_record
  WHERE module_record.class_id = target_class_id
  ORDER BY module_record.position, module_record.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_teacher_module(target_module_id uuid)
RETURNS TABLE (
  id uuid, class_id uuid, class_name text, title text, description text,
  module_position integer, status text, lesson_count bigint,
  published_lesson_count bigint, instructor_names text[],
  current_access text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_class_id uuid;
BEGIN
  SELECT module_record.class_id INTO target_class_id
  FROM public.modules AS module_record
  WHERE module_record.id = target_module_id;
  IF target_class_id IS NULL OR auth.uid() IS NULL OR NOT public.is_class_teacher(target_class_id) THEN
    RAISE EXCEPTION 'Module not found or teacher access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT module_record.id, module_record.class_id, class_record.name,
    module_record.title, module_record.description, module_record.position,
    module_record.status,
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
      WHEN public.is_class_owner(module_record.class_id) THEN 'owner'
      WHEN public.is_module_instructor(module_record.id) THEN 'module_instructor'
      ELSE 'viewer'
    END,
    module_record.created_at, module_record.updated_at
  FROM public.modules AS module_record
  JOIN public.classes AS class_record ON class_record.id = module_record.class_id
  WHERE module_record.id = target_module_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_module_instructor_options(target_module_id uuid)
RETURNS TABLE (
  teacher_id uuid, full_name text, class_role text, assigned boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_class_id uuid;
BEGIN
  SELECT module_record.class_id INTO target_class_id
  FROM public.modules AS module_record
  WHERE module_record.id = target_module_id;
  IF target_class_id IS NULL OR auth.uid() IS NULL OR NOT public.is_class_owner(target_class_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.list_teacher_module_lessons(target_module_id uuid)
RETURNS TABLE (
  id uuid, module_id uuid, title text, description text, lesson_date date,
  lesson_position integer, status text, published_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_class_id uuid;
BEGIN
  SELECT module_record.class_id INTO target_class_id
  FROM public.modules AS module_record
  WHERE module_record.id = target_module_id;
  IF target_class_id IS NULL OR auth.uid() IS NULL OR NOT public.is_class_teacher(target_class_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.get_teacher_lesson(target_lesson_id uuid)
RETURNS TABLE (
  id uuid, module_id uuid, class_id uuid, class_name text, module_title text,
  title text, description text, lesson_date date, lesson_position integer,
  status text, published_at timestamptz, current_access text,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_class_id uuid;
BEGIN
  SELECT module_record.class_id INTO target_class_id
  FROM public.lessons AS lesson
  JOIN public.modules AS module_record ON module_record.id = lesson.module_id
  WHERE lesson.id = target_lesson_id;

  IF target_class_id IS NULL OR auth.uid() IS NULL OR NOT public.is_class_teacher(target_class_id) THEN
    RAISE EXCEPTION 'Lesson not found or teacher access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT lesson.id, lesson.module_id, module_record.class_id, class_record.name,
    module_record.title, lesson.title, lesson.description, lesson.lesson_date,
    lesson.position, lesson.status, lesson.published_at,
    CASE
      WHEN public.is_class_owner(module_record.class_id) THEN 'owner'
      WHEN public.is_module_instructor(module_record.id) THEN 'module_instructor'
      ELSE 'viewer'
    END,
    lesson.created_at, lesson.updated_at
  FROM public.lessons AS lesson
  JOIN public.modules AS module_record ON module_record.id = lesson.module_id
  JOIN public.classes AS class_record ON class_record.id = module_record.class_id
  WHERE lesson.id = target_lesson_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_student_class_modules(target_class_id uuid)
RETURNS TABLE (
  id uuid, class_id uuid, title text, description text, module_position integer,
  status text, published_lesson_count bigint, instructor_names text[],
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_class_member(target_class_id) THEN
    RAISE EXCEPTION 'Class membership is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT module_record.id, module_record.class_id, module_record.title,
    module_record.description, module_record.position, module_record.status,
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
$$;

CREATE OR REPLACE FUNCTION public.get_student_module(target_module_id uuid)
RETURNS TABLE (
  id uuid, class_id uuid, class_name text, title text, description text,
  module_position integer, status text, instructor_names text[],
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_class_id uuid;
  target_status text;
BEGIN
  SELECT module_record.class_id, module_record.status
  INTO target_class_id, target_status
  FROM public.modules AS module_record
  WHERE module_record.id = target_module_id;

  IF target_class_id IS NULL OR auth.uid() IS NULL
     OR NOT public.is_class_member(target_class_id)
     OR target_status NOT IN ('active', 'completed') THEN
    RAISE EXCEPTION 'Module not found or membership required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT module_record.id, module_record.class_id, class_record.name,
    module_record.title, module_record.description, module_record.position,
    module_record.status,
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
$$;

CREATE OR REPLACE FUNCTION public.list_student_module_lessons(target_module_id uuid)
RETURNS TABLE (
  id uuid, module_id uuid, title text, description text, lesson_date date,
  lesson_position integer, status text, published_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_class_id uuid;
  target_status text;
BEGIN
  SELECT module_record.class_id, module_record.status
  INTO target_class_id, target_status
  FROM public.modules AS module_record
  WHERE module_record.id = target_module_id;

  IF target_class_id IS NULL OR auth.uid() IS NULL
     OR NOT public.is_class_member(target_class_id)
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
$$;

CREATE OR REPLACE FUNCTION public.get_student_lesson(target_lesson_id uuid)
RETURNS TABLE (
  id uuid, module_id uuid, class_id uuid, class_name text, module_title text,
  title text, description text, lesson_date date, lesson_position integer,
  status text, published_at timestamptz, created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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

  IF target_class_id IS NULL OR auth.uid() IS NULL
     OR NOT public.is_class_member(target_class_id)
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
$$;

REVOKE ALL ON FUNCTION public.create_module(uuid, text, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.update_module(uuid, text, text, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.reorder_module(uuid, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.assign_module_instructor(uuid, uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.remove_module_instructor(uuid, uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.create_lesson(uuid, text, text, date) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.update_lesson(uuid, text, text, date, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.reorder_lesson(uuid, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_teacher_class_modules(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_teacher_module(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_module_instructor_options(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_teacher_module_lessons(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_teacher_lesson(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_student_class_modules(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_student_module(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_student_module_lessons(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_student_lesson(uuid) FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.create_module(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_module(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_module(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_module_instructor(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_module_instructor(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_lesson(uuid, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_lesson(uuid, text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_lesson(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_teacher_class_modules(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_module(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_module_instructor_options(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_teacher_module_lessons(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_lesson(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_student_class_modules(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_module(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_student_module_lessons(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_lesson(uuid) TO authenticated;

COMMIT;
