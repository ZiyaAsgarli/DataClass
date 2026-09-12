# Auth Gateway Full Migration Blueprint

Prepared from the final definitions in migrations `0001` through `0010` on `dataclass-step-16-auth-gateway`. This is an inventory and forward-only design. It changes no application, Worker, database, Auth, Hyperdrive, B2, or production configuration.

## Canonical database inventory

Historical definitions were replayed in filename order and keyed by schema, function name, and argument types. Six older definitions are superseded: `update_module`, four module read functions replaced by migration `0009`, and `get_submission_detail` replaced by `0010`. The final active inventory is:

| Object | Active count | Final characteristics |
| --- | ---: | --- |
| Public functions | 84 | 80 `SECURITY DEFINER`, 4 invoker; all 84 have fixed `search_path` |
| Browser read RPCs | 31 | All authenticated and identity-dependent |
| Browser mutation RPCs | 24 | All authenticated and identity-dependent |
| Worker-only storage RPCs | 16 | Eight reads and eight database mutations in multi-system flows |
| Internal helpers | 12 | Eight identity/authorization helpers and four pure validators/parsers |
| Trigger functions | 1 | `set_updated_at`; used by seven triggers |
| Active RLS policies | 9 | All `SELECT`, all targeted to `authenticated`, all identity-dependent |
| RLS-enabled tables | 15 | Six have no permissive policy and deny direct authenticated access |

No final production migration uses `auth.user_id()`, `request.jwt.claims`, `current_setting`, `current_user`, or `session_user`. Seventy-six functions call `auth.uid()` directly. `can_manage_module`, `can_read_module`, and `can_read_lesson` depend on it transitively through other helpers. All 71 callable RPCs and eight authorization helpers are therefore identity-dependent. Three policies call `auth.uid()` directly and six depend on an identity helper. In total, 79 functions plus nine policies, 88 objects, depend on extension identity directly or transitively.

All callable RPCs below are currently `SECURITY DEFINER`, use `SET search_path = pg_catalog`, and are granted to `authenticated`. Their authorization is function-level unless the table/RLS column says otherwise. Every proposed gateway operation is authenticated, takes actor identity only from `app_private.current_actor_id()`, accepts no actor argument, and is safe to expose only through a static registry with exact validation.

### A. Read-only browser RPCs

`rows[...]` means a JSON array whose objects retain the named SQL columns. `int8` columns require the numeric normalization rules below; UUID, date, and timestamp behavior is also centralized below.

| Operation and SQL arguments | Return shape | Tables and authorization boundary |
| --- | --- | --- |
| `list_my_teacher_classes()` | rows: class identity/content, `teacher_role`, two `int8` counts, timestamps | `classes`, `class_teachers`, `class_members`; actor teacher relationship |
| `list_my_student_classes()` | rows: class identity/content, owner name, `int8` student count, timestamps | `classes`, `class_members`, `profiles`; actor membership |
| `get_class_overview(target_class_id uuid)` | rows: class, owner identity/contact, access, two `int8` counts, timestamps | class tables and `profiles`; teacher/owner access |
| `get_class_students(target_class_id uuid)` | rows: membership/student/profile/status/joined timestamp | `class_members`, `profiles`; class teacher check |
| `get_class_invitations(target_class_id uuid)` | rows: invitation/email/status/created/accepted/expiry | `class_invitations`; class owner check |
| `get_class_instructors(target_class_id uuid)` | rows: relationship, teacher/profile, role/timestamp | `class_teachers`, `profiles`; class teacher check |
| `get_my_student_class_overview(target_class_id uuid)` | rows: student-safe class/owner/access/counts/timestamps | class tables and `profiles`; actor membership |
| `get_my_student_class_instructors(target_class_id uuid)` | rows: student-safe instructor profile/role/timestamp | `class_teachers`, `profiles`; actor membership |
| `list_teacher_class_modules(target_class_id uuid)` | rows: module fields, lifecycle, two `int8` lesson counts, instructor text array, manage flag, timestamps | `modules`, `lessons`, `module_teachers`, `profiles`; class teacher check |
| `get_teacher_module(target_module_id uuid)` | rows: module/class fields, lifecycle, counts, instructor array, access, timestamps | learning/class tables; class teacher check |
| `list_module_instructor_options(target_module_id uuid)` | rows: teacher/profile/class role/assigned boolean | class/module teacher tables, profiles/roles; class owner check |
| `list_teacher_module_lessons(target_module_id uuid)` | rows: lesson fields/date/position/status/timestamps | `modules`, `lessons`; class teacher check |
| `get_teacher_lesson(target_lesson_id uuid)` | rows: lesson/module/class fields/access/timestamps | `lessons`, `modules`, `classes`; class teacher check |
| `list_student_class_modules(target_class_id uuid)` | rows: published module view, `int8` count, instructor array, timestamps | learning tables/profiles; membership and lifecycle checks |
| `get_student_module(target_module_id uuid)` | rows: published module/class view and instructor array | learning/class tables/profiles; membership and lifecycle checks |
| `list_student_module_lessons(target_module_id uuid)` | rows: published lesson fields/date/timestamps | `modules`, `lessons`; membership and lifecycle checks |
| `get_student_lesson(target_lesson_id uuid)` | rows: published lesson/module/class fields/timestamps | learning/class tables; membership and lifecycle checks |
| `get_teacher_lesson_video(target_lesson_id uuid)` | rows: provider/id/url/duration/manage flag | `lessons`, `modules`; class teacher check |
| `get_student_lesson_video(target_lesson_id uuid)` | rows: provider/id/duration | `lessons`, `modules`; membership plus published/lifecycle checks |
| `list_teacher_lesson_resources(target_lesson_id uuid)` | rows: resource metadata, `int8` size, manage flag | lesson/resource/module tables; class teacher check |
| `list_student_lesson_resources(target_lesson_id uuid)` | rows: ready resource metadata and `int8` size | lesson/resource/module tables; membership plus published/lifecycle checks |
| `list_teacher_assignments()` | rows: assignment/class/lesson, timestamps, three `int8` counts | assignments, class/member, lesson, submissions; manage-assignment check |
| `list_student_assignments()` | rows: assignment plus actor submission state/timestamps | assignments, membership, lessons, submissions; actor membership |
| `get_teacher_assignment(target_assignment_id uuid)` | rows: assignment detail and five `int8` counts | assignment/class/member/lesson/submission tables; manage check |
| `get_student_assignment(target_assignment_id uuid)` | rows: assignment, actor submission, feedback | assignment/member/lesson/submission/feedback; actor membership |
| `list_assignment_roster(target_assignment_id uuid)` | rows: student/profile and submission status/timestamps/late flag | assignment/member/profile/submission; manage check |
| `list_assignment_lesson_options(target_class_id uuid)` | rows: lesson id/title/module title | module/lesson tables; manageable lessons in class |
| `list_teacher_assignment_resources(target_assignment_id uuid)` | rows: ready metadata, `int8` size, manage flag | `assignment_resources`; manage check |
| `list_student_assignment_resources(target_assignment_id uuid)` | rows: ready metadata and `int8` size | assignment/resource tables; published assignment and membership |
| `get_submission_detail(target_submission_id uuid)` | rows: assignment/student/avatar/submission/feedback/review/late fields | assignment/profile/submission/feedback; owner student or managing teacher |
| `list_submission_files(target_submission_id uuid)` | rows: ready file metadata, `int8` size, version/timestamp | submission/file tables; owner student or managing teacher |

### B. Browser mutation RPCs

| Operation and SQL arguments | Return | Tables and exact mutation class |
| --- | --- | --- |
| `bootstrap_current_user()` | profile/roles row | Auth user read plus profile/role upsert; **M2**, conflict-guarded bootstrap |
| `claim_my_class_invitations()` | `claimed_count integer` row | invitation/member updates under row locks; **M2**, already-accepted invitations are excluded |
| `create_class(class_name text, class_description text?)` | `class_id uuid` row | inserts class and owner relationship; **M3**, a repeated uncertain commit creates another class |
| `update_owned_class(target_class_id uuid, class_name text, class_description text?, class_status text?)` | void | sets class fields; **M2**, same target values are conditionally repeatable |
| `create_class_invitations(target_class_id uuid, invitation_emails text[])` | email/outcome rows | conflict-protected invitation inserts; **M2** |
| `revoke_class_invitation(target_invitation_id uuid)` | void | pending-to-revoked transition; **M2** |
| `add_class_instructor_by_email(target_class_id uuid, teacher_email text)` | outcome row | conflict-protected relationship insert; **M2** |
| `remove_class_instructor(target_class_id uuid, target_teacher_id uuid)` | void | guarded relationship delete; **M2**, repeat becomes not-found |
| `create_module(target_class_id uuid, module_title text, module_description text?)` | `module_id uuid` row | positional insert; **M3**, repeat creates another module |
| `update_module(target_module_id uuid, module_title text, module_description text?, module_status text?)` | void | guarded field/status update; **M2** |
| `set_module_lifecycle(target_module_id uuid, requested_lifecycle_status text)` | void | guarded lifecycle transition; **M2** |
| `reorder_module(target_module_id uuid, move_direction text)` | `new_position integer` row | swaps positions; **M3**, repeating moves again |
| `assign_module_instructor(target_module_id uuid, target_teacher_id uuid)` | outcome row | conflict-protected insert; **M2** |
| `remove_module_instructor(target_module_id uuid, target_teacher_id uuid)` | void | guarded delete; **M2** |
| `create_lesson(target_module_id uuid, lesson_title text, lesson_description text?, target_lesson_date date?)` | `lesson_id uuid` row | positional insert; **M3**, repeat creates another lesson |
| `update_lesson(target_lesson_id uuid, lesson_title text, lesson_description text?, target_lesson_date date?, lesson_status text?)` | void | guarded field/status update; **M2** |
| `reorder_lesson(target_lesson_id uuid, move_direction text)` | `new_position integer` row | swaps positions; **M3**, repeating moves again |
| `set_lesson_youtube_video(target_lesson_id uuid, youtube_url text)` | video id/canonical URL row | deterministic lesson video update; **M2** |
| `remove_lesson_video(target_lesson_id uuid)` | void | clears lesson video fields; **M2** |
| `create_assignment(target_class_id uuid, target_lesson_id uuid?, assignment_title text, assignment_description text?, assignment_due_at timestamptz?, assignment_allow_late boolean)` | scalar UUID | inserts assignment; **M3**, repeat creates another assignment |
| `update_assignment(target_assignment_id uuid, assignment_title text, assignment_description text?, assignment_due_at timestamptz?, assignment_allow_late boolean)` | void | deterministic guarded update; **M2** |
| `set_assignment_status(target_assignment_id uuid, next_status text)` | void | guarded workflow transition; **M2** |
| `submit_my_assignment(target_assignment_id uuid)` | submission id/status/submitted timestamp row | guarded draft/revision transition; **M2** |
| `review_submission(target_submission_id uuid, review_action text, feedback_message text?)` | void | status update plus feedback insert; **M3**, replay can duplicate feedback |

