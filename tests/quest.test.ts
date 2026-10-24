import { describe, expect, it } from 'vitest';
import {
  QUESTS,
  isSupernova,
  levelOf,
  levelProgress,
  validateClaim,
  validateName,
} from '../src/quest/catalog';

describe('Galaxy Quest 经济系统', () => {
  it('任务目录：12+ 主线任务，id 唯一，奖励均为正', () => {
    expect(QUESTS.length).toBeGreaterThanOrEqual(12);
    const ids = QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of QUESTS) {
      expect(q.dust).toBeGreaterThan(0);
      expect(q.url).toMatch(/^https:\/\//);
      expect(q.title.length).toBeGreaterThan(1);
    }
  });

  it('恰好一个隐藏任务', () => {
    expect(QUESTS.filter((q) => q.hidden)).toHaveLength(1);
  });

  it('levelOf 阶梯正确', () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(99)).toBe(1);
    expect(levelOf(100)).toBe(2);
    expect(levelOf(249)).toBe(2);
    expect(levelOf(250)).toBe(3);
    expect(levelOf(99999)).toBe(LEVEL_THRESHOLDS_LEN());
  });

  function LEVEL_THRESHOLDS_LEN(): number {
    // 直接从 catalog 断言数组尾端行为
    return levelOf(Number.MAX_SAFE_INTEGER);
  }

  it('levelProgress 给出当前与下一门槛', () => {
    const p = levelProgress(150);
    expect(p.level).toBe(2);
    expect(p.cur).toBe(100);
    expect(p.next).toBe(250);
    const top = levelProgress(999999);
    expect(top.next).toBeNull();
  });

  it('isSupernova：全主线（不含隐藏）完成才触发', () => {
    const mainIds = QUESTS.filter((q) => !q.hidden).map((q) => q.id);
    const hidden = QUESTS.find((q) => q.hidden)!.id;
    expect(isSupernova(new Set(mainIds))).toBe(true);
    expect(isSupernova(new Set(mainIds.slice(1)))).toBe(false);
    // 隐藏任务不影响超新星
    expect(isSupernova(new Set([...mainIds, hidden]))).toBe(true);
  });

  it('validateClaim：未知任务拒绝', () => {
    expect(validateClaim('blog-visit').ok).toBe(true);
    expect(validateClaim('nonexistent')).toMatchObject({ ok: false });
  });

  it('validateName：长度与字符校验', () => {
    expect(validateName('星尘旅人').ok).toBe(true);
    expect(validateName('  Aca_123 ')).toMatchObject({ ok: true, name: 'Aca_123' });
    expect(validateName('a').ok).toBe(false);
    expect(validateName('x'.repeat(17)).ok).toBe(false);
    expect(validateName('bad<script>').ok).toBe(false);
  });
});
