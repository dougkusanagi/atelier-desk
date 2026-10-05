import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5174),
    strictPort: true,
    proxy: {
      '/api': process.env.API_ORIGIN ?? 'http://127.0.0.1:3001',
      '/collab': {
        target: (process.env.API_ORIGIN ?? 'http://127.0.0.1:3001').replace('http', 'ws'),
        ws: true,
      },
    },
  },
  build: { target: 'es2022' },
});
