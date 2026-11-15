import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    // The Gemini route lives in the edge worker, not in Vite. Proxy it to the
    // deployed origin in dev so the coach-read card works on localhost too;
    // the Origin header is rewritten because the worker only answers its own.
    proxy: {
      '/api': {
        target: 'https://site-2773a397b7f34300a1be984c4e3c13dd.freebuff.page',
        changeOrigin: true,
        secure: true,
        configure: (proxy: any) => {
          proxy.on('proxyReq', (proxyReq: any) => {
            proxyReq.setHeader('origin', 'https://site-2773a397b7f34300a1be984c4e3c13dd.freebuff.page');
          });
        },
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        rtp: 'rtp.html',
      },
    },
  },
});
