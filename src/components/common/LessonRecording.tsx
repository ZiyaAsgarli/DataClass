import { useState, type FormEvent } from 'react'
import { AlertCircle, PlaySquare } from 'lucide-react'
import { DialogFrame } from '@/components/common/CourseForms'
import { Button } from '@/components/ui/button'
import { parseYouTubeVideoId, youtubeEmbedUrl } from '@/lib/youtube'

export function LessonRecordingDialog({ initialUrl = '', onClose, onSave }: {
  initialUrl?: string
  onClose: () => void
  onSave: (url: string) => Promise<void>
}) {
  const [url, setUrl] = useState(initialUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!parseYouTubeVideoId(url)) {
      setError('Enter a valid YouTube watch, youtu.be, or Shorts URL.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSave(url.trim())
    } catch {
      setError('The recording could not be saved. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <DialogFrame title={initialUrl ? 'Replace recording' : 'Add recording'} description="Upload your OBS recording to YouTube as Unlisted, then paste the link here." onClose={onClose}><form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}><label className="block text-sm font-medium">YouTube video URL *<input autoFocus type="url" value={url} onChange={(event) => { setUrl(event.target.value); setError('') }} className="mt-2 h-10 w-full rounded-md border bg-background px-3" placeholder="https://www.youtube.com/watch?v=…" /></label><p className="text-xs leading-5 text-muted-foreground">Use a YouTube watch, youtu.be, or Shorts link. Unlisted videos remain accessible to anyone who has the link.</p>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || !url.trim()}>{busy ? 'Saving…' : initialUrl ? 'Replace recording' : 'Add recording'}</Button></div></form></DialogFrame>
}

export function RemoveRecordingDialog({ onClose, onRemove }: {
  onClose: () => void
  onRemove: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <DialogFrame title="Remove recording?" description="This clears the YouTube metadata without deleting the lesson or the video on YouTube." onClose={onClose}><div className="mt-6"><div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm"><AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><p>Students will see “Recording not available yet” until another recording is attached.</p></div>{error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}<div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={() => { setBusy(true); setError(''); void onRemove().catch(() => setError('The recording could not be removed. Please try again.')).finally(() => setBusy(false)) }}>{busy ? 'Removing…' : 'Remove recording'}</Button></div></div></DialogFrame>
}

export function YouTubePlayer({ videoId, title }: { videoId: string; title: string }) {
  const [failed, setFailed] = useState(false)
  const embedUrl = youtubeEmbedUrl(videoId)
  if (!embedUrl || failed) return <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg bg-muted p-6 text-center"><PlaySquare className="size-8 text-muted-foreground" /><p className="mt-3 font-medium">This recording could not be played here.</p><p className="mt-1 text-sm text-muted-foreground">Please try again later or contact your teacher.</p></div>
  return <div className="aspect-video w-full overflow-hidden rounded-lg bg-black"><iframe className="size-full border-0" src={embedUrl} title={`${title} lesson recording`} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen onError={() => setFailed(true)} /></div>
}
