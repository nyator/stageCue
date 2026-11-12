import { build } from 'esbuild'

/*
 * Bundles the engine into one file, dist/engine.mjs, for the packaged app: the
 * desktop app starts it in a background process (apps/desktop/src/main/engine-process.ts).
 * While developing, `pnpm dev` still runs src/index.ts directly.
 *
 * Run with `pnpm --filter @stagecue/engine build`.
 */

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/engine.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  // ws loads these optional native speedups only if present; it works without them.
  external: ['bufferutil', 'utf-8-validate'],
  // Bundled CommonJS (ws) calls require(); give the ES module one.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
})
