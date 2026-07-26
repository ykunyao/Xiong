import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ['@xiong/core', '@xiong/db'],
        include: ['better-sqlite3'],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: 'index.js',
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
  },
});
