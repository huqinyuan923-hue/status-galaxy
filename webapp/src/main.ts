import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FIXTURE_DATA, type FixtureBody, type GalaxyData } from './fixture';

/**
 * ADCakeyuan 星图：博客=恒星，项目=行星。
 * 半径 ∝ 代码量 | 转速 ∝ 提交热度 | 光晕 ∝ 健康 | 环 = 有独立域名 | 小镇带 12 居民卫星。
 */

interface PlanetVisual {
  body: FixtureBody;
  group: THREE.Group;      // 轨道枢轴（绕恒星）
  holder: THREE.Group;     // 行星本体（含环/卫星/标签），挂在 group 上做公转
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  speed: number;
  angle: number;
  radius: number;
  moons: Array<{ pivot: THREE.Object3D; speed: number }>;
}

const container = document.getElementById('app')!;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04060d, 0.0028);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 800);
camera.position.set(0, 26, 58);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x04060d);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 12;
controls.maxDistance = 160;
controls.maxPolarAngle = Math.PI * 0.85;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.25;

// ---------- 星场 ----------
function makeStars(count: number, spread: number, size: number, opacity: number): THREE.Points {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = spread * (0.35 + Math.random() * 0.65);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi) * 0.6;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfd2ff, size, transparent: true, opacity, sizeAttenuation: true }));
}
scene.add(makeStars(2200, 320, 0.7, 0.75));
scene.add(makeStars(900, 240, 1.4, 0.4));

// ---------- 星云薄纱 ----------
function glowTexture(inner: string, outer: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const haloTex = glowTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
for (const [color, x, z, s] of [
  ['#1b3a6b', -110, -70, 260],
  ['#3a1b5e', 120, 40, 220],
  ['#143c4a', 30, 130, 180],
] as const) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTex, color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp.position.set(x, -14, z);
  sp.scale.setScalar(s);
  scene.add(sp);
}

// ---------- 灯光 ----------
scene.add(new THREE.AmbientLight(0x8090b0, 0.55));
const sunLight = new THREE.PointLight(0xffd9a0, 320, 240, 1.8);
scene.add(sunLight);

