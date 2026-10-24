/** Galaxy Quest 前端状态与 API 封装（探索者身份存 localStorage）。 */
export interface QuestDefView {
  id: string;
  title: string;
  desc: string;
  dust: number;
  site: string;
  url: string;
  hidden: boolean;
  done: boolean;
  doneAt: string | null;
}

export interface QuestMe {
  id: number;
  name: string;
  dust: number;
  level: number;
  levelCur: number;
  levelNext: number | null;
  supernova: boolean;
  doneCount: number;
}

export interface BoardResponse {
  quests: QuestDefView[];
  me: QuestMe | null;
  leaders?: Array<{ name: string; dust: number; level: number }>;
  bodies?: unknown[];
}

export interface ClaimResponse {
  ok: boolean;
  dust: number;
  gained: number;
  level: number;
  leveledUp: boolean;
  supernova: boolean;
}

const LS_KEY = 'galaxy-explorer';

export interface ExplorerIdentity {
  explorerId: number;
  name: string;
}

export function loadIdentity(): ExplorerIdentity | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as ExplorerIdentity;
    return j.explorerId ? j : null;
  } catch {
    return null;
  }
}

export function saveIdentity(id: ExplorerIdentity): void {
  localStorage.setItem(LS_KEY, JSON.stringify(id));
}

export async function apiBegin(name: string): Promise<{ explorerId: number; name: string; returning: boolean }> {
  const res = await fetch('/api/quest/begin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? '注册失败');
  return j;
}

export async function apiBoard(explorerId: number): Promise<BoardResponse> {
  const res = await fetch(`/api/quest/board?explorerId=${explorerId}`);
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? '读取任务失败');
  return j;
}

export async function apiClaim(explorerId: number, questId: string): Promise<ClaimResponse> {
  const res = await fetch('/api/quest/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ explorerId, questId }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? '领取失败');
  return j;
}
