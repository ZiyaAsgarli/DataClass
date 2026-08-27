import type { ReactNode } from "react";
import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <Card
      className="flex min-h-44 items-center justify-center gap-3 p-8 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <LoaderCircle className="size-4 animate-spin" />
      {label ? t(label) : t("common.loading")}
    </Card>
  );
}

export function ErrorState({
  retry,
  message,
}: {
  retry: () => void;
  message?: string;
}) {
  const { t } = useTranslation();
  return (
    <Card
      className="flex min-h-44 flex-col items-center justify-center p-8 text-center"
      role="alert"
    >
      <AlertCircle className="size-6 text-destructive" />
      <p className="mt-3 text-sm font-medium">
        {message ? t(message) : t("errors.generic")}
      </p>
      <Button className="mt-4" variant="outline" size="sm" onClick={retry}>
        {t("common.retry")}
      </Button>
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Card className="flex min-h-36 flex-col items-center justify-center border-dashed p-6 text-center sm:p-8">
      <span className="icon-tile">
        <Inbox className="size-5" />
      </span>
      <h2 className="mt-4 font-semibold">{t(title)}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {t(description)}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}
