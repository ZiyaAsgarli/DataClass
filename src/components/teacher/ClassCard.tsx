import { ArrowRight, BookOpen, UserRoundCog, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ManagedClass } from "@/types";
import { useLocalized } from "@/i18n/useLocalized";

export function ClassCard({
  course,
  currentModule,
}: {
  course: ManagedClass;
  currentModule?: string;
}) {
  const { t, date, classStatus, accessLabel } = useLocalized();
  const updated = course.updatedAt
    ? date(course.updatedAt)
    : t("common.recently");
  return (
    <Card className="group overflow-hidden border-[var(--strong-border)] transition-all hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_14px_34px_rgba(37,75,52,0.1)]">
      <div className="h-1.5 bg-gradient-to-r from-primary via-primary/70 to-primary/20" />
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <span className="icon-tile">
            <BookOpen className="size-5" />
          </span>
          <StatusBadge
            status={course.status}
            label={classStatus(course.status)}
          />
        </div>
        <div className="mt-5 min-w-0">
          <div className="flex items-center gap-2">
            {course.teacherRole && (
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {accessLabel(course.teacherRole)}
              </span>
            )}
          </div>
          <h3 className="mt-2 truncate text-xl font-semibold tracking-[-0.025em]">
            {course.name}
          </h3>
          <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-6 text-muted-foreground">
            {course.description || t("common.noDescription")}
          </p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
          <div className="bg-muted/45 p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5" />
              {t("classes.students")}
            </p>
            <p className="mt-1 text-lg font-semibold">{course.studentCount}</p>
          </div>
          <div className="bg-muted/45 p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserRoundCog className="size-3.5" />
              {t("classes.instructors")}
            </p>
            <p className="mt-1 text-lg font-semibold">
              {course.instructorCount ?? 0}
            </p>
          </div>
        </div>
        {currentModule && (
          <p className="mt-4 rounded-lg bg-accent/55 px-3 py-2 text-xs text-accent-foreground">
            <span className="font-semibold">{t("classes.currentModule")}</span>{" "}
            {currentModule}
          </p>
        )}
        <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {t("classes.updated", { date: updated })}
          </p>
          <Button size="sm" variant="ghost" asChild className="text-primary">
            <Link to={`/teacher/classes/${course.id}`}>
              {t("classes.open")} <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
