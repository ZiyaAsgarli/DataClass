export const POC_OPERATION_NAMES = ['list_my_student_classes'] as const

export type PocOperationName = (typeof POC_OPERATION_NAMES)[number]

export interface PocOperationRequest {
  operation: PocOperationName
  params: Record<string, never>
}

export class PocRequestError extends Error {
  constructor(message = 'The PoC request is invalid.') {
    super(message)
  }
}

export const POC_OPERATION_REGISTRY = Object.freeze({
  list_my_student_classes: Object.freeze({
    sql: 'SELECT * FROM app_poc.list_my_student_classes()',
  }),
}) satisfies Readonly<Record<PocOperationName, { readonly sql: string }>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function parsePocOperationRequest(value: unknown): PocOperationRequest {
  if (!isRecord(value)) throw new PocRequestError()
  const requestKeys = Object.keys(value).sort()
  if (requestKeys.length !== 2 || requestKeys[0] !== 'operation' || requestKeys[1] !== 'params') {
    throw new PocRequestError()
  }
  if (value.operation !== 'list_my_student_classes') {
    throw new PocRequestError('Unknown PoC operation.')
  }
  if (!isRecord(value.params) || Object.keys(value.params).length !== 0) {
    throw new PocRequestError('This PoC operation accepts no parameters.')
  }
  return { operation: value.operation, params: {} }
}
