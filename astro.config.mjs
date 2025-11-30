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
  vite: {
    ssr: {
      external: ['node:async_hooks']
    }
  }
});
