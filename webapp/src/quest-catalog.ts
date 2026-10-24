/** 前端兜底任务目录（离线降级渲染用；与 Worker src/quest/catalog.ts 同源维护） */
export interface QuestCatalogEntry {
  id: string;
  title: string;
  desc: string;
  dust: number;
  site: string;
  url: string;
  hidden?: boolean;
}

export const QUEST_CATALOG: QuestCatalogEntry[] = [
  { id: 'blog-visit', title: '初来乍到', desc: '去博客看看这片星系的原点', dust: 10, site: 'blog', url: 'https://adcakeyuan.top' },
  { id: 'toolbox-use', title: '喝一杯再走', desc: '去工具箱用一次任意工具（比如 JSON 格式化）', dust: 15, site: 'toolbox', url: 'https://toolbox.adcakeyuan.top' },
  { id: 'arcade-play', title: '投币一局', desc: '去街机厅打开任意一款游戏玩一局', dust: 15, site: 'arcade', url: 'https://arcade.adcakeyuan.top' },
  { id: 'town-chat', title: '观星者', desc: '去 AI 小镇和 3 位不同居民说话（他们会记住你）', dust: 30, site: 'town', url: 'https://town.adcakeyuan.top' },
  { id: 'pomo-focus', title: '打工人', desc: '在番茄钟完成一次专注', dust: 20, site: 'pomo', url: 'https://pomo.adcakeyuan.top' },
  { id: 'guide-read', title: '考古学家', desc: '去 GitHub 新手村考古：Git 和 GitHub 到底有什么区别？', dust: 25, site: 'guide', url: 'https://guide.adcakeyuan.top' },
  { id: 'cet4-quiz', title: '拆弹专家', desc: '去四级题库答对 10 道题', dust: 40, site: 'cet4', url: 'https://cet4.adcakeyuan.top' },
  { id: 'treasury-log', title: '记账员', desc: '在记账应用里记一笔今日开销（私有应用，首次需注册）', dust: 20, site: 'treasury', url: 'https://treasury.adcakeyuan.top' },
  { id: 'rss-sub', title: '订阅者', desc: '在 RSS 阅读器添加一个订阅源（私有应用，首次需注册）', dust: 25, site: 'rss', url: 'https://rss.adcakeyuan.top' },
  { id: 'filekit-magic', title: '文件魔术师', desc: '用 FileKit 本地处理一个文件（不上传的那种）', dust: 15, site: 'filekit', url: 'https://filekit.adcakeyuan.top' },
  { id: 'deeplearn-learn', title: '学习者', desc: '去深学平台看完一节课', dust: 20, site: 'deeplearn', url: 'https://deeplearn.adcakeyuan.top' },
  { id: 'wrapped-gen', title: '占星师', desc: '在 GitHub Wrapped 生成一份年度报告', dust: 25, site: 'wrapped', url: 'https://wrapped.adcakeyuan.top' },
  { id: 'secret-mayor', title: '镇长的秘密', desc: '在 AI 小镇问出「阿茶」最大的心愿（隐藏任务）', dust: 50, site: 'town', url: 'https://town.adcakeyuan.top', hidden: true },
];
