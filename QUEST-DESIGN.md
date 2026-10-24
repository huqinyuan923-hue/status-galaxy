# Galaxy Quest（星图探索计划）——游戏化设计定案

> 一句话：status.adcakeyuan.top 变成游戏主界面。访客是「探索者」，飞船在星图里飞，访问 12 个站点完成任务赚星尘，点亮行星、升级、解锁隐藏内容。

## 核心循环

```
接任务 → 去对应站点完成动作 → 站点回执（token 校验）→ 星尘入账
→ 星图反馈（行星点亮/飞船光尾/等级特效）→ 解锁下一环任务 + 暗星探测
```

## 经济系统

- 货币：星尘（stardust），整数
- 等级：探索者等级 = f(累计星尘)，LV1 起，每级门槛递增（100/250/450/700/1000…）
- 奖励表（初版，数据驱动可调）：

| 任务 | 验证 | 星尘 |
|---|---|---|
| 初来乍到（访问博客） | 博客站回执 | 10 |
| 打开星图本身 | 自动（首次进入） | 5 |
| 喝一杯（Toolbox 用工具） | toolbox 回执 | 15 |
| 街机一局（arcade 打开任意游戏） | arcade 回执 | 15 |
| 观星者（小镇和 3 个居民说话） | town 回执（数 chat） | 30 |
| 打工人（PomoBox 完成番茄钟） | pomo 回执 | 20 |
| 考古学家（找到最老仓库） | github guide 站回执 | 25 |
| 拆弹专家（CET4 答对 10 题） | cet4 回执 | 40 |
| 记账员（Treasury 记一笔） | treasury 回执 | 20 |
| 订阅者（RSS 添加订阅） | rss 回执 | 25 |
| FileKit 魔术师（处理一个文件） | filekit 回执 | 15 |
| 隐藏：镇长的秘密（问出居民彩蛋） | town 回执（特殊码） | 50 |

- 全收集（12 主线任务）→ 「超新星」成就：全屏特效 + 称号「星系开拓者」写进 HUD

## 技术设计

### 后端（Worker，复用 galaxy 仓库）
- D1 新表：`explorers(id, name UNIQUE, dust, level, created_at, last_seen)` / `quests(explorer_id, quest_id, done_at)` / `events(explorer_id, ts, text)`（动态流水）
- `POST /api/quest/claim {explorerId, name, questId, receipt}` → 校验 receipt（HMAC(questId+explorerId, SECRET)）→ 发星尘 → 返回 {dust, level, unlocked}
- `GET /api/quest/board?explorerId=` → 任务列表 + 完成态 + 排行榜（前 20 探索者）
- `POST /api/quest/begin {name}` → 注册探索者，返回 explorerId
- receipt 签发：各站点没有 Worker 改造的（静态站）用「回跳 URL 参数 + 星图端点二次确认访问」降级方案：站点任务页放一个「任务完成」按钮，跳 `status.adcakeyuan.top/?claim=<questId>&t=<timestamp>`，星图弹回执（同一浏览器会话即视为完成——防作弊弱但这是善意游戏，够用）。有后端的站（town/pomo/rss/cet4/treasury）后续可升级 HMAC。
- Worker secret：`QUEST_SECRET`

### 前端（three.js 场景扩展）
- 飞船实体：小型三角舰（锥体+光尾），键位 WASD/方向键移动 + 点击目的地飞行（移动端），惯性+缓动
- 任务面板：HUD 右下「任务日志」按钮 → 侧栏任务列表（可领取/已完成✓/奖励数）
- 完成反馈：星尘 +N 飘字、对应行星闪光、飞船光尾变色
- 暗星探测：LV3 接近暗星 → 显示名称与「施工中」信息
- 超新星：全收集 → 一次全屏白光 + 粒子爆发 + HUD 称号
- 探索者身份：localStorage 存 explorerId+name；改名不做（简单）

## 范围（单会话完成）

1. D1 迁移（3 表）+ quest API（begin/claim/board）+ 奖励表数据驱动
2. 前端：飞船控制、任务面板、领取流、视觉反馈、排行榜入口
3. 博客/ toolbox / guide 等静态站任务页：加「任务完成」回跳按钮（只改 3 个站作为首发任务线，其余站点任务用「访问即完成」在星图端验证 referer 不可行 → 首发就 3+3 个：blog/toolbox/guide/arcade/town/pomo，arcade 与 town 有现成 UI 能加按钮）
4. 测试（经济系统纯函数 + claim 幂等/防重）+ 部署 status.adcakeyuan.top

## 非目标（防膨胀）

- 不做防作弊强校验（善意游戏，回执机制够用）
- 不做登录系统（匿名探索者，localStorage）
- 不做星尘交易/转账
