import { defineConfig } from 'vite';

export default defineConfig({
  // For GitHub Pages: set base to /repo-name/ so assets load. Local dev uses '/' by default.
  base: process.env.VITE_BASE_PATH ?? '/',
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: true,
    outDir: 'dist',
  },
});
