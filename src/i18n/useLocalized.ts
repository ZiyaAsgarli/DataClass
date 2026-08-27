import { useTranslation } from "react-i18next";
import { formatDate, formatDateTime, formatFileSize } from "@/i18n/formatters";
import type {
  AssignmentRecord,
  AssignmentStatus,
  ClassStatus,
  LessonLifecycleStatus,
  ModuleLifecycleStatus,
  ModuleStatus,
  SubmissionStatus,
  UserRole,
} from "@/types";

export function useLocalized() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "az";
  return {
    t,
    date: (
      value: string | null | undefined,
      fallback = t("lessons.dateNotSet"),
    ) => formatDate(value, language, fallback),
    dateTime: (
      value: string | null | undefined,
      fallback = t("assignments.noDue"),
    ) => formatDateTime(value, language, fallback),
    fileSize: (value: number) => formatFileSize(value, language),
    roleLabel: (value: UserRole) => t(`status.role.${value}`),
    classStatus: (value: ClassStatus | string) =>
      t(`status.class.${value as ClassStatus}`),
    membershipStatus: (value: string) =>
      t(`status.membership.${value as "active" | "completed" | "removed"}`),
    accessLabel: (value: string) =>
      t(
        `status.access.${value as "owner" | "instructor" | "student" | "module_instructor" | "viewer"}`,
      ),
    moduleAvailability: (value: ModuleStatus | "draft") =>
      t(`status.moduleAvailability.${value}`),
    moduleLifecycle: (value: ModuleLifecycleStatus, current = false) =>
      t(
        value === "active" && current
          ? "status.moduleLifecycle.current"
          : `status.moduleLifecycle.${value}`,
      ),
    lessonStatus: (value: LessonLifecycleStatus) => t(`status.lesson.${value}`),
    assignmentStatus: (value: AssignmentStatus) =>
      t(`status.assignment.${value}`),
    submissionStatus: (value: SubmissionStatus | null | undefined) =>
      t(
        !value || value === "draft"
          ? "status.submission.none"
          : `status.submission.${value}`,
      ),
    studentAssignmentStatus: (assignment: AssignmentRecord) => {
      if (
        assignment.submissionStatus &&
        assignment.submissionStatus !== "draft"
      )
        return t(`status.submission.${assignment.submissionStatus}`);
      if (!assignment.dueAt) return t("status.submission.none");
      const remaining = new Date(assignment.dueAt).getTime() - Date.now();
      if (remaining < 0)
        return t(
          assignment.allowLateSubmission
            ? "status.attention.lateAvailable"
            : "status.attention.deadlinePassed",
        );
      return t(
        remaining <= 2 * 86400000
          ? "status.attention.dueSoon"
          : "status.attention.upcoming",
      );
    },
  };
}