No current database mutation is classified M1 because even deterministic updates have authorization, state-transition, not-found, timestamp, or conflict behavior that should be re-evaluated on a fresh user action. There are 17 M2 browser mutations and seven M3 browser mutations.

### C. Backend-only storage RPCs

These 16 operations must never be accepted by the generic browser registry. The production Worker invokes them as fixed entries inside storage route orchestration.

| Operation and SQL arguments | Return | Role in storage flow / mutation class |
| --- | --- | --- |
| `prepare_lesson_resource_upload(target_lesson_id uuid, original_file_name text, expected_file_size_bytes bigint, content_type text, resource_kind text, resource_title text?)` | pending resource/path metadata row | DB before B2; **M4** |
| `get_lesson_resource_upload_state(target_resource_id uuid)` | state/path/size metadata row | read before B2 inspection |
| `finalize_lesson_resource_upload(target_resource_id uuid, verified_file_size_bytes bigint, verified_storage_etag text?)` | void | DB after B2; **M4** |
| `authorize_lesson_resource_download(target_resource_id uuid)` | ready object path/download metadata row | authorization read before signed GET |
| `authorize_lesson_resource_delete(target_resource_id uuid)` | object id/path row | authorization read before B2 delete |
| `delete_lesson_resource_metadata(target_resource_id uuid)` | void | DB after B2 delete; **M4** |
| `prepare_assignment_resource_upload(target_assignment_id uuid, original_file_name text, expected_file_size_bytes bigint, content_type text, resource_kind text, resource_title text?)` | pending resource/path metadata row | DB before B2; **M4** |
| `get_assignment_resource_upload_state(target_resource_id uuid)` | state/path/size metadata row | read before B2 inspection |
| `finalize_assignment_resource_upload(target_resource_id uuid, verified_file_size_bytes bigint, verified_storage_etag text?)` | void | DB after B2; **M4** |
| `authorize_assignment_resource_download(target_resource_id uuid)` | ready object path/download metadata row | authorization read before signed GET |
| `authorize_assignment_resource_delete(target_resource_id uuid)` | object id/path row | authorization read before B2 delete |
| `delete_assignment_resource_metadata(target_resource_id uuid)` | void | DB after B2 delete; **M4** |
| `prepare_submission_file_upload(target_assignment_id uuid, original_file_name text, expected_file_size_bytes bigint, content_type text, resource_kind text)` | pending file/submission/version/path metadata row | DB before B2, may create draft submission; **M4** |
| `get_submission_file_upload_state(target_file_id uuid)` | state/path/size metadata row | read before B2 inspection |
| `finalize_submission_file_upload(target_file_id uuid, verified_file_size_bytes bigint, verified_storage_etag text?)` | void | DB after B2; **M4** |
| `authorize_submission_file_download(target_file_id uuid)` | ready object path/download metadata row | authorization read before signed GET |

The eight M4 database mutations are the three prepare operations, three finalize operations, and two metadata deletes. M4 describes their orchestration context; it does not imply that a single SQL transaction can include B2.

### D–G. Helpers, triggers, and inactive categories

| Function | Classification | Security / identity / tables |
| --- | --- | --- |
| `is_class_owner(target_class_id uuid)` | D internal helper | definer; direct actor; `classes` |
| `is_class_teacher(target_class_id uuid)` | D | definer; direct actor; `class_teachers` |
| `is_class_member(target_class_id uuid)` | D | definer; direct actor; `class_members` |
| `is_module_instructor(target_module_id uuid)` | D | definer; direct actor; `module_teachers` |
| `can_manage_module(target_module_id uuid)` | D | definer; transitive actor; `modules` plus class/module helpers |
| `can_read_module(target_module_id uuid)` | D | definer; transitive actor; `modules` plus class/member helpers |
| `can_read_lesson(target_lesson_id uuid)` | D | definer; transitive actor; `lessons`, `modules` plus read helper |
| `can_manage_assignment(target_assignment_id uuid)` | D | definer; direct actor; `assignments`, `classes`, `lessons` |
| `youtube_video_identity(input_url text)` | D | definer; pure parser, no actor/table |
| `private_file_extension(file_name text)` | D | invoker; pure parser |
| `is_supported_private_file_kind(file_kind text)` | D | invoker; pure validator |
| `safe_private_file_name(file_name text)` | D | invoker; pure validator |
| `set_updated_at()` | E trigger function | invoker; no actor; seven update triggers |

There are no separately active functions in F (`NOT_AUTH_SENSITIVE`) because the four non-auth callable utilities are internal helpers, and none in G (`OBSOLETE / SUPERSEDED`) after final-definition collapse. Superseded definitions remain historical migration text only.

## Identity replacement map

| Object set | Current | Target | Direct replacement | Additional work |
| --- | --- | --- | --- | --- |
| 76 direct-identity functions | `auth.uid()` | `app_private.current_actor_id()` | Yes | Recreate as gateway version; audit owner/grants for every definer function |
| 3 transitive module helpers | nested identity helpers | migrated nested helpers | No textual replacement | Retest recursion and every teacher/student predicate |
| 3 direct-identity policies | `auth.uid()` expression | `app_private.current_actor_id()` | Yes | Add capability-owner role target; do not remove legacy policy before cutover |
| 6 helper-based policies | public authorization helper | migrated gateway helper | No textual identity replacement | Add capability-owner target or a separate policy; audit recursion |

There are 79 safe direct identity substitutions: 76 functions and three policies. Twelve objects require coordinated handling beyond substitution: all nine policies and the three transitive helpers. These sets overlap for the three direct policies. No result contract is intended to change.

All 80 definer functions require an ownership/privilege audit. Existing fixed search paths already meet the baseline, but every recreated function must preserve that property. The migration should add an `app_gateway` version of each callable function rather than replace the active `public` function during staging. The static registry maps the existing public operation key to `app_gateway.<same_name>`. This preserves the legacy Data API rollback path without a runtime fallback and prevents business-contract changes. After stable cutover, a later forward migration may retire legacy grants and remove duplicated definitions.

## Active RLS map

The gateway LOGIN never receives table privileges. Gateway functions execute as a NOLOGIN capability owner, so RLS evaluates for that capability role. Existing definer functions may currently execute with an owner that bypasses RLS; their explicit function checks are therefore the primary authorization boundary. No migration may assume `SECURITY DEFINER` automatically gains RLS protection.

| Table / policy | Command and role | Current `USING` / `WITH CHECK` | Current identity layer | Gateway migration |
| --- | --- | --- | --- | --- |
| `profiles` / `profiles_read_own` | SELECT / `authenticated` | `(SELECT auth.uid()) = id` / none | RLS direct | Keep legacy; add capability policy needed by exact functions, with function-level filtering |
| `user_roles` / `user_roles_read_own` | SELECT / `authenticated` | `(SELECT auth.uid()) = user_id` / none | RLS direct | Same; do not grant gateway LOGIN table access |
| `classes` / `classes_read_authorized` | SELECT / `authenticated` | `is_class_teacher(id) OR is_class_member(id)` / none | RLS + helper | Capability policy and migrated helper/function tests |
| `class_members` / `class_members_read_authorized` | SELECT / `authenticated` | `student_id = auth.uid() OR is_class_teacher(class_id)` / none | RLS direct + helper | Capability policy; retain equivalent function-level student/teacher checks |
| `class_invitations` / `class_invitations_read_owner` | SELECT / `authenticated` | `is_class_owner(class_id)` / none | RLS + helper | Capability SELECT policy and owner check |
| `class_teachers` / `class_teachers_read_authorized` | SELECT / `authenticated` | `is_class_teacher(class_id) OR is_class_member(class_id)` / none | RLS + helper | Capability SELECT policy and function checks |
| `modules` / `modules_read_authorized` | SELECT / `authenticated` | `can_read_module(id)` / none | RLS + helper | Capability policy and migrated helper tests |
| `lessons` / `lessons_read_authorized` | SELECT / `authenticated` | `can_read_lesson(id)` / none | RLS + helper | Capability policy and migrated helper tests |
| `module_teachers` / `module_teachers_read_authorized` | SELECT / `authenticated` | `can_read_module(module_id)` / none | RLS + helper | Capability policy and migrated helper tests |

`lesson_resources`, `assignments`, `assignment_resources`, `submissions`, `submission_files`, and `submission_feedback` have RLS enabled but no active permissive policies; direct authenticated access is denied and RPC authorization is function-level. The capability owner needs only operation-specific table privileges plus narrowly scoped policies for the commands required by its functions. To avoid recursive policy evaluation, Step 16.3B must choose and test one explicit model: capability-role policies that permit only the granted commands while every exposed definer function enforces actor predicates, matching the live PoC. It must not use table ownership or `BYPASSRLS`.

