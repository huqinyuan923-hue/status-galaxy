import { describe, expect, it } from 'vitest';
import { assertSafeProbeUrl, collectSnapshot, type FetchLike } from '../src/collector';
import { BODIES } from '../src/bodies';

const okRes = (status = 200) => new Response(null, { status });

describe('出网守卫', () => {
  it('放行自家天体域与 api.github.com，拒绝其它一切', () => {
    expect(() => assertSafeProbeUrl('https://town.adcakeyuan.top/api/status')).not.toThrow();
    expect(() => assertSafeProbeUrl('https://api.github.com/users/x/repos')).not.toThrow();
    expect(() => assertSafeProbeUrl('http://adcakeyuan.top/')).toThrow(/https/);
    expect(() => assertSafeProbeUrl('https://evil.com/')).toThrow(/白名单/);
    expect(() => assertSafeProbeUrl('https://evil.adcakeyuan.top.example.com/')).toThrow(/白名单/);
    expect(() => assertSafeProbeUrl('https://localhost/')).toThrow(/白名单/);
  });
});

describe('collectSnapshot', () => {
  const fake: FetchLike = async (url) => {
    if (url.includes('api.github.com')) {
      return new Response(
        JSON.stringify([
          { name: 'cha-lang', stargazers_count: 3, size: 1212, language: 'TypeScript', pushed_at: '2026-10-23T00:00:00Z', open_issues_count: 1 },
          { name: 'not-in-catalog', size: 1 },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('town.adcakeyuan.top/api/status')) {
      return new Response(
        JSON.stringify({ world: { gameTime: 550, clock: '09:10', tickCount: 20 }, spend: { dailyTokens: 13000, silent: false }, agents: new Array(12) }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('arcade.')) return okRes(200);
    if (url.includes('rss.')) return okRes(307);
    throw new Error('simulated network failure'); // 其余站点视为探活失败
  };

  it('采集出完整快照：站点/仓库/小镇探针；失败站点正确标记', async () => {
    const snap = await collectSnapshot(fake);
    const withUrl = BODIES.filter((b) => b.kind !== 'dark' && b.url);
    expect(snap.sites).toHaveLength(withUrl.length);
    const arcade = snap.sites.find((s) => s.id === 'arcade')!;
    expect(arcade.alive).toBe(true);
    expect(arcade.status).toBe(200);
    const rss = snap.sites.find((s) => s.id === 'rss')!;
    expect(rss.alive).toBe(true); // 307 登录跳转 = 活着
    expect(rss.status).toBe(307);
    const blog = snap.sites.find((s) => s.id === 'blog')!;
    expect(blog.alive).toBe(false); // fake 里抛错的站点
    expect(snap.repos).toHaveLength(1); // 目录外的仓库被过滤
    expect(snap.repos[0].repo).toBe('huqinyuan923-hue/cha-lang');
    expect(snap.repos[0].stars).toBe(3);
    expect(snap.town?.agents).toBe(12);
    expect(snap.town?.tickCount).toBe(20);
  });

  it('GitHub 失败时快照仍产出（repos 空）', async () => {
    const failing: FetchLike = async () => {
      throw new Error('net down');
    };
    const snap = await collectSnapshot(failing);
    expect(snap.repos).toEqual([]);
    expect(snap.town).toBeNull();
    expect(snap.sites.every((s) => !s.alive)).toBe(true);
  });
});

describe('天体目录完整性', () => {
  it('id 唯一、恰好一颗恒星、暗星无 URL、行星与恒星必有 URL', () => {
    const ids = BODIES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BODIES.filter((b) => b.kind === 'sun')).toHaveLength(1);
    for (const b of BODIES) {
      if (b.kind === 'dark') expect(b.url).toBeNull();
      else expect(b.url).toMatch(/^https:\/\//);
      expect(b.name.length).toBeGreaterThan(1);
    }
  });
});
