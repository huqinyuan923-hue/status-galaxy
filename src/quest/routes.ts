/**
 * Galaxy Quest API：
 *   POST /api/quest/begin {name}                        → 注册探索者 {explorerId, name}
 *   GET  /api/quest/board?explorerId=                   → 任务列表+完成态+我的星尘/等级+排行榜
 *   POST /api/quest/claim {explorerId, questId}         → 领取奖励（幂等：重复领取 409）
 *   GET  /api/quest/leaderboard                         → 前 20 探索者
 * 信任模型：善意游戏，claim 不做站点回执强校验（QUEST-DESIGN.md 非目标）。
 */
import { Hono } from 'hono';
import type { Env } from '../index';
import { QUESTS, isSupernova, levelOf, levelProgress, validateClaim, validateName } from './catalog';

// 挂载于 app（basePath /api）下的 /quest → 最终 /api/quest/*。
// 注意：子 app 不要再设 basePath——嵌套 basePath + app.route 在 Hono 中不匹配（踩坑实录）
export const questRoute = new Hono<{ Bindings: Env }>();

const nowIso = () => new Date().toISOString();

questRoute.post('/begin', async (c) => {
  let name = '';
  try {
    const body = await c.req.json<{ name?: string }>();
    name = String(body?.name ?? '');
  } catch {
    return c.json({ error: '需要 JSON body {name}' }, 400);
  }
  const check = validateName(name);
  if (!check.ok) return c.json({ error: check.reason }, 400);

  const db = c.env.DB;
  const exists = await db.prepare('SELECT id FROM explorers WHERE name = ?1').bind(check.name).first<{ id: number }>();
  if (exists) return c.json({ explorerId: exists.id, name: check.name, returning: true });

  const ts = nowIso();
  const row = await db
    .prepare('INSERT INTO explorers (name, dust, level, created_at, last_seen) VALUES (?1, 0, 1, ?2, ?3) RETURNING id')
    .bind(check.name, ts, ts)
    .first<{ id: number }>();
  if (!row) return c.json({ error: '注册失败' }, 500);
  await db.prepare('INSERT INTO quest_events (explorer_id, ts, text) VALUES (?1, ?2, ?3)')
    .bind(row.id, ts, '启程：成为茶镇星系的探索者').run();
  return c.json({ explorerId: row.id, name: check.name, returning: false });
});

questRoute.get('/board', async (c) => {
  const explorerId = Number(c.req.query('explorerId') ?? 0);
  const db = c.env.DB;

  const quests = QUESTS.map((q) => ({ id: q.id, title: q.title, desc: q.desc, dust: q.dust, site: q.site, url: q.url, hidden: q.hidden ?? false }));

  if (!explorerId) {
    return c.json({ quests, me: null });
  }
  const me = await db
    .prepare('SELECT id, name, dust, level FROM explorers WHERE id = ?1')
    .bind(explorerId)
    .first<{ id: number; name: string; dust: number; level: number }>();
  if (!me) return c.json({ error: '探索者不存在' }, 404);

  const doneRows = await db
    .prepare('SELECT quest_id, done_at FROM quests WHERE explorer_id = ?1')
    .bind(explorerId)
    .all<{ quest_id: string; done_at: string }>();
  const doneMap = new Map((doneRows.results ?? []).map((r) => [r.quest_id, r.done_at]));

  await db.prepare('UPDATE explorers SET last_seen = ?1 WHERE id = ?2').bind(nowIso(), explorerId).run();

  const progress = levelProgress(me.dust);
  return c.json({
    quests: quests.map((q) => ({ ...q, done: doneMap.has(q.id), doneAt: doneMap.get(q.id) ?? null })),
    me: {
      id: me.id,
      name: me.name,
      dust: me.dust,
      level: progress.level,
      levelCur: progress.cur,
      levelNext: progress.next,
      supernova: isSupernova(new Set(doneMap.keys())),
      doneCount: doneMap.size,
    },
  });
});

questRoute.post('/claim', async (c) => {
  let explorerId = 0;
  let questId = '';
  try {
    const body = await c.req.json<{ explorerId?: number; questId?: string }>();
    explorerId = Number(body?.explorerId ?? 0);
    questId = String(body?.questId ?? '');
  } catch {
    return c.json({ error: '需要 JSON body' }, 400);
  }
  const check = validateClaim(questId);
  if (!check.ok) return c.json({ error: check.reason }, 400);

  const db = c.env.DB;
  const me = await db
    .prepare('SELECT id, name, dust FROM explorers WHERE id = ?1')
    .bind(explorerId)
    .first<{ id: number; name: string; dust: number }>();
  if (!me) return c.json({ error: '探索者不存在' }, 404);

  const already = await db
    .prepare('SELECT done_at FROM quests WHERE explorer_id = ?1 AND quest_id = ?2')
    .bind(explorerId, questId)
    .first<{ done_at: string }>();
  if (already) {
    return c.json({ error: '任务已完成过', duplicate: true, doneAt: already.done_at }, 409);
  }

  const quest = check.quest;
  const ts = nowIso();
  const newDust = me.dust + quest.dust;
  const newLevel = levelOf(newDust);
  const leveledUp = newLevel > levelOf(me.dust);

  await db.batch([
    db.prepare('INSERT INTO quests (explorer_id, quest_id, done_at) VALUES (?1, ?2, ?3)').bind(explorerId, questId, ts),
    db.prepare('UPDATE explorers SET dust = ?1, level = ?2, last_seen = ?3 WHERE id = ?4').bind(newDust, newLevel, ts, explorerId),
    db.prepare('INSERT INTO quest_events (explorer_id, ts, text) VALUES (?1, ?2, ?3)').bind(
      explorerId, ts, `完成任务「${quest.title}」 +${quest.dust} 星尘`
    ),
  ]);

  const supernova = isSupernova(
    new Set(
      (await db.prepare('SELECT quest_id FROM quests WHERE explorer_id = ?1').bind(explorerId).all<{ quest_id: string }>()).results?.map((r) => r.quest_id) ?? []
    ).add(questId)
  );

  return c.json({
    ok: true,
    dust: newDust,
    gained: quest.dust,
    level: newLevel,
    leveledUp,
    supernova,
  });
});

questRoute.get('/leaderboard', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT name, dust, level FROM explorers ORDER BY dust DESC, last_seen DESC LIMIT 20')
    .all<{ name: string; dust: number; level: number }>();
  return c.json({ leaders: rows.results ?? [] });
});
