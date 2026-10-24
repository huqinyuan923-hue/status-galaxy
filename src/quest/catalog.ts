/**
 * Galaxy Quest 经济系统（纯函数，可离线测试）。
 * 任务目录 / 星尘等级 / 领取幂等规则。奖励数值调整只改这里。
 */

export interface QuestDef {
  id: string;
  title: string;
  desc: string;
  dust: number;
  /** 完成入口站点（前端任务面板跳转用） */
  site: string;
  url: string;
  hidden?: boolean;
}

export const QUESTS: QuestDef[] = [
  { id: 'blog-visit', title: '初来乍到', desc: '去博客看看这片星系的原点', dust: 10, site: 'blog', url: 'https://adcakeyuan.top' },
  { id: 'toolbox-use', title: '喝一杯再走', desc: '去工具箱用一次任意工具（比如 JSON 格式化）', dust: 15, site: 'toolbox', url: 'https://toolbox.adcakeyuan.top' },
  { id: 'arcade-play', title: '投币一局', desc: '去街机厅打开任意一款游戏玩一局', dust: 15, site: 'arcade', url: 'https://arcade.adcakeyuan.top' },
  { id: 'town-chat', title: '观星者', desc: '去 AI 小镇和 3 位不同居民说话（他们会记住你）', dust: 30, site: 'town', url: 'https://town.adcakeyuan.top' },
  { id: 'pomo-focus', title: '打工人', desc: '在番茄钟完成一次专注', dust: 20, site: 'pomo', url: 'https://pomo.adcakeyuan.top' },
  { id: 'guide-read', title: '考古学家', desc: '去 GitHub 新手村考古：Git 和 GitHub 到底有什么区别？', dust: 25, site: 'guide', url: 'https://guide.adcakeyuan.top' },
  { id: 'cet4-quiz', title: '拆弹专家', desc: '去四级题库答对 10 道题', dust: 40, site: 'cet4', url: 'https://cet4.adcakeyuan.top' },
  { id: 'treasury-log', title: '记账员', desc: '在记账应用里记一笔今日开销', dust: 20, site: 'treasury', url: 'https://treasury.adcakeyuan.top' },
  { id: 'rss-sub', title: '订阅者', desc: '在 RSS 阅读器添加一个订阅源', dust: 25, site: 'rss', url: 'https://rss.adcakeyuan.top' },
  { id: 'filekit-magic', title: '文件魔术师', desc: '用 FileKit 本地处理一个文件（不上传的那种）', dust: 15, site: 'filekit', url: 'https://filekit.adcakeyuan.top' },
  { id: 'deeplearn-learn', title: '学习者', desc: '去深学平台看完一节课', dust: 20, site: 'deeplearn', url: 'https://deeplearn.adcakeyuan.top' },
  { id: 'wrapped-gen', title: '占星师', desc: '在 GitHub Wrapped 生成一份年度报告', dust: 25, site: 'wrapped', url: 'https://wrapped.adcakeyuan.top' },
  { id: 'secret-mayor', title: '镇长的秘密', desc: '在 AI 小镇问出「阿茶」最大的心愿（隐藏任务）', dust: 50, site: 'town', url: 'https://town.adcakeyuan.top', hidden: true },
];

export const QUEST_BY_ID = new Map(QUESTS.map((q) => [q.id, q]));

/** 等级门槛：累计星尘达到即升级。LV1 起始。 */
export const LEVEL_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500];

export function levelOf(totalDust: number): number {
  let lv = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalDust >= LEVEL_THRESHOLDS[i]) lv = i + 1;
  }
  return lv;
}

export function levelProgress(totalDust: number): { level: number; cur: number; next: number | null } {
  const level = levelOf(totalDust);
  const cur = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const next = LEVEL_THRESHOLDS[level] ?? null;
  return { level, cur, next };
}

/** 全主线完成 → 超新星成就 */
export function isSupernova(doneQuestIds: Set<string>): boolean {
  return QUESTS.filter((q) => !q.hidden).every((q) => doneQuestIds.has(q.id));
}

/** 领取校验：任务存在、未重复领取（重复领取由调用方查表后判定）。 */
export function validateClaim(questId: string): { ok: true; quest: QuestDef } | { ok: false; reason: string } {
  const quest = QUEST_BY_ID.get(questId);
  if (!quest) return { ok: false, reason: `未知任务: ${questId}` };
  return { ok: true, quest };
}

/** 探索者名校验：2-16 字符，去首尾空格，允许中英文/数字/下划线。 */
export function validateName(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  const name = raw.trim();
  if (name.length < 2 || name.length > 16) return { ok: false, reason: '名字需要 2-16 个字符' };
  if (!/^[\p{Script=Han}\w\- ]+$/u.test(name)) return { ok: false, reason: '名字含不支持字符' };
  return { ok: true, name };
}
