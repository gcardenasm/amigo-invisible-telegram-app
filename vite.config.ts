import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
    target: 'es2022'
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/webhook': 'http://127.0.0.1:8787'
    }
  }
});
