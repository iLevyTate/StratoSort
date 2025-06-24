// DISABLED: Using Webpack as primary build system
// Keeping this file for potential future migration to Vite

/*
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Build configuration
  build: {
    outDir: 'dist/renderer',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    // Target modern browsers for better performance
    target: 'esnext',
    // Generate source maps for development
    sourcemap: process.env.NODE_ENV === 'development',
  },
  
  // Development server configuration
  server: {
    port: 3000,
    host: true,
    // Enable hot module replacement
    hmr: {
      port: 3001,
    },
  },
  
  // Path resolution
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  
  // Environment variables
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  
  // CSS configuration
  css: {
    postcss: './postcss.config.js',
  },
  
  // Enable support for Electron
  base: './',
  
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
});
*/

// Placeholder export to maintain valid TypeScript
export default {}; 