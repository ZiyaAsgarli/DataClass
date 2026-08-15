BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL CHECK (btrim(full_name) <> ''),
  email text NOT NULL UNIQUE,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_auth_user_fk
    FOREIGN KEY (id) REFERENCES neon_auth."user" (id) ON DELETE RESTRICT,
  CONSTRAINT profiles_email_normalized_check
    CHECK (email = lower(btrim(email)) AND email <> '')
);

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('teacher', 'student')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text,
  teacher_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.class_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes (id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'removed')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_id)
);

CREATE TABLE public.class_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes (id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  expires_at timestamptz,
  CONSTRAINT class_invitations_email_normalized_check
    CHECK (email = lower(btrim(email)) AND email <> ''),
  CONSTRAINT class_invitations_accepted_at_check
    CHECK (accepted_at IS NULL OR accepted_at >= created_at),
  CONSTRAINT class_invitations_expires_at_check
    CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE UNIQUE INDEX class_invitations_one_pending_email_idx
  ON public.class_invitations (class_id, email)
  WHERE status = 'pending';

CREATE TABLE public.modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text,
  position integer NOT NULL CHECK (position >= 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, position) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.modules (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text,
  lesson_date date,
  position integer NOT NULL CHECK (position >= 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  video_provider text,
  video_url text,
  video_duration_seconds integer CHECK (video_duration_seconds >= 0),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, position) DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT lessons_video_metadata_check CHECK (
    video_url IS NULL OR (video_provider IS NOT NULL AND btrim(video_provider) <> '')
  )
);

CREATE TABLE public.lesson_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (btrim(title) <> ''),
  resource_kind text NOT NULL CHECK (btrim(resource_kind) <> ''),
  storage_path text,
  external_url text,
  file_name text,
  file_size_bytes bigint CHECK (file_size_bytes >= 0),
  mime_type text,
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, position) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes (id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES public.lessons (id) ON DELETE SET NULL,
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'closed', 'archived')),
  due_at timestamptz,
  allow_late_submission boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.assignment_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (btrim(title) <> ''),
  resource_kind text NOT NULL CHECK (btrim(resource_kind) <> ''),
  storage_path text,
  external_url text,
  file_name text,
  file_size_bytes bigint CHECK (file_size_bytes >= 0),
  mime_type text,
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, position) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments (id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'late', 'reviewed', 'revision_requested', 'resubmitted')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id),
  CONSTRAINT submissions_submitted_at_check
    CHECK (submitted_at IS NULL OR submitted_at >= created_at),
  CONSTRAINT submissions_reviewed_at_check
    CHECK (reviewed_at IS NULL OR (submitted_at IS NOT NULL AND reviewed_at >= submitted_at))
);

CREATE TABLE public.submission_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions (id) ON DELETE CASCADE,
  storage_path text NOT NULL CHECK (btrim(storage_path) <> ''),
  file_name text NOT NULL CHECK (btrim(file_name) <> ''),
  file_size_bytes bigint CHECK (file_size_bytes >= 0),
  mime_type text,
  version integer NOT NULL CHECK (version >= 1),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, version, file_name)
);

CREATE TABLE public.submission_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE REFERENCES public.submissions (id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  message text NOT NULL CHECK (btrim(message) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX classes_teacher_id_idx ON public.classes (teacher_id);
CREATE INDEX class_members_student_id_idx ON public.class_members (student_id);
CREATE INDEX class_invitations_class_id_idx ON public.class_invitations (class_id);
CREATE INDEX class_invitations_email_idx ON public.class_invitations (email);
CREATE INDEX class_invitations_invited_by_idx ON public.class_invitations (invited_by);
CREATE INDEX assignments_class_id_idx ON public.assignments (class_id);
CREATE INDEX assignments_lesson_id_idx ON public.assignments (lesson_id);
CREATE INDEX assignments_created_by_idx ON public.assignments (created_by);
CREATE INDEX submissions_student_id_idx ON public.submissions (student_id);
CREATE INDEX submission_feedback_teacher_id_idx ON public.submission_feedback (teacher_id);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER classes_set_updated_at
  BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER modules_set_updated_at
  BEFORE UPDATE ON public.modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER lessons_set_updated_at
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER assignments_set_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER submissions_set_updated_at
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER submission_feedback_set_updated_at
  BEFORE UPDATE ON public.submission_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_feedback ENABLE ROW LEVEL SECURITY;

COMMIT;
