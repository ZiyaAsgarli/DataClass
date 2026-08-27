import { useState } from "react";
import { ChevronLeft, CircleHelp, LogOut, X } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { Brand } from "@/components/common/Brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { NavItem, UserRole } from "@/types";
import { useTranslation } from "react-i18next";

interface SidebarProps {
  role: UserRole;
  items: NavItem[];
  collapsed: boolean;
  mobileOpen: boolean;
  onCollapse: () => void;
  onClose: () => void;
  onHelp: () => void;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "DC"
  );
}

export function Sidebar({
  role,
  items,
  collapsed,
  mobileOpen,
  onCollapse,
  onClose,
  onHelp,
}: SidebarProps) {
  const { t } = useTranslation();
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signOutError, setSignOutError] = useState(false);
  const displayName =
    profile?.fullName || user?.name || t("common.dataClassUser");
  const avatarUrl = profile?.avatarUrl || user?.image;
  const handleSignOut = async () => {
    setSignOutError(false);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch {
      setSignOutError(true);
    }
  };
  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px] lg:hidden"
          onClick={onClose}
          aria-label={t("accessibility.closeNavigation")}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r bg-[var(--sidebar)] transition-[width,transform] duration-200 lg:z-30",
          collapsed && "lg:w-20",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-[72px] items-center justify-between border-b border-primary/10 px-5">
          <Brand compact={collapsed} />
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onClose}
            aria-label={t("accessibility.closeMenu")}
          >
            <X />
          </Button>
        </div>
        <nav
          className="flex-1 space-y-1.5 overflow-y-auto px-3 py-6"
          aria-label={t(
            role === "teacher"
              ? "accessibility.teacherNavigation"
              : "accessibility.studentNavigation",
          )}
        >
          {!collapsed && (
            <p className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("common.workspace")}
            </p>
          )}
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.label}
                to={item.href}
                end={item.href === `/${role}`}
                onClick={onClose}
                title={collapsed ? t(item.label) : undefined}
                className={({ isActive }) =>
                  cn(
                    "relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground",
                    isActive &&
                      "bg-primary/[0.09] text-primary before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:rounded-r-full before:bg-primary dark:bg-primary/15",
                  )
                }
              >
                <Icon className="size-[18px] shrink-0" strokeWidth={1.8} />
                {!collapsed && <span>{t(item.label)}</span>}
              </NavLink>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-primary/10 p-3">
          <Button
            variant="ghost"
            onClick={onHelp}
            className={cn(
              "w-full justify-start px-3",
              collapsed && "justify-center px-0",
            )}
            aria-label={t("accessibility.openHelp")}
          >
            <CircleHelp />
            {!collapsed && t("common.help")}
          </Button>
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl border border-primary/10 bg-card/70 p-2.5 shadow-sm",
              collapsed && "justify-center",
            )}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                title={collapsed ? displayName : undefined}
                referrerPolicy="no-referrer"
                className="size-9 shrink-0 rounded-full object-cover ring-2 ring-card"
              />
            ) : (
              <span
                title={collapsed ? displayName : undefined}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
              >
                {initials(displayName)}
              </span>
            )}
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{displayName}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {t(`status.role.${role}`)}
                </p>
              </div>
            )}
            {!collapsed && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleSignOut()}
                aria-label={t("accessibility.signOut")}
                title={t(
                  signOutError
                    ? "accessibility.signOutFailed"
                    : "accessibility.signOut",
                )}
                className={cn("size-8", signOutError && "text-destructive")}
              >
                <LogOut className="size-4" />
              </Button>
            )}
          </div>
          {collapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void handleSignOut()}
              aria-label={t("accessibility.signOut")}
              title={t(
                signOutError
                  ? "accessibility.signOutFailed"
                  : "accessibility.signOut",
              )}
              className={cn("w-full", signOutError && "text-destructive")}
            >
              <LogOut className="size-4" />
            </Button>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={onCollapse}
          aria-label={t(
            collapsed
              ? "accessibility.expandSidebar"
              : "accessibility.collapseSidebar",
          )}
          className="absolute -right-4 top-[86px] hidden size-8 rounded-full bg-card shadow-sm lg:inline-flex"
        >
          <ChevronLeft
            className={cn(
              "size-3.5 transition-transform",
              collapsed && "rotate-180",
            )}
          />
        </Button>
      </aside>
    </>
  );
}
