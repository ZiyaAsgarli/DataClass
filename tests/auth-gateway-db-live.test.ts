import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Client } from 'pg'

const manifest = JSON.parse(
  readFileSync(new URL('./fixtures/auth-gateway-db-manifest.json', import.meta.url), 'utf8'),
)

const CALLABLE_NAMES = manifest.functions
  .filter((entry) => ['READ_ONLY_BROWSER_RPC', 'MUTATION_BROWSER_RPC', 'BACKEND_ONLY_STORAGE_RPC'].includes(entry.classification))
  .map((entry) => entry.name)

const TABLES = [
  'submission_feedback','submission_files','submissions','assignment_resources','assignments',
  'lesson_resources','lessons','module_teachers','modules','class_invitations',
  'class_members','class_teachers','classes','user_roles','profiles',
]

function gatewayConfig(adminUrl, password) {
  const url = new URL(adminUrl)
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    database: decodeURIComponent(url.pathname.slice(1)),
    user: 'dataclass_gateway',
    password,
    ssl: { rejectUnauthorized: true },
  }
}

async function withActor(connectionString, actorId, sql, values = []) {
  const client = new Client(typeof connectionString === 'string' ? { connectionString } : connectionString)
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('app.verified_actor_id', $1, true)", [actorId])
    const actor = await client.query('SELECT app_private.current_actor_id()::text AS id')
    assert.equal(actor.rows[0].id, actorId)
    const result = await client.query(sql, values)
    await client.query('COMMIT')
    const cleared = await client.query('SELECT app_private.current_actor_id()::text AS id')
    assert.equal(cleared.rows[0].id, null)
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    error.stageOperation = sql.match(/app_gateway\.([a-z_]+)/)?.[1] ?? sql.slice(0, 40)
    throw error
  } finally {
    await client.end()
  }
}

async function expectSqlState(connectionString, actorId, sql, values, state) {
  const operation = sql.match(/app_gateway\.([a-z_]+)/)?.[1] ?? 'unknown'
  try {
    await withActor(connectionString, actorId, sql, values)
  } catch (error) {
    if (error.code !== state) {
      throw new Error(`SQLSTATE mismatch for ${operation}: expected ${state}, got ${error.code ?? error.name}`)
    }
    return
  }
  assert.fail(`Expected SQLSTATE ${state} for ${operation}`)
}

async function rollbackProbe(connectionString, statements) {
  const client = new Client(typeof connectionString === 'string' ? { connectionString } : connectionString)
  await client.connect()
  try {
    await client.query('BEGIN')
    for (const [sql, values = []] of statements) await client.query(sql, values)
    await client.query('ROLLBACK')
    assert.fail('Privilege probe unexpectedly succeeded')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    assert.equal(error.code, '42501')
  } finally {
    await client.end()
  }
}

function normalize(value) {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]))
  return value
}

const normalizeVoid = (value) => value === '' ? null : value

