import { checkAllExpirations } from '../src/database/db.archives.js';

export default {
  async scheduled(event, env) {
    const results = await checkAllExpirations(env.DB);
    console.log(JSON.stringify({ event: 'gdpr-expiration', cron: event.cron, results }));
  },
};
