import { useCallback, useRef, useState } from "react";
import { Download, Loader2, Send, UploadCloud } from "lucide-react";
import { ResourceRows } from "@/components/common/LessonResources";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAsyncData } from "@/hooks/useAsyncData";
import { submitMyAssignment } from "@/services/assignmentService";
import {
  deleteAssignmentResource,
  getAssignmentResourceDownloadUrl,
  getSubmissionFileDownloadUrl,
  listStudentAssignmentResources,
  listTeacherAssignmentResources,
  uploadAssignmentResource,
  uploadSubmissionFile,
  validateResourceFile,
} from "@/services/storageService";
import type { SubmissionFileRecord } from "@/types";
import { useTranslation } from "react-i18next";
import { useLocalized } from "@/i18n/useLocalized";
import { resourceValidationKey } from "@/i18n/formatters";

function UploadButton({
  label,
  multiple = false,
  upload,
  disabled = false,
}: {
  label: string;
  multiple?: boolean;
  upload: (
    files: File[],
    onProgress: (percent: number) => void,
  ) => Promise<void>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const select = async (files: FileList | null) => {
    if (!files?.length) return;
    const chosen = Array.from(files);
    const issue = chosen.map(validateResourceFile).find(Boolean);
    if (issue) {
      setError(resourceValidationKey(issue));
      return;
    }
    setBusy(true);
    setProgress(0);
    setError("");
    try {
      await upload(chosen, setProgress);
    } catch {
      setError("validation.uploadFailed");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <div>
      <input
        ref={ref}
        type="file"
        multiple={multiple}
        className="hidden"
        onChange={(event) => void select(event.target.files)}
      />
      <Button disabled={disabled || busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <UploadCloud />}
        {busy ? t("common.uploading", { progress }) : label}
      </Button>
      {error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}

export function TeacherAssignmentResources({
  assignmentId,
}: {
  assignmentId: string;
}) {
  const { t } = useTranslation();
  const loader = useCallback(
    () => listTeacherAssignmentResources(assignmentId),
    [assignmentId],
  );
  const { data, loading, error, reload } = useAsyncData(loader);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">{t("assignments.files")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("assignments.filesTeacherHelp")}
          </p>
        </div>
        <UploadButton
          label={t("assignments.uploadFile")}
          upload={async ([file], progress) => {
            await uploadAssignmentResource(assignmentId, file, progress);
            await reload();
          }}
        />
      </div>
      {actionError && (
        <p className="mt-4 text-sm text-destructive">{t(actionError)}</p>
      )}
      <div className="mt-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">
            {t("assignments.loadingFiles")}
          </p>
        ) : error || !data ? (
          <div role="alert">
            <p className="text-sm text-destructive">
              {t("assignments.filesFailed")}
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => void reload()}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : (
          <ResourceRows
            resources={data}
            canDelete
            busyId={busyId}
            getDownloadUrl={getAssignmentResourceDownloadUrl}
            emptyTitle={t("assignments.noFiles")}
            emptyDescription={t("assignments.noFilesTeacher")}
            onDelete={(resource) => {
              if (
                !window.confirm(
                  t("lessons.deleteConfirm", { filename: resource.fileName }),
                )
              )
                return;
              setBusyId(resource.id);
              setActionError("");
              void deleteAssignmentResource(resource.id)
                .then(() => reload())
                .catch(() => setActionError("assignments.fileDeleteFailed"))
                .finally(() => setBusyId(null));
            }}
          />
        )}
      </div>
    </Card>
  );
}

export function StudentAssignmentResources({
  assignmentId,
}: {
  assignmentId: string;
}) {
  const { t } = useTranslation();
  const loader = useCallback(
    () => listStudentAssignmentResources(assignmentId),
    [assignmentId],
  );
  const { data, loading, error, reload } = useAsyncData(loader);
  return (
    <Card className="p-5 sm:p-7">
      <h2 className="font-semibold">{t("assignments.files")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("assignments.filesStudentHelp")}
      </p>
      <div className="mt-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">
            {t("assignments.loadingFiles")}
          </p>
        ) : error || !data ? (
          <div role="alert">
            <p className="text-sm text-destructive">
              {t("assignments.filesFailed")}
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => void reload()}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : (
          <ResourceRows
            resources={data}
            canDelete={false}
            busyId={null}
            getDownloadUrl={getAssignmentResourceDownloadUrl}
            emptyTitle={t("assignments.noFiles")}
            emptyDescription={t("assignments.noFilesStudent")}
          />
        )}
      </div>
    </Card>
  );
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

export function SubmissionFileList({
  files,
}: {
  files: SubmissionFileRecord[];
}) {
  const { t, fileSize } = useLocalized();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (!files.length)
    return (
      <p className="text-sm text-muted-foreground">
        {t("submissions.noFiles")}
      </p>
    );
  const versions = Array.from(new Set(files.map((file) => file.version))).sort(
    (a, b) => b - a,
  );
  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-destructive">{t(error)}</p>}
      {versions.map((version) => (
        <div key={version}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("submissions.version", { number: version })}
          </p>
          <div className="space-y-2">
            {files
              .filter((file) => file.version === version)
              .map((file) => (
                <div
                  key={file.id}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {file.fileName}
                    </p>
                    <p className="mt-1 text-xs uppercase text-muted-foreground">
                      {file.resourceKind} · {fileSize(file.fileSizeBytes)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === file.id}
                    onClick={() => {
                      setBusy(file.id);
                      setError("");
                      void downloadSubmissionFile(file)
                        .catch(() => setError("submissions.downloadFailed"))
                        .finally(() => setBusy(null));
                    }}
                  >
                    {busy === file.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Download />
                    )}
                    {t("common.download")}
                  </Button>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function StudentSubmissionUpload({
  assignmentId,
  revision,
  onSubmitted,
}: {
  assignmentId: string;
  revision: boolean;
  onSubmitted: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [error, setError] = useState("");
  return (
    <div className="rounded-lg border border-dashed p-5">
      <h3 className="font-medium">
        {t(
          revision
            ? "submissions.uploadRevision"
            : "submissions.uploadSolution",
        )}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("submissions.uploadHelp")}
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
        <UploadButton
          multiple
          label={
            uploaded
              ? t("common.count.filesReady", { count: uploaded })
              : t("submissions.chooseFiles")
          }
          disabled={submitting}
          upload={async (files, progress) => {
            for (const file of files)
              await uploadSubmissionFile(assignmentId, file, progress);
            setUploaded((value) => value + files.length);
          }}
        />
        <Button
          disabled={!uploaded || submitting}
          onClick={() => {
            setSubmitting(true);
            setError("");
            void submitMyAssignment(assignmentId)
              .then(onSubmitted)
              .catch(() => setError("validation.submitFailed"))
              .finally(() => setSubmitting(false));
          }}
        >
          {submitting ? <Loader2 className="animate-spin" /> : <Send />}
          {t(revision ? "submissions.resubmit" : "submissions.submit")}
        </Button>
      </div>
      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}
