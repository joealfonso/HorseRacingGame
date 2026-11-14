// Launcher for the B3 betting day harness (scripts/betHarnessCli.ts). Like scripts/batch.mjs, Vite's
// loader compiles the TypeScript in memory. `--worker` runs this process as one sim worker.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});
let code = 1;
try {
  const cli = await server.ssrLoadModule('/scripts/betHarnessCli.ts');
  if (process.argv[2] === '--worker') {
    await cli.worker();
    code = 0;
  } else {
    code = await cli.main(process.argv.slice(2), fileURLToPath(import.meta.url));
  }
} catch (err) {
  console.error(err instanceof Error ? err.stack : String(err));
} finally {
  await server.close();
}
process.exitCode = code;
