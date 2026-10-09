import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = Number(process.env.MF_API_PORT || 3011);
const webPort = Number(process.env.MF_WEB_PORT || 5178);

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:' + apiPort,
      '/webhook': 'http://127.0.0.1:' + apiPort,
      '/ws': {
        target: 'ws://127.0.0.1:' + (apiPort + 50),
        ws: true,
        changeOrigin: false
      }
    }
  },
  build: { outDir: 'dist' }
});