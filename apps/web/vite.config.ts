import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { offlineShell } from './build/offline';
const proxy = {
  '/api': process.env.API_ORIGIN ?? 'http://127.0.0.1:3001',
  '/collab': {
    target: (process.env.API_ORIGIN ?? 'http://127.0.0.1:3001').replace('http', 'ws'),
    ws: true,
  },
};

export default defineConfig({
  plugins: [react(), offlineShell()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5174),
    strictPort: true,
    proxy,
  },
  preview: { host: '0.0.0.0', port: Number(process.env.WEB_PORT ?? 5174), strictPort: true, proxy },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/tiptap|prosemirror/.test(id)) return 'editor';
          if (/yjs|lib0|y-protocols|y-indexeddb/.test(id)) return 'collaboration';
          if (/motion|framer/.test(id)) return 'motion';
          if (/react-dom|react-router|\/react\//.test(id)) return 'react';
        },
      },
    },
  },
});
