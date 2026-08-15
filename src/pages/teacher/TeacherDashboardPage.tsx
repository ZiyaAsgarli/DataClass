import { ArrowRight, CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";
import { ActivityList } from "@/components/common/ActivityList";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ClassCard } from "@/components/teacher/ClassCard";
import { StatGrid } from "@/components/teacher/StatGrid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { classes, deadlines, teacherActivity } from "@/data/mockData";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/layouts/AppShell";

export function TeacherDashboardPage() {
  const { profile } = useAuth();
  const firstName = profile?.fullName.split(/\s+/)[0] || "Teacher";
  return (
    <AppShell role="teacher" title="Overview">
      <div className="animate-enter">
        <div className="mb-8">
          <p className="text-sm font-medium text-primary">Friday, August 14</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
            Good morning, {firstName}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Here’s what’s happening across your classes today.
          </p>
        </div>
        <StatGrid />
      </div>
      <div className="animate-enter-delay mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <section>
          <SectionHeader
            title="Recent Classes"
            description="Your most recently active learning spaces"
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/teacher/classes">
                  View all <ArrowRight />
                </Link>
              </Button>
            }
          />
          <ClassCard course={classes[0]} featured />
        </section>
        <section>
          <SectionHeader
            title="Recent Activity"
            description="Latest updates from your classroom"
          />
          <Card className="p-5">
            <ActivityList items={teacherActivity} />
          </Card>
        </section>
      </div>
      <section className="mt-8">
        <SectionHeader
          title="Upcoming Deadlines"
          description="Assignments due over the next two weeks"
        />
        <Card className="overflow-hidden">
          <div className="divide-y">
            {deadlines.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <CalendarDays className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.module} · {item.submissions}
                    </p>
                  </div>
                </div>
                <p className="ml-12 text-xs font-semibold sm:ml-0">
                  Due {item.date}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </AppShell>
  );
}
