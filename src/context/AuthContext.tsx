import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  BetterAuthSession,
  BetterAuthUser,
} from "@neondatabase/neon-js/auth/types";
import {
  AuthContext,
  type AuthContextValue,
  type AuthInitializationIssue,
  type AuthInitializationIssueCode,
  type AuthInitializationPhase,
  type AuthInitializationPrivilegeCategory,
} from "@/context/auth-context";
import {
  isBootstrapIdentityUnavailableError,
  resolveBootstrapWithIdentityRetry,
  runNonBlockingStep,
  runSingleFlight,
} from "@/context/auth-bootstrap-retry";
import { neonClient } from "@/lib/neon";
import type { AuthProfile, UserRole } from "@/types";

interface BootstrapRow {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  roles: string[];
}

function isUserRole(value: string): value is UserRole {
  return value === "teacher" || value === "student";
}

function safeMessage(error: unknown, fallback: string) {
  if (
    error instanceof Error &&
    error.message.includes("Missing browser-safe")
  ) {
    return "auth.notConfigured";
  }
  return fallback;
}

const issueCodeByPhase: Record<
  AuthInitializationPhase,
  AuthInitializationIssueCode
> = {
  session: "AUTH_INIT_SESSION_FAILED",
  "profile-bootstrap": "AUTH_INIT_PROFILE_BOOTSTRAP_FAILED",
  "role-validation": "AUTH_INIT_ROLE_VALIDATION_FAILED",
  "invitation-claim": "AUTH_INIT_INVITATION_CLAIM_FAILED",
};

function safeNumericStatus(value: unknown) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : null;
}

function safeDatabaseCode(value: unknown) {
  return typeof value === "string" && /^[0-9A-Z]{5}$/.test(value)
    ? value
    : null;
}

function classifyInsufficientPrivilege(
  databaseCode: string | null,
  error: unknown,
): AuthInitializationPrivilegeCategory | null {
  if (databaseCode !== "42501") return null;

  const source =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : null;
  const message =
    typeof source?.message === "string" ? source.message.toLowerCase() : "";

  if (message.includes("permission denied for function"))
    return "PERMISSION_FUNCTION";
  if (message.includes("authenticated user identity is unavailable"))
    return "AUTH_IDENTITY_UNAVAILABLE";
  if (message.includes("authentication is required"))
    return "AUTHENTICATION_REQUIRED";
  return "INSUFFICIENT_PRIVILEGE_UNKNOWN";
}

interface InitializationDiagnosticContext {
  attemptId: string;
  tokenPresent: boolean;
}

function createInitializationIssue(
  phase: AuthInitializationPhase,
  error: unknown,
  diagnosticContext: InitializationDiagnosticContext,
  categoryOverride?: AuthInitializationIssue["category"],
): AuthInitializationIssue {
  const source =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : null;
  const httpStatus =
    safeNumericStatus(source?.status) ?? safeNumericStatus(source?.statusCode);
  const databaseCode = safeDatabaseCode(source?.code);
  const category =
    categoryOverride ??
    (httpStatus === 401
      ? "authentication"
      : httpStatus === 403 || databaseCode === "42501"
        ? "authorization"
        : httpStatus !== null
          ? "transport"
          : databaseCode !== null
            ? "database"
            : error instanceof TypeError
              ? "transport"
              : "unknown");

  return {
    attemptId: diagnosticContext.attemptId,
    phase,
    code: issueCodeByPhase[phase],
    category,
    httpStatus,
    databaseCode,
    privilegeCategory: classifyInsufficientPrivilege(databaseCode, error),
    tokenPresent: diagnosticContext.tokenPresent,
    occurredAt: new Date().toISOString(),
  };
}

function reportInitializationIssue(issue: AuthInitializationIssue) {
  if (!import.meta.env.DEV) return;
  console.warn(`[auth-init] ${JSON.stringify(issue)}`);
}

