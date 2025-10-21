import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/',
  build: {
    assetsDir: 'apps/color-palette-generator/assets',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        'apps/color-palette-generator/index': resolve(__dirname, 'color-palette-generator.html'),
        'embed/index': resolve(__dirname, 'embed.html'),
      }
    }
  },
  server: {
    port: 5175,
    strictPort: true,
    open: false
  },
  preview: {
    port: 5175,
    strictPort: true
  }
});
