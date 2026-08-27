import { useCallback, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Edit3,
  Plus,
  UserRoundCog,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import {
  LessonFormDialog,
  ModuleFormDialog,
} from "@/components/common/CourseForms";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/DataState";
import {
  ModuleLifecycleBadge,
  ModuleLifecycleControl,
} from "@/components/common/ModuleLifecycle";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAsyncData } from "@/hooks/useAsyncData";
import { AppShell } from "@/layouts/AppShell";
import { dataErrorMessage } from "@/lib/dataErrors";
import {
  assignModuleInstructor,
  createLesson,
  getTeacherModule,
  listModuleInstructorOptions,
  listTeacherModuleLessons,
  removeModuleInstructor,
  reorderLesson,
  setModuleLifecycle,
  updateLesson,
  updateModule,
} from "@/services/moduleService";
import type {
  CourseLessonRecord,
  LessonLifecycleStatus,
  ModuleLifecycleStatus,
  ModuleStatus,
} from "@/types";
import { useLocalized } from "@/i18n/useLocalized";

export function TeacherModulePage() {
  const {
    t,
    date,
    moduleAvailability,
    accessLabel,
    lessonStatus,
    moduleLifecycle,
  } = useLocalized();
  const { classId = "", moduleId = "" } = useParams();
  const loader = useCallback(async () => {
    const module = await getTeacherModule(moduleId);
    if (module.classId !== classId)
      throw new Error("Module does not belong to this class.");
    const [lessons, instructorOptions] = await Promise.all([
      listTeacherModuleLessons(moduleId),
      module.currentAccess === "owner"
        ? listModuleInstructorOptions(moduleId)
        : Promise.resolve([]),
    ]);
    return { module, lessons, instructorOptions };
  }, [classId, moduleId]);
  const { data, loading, error, reload } = useAsyncData(loader);
  const [editingModule, setEditingModule] = useState(false);
  const [creatingLesson, setCreatingLesson] = useState(false);
  const [editingLesson, setEditingLesson] = useState<CourseLessonRecord | null>(
    null,
  );
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (loading)
    return (
      <AppShell role="teacher" title="modules.module">
        <LoadingState label="modules.loading" />
      </AppShell>
    );
  if (error || !data)
    return (
      <AppShell role="teacher" title="modules.module">
        <ErrorState
          retry={() => void reload()}
          message={dataErrorMessage(
            error,
            "errors.moduleAccess",
            "errors.moduleLoad",
          )}
        />
      </AppShell>
    );

  const { module, lessons, instructorOptions } = data;
  const canManage =
    module.currentAccess === "owner" ||
    module.currentAccess === "module_instructor";
  const owner = module.currentAccess === "owner";
  const changeLessonStatus = async (
    lesson: CourseLessonRecord,
    status: LessonLifecycleStatus,
  ) => {
    setMessage("");
    try {
      await updateLesson(
        lesson.id,
        lesson.title,
        lesson.description ?? "",
        lesson.lessonDate ?? "",
        status,
      );
      await reload();
      setMessage(
        t(status === "published" ? "lessons.published" : "lessons.archived"),
      );
    } catch {
      setMessage(t("lessons.statusFailed"));
    }
  };
  const changeModuleLifecycle = async (status: ModuleLifecycleStatus) => {
    setLifecycleBusy(true);
    setMessage("");
    try {
      await setModuleLifecycle(moduleId, status);
      await reload();
      setMessage(t("modules.marked", { status: moduleLifecycle(status) }));
    } catch (error) {
      setMessage(
        error instanceof Error &&
          error.message.includes("Another module is already active")
          ? t("modules.anotherActive")
          : t("modules.lifecycleFailed"),
      );
    } finally {
      setLifecycleBusy(false);
    }
  };

  return (
    <AppShell role="teacher" title="modules.management">
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-5">
        <Link to={`/teacher/classes/${classId}`}>
          <ArrowLeft />
          {t("modules.back")}
        </Link>
      </Button>
      <Card className="animate-enter p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ModuleLifecycleBadge
                status={module.lifecycleStatus}
                currentLabel
              />
              <StatusBadge
                status={module.status}
                label={`${moduleAvailability(module.status)} · ${t("modules.availability")}`}
              />
              <span className="text-xs font-medium text-muted-foreground">
                {module.currentAccess === "module_instructor"
                  ? accessLabel("module_instructor")
                  : accessLabel(module.currentAccess ?? "viewer")}
              </span>
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
              {module.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {module.description || t("modules.noDescription")}
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              {module.instructorNames.length
                ? t("modules.instructors", {
                    names: module.instructorNames.join(", "),
                  })
                : t("modules.noInstructor")}
            </p>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {owner && (
                <ModuleLifecycleControl
                  status={module.lifecycleStatus}
                  canActivate={
                    module.status === "active" || module.status === "completed"
                  }
                  disabled={lifecycleBusy}
                  onChange={(status) => void changeModuleLifecycle(status)}
                />
              )}
              <Button variant="outline" onClick={() => setEditingModule(true)}>
                <Edit3 />
                {t("modules.edit")}
              </Button>
              <Button onClick={() => setCreatingLesson(true)}>
                <Plus />
                {t("lessons.add")}
              </Button>
            </div>
          )}
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-muted/45 p-4">
            <p className="text-xs text-muted-foreground">
              {t("modules.allLessons")}
            </p>
            <p className="mt-2 text-lg font-semibold">
              {module.lessonCount ?? lessons.length}
            </p>
          </div>
          <div className="rounded-lg bg-muted/45 p-4">
            <p className="text-xs text-muted-foreground">
              {t("modules.publishedLessons")}
            </p>
            <p className="mt-2 text-lg font-semibold">
              {module.publishedLessonCount}
            </p>
          </div>
        </div>
        {message && (
          <p className="mt-4 text-sm text-muted-foreground" role="status">
            {message}
          </p>
        )}
      </Card>

      {owner && (
        <section className="animate-enter-delay mt-8">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">
              {t("modules.instructorsTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("modules.instructorsHelp")}
            </p>
          </div>
          <Card className="divide-y overflow-hidden">
            {instructorOptions.map((teacher) => (
              <div
                key={teacher.teacherId}
                className="flex items-center justify-between gap-4 p-4 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                    <UserRoundCog className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{teacher.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {teacher.classRole === "owner"
                        ? t("classes.ownerLead")
                        : t("classes.classInstructor")}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={teacher.assigned ? "ghost" : "outline"}
                  onClick={async () => {
                    if (teacher.assigned)
                      await removeModuleInstructor(moduleId, teacher.teacherId);
                    else
                      await assignModuleInstructor(moduleId, teacher.teacherId);
                    await reload();
                  }}
                >
                  {t(teacher.assigned ? "common.remove" : "common.assign")}
                </Button>
              </div>
            ))}
            {!instructorOptions.length && (
              <p className="p-5 text-sm text-muted-foreground">
                {t("modules.addAtClass")}
              </p>
            )}
          </Card>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("lessons.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("lessons.help")}</p>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setCreatingLesson(true)}>
              <Plus />
              {t("lessons.add")}
            </Button>
          )}
        </div>
        {lessons.length ? (
          <Card className="divide-y overflow-hidden">
            {lessons.map((lesson, index) => (
              <div key={lesson.id} className="p-4 sm:px-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          className="font-medium hover:text-primary"
                          to={`/teacher/classes/${classId}/modules/${moduleId}/lessons/${lesson.id}`}
                        >
                          {lesson.title}
                        </Link>
                        <StatusBadge
                          status={lesson.status}
                          label={lessonStatus(lesson.status)}
                        />
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="size-3.5" />
                        {date(lesson.lessonDate)}
                      </p>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={index === 0}
                        aria-label={t("accessibility.moveLessonUp")}
                        onClick={async () => {
                          await reorderLesson(lesson.id, "up");
                          await reload();
                        }}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={index === lessons.length - 1}
                        aria-label={t("accessibility.moveLessonDown")}
                        onClick={async () => {
                          await reorderLesson(lesson.id, "down");
                          await reload();
                        }}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingLesson(lesson)}
                      >
                        {t("common.edit")}
                      </Button>
                      {lesson.status !== "published" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void changeLessonStatus(lesson, "published")
                          }
                        >
                          {t("common.publish")}
                        </Button>
                      )}
                      {lesson.status !== "archived" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void changeLessonStatus(lesson, "archived")
                          }
                        >
                          {t("common.archive")}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState
            title="lessons.none"
            description="lessons.noneHelp"
            action={
              canManage ? (
                <Button onClick={() => setCreatingLesson(true)}>
                  <Plus />
                  {t("lessons.create")}
                </Button>
              ) : undefined
            }
          />
        )}
      </section>

      {editingModule && (
        <ModuleFormDialog
          initial={{
            title: module.title,
            description: module.description ?? "",
            status: module.status,
          }}
          allowStatus={owner}
          onClose={() => setEditingModule(false)}
          onSave={async (title, description, status: ModuleStatus) => {
            await updateModule(
              moduleId,
              title,
              description,
              owner ? status : module.status,
            );
            setEditingModule(false);
            await reload();
          }}
        />
      )}
      {creatingLesson && (
        <LessonFormDialog
          onClose={() => setCreatingLesson(false)}
          onSave={async (title, description, date) => {
            await createLesson(moduleId, title, description, date);
            setCreatingLesson(false);
            await reload();
          }}
        />
      )}
      {editingLesson && (
        <LessonFormDialog
          initial={{
            title: editingLesson.title,
            description: editingLesson.description ?? "",
            lessonDate: editingLesson.lessonDate ?? "",
            status: editingLesson.status,
          }}
          onClose={() => setEditingLesson(null)}
          onSave={async (title, description, date) => {
            await updateLesson(
              editingLesson.id,
              title,
              description,
              date,
              editingLesson.status,
            );
            setEditingLesson(null);
            await reload();
          }}
        />
      )}
    </AppShell>
  );
}