function createBootstrapRetryIssue(
  diagnosticContext: InitializationDiagnosticContext,
  retrySucceeded: boolean,
): AuthInitializationIssue {
  return {
    attemptId: diagnosticContext.attemptId,
    phase: "profile-bootstrap",
    code: "AUTH_INIT_PROFILE_BOOTSTRAP_IDENTITY_RETRY",
    category: "authorization",
    httpStatus: 403,
    databaseCode: "42501",
    privilegeCategory: "AUTH_IDENTITY_UNAVAILABLE",
    tokenPresent: diagnosticContext.tokenPresent,
    bootstrapAttempt: 2,
    sessionPresent: true,
    retrySucceeded,
    occurredAt: new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<BetterAuthSession | null>(null);
  const [user, setUser] = useState<BetterAuthUser | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initializationIssue, setInitializationIssue] =
    useState<AuthInitializationIssue | null>(null);
  const initializationRef = useRef<Promise<void> | null>(null);
  const initializationAttemptRef = useRef(0);

  const clearAuth = useCallback(() => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setRoles([]);
    setInitializationIssue(null);
  }, []);

  const performAuthResolution = useCallback(async () => {
    const diagnosticContext: InitializationDiagnosticContext = {
      attemptId: `auth-init-${Date.now().toString(36)}-${++initializationAttemptRef.current}`,
      tokenPresent: false,
    };

    setLoading(true);
    setError(null);
    setInitializationIssue(null);

    try {
      let sessionResult: Awaited<ReturnType<typeof neonClient.auth.getSession>>;

      try {
        sessionResult = await neonClient.auth.getSession();
        if (sessionResult.error) throw sessionResult.error;
      } catch (caughtError) {
        const issue = createInitializationIssue(
          "session",
          caughtError,
          diagnosticContext,
        );
        reportInitializationIssue(issue);
        clearAuth();
        setInitializationIssue(issue);
        setError(safeMessage(caughtError, "auth.sessionFailed"));
        return;
      }

      if (!sessionResult.data?.session || !sessionResult.data.user) {
        clearAuth();
        return;
      }

      if (!sessionResult.data.session.token) {
        const issue = createInitializationIssue(
          "session",
          null,
          diagnosticContext,
          "authentication",
        );
        reportInitializationIssue(issue);
        clearAuth();
        setInitializationIssue(issue);
        setError("auth.sessionFailed");
        return;
      }

      const resolvedSession = sessionResult.data.session;
      const resolvedUser = sessionResult.data.user;
      diagnosticContext.tokenPresent = true;

      setSession(resolvedSession);
      setUser(resolvedUser);
      setProfile(null);
      setRoles([]);

      const bootstrap = async () => {
        const bootstrapResult = await neonClient.rpc("bootstrap_current_user");
        if (bootstrapResult.error) throw bootstrapResult.error;
        const row = (bootstrapResult.data as BootstrapRow[] | null)?.[0];
        if (!row) throw new Error("Profile bootstrap returned no profile.");
        return row;
      };

      const bootstrapOutcome = await resolveBootstrapWithIdentityRetry({
        bootstrap,
        revalidateSession: async () => {
          const refreshed = await neonClient.auth.getSession();
          if (refreshed.error) throw refreshed.error;
          return {
            session: refreshed.data?.session ?? null,
            user: refreshed.data?.user ?? null,
            tokenPresent: Boolean(refreshed.data?.session?.token),
          };
        },
      });

      if (!bootstrapOutcome.ok) {
        if (bootstrapOutcome.retryAttempted) {
          reportInitializationIssue(
            createBootstrapRetryIssue(diagnosticContext, false),
          );
        }
        const issue = createInitializationIssue(
          "profile-bootstrap",
          bootstrapOutcome.error,
          diagnosticContext,
        );
        const identityRetryPath =
          bootstrapOutcome.retryAttempted ||
          isBootstrapIdentityUnavailableError(bootstrapOutcome.error);
        issue.bootstrapAttempt = bootstrapOutcome.attempts;
        issue.sessionPresent = identityRetryPath
          ? bootstrapOutcome.sessionPresent
          : true;
        issue.tokenPresent = identityRetryPath
          ? bootstrapOutcome.tokenPresent
          : diagnosticContext.tokenPresent;
        issue.retrySucceeded = bootstrapOutcome.retrySucceeded;
        reportInitializationIssue(issue);
        setInitializationIssue(issue);
        setError(safeMessage(bootstrapOutcome.error, "auth.workspaceFailed"));
        return;
      }

      const row = bootstrapOutcome.result;
      if (bootstrapOutcome.retryAttempted) {
        const retryIssue = createBootstrapRetryIssue(
          diagnosticContext,
          bootstrapOutcome.retrySucceeded,
        );
        reportInitializationIssue(retryIssue);
        setInitializationIssue(retryIssue);
        if (bootstrapOutcome.session && bootstrapOutcome.user) {
          setSession(bootstrapOutcome.session);
          setUser(bootstrapOutcome.user);
        }
      }

      const resolvedRoles = Array.isArray(row.roles)
        ? row.roles.filter(isUserRole)
        : [];
      if (resolvedRoles.length === 0) {
        const issue = createInitializationIssue(
          "role-validation",
          null,
          diagnosticContext,
          "validation",
        );
        reportInitializationIssue(issue);
        setInitializationIssue(issue);
        setError("auth.workspaceFailed");
        return;
      }

      setProfile({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        avatarUrl: row.avatar_url,
      });
      setRoles(resolvedRoles);

      const claimError = await runNonBlockingStep(async () => {
        const claimResult = await neonClient.rpc("claim_my_class_invitations");
        if (claimResult.error) throw claimResult.error;
      });
      if (claimError) {
        const issue = createInitializationIssue(
          "invitation-claim",
          claimError,
          diagnosticContext,
        );
        reportInitializationIssue(issue);
        setInitializationIssue(issue);
      }
    } finally {
      setLoading(false);
    }
  }, [clearAuth]);

  const resolveAuth = useCallback(() => {
    return runSingleFlight(initializationRef, performAuthResolution);
  }, [performAuthResolution]);

  useEffect(() => {
    void resolveAuth();
  }, [resolveAuth]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    const callbackURL = `${window.location.origin}/auth/callback`;
    const result = await neonClient.auth.signIn.social({
      provider: "google",
      callbackURL,
      newUserCallbackURL: callbackURL,
    });

    if (result.error) {
      setError("auth.googleFailed");
      throw result.error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const result = await neonClient.auth.signOut();
    if (result.error) {
      setError("auth.signOutFailed");
      throw result.error;
    }
    clearAuth();
  }, [clearAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      roles,
      loading,
      error,
      initializationIssue,
      signInWithGoogle,
      signOut,
      retry: resolveAuth,
    }),
    [
      error,
      initializationIssue,
      loading,
      profile,
      resolveAuth,
      roles,
      session,
      signInWithGoogle,
      signOut,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
