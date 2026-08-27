import { useCallback, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/DataState";
import { ClassCard } from "@/components/teacher/ClassCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAsyncData } from "@/hooks/useAsyncData";
import { AppShell } from "@/layouts/AppShell";
import { createClass, listTeacherClasses } from "@/services/classService";
import { listTeacherClassModules } from "@/services/moduleService";
import { useTranslation } from "react-i18next";

function CreateClassDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("classes.required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      navigate(`/teacher/classes/${await createClass(name, description)}`);
    } catch {
      setError("classes.createFailed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-class-title"
      aria-describedby="create-class-description"
    >
      <Card className="w-full max-w-lg border-[var(--strong-border)] p-6 shadow-[var(--shadow-2)] sm:p-7">
        <div className="flex items-start justify-between">
          <div>
            <h2
              id="create-class-title"
              className="text-2xl font-semibold tracking-[-0.025em]"
            >
              {t("classes.createTitle")}
            </h2>
            <p
              id="create-class-description"
              className="mt-1 text-sm text-muted-foreground"
            >
              {t("classes.createHelp")}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X />
          </Button>
        </div>
        <form
          className="mt-6 space-y-5"
          onSubmit={(event) => void submit(event)}
        >
          <label className="block text-sm font-medium">
            {t("classes.name")} *
            <input
              autoFocus
              maxLength={160}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder={t("classes.namePlaceholder")}
            />
            <span className="mt-1.5 block text-xs font-normal text-muted-foreground">
              {t("classes.nameHelp")}
            </span>
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
              className="mt-2 min-h-28 w-full resize-y rounded-md border bg-background p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder={t("classes.descriptionPlaceholder")}
            />
          </label>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {t(error)}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("common.creating") : t("classes.create")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export function TeacherClassesPage() {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const loader = useCallback(async () => {
    const classes = await listTeacherClasses();
    const modules = (
      await Promise.all(
        classes.map((course) => listTeacherClassModules(course.id)),
      )
    ).flat();
    return { classes, modules };
  }, []);
  const { data, loading, error, reload } = useAsyncData(loader);
  return (
    <AppShell role="teacher" title="common.classes">
      <div className="animate-enter flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-kicker">{t("classes.teacherWorkspace")}</p>
          <h1 className="page-title">{t("classes.my")}</h1>
          <p className="page-description">{t("classes.teacherHelp")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus />
          {t("classes.create")}
        </Button>
      </div>
      <div className="animate-enter-delay mt-8">
        {loading ? (
          <LoadingState label="classes.loading" />
        ) : error ? (
          <ErrorState retry={() => void reload()} />
        ) : !data?.classes.length ? (
          <EmptyState
            title="classes.none"
            description="classes.noneTeacher"
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus />
                {t("classes.create")}
              </Button>
            }
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {data.classes.map((course) => (
              <ClassCard
                key={course.id}
                course={course}
                currentModule={
                  data.modules.find(
                    (module) =>
                      module.classId === course.id &&
                      module.lifecycleStatus === "active" &&
                      (module.status === "active" ||
                        module.status === "completed"),
                  )?.title
                }
              />
            ))}
          </div>
        )}
      </div>
      {creating && <CreateClassDialog onClose={() => setCreating(false)} />}
    </AppShell>
  );
}
