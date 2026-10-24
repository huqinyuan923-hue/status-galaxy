-- Galaxy Quest：探索者 / 任务完成记录 / 事件流水
CREATE TABLE IF NOT EXISTS explorers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  dust INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quests (
  explorer_id INTEGER NOT NULL,
  quest_id TEXT NOT NULL,
  done_at TEXT NOT NULL,
  PRIMARY KEY (explorer_id, quest_id)
);

CREATE TABLE IF NOT EXISTS quest_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  explorer_id INTEGER NOT NULL,
  ts TEXT NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qevents_explorer ON quest_events(explorer_id);
