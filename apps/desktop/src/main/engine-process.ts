import { app, utilityProcess, type UtilityProcess } from 'electron'
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import path from 'node:path'

/*
 * Runs the StageCue engine inside the app, so the media team never starts
 * anything by hand. The packaged app carries the bundled engine
 * (apps/engine/dist/engine.mjs, from `pnpm --filter @stagecue/engine build`) and
 * starts it in a background process when the app opens, restarts it if it stops,
 * and stops it when the app quits.
 *
 * While developing, `pnpm dev` runs the engine itself, so the app only starts one
 * when packaged, or when STAGECUE_START_ENGINE=1.
 */

const RESTART_MIN_MS = 1_000
const RESTART_MAX_MS = 10_000
/** An engine that ran this long counts as healthy: the next restart starts fast again. */
const HEALTHY_MS = 30_000

export function shouldStartEngine(): boolean {
  return app.isPackaged || process.env.STAGECUE_START_ENGINE === '1'
}

function engineEntry(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'engine', 'engine.mjs')
    : path.resolve(app.getAppPath(), '../engine/dist/engine.mjs')
}

function screenDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'screen')
    : path.resolve(app.getAppPath(), '../screen/dist')
}

export class EngineProcess {
  private child: UtilityProcess | null = null
  private log: WriteStream | null = null
  private stopping = false
  private restartMs = RESTART_MIN_MS
  private restartTimer: NodeJS.Timeout | null = null

  start(): void {
    this.stopping = false
    const logs = app.getPath('logs')
    mkdirSync(logs, { recursive: true })
    this.log ??= createWriteStream(path.join(logs, 'engine.log'), { flags: 'a' })
    this.spawn()
  }

  private spawn(): void {
    const startedAt = Date.now()
    const child = utilityProcess.fork(engineEntry(), [], {
      serviceName: 'StageCue Engine',
      stdio: 'pipe',
      env: {
        ...process.env,
        // Saved settings live with the app's other data, e.g. ~/Library/Application Support/StageCue.
        STAGECUE_DATA_DIR: path.join(app.getPath('userData'), 'engine'),
        STAGECUE_SCREEN_DIR: screenDir(),
      },
    })
    this.child = child
    child.stdout?.on('data', (chunk: Buffer) => this.log?.write(chunk))
    child.stderr?.on('data', (chunk: Buffer) => this.log?.write(chunk))
    this.write(`StageCue engine starting (${engineEntry()})`)

    child.once('exit', (code) => {
      if (this.child === child) this.child = null
      if (this.stopping) return
      this.write(`StageCue engine stopped (exit code ${code}); starting it again`)
      if (Date.now() - startedAt > HEALTHY_MS) this.restartMs = RESTART_MIN_MS
      this.restartTimer = setTimeout(() => this.spawn(), this.restartMs)
      this.restartMs = Math.min(RESTART_MAX_MS, this.restartMs * 2)
    })
  }

  private write(line: string): void {
    this.log?.write(`${new Date().toISOString()} APP   ${line}\n`)
  }

  stop(): void {
    this.stopping = true
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    this.child?.kill()
    this.child = null
  }
}
