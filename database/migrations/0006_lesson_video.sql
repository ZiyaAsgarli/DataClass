BEGIN;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_video_metadata_pair_check
  CHECK (
    (video_provider IS NULL AND video_url IS NULL AND video_duration_seconds IS NULL)
    OR (video_provider IS NOT NULL AND video_url IS NOT NULL)
  );

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_youtube_url_canonical_check
  CHECK (
    video_provider <> 'youtube'
    OR video_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
  );

CREATE OR REPLACE FUNCTION public.youtube_video_identity(input_url text)
RETURNS TABLE (video_id text, canonical_url text)
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.set_lesson_youtube_video(
  target_lesson_id uuid,
  youtube_url text
)
RETURNS TABLE (video_id text, canonical_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_module_id uuid;
  normalized_video_id text;
  normalized_url text;
BEGIN
  SELECT lesson.module_id INTO target_module_id
  FROM public.lessons AS lesson
  WHERE lesson.id = target_lesson_id;

  IF target_module_id IS NULL OR auth.uid() IS NULL
     OR NOT public.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Lesson not found or recording access denied'
      USING ERRCODE = '42501';
  END IF;

  SELECT identity.video_id, identity.canonical_url
  INTO normalized_video_id, normalized_url
  FROM public.youtube_video_identity(youtube_url) AS identity;

  UPDATE public.lessons
  SET video_provider = 'youtube',
      video_url = normalized_url,
      video_duration_seconds = NULL
  WHERE id = target_lesson_id;

  video_id := normalized_video_id;
  canonical_url := normalized_url;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_lesson_video(target_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_module_id uuid;
BEGIN
  SELECT lesson.module_id INTO target_module_id
  FROM public.lessons AS lesson
  WHERE lesson.id = target_lesson_id;

  IF target_module_id IS NULL OR auth.uid() IS NULL
     OR NOT public.can_manage_module(target_module_id) THEN
    RAISE EXCEPTION 'Lesson not found or recording access denied'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.lessons
  SET video_provider = NULL,
      video_url = NULL,
      video_duration_seconds = NULL
  WHERE id = target_lesson_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_teacher_lesson_video(target_lesson_id uuid)
RETURNS TABLE (
  video_provider text,
  video_id text,
  video_url text,
  video_duration_seconds integer,
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
  SELECT lesson.video_provider,
    CASE
      WHEN lesson.video_provider = 'youtube'
        THEN substring(lesson.video_url FROM 'v=([A-Za-z0-9_-]{11})$')
      ELSE NULL
    END,
    lesson.video_url,
    lesson.video_duration_seconds,
    public.can_manage_module(target_module_id)
  FROM public.lessons AS lesson
  WHERE lesson.id = target_lesson_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_lesson_video(target_lesson_id uuid)
RETURNS TABLE (
  video_provider text,
  video_id text,
  video_duration_seconds integer
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
$$;

REVOKE ALL ON FUNCTION public.youtube_video_identity(text) FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON FUNCTION public.set_lesson_youtube_video(uuid, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.remove_lesson_video(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_teacher_lesson_video(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_student_lesson_video(uuid) FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.set_lesson_youtube_video(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_lesson_video(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_lesson_video(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_lesson_video(uuid) TO authenticated;

COMMIT;
