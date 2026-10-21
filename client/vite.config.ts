import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.REFLOOR_API_URL ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { proxy: { '/api': { target: apiTarget, ws: true } } },
  preview: { proxy: { '/api': { target: apiTarget, ws: true } } },
  build: { manifest: true, chunkSizeWarningLimit: 1200 },
});
