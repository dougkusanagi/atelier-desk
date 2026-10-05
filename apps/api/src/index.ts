import { createApp } from './app';
const { app, settings } = await createApp({ logger: true });
await app.listen({ port: settings.port, host: '0.0.0.0' });
const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
