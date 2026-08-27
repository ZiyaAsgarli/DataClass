import { useTranslation } from "react-i18next";
import { changeLanguage, type AppLanguage } from "@/i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitch() {
  const { i18n, t } = useTranslation();
  const active = i18n.resolvedLanguage === "en" ? "en" : "az";
  return (
    <div
      className="flex h-9 items-center rounded-lg border bg-card/70 p-0.5 text-[11px] font-semibold"
      role="group"
      aria-label={t("accessibility.language")}
    >
      {(["az", "en"] as const).map((language) => (
        <button
          key={language}
          type="button"
          aria-pressed={active === language}
          onClick={() => void changeLanguage(language as AppLanguage)}
          className={cn(
            "h-7 rounded-md px-2.5 uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active === language
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {language}
        </button>
      ))}
    </div>
  );
}
