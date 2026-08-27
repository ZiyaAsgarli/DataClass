import { useCallback } from "react";
import { ArrowLeft, BookOpen, CalendarDays, UserRound } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/DataState";
import { ModuleLifecycleBadge } from "@/components/common/ModuleLifecycle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAsyncData } from "@/hooks/useAsyncData";
import { AppShell } from "@/layouts/AppShell";
import { dataErrorMessage } from "@/lib/dataErrors";
import {
  getStudentModule,
  listStudentModuleLessons,
} from "@/services/moduleService";
import { useLocalized } from "@/i18n/useLocalized";

export function StudentModulePage() {
  const { t, date } = useLocalized();
  const { classId = "", moduleId = "" } = useParams();
  const loader = useCallback(async () => {
    const module = await getStudentModule(moduleId);
    if (module.classId !== classId) throw new Error("Route mismatch.");
    return { module, lessons: await listStudentModuleLessons(moduleId) };
  }, [classId, moduleId]);
  const { data, loading, error, reload } = useAsyncData(loader);
  if (loading)
    return (
      <AppShell role="student" title="modules.module">
        <LoadingState label="modules.loading" />
      </AppShell>
    );
  if (error || !data)
    return (
      <AppShell role="student" title="modules.module">
        <ErrorState
          retry={() => void reload()}
          message={dataErrorMessage(
            error,
            "errors.moduleUnavailable",
            "errors.moduleLoad",
          )}
        />
      </AppShell>
    );
  return (
    <AppShell role="student" title="modules.module">
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-5">
        <Link to={`/student/classes/${classId}`}>
          <ArrowLeft />
          {t("modules.back")}
        </Link>
      </Button>
      <Card className="animate-enter p-5 sm:p-7">
        <ModuleLifecycleBadge
          status={data.module.lifecycleStatus}
          currentLabel
        />
        <h1 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
          {data.module.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {data.module.description || t("modules.noDescription")}
        </p>
        {data.module.lifecycleStatus === "completed" && (
          <p className="mt-3 text-xs font-medium text-primary">
            {t("modules.completedHelp")}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {data.module.instructorNames.map((name) => (
            <span
              key={name}
              className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs"
            >
              <UserRound className="size-3.5" />
              {name}
            </span>
          ))}
        </div>
      </Card>
      <section className="animate-enter-delay mt-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">
            {t("modules.publishedLessons")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("lessons.help")}</p>
        </div>
        {data.lessons.length ? (
          <Card className="divide-y overflow-hidden">
            {data.lessons.map((lesson, index) => (
              <Link
                key={lesson.id}
                to={`/student/classes/${classId}/modules/${moduleId}/lessons/${lesson.id}`}
                className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/40 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-semibold text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{lesson.title}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="size-3.5" />
                      {date(lesson.lessonDate)}
                    </p>
                  </div>
                </div>
                <BookOpen className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </Card>
        ) : (
          <EmptyState
            title={
              data.module.lifecycleStatus === "upcoming"
                ? "modules.notStarted"
                : "modules.noPublished"
            }
            description={
              data.module.lifecycleStatus === "upcoming"
                ? "modules.lessonsWhen"
                : "modules.publishedWhen"
            }
          />
        )}
      </section>
    </AppShell>
  );
}
