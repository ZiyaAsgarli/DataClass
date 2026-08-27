import { useCallback } from "react";
import { ArrowLeft, CalendarDays, PlaySquare } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "@/components/common/DataState";
import { YouTubePlayer } from "@/components/common/LessonRecording";
import { StudentLessonResources } from "@/components/common/LessonResources";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAsyncData } from "@/hooks/useAsyncData";
import { AppShell } from "@/layouts/AppShell";
import { dataErrorMessage } from "@/lib/dataErrors";
import {
  getStudentLesson,
  getStudentLessonVideo,
} from "@/services/moduleService";
import { useLocalized } from "@/i18n/useLocalized";

export function StudentLessonPage() {
  const { t, date, lessonStatus } = useLocalized();
  const { classId = "", moduleId = "", lessonId = "" } = useParams();
  const loader = useCallback(async () => {
    const [lesson, video] = await Promise.all([
      getStudentLesson(lessonId),
      getStudentLessonVideo(lessonId),
    ]);
    if (lesson.classId !== classId || lesson.moduleId !== moduleId)
      throw new Error("Route mismatch.");
    return { lesson, video };
  }, [classId, lessonId, moduleId]);
  const { data, loading, error, reload } = useAsyncData(loader);
  if (loading)
    return (
      <AppShell role="student" title="lessons.lesson">
        <LoadingState label="lessons.loading" />
      </AppShell>
    );
  if (error || !data)
    return (
      <AppShell role="student" title="lessons.lesson">
        <ErrorState
          retry={() => void reload()}
          message={dataErrorMessage(
            error,
            "errors.lessonUnavailable",
            "errors.lessonLoad",
          )}
        />
      </AppShell>
    );

  const { lesson, video } = data;
  return (
    <AppShell role="student" title="lessons.lesson">
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-5">
        <Link to={`/student/classes/${classId}/modules/${moduleId}`}>
          <ArrowLeft />
          {t("lessons.back")}
        </Link>
      </Button>
      <Card className="animate-enter p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status="published" label={lessonStatus("published")} />
          <span className="text-xs text-muted-foreground">
            {t("lessons.lesson")} {String(lesson.position + 1).padStart(2, "0")}
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          {lesson.title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {lesson.moduleTitle} · {lesson.className}
        </p>
        <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="size-4" />
          {date(lesson.lessonDate)}
        </p>
      </Card>

      <Card className="animate-enter-delay mt-6 p-4 sm:p-6">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("lessons.recording")}
          </p>
          <h2 className="mt-2 text-lg font-semibold">
            {t("lessons.classroomRecording")}
          </h2>
        </div>
        {video.provider === "youtube" && video.videoId ? (
          <YouTubePlayer videoId={video.videoId} title={lesson.title} />
        ) : (
          <div className="flex min-h-52 flex-col items-center justify-center rounded-lg bg-muted/50 p-8 text-center">
            <PlaySquare className="size-8 text-muted-foreground" />
            <p className="mt-4 font-medium">{t("lessons.unavailable")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("lessons.unavailableHelp")}
            </p>
          </div>
        )}
      </Card>

      <Card className="mt-6 p-5 sm:p-7">
        <h2 className="font-semibold">{t("lessons.descriptionNotes")}</h2>
        <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-7">
          {lesson.description || t("lessons.noDescription")}
        </p>
      </Card>
      <StudentLessonResources lessonId={lesson.id} />
    </AppShell>
  );
}
