/** 开发/无遥测时的兜底样例（形状与 /api/galaxy 的 latest 一致）。 */
export interface FixtureBody {
  id: string;
  name: string;
  desc: string;
  url: string | null;
  repo: string | null;
  kind: 'sun' | 'planet' | 'dark';
  hue: number;
  probe?: 'town';
}

export interface SiteTelemetry {
  id: string;
  alive: boolean;
  status: number | null;
  latencyMs: number | null;
}

export interface RepoTelemetry {
  repo: string;
  stars: number;
  sizeKb: number;
  language: string | null;
  pushedAt: string | null;
  openIssues: number;
}

export interface TownRelationship {
  a: number;
  b: number;
  aName: string;
  bName: string;
  score: number;
}

export interface TownTelemetry {
  agents: number;
  gameTime: number;
  clock: string;
  tickCount: number;
  dailyTokens: number;
  silent: boolean;
  relationships?: TownRelationship[];
}

export interface Snapshot {
  ts: string;
  sites: SiteTelemetry[];
  repos: RepoTelemetry[];
  town: TownTelemetry | null;
}

export interface GalaxyData {
  latest: Snapshot | null;
  history: Array<{ ts: string; sites: SiteTelemetry[]; townTick: number | null }>;
  /** P3 起由 Worker 下发目录（单一事实源）；旧响应/离线时回退到内嵌目录 */
  bodies?: FixtureBody[];
}

export const FIXTURE_BODIES: FixtureBody[] = [
  { id: 'blog', name: '博客 adcakeyuan.top', desc: '一切的原点', url: 'https://adcakeyuan.top', repo: 'huqinyuan923-hue/huqinyuan923-hue.github.io', kind: 'sun', hue: 45 },
  { id: 'town', name: 'AI 小镇 茶镇', desc: '12 位 LLM 居民', url: 'https://town.adcakeyuan.top', repo: 'huqinyuan923-hue/cha-town', kind: 'planet', hue: 20, probe: 'town' },
  { id: 'arcade', name: '街机厅', desc: '40 款小游戏', url: 'https://arcade.adcakeyuan.top', repo: 'huqinyuan923-hue/arcade-hub', kind: 'planet', hue: 320 },
  { id: 'cha', name: 'Cha 语言', desc: '手写编程语言', url: 'https://cha.adcakeyuan.top', repo: 'huqinyuan923-hue/cha-lang', kind: 'planet', hue: 160 },
  { id: 'imgbed', name: '图床 PicNest', desc: '私有图床（暗星）', url: null, repo: 'huqinyuan923-hue/imgbed', kind: 'dark', hue: 300 },
];

export const FIXTURE_DATA: GalaxyData = {
  latest: {
    ts: new Date().toISOString(),
    sites: [
      { id: 'blog', alive: true, status: 200, latencyMs: 210 },
      { id: 'town', alive: true, status: 200, latencyMs: 160 },
      { id: 'arcade', alive: true, status: 200, latencyMs: 95 },
      { id: 'cha', alive: true, status: 200, latencyMs: 120 },
    ],
    repos: [
      { repo: 'huqinyuan923-hue/huqinyuan923-hue.github.io', stars: 0, sizeKb: 85963, language: 'MDX', pushedAt: '2026-10-23T00:00:00Z', openIssues: 0 },
      { repo: 'huqinyuan923-hue/cha-town', stars: 1, sizeKb: 300, language: 'TypeScript', pushedAt: '2026-10-24T00:00:00Z', openIssues: 0 },
      { repo: 'huqinyuan923-hue/arcade-hub', stars: 0, sizeKb: 414, language: 'HTML', pushedAt: '2026-10-23T00:00:00Z', openIssues: 0 },
      { repo: 'huqinyuan923-hue/cha-lang', stars: 2, sizeKb: 1212, language: 'TypeScript', pushedAt: '2026-10-23T00:00:00Z', openIssues: 0 },
      { repo: 'huqinyuan923-hue/imgbed', stars: 0, sizeKb: 26, language: 'JavaScript', pushedAt: '2026-10-21T00:00:00Z', openIssues: 0 },
    ],
    town: { agents: 12, gameTime: 550, clock: '09:10', tickCount: 22, dailyTokens: 16805, silent: false, relationships: [
      { a: 1, b: 9, aName: '阿茶', bName: '小码', score: 4 },
      { a: 2, b: 8, aName: '猫叔', bName: '老湖', score: 3 },
    ] },
  },
  history: [],
};
