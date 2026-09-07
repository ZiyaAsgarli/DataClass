import assert from "node:assert/strict";
import test from "node:test";
import { formatDate } from "../src/i18n/formatters.ts";

const fallback = "—";

test("Azerbaijani dates use deterministic human-readable month names", () => {
  assert.equal(formatDate("2026-01-06", "az", fallback), "6 yanvar 2026");
  assert.equal(formatDate("2026-05-06", "az", fallback), "6 may 2026");
  assert.equal(formatDate("2026-09-06", "az", fallback), "6 sentyabr 2026");
  assert.equal(formatDate("2026-12-06", "az", fallback), "6 dekabr 2026");
});

test("Azerbaijani dates never expose browser month fallback tokens", () => {
  for (let month = 1; month <= 12; month += 1) {
    const value = `2026-${String(month).padStart(2, "0")}-06`;
    assert.doesNotMatch(formatDate(value, "az", fallback), /M(?:0[1-9]|1[0-2])/);
  }
});

test("English date formatting remains unchanged", () => {
  assert.equal(formatDate("2026-09-06", "en", fallback), "6 Sept 2026");
});

test("date-only values and Date inputs preserve their calendar day", () => {
  assert.equal(formatDate("2026-09-06", "az", fallback), "6 sentyabr 2026");
  assert.equal(formatDate(new Date(2026, 8, 6), "az", fallback), "6 sentyabr 2026");
});

test("invalid dates return the supplied fallback", () => {
  assert.equal(formatDate("not-a-date", "az", fallback), fallback);
});
