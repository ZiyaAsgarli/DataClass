import { useCallback, useState } from "react";
import { CalendarDays, ClipboardList, Plus, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AssignmentFormDialog } from "@/components/common/AssignmentForms";
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
import {
  createAssignment,
  listTeacherAssignments,
} from "@/services/assignmentService";
import { listTeacherClasses } from "@/services/classService";
import { useLocalized } from "@/i18n/useLocalized";

export function TeacherAssignmentsPage() {
  const { t, dateTime, assignmentStatus } = useLocalized();
  const navigate = useNavigate();
  const loader = useCallback(
    async () => ({
      assignments: await listTeacherAssignments(),
      classes: await listTeacherClasses(),
    }),
    [],
  );
  const { data, loading, error, reload } = useAsyncData(loader);
  const [creating, setCreating] = useState(false);
  return (
    <AppShell role="teacher" title="common.assignments">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-kicker">{t("assignments.coursework")}</p>
          <h1 className="page-title">{t("assignments.title")}</h1>
          <p className="page-description">{t("assignments.teacherHelp")}</p>
        </div>
        <Button
          disabled={!data?.classes.length}
          onClick={() => setCreating(true)}
        >
          <Plus />
          {t("assignments.create")}
        </Button>
      </div>
      <div className="mt-8">
        {loading ? (
          <LoadingState label="assignments.loading" />
        ) : error || !data ? (
          <ErrorState retry={() => void reload()} />
        ) : !data.assignments.length ? (
          <EmptyState
            title="assignments.none"
            description="assignments.noneTeacher"
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus />
                {t("assignments.create")}
              </Button>
            }
          />
        ) : (
          <Card className="overflow-hidden border-[var(--strong-border)]">
            <div className="hidden grid-cols-12 gap-4 border-b bg-muted/55 px-5 py-3.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground lg:grid">
              <div className="col-span-4">
                {t("assignments.assignmentColumn")}
              </div>
              <div className="col-span-2">{t("assignments.classColumn")}</div>
              <div className="col-span-2">{t("assignments.dueColumn")}</div>
              <div className="col-span-2">
                {t("assignments.submissionsColumn")}
              </div>
              <div className="col-span-1">{t("common.status")}</div>
              <div className="col-span-1 text-right">{t("common.action")}</div>
            </div>
            <div className="divide-y">
              {data.assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="grid gap-4 p-5 transition-colors hover:bg-muted/35 lg:grid-cols-12 lg:items-center"
                >
                  <div className="min-w-0 lg:col-span-4">
                    <div className="flex items-start gap-3">
                      <span className="icon-tile size-9 shrink-0 rounded-xl">
                        <ClipboardList className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate font-semibold">
                          {assignment.title}
                        </h2>
                        {assignment.lessonTitle && (
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {t("assignments.lessonPrefix", {
                              title: assignment.lessonTitle,
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm lg:col-span-2">
                    <span className="mr-1 text-xs text-muted-foreground lg:hidden">
                      {t("assignments.classPrefix")}
                    </span>
                    {assignment.className}
                  </p>
                  <p className="flex items-center gap-2 text-sm text-muted-foreground lg:col-span-2">
                    <CalendarDays className="size-4 lg:hidden" />
                    {assignment.dueAt
                      ? dateTime(assignment.dueAt)
                      : t("assignments.noDue")}
                  </p>
                  <div className="text-sm lg:col-span-2">
                    <p className="flex items-center gap-2">
                      <Users className="size-4 text-muted-foreground" />
                      {t("assignments.submittedRatio", {
                        submitted: assignment.submittedCount ?? 0,
                        total: assignment.totalStudents ?? 0,
                      })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("assignments.reviewedCount", {
                        count: assignment.reviewedCount ?? 0,
                      })}
                    </p>
                  </div>
                  <div className="lg:col-span-1">
                    <StatusBadge
                      status={assignment.status}
                      label={assignmentStatus(assignment.status)}
                    />
                  </div>
                  <div className="lg:col-span-1 lg:text-right">
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/teacher/assignments/${assignment.id}`}>
                        {t("common.open")}
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
      {creating && data && (
        <AssignmentFormDialog
          classes={data.classes}
          onClose={() => setCreating(false)}
          onSave={async (value) => {
            const id = await createAssignment(value);
            setCreating(false);
            await reload();
            navigate(`/teacher/assignments/${id}`);
          }}
        />
      )}
    </AppShell>
  );
}
