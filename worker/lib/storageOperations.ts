interface StoredResource {
  storage_path: string
  file_size_bytes?: number
}

interface StoredObject {
  ContentLength?: number
  ETag?: string
}

interface DeleteStorageOperation {
  authorize: () => Promise<StoredResource>
  deleteObject: (storagePath: string) => Promise<void>
  deleteMetadata: () => Promise<unknown>
}

interface FinalizeStorageOperation {
  getState: () => Promise<StoredResource>
  inspectObject: (storagePath: string) => Promise<StoredObject>
  finalize: (fileSize: number, etag: string | null) => Promise<unknown>
}

export class StorageReconciliationRequiredError extends Error {
  readonly status = 503

  constructor() {
    super('The storage state requires reconciliation before this operation can continue.')
    this.name = 'StorageReconciliationRequiredError'
  }
}

export async function runDeleteStorageOperation(operation: DeleteStorageOperation) {
  const resource = await operation.authorize()
  await operation.deleteObject(resource.storage_path)
  try {
    await operation.deleteMetadata()
  } catch {
    throw new StorageReconciliationRequiredError()
  }
}

export async function runFinalizeStorageOperation(operation: FinalizeStorageOperation) {
  const resource = await operation.getState()
  const object = await operation.inspectObject(resource.storage_path)
  const sizeMatches = object.ContentLength != null
    && Number(object.ContentLength) === Number(resource.file_size_bytes)

  if (sizeMatches) {
    try {
      await operation.finalize(Number(object.ContentLength), object.ETag ?? null)
    } catch {
      throw new StorageReconciliationRequiredError()
    }
  }

  return { sizeMatches }
}
