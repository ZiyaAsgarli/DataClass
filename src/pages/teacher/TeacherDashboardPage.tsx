import { useCallback } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Circle,
  ClipboardCheck,
  ClipboardList,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/DataState";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ClassCard } from "@/components/teacher/ClassCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/layouts/AppShell";
import {
  listAssignmentRoster,
  listTeacherAssignments,
} from "@/services/assignmentService";
import { listTeacherClasses } from "@/services/classService";
import { listTeacherClassModules } from "@/services/moduleService";
import type {
  AssignmentRecord,
  CourseModuleRecord,
  ManagedClass,
} from "@/types";
import { useLocalized } from "@/i18n/useLocalized";

interface TeacherDashboardData {
  classes: ManagedClass[];
  assignments: AssignmentRecord[];
  reviewItems: Array<{ assignment: AssignmentRecord; count: number }>;
  modules: CourseModuleRecord[];
}

export function TeacherDashboardPage() {
  const { t } = useLocalized();
  const { profile } = useAuth();
  const firstName = profile?.fullName.split(/\s+/)[0] || t("common.teacher");
  const loader = useCallback(async (): Promise<TeacherDashboardData> => {
    const [classes, assignments] = await Promise.all([
      listTeacherClasses(),
      listTeacherAssignments(),
    ]);
    const [reviewItems, modulesByClass] = await Promise.all([
      Promise.all(
        assignments.map(async (assignment) => ({
          assignment,
          count: (await listAssignmentRoster(assignment.id)).filter(
            (student) =>
              student.status === "submitted" ||
              student.status === "late" ||
              student.status === "resubmitted",
          ).length,
        })),
      ),
      Promise.all(classes.map((course) => listTeacherClassModules(course.id))),
    ]);
    return {
      classes,
      assignments,
      reviewItems: reviewItems.filter((item) => item.count > 0),
      modules: modulesByClass.flat(),
    };
  }, []);
  const { data, loading, error, reload } = useAsyncData(loader);

  return (
    <AppShell role="teacher" title="common.overview">
      <div className="animate-enter mb-8">
        <h1 className="page-title">
          {t("dashboard.welcome", { name: firstName })}
        </h1>
        <p className="page-description">{t("dashboard.teacherIntro")}</p>
      </div>
      {loading ? (
        <LoadingState label="dashboard.loadingTeacher" />
      ) : error || !data ? (
        <ErrorState
          retry={() => void reload()}
          message="errors.teacherOverview"
        />
      ) : (
        <DashboardContent data={data} />
      )}
    </AppShell>
  );
}

