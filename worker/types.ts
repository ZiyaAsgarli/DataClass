export interface WorkerEnv {
  APP_ORIGIN: string
  NEON_DATA_API_URL: string
  B2_KEY_ID: string
  B2_APPLICATION_KEY: string
  B2_BUCKET_NAME: string
  B2_S3_ENDPOINT: string
  B2_REGION: string
}

export interface ResourceStorageRow {
  resource_id?: string
  file_id?: string
  storage_path: string
  file_name?: string
  file_size_bytes?: number
  mime_type?: string
  upload_status?: 'pending' | 'ready'
}
