const timestampFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatTimestamp(iso: string): string {
  return timestampFormat.format(new Date(iso))
}
