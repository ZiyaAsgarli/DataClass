import { useCallback, useState } from "react";
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  Edit3,
  Send,
  Users,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { TeacherAssignmentResources } from "@/components/common/AssignmentFiles";
import { AssignmentFormDialog } from "@/components/common/AssignmentForms";
import { ErrorState, LoadingState } from "@/components/common/DataState";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAsyncData } from "@/hooks/useAsyncData";
import { AppShell } from "@/layouts/AppShell";
import { dataErrorMessage } from "@/lib/dataErrors";
import {
  getTeacherAssignment,
  listAssignmentRoster,
  setAssignmentStatus,
  updateAssignment,
} from "@/services/assignmentService";
import { listTeacherClasses } from "@/services/classService";
import { useLocalized } from "@/i18n/useLocalized";

export function TeacherAssignmentDetailPage() {
  const { t, dateTime, assignmentStatus, submissionStatus } = useLocalized();
  const { assignmentId = "" } = useParams();
  const loader = useCallback(async () => {
    const [assignment, roster, classes] = await Promise.all([
      getTeacherAssignment(assignmentId),
      listAssignmentRoster(assignmentId),
      listTeacherClasses(),
    ]);
    return { assignment, roster, classes };
  }, [assignmentId]);
  const { data, loading, error, reload } = useAsyncData(loader);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const changeStatus = async (status: "published" | "closed" | "archived") => {
    setBusy(true);
    try {
      await setAssignmentStatus(assignmentId, status);
      await reload();
    } finally {
      setBusy(false);
    }
  };
  if (loading)
    return (
      <AppShell role="teacher" title="assignments.assignment">
        <LoadingState label="assignments.loadingOne" />
      </AppShell>
    );
  if (error || !data)
    return (
      <AppShell role="teacher" title="assignments.assignment">
        <ErrorState
          retry={() => void reload()}
          message={dataErrorMessage(
            error,
            "errors.assignmentAccess",
            "errors.assignmentLoad",
          )}
        />
      </AppShell>
    );
  const { assignment, roster, classes } = data;
  return (
    <AppShell role="teacher" title="assignments.assignment">
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-5">
        <Link to="/teacher/assignments">
          <ArrowLeft />
          {t("assignments.back")}
        </Link>
      </Button>
      <Card className="p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge
                status={assignment.status}
                label={assignmentStatus(assignment.status)}
              />
              {assignment.lessonTitle && (
                <Badge variant="outline">{assignment.lessonTitle}</Badge>
              )}
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
              {assignment.title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {assignment.className}
            </p>
            <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" />
              {assignment.dueAt
                ? dateTime(assignment.dueAt)
                : t("assignments.noDue")}{" "}
              ·{" "}
              {t(
                assignment.allowLateSubmission
                  ? "assignments.lateAllowed"
                  : "assignments.lateBlocked",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Edit3 />
              {t("common.edit")}
            </Button>
            {assignment.status === "draft" && (
              <Button
                disabled={busy}
                onClick={() => void changeStatus("published")}
              >
                <Send />
                {t("common.publish")}
              </Button>
            )}
            {assignment.status === "published" && (
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => void changeStatus("closed")}
              >
                {t("common.close")}
              </Button>
            )}
            {assignment.status !== "archived" && (
              <Button
                disabled={busy}
                variant="ghost"
                onClick={() => void changeStatus("archived")}
              >
                <Archive />
                {t("common.archive")}
              </Button>
            )}
          </div>
        </div>
      </Card>
      <Card className="mt-6 p-5 sm:p-7">
        <h2 className="font-semibold">{t("assignments.instructions")}</h2>
        <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-7">
          {assignment.description || t("assignments.noInstructions")}
        </p>
      </Card>
      <div className="mt-6">
        <TeacherAssignmentResources assignmentId={assignment.id} />
      </div>
      <section className="mt-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label={t("classes.students")}
            value={assignment.totalStudents ?? 0}
          />
          <Metric
            label={submissionStatus("submitted")}
            value={assignment.submittedCount ?? 0}
          />
          <Metric
            label={submissionStatus("late")}
            value={assignment.lateCount ?? 0}
          />
          <Metric
            label={submissionStatus("revision_requested")}
            value={assignment.revisionRequestedCount ?? 0}
          />
          <Metric
            label={submissionStatus("reviewed")}
            value={assignment.reviewedCount ?? 0}
          />
        </div>
        <Card className="mt-4 p-5 sm:p-7">
          <div className="flex items-center gap-2">
            <Users className="size-5" />
            <h2 className="font-semibold">
              {t("assignments.studentsSubmissions")}
            </h2>
          </div>
          <div className="mt-5 space-y-2">
            {!roster.length ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t("assignments.noActiveStudents")}
              </p>
            ) : (
              roster.map((student) => (
                <div
                  key={student.studentId}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {student.fullName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {student.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge
                      status={student.status ?? "draft"}
                      label={submissionStatus(student.status)}
                    />
                    {student.submissionId && (
                      <Button size="sm" variant="outline" asChild>
                        <Link
                          to={`/teacher/assignments/${assignment.id}/submissions/${student.submissionId}`}
                        >
                          {t("submissions.review")}
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>
      {editing && (
        <AssignmentFormDialog
          classes={classes}
          initial={assignment}
          onClose={() => setEditing(false)}
          onSave={async (value) => {
            await updateAssignment(assignment.id, value);
            setEditing(false);
            await reload();
          }}
        />
      )}
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}