// ---------- 文字标签 ----------
function labelSprite(text: string, color = '#c7d6f2', size = 42): THREE.Sprite {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = `500 ${size}px "Segoe UI", system-ui, sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + 8;
  c.width = w; c.height = size + 10;
  const g2 = c.getContext('2d')!;
  g2.font = g.font;
  g2.fillStyle = color;
  g2.shadowColor = 'rgba(0,0,0,0.9)';
  g2.shadowBlur = 6;
  g2.fillText(text, 4, size * 0.86);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sp.scale.set(w / 46, (size + 10) / 46, 1);
  return sp;
}

// ---------- 天体构建 ----------
const planets: PlanetVisual[] = [];
const clickables: THREE.Mesh[] = [];
let sunMesh: THREE.Mesh | null = null;
let sunGlow: THREE.Sprite | null = null;
let data: GalaxyData = FIXTURE_DATA;

function hsl(h: number, s: number, l: number): number {
  return new THREE.Color(`hsl(${h}, ${s}%, ${l}%)`).getHex();
}

function planetRadius(sizeKb: number): number {
  return Math.min(1.9, 0.55 + Math.log2(sizeKb + 2) / 3.4);
}

function orbitSpeed(pushedAt: string | null): number {
  if (!pushedAt) return 0.08;
  const days = (Date.now() - new Date(pushedAt).getTime()) / 86_400_000;
  return 0.1 + 0.55 * Math.exp(-days / 10);
}

function buildScene(bodies: FixtureBody[], snapIn: GalaxyData['latest']) {
  const snap: NonNullable<GalaxyData['latest']> = snapIn ?? (FIXTURE_DATA.latest as NonNullable<GalaxyData['latest']>);
  // 清场
  for (const p of planets) scene.remove(p.group);
  planets.length = 0;
  clickables.length = 0;
  if (sunMesh) { scene.remove(sunMesh); sunMesh = null; }
  if (sunGlow) { scene.remove(sunGlow); sunGlow = null; }

  const repoByBody = new Map<string, (typeof snap.repos)[number]>();
  for (const b of bodies) {
    if (!b.repo) continue;
    const hit = snap.repos.find((r) => r.repo === b.repo);
    if (hit) repoByBody.set(b.id, hit);
  }

  const orbiters = bodies.filter((b) => b.kind !== 'sun');
  const sun = bodies.find((b) => b.kind === 'sun');
  const repoOf = (id: string) => repoByBody.get(id);

  // 恒星
  if (sun) {
    sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(3.4, 40, 40),
      new THREE.MeshBasicMaterial({ color: 0xffc46b })
    );
    sunMesh.userData = { body: sun };
    scene.add(sunMesh);
    clickables.push(sunMesh);
    sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffb347, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    sunGlow.scale.setScalar(16);
    scene.add(sunGlow);
    const label = labelSprite('博客', '#ffd9a0', 46);
    label.position.set(0, 5.6, 0);
    scene.add(label);
  }

  orbiters.forEach((body, i) => {
    const repo = repoOf(body.id);
    const site = snap.sites.find((s) => s.id === body.id);
    const alive = body.kind === 'dark' ? null : site?.alive ?? false;

    const group = new THREE.Group();
    group.rotation.y = (i * 137.5 * Math.PI) / 180; // 黄金角散布相位
    scene.add(group);

    const holder = new THREE.Group();
    const radius = 9.5 + i * 2.35 + (body.kind === 'dark' ? 5.2 : 0); // 暗星拖到外圈
    holder.position.x = radius;
    group.add(holder);

    // 轨道线
    const pts: THREE.Vector3[] = [];
    for (let a = 0; a <= 128; a++) {
      const t = (a / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(t) * radius, 0, Math.sin(t) * radius));
    }
    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x38507c, transparent: true, opacity: body.kind === 'dark' ? 0.08 : 0.16 })
    ));

    // 行星本体
    const r = planetRadius(repo?.sizeKb ?? 40);
    const color = hsl(body.hue, body.kind === 'dark' ? 22 : 62, body.kind === 'dark' ? 34 : 56);
    const emissive = alive === false ? 0x5a1414 : new THREE.Color(color).getHex();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 28, 28),
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: alive === false ? 0.25 : body.kind === 'dark' ? 0.18 : 0.65,
        roughness: 0.75,
        metalness: 0.05,
      })
    );
    mesh.userData = { body };
    holder.add(mesh);
    clickables.push(mesh);

    // 光晕：健康绿色调，暗星无，挂掉的暗红
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex,
      color: alive === false ? 0xff5252 : body.kind === 'dark' ? 0x556070 : new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45).getHex(),
      transparent: true,
      opacity: body.kind === 'dark' ? 0.1 : 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    const lat = site?.latencyMs ?? 200;
    glow.scale.setScalar(r * (4.2 + Math.max(0, (400 - Math.min(lat, 400)) / 160)));
    holder.add(glow);

    // 环 = 有独立域名
    if (body.kind !== 'dark') {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r * 1.55, r * 2.05, 48),
        new THREE.MeshBasicMaterial({ color: hsl(body.hue, 50, 70), transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      ring.rotation.x = Math.PI / 2.35;
      ring.rotation.y = (i % 3 - 1) * 0.35;
      holder.add(ring);
    }

    // 标签
    const label = labelSprite(body.name.split(' ')[0], body.kind === 'dark' ? '#5d6b84' : '#c7d6f2', 40);
    label.position.set(0, r + 1.35, 0);
    holder.add(label);

    // 小镇居民卫星
    const moons: PlanetVisual['moons'] = [];
    if (body.probe === 'town' && snap?.town) {
      const n = Math.max(3, snap.town.agents);
      for (let m = 0; m < n; m++) {
        const pivot = new THREE.Object3D();
        pivot.rotation.y = (m / n) * Math.PI * 2;
        pivot.rotation.x = ((m % 3) - 1) * 0.28;
        const moonR = r + 1.5 + (m % 2) * 0.7;
        const moon = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 10, 10),
          new THREE.MeshBasicMaterial({ color: m % 4 === 0 ? 0xffb08a : 0xa8c6ff })
        );
        moon.position.x = moonR;
        pivot.add(moon);
        holder.add(pivot);
        moons.push({ pivot, speed: 0.6 + (m % 3) * 0.25 });
      }
    }

    planets.push({
      body, group, holder, mesh, glow, moons,
      speed: orbitSpeed(repo?.pushedAt ?? null),
      angle: 0,
      radius,
    });
  });
}

// ---------- 信息卡 ----------
const card = document.getElementById('card')!;
const cardSpark = document.getElementById('card-spark') as HTMLCanvasElement;

function fmtAgo(iso: string | null): string {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (d < 1) return `${Math.max(1, Math.round(d * 24))} 小时前`;
  return `${Math.round(d)} 天前`;
}

function showCard(body: FixtureBody) {
  const snap = data.latest;
  if (!snap) return;
  const site = snap.sites.find((s) => s.id === body.id);
  const repo = snap.repos.find((r) => r.repo === body.repo);
  document.getElementById('card-name')!.textContent = body.name;
  document.getElementById('card-desc')!.textContent = body.desc;

  const statusLine =
    body.kind === 'dark' ? '<dd class="dim">暗星 · 无公网入口</dd>' :
    site?.alive ? `<dd class="ok">在线 ${site.status} · ${site.latencyMs}ms</dd>` :
    '<dd class="bad">离线 / 超时</dd>';

  document.getElementById('card-stats')!.innerHTML = `
    <dt>状态</dt>${statusLine}
    <dt>技术</dt><dd>${repo?.language ?? '—'}</dd>
    <dt>代码量</dt><dd>${repo ? (repo.sizeKb > 1024 ? (repo.sizeKb / 1024).toFixed(1) + ' MB' : repo.sizeKb + ' KB') : '私有仓库'}</dd>
    <dt>Star</dt><dd>${repo?.stars ?? '—'}</dd>
    <dt>最近提交</dt><dd>${fmtAgo(repo?.pushedAt ?? null)}</dd>
    ${body.probe === 'town' && snap.town ? `<dt>小镇</dt><dd class="ok">${snap.town.agents} 居民 · ${snap.town.clock} · 今日 ${snap.town.dailyTokens.toLocaleString()} tok</dd>` : ''}
  `;

  const links = document.getElementById('card-links')!;
  links.innerHTML = '';
  if (body.url) {
    const a = document.createElement('a');
    a.href = body.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = '访问 →';
    links.appendChild(a);
  }
  if (body.repo) {
    const a = document.createElement('a');
    a.href = `https://github.com/${body.repo}`; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'GitHub';
    links.appendChild(a);
  }

  // 延迟趋势
  const g = cardSpark.getContext('2d')!;
  g.clearRect(0, 0, cardSpark.width, cardSpark.height);
  const series = data.history
    .map((h) => h.sites.find((s) => s.id === body.id)?.latencyMs ?? null)
    .filter((v): v is number => v != null)
    .reverse();
  if (series.length > 1) {
    const max = Math.max(...series, 150);
    g.strokeStyle = '#6fb2ff';
    g.lineWidth = 1.6;
    g.beginPath();
    series.forEach((v, i) => {
      const x = (i / (series.length - 1)) * (cardSpark.width - 8) + 4;
      const y = cardSpark.height - 4 - (v / max) * (cardSpark.height - 10);
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    });
    g.stroke();
  }

  card.classList.remove('hidden');
}
document.getElementById('card-close')!.addEventListener('click', () => card.classList.add('hidden'));

