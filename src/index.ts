import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { collectSnapshot, type GalaxySnapshot } from './collector';

/**
 * 星图 API：
 *   GET  /api/galaxy        → { latest, history[] }（最新快照 + 最近 24 份精简历史）
 *   POST /api/collect       （Bearer ADMIN_TOKEN，手动触发采集）
 *   GET  /api/health
 * Cron 每 15 分钟自动 collectSnapshot → snapshots 表（保留最近 200 份）。
 */
export interface Env {
  DB: D1Database;
  ADMIN_TOKEN?: string;
  GITHUB_TOKEN?: string;
}

const app = new Hono<{ Bindings: Env }>().basePath('/api');

async function requireAdmin(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  const token = c.env.ADMIN_TOKEN;
  if (!token) return c.json({ error: 'ADMIN_TOKEN not configured' }, 500);
  if ((c.req.header('Authorization') ?? '') !== `Bearer ${token}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}

async function saveSnapshot(db: D1Database, snap: GalaxySnapshot): Promise<void> {
  await db
    .prepare('INSERT INTO snapshots (ts, payload_json) VALUES (?1, ?2)')
    .bind(snap.ts, JSON.stringify(snap))
    .run();
  // 只留最近 200 份
  await db
    .prepare(
      `DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 200)`
    )
    .run();
}

interface SnapshotRow {
  id: number;
  ts: string;
  payload_json: string;
}

app.get('/health', (c) => c.json({ ok: true }));

app.get('/galaxy', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT id, ts, payload_json FROM snapshots ORDER BY id DESC LIMIT 25')
    .all<SnapshotRow>();
  const list = rows.results ?? [];
  if (list.length === 0) return c.json({ latest: null, history: [] });
  const latest = JSON.parse(list[0].payload_json) as GalaxySnapshot;
  // 精简历史：每份只留 ts + 各站点 alive/latency（前端画趋势拖尾）
  const history = list.map((r) => {
    const p = JSON.parse(r.payload_json) as GalaxySnapshot;
    return {
      ts: r.ts,
      sites: p.sites.map((s) => ({ id: s.id, alive: s.alive, latencyMs: s.latencyMs })),
      townTick: p.town?.tickCount ?? null,
    };
  });
  return c.json({ latest, history });
});

app.use('/collect', requireAdmin);
app.post('/collect', async (c) => {
  try {
    const snap = await collectSnapshot(fetch, c.env.GITHUB_TOKEN);
    await saveSnapshot(c.env.DB, snap);
    return c.json({ ok: true, ts: snap.ts, sites: snap.sites.length, repos: snap.repos.length });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

app.onError((err, c) => {
  console.error('[api] unhandled:', err);
  return c.json({ error: 'internal error' }, 500);
});

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          const snap = await collectSnapshot(fetch, env.GITHUB_TOKEN);
          await saveSnapshot(env.DB, snap);
        } catch (err) {
          console.error('[cron] collect failed:', (err as Error).message);
        }
      })()
    );
  },
};
