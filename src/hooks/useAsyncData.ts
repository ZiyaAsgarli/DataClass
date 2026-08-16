import { useCallback, useEffect, useRef, useState } from 'react'

interface InFlightRequest<T> {
  loader: () => Promise<T>
  promise: Promise<void>
}

export function useAsyncData<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const sequenceRef = useRef(0)
  const inFlightRef = useRef<InFlightRequest<T> | null>(null)

  const reload = useCallback(() => {
    const existing = inFlightRef.current
    if (existing?.loader === loader) return existing.promise

    const sequence = ++sequenceRef.current
    setLoading(true)
    setError(null)
    setData(null)

    const request = (async () => {
      try {
        const result = await loader()
        if (sequence === sequenceRef.current) setData(result)
      } catch (caughtError) {
        if (sequence === sequenceRef.current) setError(caughtError)
      } finally {
        if (sequence === sequenceRef.current) setLoading(false)
        if (sequence === sequenceRef.current && inFlightRef.current?.loader === loader) {
          inFlightRef.current = null
        }
      }
    })()

    inFlightRef.current = { loader, promise: request }
    return request
  }, [loader])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, loading, error, reload }
}
