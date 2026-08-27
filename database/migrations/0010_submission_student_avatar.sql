BEGIN;

-- PostgreSQL cannot change a RETURNS TABLE shape with CREATE OR REPLACE.
-- Recreate the exact authorized submission-detail function transactionally,
-- adding only the student's existing application profile avatar URL.
DROP FUNCTION public.get_submission_detail(uuid);

CREATE FUNCTION public.get_submission_detail(target_submission_id uuid)
RETURNS TABLE (
  submission_id uuid,
  assignment_id uuid,
  assignment_title text,
  student_id uuid,
  student_name text,
  student_email text,
  student_avatar_url text,
  submission_status text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  feedback_message text,
  can_review boolean,
  was_late boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_assignment_id uuid;
  owner_student_id uuid;
  current_status text;
BEGIN
  SELECT submission.assignment_id, submission.student_id, submission.status
  INTO target_assignment_id, owner_student_id, current_status
  FROM public.submissions AS submission
  WHERE submission.id = target_submission_id;

  IF auth.uid() IS NULL OR target_assignment_id IS NULL OR NOT (
    owner_student_id = auth.uid()
    OR (current_status <> 'draft' AND public.can_manage_assignment(target_assignment_id))
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
    public.can_manage_assignment(assignment.id),
    submission.was_late
  FROM public.submissions AS submission
  JOIN public.assignments AS assignment ON assignment.id = submission.assignment_id
  JOIN public.profiles AS profile ON profile.id = submission.student_id
  LEFT JOIN public.submission_feedback AS feedback ON feedback.submission_id = submission.id
  WHERE submission.id = target_submission_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_submission_detail(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_submission_detail(uuid) FROM anonymous;
GRANT EXECUTE ON FUNCTION public.get_submission_detail(uuid) TO authenticated;

COMMIT;
