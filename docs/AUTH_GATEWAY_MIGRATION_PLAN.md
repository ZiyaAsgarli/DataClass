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
