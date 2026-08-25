function rfc5987Encode(value: string) {
  return encodeURIComponent(value).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

export function buildAttachmentContentDisposition(fileName: string) {
  const safeName = Array.from(fileName, (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127 ? '_' : character
  }).join('').trim() || 'resource'
  const asciiFallback = safeName
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_') || 'resource'

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${rfc5987Encode(safeName)}`
}
