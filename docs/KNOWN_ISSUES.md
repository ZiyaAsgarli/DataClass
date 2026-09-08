# Known Issues

## P0 / release blocker inside DataClass application code

None known.

## External blocker: intermittent Neon request identity loss

### Symptom

A request carrying a valid Neon Auth JWT can reach the Neon Data API under the authenticated database role while PostgreSQL unexpectedly observes `auth.uid()` as null. Authorization-critical RPCs then reject the request with SQLSTATE `42501`.

### Impact

The failure can affect authenticated browser-to-Data-API calls and Worker-to-Data-API calls. Read operations may fail transiently. Mutating lesson-resource, assignment-resource, or submission operations cannot be considered production-validated while request identity can disappear.

### Current bounded resilience

Frontend authentication bootstrap permits one bounded recovery after session revalidation. The Worker permits one retry only for its explicit read-only RPC allowlist and reuses the same bearer token. No generic retry, mutation retry, authorization bypass, or fabricated identity exists.

Mutation replay is unsafe because a request may have completed only part of a database/object-storage workflow, and some authorized mutations are not guaranteed to be idempotent. Blind replay could create duplicate metadata, advance state twice, or make database and object state diverge.

Support evidence and the minimum architectural fallback are documented in [Neon Data API identity reproduction](NEON_DATA_API_IDENTITY_REPRO.md) and [Authorization architecture fallback](AUTH_ARCHITECTURE_FALLBACK.md).

## Frozen storage incident

- Two pending Lesson 1 XLSX metadata rows
- Two corresponding private B2 objects
- Zero finalized Lesson 1 resource rows
- No cleanup, deletion, finalization, or replacement upload until the Neon/root-strategy decision

## Non-blocking issues

- Archived Storage E2E assignment/submission history remains visible where the product intentionally exposes archived history.
- The production build reports an approximately 550 KB Vite chunk warning. Current production QA found no observable runtime defect from it.