## Frontend transport inventory

There are no direct `neonClient.from()` calls. There are 55 direct RPC invocation sites:

| Caller | Count | Operations | Migration difficulty |
| --- | ---: | --- | --- |
| `src/context/AuthContext.tsx` | 2 | `bootstrap_current_user`, `claim_my_class_invitations` | High: startup ordering and current bounded bootstrap behavior must remain explicit; no hidden retry for claim |
| `src/services/classService.ts` | 14 | eight reads; class create/update; invitation create/revoke; instructor add/remove | Medium: central wrapper exists; scalar/row/void contracts differ |
| `src/services/moduleService.ts` | 22 | eleven reads and eleven mutations covering modules, lessons, instructors, video | Medium: central wrapper exists; date/array/row normalization required |
| `src/services/assignmentService.ts` | 13 | eight reads; assignment create/update/status; submit/review | High: scalar UUID and workflow mutations; no ambiguous retry |
| `src/services/storageService.ts` | 4 | teacher/student lesson and assignment resource lists | Low: read-only row arrays; B2 mutations already use Worker routes |

The shared frontend transport should accept only a typed operation union generated from the browser registry, attach the normal SDK session JWT, and retain existing service return interfaces and service-level mapping. It must not accept a free-form RPC name.

## Production Worker Data API inventory

The current storage Worker invokes exactly 16 distinct Data API RPCs: the 16 C-category operations listed above. The eight read operations are the three upload-state checks, three download authorizations, and two delete authorizations. The eight mutations are prepare/finalize for lesson, assignment, and submission plus lesson/assignment metadata deletion. All move to the same direct PostgreSQL executor but a separate Worker-internal registry inaccessible from the browser RPC route. Existing read-only Data API retry code remains unchanged until cutover and is then removed with the old transport; it is never copied into the direct DB path.

## Static production registry

The production registry contains 71 entries: 55 browser-callable keys from A/B and 16 Worker-internal keys from C. Each key maps at build time to the fixed schema-qualified function `app_gateway.<operation_key>`, its exact ordered parameter codec, result codec, auth requirement, surface, mutation class, and retry policy. All 71 require verified auth. Browser entries reject extra fields. Worker entries are callable only from internal route code, not by sending their key over HTTP.

Registry-wide rules:

- No request supplies schema, function, SQL, role, actor, or result codec.
- UUID, text length, enum, boolean, date/timestamp, text-array, nullable, file-size, and object-id validation is operation-specific and occurs before SQL.
- SQL identifiers are static source literals; values are positional parameters.
- A/B reads use `READ_ONLY`, B mutations use their M2/M3 class, and C mutations use M4.
- Initial policy is no automatic database retry for any registry entry. M3 and M4 must never be replayed after an ambiguous failure. A later separately reviewed read retry may create a fresh request/transaction only.

## Result normalization matrix

| PostgreSQL result | node-postgres difference | Required gateway contract |
| --- | --- | --- |
| `bigint` / `int8` | Returned as string | Convert declared bounded counts and file sizes to JSON number only after safe-integer/range validation; otherwise fail internally |
| `numeric` | Returned as string | No active RPC currently declares numeric; keep decimal string unless an operation contract explicitly proves safe conversion |
| UUID | String | Validate canonical UUID where input/output is identity; return string unchanged |
| `timestamp` / `timestamptz` | Parsed as `Date` by pg | Serialize to ISO 8601 string, preserving UTC instant and null |
| `date` | String in pg | Return `YYYY-MM-DD` unchanged so the browser formatter preserves calendar day |
| boolean | Boolean | Return unchanged |
| JSON/JSONB | Parsed object/array | Recursively validate serializability; return unchanged; reject unsafe keys if later accepted as input |
| SQL arrays | JS arrays, with element decoding | Validate element type; preserve order and nullability |
| set-returning / `RETURNS TABLE` | `rows[]` | Return array, including `[]` for no rows |
| scalar UUID (`create_assignment`) | pg row `{create_assignment: value}` | Unwrap to a JSON string to match the primary Data API contract |
| scalar boolean/text helper | pg row column | Internal only; never expose helper result generically |
| void | command row/empty result | Normalize to `null`; service callers currently ignore it |
| null | JS null | Preserve null; never coerce to empty string/zero centrally |
| structured database error | pg error object includes sensitive detail | Map through the error matrix; never serialize pg error objects |

Normalizers are per-registry entry over a shared type-codec library. They validate expected column names, drop no declared fields, reject unexpected unsafe shapes, and ensure frontend service interfaces do not change.

## Error contract

| Gateway category | HTTP | Safe sources | Client behavior |
| --- | ---: | --- | --- |
| `AUTH_REQUIRED` | 401 | missing/malformed/expired JWT, signature/issuer/audience/subject failure | re-authenticate; DB is not reached |
| `FORBIDDEN` | 403 | SQLSTATE `42501`, including combined not-found/access guards | generic denial; do not reveal object existence |
| `NOT_FOUND` | 404 | explicitly safe `P0002` operation outcomes where existence is already authorized | show normal not-found state |
| `CONFLICT` | 409 | `23505`, safe workflow conflicts, version/state mismatch | refresh state; no automatic replay |
| `VALIDATION` | 400 | `22023`, validated `22P02`, `23514`; operation-specific safe codes | field/action feedback using gateway-owned messages |
| `DATABASE_UNAVAILABLE` | 503 | connection class `08`, `57P01`, `53300`, deadline, `40001`, `40P01`, uncertain commit | bounded generic unavailable response; never auto-retry mutation |
| `INTERNAL` | 500 | unclassified `P0001`, `23502`, normalization mismatch, invariant failure | generic error and privacy-safe incident code |

The browser may inspect only category, HTTP status, a gateway-owned operation-safe code, and a correlation token that contains no infrastructure data. Raw SQLSTATE may be retained only in server telemetry as an allowlisted five-character code. Messages, SQL, detail, hint, schema/table/role names, host, port, connection string, stack, JWT, and decoded personal claims are never returned or logged. Because many current functions intentionally combine absence and authorization into `42501`, the gateway must preserve that non-enumerating behavior.

## Restricted production database role blueprint

Do not apply this design in this step.

1. `dataclass_gateway` is a LOGIN with `NOSUPERUSER`, `NOBYPASSRLS`, `NOINHERIT`, `NOCREATEDB`, `NOCREATEROLE`, no database/schema ownership, no DDL, no role membership, no temporary-table privilege, and no table privileges. It receives database `CONNECT`, `USAGE` on `app_private` and `app_gateway`, `EXECUTE` on `app_private.current_actor_id()` for the in-transaction assertion, and exact `EXECUTE` on the 71 gateway functions only.
2. `dataclass_gateway_owner` is a NOLOGIN, non-inheritable capability owner with the same non-privileged flags. It owns only `app_private`/`app_gateway` functions or purpose-created schemas, never application tables or the database. It receives only the per-table SELECT/INSERT/UPDATE/DELETE and sequence privileges required by the 71 audited definitions.
3. `app_private.current_actor_id()` reads only the transaction-local verified actor setting, validates UUID form, returns null for missing/malformed input, and additionally requires `session_user = 'dataclass_gateway'`. There is no public setter or arbitrary SET operation.
4. Every gateway function is recreated under the NOLOGIN owner with fixed `pg_catalog` search path and explicit schema qualification. Pure helpers may remain invoker functions when safe.
5. Revoke schema creation, table privileges, all-function execution, and temporary database privileges from `PUBLIC` and gateway roles. Revoke `EXECUTE` from `PUBLIC` on every new function before exact grants.
6. Set default privileges for the migration owner to revoke function execution from `PUBLIC`; grant nothing automatically to gateway roles. Future operations require an explicit migration and registry entry.
7. Add capability-role RLS policies only for exact commands/tables. They must be tested with forced RLS fixtures and must not depend on privileged table ownership. Function-level actor checks remain mandatory.

## Production JWT contract check

Result: **MATCH** for the contract required by the gateway. The production Auth base is HTTPS; its JWKS endpoint is API-base-relative on the same trusted origin, is reachable, publishes public EdDSA keys, and contains no private key material. Existing sanitized production evidence confirms matching issuer/audience, UUID-compatible subject, expiration, and successful authenticated role requests. `nbf` remains optional and is enforced when present. The shell had no normal SDK session token, so no token was fetched or printed. Production cutover still requires one in-memory normal-SDK verification against the fixed production settings immediately before rollout; raw `/get-session` credentials and public `getJWTToken()` remain prohibited.

## Capacity and concurrency

- One HTTP request creates exactly one `pg.Client` and performs one database operation at a time. It never needs more than one connection or parallel query.
- Hyperdrive owns pooling; there is no application `pg.Pool` or cross-request client.
- Set transaction-local `statement_timeout = 8s` and `idle_in_transaction_session_timeout = 12s`. Use a 5-second connection deadline and a 15-second overall Worker response deadline.
- The response deadline rejects without manipulating an in-flight socket. Dispose only a successfully connected, usable client; rollback only after confirmed `BEGIN`; cleanup never replaces the primary error.
- Do not use node-postgres `query_timeout` or application socket-destroy connection timers with Hyperdrive.
- No automatic operation retry at initial release. Never replay M3/M4 or an operation whose `COMMIT` result is unknown.
- Emit only operation key, read/M2/M3/M4 class, phase (`verify`, `connect`, `begin`, `query`, `commit`, `rollback`, `dispose`, `normalize`), safe category, duration bucket, and success/failure. Never log arguments, actor IDs, tokens, claims, SQL, or connection data.
- Start with the platform's normal request concurrency and one DB connection per request; add an application concurrency cap only after staging load measurements. Reject overload with sanitized 503 rather than queueing beyond the response deadline.

## Storage safety map

