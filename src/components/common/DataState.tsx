import type { ReactNode } from 'react'
import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <Card className="flex min-h-48 items-center justify-center gap-3 p-8 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{label}</Card>
}

export function ErrorState({ retry, message = 'We could not load this information.' }: { retry: () => void; message?: string }) {
  return <Card className="flex min-h-48 flex-col items-center justify-center p-8 text-center"><AlertCircle className="size-6 text-destructive" /><p className="mt-3 text-sm font-medium">{message}</p><Button className="mt-4" variant="outline" size="sm" onClick={retry}>Try again</Button></Card>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <Card className="flex min-h-56 flex-col items-center justify-center p-8 text-center"><span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Inbox className="size-5" /></span><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>{action && <div className="mt-5">{action}</div>}</Card>
}
