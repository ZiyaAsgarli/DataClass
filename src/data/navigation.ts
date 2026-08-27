import { BookOpen, FileCheck2, LayoutDashboard } from "lucide-react";
import type { NavItem } from "@/types";

export const teacherNav: NavItem[] = [
  { label: "common.overview", href: "/teacher", icon: LayoutDashboard },
  { label: "common.classes", href: "/teacher/classes", icon: BookOpen },
  {
    label: "common.assignments",
    href: "/teacher/assignments",
    icon: FileCheck2,
  },
];

export const studentNav: NavItem[] = [
  { label: "common.overview", href: "/student", icon: LayoutDashboard },
  { label: "common.myClasses", href: "/student/classes", icon: BookOpen },
  {
    label: "common.assignments",
    href: "/student/assignments",
    icon: FileCheck2,
  },
];