| Route family | Exact sequence | Ambiguous points and reconciliation |
| --- | --- | --- |
| Lesson/assignment upload intent | verify JWT → prepare DB pending row → create signed B2 PUT → browser uploads directly | Failure after prepare leaves pending metadata; no B2 may exist. Reconcile by state plus object HEAD, never assume |
| Submission upload intent | verify → prepare DB draft submission/pending version → signed PUT → browser direct upload | Prepare can create both submission and file metadata. Treat every later failure as M4 and reconcile both state layers |
| All finalize routes | verify → DB state read → B2 HEAD/size check → DB finalize | B2 may exist while DB remains pending. Finalize is conditionally idempotent in SQL but remains M4; no automatic replay after uncertain commit |
| Download routes | verify → DB authorization read → short-lived signed B2 GET | No DB mutation; authorization is evaluated before signing. Keep expiry short and never expose B2 credentials |
| Lesson/assignment delete | verify → DB authorize-delete read → B2 delete → DB metadata delete | B2 delete may succeed while DB deletion fails. Never recreate/delete blindly; record reconciliation-needed state and compare object plus metadata |

All 16 database operations stay Worker-internal. No generic browser gateway key may prepare, finalize, authorize object paths, or delete metadata. Storage reconciliation is a separately authorized operational workflow. The two frozen Lesson 1 XLSX rows and objects remain outside all staging tests and cleanup.

## Forward-only staged rollout

1. **16.3B — isolated SQL migration:** create production-shaped `app_private` and `app_gateway` schemas, restricted roles, capability policies/grants, and all migrated helper/RPC definitions in the retained isolated database. Keep PoC function and legacy-style fixtures for contract comparison. Do not change production.
2. **16.3C — staging gateway:** implement the typed 71-entry registry, split 55 browser and 16 internal surfaces, common normalizers/errors, request-scoped direct transport, and privacy-safe metrics. Deploy only the isolated Worker/Hyperdrive.
3. **16.3D — staging frontend transport:** add one typed shared gateway client and switch the five caller files in staging. Preserve service interfaces and keep old Data API code available behind an explicit build-time rollback selection, never runtime fallback.
4. **16.3E — full synthetic E2E:** test teacher/student role separation, every read, all M2/M3 mutations, all M4 storage sequences, concurrent identities, commit/rollback, ambiguous failures, key rotation, load limits, and reconciliation using synthetic data/B2 only.
5. **16.3F — production cutover preparation:** produce exact forward migrations, grants, registry manifest, environment/binding plan, observability dashboard, rollback commits, maintenance/cutover ordering, production JWT preflight, and approval gate.
6. **16.4 — controlled production migration:** apply additive SQL, deploy disabled gateway, verify health, enable Worker route, deploy coordinated frontend, smoke reads, then separately authorize one bounded real storage E2E and frozen-incident reconciliation.

## Rollback design and cutover boundary

The old public Data API functions and grants remain unchanged through staging and production cutover approval. New `app_gateway` functions are additive. There is no silent runtime Data API fallback: a selected transport either succeeds or returns its stable failure.

The divergence point is the first production frontend or storage Worker release that routes an operation to the gateway. Before that point, additive SQL and a disabled gateway can be left in place or removed later by a forward migration. After that point, rollback requires the coordinated previously approved frontend and Worker versions, confirmation that the legacy public functions remain compatible with the current tables, and a review of any M3/M4 request whose commit/result is uncertain. Database rollback uses a new corrective migration; historical files are never edited. Storage object/metadata reconciliation remains independent of code rollback, and a database or frontend rollback does not resolve the Neon platform incident.

## Step 16.3B SQL implementation

Step 16.3B produced two reviewable, non-production artifacts:

- `tests/fixtures/auth-gateway-db-manifest.json` freezes the final migration-derived surface: 84 public functions, 71 callable RPCs, 12 internal helpers, one trigger function, seven triggers, nine legacy RLS policies, all signatures and returns, identity sensitivity, security mode, and M1–M4 classifications.
- `database/staging/auth_gateway_identity_v1.sql` is the forward-only staged identity layer. Its header explicitly prohibits production application. It edits no historical migration.

The frozen naming convention is `app_private.current_actor_id()` for the stable actor helper, `app_private.<existing_helper_name>` for the 12 migrated internal helpers, and `app_gateway.<existing_rpc_name>` for the 71 callable operations. The operation name, argument order and types, defaults, return type, volatility, security mode, and fixed `pg_catalog` search path are preserved. The public schema remains the legacy rollback surface during staging; it is not a runtime fallback.

The actor helper accepts no argument, reads only transaction-local `app.verified_actor_id`, validates UUID form, and returns null for a missing, blank, malformed, or wrong-session value. It requires `session_user = 'dataclass_gateway'`. The helper schema is non-public and has no setter. The staged Worker remains solely responsible for setting the GUC inside the same explicit transaction.

The isolated role model uses `dataclass_gateway` as a `NOINHERIT` LOGIN and `dataclass_gateway_owner` as a `NOLOGIN`, `NOINHERIT` capability owner. Both are non-superuser, cannot bypass RLS, create databases or roles, replicate, own application tables, or administer roles. The LOGIN receives database `CONNECT`, schema `USAGE`, actor assertion execution, and exact execution on 71 functions. It receives no direct table privilege, DDL, temporary-object privilege, or capability-role membership. The capability owner receives explicit per-table commands only; there is no `GRANT ALL`, all-table grant, or all-function execution grant.

Seventy-six directly dependent functions now call `app_private.current_actor_id()`. The three transitive helpers call only migrated private helpers. Together the 79 identity-dependent functions contain zero `auth.uid()` or `auth.user_id()` references in `app_private` and `app_gateway`. The three direct policy substitutions complete the 79 directly safe mappings; the full nine-policy map plus the three transitive helpers complete all 12 special-migration objects.

Directly installing the nine legacy helper-based RLS predicates for the non-table-owner capability role was rejected in the isolated database: helper evaluation re-entered the same policies and PostgreSQL failed with recursive evaluation. The final staged SQL therefore retains the nine legacy policies for the rollback surface, records their exact actor-helper mappings as regression contracts, and installs 15 nonrecursive capability policies targeted only to the NOLOGIN function owner. Those policies require the gateway `session_user`; they do not give the LOGIN table access. Every exposed function retains its original actor-specific teacher, student, owner, membership, assignment, submission, and storage checks. Live negative tests confirmed cross-class denial, student/teacher separation by resource context, no unrelated-user reads, and no direct table access.

All 71 gateway RPCs remain `SECURITY DEFINER`, are owned by the capability role, retain a fixed `pg_catalog` search path, and preserve their original function-level authorization. The nine definer helpers and three invoker helpers preserve their security modes. Because the capability owner does not own application tables and cannot bypass RLS, the staged capability policies are required; the design does not claim that legacy RLS protects definer functions automatically.

Catalog comparison found zero callable signature or result-type changes across all 71 operations. Live contract checks covered set-returning rows, scalar UUID, raw `int8`, timestamps, JSON/JSONB, boolean, null, void, empty sets, structured validation errors, permission denial, and not-found behavior. Node-postgres returns `int8` as text, timestamps as `Date`, scalar functions as named one-column rows, and PostgreSQL `void` as an empty string. The Step 16.3C normalizer must convert only declared safe integers, serialize timestamps to ISO strings, unwrap declared scalars, and map raw void to `null`.

The retained isolated Neon project was reconstructed from migrations `0001` through `0010` without production rows. It contains only the two synthetic Auth identities and synthetic fixtures created for this step. Live validation passed for profile bootstrap, separate A/B class membership, invitations, modules, lessons, assignments, submissions, storage authorization, an M2 guarded update, an M3 single invocation plus rollback without replay, all seven update triggers, concurrent A/B transactions, commit/rollback clearing, malformed and missing actor behavior, and ordinary-session impersonation denial. M4 database functions compiled and retained their contracts; no B2 or other external operation ran.

Privilege probes confirmed that the LOGIN cannot create regular or temporary tables, alter or drop application objects, create roles, assume the capability owner, bypass RLS, modify the helper, execute legacy unauthorized functions, directly query tables, or invoke an actor setter. The staged artifact was applied only to the isolated database. Production database, Auth, Worker, frontend, Hyperdrive, B2, and frozen XLSX state were not changed.

## Remaining work before 16.3C

There is no SQL identity blocker before the staged Worker migration. Step 16.3C must implement the typed 71-entry registry, keep the 55 browser and 16 Worker-internal surfaces separate, enforce request-scoped `pg.Client` transactions, add the four result normalizations above, map SQLSTATEs to sanitized gateway errors, preserve the no-retry rule for M3/M4 and ambiguous commits, and run the full synthetic contract suite through the isolated Worker/Hyperdrive. The isolated database LOGIN credential must remain only in isolated Hyperdrive configuration and must never enter the repository or frontend.

## Step 16.3C — full Worker gateway

Step 16.3C implements the complete gateway as isolated, reusable Worker modules under `worker/gateway/`: `types.ts`, `errors.ts`, `verifyNeonJwt.ts`, `normalize.ts`, `registryData.ts`, `registry.ts`, `database.ts`, `execute.ts`, and `index.ts`. The PoC database and JWT modules now delegate to these shared primitives so the isolated proof and future production integration cannot drift. The production Worker entrypoint and Wrangler configuration remain unchanged.

The checked-in static registry contains exactly 71 operations: 55 browser-callable and 16 Worker-internal. Each entry fixes the operation key, schema-qualified `app_gateway` function, exact overload signature, ordered parameters and defaults, explicit casts, result kind, normalizer, authentication requirement, exposure, read/mutation class, M1–M4 class, deadline class, and `NONE` retry policy. Manifest parity tests reject missing, extra, duplicate, misclassified, or unsafe entries. SQL identifiers and casts come only from checked-in metadata; request values use PostgreSQL parameters. A browser cannot provide a function, schema, role, cast, SQL fragment, or caller identity.

