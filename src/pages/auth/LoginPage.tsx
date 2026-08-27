import { useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  CircleUserRound as GoogleIcon,
  Layers3,
  LoaderCircle,
} from "lucide-react";
import { Navigate, useSearchParams } from "react-router-dom";
import { AuthStateScreen } from "@/components/auth/AuthStateScreen";
import { Brand } from "@/components/common/Brand";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { LanguageSwitch } from "@/components/common/LanguageSwitch";
import { useTranslation } from "react-i18next";

const features = [
  { icon: Layers3, label: "auth.structured" },
  { icon: BookOpenCheck, label: "auth.nextSteps" },
  { icon: CheckCircle2, label: "auth.feedback" },
];

export function LoginPage() {
  const { t } = useTranslation();
  const {
    user,
    roles,
    loading,
    error: authError,
    retry,
    signInWithGoogle,
  } = useAuth();
  const [searchParams] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  if (loading) return <AuthStateScreen />;
  if (user)
    return (
      <Navigate
        to={roles.includes("teacher") ? "/teacher" : "/student"}
        replace
      />
    );

  const oauthError = searchParams.get("error");
  const visibleError =
    loginError || (oauthError ? "auth.cancelled" : null) || authError;

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setLoginError(null);
    try {
      await signInWithGoogle();
    } catch {
      setLoginError("auth.googleFailed");
      setSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <header className="absolute inset-x-0 top-0 z-10 flex h-20 items-center justify-between px-5 sm:px-8 lg:px-12">
        <Brand />
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <ThemeToggle />
        </div>
      </header>
      <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex items-center px-5 pb-16 pt-28 sm:px-8 lg:px-12 xl:px-20">
          <div className="animate-enter max-w-2xl">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              {t("auth.kicker")}
            </p>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.05em] sm:text-5xl xl:text-6xl">
              {t("auth.hero")}{" "}
              <span className="text-muted-foreground">
                {t("auth.heroAccent")}
              </span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground">
              {t("auth.intro")}
            </p>
            <div className="mt-10 grid max-w-xl gap-4 sm:grid-cols-3">
              {features.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-2.5 text-sm font-medium"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="size-4" />
                  </span>
                  {t(label)}
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="relative flex items-center justify-center border-t bg-muted/35 px-5 py-20 lg:border-l lg:border-t-0">
          <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px]" />
          <Card className="animate-enter relative w-full max-w-md p-6 shadow-[0_18px_55px_rgba(0,0,0,0.08)] sm:p-8">
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                {t("auth.welcome")}
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
                {t("auth.signIn")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("auth.googleHelp")}
              </p>
            </div>
            <Button
              variant="outline"
              className="h-11 w-full"
              disabled={submitting}
              onClick={() => void handleGoogleSignIn()}
            >
              {submitting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              {t(submitting ? "auth.connecting" : "auth.continueGoogle")}
            </Button>
            {visibleError && (
              <div
                className="mt-5 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-center text-xs leading-5 text-destructive"
                role="alert"
              >
                {t(visibleError)}
                {authError && (
                  <button
                    type="button"
                    className="ml-1 font-semibold underline underline-offset-2"
                    onClick={() => void retry()}
                  >
                    {t("common.retry")}
                  </button>
                )}
              </div>
            )}
            <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
              {t("auth.roleHelp")}
            </p>
          </Card>
        </section>
      </div>
    </main>
  );
}
