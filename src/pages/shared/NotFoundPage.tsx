import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Brand } from "@/components/common/Brand";
import { Button } from "@/components/ui/button";
import { LanguageSwitch } from "@/components/common/LanguageSwitch";
import { useTranslation } from "react-i18next";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="flex h-20 items-center justify-between px-6 lg:px-12">
        <Brand />
        <LanguageSwitch />
      </header>
      <section className="flex flex-1 items-center justify-center px-6 pb-20 text-center">
        <div>
          <p className="text-sm font-semibold text-primary">
            {t("notFound.code")}
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            {t("notFound.title")}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">
            {t("notFound.help")}
          </p>
          <Button className="mt-8" asChild>
            <Link to="/">
              <ArrowLeft />
              {t("notFound.back")}
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
