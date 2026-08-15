BEGIN;

CREATE TABLE public.class_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL
    REFERENCES public.classes (id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL
    REFERENCES public.profiles (id) ON DELETE RESTRICT,
  role text NOT NULL
    CHECK (role IN ('owner', 'instructor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, teacher_id)
);

CREATE UNIQUE INDEX class_teachers_one_owner_idx
  ON public.class_teachers (class_id)
  WHERE role = 'owner';

CREATE INDEX class_teachers_teacher_id_idx
  ON public.class_teachers (teacher_id);

CREATE TABLE public.module_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL
    REFERENCES public.modules (id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL
    REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, teacher_id)
);

CREATE INDEX module_teachers_teacher_id_idx
  ON public.module_teachers (teacher_id);

ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_teachers ENABLE ROW LEVEL SECURITY;

COMMIT;