The isolated browser contract is `POST /rpc` with JSON `{ "operation": "<registry-key>", "params": { ... } }`. It requires an exact configured origin, JSON content type, a bearer JWT, and a body no larger than 64 KiB. Unknown top-level fields, unknown operations, malformed parameters, and Worker-internal keys are rejected deterministically. `OPTIONS` is supported only for the exact origin. The 16 storage operations are reachable only through `executeGatewayOperationInternal`; the browser receives no indication that an internal key exists.

Every request verifies the JWT, creates one new `pg.Client`, connects, begins an explicit transaction, sets the verified actor with transaction-local `set_config`, asserts `app_private.current_actor_id()`, applies transaction-local limits, invokes one registry operation, commits, and safely disposes the client. There is no application `pg.Pool`, global client, cross-request reuse, or database retry. Hyperdrive owns infrastructure pooling. Rollback is attempted only after a successful `BEGIN`; rollback and disposal failures cannot replace the primary failure or escape the response boundary. This follows current Cloudflare guidance for [Neon through Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/), the [connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/), and [connection pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/).

The reviewed limits are a 15-second overall response deadline, a 5-second connect deadline, an 8-second transaction-local `statement_timeout`, and a 12-second `idle_in_transaction_session_timeout`. These bounds cover normal small RPCs while stopping stalled work before the Worker response budget. Deadline timers reject the response race but never mutate an in-flight socket. No timeout causes replay, including after an ambiguous `COMMIT`.

JWT verification uses the live-proven Auth contract: EdDSA only, a fixed configured issuer and audience, a fixed HTTPS JWKS URL supplied by trusted Worker configuration, UUID `sub`, `exp`, and `nbf` when present. It rejects `alg=none`, token-provided key URLs, missing subjects, wrong issuer/audience, invalid signatures, and expired tokens. Tokens and decoded personal claims are never logged.

Per-entry result normalization preserves the Data API-facing service contracts. Declared `int8` values become JSON numbers only when safely representable; timestamps become ISO strings; declared scalar UUID functions unwrap the one-column node-postgres row; PostgreSQL `void` becomes `null`. Set-returning rows, empty arrays, JSON/JSONB, booleans, arrays, strings, dates, nulls, and declared numeric behavior remain stable. The static and live contract tests cover all of these shapes.

External errors use only `AUTH_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION`, `DATABASE_UNAVAILABLE`, and `INTERNAL`, with stable JSON and HTTP status mappings. PostgreSQL connection, shutdown, overload, timeout, serialization, deadlock, uncertain commit, and client-lifecycle failures are sanitized. The only SQL messages allowed through are the two existing workflow messages required by current UI behavior: “Another module is already active for this class.” and “Change the module teaching status before archiving it.” No SQL, parameters, database or role details, stack, claims, Hyperdrive details, or raw database error text is returned or logged.

Mutation metadata remains M1 = 0, M2 = 17, M3 = 7, and M4 = 8. No category has an automatic gateway retry. M3 is never replayed after an ambiguous commit. All eight M4 operations stay Worker-internal because B2 and PostgreSQL are not atomic. Worker orchestration must finish each DB transaction before any B2 network operation and must retain the existing prepare, object action, state validation, finalize/delete, and reconciliation boundaries. Step 16.3C performed no B2 operation.

Privacy-safe observations contain only operation key, exposure, success/failure category, and a coarse duration bucket. They omit actor IDs, email, JWTs, claims, parameters, SQL, database errors, connection information, and credentials.

Static validation passed for all 71 registry entries, the 55/16 exposure split, exact manifest coverage, argument/default metadata, fixed casts, normalizers, mutation classes, browser/internal separation, SQLSTATE mapping, and failure containment. Isolated live coverage passed for profile, class, invitation/membership, module, lesson, assignment, submission, and storage authorization, plus one M2 mutation and one M3 mutation without replay. Sequential and concurrent User A/User B requests showed zero identity leakage.

The full gateway was deployed only to the retained isolated Worker and isolated Hyperdrive connected to the synthetic-only database with the final restricted login. Exact-origin CORS and JWT negative tests failed closed. A bounded concurrent database-origin failure returned sanitized JSON 503 responses for every request, produced no Cloudflare 1101 response, and was followed by a successful healthy request with correct identity. The isolated deployment has no production route, production database, production Hyperdrive, production B2 binding, or production credentials.

Step 16.3D can now add a shared frontend transport in staging and migrate the five existing caller files while preserving their service interfaces. It must keep the legacy Data API path only as an explicit build-time rollback selection, never a runtime fallback; retain the 55/16 exposure boundary; and test all UI error mappings and result contracts against the isolated gateway before any production cutover work.

## Step 16.3D1 — frontend transport canary

Step 16.3D1 adds `src/lib/rpc.ts` as the shared browser gateway transport and migrates only `list_my_student_classes()` in `src/services/classService.ts`. This operation was selected because it is parameterless, read-only, browser-callable, storage-independent, deterministic with the synthetic fixture, and already live-proven through the full registry. Its existing `ManagedClass[]` mapping remains unchanged.

The browser gateway origin uses the dedicated public variable `VITE_RPC_GATEWAY_URL`. The variable contains only the Worker HTTPS origin; the transport appends `/rpc`. Step 16.3D1 supplied it only to local and isolated validation. No production Vercel variable or production frontend configuration changed, and the production frontend does not point to the isolated Worker.

`callGatewayRpc<T>(operation, params)` obtains its bearer only through the existing `getCurrentNeonAuthToken()` helper. That helper calls `neonClient.auth.getSession()` and returns the transformed/cached `data.session.token`. The transport does not call raw `/get-session`, public `getJWTToken()`, or accept/inject a browser caller identity. It sends exact JSON `{ operation, params }` with `Content-Type: application/json` and the SDK-derived bearer.

The client deadline is 12 seconds, leaving three seconds within the gateway's 15-second response boundary for response delivery and browser cleanup. Timeout aborts the fetch and becomes `DATABASE_UNAVAILABLE`. Every invocation makes at most one request. There is no automatic retry and no runtime Data API fallback, including for this read-only canary.

Gateway responses map to the stable frontend categories `AUTH_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION`, `DATABASE_UNAVAILABLE`, and `INTERNAL`. The frontend constructs its own safe messages and ignores server detail. Malformed/nonconforming responses become `INTERNAL`; network and timeout failures become `DATABASE_UNAVAILABLE`. No SQLSTATE, database detail, Worker detail, JWT claim, or stack is surfaced.

Focused tests cover success, missing session/JWT, all seven gateway categories, malformed JSON, network failure, timeout, one-request/no-retry behavior, SDK-derived bearer use, the identity-free canary payload, absence of runtime fallback, exactly one migrated service call, and the unchanged storage transport.

The lightweight isolated live canary used a synthetic account and the supported Neon SDK sign-in plus `neonClient.auth.getSession()` path. It issued exactly one `POST /rpc` for `list_my_student_classes`, issued zero Data API requests for that operation, received the expected row-array types, and produced no transport error. A controlled unavailable gateway returned the normalized frontend failure after exactly one request and produced no Data API fallback. No concurrency/load matrix or B2 operation was run.

After this canary, one browser RPC uses the gateway, 54 browser RPCs remain on the existing Data API path, and all 16 Worker-internal operations remain unchanged. `storageService.ts` is untouched. Step 16.3D2 may migrate the remaining non-storage browser reads in bounded domain groups while preserving service return types, error behavior, the no-retry rule, and the explicit deployment-time rollback approach.

## Step 16.3D2A — remaining classService reads

Step 16.3D2A migrates the seven remaining read-only operations in `classService.ts`: `list_my_teacher_classes`, `get_class_overview`, `get_my_student_class_overview`, `get_class_students`, `get_class_invitations`, `get_class_instructors`, and `get_my_student_class_instructors`. Together with the existing `list_my_student_classes` canary, all eight class-service reads now use `callGatewayRpc` through one local row-normalizing wrapper. Existing method signatures, parameters, row mapping, missing-class behavior, and null/empty row behavior are preserved.

The six class-service mutations remain on the Data API transport: `create_class`, `update_owned_class`, `create_class_invitations`, `revoke_class_invitation`, `add_class_instructor_by_email`, and `remove_class_instructor`. No mutation, storage operation, other service, shared transport, Worker, SQL, registry, or environment configuration changes in this step.

Focused service tests execute the current service source with injected transport boundaries. They verify every gateway key and parameter object, representative result mapping, null and empty results, direct gateway-error propagation with zero Data API fallback, and all six mutation calls remaining on `neonClient.rpc`. The shared transport retains its 12-second timeout, single-request behavior, no retry, and no runtime fallback. After this step, eight browser RPCs use the gateway and 47 browser RPCs remain on the existing frontend Data API path; all 16 Worker-internal operations remain unchanged.

A bounded isolated live service check used a synthetic account and the supported SDK `getSession()` token path. The existing student-class canary, student class-detail read, and student class-instructor membership read each issued one `POST /rpc` to the retained isolated Worker. All three returned the expected service shapes, issued zero Data API requests, and produced no browser-transport error. No mutation, storage operation, load test, deployment, or production request was performed.

## Step 16.3D2B — moduleService reads

Step 16.3D2B audits all 22 `moduleService.ts` operations against the canonical registry and migrates its 11 browser read operations: `list_teacher_class_modules`, `get_teacher_module`, `list_module_instructor_options`, `list_teacher_module_lessons`, `get_teacher_lesson`, `list_student_class_modules`, `get_student_module`, `list_student_module_lessons`, `get_student_lesson`, `get_teacher_lesson_video`, and `get_student_lesson_video`. A single service-local row wrapper delegates to the existing `callGatewayRpc`; no transport, token, timeout, error, or environment logic is duplicated.

