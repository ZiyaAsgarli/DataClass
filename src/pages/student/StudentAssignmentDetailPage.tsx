import { useCallback } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  RotateCcw,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import {
  StudentAssignmentResources,
  StudentSubmissionUpload,
  SubmissionFileList,
} from "@/components/common/AssignmentFiles";
import { ErrorState, LoadingState } from "@/components/common/DataState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAsyncData } from "@/hooks/useAsyncData";
import { AppShell } from "@/layouts/AppShell";
import { dataErrorMessage } from "@/lib/dataErrors";
import {
  getStudentAssignment,
  listSubmissionFiles,
} from "@/services/assignmentService";
import { useLocalized } from "@/i18n/useLocalized";

export function StudentAssignmentDetailPage() {
  const { t, dateTime, submissionStatus } = useLocalized();
  const { assignmentId = "" } = useParams();
  const loader = useCallback(async () => {
    const assignment = await getStudentAssignment(assignmentId);
    const files = assignment.submissionId
      ? await listSubmissionFiles(assignment.submissionId)
      : [];
    return { assignment, files };
  }, [assignmentId]);
  const { data, loading, error, reload } = useAsyncData(loader);
  if (loading)
    return (
      <AppShell role="student" title="assignments.assignment">
        <LoadingState label="assignments.loadingOne" />
      </AppShell>
    );
  if (error || !data)
    return (
      <AppShell role="student" title="assignments.assignment">
        <ErrorState
          retry={() => void reload()}
          message={dataErrorMessage(
            error,
            "errors.assignmentUnavailable",
            "errors.assignmentLoad",
          )}
        />
      </AppShell>
    );
  const { assignment, files } = data;
  const status = assignment.submissionStatus;
  const canUpload =
    !status || status === "draft" || status === "revision_requested";
  return (
    <AppShell role="student" title="assignments.assignment">
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-5">
        <Link to="/student/assignments">
          <ArrowLeft />
          {t("assignments.back")}
        </Link>
      </Button>
      <Card className="p-5 sm:p-7">
        <StatusBadge
          status={status ?? "draft"}
          label={submissionStatus(status)}
        />
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          {assignment.title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {assignment.className}
          {assignment.lessonTitle ? ` · ${assignment.lessonTitle}` : ""}
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
              : "assignments.lateDeadline",
          )}
        </p>
      </Card>
      <Card className="mt-6 p-5 sm:p-7">
        <h2 className="font-semibold">{t("assignments.instructions")}</h2>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-7">
          {assignment.description || t("assignments.noAdditional")}
        </p>
      </Card>
      <div className="mt-6">
        <StudentAssignmentResources assignmentId={assignment.id} />
      </div>
      <Card className="mt-6 p-5 sm:p-7">
        <div className="flex items-center gap-2">
          {status === "reviewed" ? (
            <CheckCircle2 className="size-5 text-primary" />
          ) : status === "revision_requested" ? (
            <RotateCcw className="size-5 text-amber-600" />
          ) : (
            <Clock3 className="size-5 text-muted-foreground" />
          )}
          <h2 className="font-semibold">{t("submissions.yourSubmission")}</h2>
        </div>
        {assignment.feedbackMessage && (
          <div className="mt-5 rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("submissions.teacherFeedback")}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
              {assignment.feedbackMessage}
            </p>
          </div>
        )}
        {files.length > 0 && (
          <div className="mt-5">
            <SubmissionFileList files={files} />
          </div>
        )}
        {canUpload ? (
          <div className="mt-5">
            <StudentSubmissionUpload
              assignmentId={assignment.id}
              revision={status === "revision_requested"}
              onSubmitted={async () => {
                await reload();
              }}
            />
          </div>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">
            {status === "reviewed"
              ? t("submissions.reviewedAt", {
                  date: dateTime(
                    assignment.reviewedAt,
                    t("submissions.timeUnavailable"),
                  ),
                })
              : t("submissions.submittedAt", {
                  date: dateTime(
                    assignment.submittedAt,
                    t("submissions.timeUnavailable"),
                  ),
                })}
          </p>
        )}
      </Card>
    </AppShell>
  );
}
