import { useCallback } from "react";
import { ArrowRight, BookOpen, Users } from "lucide-react";
import { Link } from "react-router-dom";
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
import { listStudentClasses } from "@/services/classService";
import { useLocalized } from "@/i18n/useLocalized";

export function StudentClassesPage() {
  const { t, classStatus } = useLocalized();
  const loader = useCallback(() => listStudentClasses(), []);
  const { data, loading, error, reload } = useAsyncData(loader);
  return (
    <AppShell role="student" title="common.myClasses">
      <div className="animate-enter">
        <p className="page-kicker">{t("classes.studentWorkspace")}</p>
        <h1 className="page-title">{t("classes.my")}</h1>
        <p className="page-description">{t("classes.studentHelp")}</p>
      </div>
      <div className="animate-enter-delay mt-8">
        {loading ? (
          <LoadingState label="classes.loading" />
        ) : error ? (
          <ErrorState retry={() => void reload()} />
        ) : !data?.length ? (
          <EmptyState title="classes.none" description="classes.noneStudent" />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {data.map((course) => (
              <Card
                key={course.id}
                className="border-[var(--strong-border)] p-5 transition-all hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_14px_34px_rgba(37,75,52,0.1)] sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="icon-tile">
                    <BookOpen className="size-5" />
                  </span>
                  <StatusBadge
                    status={course.status}
                    label={classStatus(course.status)}
                  />
                </div>
                <h2 className="mt-5 text-lg font-semibold">{course.name}</h2>
                <p className="mt-2 min-h-10 text-sm leading-5 text-muted-foreground">
                  {course.description || t("common.noDescription")}
                </p>
                <div className="mt-5 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users className="size-3.5" />
                    {t("common.count.students", { count: course.studentCount })}
                  </span>
                  <span>{t("classes.lead", { name: course.ownerName })}</span>
                </div>
                <Button className="mt-5" size="sm" variant="outline" asChild>
                  <Link to={`/student/classes/${course.id}`}>
                    {t("classes.open")} <ArrowRight />
                  </Link>
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
