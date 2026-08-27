import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={t(
        theme === "dark"
          ? "accessibility.switchLight"
          : "accessibility.switchDark",
      )}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
