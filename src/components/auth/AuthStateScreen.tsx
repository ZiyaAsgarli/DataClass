import { AlertCircle, LoaderCircle, RotateCcw } from 'lucide-react'
import { Brand } from '@/components/common/Brand'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function AuthStateScreen({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-5">
      <Card className="w-full max-w-md p-7 text-center shadow-[0_18px_55px_rgba(0,0,0,0.08)]">
        <div className="mb-7 flex justify-center"><Brand /></div>
        {error ? (
          <>
            <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><AlertCircle className="size-5" /></span>
            <h1 className="mt-5 text-xl font-semibold tracking-[-0.025em]">Workspace setup needs attention</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>
            {onRetry && <Button className="mt-6" onClick={onRetry}><RotateCcw />Try again</Button>}
          </>
        ) : (
          <>
            <LoaderCircle className="mx-auto size-7 animate-spin text-primary" />
            <h1 className="mt-5 text-lg font-semibold">Preparing your workspace</h1>
            <p className="mt-2 text-sm text-muted-foreground">Confirming your session and DataClass role…</p>
          </>
        )}
      </Card>
    </main>
  )
}
