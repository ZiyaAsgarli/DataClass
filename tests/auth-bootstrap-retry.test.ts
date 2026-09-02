import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOTSTRAP_IDENTITY_RETRY_DELAY_MS,
  resolveBootstrapWithIdentityRetry,
  runNonBlockingStep,
  runSingleFlight,
} from "../src/context/auth-bootstrap-retry.ts";

const validSession = {
  session: { token: "present-but-never-logged" },
  user: { present: true },
  tokenPresent: true,
};

function identityUnavailableError() {
  return {
    status: 403,
    code: "42501",
    message: "Authentication is required",
  };
}

test("bootstrap succeeds on the first attempt without retrying", async () => {
  let calls = 0;
  const outcome = await resolveBootstrapWithIdentityRetry({
    bootstrap: async () => {
      calls += 1;
      return "profile";
    },
    revalidateSession: async () => validSession,
  });

  assert.equal(outcome.ok, true);
  assert.equal(calls, 1);
  assert.equal(outcome.attempts, 1);
});

test("exact identity-unavailable failure retries once after session validation", async () => {
  let calls = 0;
  const delays: number[] = [];
  const outcome = await resolveBootstrapWithIdentityRetry({
    bootstrap: async () => {
      calls += 1;
      if (calls === 1) throw identityUnavailableError();
      return "profile";
    },
    revalidateSession: async () => validSession,
    wait: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });

  assert.equal(outcome.ok, true);
  assert.equal(calls, 2);
  assert.equal(outcome.retrySucceeded, true);
  assert.deepEqual(delays, [BOOTSTRAP_IDENTITY_RETRY_DELAY_MS]);
});

test("a failed second exact attempt returns workspace-blocking failure", async () => {
  let calls = 0;
  const outcome = await resolveBootstrapWithIdentityRetry({
    bootstrap: async () => {
      calls += 1;
      throw identityUnavailableError();
    },
    revalidateSession: async () => validSession,
    wait: async () => undefined,
  });

  assert.equal(outcome.ok, false);
  assert.equal(calls, 2);
  assert.equal(outcome.attempts, 2);
  assert.equal(outcome.retrySucceeded, false);
});

test("a different 42501 message is not retried", async () => {
  let calls = 0;
  const outcome = await resolveBootstrapWithIdentityRetry({
    bootstrap: async () => {
      calls += 1;
      throw { code: "42501", message: "permission denied for function" };
    },
    revalidateSession: async () => validSession,
  });

  assert.equal(outcome.ok, false);
  assert.equal(calls, 1);
  assert.equal(outcome.retryAttempted, false);
});

test("an arbitrary 403 is not retried", async () => {
  let calls = 0;
  const outcome = await resolveBootstrapWithIdentityRetry({
    bootstrap: async () => {
      calls += 1;
      throw { status: 403, message: "Forbidden" };
    },
    revalidateSession: async () => validSession,
  });

  assert.equal(outcome.ok, false);
  assert.equal(calls, 1);
});

test("a network failure is not retried", async () => {
  let calls = 0;
  const outcome = await resolveBootstrapWithIdentityRetry({
    bootstrap: async () => {
      calls += 1;
      throw new TypeError("Failed to fetch");
    },
    revalidateSession: async () => validSession,
  });

  assert.equal(outcome.ok, false);
  assert.equal(calls, 1);
});

test("an invalid revalidated session prevents the retry", async () => {
  let calls = 0;
  const outcome = await resolveBootstrapWithIdentityRetry({
    bootstrap: async () => {
      calls += 1;
      throw identityUnavailableError();
    },
    revalidateSession: async () => ({
      session: null,
      user: null,
      tokenPresent: false,
    }),
    wait: async () => undefined,
  });

  assert.equal(outcome.ok, false);
  assert.equal(calls, 1);
  assert.equal(outcome.retryAttempted, false);
});

test("single-flight prevents duplicate StrictMode initialization chains", async () => {
  let runs = 0;
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const flight: { current: Promise<void> | null } = { current: null };
  const task = async () => {
    runs += 1;
    await pending;
  };

  const first = runSingleFlight(flight, task);
  const second = runSingleFlight(flight, task);
  assert.equal(first, second);
  assert.equal(runs, 1);
  release?.();
  await first;
});

test("invitation claiming remains non-blocking", async () => {
  const claimError = await runNonBlockingStep(async () => {
    throw new Error("sanitized invitation failure");
  });
  assert.ok(claimError instanceof Error);

  const success = await runNonBlockingStep(async () => undefined);
  assert.equal(success, null);
});
