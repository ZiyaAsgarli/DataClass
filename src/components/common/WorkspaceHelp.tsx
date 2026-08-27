import {
  BookOpen,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  PlayCircle,
  Route,
  Users,
} from "lucide-react";
import { DialogFrame } from "@/components/common/CourseForms";
import type { UserRole } from "@/types";
import { useTranslation } from "react-i18next";

const teacherItems = [
  {
    icon: BookOpen,
    title: "help.teacher.class",
    detail: "help.teacher.classHelp",
  },
  {
    icon: Users,
    title: "help.teacher.invite",
    detail: "help.teacher.inviteHelp",
  },
  {
    icon: Route,
    title: "help.teacher.lessons",
    detail: "help.teacher.lessonsHelp",
  },
  {
    icon: PlayCircle,
    title: "help.teacher.recordings",
    detail: "help.teacher.recordingsHelp",
  },
  {
    icon: ClipboardList,
    title: "help.teacher.assignments",
    detail: "help.teacher.assignmentsHelp",
  },
  {
    icon: CheckCircle2,
    title: "help.teacher.submissions",
    detail: "help.teacher.submissionsHelp",
  },
  {
    icon: Route,
    title: "help.teacher.lifecycle",
    detail: "help.teacher.lifecycleHelp",
  },
];

const studentItems = [
  {
    icon: BookOpen,
    title: "help.student.classes",
    detail: "help.student.classesHelp",
  },
  {
    icon: PlayCircle,
    title: "help.student.recordings",
    detail: "help.student.recordingsHelp",
  },
  {
    icon: BookOpen,
    title: "help.student.resources",
    detail: "help.student.resourcesHelp",
  },
  {
    icon: ClipboardList,
    title: "help.student.tasks",
    detail: "help.student.tasksHelp",
  },
  {
    icon: CheckCircle2,
    title: "help.student.submit",
    detail: "help.student.submitHelp",
  },
  {
    icon: CircleHelp,
    title: "help.student.revision",
    detail: "help.student.revisionHelp",
  },
  {
    icon: Route,
    title: "help.student.completed",
    detail: "help.student.completedHelp",
  },
];

export function WorkspaceHelp({
  role,
  onClose,
}: {
  role: UserRole;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const items = role === "teacher" ? teacherItems : studentItems;
  return (
    <DialogFrame
      title={t(role === "teacher" ? "help.teacherGuide" : "help.studentGuide")}
      description={t("help.intro")}
      onClose={onClose}
      className="max-w-2xl"
    >
      <ol className="mt-6 grid gap-3 sm:grid-cols-2">
        {items.map(({ icon: Icon, title, detail }, index) => (
          <li
            key={title}
            className="flex gap-3 rounded-xl border bg-muted/30 p-3.5"
          >
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"
              aria-hidden="true"
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                <span className="sr-only">
                  {t("accessibility.helpStep", { number: index + 1 })}{" "}
                </span>
                {t(title)}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                {t(detail)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </DialogFrame>
  );
}
