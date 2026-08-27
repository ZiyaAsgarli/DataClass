import { useCallback } from "react";
import { CalendarDays, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/DataState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAsyncData } from "@/hooks/useAsyncData";
import { AppShell } from "@/layouts/AppShell";
import { listStudentAssignments } from "@/services/assignmentService";
import { useLocalized } from "@/i18n/useLocalized";

export function StudentAssignmentsPage() {
  const { t, dateTime, studentAssignmentStatus } = useLocalized();
  const loader = useCallback(() => listStudentAssignments(), []);
  const { data, loading, error, reload } = useAsyncData(loader);
  return (
    <AppShell role="student" title="common.assignments">
      <div>
        <p className="page-kicker">{t("assignments.coursework")}</p>
        <h1 className="page-title">{t("assignments.title")}</h1>
        <p className="page-description">{t("assignments.studentHelp")}</p>
      </div>
      <div className="mt-8">
        {loading ? (
          <LoadingState label="assignments.loading" />
        ) : error || !data ? (
          <ErrorState retry={() => void reload()} />
        ) : !data.length ? (
          <EmptyState
            title="assignments.none"
            description="assignments.noneStudent"
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.map((assignment) => (
              <Card
                key={assignment.id}
                className={
                  assignment.submissionStatus === "revision_requested"
                    ? "border-rose-300/60 bg-rose-50/55 p-5 dark:border-rose-900 dark:bg-rose-950/20 sm:p-6"
                    : "border-[var(--strong-border)] p-5 sm:p-6"
                }
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <StatusBadge
                      status={assignment.submissionStatus ?? "upcoming"}
                      label={studentAssignmentStatus(assignment)}
                    />
                    <h2 className="mt-3 truncate text-lg font-semibold">
                      {assignment.title}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {assignment.className}
                      {assignment.lessonTitle
                        ? ` · ${assignment.lessonTitle}`
                        : ""}
                    </p>
                  </div>
                  <span className="icon-tile shrink-0">
                    <ClipboardList className="size-5" />
                  </span>
                </div>
                <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="size-4" />
                  {assignment.dueAt
                    ? dateTime(assignment.dueAt)
                    : t("assignments.noDue")}
                </p>
                {assignment.submissionStatus === "revision_requested" && (
                  <p className="mt-4 text-sm font-medium text-rose-800 dark:text-rose-300">
                    {t("assignments.feedbackAvailable")}
                  </p>
                )}
                <div className="mt-5 flex items-center justify-between border-t pt-4">
                  <span className="text-xs text-muted-foreground">
                    {assignment.lessonTitle || t("assignments.classAssignment")}
                  </span>
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/student/assignments/${assignment.id}`}>
                      {t("assignments.open")}
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
