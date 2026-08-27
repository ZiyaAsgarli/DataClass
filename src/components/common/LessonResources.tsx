import { useCallback, useRef, useState, type DragEvent } from "react";
import {
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Loader2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAsyncData } from "@/hooks/useAsyncData";
import {
  deleteLessonResource,
  getLessonResourceDownloadUrl,
  listStudentLessonResources,
  listTeacherLessonResources,
  uploadLessonResource,
  validateResourceFile,
} from "@/services/storageService";
import type { LessonResourceRecord } from "@/types";
import { useTranslation } from "react-i18next";
import { useLocalized } from "@/i18n/useLocalized";
import { resourceValidationKey } from "@/i18n/formatters";

function resourceIcon(kind: string) {
  if (
    ["xlsx", "xls", "xlsm", "csv", "tsv", "pbix", "pbit", "parquet"].includes(
      kind,
    )
  )
    return FileSpreadsheet;
  if (kind === "zip") return FileArchive;
  return FileText;
}

async function startDownload(
  resource: LessonResourceRecord,
  getDownloadUrl: (id: string) => Promise<{ downloadUrl: string }>,
) {
  const { downloadUrl } = await getDownloadUrl(resource.id);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = resource.fileName;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function ResourceRows({
  resources,
  canDelete,
  busyId,
  onDelete,
  getDownloadUrl = getLessonResourceDownloadUrl,
  emptyTitle,
  emptyDescription,
}: {
  resources: LessonResourceRecord[];
  canDelete: boolean;
  busyId: string | null;
  onDelete?: (resource: LessonResourceRecord) => void;
  getDownloadUrl?: (id: string) => Promise<{ downloadUrl: string }>;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const { t, fileSize } = useLocalized();
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (resources.length === 0)
    return (
      <div className="rounded-lg border border-dashed p-7 text-center">
        <p className="font-medium">
          {emptyTitle ?? t("lessons.noneResources")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {emptyDescription ?? t("lessons.noneResourcesHelp")}
        </p>
      </div>
    );
  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {t(error)}
        </p>
      )}
      {resources.map((resource) => {
        const Icon = resourceIcon(resource.resourceKind);
        return (
          <div
            key={resource.id}
            className="flex min-w-0 flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="size-5 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {resource.title || resource.fileName}
                </p>
                <p className="mt-0.5 truncate text-xs uppercase text-muted-foreground">
                  {resource.resourceKind} · {fileSize(resource.fileSizeBytes)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={downloadId === resource.id}
                onClick={() => {
                  setDownloadId(resource.id);
                  setError("");
                  void startDownload(resource, getDownloadUrl)
                    .catch(() => setError("lessons.downloadFailed"))
                    .finally(() => setDownloadId(null));
                }}
              >
                {downloadId === resource.id ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Download />
                )}
                {t("common.download")}
              </Button>
              {canDelete && onDelete && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === resource.id}
                  onClick={() => onDelete(resource)}
                >
                  {busyId === resource.id ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Trash2 />
                  )}
                  {t("common.delete")}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TeacherLessonResources({
  lessonId,
  canManage,
}: {
  lessonId: string;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const loader = useCallback(
    () => listTeacherLessonResources(lessonId),
    [lessonId],
  );
  const { data, loading, error, reload } = useAsyncData(loader);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const upload = async (file?: File) => {
    if (!file) return;
    const validation = validateResourceFile(file);
    if (validation) {
      setActionError(resourceValidationKey(validation));
      return;
    }
    setUploading(true);
    setProgress(0);
    setActionError("");
    try {
      await uploadLessonResource(lessonId, file, setProgress);
      await reload();
    } catch {
      setActionError("lessons.uploadFailed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!uploading) void upload(event.dataTransfer.files[0]);
  };

  return (
    <Card className="mt-6 p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">{t("lessons.resources")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("lessons.resourcesHelp")}
          </p>
        </div>
        {canManage && (
          <>
            <input
              ref={inputRef}
              className="hidden"
              type="file"
              onChange={(event) => void upload(event.target.files?.[0])}
            />
            <Button
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <UploadCloud />
              )}
              {uploading
                ? t("common.uploading", { progress })
                : t("lessons.uploadResource")}
            </Button>
          </>
        )}
      </div>
      {canManage && (
        <div
          className="mt-5 rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground"
          onDragOver={(event) => event.preventDefault()}
          onDrop={drop}
        >
          {t("lessons.drop")}
        </div>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {t(actionError)}
        </p>
      )}
      <div className="mt-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">
            {t("lessons.loadingResources")}
          </p>
        ) : error || !data ? (
          <div>
            <p className="text-sm text-destructive">
              {t("lessons.resourcesFailed")}
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
            canDelete={canManage}
            busyId={busyId}
            emptyTitle={t("lessons.noneResources")}
            emptyDescription={t("lessons.noneResourcesHelp")}
            onDelete={(resource) => {
              if (
                !window.confirm(
                  t("lessons.deleteConfirm", { filename: resource.fileName }),
                )
              )
                return;
              setBusyId(resource.id);
              setActionError("");
              void deleteLessonResource(resource.id)
                .then(() => reload())
                .catch(() => setActionError("lessons.deleteFailed"))
                .finally(() => setBusyId(null));
            }}
          />
        )}
      </div>
    </Card>
  );
}

export function StudentLessonResources({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation();
  const loader = useCallback(
    () => listStudentLessonResources(lessonId),
    [lessonId],
  );
  const { data, loading, error, reload } = useAsyncData(loader);
  return (
    <Card className="mt-6 p-5 sm:p-7">
      <h2 className="font-semibold">{t("lessons.resources")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("lessons.resourcesStudentHelp")}
      </p>
      <div className="mt-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">
            {t("lessons.loadingResources")}
          </p>
        ) : error || !data ? (
          <div>
            <p className="text-sm text-destructive">
              {t("lessons.resourcesFailed")}
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
            emptyTitle={t("lessons.noneResources")}
            emptyDescription={t("lessons.noneResourcesHelp")}
          />
        )}
      </div>
    </Card>
  );
}