async function main() {
  const admin = new Client({ connectionString: process.env.AUTH_GATEWAY_STAGE_DATABASE_URL })
  await admin.connect()
  try {
  const db = await admin.query('SELECT current_database() AS name, session_user AS role')
  assert.equal(db.rows[0].name, 'poc')
  assert.equal(db.rows[0].role, 'poc_owner')
  const authUsers = await admin.query('SELECT id::text, name, email, image FROM neon_auth."user" ORDER BY id')
  assert.equal(authUsers.rows.length, 2)
  const [userA, userB] = authUsers.rows

  const password = crypto.randomBytes(32).toString('base64url')
  const passwordCommand = await admin.query("SELECT format('ALTER ROLE dataclass_gateway PASSWORD %L', $1::text) AS sql", [password])
  await admin.query(passwordCommand.rows[0].sql)
  const gateway = gatewayConfig(process.env.AUTH_GATEWAY_STAGE_DATABASE_URL, password)

  await admin.query(`TRUNCATE ${TABLES.map((name) => `public.${name}`).join(', ')} RESTART IDENTITY CASCADE`)

  const initialA = await withActor(gateway, userA.id, 'SELECT * FROM app_gateway.list_my_student_classes()')
  const initialB = await withActor(gateway, userB.id, 'SELECT * FROM app_gateway.list_my_student_classes()')
  assert.equal(initialA.rows.length, 0)
  assert.equal(initialB.rows.length, 0)

  const bootstrapA = await withActor(gateway, userA.id, 'SELECT * FROM app_gateway.bootstrap_current_user()')
  const bootstrapB = await withActor(gateway, userB.id, 'SELECT * FROM app_gateway.bootstrap_current_user()')
  assert.equal(bootstrapA.rows[0].id, userA.id)
  assert.equal(bootstrapB.rows[0].id, userB.id)
  await admin.query("INSERT INTO public.user_roles(user_id, role) VALUES ($1, 'teacher'), ($2, 'teacher') ON CONFLICT DO NOTHING", [userA.id, userB.id])

  const countBeforeClass = Number((await admin.query('SELECT count(*) FROM public.classes')).rows[0].count)
  const createA = await withActor(gateway, userA.id, 'SELECT * FROM app_gateway.create_class($1, $2)', ['Synthetic A class', 'Isolated fixture'])
  const countAfterClass = Number((await admin.query('SELECT count(*) FROM public.classes')).rows[0].count)
  assert.equal(countAfterClass, countBeforeClass + 1)
  const classA = createA.rows[0].class_id
  const createB = await withActor(gateway, userB.id, 'SELECT * FROM app_gateway.create_class($1, $2)', ['Synthetic B class', 'Isolated fixture'])
  const classB = createB.rows[0].class_id
  assert.notEqual(classA, classB)

  await admin.query("INSERT INTO public.class_members(class_id, student_id, status) VALUES ($1,$2,'active'),($3,$4,'active')", [classA, userA.id, classB, userB.id])
  await withActor(gateway, userA.id, 'SELECT * FROM app_gateway.create_class_invitations($1, $2)', [classA, [userB.email]])
  await withActor(gateway, userB.id, 'SELECT * FROM app_gateway.create_class_invitations($1, $2)', [classB, [userA.email]])

  const moduleA = (await withActor(gateway, userA.id, 'SELECT * FROM app_gateway.create_module($1,$2,$3)', [classA, 'Module A', null])).rows[0].module_id
  const moduleB = (await withActor(gateway, userB.id, 'SELECT * FROM app_gateway.create_module($1,$2,$3)', [classB, 'Module B', null])).rows[0].module_id
  await withActor(gateway, userA.id, 'SELECT app_gateway.set_module_lifecycle($1,$2)', [moduleA, 'active'])
  await withActor(gateway, userB.id, 'SELECT app_gateway.set_module_lifecycle($1,$2)', [moduleB, 'active'])
  const lessonA = (await withActor(gateway, userA.id, 'SELECT * FROM app_gateway.create_lesson($1,$2,$3,$4)', [moduleA, 'Lesson A', null, '2026-09-06'])).rows[0].lesson_id
  const lessonB = (await withActor(gateway, userB.id, 'SELECT * FROM app_gateway.create_lesson($1,$2,$3,$4)', [moduleB, 'Lesson B', null, '2026-09-07'])).rows[0].lesson_id
  await withActor(gateway, userA.id, 'SELECT app_gateway.update_lesson($1,$2,$3,$4,$5)', [lessonA, 'Lesson A', null, '2026-09-06', 'published'])
  await withActor(gateway, userB.id, 'SELECT app_gateway.update_lesson($1,$2,$3,$4,$5)', [lessonB, 'Lesson B', null, '2026-09-07', 'published'])

  const assignmentAResult = await withActor(gateway, userA.id, 'SELECT app_gateway.create_assignment($1,$2,$3,$4,$5,$6) AS id', [classA, lessonA, 'Assignment A', null, null, true])
  const assignmentBResult = await withActor(gateway, userB.id, 'SELECT app_gateway.create_assignment($1,$2,$3,$4,$5,$6) AS id', [classB, lessonB, 'Assignment B', null, null, true])
  const assignmentA = assignmentAResult.rows[0].id
  const assignmentB = assignmentBResult.rows[0].id
  assert.equal(typeof assignmentA, 'string')
  assert.equal(typeof assignmentB, 'string')
  await withActor(gateway, userA.id, 'SELECT app_gateway.set_assignment_status($1,$2)', [assignmentA, 'published'])
  await withActor(gateway, userB.id, 'SELECT app_gateway.set_assignment_status($1,$2)', [assignmentB, 'published'])

  const submissions = await admin.query(`INSERT INTO public.submissions(assignment_id,student_id,status,submitted_at)
    VALUES ($1,$2,'submitted',now()),($3,$4,'submitted',now()) RETURNING id::text,assignment_id::text`, [assignmentA, userA.id, assignmentB, userB.id])
  const submissionA = submissions.rows.find((row) => row.assignment_id === assignmentA).id
  const submissionB = submissions.rows.find((row) => row.assignment_id === assignmentB).id
  await admin.query(`INSERT INTO public.submission_feedback(submission_id,teacher_id,message) VALUES ($1,$2,'Synthetic feedback'),($3,$4,'Synthetic feedback')`, [submissionA,userA.id,submissionB,userB.id])
  const resources = await admin.query(`INSERT INTO public.lesson_resources
    (lesson_id,title,resource_kind,storage_path,file_name,file_size_bytes,mime_type,position,storage_provider,upload_status,uploaded_at)
    VALUES ($1,'Resource A','xlsx','synthetic/a.xlsx','a.xlsx',64,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',0,'b2','ready',now()),
           ($2,'Resource B','xlsx','synthetic/b.xlsx','b.xlsx',96,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',0,'b2','ready',now())
    RETURNING id::text,lesson_id::text`, [lessonA, lessonB])
  const resourceA = resources.rows.find((row) => row.lesson_id === lessonA).id
  const resourceB = resources.rows.find((row) => row.lesson_id === lessonB).id

  const studentA = await withActor(gateway, userA.id, 'SELECT * FROM app_gateway.list_my_student_classes()')
  const studentB = await withActor(gateway, userB.id, 'SELECT * FROM app_gateway.list_my_student_classes()')
  assert.deepEqual(studentA.rows.map((row) => row.id), [classA])
  assert.deepEqual(studentB.rows.map((row) => row.id), [classB])
  assert.equal(typeof studentA.rows[0].student_count, 'string')
  assert.equal(Number(studentA.rows[0].student_count), 1)
  assert.ok(studentA.rows[0].created_at instanceof Date)
  assert.match(normalize(studentA.rows[0]).created_at, /^\d{4}-\d{2}-\d{2}T/)

  const teacherA = await withActor(gateway, userA.id, 'SELECT * FROM app_gateway.list_my_teacher_classes()')
  const teacherB = await withActor(gateway, userB.id, 'SELECT * FROM app_gateway.list_my_teacher_classes()')
  assert.deepEqual(teacherA.rows.map((row) => row.id), [classA])
  assert.deepEqual(teacherB.rows.map((row) => row.id), [classB])
  assert.equal((await withActor(gateway,userA.id,'SELECT * FROM app_gateway.get_class_invitations($1)',[classA])).rows.length,1)
  await expectSqlState(gateway,userB.id,'SELECT * FROM app_gateway.get_class_invitations($1)',[classA],'42501')
  assert.equal((await withActor(gateway,userA.id,'SELECT * FROM app_gateway.get_teacher_module($1)',[moduleA])).rows.length,1)
  await expectSqlState(gateway,userB.id,'SELECT * FROM app_gateway.get_teacher_module($1)',[moduleA],'42501')
  assert.equal((await withActor(gateway,userA.id,'SELECT * FROM app_gateway.get_teacher_lesson($1)',[lessonA])).rows.length,1)
  await expectSqlState(gateway,userB.id,'SELECT * FROM app_gateway.get_teacher_lesson($1)',[lessonA],'42501')
  assert.equal((await withActor(gateway,userA.id,'SELECT * FROM app_gateway.get_teacher_assignment($1)',[assignmentA])).rows.length,1)
  assert.equal((await withActor(gateway,userB.id,'SELECT * FROM app_gateway.get_teacher_assignment($1)',[assignmentA])).rows.length,0)
  assert.equal((await withActor(gateway,userA.id,'SELECT * FROM app_gateway.get_submission_detail($1)',[submissionA])).rows.length,1)
  await expectSqlState(gateway,userB.id,'SELECT * FROM app_gateway.get_submission_detail($1)',[submissionA],'42501')
  assert.equal((await withActor(gateway,userA.id,'SELECT * FROM app_gateway.authorize_lesson_resource_download($1)',[resourceA])).rows.length,1)
  await expectSqlState(gateway,userB.id,'SELECT * FROM app_gateway.authorize_lesson_resource_download($1)',[resourceA],'42501')
  assert.equal((await withActor(gateway,userB.id,'SELECT * FROM app_gateway.authorize_lesson_resource_download($1)',[resourceB])).rows.length,1)

  await withActor(gateway,userA.id,'SELECT app_gateway.update_owned_class($1,$2,$3,$4)',[classA,'Synthetic A class updated','Isolated fixture','active'])
  assert.equal((await admin.query('SELECT name FROM public.classes WHERE id=$1',[classA])).rows[0].name,'Synthetic A class updated')
  await expectSqlState(gateway,userB.id,'SELECT app_gateway.update_owned_class($1,$2,$3,$4)',[classA,'Forbidden',null,'active'],'42501')
  await expectSqlState(gateway,userA.id,'SELECT * FROM app_gateway.create_class($1,$2)',['   ',null],'22023')
  await expectSqlState(gateway,userA.id,'SELECT app_gateway.remove_class_instructor($1,$2)',[classA,userB.id],'P0002')

  const beforeRollback = Number((await admin.query('SELECT count(*) FROM public.classes')).rows[0].count)
  const rollbackClient = new Client(gateway)
  await rollbackClient.connect()
  await rollbackClient.query('BEGIN')
  await rollbackClient.query("SELECT set_config('app.verified_actor_id',$1,true)",[userA.id])
  await rollbackClient.query('SELECT * FROM app_gateway.create_class($1,$2)',['Rolled back class',null])
  await rollbackClient.query('ROLLBACK')
  assert.equal((await rollbackClient.query('SELECT app_private.current_actor_id()::text AS id')).rows[0].id,null)
  assert.equal(Number((await admin.query('SELECT count(*) FROM public.classes')).rows[0].count),beforeRollback)
  await rollbackClient.query('BEGIN')
  await rollbackClient.query("SELECT set_config('app.verified_actor_id',$1,true)",[userB.id])
  const afterRollbackB = await rollbackClient.query('SELECT * FROM app_gateway.list_my_student_classes()')
  assert.deepEqual(afterRollbackB.rows.map((row)=>row.id),[classB])
  await rollbackClient.query('ROLLBACK')
  await rollbackClient.end()

  const alternating = [userA,userB,userA,userB,userB,userA]
  const expected = new Map([[userA.id,classA],[userB.id,classB]])
  const concurrent = await Promise.all(alternating.map((user) => withActor(gateway,user.id,'SELECT * FROM app_gateway.list_my_student_classes()')))
  concurrent.forEach((result,index)=>assert.deepEqual(result.rows.map((row)=>row.id),[expected.get(alternating[index].id)]))

  const missing = new Client(gateway)
  await missing.connect()
  assert.equal((await missing.query('SELECT app_private.current_actor_id()::text AS id')).rows[0].id,null)
  await missing.query('BEGIN')
  await missing.query("SELECT set_config('app.verified_actor_id','not-a-uuid',true)")
  assert.equal((await missing.query('SELECT app_private.current_actor_id()::text AS id')).rows[0].id,null)
  await missing.query('ROLLBACK')
  await missing.end()
  await admin.query('BEGIN')
  await admin.query("SELECT set_config('app.verified_actor_id',$1,true)",[userA.id])
  try {
    await admin.query('SELECT app_private.current_actor_id()::text AS id')
    assert.fail('ordinary database session unexpectedly executed the actor helper')
  } catch (error) {
    assert.equal(error.code, '42501')
  } finally {
    await admin.query('ROLLBACK')
  }

  const jsonContract = await withActor(gateway,userA.id,"SELECT jsonb_build_object('ok',true,'optional',null) AS payload, true AS allowed, NULL::text AS optional")
  assert.deepEqual(jsonContract.rows[0].payload,{ok:true,optional:null})
  assert.equal(jsonContract.rows[0].allowed,true)
  assert.equal(jsonContract.rows[0].optional,null)
  const voidContract = await withActor(gateway,userA.id,'SELECT app_gateway.update_owned_class($1,$2,$3,$4) AS result',[classA,'Synthetic A class updated','Isolated fixture','active'])
  assert.equal(voidContract.rows[0].result,'')
  assert.equal(normalizeVoid(voidContract.rows[0].result),null)

  for (const table of ['profiles','classes','modules','lessons','assignments','submissions','submission_feedback']) {
    const idColumn = table === 'profiles' ? userA.id : table === 'classes' ? classA : table === 'modules' ? moduleA : table === 'lessons' ? lessonA : table === 'assignments' ? assignmentA : table === 'submissions' ? submissionA : (await admin.query('SELECT id::text FROM public.submission_feedback WHERE submission_id=$1',[submissionA])).rows[0].id
    const before = (await admin.query(`SELECT updated_at FROM public.${table} WHERE id=$1`,[idColumn])).rows[0].updated_at
    await new Promise((resolve)=>setTimeout(resolve,5))
    await admin.query(`UPDATE public.${table} SET updated_at=updated_at WHERE id=$1`,[idColumn])
    const after = (await admin.query(`SELECT updated_at FROM public.${table} WHERE id=$1`,[idColumn])).rows[0].updated_at
    assert.ok(after > before, `${table} trigger did not advance updated_at`)
  }

  const signatures = await admin.query(`
    SELECT legacy.proname,
      pg_get_function_identity_arguments(legacy.oid) legacy_identity,
      pg_get_function_identity_arguments(gateway.oid) gateway_identity,
      pg_get_function_arguments(legacy.oid) legacy_arguments,
      pg_get_function_arguments(gateway.oid) gateway_arguments,
      pg_get_function_result(legacy.oid) legacy_result,
      pg_get_function_result(gateway.oid) gateway_result,
      gateway.prosecdef, gateway.proconfig,
      pg_get_userbyid(gateway.proowner) gateway_owner
    FROM pg_proc legacy JOIN pg_namespace ln ON ln.oid=legacy.pronamespace AND ln.nspname='public'
    JOIN pg_proc gateway ON gateway.proname=legacy.proname
    JOIN pg_namespace gn ON gn.oid=gateway.pronamespace AND gn.nspname='app_gateway'
      AND gateway.proargtypes=legacy.proargtypes
    WHERE legacy.proname=ANY($1::text[]) ORDER BY legacy.proname`,[CALLABLE_NAMES])
  assert.equal(signatures.rows.length,71)
  for(const row of signatures.rows){assert.equal(row.legacy_identity,row.gateway_identity);assert.equal(row.legacy_arguments,row.gateway_arguments);assert.equal(row.legacy_result,row.gateway_result);assert.equal(row.prosecdef,true);assert.equal(row.gateway_owner,'dataclass_gateway_owner');assert.ok(row.proconfig.includes('search_path=pg_catalog'))}

  const catalog = await admin.query(`SELECT
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app_gateway' AND p.prokind='f') gateway_functions,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app_private' AND p.prokind='f') private_functions,
    (SELECT count(*)::int FROM pg_policy p WHERE p.polname LIKE 'app_gateway_capability_%') capability_policies,
    (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal) triggers`)
  assert.deepEqual(catalog.rows[0],{gateway_functions:71,private_functions:13,capability_policies:15,triggers:7})
  const identityLeaks = await admin.query(`SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('app_gateway','app_private') AND p.prokind='f' AND (pg_get_functiondef(p.oid)~'auth\\.uid\\(\\)' OR pg_get_functiondef(p.oid)~'auth\\.user_id\\(\\)')`)
  assert.equal(identityLeaks.rows[0].n,0)
  const policyLeaks = await admin.query(`SELECT count(*)::int n FROM pg_policy p WHERE p.polname LIKE 'app_gateway_%' AND (pg_get_expr(p.polqual,p.polrelid)~'auth\\.uid\\(\\)' OR coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')~'auth\\.uid\\(\\)')`)
  assert.equal(policyLeaks.rows[0].n,0)

  const roles = await admin.query(`SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolcanlogin,rolinherit FROM pg_roles WHERE rolname IN ('dataclass_gateway','dataclass_gateway_owner') ORDER BY rolname`)
  assert.deepEqual(roles.rows,[
    {rolname:'dataclass_gateway',rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolcanlogin:true,rolinherit:false},
    {rolname:'dataclass_gateway_owner',rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolcanlogin:false,rolinherit:false},
  ])
  assert.equal((await admin.query("SELECT pg_has_role('dataclass_gateway','dataclass_gateway_owner','MEMBER') member")).rows[0].member,false)
  const executeCount = await admin.query(`SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app_gateway' AND has_function_privilege('dataclass_gateway',p.oid,'EXECUTE')`)
  assert.equal(executeCount.rows[0].n,71)
  const directTablePrivileges = await admin.query(`SELECT count(*)::int n FROM information_schema.role_table_grants WHERE grantee='dataclass_gateway'`)
  assert.equal(directTablePrivileges.rows[0].n,0)
  const ownerUnexpected = await admin.query(`SELECT count(*)::int n FROM information_schema.role_table_grants WHERE grantee='dataclass_gateway_owner' AND privilege_type IN ('TRIGGER','TRUNCATE','REFERENCES')`)
  assert.equal(ownerUnexpected.rows[0].n,0)

  await rollbackProbe(gateway, [['CREATE TABLE public.gateway_should_not_create(id integer)']])
  await rollbackProbe(gateway, [['CREATE TEMP TABLE gateway_should_not_create(id integer)']])
  await rollbackProbe(gateway, [['ALTER TABLE public.classes ADD COLUMN gateway_should_not_add integer']])
  await rollbackProbe(gateway, [['DROP TABLE public.classes']])
  await rollbackProbe(gateway, [['CREATE ROLE gateway_should_not_create']])
  await rollbackProbe(gateway, [['SET ROLE dataclass_gateway_owner']])
  await rollbackProbe(gateway, [['SELECT * FROM public.classes']])
  await rollbackProbe(gateway, [["CREATE OR REPLACE FUNCTION app_private.gateway_should_not_create() RETURNS void LANGUAGE sql AS 'SELECT'" ]])
  await rollbackProbe(gateway, [['SELECT public.is_class_owner($1)',[classA]]])
  assert.equal((await admin.query("SELECT to_regprocedure('app_gateway.set_actor(uuid)') AS setter")).rows[0].setter,null)

  console.log(JSON.stringify({
    fullSchemaGate:'PASS', manifestFunctions:84, callableContracts:71, migratedDirectObjects:79,
    specialObjects:12, stagedIdentityReferences:0, migratedPolicies:9, signaturesChanged:0,
    m2:'PASS', m3:'PASS', m3Retry:false, m4External:false, triggers:'PASS',
    scalarUuid:'PASS', rowSet:'PASS', int8:'PASS', timestamp:'PASS', jsonBooleanNull:'PASS',
    void:'PASS', structuredErrors:'PASS', authorizationMatrix:'PASS', concurrentIsolation:'PASS',
    rollbackIsolation:'PASS', privilegeNegatives:'PASS', liveFullSchema:'PASS',
  }))
  } finally {
    await admin.end().catch(() => undefined)
  }
}

test('full isolated SQL identity, contract, and privilege matrix', {
  skip: process.env.AUTH_GATEWAY_STAGE_DATABASE_URL ? false : 'requires the isolated staging database',
  timeout: 180_000,
}, main)
