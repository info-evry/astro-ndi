/// <reference path="../.astro/types.d.ts" />

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

interface Env {
  DB: D1Database;
  CONFIG: KVNamespace;
  ADMIN_TOKEN?: string;
  ADMIN_EMAIL: string;
  REPLY_TO_EMAIL: string;
  MAX_TEAM_SIZE: string;
  MAX_TOTAL_PARTICIPANTS: string;
  MIN_TEAM_SIZE: string;
}

declare namespace App {
  interface Locals extends Runtime {}
}
