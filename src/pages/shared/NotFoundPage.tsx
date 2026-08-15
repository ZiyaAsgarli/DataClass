import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from '@/components/common/Brand'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return <main className="flex min-h-screen flex-col bg-background"><header className="flex h-20 items-center px-6 lg:px-12"><Brand /></header><section className="flex flex-1 items-center justify-center px-6 pb-20 text-center"><div><p className="text-sm font-semibold text-primary">404 · PAGE NOT FOUND</p><h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">This page isn’t in class.</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">The address may be incorrect, or this area may be planned for a later step.</p><Button className="mt-8" asChild><Link to="/"><ArrowLeft />Back to start</Link></Button></div></section></main>
}
