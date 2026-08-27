import { useId, useState, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { LessonLifecycleStatus, ModuleStatus } from "@/types";
import { useTranslation } from "react-i18next";
import { useLocalized } from "@/i18n/useLocalized";

export function DialogFrame({
  title,
  description,
  onClose,
  children,
  className,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <Card
        className={`max-h-[92vh] w-full max-w-lg overflow-y-auto border-[var(--strong-border)] p-6 shadow-[var(--shadow-2)] sm:p-7 ${className ?? ""}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id={titleId}
              className="text-2xl font-semibold tracking-[-0.025em]"
            >
              {title}
            </h2>
            <p
              id={descriptionId}
              className="mt-1 text-sm text-muted-foreground"
            >
              {description}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label={t("accessibility.closeDialog")}
          >
            <X />
          </Button>
        </div>
        {children}
      </Card>
    </div>
  );
}

export function ModuleFormDialog({
  initial,
  allowStatus = false,
  onClose,
  onSave,
}: {
  initial?: { title: string; description: string; status: ModuleStatus };
  allowStatus?: boolean;
  onClose: () => void;
  onSave: (
    title: string,
    description: string,
    status: ModuleStatus,
  ) => Promise<void>;
}) {
  const { t, moduleAvailability } = useLocalized();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<ModuleStatus>(
    initial?.status ?? "active",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onSave(title, description, status);
    } catch (error) {
      setError(
        error instanceof Error &&
          error.message.includes(
            "Change the module teaching status before archiving",
          )
          ? "modules.archiveActive"
          : "modules.saveFailed",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogFrame
      title={t(initial ? "modules.edit" : "modules.create")}
      description={t("modules.formHelp")}
      onClose={onClose}
    >
      <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        <label className="block text-sm font-medium">
          {t("modules.name")} *
          <input
            autoFocus
            maxLength={160}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border bg-background px-3"
            placeholder={t("modules.placeholder")}
          />
        </label>
        <label className="block text-sm font-medium">
          {t("common.description")}{" "}
          <span className="font-normal text-muted-foreground">
            ({t("common.optional")})
          </span>
          <textarea
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-2 min-h-28 w-full rounded-md border bg-background p-3"
          />
        </label>
        {allowStatus && (
          <label className="block text-sm font-medium">
            {t("modules.availability")}
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as ModuleStatus)
              }
              className="mt-2 h-10 w-full rounded-md border bg-background px-3"
            >
              <option value="active">{moduleAvailability("active")}</option>
              <option value="completed">
                {moduleAvailability("completed")}
              </option>
              <option value="archived">{moduleAvailability("archived")}</option>
            </select>
            <span className="mt-1.5 block text-xs font-normal text-muted-foreground">
              {t("modules.availabilityHelp")}
            </span>
          </label>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {t(error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || !title.trim()}>
            {busy
              ? t("common.saving")
              : initial
                ? t("classes.saveChanges")
                : t("modules.create")}
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}

export function LessonFormDialog({
  initial,
  onClose,
  onSave,
}: {
  initial?: {
    title: string;
    description: string;
    lessonDate: string;
    status: LessonLifecycleStatus;
  };
  onClose: () => void;
  onSave: (
    title: string,
    description: string,
    lessonDate: string,
    status: LessonLifecycleStatus,
  ) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [lessonDate, setLessonDate] = useState(initial?.lessonDate ?? "");
  const [status] = useState<LessonLifecycleStatus>(initial?.status ?? "draft");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onSave(title, description, lessonDate, status);
    } catch {
      setError("lessons.saveFailed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogFrame
      title={t(initial ? "lessons.edit" : "lessons.create")}
      description={t("lessons.formHelp")}
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
            placeholder={t("lessons.placeholder")}
          />
        </label>
        <label className="block text-sm font-medium">
          {t("common.description")}{" "}
          <span className="font-normal text-muted-foreground">
            ({t("common.optional")})
          </span>
          <textarea
            maxLength={4000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-2 min-h-28 w-full rounded-md border bg-background p-3"
          />
        </label>
        <label className="block text-sm font-medium">
          {t("lessons.date")}{" "}
          <span className="font-normal text-muted-foreground">
            ({t("common.optional")})
          </span>
          <input
            type="date"
            value={lessonDate}
            onChange={(event) => setLessonDate(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border bg-background px-3"
          />
        </label>
        <p className="text-xs text-muted-foreground">{t("lessons.newDraft")}</p>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {t(error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || !title.trim()}>
            {busy
              ? t("common.saving")
              : initial
                ? t("classes.saveChanges")
                : t("lessons.create")}
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}
