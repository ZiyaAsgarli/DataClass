const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{11}$/
const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])

export function parseYouTubeVideoId(value: string) {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password) return null

    let videoId: string | null = null
    if (url.hostname === 'youtu.be') {
      const segments = url.pathname.split('/').filter(Boolean)
      if (segments.length === 1) videoId = segments[0]
    } else if (youtubeHosts.has(url.hostname)) {
      if (url.pathname === '/watch') {
        videoId = url.searchParams.get('v')
      } else {
        const segments = url.pathname.split('/').filter(Boolean)
        if (segments.length === 2 && segments[0] === 'shorts') videoId = segments[1]
      }
    }

    return videoId && youtubeVideoIdPattern.test(videoId) ? videoId : null
  } catch {
    return null
  }
}

export function youtubeWatchUrl(videoId: string) {
  return youtubeVideoIdPattern.test(videoId)
    ? `https://www.youtube.com/watch?v=${videoId}`
    : null
}

export function youtubeEmbedUrl(videoId: string) {
  return youtubeVideoIdPattern.test(videoId)
    ? `https://www.youtube-nocookie.com/embed/${videoId}`
    : null
}

export function youtubeThumbnailUrl(videoId: string) {
  return youtubeVideoIdPattern.test(videoId)
    ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    : null
}
