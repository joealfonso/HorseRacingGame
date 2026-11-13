// Launcher for `npm run ship:check`, the same way as batch.mjs: Vite's own loader
// compiles scripts/shipCheck.ts in memory. Nothing is written to disk.
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});
let code = 1;
try {
  const cli = await server.ssrLoadModule('/scripts/shipCheck.ts');
  code = cli.main();
} catch (err) {
  console.error(err instanceof Error ? err.stack : String(err));
} finally {
  await server.close();
}
process.exitCode = code;
