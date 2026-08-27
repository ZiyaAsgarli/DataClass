import { useState, type FormEvent } from "react";
import { AlertCircle, PlaySquare } from "lucide-react";
import { DialogFrame } from "@/components/common/CourseForms";
import { Button } from "@/components/ui/button";
import { parseYouTubeVideoId, youtubeEmbedUrl } from "@/lib/youtube";
import { useTranslation } from "react-i18next";

export function LessonRecordingDialog({
  initialUrl = "",
  onClose,
  onSave,
}: {
  initialUrl?: string;
  onClose: () => void;
  onSave: (url: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!parseYouTubeVideoId(url)) {
      setError("lessons.invalidYoutube");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(url.trim());
    } catch {
      setError("lessons.recordingSaveFailed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogFrame
      title={t(
        initialUrl ? "lessons.replaceRecording" : "lessons.addRecording",
      )}
      description={t("lessons.recordingHelp")}
      onClose={onClose}
    >
      <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        <label className="block text-sm font-medium">
          {t("lessons.youtubeUrl")} *
          <input
            autoFocus
            type="url"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError("");
            }}
            className="mt-2 h-10 w-full rounded-md border bg-background px-3"
            placeholder="https://www.youtube.com/watch?v=…"
          />
        </label>
        <p className="text-xs leading-5 text-muted-foreground">
          {t("lessons.youtubeHelp")}
        </p>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {t(error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || !url.trim()}>
            {busy
              ? t("common.saving")
              : t(
                  initialUrl
                    ? "lessons.replaceRecording"
                    : "lessons.addRecording",
                )}
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}

export function RemoveRecordingDialog({
  onClose,
  onRemove,
}: {
  onClose: () => void;
  onRemove: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <DialogFrame
      title={t("lessons.removeTitle")}
      description={t("lessons.removeHelp")}
      onClose={onClose}
    >
      <div className="mt-6">
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>{t("lessons.unavailableStudent")}</p>
        </div>
        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {t(error)}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              void onRemove()
                .catch(() => setError("lessons.recordingRemoveFailed"))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? t("common.removing") : t("lessons.removeRecording")}
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}

export function YouTubePlayer({
  videoId,
  title,
}: {
  videoId: string;
  title: string;
}) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const embedUrl = youtubeEmbedUrl(videoId);
  if (!embedUrl || failed)
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg bg-muted p-6 text-center">
        <PlaySquare className="size-8 text-muted-foreground" />
        <p className="mt-3 font-medium">{t("lessons.recordingPlayFailed")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("lessons.recordingTryLater")}
        </p>
      </div>
    );
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <iframe
        className="size-full border-0"
        src={embedUrl}
        title={t("accessibility.lessonRecording", { title })}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        onError={() => setFailed(true)}
      />
    </div>
  );
}
