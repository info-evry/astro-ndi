import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  base: '/nuit-de-linfo',
  adapter: cloudflare({
    platformProxy: {
      enabled: true
    }
  }),
  compressHTML: true,
  vite: {
    ssr: {
      external: ['node:async_hooks']
    },
    build: {
      minify: 'esbuild',
      cssMinify: true,
      rollupOptions: {
        output: {
          manualChunks: undefined
        }
      }
    }
  }
});
