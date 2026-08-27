import { CircleHelp, Menu } from "lucide-react";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { LanguageSwitch } from "@/components/common/LanguageSwitch";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/types";

export function Header({
  title,
  onMenu,
  onHelp,
}: {
  role: UserRole;
  title: string;
  onMenu: () => void;
  onHelp: () => void;
}) {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b bg-[var(--header)] px-4 shadow-[0_1px_12px_rgba(24,40,33,0.04)] backdrop-blur-xl sm:px-6 lg:px-8 xl:px-12">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenu}
          aria-label={t("accessibility.openNavigation")}
        >
          <Menu />
        </Button>
        <p className="truncate font-['Hanken_Grotesk'] text-sm font-semibold text-foreground/80 sm:text-base">
          {t(title)}
        </p>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <LanguageSwitch />
        <Button
          variant="ghost"
          size="icon"
          onClick={onHelp}
          aria-label={t("accessibility.openHelp")}
          title={t("common.help")}
          className="lg:hidden"
        >
          <CircleHelp />
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
