import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, /api is proxied to the FastAPI server. In Docker, nginx does the same.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    proxy: { '/api': 'http://localhost:8001' },
  },
});
