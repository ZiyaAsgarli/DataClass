BEGIN;

ALTER TABLE public.lesson_resources
  ADD COLUMN storage_provider text,
  ADD COLUMN upload_status text NOT NULL DEFAULT 'ready',
  ADD COLUMN uploaded_at timestamptz,
  ADD COLUMN storage_etag text;

ALTER TABLE public.lesson_resources
  ADD CONSTRAINT lesson_resources_storage_provider_check
    CHECK (storage_provider IS NULL OR storage_provider = 'b2'),
  ADD CONSTRAINT lesson_resources_upload_status_check
    CHECK (upload_status IN ('pending', 'ready')),
  ADD CONSTRAINT lesson_resources_b2_metadata_check
    CHECK (
      storage_provider <> 'b2'
      OR (
        storage_path IS NOT NULL
        AND btrim(storage_path) <> ''
        AND external_url IS NULL
        AND file_name IS NOT NULL
        AND btrim(file_name) <> ''
        AND file_size_bytes > 0
        AND file_size_bytes <= 524288000
        AND mime_type IS NOT NULL
        AND btrim(mime_type) <> ''
      )
    ),
  ADD CONSTRAINT lesson_resources_ready_metadata_check
    CHECK (
      storage_provider <> 'b2'
      OR upload_status <> 'ready'
      OR uploaded_at IS NOT NULL
    );

CREATE UNIQUE INDEX lesson_resources_storage_path_idx
  ON public.lesson_resources (storage_path)
  WHERE storage_path IS NOT NULL;

CREATE INDEX lesson_resources_lesson_status_position_idx
  ON public.lesson_resources (lesson_id, upload_status, position);

CREATE OR REPLACE FUNCTION public.prepare_lesson_resource_upload(
  target_lesson_id uuid,
  original_file_name text,
  expected_file_size_bytes bigint,
  content_type text,
  resource_kind text,
  resource_title text DEFAULT NULL
)
RETURNS TABLE (
  resource_id uuid,
  storage_path text,
  file_name text,
  file_size_bytes bigint,
  mime_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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

  IF target_module_id IS NULL OR auth.uid() IS NULL
     OR NOT public.can_manage_module(target_module_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.get_lesson_resource_upload_state(
  target_resource_id uuid
)
RETURNS TABLE (
  resource_id uuid,
  storage_path text,
  file_name text,
  file_size_bytes bigint,
  mime_type text,
  upload_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_module_id uuid;
BEGIN
  SELECT lesson.module_id INTO target_module_id
  FROM public.lesson_resources AS resource
  JOIN public.lessons AS lesson ON lesson.id = resource.lesson_id
  WHERE resource.id = target_resource_id
    AND resource.storage_provider = 'b2';

  IF target_module_id IS NULL OR auth.uid() IS NULL
     OR NOT public.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Resource not found or finalize access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT resource.id, resource.storage_path, resource.file_name,
    resource.file_size_bytes, resource.mime_type, resource.upload_status
  FROM public.lesson_resources AS resource
  WHERE resource.id = target_resource_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_lesson_resource_upload(
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

  IF target_module_id IS NULL OR auth.uid() IS NULL
     OR NOT public.can_manage_module(target_module_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.list_teacher_lesson_resources(
  target_lesson_id uuid
)
RETURNS TABLE (
  id uuid,
  title text,
  resource_kind text,
  file_name text,
  file_size_bytes bigint,
  mime_type text,
  resource_position integer,
  uploaded_at timestamptz,
  can_manage boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_module_id uuid;
  target_class_id uuid;
BEGIN
  SELECT lesson.module_id, module_record.class_id
  INTO target_module_id, target_class_id
  FROM public.lessons AS lesson
  JOIN public.modules AS module_record ON module_record.id = lesson.module_id
  WHERE lesson.id = target_lesson_id;

  IF target_module_id IS NULL OR auth.uid() IS NULL
     OR NOT public.is_class_teacher(target_class_id) THEN
    RAISE EXCEPTION 'Lesson not found or teacher access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT resource.id, resource.title, resource.resource_kind,
    resource.file_name, resource.file_size_bytes, resource.mime_type,
    resource.position, resource.uploaded_at,
    public.can_manage_module(target_module_id)
  FROM public.lesson_resources AS resource
  WHERE resource.lesson_id = target_lesson_id
    AND resource.storage_provider = 'b2'
    AND resource.upload_status = 'ready'
  ORDER BY resource.position, resource.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_student_lesson_resources(
  target_lesson_id uuid
)
RETURNS TABLE (
  id uuid,
  title text,
  resource_kind text,
  file_name text,
  file_size_bytes bigint,
  mime_type text,
  resource_position integer,
  uploaded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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

  IF target_class_id IS NULL OR auth.uid() IS NULL
     OR NOT public.is_class_member(target_class_id)
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
$$;

CREATE OR REPLACE FUNCTION public.authorize_lesson_resource_download(
  target_resource_id uuid
)
RETURNS TABLE (
  resource_id uuid,
  storage_path text,
  file_name text,
  file_size_bytes bigint,
  mime_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
    AND public.is_class_teacher(target_class_id);
  student_allowed := target_class_id IS NOT NULL
    AND public.is_class_member(target_class_id)
    AND target_module_status IN ('active', 'completed')
    AND target_lesson_status = 'published';

  IF auth.uid() IS NULL OR NOT (teacher_allowed OR student_allowed) THEN
    RAISE EXCEPTION 'Resource not found or download access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT resource.id, resource.storage_path, resource.file_name,
    resource.file_size_bytes, resource.mime_type
  FROM public.lesson_resources AS resource
  WHERE resource.id = target_resource_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_lesson_resource_delete(
  target_resource_id uuid
)
RETURNS TABLE (resource_id uuid, storage_path text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_module_id uuid;
BEGIN
  SELECT lesson.module_id INTO target_module_id
  FROM public.lesson_resources AS resource
  JOIN public.lessons AS lesson ON lesson.id = resource.lesson_id
  WHERE resource.id = target_resource_id
    AND resource.storage_provider = 'b2';

  IF target_module_id IS NULL OR auth.uid() IS NULL
     OR NOT public.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Resource not found or delete access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT resource.id, resource.storage_path
  FROM public.lesson_resources AS resource
  WHERE resource.id = target_resource_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_lesson_resource_metadata(
  target_resource_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_module_id uuid;
BEGIN
  SELECT lesson.module_id INTO target_module_id
  FROM public.lesson_resources AS resource
  JOIN public.lessons AS lesson ON lesson.id = resource.lesson_id
  WHERE resource.id = target_resource_id
    AND resource.storage_provider = 'b2'
  FOR UPDATE OF resource;

  IF target_module_id IS NULL OR auth.uid() IS NULL
     OR NOT public.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Resource not found or delete access denied'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.lesson_resources WHERE id = target_resource_id;
END;
$$;

REVOKE ALL ON public.lesson_resources FROM authenticated, anonymous;

REVOKE ALL ON FUNCTION public.prepare_lesson_resource_upload(uuid, text, bigint, text, text, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_lesson_resource_upload_state(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.finalize_lesson_resource_upload(uuid, bigint, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_teacher_lesson_resources(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.list_student_lesson_resources(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.authorize_lesson_resource_download(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.authorize_lesson_resource_delete(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.delete_lesson_resource_metadata(uuid) FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.prepare_lesson_resource_upload(uuid, text, bigint, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lesson_resource_upload_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_lesson_resource_upload(uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_teacher_lesson_resources(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_student_lesson_resources(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_lesson_resource_download(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_lesson_resource_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_lesson_resource_metadata(uuid) TO authenticated;

COMMIT;
