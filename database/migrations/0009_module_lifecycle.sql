BEGIN;

-- Availability/archive state remains in modules.status. Teaching progression is separate.
ALTER TABLE public.modules
  ADD COLUMN lifecycle_status text NOT NULL DEFAULT 'upcoming';

ALTER TABLE public.modules
  ADD CONSTRAINT modules_lifecycle_status_check
  CHECK (lifecycle_status IN ('upcoming', 'active', 'completed'));

ALTER TABLE public.modules
  ADD CONSTRAINT modules_active_lifecycle_requires_visible_check
  CHECK (lifecycle_status <> 'active' OR status IN ('active', 'completed'));

CREATE UNIQUE INDEX modules_one_active_lifecycle_per_class_idx
  ON public.modules (class_id)
  WHERE lifecycle_status = 'active';

-- These read RPCs return lifecycle_status in addition to the legacy status.
DROP FUNCTION public.list_teacher_class_modules(uuid);
DROP FUNCTION public.get_teacher_module(uuid);
DROP FUNCTION public.list_student_class_modules(uuid);
DROP FUNCTION public.get_student_module(uuid);

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
  current_lifecycle_status text;
  owner_access boolean;
BEGIN
  SELECT class_id, status, lifecycle_status
  INTO module_class_id, current_status, current_lifecycle_status
  FROM public.modules
  WHERE id = target_module_id
  FOR UPDATE;

  IF module_class_id IS NULL OR auth.uid() IS NULL OR NOT public.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Module not found or edit access denied' USING ERRCODE = '42501';
  END IF;

  owner_access := public.is_class_owner(module_class_id);

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
$$;

CREATE OR REPLACE FUNCTION public.set_module_lifecycle(
  target_module_id uuid,
  requested_lifecycle_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_class_id uuid;
  target_availability_status text;
BEGIN
  SELECT module_record.class_id, module_record.status
  INTO target_class_id, target_availability_status
  FROM public.modules AS module_record
  WHERE module_record.id = target_module_id;

  IF target_class_id IS NULL OR auth.uid() IS NULL
     OR NOT public.is_class_owner(target_class_id) THEN
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
$$;

CREATE FUNCTION public.list_teacher_class_modules(target_class_id uuid)
RETURNS TABLE (
  id uuid, class_id uuid, title text, description text, module_position integer,
  status text, lifecycle_status text, lesson_count bigint,
  published_lesson_count bigint, instructor_names text[], can_manage boolean,
  created_at timestamptz, updated_at timestamptz
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
    public.can_manage_module(module_record.id),
    module_record.created_at, module_record.updated_at
  FROM public.modules AS module_record
  WHERE module_record.class_id = target_class_id
  ORDER BY module_record.position, module_record.created_at;
END;
$$;

CREATE FUNCTION public.get_teacher_module(target_module_id uuid)
RETURNS TABLE (
  id uuid, class_id uuid, class_name text, title text, description text,
  module_position integer, status text, lifecycle_status text,
  lesson_count bigint, published_lesson_count bigint, instructor_names text[],
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
  FROM public.modules AS module_record WHERE module_record.id = target_module_id;

  IF target_class_id IS NULL OR auth.uid() IS NULL
     OR NOT public.is_class_teacher(target_class_id) THEN
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

CREATE FUNCTION public.list_student_class_modules(target_class_id uuid)
RETURNS TABLE (
  id uuid, class_id uuid, title text, description text, module_position integer,
  status text, lifecycle_status text, published_lesson_count bigint,
  instructor_names text[], created_at timestamptz, updated_at timestamptz
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
$$;

CREATE FUNCTION public.get_student_module(target_module_id uuid)
RETURNS TABLE (
  id uuid, class_id uuid, class_name text, title text, description text,
  module_position integer, status text, lifecycle_status text,
  instructor_names text[], created_at timestamptz, updated_at timestamptz
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
  FROM public.modules AS module_record WHERE module_record.id = target_module_id;

  IF target_class_id IS NULL OR auth.uid() IS NULL
     OR NOT public.is_class_member(target_class_id)
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
$$;

REVOKE ALL ON FUNCTION public.list_teacher_class_modules(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_teacher_module(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_student_class_modules(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_student_module(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.set_module_lifecycle(uuid, text) FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.list_teacher_class_modules(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_module(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_student_class_modules(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_module(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_module_lifecycle(uuid, text) TO authenticated;

COMMIT;
