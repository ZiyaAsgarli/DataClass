import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  B2ObjectInspectionError,
  inspectObjectWithNativeApi,
} from '../worker/lib/b2.ts'
import { runFinalizeStorageOperation } from '../worker/lib/storageOperations.ts'

const bucket = 'isolated-test-bucket'
const key = 'lesson-resources/synthetic object.xlsx'

function authorization() {
  return new Response(JSON.stringify({
    authorizationToken: 'test-authorization-token',
    apiInfo: { storageApi: {
      apiUrl: 'https://api.example.backblazeb2.com',
      allowed: {
        buckets: [{ id: 'isolated-bucket-id', name: bucket }],
        capabilities: ['listFiles'],
      },
    } },
  }))
}

test('object inspection requests exact-key metadata and returns size, ETag, and content type', async () => {
  const requests: RequestInfo[] = []
  const result = await inspectObjectWithNativeApi(async (input) => {
    requests.push(input)
    if (requests.length === 1) return authorization()
    return new Response(JSON.stringify({ files: [
      { action: 'upload', fileName: `${key}.extra`, contentLength: 99, contentMd5: 'wrong' },
      { action: 'upload', fileName: key, contentLength: 12, contentMd5: 'expected-etag', contentType: 'application/test' },
    ] }))
  }, { keyId: 'isolated-key-id', applicationKey: 'isolated-application-key' }, bucket, key)

  assert.equal(requests.length, 2)
  const listUrl = new URL(String(requests[1]))
  assert.equal(listUrl.pathname, '/b2api/v4/b2_list_file_names')
  assert.equal(listUrl.searchParams.get('startFileName'), key)
  assert.equal(listUrl.searchParams.get('prefix'), key)
  assert.equal(listUrl.searchParams.get('maxFileCount'), '1')
  assert.deepEqual(result, { ContentLength: 12, ETag: '"expected-etag"', ContentType: 'application/test' })
})

test('object inspection rejects a missing exact key deterministically', async () => {
  let calls = 0
  await assert.rejects(
    inspectObjectWithNativeApi(async () => {
      calls += 1
      return calls === 1
        ? authorization()
        : new Response(JSON.stringify({ files: [
          { action: 'upload', fileName: `${key}.extra`, contentLength: 12 },
        ] }))
    }, { keyId: 'isolated-key-id', applicationKey: 'isolated-application-key' }, bucket, key),
    (error) => error instanceof B2ObjectInspectionError
      && error.code === 'NOT_FOUND'
      && error.message === 'The uploaded object was not found.',
  )
})

test('B2 authorization failures are sanitized and never retried', async () => {
  let calls = 0
  await assert.rejects(
    inspectObjectWithNativeApi(async () => {
      calls += 1
      return new Response('credential and endpoint details', { status: 403 })
    }, { keyId: 'isolated-key-id', applicationKey: 'isolated-application-key' }, bucket, key),
    (error) => error instanceof B2ObjectInspectionError
      && error.code === 'UNAVAILABLE'
      && error.message === 'The uploaded object could not be inspected.'
      && !error.message.includes('credential'),
  )
  assert.equal(calls, 1)
})

test('inspection implementation has no object GET, fallback, retry, or logging path', async () => {
  const source = await readFile(new URL('../worker/lib/b2.ts', import.meta.url), 'utf8')
  const inspectionSource = source.slice(
    source.indexOf('export async function inspectObjectWithNativeApi'),
    source.indexOf('export async function deleteObject'),
  )
  assert.match(inspectionSource, /b2_list_file_names/)
  assert.doesNotMatch(inspectionSource, /GetObjectCommand|HeadObjectCommand|\.body|console\.|retry|fallback/i)
  assert.match(source, /region: env\.B2_REGION/)
  assert.match(source, /endpoint: endpoint\.toString\(\)\.replace/)
  assert.match(source, /hostname\.endsWith\('\.backblazeb2\.com'\)/)
})

test('inspection fails closed unless the application key is restricted to the configured bucket', async () => {
  for (const buckets of [
    [],
    [{ id: 'isolated-bucket-id', name: bucket }, { id: 'other-id', name: 'other-bucket' }],
    [{ id: 'other-id', name: 'other-bucket' }],
  ]) {
    await assert.rejects(inspectObjectWithNativeApi(async () => new Response(JSON.stringify({
      authorizationToken: 'test-authorization-token',
      apiInfo: { storageApi: {
        apiUrl: 'https://api.example.backblazeb2.com',
        allowed: { buckets, capabilities: ['listFiles'] },
      } },
    })), { keyId: 'isolated-key-id', applicationKey: 'isolated-application-key' }, bucket, key), B2ObjectInspectionError)
  }
})

test('storage-reported size mismatch rejects finalize without replay', async () => {
  let inspections = 0
  let finalizations = 0
  const result = await runFinalizeStorageOperation({
    getState: async () => ({ storage_path: key, file_size_bytes: 13 }),
    inspectObject: async () => {
      inspections += 1
      return { ContentLength: 12, ETag: 'storage-etag' }
    },
    finalize: async () => { finalizations += 1 },
  })
  assert.deepEqual(result, { sizeMatches: false })
  assert.equal(inspections, 1)
  assert.equal(finalizations, 0)
})
