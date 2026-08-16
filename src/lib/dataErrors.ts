interface DataErrorShape {
  code?: unknown
  status?: unknown
}

export function dataErrorMessage(error: unknown, accessMessage: string, loadMessage: string) {
  const detail = error as DataErrorShape | null
  const status = Number(detail?.status)
  return detail?.code === '42501' || status === 401 || status === 403
    ? accessMessage
    : loadMessage
}