The other 11 operations remain on `neonClient.rpc` because the registry classifies them as mutations: `create_module`, `update_module`, `set_module_lifecycle`, `reorder_module`, `assign_module_instructor`, `remove_module_instructor`, `create_lesson`, `update_lesson`, `reorder_lesson`, `set_lesson_youtube_video`, and `remove_lesson_video`. Their method signatures and parameter construction remain unchanged. There is no runtime fallback, retry, dual request, caller identity parameter, or storage operation in the migrated path.

Focused tests execute the current service source at injected transport boundaries. They cover all 11 gateway keys and exact parameter objects, module/lesson/video mapping, arrays, counts, null and empty results, missing-row behavior, direct error propagation, absence of Data API fallback, and all 11 mutations remaining on Data API. After this step, `moduleService` has 11 gateway reads and 11 Data API mutations. Across the frontend, 19 browser operations use the gateway and 36 remain on Data API; all 16 Worker-internal operations remain unchanged.

A bounded isolated live check covered teacher module list/detail, lesson list/detail, and the nullable lesson-video state through the retained Worker and synthetic-only database. The five service calls produced five `POST /rpc` requests and zero Data API requests. No module, lesson, video, storage, or other application mutation was executed. The temporary synthetic login credential was restored after authentication, and the test harness was removed.

## Step 16.3D2C — assignmentService reads and AuthContext audit

Step 16.3D2C audits all 13 `assignmentService.ts` operations and migrates its eight registry-classified reads: `list_teacher_assignments`, `list_student_assignments`, `get_teacher_assignment`, `get_student_assignment`, `list_assignment_lesson_options`, `list_assignment_roster`, `get_submission_detail`, and `list_submission_files`. They use the existing shared transport through one service-local wrapper. Assignment, roster, submission, file-metadata, count, timestamp, null, and empty-result mappings remain unchanged.

The five assignment/submission mutations remain on Data API: `create_assignment`, `update_assignment`, `set_assignment_status`, `submit_my_assignment`, and `review_submission`. `AuthContext.tsx` has exactly two RPC calls, `bootstrap_current_user` and `claim_my_class_invitations`; the canonical registry classifies both as M2 mutations. Consequently AuthContext has no read to migrate in this step and remains byte-for-byte unchanged, including session handling, role/profile derivation, single-flight initialization, bounded bootstrap identity resilience, invitation-claim isolation, redirects, and loading behavior.

Focused tests verify all eight gateway keys and exact parameters, existing assignment/submission return mapping, null and empty behavior, missing-row errors, direct gateway error propagation with no Data API fallback, all five mutations remaining on Data API, both AuthContext operations remaining M2 Data API calls, and unchanged `storageService`. No caller identity, retry, duplicate request, transport helper, or environment variable is added.

After this step, `assignmentService` has eight gateway reads and five Data API mutations; AuthContext has zero gateway calls and two Data API mutations. Across the frontend, 27 browser operations use the gateway and 28 Data API calls remain: 24 mutations outside `storageService` and four read-only resource-metadata calls in `storageService`. There are zero remaining non-storage browser reads on Data API.

A bounded isolated live check covered teacher assignment list/detail, student assignment list/detail, roster, submission history, and submission file metadata. Eight service calls produced eight `POST /rpc` requests, zero Data API requests, and no application mutation. Two fresh supported SDK sessions resolved distinct expected synthetic subjects. AuthContext read migration was not applicable because its only RPCs are mutations; its existing session, profile, role, and bootstrap lifecycle code remained unchanged. Temporary synthetic login credentials were restored and the test harness was removed.

## Step 16.3D3A — classService mutations

Step 16.3D3A audits and migrates all six remaining `classService.ts` operations. The registry classifies `update_owned_class`, `create_class_invitations`, `revoke_class_invitation`, `add_class_instructor_by_email`, and `remove_class_instructor` as M2. It classifies `create_class` as M3. All six are browser-callable, none is M4, and their existing arguments and row or void result contracts already match gateway normalization.

The service now sends all 14 class operations through its single `callGatewayRpc` wrapper. Existing method signatures, parameter names, null handling, class UUID extraction, invitation rows, instructor outcomes, and void behavior remain unchanged. `classService.ts` contains no Data API transport, runtime fallback, dual execution, retry loop, caller identity parameter, or storage operation. The shared transport continues to issue exactly one request and maps timeout, network, and unavailable outcomes to the neutral `DATABASE_UNAVAILABLE` category. That response does not assert that an M3 mutation failed, so an uncertain `create_class` commit is surfaced without replay or a false definitive outcome.

Focused tests verify all six exact operation keys and parameter objects, row and void contracts, one invocation on success, and one invocation for timeout, network, database-unavailable, and ambiguous-commit failures. They also keep the eight previously migrated class reads gateway-only and confirm no Data API or fallback path remains in the service.

A bounded live test used only the retained isolated Worker, Hyperdrive, database, and two synthetic Auth identities. It executed one disposable flow covering all six operations, verified each resulting state once, denied User B access to User A's class, and denied a teacher-only mutation after the second synthetic identity's teacher capability was temporarily removed. No storage operation ran. The disposable class was deleted, the temporary role state and synthetic credential hashes were restored, and the temporary test harness was removed. Production infrastructure and data were not used.

After this step, `classService` has 14 gateway calls and zero Data API calls. Across the frontend, 22 Data API calls remain: 18 non-storage mutations and four `storageService` metadata reads. Step 16.3D3B may migrate `moduleService` mutations in the same bounded manner, retaining the no-retry and no-runtime-fallback rules and leaving M4 storage orchestration unchanged.

## Step 16.3D3B — moduleService mutations

Step 16.3D3B audits and migrates all 11 remaining `moduleService.ts` operations. The registry classifies `update_module`, `set_module_lifecycle`, `assign_module_instructor`, `remove_module_instructor`, `update_lesson`, `set_lesson_youtube_video`, and `remove_lesson_video` as M2. It classifies `create_module`, `reorder_module`, `create_lesson`, and `reorder_lesson` as M3. Every operation is browser-callable and storage-free; none is M4 or performs a B2 side effect.

The service now sends all 22 module and lesson operations through its single `callGatewayRpc` wrapper. Existing method signatures, parameter/default handling, module and lesson identifier extraction, instructor outcome, YouTube metadata result, and void behavior remain unchanged. `moduleService.ts` contains no Data API transport, runtime fallback, dual execution, retry loop, caller identity parameter, or storage operation. The four M3 operations surface the shared neutral `DATABASE_UNAVAILABLE` outcome after transport uncertainty and are never replayed.

Focused tests cover all 11 exact operation keys and parameter objects, identifier, row, and void contracts, and one invocation for every M3 success, timeout, network failure, database-unavailable response, and uncertain-commit failure. They also confirm the 11 earlier read migrations remain gateway-only and no Data API path remains in the service.

A bounded live test used only the retained isolated Worker, Hyperdrive, database, and two synthetic Auth identities. A disposable class flow covered module creation, editing, lifecycle, reordering, instructor assignment/removal, lesson creation, editing/publishing, reordering, and YouTube metadata set/removal. Catalog checks verified every resulting state once. A second actor could not update the first actor's module, and the same identity without its temporary teacher capability could not create a module. No B2 or production resource was used. The disposable class and dependent rows were deleted, synthetic role state and credential hashes were restored, and the temporary harness was removed.

The SQL module path is gateway-ready for reads, module creation and lifecycle management, lesson creation/editing/publishing/archiving, lesson ordering, and YouTube metadata management. After this step, `moduleService` has 22 gateway calls and zero Data API calls. Across the frontend, 11 Data API calls remain: seven non-storage mutations in `assignmentService` and `AuthContext`, plus four `storageService` metadata reads. Step 16.3D3C may migrate the remaining assignment mutations while leaving Auth bootstrap/invitation claiming and storage orchestration for their dedicated stages.

## Step 16.3D3C — assignmentService and AuthContext mutations

Step 16.3D3C audits and migrates the final seven non-storage frontend mutations. In `assignmentService.ts`, `update_assignment`, `set_assignment_status`, and `submit_my_assignment` are M2; `create_assignment` and `review_submission` are M3. In `AuthContext.tsx`, `bootstrap_current_user` and `claim_my_class_invitations` are M2. All seven are browser-callable, none is M4, and none performs a B2 or other external side effect.

`assignmentService.ts` now sends all 13 assignment and submission operations through its existing `callGatewayRpc` wrapper. Method signatures, parameter names, scalar assignment UUID handling, row results, void/null behavior, state transitions, and UI error behavior remain unchanged. Focused tests cover every mutation key and parameter object, exactly one invocation for success and failure, and the M3 timeout, network, unavailable, and uncertain-response cases without replay.

Auth initialization now calls `bootstrap_current_user` exactly once through `callGatewayRpc`, followed by one non-blocking `claim_my_class_invitations` call. The old 300 ms Data API identity-propagation retry and its SQLSTATE 42501 replay branch are no longer used by `AuthContext`. `runSingleFlight` still prevents duplicate initialization for the same session token. Neon Auth client construction, supported SDK `getSession()` use, Google OAuth, loading state, profile and role hydration, redirects, invitation behavior, and logout remain unchanged. Neither AuthContext operation has a Data API fallback or second gateway attempt.

A bounded isolated live run used the retained Worker, Hyperdrive, synthetic-only database, and two synthetic Auth identities. Each identity completed one supported SDK session and one bootstrap call, with independent profile and role results. One pending synthetic invitation was claimed exactly once. A disposable assignment flow covered create, update, publish, submit, and review; each state transition occurred once, the scalar, row, and void contracts matched, and an unrelated student actor was denied. Submission file metadata was inserted only as an isolated database fixture to satisfy the existing submit precondition; no B2 request or storage RPC occurred. All disposable rows were removed and the original synthetic roles and credentials were restored.

