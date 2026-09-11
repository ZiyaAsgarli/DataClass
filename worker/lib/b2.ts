import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { WorkerEnv } from '../types.ts'
import { buildAttachmentContentDisposition } from './contentDisposition.ts'

const uploadExpirySeconds = 5 * 60
const downloadExpirySeconds = 2 * 60
const b2AuthorizeUrl = 'https://api.backblazeb2.com/b2api/v4/b2_authorize_account'

export class B2ObjectInspectionError extends Error {
  readonly code: 'NOT_FOUND' | 'UNAVAILABLE'

  constructor(code: 'NOT_FOUND' | 'UNAVAILABLE') {
    super(code === 'NOT_FOUND'
      ? 'The uploaded object was not found.'
      : 'The uploaded object could not be inspected.')
    this.name = 'B2ObjectInspectionError'
    this.code = code
  }
}

interface B2Authorization {
  authorizationToken: string
  apiInfo: { storageApi: {
    apiUrl: string
    allowed: {
      buckets: Array<{ id: string; name: string }>
      capabilities: string[]
    }
  } }
}

interface B2FileMetadata {
  action?: string
  contentLength?: number
  contentMd5?: string | null
  contentType?: string | null
  fileName?: string
}

function client(env: WorkerEnv) {
  const endpoint = new URL(env.B2_S3_ENDPOINT)
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.backblazeb2.com')) {
    throw new Error('B2 endpoint configuration is invalid.')
  }
  return new S3Client({
    region: env.B2_REGION,
    endpoint: endpoint.toString().replace(/\/$/, ''),
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.B2_KEY_ID,
      secretAccessKey: env.B2_APPLICATION_KEY,
    },
  })
}

export async function createUploadUrl(env: WorkerEnv, key: string, contentType: string) {
  const uploadUrl = await getSignedUrl(client(env), new PutObjectCommand({
    Bucket: env.B2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  }), { expiresIn: uploadExpirySeconds })
  return {
    uploadUrl,
    expiresAt: new Date(Date.now() + uploadExpirySeconds * 1000).toISOString(),
    requiredHeaders: { 'Content-Type': contentType },
  }
}

export async function createDownloadUrl(env: WorkerEnv, key: string, fileName: string) {
  const downloadUrl = await getSignedUrl(client(env), new GetObjectCommand({
    Bucket: env.B2_BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: buildAttachmentContentDisposition(fileName),
  }), { expiresIn: downloadExpirySeconds })
  return {
    downloadUrl,
    expiresAt: new Date(Date.now() + downloadExpirySeconds * 1000).toISOString(),
  }
}

export async function inspectObjectWithNativeApi(
  fetcher: typeof fetch,
  credentials: { keyId: string; applicationKey: string },
  bucket: string,
  key: string,
) {
  try {
    const authorizationResponse = await fetcher(b2AuthorizeUrl, {
      headers: {
        Authorization: `Basic ${btoa(`${credentials.keyId}:${credentials.applicationKey}`)}`,
      },
    })
    if (!authorizationResponse.ok) throw new B2ObjectInspectionError('UNAVAILABLE')
    const authorization = await authorizationResponse.json() as B2Authorization
    const allowed = authorization.apiInfo?.storageApi?.allowed
    const allowedBuckets = allowed?.buckets
    const allowedBucket = Array.isArray(allowedBuckets) && allowedBuckets.length === 1
      ? allowedBuckets[0]
      : null
    if (allowedBucket?.name !== bucket
      || typeof allowedBucket.id !== 'string'
      || !allowed?.capabilities?.includes('listFiles')) {
      throw new B2ObjectInspectionError('UNAVAILABLE')
    }

    const apiUrl = new URL(authorization.apiInfo?.storageApi?.apiUrl)
    if (apiUrl.protocol !== 'https:' || !apiUrl.hostname.endsWith('.backblazeb2.com')) {
      throw new B2ObjectInspectionError('UNAVAILABLE')
    }
    const listUrl = new URL('/b2api/v4/b2_list_file_names', apiUrl)
    listUrl.searchParams.set('bucketId', allowedBucket.id)
    listUrl.searchParams.set('startFileName', key)
    listUrl.searchParams.set('maxFileCount', '1')
    listUrl.searchParams.set('prefix', key)
    const metadataResponse = await fetcher(listUrl, {
      headers: { Authorization: authorization.authorizationToken },
    })
    if (!metadataResponse.ok) throw new B2ObjectInspectionError('UNAVAILABLE')
    const metadata = await metadataResponse.json() as { files?: B2FileMetadata[] }
    const object = metadata.files?.find((candidate) => (
      candidate.fileName === key && candidate.action === 'upload'
    ))
    if (object?.contentLength == null) throw new B2ObjectInspectionError('NOT_FOUND')

    return {
      ContentLength: object.contentLength,
      ETag: object.contentMd5 ? `"${object.contentMd5}"` : undefined,
      ContentType: object.contentType ?? undefined,
    }
  } catch (error) {
    if (error instanceof B2ObjectInspectionError) throw error
    throw new B2ObjectInspectionError('UNAVAILABLE')
  }
}

export async function inspectObject(env: WorkerEnv, key: string) {
  return await inspectObjectWithNativeApi(
    fetch,
    { keyId: env.B2_KEY_ID, applicationKey: env.B2_APPLICATION_KEY },
    env.B2_BUCKET_NAME,
    key,
  )
}

export async function deleteObject(env: WorkerEnv, key: string) {
  await client(env).send(new DeleteObjectCommand({ Bucket: env.B2_BUCKET_NAME, Key: key }))
}
