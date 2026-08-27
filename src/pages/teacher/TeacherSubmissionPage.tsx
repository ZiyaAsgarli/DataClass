import { useCallback, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  FileArchive,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Loader2,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { ReviewDialog } from "@/components/common/AssignmentForms";
import { ErrorState, LoadingState } from "@/components/common/DataState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAsyncData } from "@/hooks/useAsyncData";
import { AppShell } from "@/layouts/AppShell";
import { dataErrorMessage } from "@/lib/dataErrors";
import { cn } from "@/lib/utils";
import {
  getSubmissionDetail,
  listSubmissionFiles,
  reviewSubmission,
} from "@/services/assignmentService";
import { getSubmissionFileDownloadUrl } from "@/services/storageService";
import type { SubmissionFileRecord } from "@/types";
import { useLocalized } from "@/i18n/useLocalized";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "DC"
  );
}

function fileExtension(file: SubmissionFileRecord) {
  const extension = file.fileName.split(".").pop()?.toLowerCase();
  return extension && extension !== file.fileName.toLowerCase()
    ? extension
    : file.resourceKind;
}

function FileTypeIcon({
  file,
  className,
}: {
  file: SubmissionFileRecord;
  className?: string;
}) {
  const extension = fileExtension(file);
  const Icon = [
    "xlsx",
    "xls",
    "xlsm",
    "csv",
    "tsv",
    "pbix",
    "pbit",
    "parquet",
  ].includes(extension)
    ? FileSpreadsheet
    : ["sql", "ipynb", "py", "json"].includes(extension)
      ? FileCode2
      : extension === "zip"
        ? FileArchive
        : FileText;
  return <Icon aria-hidden="true" className={className} />;
}