After this step, `classService`, `moduleService`, `assignmentService`, and AuthContext database operations are gateway-only. The frontend has four Data API operations remaining, all in `storageService.ts`; there are zero remaining non-storage Data API operations. No migrated mutation has automatic retry, runtime fallback, or dual execution. The next storage stage must preserve Worker-only access to the 16 internal operations, keep B2 calls outside database transactions, keep all M4 operations non-replayable, add explicit reconciliation for ambiguous cross-system outcomes, and leave the frozen production XLSX incident untouched until a separately approved cleanup.

## Step 16.3D4A — Worker internal storage database migration

Step 16.3D4A maps all 16 production Worker Data API operations to the existing static `WORKER_INTERNAL` registry. The eight authorization and state reads are `authorize_assignment_resource_delete`, `authorize_assignment_resource_download`, `authorize_lesson_resource_delete`, `authorize_lesson_resource_download`, `authorize_submission_file_download`, `get_assignment_resource_upload_state`, `get_lesson_resource_upload_state`, and `get_submission_file_upload_state`. The eight M4 database mutations are `delete_assignment_resource_metadata`, `delete_lesson_resource_metadata`, `finalize_assignment_resource_upload`, `finalize_lesson_resource_upload`, `finalize_submission_file_upload`, `prepare_assignment_resource_upload`, `prepare_lesson_resource_upload`, and `prepare_submission_file_upload`. All 16 remain inaccessible through the browser `/rpc` endpoint.

Lesson upload intent uses prepare; lesson finalize uses state then finalize after object inspection; lesson download uses download authorization; and lesson deletion uses delete authorization before B2 followed by metadata deletion. Assignment resources use the same prepare, state/finalize, download, and authorize/delete ordering. Submission files use prepare, state/finalize, and download authorization. Reads and prepares occur before a B2 phase; finalize and metadata deletion occur after the corresponding B2 phase.

The storage Worker creates one internal gateway session after bearer verification and invokes `executeGatewayOperationInternal` in process. It makes no HTTP self-call, accepts no actor identity from the request body, and does not use Neon Data API. Every database operation uses the shared request-scoped `pg.Client` lifecycle through isolated Hyperdrive and ends its transaction before the Worker signs, inspects, or deletes a B2 object. Multiple database phases in one storage route therefore run as separate transactions around the existing B2 boundary.

The old read-only Data API retry for HTTP 403 with SQLSTATE 42501 was removed with the Data API helper. Direct gateway operations have no automatic database retry, runtime Data API fallback, or dual execution. M4 phases execute once. A failed authorization or prepare call prevents B2 access; a failed B2 upload inspection prevents finalize; a failed B2 delete prevents metadata deletion. If finalize fails after an uploaded object exists, or metadata deletion fails after B2 deletion, neither side is replayed or cleaned automatically. The sanitized failure is treated as reconciliation-required because the cross-system outcome cannot be made atomic.

The B2 design remains unchanged: credentials stay in Worker bindings, the Worker signs short-lived browser URLs and performs metadata checks/deletes, and it never proxies upload or download bytes. Focused tests cover all 16 registry mappings and route parameter contracts, browser/internal separation, authorization and prepare short-circuiting, upload signing without PUT/finalize, B2/finalize/delete ordering, unavailable and ambiguous gateway failures, and absence of retries or Data API fallback.

An isolated database-only live check used the retained non-production Worker, Hyperdrive, synthetic database, and synthetic identity. It exercised an authorization read, upload-state read, prepare, finalize, and metadata delete with a disposable metadata fixture. Each operation completed through the direct gateway exactly once, no B2 request was made, and the fixture was removed. Production Worker, bindings, database, Hyperdrive, frontend, Auth, B2, and frozen XLSX state were unchanged.

After this step, the Worker has zero Neon Data API RPC calls and 16 direct internal gateway operations. The registry remains 55 browser and 16 Worker-internal operations. The frontend still has four Data API calls, all confined to `storageService.ts`. Step 16.3D4B should migrate those four browser metadata reads to their existing browser-callable gateway entries, validate the combined storage request contract without B2 mutation, and retain the Worker as the sole caller of all 16 orchestration operations.

## Step 16.3D4B — frontend storage transport migration

Step 16.3D4B migrates the final four frontend Data API calls: `list_teacher_lesson_resources`, `list_student_lesson_resources`, `list_teacher_assignment_resources`, and `list_student_assignment_resources`. Each is a read-only, browser-callable metadata-list operation with no mutation class and no B2 phase. Each now uses the shared `callGatewayRpc` transport and its exact existing lesson or assignment identifier parameter. Row mapping, `int8` conversion, `can_manage`, null handling, and empty-list behavior remain unchanged.

No Worker-internal operation moved to the browser registry. Upload intent, finalize, download authorization/signing, and delete orchestration continue through the existing storage Worker routes. The browser still transfers bytes directly with signed B2 URLs, B2 credentials remain Worker-only, and database transactions end before B2 work. There is no retry, runtime Data API fallback, dual execution, automatic cleanup, or replay after an ambiguous M4 outcome.

Focused tests cover all four operation keys and parameter objects, resource result mapping, null and empty results, one-call error propagation, browser rejection of internal keys, and preservation of the Worker route boundary. Isolated live frontend validation used synthetic metadata only and issued the four reads through `POST /rpc`; it observed zero Neon Data API requests and made no B2 request. The internal operation rejection check remained fail-closed.

Frontend and Worker Data API call counts are now both zero. The unchanged legacy `NEON_DATA_API_URL` declaration in the production Wrangler configuration has no source consumer and is reserved for production cutover cleanup because D4B does not change production bindings. A real isolated B2 end-to-end remains pending for Step 16.3D4C. Production B2 and the frozen XLSX metadata and objects remain untouched.

## Step 16.3D4C1 — Worker-compatible B2 object inspection

The first isolated D4C lesson upload proved that the browser could PUT directly to the isolated private B2 bucket, but the Worker received HTTP 403 when it issued an authenticated S3 `HeadObject`. The same bucket-restricted key and object returned success for a local S3 HEAD. Backblaze's Cloudflare Worker reference implementation documents the cause: Cloudflare can change an outbound HEAD to GET, so an AWS SigV4 signature calculated for HEAD no longer matches the method Backblaze receives. Signing the request as GET would avoid that mismatch, but it would make the object body available to the Worker and would weaken the direct browser-to-B2 byte boundary.

Object inspection therefore uses the Backblaze Native API's metadata-only `b2_list_file_names` operation. Each inspection authorizes with the existing Worker-only application key, verifies that the returned authorization is restricted to exactly the configured isolated bucket and includes `listFiles`, then requests one entry using both the exact object key as the prefix and starting name. The Worker accepts metadata only when the returned upload entry's file name exactly equals the expected key. It obtains the storage-reported content length, content type, and MD5-derived ETag when present. It never downloads an object body, trusts browser-reported final metadata, retries, or falls back to another transport. Authorization tokens and object metadata remain request-scoped.

Focused tests cover the configured bucket, exact-key lookup, endpoint validation, size, ETag and content-type normalization, missing-object behavior, sanitized authorization failure, enforcement of a single configured bucket restriction, one-attempt behavior, and absence of HEAD, object GET, logging, retry, and fallback from the inspection path. Existing Worker storage tests continue to prove that an inspection failure prevents finalize and that size mismatch prevents the database state transition.

The isolated live regression used a disposable lesson and small synthetic XLSX object. Direct PUT, Worker metadata inspection, finalize, teacher resource listing through the separate browser gateway, and signed download generation all passed. A nonexistent object was rejected without finalize, a storage-reported size mismatch returned conflict while leaving metadata pending, and a student actor was denied during database authorization before any B2 operation. Every disposable object and row was removed, including a direct signed-download check that the finalized object no longer existed after deletion. The isolated bucket and restricted key remain available for the full D4C rerun. Frontend and Worker Data API counts remain zero; browser-to-B2 bytes remain direct; no database transaction spans B2 work; and production infrastructure and the frozen XLSX incident remain untouched.

## Step 16.3D4C — real isolated storage E2E

The complete storage matrix ran only against the retained private non-production bucket, isolated Worker, isolated Hyperdrive, isolated database, bucket-restricted key, synthetic identities, and the exact local test origin. The configured bucket target was rechecked before mutation and did not match the production bucket. Production infrastructure, production CORS, production objects, and the frozen XLSX state were not accessed or changed.

The lesson flow used a small synthetic XLSX file. Teacher upload preparation, signed direct PUT, Native API exact-key inspection, finalize, metadata verification, teacher list/download, student list/download, unrelated-user denial, supported B2 delete, and metadata delete all passed. Storage-reported size and ETag were persisted and the ready state was verified. The assignment flow repeated the full sequence with a small synthetic PDF. Teacher and enrolled-student access passed, unrelated-user access failed closed, and both the assignment object and metadata were removed.

The submission flow used a small text fixture. The enrolled student prepared, directly uploaded, finalized, and read Version 1; submission then made it available to the owning teacher while the unrelated user remained denied. The teacher requested a revision, the student uploaded and finalized Version 2 through the same direct path, and the student resubmitted. Both versions remained represented in order, Version 2 was downloadable by the teacher, and no duplicate row, overwrite, or replay was observed. The product has no supported submission-file deletion route, so this one synthetic submission fixture, its two isolated objects, and the minimal class/module/lesson/assignment context required by its foreign keys are intentionally retained for final staging. All disposable lesson, assignment, and failure-test objects and metadata were removed.

For every upload and download, the client exchanged bytes directly with B2 through signed URLs. The Worker authenticated, authorized, signed, inspected object metadata, and coordinated database state; it did not read or proxy file bodies. Runtime requests used the browser gateway or internal gateway through Hyperdrive and PostgreSQL. Frontend and Worker Neon Data API request counts remained zero. No database transaction spanned a B2 operation.

