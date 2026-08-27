import { useEffect, useState, type FormEvent } from "react";
import { DialogFrame } from "@/components/common/CourseForms";
import { Button } from "@/components/ui/button";
import { listAssignmentLessonOptions } from "@/services/assignmentService";
import type {
  AssignmentLessonOption,
  AssignmentRecord,
  ManagedClass,
} from "@/types";
import { useTranslation } from "react-i18next";

export interface AssignmentFormValue {
  classId: string;
  lessonId: string | null;
  title: string;
  description: string;
  dueAt: string | null;
  allowLate: boolean;
}

function localDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

export function AssignmentFormDialog({
  classes,
  initial,
  onClose,
  onSave,
}: {
  classes: ManagedClass[];
  initial?: AssignmentRecord;
  onClose: () => void;
  onSave: (value: AssignmentFormValue) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [classId, setClassId] = useState(
    initial?.classId ?? classes[0]?.id ?? "",
  );
  const [lessonId, setLessonId] = useState(initial?.lessonId ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueAt, setDueAt] = useState(localDateTime(initial?.dueAt));
  const [allowLate, setAllowLate] = useState(
    initial?.allowLateSubmission ?? true,
  );
  const [lessons, setLessons] = useState<AssignmentLessonOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    if (!classId) {
      setLessons([]);
      return;
    }
    void listAssignmentLessonOptions(classId)
      .then((items) => {
        if (live) setLessons(items);
      })
      .catch(() => {
        if (live) setLessons([]);
      });
    return () => {
      live = false;
    };
  }, [classId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!classId || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onSave({
        classId,
        lessonId: lessonId || null,
        title: title.trim(),
        description,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        allowLate,
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "assignments.saveFailed",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogFrame
      title={t(initial ? "assignments.edit" : "assignments.create")}
      description={t("assignments.draftHelp")}
      onClose={onClose}
    >
      <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        <label className="block text-sm font-medium">
          {t("common.title")} *
          <input
            autoFocus
            maxLength={160}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border bg-background px-3"
            placeholder={t("assignments.titlePlaceholder")}
          />
          <span className="mt-1.5 block text-xs font-normal text-muted-foreground">
            {t("assignments.titleHelp")}
          </span>
        </label>
        <label className="block text-sm font-medium">
          {t("classes.class")} *
          <select
            disabled={Boolean(initial)}
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value);
              setLessonId("");
            }}
            className="mt-2 h-10 w-full rounded-md border bg-background px-3"
          >
            <option value="">{t("assignments.selectClass")}</option>
            {classes.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          {t("lessons.lesson")}{" "}
          <span className="font-normal text-muted-foreground">
            ({t("common.optional")})
          </span>
          <select
            disabled={Boolean(initial)}
            value={lessonId}
            onChange={(event) => setLessonId(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border bg-background px-3"
          >
            <option value="">{t("assignments.classLevel")}</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.moduleTitle} — {lesson.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          {t("common.description")}{" "}
          <span className="font-normal text-muted-foreground">
            ({t("common.optional")})
          </span>
          <textarea
            maxLength={10000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-2 min-h-28 w-full rounded-md border bg-background p-3"
          />
        </label>
        <label className="block text-sm font-medium">
          {t("assignments.due")}{" "}
          <span className="font-normal text-muted-foreground">
            ({t("common.optional")})
          </span>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border bg-background px-3"
          />
          <span className="mt-1.5 block text-xs font-normal text-muted-foreground">
            {t("assignments.dueHelp")}
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            checked={allowLate}
            onChange={(event) => setAllowLate(event.target.checked)}
          />
          <span>
            <span className="font-medium">{t("assignments.allowLate")}</span>
            <span className="mt-0.5 block text-muted-foreground">
              {t("assignments.allowLateHelp")}
            </span>
          </span>
        </label>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error.includes(".") && !error.includes(" ") ? t(error) : error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || !classId || !title.trim()}>
            {busy
              ? t("common.saving")
              : initial
                ? t("classes.saveChanges")
                : t("assignments.saveDraft")}
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}

export function ReviewDialog({
  action,
  initial = "",
  onClose,
  onSave,
}: {
  action: "reviewed" | "revision_requested";
  initial?: string;
  onClose: () => void;
  onSave: (message: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revision = action === "revision_requested";
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (revision && !message.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onSave(message.trim());
    } catch {
      setError("submissions.reviewFailed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogFrame
      title={t(
        revision ? "submissions.requestRevision" : "submissions.markReviewed",
      )}
      description={
        revision ? t("submissions.revisionHelp") : t("submissions.reviewedHelp")
      }
      onClose={onClose}
    >
      <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        <label className="block text-sm font-medium">
          {t("submissions.feedback")}{" "}
          {revision ? (
            "*"
          ) : (
            <span className="font-normal text-muted-foreground">
              ({t("common.optional")})
            </span>
          )}
          <textarea
            autoFocus
            maxLength={5000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="mt-2 min-h-32 w-full rounded-md border bg-background p-3"
            placeholder={t("submissions.feedbackPlaceholder")}
          />
        </label>
        {error && <p className="text-sm text-destructive">{t(error)}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || (revision && !message.trim())}>
            {busy
              ? t("common.saving")
              : revision
                ? t("submissions.requestRevision")
                : t("submissions.markReviewed")}
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}
