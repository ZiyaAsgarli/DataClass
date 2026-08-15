import { useCallback, useEffect, useState } from 'react'

export function useAsyncData<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setData(await loader())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [loader])

  useEffect(() => { void reload() }, [reload])
  return { data, loading, error, reload }
}
