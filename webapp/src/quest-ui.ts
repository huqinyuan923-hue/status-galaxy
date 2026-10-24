/** Galaxy Quest UI：任务面板 / 探索者注册 / 领取流。纯 DOM，由 main.ts 驱动。 */
import type { QuestDefView } from './quest-api';

export interface QuestPanelHooks {
  onClaimed(questId: string, gained: number): void;
  onSupernova(): void;
  /** 面板打开时拉取最新任务板 */
  onOpen?(): void;
}

const panel = (): HTMLElement => document.getElementById('quest-panel')!;

export function initQuestPanel(hooks: QuestPanelHooks): void {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<aside id="quest-panel" class="hidden">
      <button id="quest-close" aria-label="关闭">×</button>
      <h2>任务日志</h2>
      <div id="quest-me"></div>
      <ul id="quest-list"></ul>
      <h3>探索者排行</h3>
      <ol id="quest-leaders"></ol>
    </aside>
    <button id="quest-btn" title="任务日志">★ 任务</button>
    <div id="dust-float"></div>`
  );
  panel().querySelector('#quest-close')!.addEventListener('click', () => toggleQuestPanel(false));
  document.getElementById('quest-btn')!.addEventListener('click', () => {
    const p = panel();
    const show = p.classList.contains('hidden');
    toggleQuestPanel(show);
    if (show) hooks.onOpen?.();
  });
  hooks.onOpen?.();
}

export function toggleQuestPanel(show: boolean): void {
  panel().classList.toggle('hidden', !show);
}

export function isQuestPanelOpen(): boolean {
  return !panel().classList.contains('hidden');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 未注册 → 显示开始界面；已注册 → 任务列表。 */
export function renderQuestPanel(
  me: { id: number; name: string; dust: number; level: number; levelCur: number; levelNext: number | null; supernova: boolean; doneCount: number } | null,
  quests: Array<QuestDefView & { done: boolean }> | null,
  leaders: Array<{ name: string; dust: number }>,
  hooks: QuestPanelHooks,
  explorerId: number | null,
  onBegin: (name: string) => Promise<void>
): void {
  const root = panel();
  const meEl = root.querySelector('#quest-me')!;
  const listEl = root.querySelector('#quest-list')!;
  const leadersEl = root.querySelector('#quest-leaders')!;

  if (!me) {
    meEl.innerHTML = `
      <p class="q-intro">输入探索者代号，开始收集星尘。<br/>每完成一个任务，星图上对应行星就会点亮。</p>
      <div class="q-begin">
        <input id="q-name" maxlength="16" placeholder="探索者代号（2-16 字符）" />
        <button id="q-begin-btn">启程</button>
        <p id="q-begin-err" class="q-err"></p>
      </div>`;
    listEl.innerHTML = '';
    leadersEl.innerHTML = leaders.map((l, i) => `<li><span>${i + 1}. ${esc(l.name)}</span><span>${l.dust} ✦</span></li>`).join('');
    root.querySelector('#q-begin-btn')!.addEventListener('click', async () => {
      const input = root.querySelector('#q-name') as HTMLInputElement;
      const err = root.querySelector('#q-begin-err') as HTMLElement;
      err.textContent = '';
      try {
        await onBegin(input.value);
      } catch (e) {
        err.textContent = (e as Error).message;
      }
    });
    return;
  }

  const pct = me.levelNext ? Math.min(100, Math.round(((me.dust - me.levelCur) / (me.levelNext - me.levelCur)) * 100)) : 100;
  meEl.innerHTML = `
    <div class="q-me-row"><span class="q-name">${esc(me.name)}</span><span class="q-lv">LV.${me.level}</span></div>
    <div class="q-bar"><div class="q-bar-fill" style="width:${pct}%"></div></div>
    <div class="q-me-row q-dim"><span>✦ ${me.dust} 星尘</span><span>${me.levelNext ? `距 LV.${me.level + 1} 还需 ${me.levelNext - me.dust}` : '满级探索者'}</span></div>
    ${me.supernova ? '<div class="q-supernova">★ 超新星达成 —— 星系开拓者</div>' : ''}
    <div class="q-done">主线进度 ${me.doneCount}/12</div>`;

  if (quests) {
    listEl.innerHTML = quests
      .map((q) => {
        const claimable = !q.done && explorerId != null;
        return `<li class="q-item ${q.done ? 'done' : ''} ${q.hidden ? 'hidden-quest' : ''}">
          <div class="q-item-main">
            <span class="q-title">${q.done ? '✓ ' : ''}${esc(q.title)}</span>
            <span class="q-desc">${esc(q.desc)}</span>
          </div>
          <span class="q-dust">+${q.dust}✦</span>
          ${
            q.done
              ? ''
              : `<a class="q-go" href="${q.url}" target="_blank" rel="noopener">前往</a>
                 ${claimable ? `<button class="q-claim" data-quest="${q.id}" data-done="1">我完成了</button>` : ''}`
          }
        </li>`;
      })
      .join('');
    listEl.querySelectorAll('.q-claim').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const questId = (btn as HTMLElement).dataset.quest!;
        btn.textContent = '…';
        try {
          const r = await import('./quest-api').then((m) => m.apiClaim(explorerId!, questId));
          hooks.onClaimed(questId, r.gained);
          if (r.supernova) hooks.onSupernova();
        } catch (e) {
          btn.textContent = (e as Error).message.slice(0, 12);
          setTimeout(() => (btn.textContent = '我完成了'), 1500);
        }
      });
    });
  }

  leadersEl.innerHTML = leaders.map((l, i) => `<li><span>${i + 1}. ${esc(l.name)}</span><span>${l.dust} ✦</span></li>`).join('');
}
