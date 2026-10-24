/**
 * 星图天体目录（唯一事实源）：16 个天体。
 * kind: sun=中心恒星（博客）| planet=带域名行星 | dark=暗星（仅仓库遥测，无公网域名）
 * 特殊：AI 小镇带居民卫星（前端读 town 遥测画 12 颗小卫星）。
 */
export type BodyKind = 'sun' | 'planet' | 'dark';

export interface CelestialBody {
  id: string;
  name: string;
  desc: string;
  url: string | null;
  repo: string | null; // huqinyuan923-hue/<name>
  kind: BodyKind;
  hue: number; // 0-360，行星主色
  /** 特殊探针 */
  probe?: 'town';
}

export const GH_USER = 'huqinyuan923-hue';

export const BODIES: CelestialBody[] = [
  {
    id: 'blog',
    name: '博客 adcakeyuan.top',
    desc: '一切的原点：Next.js 博客，AI 语义搜索 + RAG 问答 + 自动写作流水线',
    url: 'https://adcakeyuan.top',
    repo: 'huqinyuan923-hue/huqinyuan923-hue.github.io',
    kind: 'sun',
    hue: 45,
  },
  {
    id: 'town',
    name: 'AI 小镇 茶镇',
    desc: '12 位 LLM 居民自主生活的像素小镇：记忆、反思、日程与八卦，读博客过日子',
    url: 'https://town.adcakeyuan.top',
    repo: 'huqinyuan923-hue/cha-town',
    kind: 'planet',
    hue: 20,
    probe: 'town',
  },
  {
    id: 'arcade',
    name: '街机厅 Arcade Hub',
    desc: '40 款自研小游戏的在线街机厅，含排行与收藏',
    url: 'https://arcade.adcakeyuan.top',
    repo: 'huqinyuan923-hue/arcade-hub',
    kind: 'planet',
    hue: 320,
  },
  {
    id: 'cha',
    name: 'Cha 语言 Playground',
    desc: 'TypeScript 手写的编程语言：字节码编译器 + 栈式虚拟机，浏览器里跑',
    url: 'https://cha.adcakeyuan.top',
    repo: 'huqinyuan923-hue/cha-lang',
    kind: 'planet',
    hue: 160,
  },
  {
    id: 'deeplearn',
    name: '深学 DeepLearn',
    desc: '四条学习线 15 章的中文学习平台',
    url: 'https://deeplearn.adcakeyuan.top',
    repo: 'huqinyuan923-hue/deeplearn',
    kind: 'planet',
    hue: 210,
  },
  {
    id: 'guide',
    name: 'GitHub 新手村',
    desc: '零基础 GitHub 入门指南站',
    url: 'https://guide.adcakeyuan.top',
    repo: 'huqinyuan923-hue/github-guide',
    kind: 'planet',
    hue: 30,
  },
  {
    id: 'toolbox',
    name: '工具箱 Toolbox',
    desc: '15+ 个纯前端日常小工具，可离线',
    url: 'https://toolbox.adcakeyuan.top',
    repo: 'huqinyuan923-hue/toolbox',
    kind: 'planet',
    hue: 190,
  },
  {
    id: 'rss',
    name: 'RSS 阅读器',
    desc: '私有订阅聚合：定时抓取、未读管理',
    url: 'https://rss.adcakeyuan.top',
    repo: 'huqinyuan923-hue/rss-reader',
    kind: 'planet',
    hue: 100,
  },
  {
    id: 'wrapped',
    name: 'GitHub Wrapped',
    desc: '输入用户名一键生成年度报告',
    url: 'https://wrapped.adcakeyuan.top',
    repo: 'huqinyuan923-hue/github-wrapped',
    kind: 'planet',
    hue: 265,
  },
  {
    id: 'salary',
    name: '薪资计算器',
    desc: '五险一金 + 个税双向互算',
    url: 'https://salary.adcakeyuan.top',
    repo: 'huqinyuan923-hue/salarycalc',
    kind: 'planet',
    hue: 55,
  },
  {
    id: 'pomo',
    name: '番茄钟 PomoBox',
    desc: '专注计时 + 任务清单 + 周报图表',
    url: 'https://pomo.adcakeyuan.top',
    repo: 'huqinyuan923-hue/pomobox',
    kind: 'planet',
    hue: 5,
  },
  {
    id: 'filekit',
    name: '文件处理 FileKit',
    desc: '纯本地文件合并压缩等处理，不上传',
    url: 'https://filekit.adcakeyuan.top',
    repo: 'huqinyuan923-hue/filekit',
    kind: 'planet',
    hue: 140,
  },
  {
    id: 'cet4',
    name: '四级题库 CET4Lab',
    desc: '历年真题 + 刷题的四级备考站',
    url: 'https://cet4.adcakeyuan.top',
    repo: 'huqinyuan923-hue/cet4lab',
    kind: 'planet',
    hue: 230,
  },
  {
    id: 'treasury',
    name: '记账 Treasury',
    desc: '私有记账应用',
    url: 'https://treasury.adcakeyuan.top',
    repo: 'huqinyuan923-hue/treasury',
    kind: 'planet',
    hue: 85,
  },
  {
    id: 'imgbed',
    name: '图床 PicNest',
    desc: '私有图床（无公网入口，暗星）',
    url: null,
    repo: 'huqinyuan923-hue/imgbed',
    kind: 'dark',
    hue: 300,
  },
  {
    id: 'timemark',
    name: '时光账本 TimeMark',
    desc: '时间记录应用（部署中，暗星）',
    url: null,
    repo: 'huqinyuan923-hue/timemark-vercel',
    kind: 'dark',
    hue: 350,
  },
];