// ---------- 点选 ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = { x: 0, y: 0, t: 0 };
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY, t: Date.now() }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6 || Date.now() - downAt.t > 450) return; // 拖拽不算点击
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(clickables, false)[0];
  const body = hit?.object.userData?.body as FixtureBody | undefined;
  if (body) {
    showCard(body);
    controls.autoRotate = false;
  }
});

// ---------- 数据 ----------
async function loadData(): Promise<void> {
  try {
    const res = await fetch('/api/galaxy', { signal: AbortSignal.timeout(9000) });
    if (res.ok) {
      const j = (await res.json()) as GalaxyData;
      if (j.latest) data = j;
    }
  } catch { /* 保留现有/兜底数据 */ }
  const latest = data.latest;
  if (!latest) return;
  buildScene(BODIES, latest);
  const alive = latest.sites.filter((s) => s.alive).length;
  const total = latest.sites.length;
  document.getElementById('hud-meta')!.textContent =
    `${total} 个天体 · ${alive} 在线 · 更新于 ${new Date(latest.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
}

/** 内嵌的正式天体目录（与 Worker src/bodies.ts 同源维护；真实数据优先）。 */
const BODIES: FixtureBody[] = [
  { id: 'blog', name: '博客 adcakeyuan.top', desc: '一切的原点：Next.js 博客，AI 语义搜索 + RAG 问答 + 自动写作流水线', url: 'https://adcakeyuan.top', repo: 'huqinyuan923-hue/huqinyuan923-hue.github.io', kind: 'sun', hue: 45 },
  { id: 'town', name: 'AI 小镇 茶镇', desc: '12 位 LLM 居民自主生活的像素小镇：记忆、反思、日程与八卦，读博客过日子', url: 'https://town.adcakeyuan.top', repo: 'huqinyuan923-hue/cha-town', kind: 'planet', hue: 20, probe: 'town' },
  { id: 'arcade', name: '街机厅 Arcade Hub', desc: '40 款自研小游戏的在线街机厅，含排行与收藏', url: 'https://arcade.adcakeyuan.top', repo: 'huqinyuan923-hue/arcade-hub', kind: 'planet', hue: 320 },
  { id: 'cha', name: 'Cha 语言 Playground', desc: 'TypeScript 手写的编程语言：字节码编译器 + 栈式虚拟机，浏览器里跑', url: 'https://cha.adcakeyuan.top', repo: 'huqinyuan923-hue/cha-lang', kind: 'planet', hue: 160 },
  { id: 'deeplearn', name: '深学 DeepLearn', desc: '四条学习线 15 章的中文学习平台', url: 'https://deeplearn.adcakeyuan.top', repo: 'huqinyuan923-hue/deeplearn', kind: 'planet', hue: 210 },
  { id: 'guide', name: 'GitHub 新手村', desc: '零基础 GitHub 入门指南站', url: 'https://guide.adcakeyuan.top', repo: 'huqinyuan923-hue/github-guide', kind: 'planet', hue: 30 },
  { id: 'toolbox', name: '工具箱 Toolbox', desc: '15+ 个纯前端日常小工具，可离线', url: 'https://toolbox.adcakeyuan.top', repo: 'huqinyuan923-hue/toolbox', kind: 'planet', hue: 190 },
  { id: 'rss', name: 'RSS 阅读器', desc: '私有订阅聚合：定时抓取、未读管理', url: 'https://rss.adcakeyuan.top', repo: 'huqinyuan923-hue/rss-reader', kind: 'planet', hue: 100 },
  { id: 'wrapped', name: 'GitHub Wrapped', desc: '输入用户名一键生成年度报告', url: 'https://wrapped.adcakeyuan.top', repo: 'huqinyuan923-hue/github-wrapped', kind: 'planet', hue: 265 },
  { id: 'salary', name: '薪资计算器', desc: '五险一金 + 个税双向互算', url: 'https://salary.adcakeyuan.top', repo: 'huqinyuan923-hue/salarycalc', kind: 'planet', hue: 55 },
  { id: 'pomo', name: '番茄钟 PomoBox', desc: '专注计时 + 任务清单 + 周报图表', url: 'https://pomo.adcakeyuan.top', repo: 'huqinyuan923-hue/pomobox', kind: 'planet', hue: 5 },
  { id: 'filekit', name: '文件处理 FileKit', desc: '纯本地文件处理，不上传', url: 'https://filekit.adcakeyuan.top', repo: 'huqinyuan923-hue/filekit', kind: 'planet', hue: 140 },
  { id: 'cet4', name: '四级题库 CET4Lab', desc: '历年真题 + 刷题的四级备考站', url: 'https://cet4.adcakeyuan.top', repo: 'huqinyuan923-hue/cet4lab', kind: 'planet', hue: 230 },
  { id: 'treasury', name: '记账 Treasury', desc: '私有记账应用', url: 'https://treasury.adcakeyuan.top', repo: 'huqinyuan923-hue/treasury', kind: 'planet', hue: 85 },
  { id: 'imgbed', name: '图床 PicNest', desc: '私有图床（无公网入口，暗星）', url: null, repo: 'huqinyuan923-hue/imgbed', kind: 'dark', hue: 300 },
  { id: 'timemark', name: '时光账本 TimeMark', desc: '时间记录应用（部署中，暗星）', url: null, repo: 'huqinyuan923-hue/timemark-vercel', kind: 'dark', hue: 350 },
];

// ---------- 主循环 ----------
const clockT = new THREE.Clock();
function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clockT.getDelta(), 0.05);
  const t = clockT.elapsedTime;

  if (sunMesh) {
    sunMesh.scale.setScalar(1 + Math.sin(t * 1.6) * 0.012);
    sunLight.intensity = 320 + Math.sin(t * 2.3) * 24;
  }

  for (const p of planets) {
    p.angle += p.speed * dt;
    p.holder.position.set(Math.cos(p.angle) * p.radius, 0, Math.sin(p.angle) * p.radius);
    p.mesh.rotation.y += dt * 0.6;
    for (const m of p.moons) m.pivot.rotation.y += m.speed * dt;
  }

  controls.update();
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

buildScene(BODIES, FIXTURE_DATA.latest);
animate();
void loadData();
setInterval(() => void loadData(), 60_000);
