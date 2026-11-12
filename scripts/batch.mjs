// Launcher for `npm run batch`. Node cannot run this repo's TypeScript as is, so Vite's own
// loader (already a dependency) compiles scripts/batchCli.ts in memory. Nothing is written to disk.
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});
let code = 1;
try {
  const cli = await server.ssrLoadModule('/scripts/batchCli.ts');
  code = await cli.main(process.argv.slice(2));
} catch (err) {
  console.error(err instanceof Error ? err.stack : String(err));
} finally {
  await server.close();
}
process.exitCode = code;
