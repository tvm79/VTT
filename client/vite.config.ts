import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    esbuildOptions: {
      define: {
        'process.env.NODE_ENV': '"development"',
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@babylonjs')) {
            return 'babylon';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Proxy server-managed asset folders, but avoid catching all /assets
      // so Vite can still serve client imports from client/assets.
      '/assets/maps': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/assets/tokens': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/assets/portraits': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/assets/items': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },

      '/assets/handouts': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/assets/_thumbs': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
});
