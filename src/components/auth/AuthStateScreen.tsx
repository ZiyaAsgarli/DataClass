import { AlertCircle, LoaderCircle, RotateCcw } from "lucide-react";
import { Brand } from "@/components/common/Brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

export function AuthStateScreen({
  error,
  onRetry,
}: {
  error?: string | null;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-5">
      <Card className="w-full max-w-md p-7 text-center shadow-[0_18px_55px_rgba(0,0,0,0.08)]">
        <div className="mb-7 flex justify-center">
          <Brand className="w-[190px] sm:w-[220px]" />
        </div>
        {error ? (
          <>
            <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertCircle className="size-5" />
            </span>
            <h1 className="mt-5 text-xl font-semibold tracking-[-0.025em]">
              {t("auth.attention")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t(error)}
            </p>
            {onRetry && (
              <Button className="mt-6" onClick={onRetry}>
                <RotateCcw />
                {t("common.retry")}
              </Button>
            )}
          </>
        ) : (
          <>
            <LoaderCircle className="mx-auto size-7 animate-spin text-primary" />
            <h1 className="mt-5 text-lg font-semibold">
              {t("auth.preparing")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("auth.confirming")}
            </p>
          </>
        )}
      </Card>
    </main>
  );
}