async function downloadSubmissionFile(file: SubmissionFileRecord) {
  const { downloadUrl } = await getSubmissionFileDownloadUrl(file.id);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = file.fileName;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function TeacherSubmissionPage() {
  const { t, dateTime, fileSize, submissionStatus } = useLocalized();
  const { assignmentId = "", submissionId = "" } = useParams();
  const loader = useCallback(async () => {
    const detail = await getSubmissionDetail(submissionId);
    if (detail.assignmentId !== assignmentId) {
      throw Object.assign(new Error("Submission route mismatch"), {
        status: 403,
      });
    }
    return { detail, files: await listSubmissionFiles(submissionId) };
  }, [assignmentId, submissionId]);
  const { data, loading, error, reload } = useAsyncData(loader);
  const [action, setAction] = useState<
    "reviewed" | "revision_requested" | null
  >(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);

  if (loading)
    return (
      <AppShell role="teacher" title="submissions.review">
        <LoadingState label="submissions.loading" />
      </AppShell>
    );
  if (error || !data)
    return (
      <AppShell role="teacher" title="submissions.review">
        <ErrorState
          retry={() => void reload()}
          message={dataErrorMessage(
            error,
            "errors.submissionAccess",
            "errors.submissionLoad",
          )}
        />
      </AppShell>
    );

  const { detail } = data;
  const files = [...data.files].sort(
    (left, right) =>
      right.version - left.version ||
      new Date(right.uploadedAt).getTime() -
        new Date(left.uploadedAt).getTime(),
  );
  const selectedFile =
    files.find((file) => file.id === selectedFileId) ?? files[0] ?? null;
  const versions = Array.from(new Set(files.map((file) => file.version))).sort(
    (left, right) => right - left,
  );
  const reviewable = ["submitted", "late", "resubmitted"].includes(
    detail.status,
  );
  const submittedLabel = submissionStatus(
    detail.status === "resubmitted" ? "resubmitted" : "submitted",
  );
  const showAvatar = Boolean(
    detail.avatarUrl && detail.avatarUrl !== failedAvatarUrl,
  );

  const downloadSelected = async () => {
    if (!selectedFile) return;
    setDownloadBusy(true);
    setDownloadError("");
    try {
      await downloadSubmissionFile(selectedFile);
    } catch {
      setDownloadError("submissions.downloadFailed");
    } finally {
      setDownloadBusy(false);
    }
  };

  return (
    <AppShell role="teacher" title="submissions.review">
      <nav
        className="mb-5 flex min-w-0 items-center gap-2 text-sm text-muted-foreground"
        aria-label={t("accessibility.breadcrumb")}
      >
        <Link
          className="shrink-0 transition-colors hover:text-foreground"
          to="/teacher/assignments"
        >
          {t("assignments.title")}
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          className="truncate transition-colors hover:text-foreground"
          to={`/teacher/assignments/${assignmentId}`}
        >
          {detail.assignmentTitle}
        </Link>
        <span aria-hidden="true">/</span>
        <span
          className="shrink-0 font-medium text-foreground"
          aria-current="page"
        >
          {t("submissions.review")}
        </span>
      </nav>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">{detail.studentName}</h1>
          <p className="page-description">{t("submissions.reviewHelp")}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="-ml-2 w-fit sm:ml-0"
        >
          <Link to={`/teacher/assignments/${assignmentId}`}>
            <ArrowLeft />
            {t("submissions.back")}
          </Link>
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(360px,400px)_minmax(0,1fr)] lg:items-start">
        <Card className="p-5 lg:col-start-1 lg:row-start-1">
          <div className="flex items-start gap-3">
            {showAvatar ? (
              <img
                src={detail.avatarUrl ?? undefined}
                alt={t("accessibility.studentProfile", {
                  name: detail.studentName,
                })}
                referrerPolicy="no-referrer"
                className="size-12 shrink-0 rounded-full border border-primary/15 object-cover ring-2 ring-card"
                onError={() => setFailedAvatarUrl(detail.avatarUrl)}
              />
            ) : (
              <span
                className="flex size-12 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary text-sm font-semibold text-primary-foreground ring-2 ring-card"
                aria-hidden="true"
              >
                {initials(detail.studentName)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-['Hanken_Grotesk'] text-lg font-semibold">
                {detail.studentName}
              </p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {detail.studentEmail}
              </p>
            </div>
            <UserRound
              className="mt-1 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <div className="mt-5 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={detail.status}
                label={submissionStatus(detail.status)}
              />
              {detail.wasLate && detail.status !== "late" && (
                <StatusBadge status="late" label={submissionStatus("late")} />
              )}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {submittedLabel}{" "}
              {detail.submittedAt
                ? dateTime(detail.submittedAt)
                : t("submissions.timeUnavailable")}
            </p>
            {detail.reviewedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("submissions.reviewedAt", {
                  date: dateTime(detail.reviewedAt),
                })}
              </p>
            )}
          </div>
        </Card>

        <Card className="p-5 lg:col-start-1 lg:row-start-2">
          <div>
            <h2 className="font-['Hanken_Grotesk'] text-lg font-semibold">
              {t("submissions.history")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("submissions.historyHelp")}
            </p>
          </div>
          {versions.length ? (
            <div className="mt-5 space-y-5">
              {versions.map((version) => (
                <section key={version} aria-labelledby={`version-${version}`}>
                  <h3
                    id={`version-${version}`}
                    className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    {t("submissions.version", { number: version })}
                  </h3>
                  <div className="space-y-2">
                    {files
                      .filter((file) => file.version === version)
                      .map((file) => {
                        const selected = selectedFile?.id === file.id;
                        return (
                          <button
                            key={file.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              setSelectedFileId(file.id);
                              setDownloadError("");
                            }}
                            className={cn(
                              "group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                              selected
                                ? "border-primary/40 bg-accent text-foreground"
                                : "bg-card hover:border-primary/25 hover:bg-accent/40",
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-9 shrink-0 items-center justify-center rounded-lg",
                                selected
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground group-hover:text-primary",
                              )}
                            >
                              <FileTypeIcon file={file} className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {file.fileName}
                              </span>
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {fileExtension(file).toUpperCase()} ·{" "}
                                {fileSize(file.fileSizeBytes)}
                              </span>
                            </span>
                            {selected && (
                              <span
                                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                                aria-label={t("common.selected")}
                              >
                                <Check className="size-3" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              {t("submissions.noReadyFiles")}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden lg:col-start-2 lg:row-span-3 lg:row-start-1">
          {selectedFile ? (
            <>
              <div className="flex flex-col gap-4 border-b bg-[var(--elevated)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                    <FileTypeIcon file={selectedFile} className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">
                      {selectedFile.fileName}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {fileExtension(selectedFile).toUpperCase()} ·{" "}
                      {fileSize(selectedFile.fileSizeBytes)} ·{" "}
                      {t("submissions.version", {
                        number: selectedFile.version,
                      })}
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full sm:w-auto"
                  size="sm"
                  onClick={() => void downloadSelected()}
                  disabled={downloadBusy}
                >
                  {downloadBusy ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                  {downloadBusy
                    ? t("common.preparing")
                    : t("submissions.downloadFile")}
                </Button>
              </div>
              <div className="flex min-h-[300px] flex-col items-center justify-center bg-muted/35 px-5 py-9 text-center sm:min-h-[380px] lg:min-h-[520px]">
                <span className="flex size-20 items-center justify-center rounded-3xl border bg-card text-primary shadow-[var(--card-shadow)]">
                  <FileTypeIcon file={selectedFile} className="size-9" />
                </span>
                <h2 className="mt-6 font-['Hanken_Grotesk'] text-xl font-semibold">
                  {t("submissions.fileReady")}
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  {t("submissions.previewUnavailable")}
                </p>
                <Button
                  className="mt-6"
                  variant="outline"
                  onClick={() => void downloadSelected()}
                  disabled={downloadBusy}
                >
                  {downloadBusy ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                  {downloadBusy
                    ? t("submissions.preparingDownload")
                    : t("submissions.downloadFile")}
                </Button>
                {downloadError && (
                  <div className="mt-5" role="alert" aria-live="assertive">
                    <p className="text-sm text-destructive">
                      {t(downloadError)}
                    </p>
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="ghost"
                      onClick={() => void downloadSelected()}
                    >
                      {t("common.retry")}
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center lg:min-h-[590px]">
              <FileText
                className="size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <h2 className="mt-4 font-semibold">{t("submissions.noReady")}</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {t("submissions.noReadyHelp")}
              </p>
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-start-1 lg:row-start-3">
          <h2 className="font-['Hanken_Grotesk'] text-lg font-semibold">
            {t("submissions.teacherFeedback")}
          </h2>
          <div className="mt-4 rounded-xl border bg-[var(--elevated)] p-4">
            <p
              className={cn(
                "whitespace-pre-wrap text-sm leading-6",
                !detail.feedbackMessage && "text-muted-foreground",
              )}
            >
              {detail.feedbackMessage || t("submissions.noFeedback")}
            </p>
          </div>
          {reviewable ? (
            <div className="mt-5 space-y-3 border-t pt-5">
              <p className="text-xs leading-5 text-muted-foreground">
                {t("submissions.actionHelp")}
              </p>
              <Button className="w-full" onClick={() => setAction("reviewed")}>
                <CheckCircle2 />
                {t("submissions.markReviewed")}
              </Button>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => setAction("revision_requested")}
              >
                <RotateCcw />
                {t("submissions.requestRevision")}
              </Button>
            </div>
          ) : detail.status === "reviewed" ? (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-300/60 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2
                className="mt-0.5 size-5 shrink-0"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold">
                  {t("submissions.complete")}
                </p>
                <p className="mt-1 text-xs opacity-80">
                  {t("submissions.marked")}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-5 border-t pt-4 text-sm text-muted-foreground">
              {t("submissions.noAction")}
            </p>
          )}
        </Card>
      </div>

      {action && (
        <ReviewDialog
          action={action}
          initial={detail.feedbackMessage ?? ""}
          onClose={() => setAction(null)}
          onSave={async (message) => {
            await reviewSubmission(detail.id, action, message);
            setAction(null);
            await reload();
          }}
        />
      )}
    </AppShell>
  );
}
