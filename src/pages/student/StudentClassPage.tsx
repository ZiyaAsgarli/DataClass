import { useCallback } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Circle,
  Play,
  UserRound,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "@/components/common/DataState";
import { ModuleLifecycleBadge } from "@/components/common/ModuleLifecycle";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAsyncData } from "@/hooks/useAsyncData";
import { AppShell } from "@/layouts/AppShell";
import { dataErrorMessage } from "@/lib/dataErrors";
import { cn } from "@/lib/utils";
import {
  getMyStudentClassInstructors,
  getMyStudentClassOverview,
} from "@/services/classService";
import { listStudentClassModules } from "@/services/moduleService";
import type { ModuleLifecycleStatus } from "@/types";
import { useLocalized } from "@/i18n/useLocalized";

export function StudentClassPage() {
  const { t, classStatus, accessLabel } = useLocalized();
  const { classId = "" } = useParams();
  const loader = useCallback(async () => {
    const [overview, instructors, modules] = await Promise.all([
      getMyStudentClassOverview(classId),
      getMyStudentClassInstructors(classId),
      listStudentClassModules(classId),
    ]);
    return { overview, instructors, modules };
  }, [classId]);
  const { data, loading, error, reload } = useAsyncData(loader);
  if (loading)
    return (
      <AppShell role="student" title="common.myClasses">
        <LoadingState label="classes.loadingOne" />
      </AppShell>
    );
  if (error || !data)
    return (
      <AppShell role="student" title="common.myClasses">
        <ErrorState
          retry={() => void reload()}
          message={dataErrorMessage(
            error,
            "errors.classUnavailable",
            "errors.classLoad",
          )}
        />
      </AppShell>
    );
  return (
    <AppShell role="student" title="common.myClasses">
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-5">
        <Link to="/student/classes">
          <ArrowLeft />
          {t("classes.back")}
        </Link>
      </Button>
      <Card className="animate-enter overflow-hidden border-[var(--strong-border)] p-5 sm:p-7">
        <StatusBadge
          status={data.overview.status}
          label={classStatus(data.overview.status)}
        />
        <h1 className="mt-4 font-['Hanken_Grotesk'] text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
          {data.overview.name}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {data.overview.description || t("classes.noDescription")}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {data.instructors.map((teacher) => (
            <div
              key={teacher.relationshipId}
              className="flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3"
            >
              <UserRound className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{teacher.fullName}</p>
                <p className="text-xs text-muted-foreground">
                  {teacher.role === "owner"
                    ? t("classes.ownerLead")
                    : accessLabel("instructor")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <section className="animate-enter-delay mt-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">{t("modules.learningPath")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("modules.learningHelp")}
          </p>
        </div>
        {data.modules.length ? (
          <ol className="relative space-y-4 before:absolute before:bottom-7 before:left-5 before:top-7 before:w-px before:bg-border sm:before:left-6">
            {data.modules.map((module, index) => (
              <li key={module.id}>
                <Card
                  className={cn(
                    "group relative p-4 transition-all hover:-translate-y-0.5 hover:border-primary/25 sm:p-5",
                    module.lifecycleStatus === "active" &&
                      "border-primary/45 bg-accent/35 shadow-[0_12px_28px_rgba(47,104,70,0.1)]",
                  )}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <ModulePathIcon
                        status={module.lifecycleStatus}
                        position={index + 1}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{module.title}</h3>
                          <ModuleLifecycleBadge
                            status={module.lifecycleStatus}
                            currentLabel
                          />
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                          {module.description || t("modules.courseSessions")}
                        </p>
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                          {module.publishedLessonCount > 0
                            ? t("common.count.publishedLessons", {
                                count: module.publishedLessonCount,
                              })
                            : module.lifecycleStatus === "upcoming"
                              ? t("modules.lessonsWhen")
                              : t("modules.noPublished")}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={
                        module.lifecycleStatus === "active"
                          ? "default"
                          : "outline"
                      }
                      asChild
                      className="w-full sm:w-auto"
                    >
                      <Link
                        to={`/student/classes/${classId}/modules/${module.id}`}
                      >
                        {t("dashboard.openModule")}
                      </Link>
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        ) : (
          <Card className="flex min-h-40 flex-col items-center justify-center p-6 text-center sm:p-8">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
              <BookOpen />
            </span>
            <h2 className="mt-4 font-semibold">{t("modules.none")}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {t("modules.noneStudent")}
            </p>
          </Card>
        )}
      </section>
    </AppShell>
  );
}

function ModulePathIcon({
  status,
  position,
}: {
  status: ModuleLifecycleStatus;
  position: number;
}) {
  const { t, moduleLifecycle } = useLocalized();
  const Icon =
    status === "completed" ? Check : status === "active" ? Play : Circle;
  return (
    <span
      className={cn(
        "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold shadow-[0_0_0_5px_var(--card)] sm:size-12",
        status === "active"
          ? "border-primary bg-primary text-primary-foreground"
          : status === "completed"
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
            : "border-[var(--strong-border)] bg-muted text-muted-foreground",
      )}
      aria-label={t("accessibility.modulePosition", {
        position,
        status: moduleLifecycle(status, status === "active"),
      })}
    >
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}
