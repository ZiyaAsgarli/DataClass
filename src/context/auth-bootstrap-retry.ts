export const BOOTSTRAP_IDENTITY_RETRY_DELAY_MS = 300;

interface SessionRevalidation<TSession, TUser> {
  session: TSession | null;
  user: TUser | null;
  tokenPresent: boolean;
}

interface BootstrapRetryOptions<TResult, TSession, TUser> {
  bootstrap: () => Promise<TResult>;
  revalidateSession: () => Promise<SessionRevalidation<TSession, TUser>>;
  wait?: (milliseconds: number) => Promise<void>;
}

export type BootstrapRetryOutcome<TResult, TSession, TUser> =
  | {
      ok: true;
      result: TResult;
      attempts: 1 | 2;
      retryAttempted: boolean;
      retrySucceeded: boolean;
      session: TSession | null;
      user: TUser | null;
    }
  | {
      ok: false;
      error: unknown;
      attempts: 1 | 2;
      retryAttempted: boolean;
      retrySucceeded: false;
      sessionPresent: boolean;
      userPresent: boolean;
      tokenPresent: boolean;
    };

function errorField(error: unknown, field: string) {
  return error && typeof error === "object"
    ? (error as Record<string, unknown>)[field]
    : null;
}

export function isBootstrapIdentityUnavailableError(error: unknown) {
  const code = errorField(error, "code");
  const message = errorField(error, "message");

  return (
    code === "42501" &&
    typeof message === "string" &&
    message.trim().toLowerCase() === "authentication is required"
  );
}

function defaultWait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

export async function resolveBootstrapWithIdentityRetry<
  TResult,
  TSession,
  TUser,
>({
  bootstrap,
  revalidateSession,
  wait = defaultWait,
}: BootstrapRetryOptions<TResult, TSession, TUser>): Promise<
  BootstrapRetryOutcome<TResult, TSession, TUser>
> {
  let firstError: unknown;

  try {
    const result = await bootstrap();
    return {
      ok: true,
      result,
      attempts: 1,
      retryAttempted: false,
      retrySucceeded: false,
      session: null,
      user: null,
    };
  } catch (error) {
    firstError = error;
  }

  if (!isBootstrapIdentityUnavailableError(firstError)) {
    return {
      ok: false,
      error: firstError,
      attempts: 1,
      retryAttempted: false,
      retrySucceeded: false,
      sessionPresent: false,
      userPresent: false,
      tokenPresent: false,
    };
  }

  await wait(BOOTSTRAP_IDENTITY_RETRY_DELAY_MS);

  let revalidated: SessionRevalidation<TSession, TUser>;
  try {
    revalidated = await revalidateSession();
  } catch {
    return {
      ok: false,
      error: firstError,
      attempts: 1,
      retryAttempted: false,
      retrySucceeded: false,
      sessionPresent: false,
      userPresent: false,
      tokenPresent: false,
    };
  }

  const sessionPresent = revalidated.session !== null;
  const userPresent = revalidated.user !== null;
  if (!sessionPresent || !userPresent || !revalidated.tokenPresent) {
    return {
      ok: false,
      error: firstError,
      attempts: 1,
      retryAttempted: false,
      retrySucceeded: false,
      sessionPresent,
      userPresent,
      tokenPresent: revalidated.tokenPresent,
    };
  }

  try {
    const result = await bootstrap();
    return {
      ok: true,
      result,
      attempts: 2,
      retryAttempted: true,
      retrySucceeded: true,
      session: revalidated.session,
      user: revalidated.user,
    };
  } catch (error) {
    return {
      ok: false,
      error,
      attempts: 2,
      retryAttempted: true,
      retrySucceeded: false,
      sessionPresent,
      userPresent,
      tokenPresent: revalidated.tokenPresent,
    };
  }
}

export function runSingleFlight<TResult>(
  flight: { current: Promise<TResult> | null },
  task: () => Promise<TResult>,
) {
  if (flight.current) return flight.current;

  const current = task().finally(() => {
    if (flight.current === current) flight.current = null;
  });
  flight.current = current;
  return current;
}

export async function runNonBlockingStep(task: () => Promise<void>) {
  try {
    await task();
    return null;
  } catch (error) {
    return error;
  }
}