Live M4 ordering checks passed. Authorization denial returned before signing or B2 access. A deliberately invalid signed PUT failed without finalize. A successful PUT followed by an injected internal finalize failure produced a visible pending-object reconciliation state, with one PUT and one finalize attempt and no replay. An injected B2 delete failure left metadata intact. A successful B2 delete followed by an injected metadata-delete failure left a detectable metadata-only reconciliation state, with one B2 delete and no replay. Both deliberate reconciliation fixtures were cleaned after the normal isolated Worker was restored. No database retry, gateway retry, B2 replay, Data API fallback, or dual execution occurred.

The authorization matrix passed for the owning teacher, enrolled student, and unrelated synthetic user. Teacher resource management and submission access, student resource reads and own-submission actions, and denial of a student teacher-only mutation behaved as designed. The unrelated user could not download lesson, assignment, or submission files. No actor identity crossed requests.

Live B2 CORS accepted the exact local origin for PUT preflight and GET, rejected a different origin, allowed the required `Content-Type` header, and contained no wildcard origin. Frontend ETag exposure is not required because finalize obtains the ETag through server-side Native API inspection. Positive XLSX, PDF, and text flows passed. Executable extensions and an over-limit metadata request were rejected before storage state was created. The current contract validates the extension/resource-kind pair and a bounded non-empty MIME value; it does not enforce a MIME-to-extension lookup table.

The retained production Wrangler `NEON_DATA_API_URL` declaration has no runtime source consumer. With frontend and Worker Data API counts at zero and the real isolated auth and storage paths complete without it, its final status is `UNUSED_AND_SAFE_TO_REMOVE_AT_CUTOVER`. It remains unchanged in this step. Remaining cutover work is the coordinated final staging E2E and smoke gate, production role and SQL application plan, production Hyperdrive and Worker secret/binding provisioning, production frontend gateway configuration, removal of the legacy binding during the approved cutover, rollback rehearsal, and explicit production authorization. The isolated bucket, restricted key, Workers, database, Hyperdrive, and retained submission fixture remain available for final staging.

## Step 16.4 — final coordinated staging E2E

The final journey ran from the local staging frontend at the exact isolated origin through the real Neon Auth SDK session flow, the isolated browser gateway and storage Worker, isolated Hyperdrive and PostgreSQL, and the retained private non-production B2 environment. The feature HEAD was verified before the run. The frontend and Worker contained zero Data API call sites, and all live database work completed through `/rpc` or the Worker's internal gateway executor. No production URL, binding, database, bucket, object, Auth configuration, deployment, or frozen XLSX state was used or changed.

Three fresh synthetic Auth users represented an owning teacher, an enrolled student, and an unrelated student. Each login used the supported Auth SDK and the application subsequently obtained its JWT through `getSession()`. The teacher bootstrap completed once with the teacher role and dashboard. The teacher created `FINAL E2E Data Analytics`, invited the synthetic student, and the student bootstrap and invitation claim produced exactly one active membership and one accepted invitation. A fresh student logout/login retained the class without a duplicate membership or claim. Later A-to-B-to-C-to-A session switches restored the correct role and data without stale cross-user state.

The teacher created and activated the `SQL` module, created, edited, and published `SQL E2E Lesson 1`, and set and then updated its YouTube metadata. Teacher module and lesson views and the student's published module, lesson, and video views all loaded successfully. A small synthetic XLSX lesson resource followed prepare, direct signed B2 PUT, Native API exact-key inspection, finalize, teacher list/download, and student list/download. An unrelated user was denied. The Worker did not proxy bytes. The resource's supported delete flow removed both object and metadata.

The teacher created one lesson-linked assignment, edited it once, uploaded a small synthetic assignment resource through the direct B2 path, and published it. The student saw the published assignment and downloaded the resource; the unrelated user could not load the assignment or obtain either resource download URL. The student directly uploaded and finalized a Version 1 submission, submitted it once, and downloaded it. The teacher opened the submission and downloaded Version 1, requested one revision with feedback, and the student uploaded and resubmitted Version 2. The teacher saw both versions, downloaded Version 2, and marked the submission reviewed once. The student then saw the reviewed state, both versions, and the final feedback. No numeric grade was displayed.

The authorization matrix passed. The teacher managed only the owned class and its course, resources, assignment, and enrolled-student submission. The enrolled student read published class content and resources and managed only the student's own submission; a direct teacher-route attempt returned to the student workspace. The unrelated user had zero classes and assignments, received the class/assignment denial states, could not obtain lesson, assignment, or submission download URLs, and could not enter a teacher route. No actor identity leaked between sessions.

Desktop and narrow mobile layouts rendered the dashboard and journey pages without horizontal overflow. Light and dark themes and Azerbaijani and English interfaces all rendered and remained usable. The tested pages included teacher and student dashboards, class, module, lesson, assignment, and submission detail. Browser uploads and downloads used signed direct B2 URLs, while Worker responses contained authorization and metadata only. Application runtime used no frontend or Worker Neon Data API request, retry, fallback, or dual execution. Catalog verification found one class, one membership, one accepted invitation, one active module, one published lesson, one published assignment, one reviewed submission, and exactly two submission files with versions 1 and 2. These counts also showed that bootstrap, claim, create, submit, revision, finalize, and review were not duplicated.

The disposable lesson and assignment resource objects and metadata were removed through the supported storage routes. Submission deletion is not a supported product operation, so the final staging class/module/lesson/assignment context and its reviewed submission V1/V2 remain intentionally in the isolated environment. The earlier D4C V1/V2 submission fixture also remains documented and isolated. Neither is an uncontrolled orphan or contains production data. The isolated bucket, restricted key, Workers, Hyperdrive, database, and these explicit synthetic fixtures remain available for the approved cutover smoke gate.

### Production cutover inventory

- **SQL:** review and apply `database/staging/auth_gateway_identity_v1.sql` as the approved forward migration. Before application, verify the 84-function, 71-callable, nine-policy canonical manifest, confirm the migration target and backup/restore point, confirm that the gateway roles do not already conflict, and record current public signatures and grants. The migration creates the restricted `dataclass_gateway` LOGIN, the `dataclass_gateway_owner` NOLOGIN capability owner, the `app_private` helper surface, the `app_gateway` callable surface, explicit table privileges, and capability policies. Provision the LOGIN credential outside tracked SQL. After application, re-run catalog counts, signature parity, zero active migrated `auth.uid()`/`auth.user_id()` references, helper fail-closed tests, role privilege negatives, RLS actor A/B tests, trigger regression, and one rolled-back M2/M3 smoke. Historical migrations remain unchanged.
- **Hyperdrive:** create the production binding to the production database with the restricted gateway LOGIN, confirm TLS and a request-scoped `pg.Client` connection, and verify `session_user`, `app_private.current_actor_id()`, transaction-local actor clearing, statement timeout, rollback, and disposal. The Worker receives only the Hyperdrive binding and never a browser-visible database credential.
- **Worker:** deploy the reviewed gateway/storage source with `HYPERDRIVE`, exact production app origin, enabled-gateway flag, fixed Auth issuer/audience/JWKS settings, existing production B2 bucket/endpoint/region, and Worker-only B2 key secrets. Verify 55 browser and 16 internal registry entries, internal-key rejection, CORS, sanitized errors, Native API metadata inspection, and no byte proxy. Remove `NEON_DATA_API_URL` only in the approved coordinated configuration cleanup; keep the prior Worker version and its binding values available as rollback material until the gate closes.
- **Frontend:** set `VITE_RPC_GATEWAY_URL` to the approved production Worker origin and retain the existing storage Worker URL convention, then build and deploy the reviewed frontend after the enabled Worker passes server-side smoke. Verify Auth SDK session acquisition, `/rpc` requests, storage routes, and zero Data API requests before promoting the deployment.
- **Auth:** immediately before traffic enablement, use one normal supported production SDK login and in-memory `getSession()` token to verify the fixed issuer, audience, EdDSA signature, UUID subject, expiration, and optional `nbf`. Do not print, persist, or expose the token.
- **B2:** preserve the existing private production bucket and objects. Confirm the Worker key is bucket-restricted and includes only the capabilities required for signed PUT/GET, delete, and Native API exact-key `listFiles` inspection; verify exact production-origin CORS and metadata lookup against a new disposable object only after separate production authorization. No bucket copy or destructive storage migration is required.
- **Frozen XLSX incident:** keep the two pending metadata rows and two B2 objects untouched during cutover. After the new production path and rollback window are healthy, perform a separately approved reconciliation that identifies the four frozen items by the incident inventory, verifies no live reference changed, removes or repairs DB metadata and B2 objects in the documented order, and records final object/row absence. That cleanup is outside this migration gate.

### Rollback sequence

The last safe rollback point with no production change is immediately before applying the production SQL migration. At that point, canceling cutover requires no action. After SQL application but before traffic routing, leave the additive schemas, roles, functions, and policies dormant, disable the gateway, and investigate; remove them only through a separately reviewed forward corrective migration.

After Worker or frontend traffic moves, first stop promotion and classify any uncertain M3/M4 requests for reconciliation. Redeploy the previously approved frontend and Worker versions as one coordinated rollback, restore their saved binding/configuration set including the legacy Data API value if that Worker needs it, and verify the legacy public functions remain compatible with the current tables. Do not use runtime fallback or replay uncertain mutations. Once legacy traffic is healthy, disable the new gateway route and detach the new Hyperdrive binding if appropriate. Database rollback remains a new forward corrective migration after application traffic is restored; historical SQL is never edited. B2 object/metadata reconciliation and the frozen XLSX incident remain separate from code or schema rollback.

The coordinated isolated staging journey is complete. Remaining production blockers are: explicit production authorization; a database backup/restore point; approval of the reviewed SQL execution plan; restricted gateway LOGIN credential provisioning; production Hyperdrive provisioning; production Worker secret and binding configuration; the in-memory production Auth JWT preflight; a coordinated Worker and frontend rollout window; post-deployment smoke and monitoring; approved removal of the legacy Data API binding; and separately approved frozen XLSX reconciliation. No production action was performed in Step 16.4.
