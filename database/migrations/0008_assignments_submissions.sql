BEGIN;

ALTER TABLE public.assignment_resources
  ADD COLUMN storage_provider text,
  ADD COLUMN upload_status text NOT NULL DEFAULT 'ready',
  ADD COLUMN uploaded_at timestamptz,
  ADD COLUMN storage_etag text;

ALTER TABLE public.assignment_resources
  ADD CONSTRAINT assignment_resources_storage_provider_check
    CHECK (storage_provider IS NULL OR storage_provider = 'b2'),
  ADD CONSTRAINT assignment_resources_upload_status_check
    CHECK (upload_status IN ('pending', 'ready')),
  ADD CONSTRAINT assignment_resources_b2_metadata_check
    CHECK (
      storage_provider <> 'b2'
      OR (
        storage_path IS NOT NULL AND btrim(storage_path) <> ''
        AND external_url IS NULL
        AND file_name IS NOT NULL AND btrim(file_name) <> ''
        AND file_size_bytes > 0 AND file_size_bytes <= 524288000
        AND mime_type IS NOT NULL AND btrim(mime_type) <> ''
      )
    ),
  ADD CONSTRAINT assignment_resources_ready_metadata_check
    CHECK (storage_provider <> 'b2' OR upload_status <> 'ready' OR uploaded_at IS NOT NULL);

CREATE UNIQUE INDEX assignment_resources_storage_path_idx
  ON public.assignment_resources (storage_path)
  WHERE storage_path IS NOT NULL;

CREATE INDEX assignment_resources_assignment_status_position_idx
  ON public.assignment_resources (assignment_id, upload_status, position);

ALTER TABLE public.submissions
  ADD COLUMN draft_version integer,
  ADD COLUMN was_late boolean NOT NULL DEFAULT false;

ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_draft_version_check
    CHECK (draft_version IS NULL OR draft_version >= 1);

ALTER TABLE public.submission_files
  ALTER COLUMN uploaded_at DROP NOT NULL,
  ALTER COLUMN uploaded_at DROP DEFAULT,
  ADD COLUMN resource_kind text NOT NULL,
  ADD COLUMN storage_provider text NOT NULL DEFAULT 'b2',
  ADD COLUMN upload_status text NOT NULL DEFAULT 'ready',
  ADD COLUMN storage_etag text;

ALTER TABLE public.submission_files
  ADD CONSTRAINT submission_files_resource_kind_check
    CHECK (btrim(resource_kind) <> ''),
  ADD CONSTRAINT submission_files_storage_provider_check
    CHECK (storage_provider = 'b2'),
  ADD CONSTRAINT submission_files_upload_status_check
    CHECK (upload_status IN ('pending', 'ready')),
  ADD CONSTRAINT submission_files_b2_metadata_check
    CHECK (
      file_size_bytes > 0 AND file_size_bytes <= 524288000
      AND mime_type IS NOT NULL AND btrim(mime_type) <> ''
    ),
  ADD CONSTRAINT submission_files_ready_metadata_check
    CHECK (upload_status <> 'ready' OR uploaded_at IS NOT NULL);

CREATE UNIQUE INDEX submission_files_storage_path_idx
  ON public.submission_files (storage_path);

CREATE INDEX submission_files_submission_version_status_idx
  ON public.submission_files (submission_id, version, upload_status);

CREATE INDEX submissions_assignment_status_idx
  ON public.submissions (assignment_id, status);

