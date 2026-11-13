// Launcher for the pace redesign feasibility probe (docs/specs/m1-pace-redesign.md, Step 1).
// Not part of npm test. Same loader as scripts/batch.mjs: Vite compiles the TypeScript in memory.
//   node scripts/paceProbe.mjs [--settings baseline,a,b,c,d] [--p10 SETTING] [--refit] [--tuning FILE]
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});
let code = 1;
try {
  const cli = await server.ssrLoadModule('/scripts/paceProbe.ts');
  code = await cli.main(process.argv.slice(2));
} catch (err) {
  console.error(err instanceof Error ? err.stack : String(err));
} finally {
  await server.close();
}
process.exitCode = code;
