/** Shared look for text inputs, selects, and text areas. */
export const controlClass =
  'rounded-md border border-line-soft bg-raised px-3 text-sm text-ink transition-colors duration-150 placeholder:text-faint hover:border-line focus:border-cue focus-visible:outline-none aria-[invalid=true]:border-alert disabled:opacity-50'

/** Default size for a control. A width or height class in className replaces the matching default. */
export function controlSize(className: string): string {
  const width = /(^|\s)(w-|min-w-|flex-1)/.test(className) ? '' : 'w-full'
  const height = /(^|\s)h-/.test(className) ? '' : 'h-9'
  return `${width} ${height}`
}