function DashboardContent({ data }: { data: TeacherDashboardData }) {
  const { t, dateTime, assignmentStatus } = useLocalized();
  const active = data.classes.filter((course) => course.status === "active");
  const enrollments = active.reduce(
    (total, course) => total + course.studentCount,
    0,
  );
  const publishedAssignments = data.assignments.filter(
    (assignment) => assignment.status === "published",
  );
  const pendingReviews = data.reviewItems.reduce(
    (total, item) => total + item.count,
    0,
  );
  const activeModules = data.modules.filter(
    (module) =>
      module.lifecycleStatus === "active" &&
      (module.status === "active" || module.status === "completed"),
  );
  const setupSteps = [
    {
      label: t("dashboard.setupClass"),
      complete: data.classes.length > 0,
      href: "/teacher/classes",
    },
    {
      label: t("dashboard.setupInvite"),
      complete: enrollments > 0,
      href: data.classes[0]
        ? `/teacher/classes/${data.classes[0].id}`
        : "/teacher/classes",
    },
    {
      label: t("dashboard.setupLessons"),
      complete: data.modules.some((module) => (module.lessonCount ?? 0) > 0),
      href: data.modules[0]
        ? `/teacher/classes/${data.modules[0].classId}/modules/${data.modules[0].id}`
        : data.classes[0]
          ? `/teacher/classes/${data.classes[0].id}`
          : "/teacher/classes",
    },
    {
      label: t("dashboard.setupAssignment"),
      complete: publishedAssignments.length > 0,
      href: "/teacher/assignments",
    },
    {
      label: t("dashboard.setupReview"),
      complete: data.assignments.some(
        (assignment) => (assignment.reviewedCount ?? 0) > 0,
      ),
      href: data.assignments[0]
        ? `/teacher/assignments/${data.assignments[0].id}`
        : "/teacher/assignments",
    },
  ];
  const nextStep = setupSteps.find((step) => !step.complete);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Metric
          icon={BookOpen}
          label={t("dashboard.activeClasses")}
          value={active.length}
        />
        <Metric
          icon={Users}
          label={t("dashboard.activeEnrollments")}
          value={enrollments}
        />
        <Metric
          icon={ClipboardList}
          label={t("dashboard.publishedAssignments")}
          value={publishedAssignments.length}
        />
        <Metric
          icon={ClipboardCheck}
          label={t("dashboard.needsReview")}
          value={pendingReviews}
          emphasis={pendingReviews > 0}
        />
      </div>
      {activeModules.length ? (
        <Card className="mt-6 overflow-hidden border-primary/25 bg-accent/35 p-5 sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("dashboard.currentTeaching")}
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">
                {activeModules.map((module) => module.title).join(", ")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("dashboard.activeAcross")}
              </p>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link
                to={`/teacher/classes/${activeModules[0].classId}/modules/${activeModules[0].id}`}
              >
                {t("dashboard.openModule")}
              </Link>
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="mt-5 flex flex-col gap-1 border-primary/10 bg-accent/15 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
          <p className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("dashboard.currentTeaching")}
          </p>
          <span className="hidden text-border sm:inline">•</span>
          <p className="text-sm">
            <span className="font-medium">{t("dashboard.noActive")}</span>{" "}
            <span className="text-muted-foreground">
              {t("dashboard.activate")}
            </span>
          </p>
        </Card>
      )}
      {nextStep && (
        <Card className="mt-6 border-primary/20 bg-accent/35 p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {t("dashboard.setupTitle")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("dashboard.setupHelp")}
              </p>
              <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {setupSteps.map((step) => (
                  <li
                    key={step.label}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span
                      className={
                        step.complete
                          ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                          : "flex size-5 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground"
                      }
                    >
                      {step.complete ? (
                        <Check className="size-3" />
                      ) : (
                        <Circle className="size-2" />
                      )}
                    </span>
                    <span
                      className={
                        step.complete
                          ? "text-muted-foreground line-through decoration-border"
                          : "font-medium"
                      }
                    >
                      {step.label}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <Button className="w-full lg:w-auto" asChild>
              <Link to={nextStep.href}>
                {t("dashboard.continueSetup")} <ArrowRight />
              </Link>
            </Button>
          </div>
        </Card>
      )}
      <section className="mt-8">
        <SectionHeader
          title={t("dashboard.needsReview")}
          description={t("dashboard.reviewHelp")}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/teacher/assignments">
                {t("dashboard.allAssignments")} <ArrowRight />
              </Link>
            </Button>
          }
        />
        {data.reviewItems.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.reviewItems.map(({ assignment, count }) => (
              <Card
                key={assignment.id}
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={assignment.status}
                      label={assignmentStatus(assignment.status)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {t("common.count.submissions", { count })}
                    </span>
                  </div>
                  <h2 className="mt-2 truncate font-semibold">
                    {assignment.title}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {assignment.className} ·{" "}
                    {assignment.dueAt
                      ? dateTime(assignment.dueAt)
                      : t("assignments.noDue")}
                  </p>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/teacher/assignments/${assignment.id}`}>
                    {t("dashboard.reviewRoster")}
                  </Link>
                </Button>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="px-5 py-4 text-center">
            <p className="font-medium">{t("dashboard.caughtUp")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("dashboard.noReviews")}
            </p>
          </Card>
        )}
      </section>
      <section className="animate-enter-delay mt-8">
        <SectionHeader
          title={t("dashboard.recentClasses")}
          description={t("dashboard.classesTeach")}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/teacher/classes">
                {t("common.viewAll")} <ArrowRight />
              </Link>
            </Button>
          }
        />
        {!data.classes.length ? (
          <EmptyState
            title="classes.none"
            description="dashboard.noClasses"
            action={
              <Button asChild>
                <Link to="/teacher/classes">{t("classes.createTitle")}</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {data.classes.slice(0, 2).map((course) => (
              <ClassCard
                key={course.id}
                course={course}
                currentModule={
                  activeModules.find((module) => module.classId === course.id)
                    ?.title
                }
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  emphasis = false,
}: {
  icon: typeof BookOpen;
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <Card
      className={
        emphasis
          ? "border-primary bg-primary p-4 text-primary-foreground shadow-[0_10px_24px_rgba(47,104,70,0.18)]"
          : "border-[var(--strong-border)] p-4"
      }
    >
      <span
        className={
          emphasis
            ? "flex size-9 items-center justify-center rounded-lg bg-white/15 text-white"
            : "icon-tile size-9 rounded-lg"
        }
      >
        <Icon className="size-4" />
      </span>
      <p className="mt-3 font-['Hanken_Grotesk'] text-[1.65rem] font-bold leading-none tracking-[-0.04em]">
        {value}
      </p>
      <p
        className={
          emphasis
            ? "mt-1 text-xs text-primary-foreground/75"
            : "mt-1 text-xs text-muted-foreground"
        }
      >
        {label}
      </p>
    </Card>
  );
}
