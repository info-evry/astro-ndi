import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          d1Databases: ['DB'],
          kvNamespaces: ['CONFIG'],
          bindings: {
            ADMIN_EMAIL: 'test@example.com',
            REPLY_TO_EMAIL: 'reply@example.com',
            MAX_TEAM_SIZE: '15',
            MAX_TOTAL_PARTICIPANTS: '200',
            MIN_TEAM_SIZE: '1',
            ADMIN_TOKEN: 'test-admin-token'
          }
        }
      }
    }
  }
});
