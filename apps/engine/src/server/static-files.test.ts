import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PROTOCOL_VERSION } from '@stagecue/event-protocol'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { createLogger } from '../logger.ts'
import { startEngineServer, type EngineServer } from './engine-server.ts'
import { createStaticHandler } from './static-files.ts'

let site: string
let server: EngineServer | null = null

beforeAll(() => {
  const parent = mkdtempSync(path.join(tmpdir(), 'stagecue-static-'))
  site = path.join(parent, 'dist')
  mkdirSync(path.join(site, 'assets'), { recursive: true })
  writeFileSync(path.join(site, 'index.html'), '<!doctype html><title>screen</title>')
  writeFileSync(path.join(site, 'assets', 'app-1234.js'), 'console.log(1)')
  writeFileSync(path.join(parent, 'secret.txt'), 'outside the site')
})

afterAll(() => {
  rmSync(path.dirname(site), { recursive: true, force: true })
})

afterEach(async () => {
  await server?.close()
  server = null
})

async function start(root: string): Promise<EngineServer> {
  server = await startEngineServer({
    host: '127.0.0.1',
    port: 0,
    logger: createLogger('silent'),
    instanceId: crypto.randomUUID(),
    startedAt: Date.now(),
    schemaVersion: 1,
    httpHandler: createStaticHandler(root),
  })
  return server
}

/** Raw request, so paths like /../ reach the server unnormalised. */
function get(engine: EngineServer, rawPath: string, method = 'GET') {
  return new Promise<{
    status: number
    type: string | undefined
    body: string
    cache: string | undefined
  }>((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port: engine.port, path: rawPath, method },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => (body += chunk))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            type: res.headers['content-type'],
            body,
            cache: res.headers['cache-control'],
          }),
        )
      },
    )
    req.on('error', reject)
    req.end()
  })
}

describe('screen page server', () => {
  it('serves the page at / and assets with long caching', async () => {
    const engine = await start(site)
    const page = await get(engine, '/')
    expect(page).toMatchObject({ status: 200, type: 'text/html; charset=utf-8', cache: 'no-cache' })
    expect(page.body).toContain('<title>screen</title>')

    const asset = await get(engine, '/assets/app-1234.js')
    expect(asset).toMatchObject({ status: 200, type: 'text/javascript; charset=utf-8' })
    expect(asset.cache).toContain('immutable')
  })

  it.each([
    '/../secret.txt',
    '/%2e%2e/secret.txt',
    '/assets/..%2F..%2Fsecret.txt',
    '/index.html%00.js',
  ])('refuses to serve files outside the page: %s', async (rawPath) => {
    const response = await get(await start(site), rawPath)
    expect(response.status).toBe(404)
    expect(response.body).not.toContain('outside the site')
  })

  it('answers unknown paths with 404 and other methods with 405', async () => {
    const engine = await start(site)
    expect((await get(engine, '/nope.js')).status).toBe(404)
    expect((await get(engine, '/assets')).status).toBe(404)
    expect((await get(engine, '/', 'POST')).status).toBe(405)
    expect((await get(engine, '/', 'HEAD')).status).toBe(200)
  })

  it('explains when the page has not been built', async () => {
    const response = await get(await start(path.join(site, 'missing')), '/')
    expect(response.status).toBe(503)
    expect(response.body).toContain('pnpm --filter @stagecue/screen build')
  })

  it('still accepts WebSocket clients on the same port', async () => {
    const engine = await start(site)
    const socket = new WebSocket(`ws://127.0.0.1:${engine.port}`)
    const welcome = await new Promise<string>((resolve, reject) => {
      socket.on('open', () =>
        socket.send(
          JSON.stringify({
            v: PROTOCOL_VERSION,
            type: 'hello',
            seq: 1,
            sentAt: Date.now(),
            payload: { clientId: crypto.randomUUID(), role: 'display', name: 'TV' },
          }),
        ),
      )
      socket.on('message', (data) => resolve(String(data)))
      socket.on('error', reject)
    })
    expect(JSON.parse(welcome).type).toBe('welcome')
    socket.terminate()
  })
})
