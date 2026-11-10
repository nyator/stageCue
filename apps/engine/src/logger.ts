const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 } as const

export type LogLevel = keyof typeof LEVELS
export const LOG_LEVELS = Object.keys(LEVELS) as [LogLevel, ...LogLevel[]]

type LogFields = Record<string, unknown>

export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  child(scope: string): Logger
}

function serializeFields(fields: LogFields | undefined): string {
  if (!fields) {
    return ''
  }

  const normalized = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      value instanceof Error ? { name: value.name, message: value.message } : value,
    ]),
  )

  return ` ${JSON.stringify(normalized)}`
}

export function createLogger(level: LogLevel, scope = 'engine'): Logger {
  const threshold = LEVELS[level]

  const write =
    (messageLevel: Exclude<LogLevel, 'silent'>) =>
    (message: string, fields?: LogFields): void => {
      if (LEVELS[messageLevel] < threshold) {
        return
      }

      const line = `${new Date().toISOString()} ${messageLevel.toUpperCase().padEnd(5)} [${scope}] ${message}${serializeFields(fields)}`

      if (messageLevel === 'error' || messageLevel === 'warn') {
        console.error(line)
      } else {
        console.log(line)
      }
    }

  return {
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    child: (childScope) => createLogger(level, `${scope}:${childScope}`),
  }
}
