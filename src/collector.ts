/**
 * 遥测采集器：探活（状态+延迟）+ GitHub 仓库遥测（一次 API 拉全部）+ 小镇专属探针。
 * 出网安全：仅 https；主机名必须是目录内天体域名、*.adcakeyuan.top、或 api.github.com（SSRF 防护）。
 */
import { BODIES, GH_USER, type CelestialBody } from './bodies';

export interface SiteTelemetry {
  id: string;
  alive: boolean;
  status: number | null; // HTTP 状态码；null = 网络失败
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

export interface TownConversation {
  ts: number;
  lines: Array<{ agentId: number; text: string }>;
}

export interface TownTelemetry {
  agents: number;
  gameTime: number;
  clock: string;
  tickCount: number;
  dailyTokens: number;
  silent: boolean;
  /** 居民关系图谱（R12：星图引力连线数据源），agent id 从 1 连续编号 */
  relationships?: TownRelationship[];
  /** 最近 3 场居民对话（R14：信息卡「茶镇广播」） */
  recentConversations?: TownConversation[];
}

export interface GalaxySnapshot {
  ts: string;
  sites: SiteTelemetry[];
  repos: RepoTelemetry[];
  town: TownTelemetry | null;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** 出网守卫：https + 白名单（我们的天体域 / api.github.com），拒绝内网与任意主机。 */
export function assertSafeProbeUrl(rawUrl: string): URL {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error('非法 URL');
  }
  if (u.protocol !== 'https:') throw new Error(`仅允许 https: ${u.protocol}`);
  const host = u.hostname.toLowerCase();
  const ok =
    host === 'api.github.com' ||
    host.endsWith('.adcakeyuan.top') ||
    BODIES.some((b) => b.url && new URL(b.url).hostname.toLowerCase() === host);
  if (!ok) throw new Error(`主机名不在探测白名单: ${host}`);
  return u;
}

/** 单站点探活：GET（部分私有站 307 视为活着），带 8s 超时。 */
export async function probeSite(body: CelestialBody, fetchFn: FetchLike = fetch): Promise<SiteTelemetry> {
  if (!body.url) return { id: body.id, alive: false, status: null, latencyMs: null };
  assertSafeProbeUrl(body.url);
  const t0 = Date.now();
  try {
    const res = await fetchFn(body.url, {
      method: 'GET',
      redirect: 'manual', // 私有应用的 307 登录跳转 = 服务活着
      signal: AbortSignal.timeout(8_000),
      headers: { 'User-Agent': 'status-galaxy/1.0' },
    });
    return { id: body.id, alive: true, status: res.status, latencyMs: Date.now() - t0 };
  } catch {
    return { id: body.id, alive: false, status: null, latencyMs: null };
  }
}

interface GhRepoRow {
  name?: string;
  stargazers_count?: number;
  size?: number;
  language?: string | null;
  pushed_at?: string | null;
  open_issues_count?: number;
}

/** GitHub 遥测：一次拉取用户全部公开仓库（带 token 防匿名限流），映射到目录。 */
export async function fetchGithubRepos(fetchFn: FetchLike = fetch, token?: string): Promise<RepoTelemetry[]> {
  const url = `https://api.github.com/users/${GH_USER}/repos?per_page=100&sort=pushed`;
  assertSafeProbeUrl(url);
  const headers: Record<string, string> = {
    'User-Agent': 'status-galaxy/1.0',
    Accept: 'application/vnd.github+json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchFn(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`github api HTTP ${res.status}`);
  const rows = (await res.json()) as GhRepoRow[];
  const wanted = new Map(BODIES.filter((b) => b.repo).map((b) => [b.repo!.split('/')[1], b.repo!]));
  const out: RepoTelemetry[] = [];
  for (const r of rows) {
    const repo = wanted.get(r.name ?? '');
    if (!repo) continue;
    out.push({
      repo,
      stars: r.stargazers_count ?? 0,
      sizeKb: r.size ?? 0,
      language: r.language ?? null,
      pushedAt: r.pushed_at ?? null,
      openIssues: r.open_issues_count ?? 0,
    });
  }
  return out;
}

/** 小镇专属探针：/api/status 的活体信号（居民数/tick/token）。 */
export async function probeTown(fetchFn: FetchLike = fetch): Promise<TownTelemetry | null> {
  const url = 'https://town.adcakeyuan.top/api/status';
  assertSafeProbeUrl(url);
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      world?: { gameTime: number; clock: string; tickCount: number };
      spend?: { dailyTokens: number; silent: boolean };
      agents?: unknown[];
      relationships?: TownRelationship[];
      recentConversations?: TownConversation[];
    };
    if (!j.world) return null;
    return {
      agents: j.agents?.length ?? 0,
      gameTime: j.world.gameTime,
      clock: j.world.clock,
      tickCount: j.world.tickCount,
      dailyTokens: j.spend?.dailyTokens ?? 0,
      silent: j.spend?.silent ?? false,
      relationships: Array.isArray(j.relationships)
        ? j.relationships
            .filter((r) => r && Number.isFinite(r.a) && Number.isFinite(r.b))
            .slice(0, 40)
        : [],
      recentConversations: Array.isArray(j.recentConversations)
        ? j.recentConversations.slice(0, 3)
        : [],
    };
  } catch {
    return null;
  }
}

/** 全量采集（并行），产出一份快照。 */
export async function collectSnapshot(fetchFn: FetchLike = fetch, githubToken?: string): Promise<GalaxySnapshot> {
  const siteJobs = BODIES.filter((b) => b.kind !== 'dark').map((b) => probeSite(b, fetchFn));
  const [sites, repos, town] = await Promise.all([
    Promise.all(siteJobs),
    fetchGithubRepos(fetchFn, githubToken).catch(() => [] as RepoTelemetry[]),
    probeTown(fetchFn).catch(() => null),
  ]);
  return { ts: new Date().toISOString(), sites, repos, town };
}