CREATE OR REPLACE FUNCTION public.private_file_extension(file_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT lower(substring(file_name FROM '\.([^.]+)$'));
$$;

CREATE OR REPLACE FUNCTION public.is_supported_private_file_kind(file_kind text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT lower(btrim(file_kind)) IN (
    'xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'pdf', 'pbix', 'pbit',
    'sql', 'ipynb', 'py', 'txt', 'json', 'parquet', 'zip', 'docx', 'pptx'
  );
$$;

CREATE OR REPLACE FUNCTION public.safe_private_file_name(file_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.can_manage_assignment(target_assignment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignments AS assignment
    JOIN public.classes AS class_record ON class_record.id = assignment.class_id
    LEFT JOIN public.lessons AS lesson ON lesson.id = assignment.lesson_id
    WHERE assignment.id = target_assignment_id
      AND auth.uid() IS NOT NULL
      AND (
        class_record.teacher_id = auth.uid()
        OR (lesson.id IS NOT NULL AND public.can_manage_module(lesson.module_id))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.create_assignment(
  target_class_id uuid,
  target_lesson_id uuid,
  assignment_title text,
  assignment_description text,
  assignment_due_at timestamptz,
  assignment_allow_late boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  current_user_id uuid := auth.uid();
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
    IF NOT public.is_class_owner(target_class_id) THEN
      RAISE EXCEPTION 'Only the class owner may create a class-level assignment' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT lesson.module_id INTO lesson_module_id
    FROM public.lessons AS lesson
    JOIN public.modules AS module_record ON module_record.id = lesson.module_id
    WHERE lesson.id = target_lesson_id AND module_record.class_id = target_class_id;
    IF lesson_module_id IS NULL OR NOT public.can_manage_module(lesson_module_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.update_assignment(
  target_assignment_id uuid,
  assignment_title text,
  assignment_description text,
  assignment_due_at timestamptz,
  assignment_allow_late boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE normalized_title text := btrim(assignment_title);
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_assignment(target_assignment_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.set_assignment_status(
  target_assignment_id uuid,
  next_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE normalized_status text := lower(btrim(next_status));
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_assignment(target_assignment_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.list_teacher_assignments()
RETURNS TABLE (
  assignment_id uuid, class_id uuid, class_name text, lesson_id uuid, lesson_title text,
  title text, description text, status text, due_at timestamptz,
  allow_late_submission boolean, published_at timestamptz, created_at timestamptz,
  updated_at timestamptz, total_students bigint, submitted_count bigint,
  reviewed_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
  WHERE auth.uid() IS NOT NULL AND public.can_manage_assignment(assignment.id)
  GROUP BY assignment.id, class_record.name, lesson.title
  ORDER BY assignment.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_student_assignments()
RETURNS TABLE (
  assignment_id uuid, class_id uuid, class_name text, lesson_id uuid, lesson_title text,
  title text, description text, status text, due_at timestamptz,
  allow_late_submission boolean, published_at timestamptz,
  submission_id uuid, submission_status text, submitted_at timestamptz, reviewed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT assignment.id, assignment.class_id, class_record.name,
    assignment.lesson_id, lesson.title, assignment.title, assignment.description,
    assignment.status, assignment.due_at, assignment.allow_late_submission,
    assignment.published_at, submission.id, submission.status,
    submission.submitted_at, submission.reviewed_at
  FROM public.assignments AS assignment
  JOIN public.classes AS class_record ON class_record.id = assignment.class_id
  JOIN public.class_members AS member
    ON member.class_id = assignment.class_id
   AND member.student_id = auth.uid()
   AND member.status = 'active'
  LEFT JOIN public.lessons AS lesson ON lesson.id = assignment.lesson_id
  LEFT JOIN public.submissions AS submission
    ON submission.assignment_id = assignment.id AND submission.student_id = auth.uid()
  WHERE auth.uid() IS NOT NULL AND assignment.status = 'published'
  ORDER BY assignment.due_at NULLS LAST, assignment.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_teacher_assignment(target_assignment_id uuid)
RETURNS TABLE (
  assignment_id uuid, class_id uuid, class_name text, lesson_id uuid, lesson_title text,
  title text, description text, status text, due_at timestamptz,
  allow_late_submission boolean, published_at timestamptz, created_at timestamptz,
  updated_at timestamptz, total_students bigint, submitted_count bigint,
  late_count bigint, revision_requested_count bigint, reviewed_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
    AND auth.uid() IS NOT NULL
    AND public.can_manage_assignment(assignment.id)
  GROUP BY assignment.id, class_record.name, lesson.title;
$$;

CREATE OR REPLACE FUNCTION public.get_student_assignment(target_assignment_id uuid)
RETURNS TABLE (
  assignment_id uuid, class_id uuid, class_name text, lesson_id uuid, lesson_title text,
  title text, description text, status text, due_at timestamptz,
  allow_late_submission boolean, published_at timestamptz,
  submission_id uuid, submission_status text, submitted_at timestamptz,
  reviewed_at timestamptz, feedback_message text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT assignment.id, assignment.class_id, class_record.name,
    assignment.lesson_id, lesson.title, assignment.title, assignment.description,
    assignment.status, assignment.due_at, assignment.allow_late_submission,
    assignment.published_at, submission.id, submission.status,
    submission.submitted_at, submission.reviewed_at, feedback.message
  FROM public.assignments AS assignment
  JOIN public.classes AS class_record ON class_record.id = assignment.class_id
  JOIN public.class_members AS member
    ON member.class_id = assignment.class_id
   AND member.student_id = auth.uid()
   AND member.status = 'active'
  LEFT JOIN public.lessons AS lesson ON lesson.id = assignment.lesson_id
  LEFT JOIN public.submissions AS submission
    ON submission.assignment_id = assignment.id AND submission.student_id = auth.uid()
  LEFT JOIN public.submission_feedback AS feedback ON feedback.submission_id = submission.id
  WHERE assignment.id = target_assignment_id
    AND assignment.status = 'published'
    AND auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.list_assignment_roster(target_assignment_id uuid)
RETURNS TABLE (
  student_id uuid, full_name text, email text, submission_id uuid,
  submission_status text, submitted_at timestamptz, reviewed_at timestamptz,
  was_late boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_assignment(target_assignment_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.list_assignment_lesson_options(target_class_id uuid)
RETURNS TABLE (lesson_id uuid, lesson_title text, module_title text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT lesson.id, lesson.title, module_record.title
  FROM public.lessons AS lesson
  JOIN public.modules AS module_record ON module_record.id = lesson.module_id
  WHERE module_record.class_id = target_class_id
    AND auth.uid() IS NOT NULL
    AND public.can_manage_module(module_record.id)
    AND lesson.status <> 'archived'
  ORDER BY module_record.position, lesson.position;
$$;

CREATE OR REPLACE FUNCTION public.prepare_assignment_resource_upload(
  target_assignment_id uuid,
  original_file_name text,
  expected_file_size_bytes bigint,
  content_type text,
  resource_kind text,
  resource_title text DEFAULT NULL
)
RETURNS TABLE (
  resource_id uuid, storage_path text, file_name text,
  file_size_bytes bigint, mime_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
  IF auth.uid() IS NULL OR NOT public.can_manage_assignment(target_assignment_id) THEN
    RAISE EXCEPTION 'Assignment not found or resource upload access denied' USING ERRCODE = '42501';
  END IF;
  safe_name := public.safe_private_file_name(normalized_file_name);
  extension := public.private_file_extension(normalized_file_name);
  IF NOT public.is_supported_private_file_kind(extension) OR normalized_kind <> extension THEN
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
$$;

CREATE OR REPLACE FUNCTION public.get_assignment_resource_upload_state(target_resource_id uuid)
RETURNS TABLE (
  resource_id uuid, storage_path text, file_name text,
  file_size_bytes bigint, mime_type text, upload_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE target_assignment_id uuid;
BEGIN
  SELECT resource.assignment_id INTO target_assignment_id
  FROM public.assignment_resources AS resource
  WHERE resource.id = target_resource_id AND resource.storage_provider = 'b2';
  IF target_assignment_id IS NULL OR auth.uid() IS NULL
     OR NOT public.can_manage_assignment(target_assignment_id) THEN
    RAISE EXCEPTION 'Resource not found or finalize access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT resource.id, resource.storage_path, resource.file_name,
    resource.file_size_bytes, resource.mime_type, resource.upload_status
  FROM public.assignment_resources AS resource WHERE resource.id = target_resource_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_assignment_resource_upload(
  target_resource_id uuid,
  verified_file_size_bytes bigint,
  verified_storage_etag text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
  IF target_assignment_id IS NULL OR auth.uid() IS NULL
     OR NOT public.can_manage_assignment(target_assignment_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.list_teacher_assignment_resources(target_assignment_id uuid)
RETURNS TABLE (
  id uuid, title text, resource_kind text, file_name text,
  file_size_bytes bigint, mime_type text, resource_position integer,
  uploaded_at timestamptz, can_manage boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_assignment(target_assignment_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.list_student_assignment_resources(target_assignment_id uuid)
RETURNS TABLE (
  id uuid, title text, resource_kind text, file_name text,
  file_size_bytes bigint, mime_type text, resource_position integer,
  uploaded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE target_class_id uuid;
BEGIN
  SELECT assignment.class_id INTO target_class_id
  FROM public.assignments AS assignment
  WHERE assignment.id = target_assignment_id AND assignment.status = 'published';
  IF target_class_id IS NULL OR auth.uid() IS NULL OR NOT public.is_class_member(target_class_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.authorize_assignment_resource_download(target_resource_id uuid)
RETURNS TABLE (
  resource_id uuid, storage_path text, file_name text,
  file_size_bytes bigint, mime_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE target_assignment_id uuid; target_class_id uuid; target_status text;
BEGIN
  SELECT resource.assignment_id, assignment.class_id, assignment.status
  INTO target_assignment_id, target_class_id, target_status
  FROM public.assignment_resources AS resource
  JOIN public.assignments AS assignment ON assignment.id = resource.assignment_id
  WHERE resource.id = target_resource_id
    AND resource.storage_provider = 'b2' AND resource.upload_status = 'ready';
  IF auth.uid() IS NULL OR target_assignment_id IS NULL OR NOT (
    public.can_manage_assignment(target_assignment_id)
    OR (target_status = 'published' AND public.is_class_member(target_class_id))
  ) THEN
    RAISE EXCEPTION 'Resource not found or download access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT resource.id, resource.storage_path, resource.file_name,
    resource.file_size_bytes, resource.mime_type
  FROM public.assignment_resources AS resource WHERE resource.id = target_resource_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_assignment_resource_delete(target_resource_id uuid)
RETURNS TABLE (resource_id uuid, storage_path text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE target_assignment_id uuid;
BEGIN
  SELECT assignment_id INTO target_assignment_id
  FROM public.assignment_resources WHERE id = target_resource_id AND storage_provider = 'b2';
  IF target_assignment_id IS NULL OR auth.uid() IS NULL
     OR NOT public.can_manage_assignment(target_assignment_id) THEN
    RAISE EXCEPTION 'Resource not found or delete access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT id, assignment_resources.storage_path
  FROM public.assignment_resources WHERE id = target_resource_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_assignment_resource_metadata(target_resource_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE target_assignment_id uuid;
BEGIN
  SELECT assignment_id INTO target_assignment_id
  FROM public.assignment_resources WHERE id = target_resource_id FOR UPDATE;
  IF target_assignment_id IS NULL OR auth.uid() IS NULL
     OR NOT public.can_manage_assignment(target_assignment_id) THEN
    RAISE EXCEPTION 'Resource not found or delete access denied' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.assignment_resources WHERE id = target_resource_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_submission_file_upload(
  target_assignment_id uuid,
  original_file_name text,
  expected_file_size_bytes bigint,
  content_type text,
  resource_kind text
)
RETURNS TABLE (
  file_id uuid, submission_id uuid, file_version integer,
  storage_path text, file_name text, file_size_bytes bigint, mime_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  current_user_id uuid := auth.uid();
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
  IF assignment_record.id IS NULL OR NOT public.is_class_member(assignment_record.class_id) THEN
    RAISE EXCEPTION 'Assignment not found or submission access denied' USING ERRCODE = '42501';
  END IF;

  safe_name := public.safe_private_file_name(normalized_file_name);
  extension := public.private_file_extension(normalized_file_name);
  IF NOT public.is_supported_private_file_kind(extension) OR normalized_kind <> extension THEN
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
$$;

CREATE OR REPLACE FUNCTION public.get_submission_file_upload_state(target_file_id uuid)
RETURNS TABLE (
  file_id uuid, storage_path text, file_name text,
  file_size_bytes bigint, mime_type text, upload_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.submission_files AS file
    JOIN public.submissions AS submission ON submission.id = file.submission_id
    WHERE file.id = target_file_id AND submission.student_id = auth.uid()
      AND submission.status IN ('draft', 'revision_requested')
      AND submission.draft_version = file.version
  ) THEN
    RAISE EXCEPTION 'Submission file not found or finalize access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT file.id, file.storage_path, file.file_name,
    file.file_size_bytes, file.mime_type, file.upload_status
  FROM public.submission_files AS file WHERE file.id = target_file_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_submission_file_upload(
  target_file_id uuid,
  verified_file_size_bytes bigint,
  verified_storage_etag text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  expected_size bigint;
  allowed boolean;
  normalized_etag text := NULLIF(btrim(verified_storage_etag), '');
BEGIN
  SELECT file.file_size_bytes,
    submission.student_id = auth.uid()
      AND submission.status IN ('draft', 'revision_requested')
      AND submission.draft_version = file.version
  INTO expected_size, allowed
  FROM public.submission_files AS file
  JOIN public.submissions AS submission ON submission.id = file.submission_id
  WHERE file.id = target_file_id
  FOR UPDATE OF file;
  IF auth.uid() IS NULL OR expected_size IS NULL OR NOT COALESCE(allowed, false) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.submit_my_assignment(target_assignment_id uuid)
RETURNS TABLE (submission_id uuid, submission_status text, submitted_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
  WHERE assignment_id = target_assignment_id AND student_id = auth.uid()
  FOR UPDATE;
  IF auth.uid() IS NULL OR assignment_record.id IS NULL OR submission_record.id IS NULL
     OR NOT public.is_class_member(assignment_record.class_id)
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
$$;

CREATE OR REPLACE FUNCTION public.get_submission_detail(target_submission_id uuid)
RETURNS TABLE (
  submission_id uuid, assignment_id uuid, assignment_title text,
  student_id uuid, student_name text, student_email text,
  submission_status text, submitted_at timestamptz, reviewed_at timestamptz,
  feedback_message text, can_review boolean, was_late boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE target_assignment_id uuid; owner_student_id uuid; current_status text;
BEGIN
  SELECT submission.assignment_id, submission.student_id, submission.status
  INTO target_assignment_id, owner_student_id, current_status
  FROM public.submissions AS submission WHERE submission.id = target_submission_id;
  IF auth.uid() IS NULL OR target_assignment_id IS NULL OR NOT (
    owner_student_id = auth.uid()
    OR (current_status <> 'draft' AND public.can_manage_assignment(target_assignment_id))
  ) THEN
    RAISE EXCEPTION 'Submission not found or access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT submission.id, assignment.id, assignment.title,
    profile.id, profile.full_name, profile.email, submission.status,
    submission.submitted_at, submission.reviewed_at, feedback.message,
    public.can_manage_assignment(assignment.id), submission.was_late
  FROM public.submissions AS submission
  JOIN public.assignments AS assignment ON assignment.id = submission.assignment_id
  JOIN public.profiles AS profile ON profile.id = submission.student_id
  LEFT JOIN public.submission_feedback AS feedback ON feedback.submission_id = submission.id
  WHERE submission.id = target_submission_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_submission_files(target_submission_id uuid)
RETURNS TABLE (
  id uuid, file_name text, resource_kind text, file_size_bytes bigint,
  mime_type text, file_version integer, uploaded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE target_assignment_id uuid; owner_student_id uuid; current_status text;
BEGIN
  SELECT submission.assignment_id, submission.student_id, submission.status
  INTO target_assignment_id, owner_student_id, current_status
  FROM public.submissions AS submission
  WHERE submission.id = target_submission_id;
  IF auth.uid() IS NULL OR target_assignment_id IS NULL OR NOT (
    owner_student_id = auth.uid()
    OR (current_status <> 'draft' AND public.can_manage_assignment(target_assignment_id))
  ) THEN
    RAISE EXCEPTION 'Submission files not found or access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT file.id, file.file_name, file.resource_kind,
    file.file_size_bytes, file.mime_type, file.version, file.uploaded_at
  FROM public.submission_files AS file
  WHERE file.submission_id = target_submission_id AND file.upload_status = 'ready'
  ORDER BY file.version, file.uploaded_at, file.file_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_submission_file_download(target_file_id uuid)
RETURNS TABLE (
  file_id uuid, storage_path text, file_name text,
  file_size_bytes bigint, mime_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE target_assignment_id uuid; owner_student_id uuid; current_status text;
BEGIN
  SELECT submission.assignment_id, submission.student_id, submission.status
  INTO target_assignment_id, owner_student_id, current_status
  FROM public.submission_files AS file
  JOIN public.submissions AS submission ON submission.id = file.submission_id
  WHERE file.id = target_file_id AND file.upload_status = 'ready';
  IF auth.uid() IS NULL OR target_assignment_id IS NULL OR NOT (
    owner_student_id = auth.uid()
    OR (current_status <> 'draft' AND public.can_manage_assignment(target_assignment_id))
  ) THEN
    RAISE EXCEPTION 'Submission file not found or download access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT file.id, file.storage_path, file.file_name,
    file.file_size_bytes, file.mime_type
  FROM public.submission_files AS file WHERE file.id = target_file_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_submission(
  target_submission_id uuid,
  review_action text,
  feedback_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_assignment_id uuid;
  current_status text;
  normalized_action text := lower(btrim(review_action));
  normalized_message text := NULLIF(btrim(feedback_message), '');
BEGIN
  SELECT assignment_id, status INTO target_assignment_id, current_status
  FROM public.submissions WHERE id = target_submission_id FOR UPDATE;
  IF auth.uid() IS NULL OR target_assignment_id IS NULL
     OR NOT public.can_manage_assignment(target_assignment_id) THEN
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
    VALUES (target_submission_id, auth.uid(), normalized_message)
    ON CONFLICT (submission_id) DO UPDATE
      SET teacher_id = EXCLUDED.teacher_id, message = EXCLUDED.message, updated_at = now();
  END IF;

  UPDATE public.submissions
  SET status = normalized_action,
      reviewed_at = CASE WHEN normalized_action = 'reviewed' THEN now() ELSE NULL END,
      draft_version = NULL
  WHERE id = target_submission_id;
END;
$$;

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_feedback ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.assignments FROM authenticated, anonymous;
REVOKE ALL ON public.assignment_resources FROM authenticated, anonymous;
REVOKE ALL ON public.submissions FROM authenticated, anonymous;
REVOKE ALL ON public.submission_files FROM authenticated, anonymous;
REVOKE ALL ON public.submission_feedback FROM authenticated, anonymous;

REVOKE ALL ON FUNCTION public.private_file_extension(text) FROM PUBLIC, authenticated, anonymous;
REVOKE ALL ON FUNCTION public.is_supported_private_file_kind(text) FROM PUBLIC, authenticated, anonymous;
REVOKE ALL ON FUNCTION public.safe_private_file_name(text) FROM PUBLIC, authenticated, anonymous;
REVOKE ALL ON FUNCTION public.can_manage_assignment(uuid) FROM PUBLIC, authenticated, anonymous;
REVOKE ALL ON FUNCTION public.create_assignment(uuid, uuid, text, text, timestamptz, boolean) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.update_assignment(uuid, text, text, timestamptz, boolean) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.set_assignment_status(uuid, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_teacher_assignments() FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_student_assignments() FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_teacher_assignment(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_student_assignment(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_assignment_roster(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_assignment_lesson_options(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.prepare_assignment_resource_upload(uuid, text, bigint, text, text, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_assignment_resource_upload_state(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.finalize_assignment_resource_upload(uuid, bigint, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_teacher_assignment_resources(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_student_assignment_resources(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.authorize_assignment_resource_download(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.authorize_assignment_resource_delete(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.delete_assignment_resource_metadata(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.prepare_submission_file_upload(uuid, text, bigint, text, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_submission_file_upload_state(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.finalize_submission_file_upload(uuid, bigint, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.submit_my_assignment(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_submission_detail(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_submission_files(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.authorize_submission_file_download(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.review_submission(uuid, text, text) FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.create_assignment(uuid, uuid, text, text, timestamptz, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_assignment(uuid, text, text, timestamptz, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_assignment_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_teacher_assignments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_student_assignments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_assignment_roster(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_assignment_lesson_options(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_assignment_resource_upload(uuid, text, bigint, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_assignment_resource_upload_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_assignment_resource_upload(uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_teacher_assignment_resources(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_student_assignment_resources(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_assignment_resource_download(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_assignment_resource_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_assignment_resource_metadata(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_submission_file_upload(uuid, text, bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_submission_file_upload_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_submission_file_upload(uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_my_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_submission_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_submission_files(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_submission_file_download(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_submission(uuid, text, text) TO authenticated;

COMMIT;
