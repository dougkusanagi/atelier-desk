import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts', 'src/worker.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  sourcemap: true,
  noExternal: ['@atelier/domain'],
  clean: true,
  onSuccess: 'cp src/*.sql dist/',
});
