import { createApp } from './app';
try {
  process.loadEnvFile('../../.env');
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
}
const { app } = await createApp({ logger: true, settings: { workerEnabled: true } });
await app.ready();
const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
