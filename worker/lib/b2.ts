import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { WorkerEnv } from '../types'
import { buildAttachmentContentDisposition } from './contentDisposition'

const uploadExpirySeconds = 5 * 60
const downloadExpirySeconds = 2 * 60

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

export async function inspectObject(env: WorkerEnv, key: string) {
  return await client(env).send(new HeadObjectCommand({ Bucket: env.B2_BUCKET_NAME, Key: key }))
}

export async function deleteObject(env: WorkerEnv, key: string) {
  await client(env).send(new DeleteObjectCommand({ Bucket: env.B2_BUCKET_NAME, Key: key }))
}
