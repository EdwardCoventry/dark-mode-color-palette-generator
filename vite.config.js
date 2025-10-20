import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        // Use the original basename as the key to keep dist/color-palette-generator.html
        'color-palette-generator': resolve(__dirname, 'color-palette-generator.html'),
        embed: resolve(__dirname, 'embed.html'),
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
