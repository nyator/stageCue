import { createReadStream, statSync, type Stats } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function statOrNull(file: string): Stats | null {
  try {
    return statSync(file)
  } catch {
    return null
  }
}

function plain(response: ServerResponse, status: number, message: string, extra = {}): void {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
    ...extra,
  })
  response.end(message)
}

/**
 * Serves the built screen page (apps/screen/dist) to TVs and browsers on the
 * network. Read-only: GET and HEAD, files inside rootDir only.
 */
export function createStaticHandler(
  rootDir: string,
): (request: IncomingMessage, response: ServerResponse) => void {
  const root = path.resolve(rootDir)

  return (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      plain(response, 405, 'Method not allowed', { allow: 'GET, HEAD' })
      return
    }

    let pathname: string
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://screen').pathname)
    } catch {
      plain(response, 400, 'Bad request')
      return
    }

    if (!statOrNull(path.join(root, 'index.html'))) {
      plain(
        response,
        503,
        'The StageCue screen page has not been built yet. Run: pnpm --filter @stagecue/screen build',
      )
      return
    }

    const file = path.resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`)
    const insideRoot = file.startsWith(root + path.sep)
    const stats = insideRoot && !pathname.includes('\0') ? statOrNull(file) : null
    if (!stats?.isFile()) {
      plain(response, 404, 'Not found')
      return
    }

    const extension = path.extname(file).toLowerCase()
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
      'content-length': stats.size,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      // Built assets have content hashes in their names; the page itself must always be fresh.
      'cache-control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    })

    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(file)
      .on('error', () => response.destroy())
      .pipe(response)
  }
}
